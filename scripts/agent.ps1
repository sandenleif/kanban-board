#Requires -Version 5.1
<#
.SYNOPSIS
    KanbanFlow Software-Agent für Windows
.DESCRIPTION
    Meldet sich beim KanbanFlow-Server an, holt ausstehende Software-Jobs
    und installiert diese automatisch.
.PARAMETER Setup
    Erstkonfiguration: Server-URL und API-Key eingeben und als Scheduled Task einrichten.
.PARAMETER ServerUrl
    URL des KanbanFlow-Servers (z.B. http://172.29.13.134:3000)
.PARAMETER ApiKey
    API-Key des registrierten PCs (aus Admin → Software → PCs)
.EXAMPLE
    # Erstkonfiguration (als Administrator ausführen):
    .\agent.ps1 -Setup -ServerUrl "http://172.29.13.134:3000" -ApiKey "abc123..."

    # Manueller Test-Lauf:
    .\agent.ps1
#>

param(
    [switch]$Setup,
    [string]$ServerUrl,
    [string]$ApiKey
)

$ErrorActionPreference = "Stop"
$RegistryPath = "HKLM:\SOFTWARE\KanbanFlow\Agent"
$TaskName     = "KanbanFlow-Agent"
$LogFile      = "$env:ProgramData\KanbanFlow\agent.log"
$TempDir      = "$env:TEMP\KanbanFlow"

# ── Logging ───────────────────────────────────────────────────────────────────

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

# ── Registry helpers ──────────────────────────────────────────────────────────

function Save-Config {
    param([string]$Url, [string]$Key)
    if (-not (Test-Path $RegistryPath)) {
        New-Item -Path $RegistryPath -Force | Out-Null
    }
    Set-ItemProperty -Path $RegistryPath -Name "ServerUrl" -Value $Url
    Set-ItemProperty -Path $RegistryPath -Name "ApiKey"    -Value $Key
    Write-Log "Konfiguration gespeichert in Registry."
}

function Load-Config {
    if (-not (Test-Path $RegistryPath)) { return $null }
    $url = (Get-ItemProperty -Path $RegistryPath -Name "ServerUrl" -ErrorAction SilentlyContinue).ServerUrl
    $key = (Get-ItemProperty -Path $RegistryPath -Name "ApiKey"    -ErrorAction SilentlyContinue).ApiKey
    if (-not $url -or -not $key) { return $null }
    return @{ ServerUrl = $url; ApiKey = $key }
}

# ── Scheduled Task einrichten ─────────────────────────────────────────────────

function Install-ScheduledTask {
    param([string]$ScriptPath)

    $action  = New-ScheduledTaskAction `
        -Execute "powershell.exe" `
        -Argument "-NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ScriptPath`""

    $trigger = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 5) -Once -At (Get-Date)

    $settings = New-ScheduledTaskSettingsSet `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 4) `
        -MultipleInstances IgnoreNew `
        -StartWhenAvailable

    $principal = New-ScheduledTaskPrincipal `
        -UserId "SYSTEM" `
        -LogonType ServiceAccount `
        -RunLevel Highest

    # Bestehende Task entfernen wenn vorhanden
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

    Register-ScheduledTask `
        -TaskName  $TaskName `
        -Action    $action `
        -Trigger   $trigger `
        -Settings  $settings `
        -Principal $principal `
        -Description "KanbanFlow Software-Verteilungs-Agent" | Out-Null

    Write-Log "Scheduled Task '$TaskName' eingerichtet (alle 5 Minuten als SYSTEM)."
}

# ── Job-Ausführung ────────────────────────────────────────────────────────────

function Invoke-Job {
    param([hashtable]$Job)

    $log      = [System.Text.StringBuilder]::new()
    $exitCode = 0

    try {
        switch ($Job.type) {

            "winget" {
                if (-not $Job.wingetId) { throw "Keine winget-ID angegeben" }
                $log.AppendLine("winget install --id $($Job.wingetId) --silent --accept-package-agreements --accept-source-agreements") | Out-Null
                $result = & winget install --id $Job.wingetId --silent --accept-package-agreements --accept-source-agreements 2>&1
                $log.AppendLine($result -join "`n") | Out-Null
                $exitCode = $LASTEXITCODE
            }

            "file" {
                if (-not $Job.fileUrl) { throw "Keine Download-URL angegeben" }
                $cfg      = Load-Config
                $fullUrl  = "$($cfg.ServerUrl)$($Job.fileUrl)"
                $dest     = "$TempDir\$($Job.jobId)_$($Job.fileName ?? 'setup.exe')"

                if (-not (Test-Path $TempDir)) { New-Item -ItemType Directory -Path $TempDir -Force | Out-Null }

                $log.AppendLine("Download: $fullUrl") | Out-Null
                Invoke-WebRequest -Uri $fullUrl -OutFile $dest -UseBasicParsing
                $log.AppendLine("Datei gespeichert: $dest") | Out-Null

                $params = if ($Job.params) { $Job.params -split '\s+' } else { @() }
                $log.AppendLine("Ausführen: $dest $($params -join ' ')") | Out-Null

                $proc = Start-Process -FilePath $dest -ArgumentList $params -Wait -PassThru -NoNewWindow
                $exitCode = $proc.ExitCode
                $log.AppendLine("Exit-Code: $exitCode") | Out-Null

                # Aufräumen
                Remove-Item $dest -Force -ErrorAction SilentlyContinue
            }

            "script" {
                if (-not $Job.params) { throw "Kein Script-Inhalt angegeben" }
                $scriptFile = "$TempDir\$($Job.jobId).ps1"
                if (-not (Test-Path $TempDir)) { New-Item -ItemType Directory -Path $TempDir -Force | Out-Null }

                Set-Content -Path $scriptFile -Value $Job.params -Encoding UTF8
                $log.AppendLine("PowerShell-Script ausführen...") | Out-Null

                $output   = & powershell.exe -NonInteractive -ExecutionPolicy Bypass -File $scriptFile 2>&1
                $exitCode = $LASTEXITCODE
                $log.AppendLine($output -join "`n") | Out-Null

                Remove-Item $scriptFile -Force -ErrorAction SilentlyContinue
            }

            default {
                throw "Unbekannter Job-Typ: $($Job.type)"
            }
        }
    } catch {
        $log.AppendLine("FEHLER: $_") | Out-Null
        $exitCode = 1
    }

    return @{ exitCode = $exitCode; log = $log.ToString() }
}

