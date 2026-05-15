#Requires -Version 5.1
<#
.SYNOPSIS
    KanbanFlow Software-Agent fuer Windows
.DESCRIPTION
    Meldet sich automatisch beim KanbanFlow-Server an, inventarisiert die Hardware
    und fuehrt Software-Jobs aus.
.PARAMETER Setup
    Erstkonfiguration: Server-URL und Enrollment-Token eingeben, Scheduled Task anlegen.
.PARAMETER ServerUrl
    URL des KanbanFlow-Servers (z.B. http://172.29.13.134:3000)
.PARAMETER EnrollmentToken
    Enrollment-Token aus Admin -> Software (einmalig fuer alle PCs gleich)
.EXAMPLE
    # Erstkonfiguration (als Administrator ausfuehren):
    .\agent.ps1 -Setup -ServerUrl "http://172.29.13.134:3000" -EnrollmentToken "abc123..."

    # Manueller Test-Lauf:
    .\agent.ps1
#>

param(
    [switch]$Setup,
    [string]$ServerUrl,
    [string]$EnrollmentToken
)

$ErrorActionPreference = "Stop"
$RegistryPath = "HKLM:\SOFTWARE\KanbanFlow\Agent"
$TaskName     = "KanbanFlow-Agent"
$LogFile      = "$env:ProgramData\KanbanFlow\agent.log"
$TempDir      = "$env:TEMP\KanbanFlow"

# -- Logging -------------------------------------------------------------------

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $ts   = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] [$Level] $Message"
    Write-Host $line
    try {
        $dir = Split-Path $LogFile
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        Add-Content -Path $LogFile -Value $line -Encoding UTF8
    } catch {}
}

# -- Registry helpers ----------------------------------------------------------

function Save-Config {
    param([string]$Url, [string]$Key)
    if (-not (Test-Path $RegistryPath)) { New-Item -Path $RegistryPath -Force | Out-Null }
    Set-ItemProperty -Path $RegistryPath -Name "ServerUrl" -Value $Url
    Set-ItemProperty -Path $RegistryPath -Name "ApiKey"    -Value $Key
    Write-Log "Konfiguration in Registry gespeichert."
}

function Load-Config {
    if (-not (Test-Path $RegistryPath)) { return $null }
    $url = (Get-ItemProperty -Path $RegistryPath -Name "ServerUrl" -ErrorAction SilentlyContinue).ServerUrl
    $key = (Get-ItemProperty -Path $RegistryPath -Name "ApiKey"    -ErrorAction SilentlyContinue).ApiKey
    if (-not $url -or -not $key) { return $null }
    return @{ ServerUrl = $url; ApiKey = $key }
}

# -- Hardware-Inventar sammeln -------------------------------------------------

function Get-HardwareInfo {
    $hw = @{ hostname = $env:COMPUTERNAME.ToLower() }

    try {
        # IP & MAC
        $nic = Get-NetAdapter | Where-Object { $_.Status -eq "Up" -and $_.HardwareInterface } | Select-Object -First 1
        if ($nic) {
            $hw.macAddress = $nic.MacAddress
            $ip = (Get-NetIPAddress -InterfaceIndex $nic.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1).IPAddress
            if ($ip) { $hw.ipAddress = $ip }
        }
    } catch {}

    try {
        # OS
        $os = Get-CimInstance Win32_OperatingSystem
        $hw.osVersion = "$($os.Caption) Build $($os.BuildNumber)"
    } catch {}

    try {
        # CPU
        $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
        $hw.cpuName  = $cpu.Name.Trim()
        $hw.cpuCores = [int]$cpu.NumberOfLogicalProcessors
    } catch {}

    try {
        # RAM
        $ram = (Get-CimInstance Win32_PhysicalMemory | Measure-Object -Property Capacity -Sum).Sum
        $hw.ramGb = [int][math]::Round($ram / 1GB)
    } catch {}

    try {
        # Festplatte (C:)
        $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
        $hw.diskGb = [int][math]::Round($disk.Size / 1GB)
    } catch {}

    try {
        # Hersteller & Modell
        $cs = Get-CimInstance Win32_ComputerSystem
        $hw.manufacturer = $cs.Manufacturer.Trim()
        $hw.model        = $cs.Model.Trim()
        $hw.domain       = $cs.Domain
    } catch {}

    try {
        # Seriennummer
        $bios = Get-CimInstance Win32_BIOS
        if ($bios.SerialNumber -and $bios.SerialNumber -notmatch "^\s*$|To Be Filled|Default") {
            $hw.serialNumber = $bios.SerialNumber.Trim()
        }
    } catch {}

    return $hw
}