# ── Haupt-Polling-Loop ────────────────────────────────────────────────────────

function Start-AgentLoop {
    param([string]$Url, [string]$Key)

    $pollUrl   = "$Url/api/agent/jobs?apiKey=$Key"
    $reportUrl = "$Url/api/agent/jobs?apiKey=$Key"

    Write-Log "Agent gestartet. Server: $Url | Host: $env:COMPUTERNAME"

    try {
        # Jobs abrufen
        $response = Invoke-RestMethod -Uri $pollUrl -Method GET -UseBasicParsing -TimeoutSec 30
    } catch {
        Write-Log "Server nicht erreichbar: $_" "WARN"
        return
    }

    if (-not $response -or $response.Count -eq 0) {
        Write-Log "Keine ausstehenden Jobs."
        return
    }

    Write-Log "$($response.Count) Job(s) erhalten."

    foreach ($job in $response) {
        Write-Log "Starte Job $($job.jobId): [$($job.type)] $($job.name)"

        $result = Invoke-Job -Job @{
            jobId    = $job.jobId
            type     = $job.type
            wingetId = $job.wingetId
            params   = $job.params
            fileUrl  = $job.fileUrl
            fileName = $job.fileName
        }

        Write-Log "Job $($job.jobId) abgeschlossen. Exit-Code: $($result.exitCode)"

        # Ergebnis an Server melden
        $body = @{
            jobId    = $job.jobId
            exitCode = $result.exitCode
            log      = $result.log
        } | ConvertTo-Json

        try {
            Invoke-RestMethod -Uri $reportUrl -Method POST -Body $body `
                -ContentType "application/json" -UseBasicParsing -TimeoutSec 30
        } catch {
            Write-Log "Ergebnis konnte nicht gemeldet werden: $_" "WARN"
        }
    }
}

# ── Einstiegspunkt ────────────────────────────────────────────────────────────

if ($Setup) {
    # Erstkonfiguration
    if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Host "FEHLER: Setup muss als Administrator ausgeführt werden." -ForegroundColor Red
        exit 1
    }

    if (-not $ServerUrl) { $ServerUrl = Read-Host "Server-URL (z.B. http://172.29.13.134:3000)" }
    if (-not $ApiKey)    { $ApiKey    = Read-Host "API-Key (aus Admin → Software → PCs)" }

    $ServerUrl = $ServerUrl.TrimEnd("/")

    Save-Config -Url $ServerUrl -Key $ApiKey

    # Script in permanenten Pfad kopieren
    $installDir  = "$env:ProgramData\KanbanFlow"
    $installPath = "$installDir\agent.ps1"
    if (-not (Test-Path $installDir)) { New-Item -ItemType Directory -Path $installDir -Force | Out-Null }
    Copy-Item -Path $PSCommandPath -Destination $installPath -Force

    Install-ScheduledTask -ScriptPath $installPath

    Write-Host ""
    Write-Host "✓ Agent erfolgreich eingerichtet!" -ForegroundColor Green
    Write-Host "  Installiert: $installPath"
    Write-Host "  Logs:        $LogFile"
    Write-Host "  Task:        $TaskName (alle 5 Minuten)"
    Write-Host ""
    Write-Host "Ersten Lauf starten..." -ForegroundColor Cyan
    $cfg = Load-Config
    Start-AgentLoop -Url $cfg.ServerUrl -Key $cfg.ApiKey

} else {
    # Normaler Polling-Lauf (vom Scheduled Task aufgerufen)
    $cfg = Load-Config
    if (-not $cfg) {
        Write-Log "Keine Konfiguration gefunden. Bitte zuerst Setup ausführen: .\agent.ps1 -Setup" "ERROR"
        exit 1
    }
    Start-AgentLoop -Url $cfg.ServerUrl -Key $cfg.ApiKey
}