# -- Selbst-Registrierung am Server -------------------------------------------

function Register-Agent {
    param([string]$ServerUrl, [string]$Token)

    Write-Log "Sammle Hardware-Daten..."
    $hw = Get-HardwareInfo

    Write-Log "Registriere '$($hw.hostname)' am Server..."

    $body = @{
        enrollmentToken = $Token
        hardware        = $hw
    } | ConvertTo-Json -Depth 3

    $response = Invoke-RestMethod `
        -Uri "$ServerUrl/api/agent/register" `
        -Method POST `
        -Body $body `
        -ContentType "application/json" `
        -UseBasicParsing `
        -TimeoutSec 30

    if (-not $response.apiKey) { throw "Keine API-Key-Antwort vom Server" }

    Write-Log "Registrierung erfolgreich. Asset-ID: $($response.assetId)"
    return $response.apiKey
}

# -- Scheduled Task einrichten -------------------------------------------------

function Install-ScheduledTask {
    param([string]$ScriptPath)

    $action  = New-ScheduledTaskAction `
        -Execute "powershell.exe" `
        -Argument "-NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ScriptPath`""

    $trigger = New-ScheduledTaskTrigger `
        -RepetitionInterval (New-TimeSpan -Minutes 5) `
        -Once -At (Get-Date)

    $settings = New-ScheduledTaskSettingsSet `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 4) `
        -MultipleInstances IgnoreNew `
        -StartWhenAvailable

    $principal = New-ScheduledTaskPrincipal `
        -UserId "SYSTEM" `
        -LogonType ServiceAccount `
        -RunLevel Highest

    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

    Register-ScheduledTask `
        -TaskName    $TaskName `
        -Action      $action `
        -Trigger     $trigger `
        -Settings    $settings `
        -Principal   $principal `
        -Description "KanbanFlow Software-Verteilungs-Agent" | Out-Null

    Write-Log "Scheduled Task '$TaskName' eingerichtet (alle 5 Minuten als SYSTEM)."
}

# -- Job-Ausfuehrung -----------------------------------------------------------

function Invoke-Job {
    param([hashtable]$Job, [string]$ServerUrl, [string]$ApiKey)

    $log      = [System.Text.StringBuilder]::new()
    $exitCode = 0

    try {
        switch ($Job.type) {
            "winget" {
                if (-not $Job.wingetId) { throw "Keine winget-ID" }
                # Use custom params if set, otherwise use sensible defaults
                if ($Job.params) {
                    $wingetArgs = ($Job.params -split '\s+' | Where-Object { $_ -ne "" })
                    $log.AppendLine("winget install --id $($Job.wingetId) $($Job.params)") | Out-Null
                    $out = & winget install --id $Job.wingetId @wingetArgs 2>&1
                } else {
                    $log.AppendLine("winget install --id $($Job.wingetId) --silent --accept-package-agreements --accept-source-agreements") | Out-Null
                    $out = & winget install --id $Job.wingetId --silent --accept-package-agreements --accept-source-agreements 2>&1
                }
                $log.AppendLine(($out -join "`n")) | Out-Null
                $exitCode = $LASTEXITCODE
            }
            "file" {
                if (-not $Job.fileUrl) { throw "Keine Download-URL" }
                $fname = if ($Job.fileName) { $Job.fileName } else { "setup.exe" }
                $dest = "$TempDir\$($Job.jobId)_$fname"
                if (-not (Test-Path $TempDir)) { New-Item -ItemType Directory -Path $TempDir -Force | Out-Null }

                $fullUrl = "$ServerUrl$($Job.fileUrl)"
                $log.AppendLine("Download: $fullUrl") | Out-Null
                Invoke-WebRequest -Uri $fullUrl -OutFile $dest -UseBasicParsing
                $log.AppendLine("Datei: $dest") | Out-Null

                $params = if ($Job.params) { $Job.params -split '\s+' } else { @() }
                $proc = Start-Process -FilePath $dest -ArgumentList $params -Wait -PassThru -NoNewWindow
                $exitCode = $proc.ExitCode
                $log.AppendLine("Exit-Code: $exitCode") | Out-Null
                Remove-Item $dest -Force -ErrorAction SilentlyContinue
            }
            "script" {
                $scriptFile = "$TempDir\$($Job.jobId).ps1"
                if (-not (Test-Path $TempDir)) { New-Item -ItemType Directory -Path $TempDir -Force | Out-Null }
                Set-Content -Path $scriptFile -Value $Job.params -Encoding UTF8
                $out = & powershell.exe -NonInteractive -ExecutionPolicy Bypass -File $scriptFile 2>&1
                $exitCode = $LASTEXITCODE
                $log.AppendLine(($out -join "`n")) | Out-Null
                Remove-Item $scriptFile -Force -ErrorAction SilentlyContinue
            }
            default { throw "Unbekannter Typ: $($Job.type)" }
        }
    } catch {
        $log.AppendLine("FEHLER: $_") | Out-Null
        $exitCode = 1
    }

    return @{ exitCode = $exitCode; log = $log.ToString() }
}

# -- Haupt-Polling-Loop --------------------------------------------------------

function Start-AgentLoop {
    param([string]$ServerUrl, [string]$ApiKey)

    $baseUrl = "$ServerUrl/api/agent/jobs?apiKey=$ApiKey"
    Write-Log "Agent gestartet. Host: $env:COMPUTERNAME | Server: $ServerUrl"

    # Hardware erneut melden (aktualisiert Inventar bei jedem Lauf)
    try {
        $hw   = Get-HardwareInfo
        $body = @{ enrollmentToken = $null; hardware = $hw; apiKey = $ApiKey } | ConvertTo-Json -Depth 3
        # Heartbeat: update lastSeenAt + hardware via jobs poll (GET already does this)
    } catch {}

    try {
        $jobs = Invoke-RestMethod -Uri $baseUrl -Method GET -UseBasicParsing -TimeoutSec 30
    } catch {
        Write-Log "Server nicht erreichbar: $_" "WARN"
        return
    }

    if (-not $jobs -or $jobs.Count -eq 0) {
        Write-Log "Keine ausstehenden Jobs."
        return
    }

    Write-Log "$($jobs.Count) Job(s) erhalten."

    foreach ($job in $jobs) {
        Write-Log "Job $($job.jobId): [$($job.type)] $($job.name)"
        $result = Invoke-Job -Job @{
            jobId    = $job.jobId; type = $job.type
            wingetId = $job.wingetId; params = $job.params
            fileUrl  = $job.fileUrl;  fileName = $job.fileName
        } -ServerUrl $ServerUrl -ApiKey $ApiKey

        Write-Log "Job $($job.jobId) fertig. Exit: $($result.exitCode)"

        $body = @{ jobId = $job.jobId; exitCode = $result.exitCode; log = $result.log } | ConvertTo-Json
        try {
            Invoke-RestMethod -Uri $baseUrl -Method POST -Body $body -ContentType "application/json" -UseBasicParsing -TimeoutSec 30 | Out-Null
        } catch {
            Write-Log "Ergebnis-Meldung fehlgeschlagen: $_" "WARN"
        }
    }
}

# -- Einstiegspunkt ------------------------------------------------------------

if ($Setup) {
    if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Host "FEHLER: Setup muss als Administrator ausgefuehrt werden." -ForegroundColor Red
        exit 1
    }

    if (-not $ServerUrl)       { $ServerUrl       = Read-Host "Server-URL (z.B. http://172.29.13.134:3000)" }
    if (-not $EnrollmentToken) { $EnrollmentToken = Read-Host "Enrollment-Token (aus Admin -> Software)" }

    $ServerUrl = $ServerUrl.TrimEnd("/")

    # Registrieren und API-Key holen
    $apiKey = Register-Agent -ServerUrl $ServerUrl -Token $EnrollmentToken
    Save-Config -Url $ServerUrl -Key $apiKey

    # Script in permanenten Pfad kopieren
    $installDir  = "$env:ProgramData\KanbanFlow"
    $installPath = "$installDir\agent.ps1"
    if (-not (Test-Path $installDir)) { New-Item -ItemType Directory -Path $installDir -Force | Out-Null }
    Copy-Item -Path $PSCommandPath -Destination $installPath -Force

    Install-ScheduledTask -ScriptPath $installPath

    Write-Host ""
    Write-Host "[OK] Agent erfolgreich eingerichtet!" -ForegroundColor Green
    Write-Host "  Script:  $installPath"
    Write-Host "  Logs:    $LogFile"
    Write-Host "  Task:    $TaskName (alle 5 Minuten als SYSTEM)"
    Write-Host ""

    $cfg = Load-Config
    Start-AgentLoop -ServerUrl $cfg.ServerUrl -ApiKey $cfg.ApiKey

} else {
    # Normaler Polling-Lauf (Scheduled Task)
    $cfg = Load-Config
    if (-not $cfg) {
        Write-Log "Keine Konfiguration. Setup ausfuehren: .\agent.ps1 -Setup" "ERROR"
        exit 1
    }
    Start-AgentLoop -ServerUrl $cfg.ServerUrl -ApiKey $cfg.ApiKey
}
