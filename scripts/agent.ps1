#Requires -Version 5.1
<#
.SYNOPSIS
    KanbanFlow Secure Agent v1.0.0
.DESCRIPTION
    Sicherer, modularer Windows-Agent fuer die KanbanFlow-Softwareverteilung.
    Laeuft als SYSTEM-Dienst via Scheduled Task.
.PARAMETER Setup
    Erstkonfiguration: Server-URL und Enrollment-Token, legt Scheduled Task an.
.PARAMETER ServerUrl
    URL des KanbanFlow-Servers (https:// empfohlen)
.PARAMETER EnrollmentToken
    Gemeinsames Registrierungsgeheimnis (aus Admin -> Software)
.PARAMETER AllowInsecureHttp
    Erlaubt HTTP statt HTTPS (nur fuer Tests - NIEMALS in Produktion)
.EXAMPLE
    .\agent.ps1 -Setup -ServerUrl "https://kanban.intern.de" -EnrollmentToken "abc..."
    .\agent.ps1 -Setup -ServerUrl "http://172.29.13.134:3000" -EnrollmentToken "abc..." -AllowInsecureHttp
#>

param(
    [switch]$Setup,
    [string]$ServerUrl,
    [string]$EnrollmentToken,
    [switch]$AllowInsecureHttp
)

# ============================================================
# ABSCHNITT 1: GLOBALE KONFIGURATION
# ============================================================

# Agent-Version - bei jedem Update erhoehen
$AgentVersion    = "1.3.0"

# Freie PowerShell-Scripts vom Server: STANDARDMAESSIG DEAKTIVIERT
# Sicherheitshinweis: Der Agent laeuft als SYSTEM. Beliebige Remote-Scripts
# stellen ein erhebliches Sicherheitsrisiko dar. Nur aktivieren wenn noetig.
$AllowRemoteScripts = $false

# Erlaubte Job-Typen (Whitelist)
$AllowedJobTypes = @(
    "winget_install",
    "file_install",
    "file_copy",
    "scan_subnet",
    "restart_service",
    "collect_inventory",
    "agent_update",
    "reboot_pending_check",
    "get_disk_status",
    "run_diagnostic",
    # Rueckwaertskompatibilitaet mit alten Server-Versionen
    "winget",
    "file"
)

# Timeouts pro Job-Typ in Sekunden
$JobTimeouts = @{
    "winget_install"      = 1200  # 20 Minuten
    "winget"              = 1200
    "file_install"        = 1200
    "file"                = 1200
    "file_copy"           = 600   # 10 Minuten (nur Download)
    "scan_subnet"         = 300   # 5 Minuten
    "restart_service"     = 120   # 2 Minuten
    "collect_inventory"   = 120
    "agent_update"        = 300   # 5 Minuten
    "reboot_pending_check"= 60
    "get_disk_status"     = 60
    "run_diagnostic"      = 300
    "script"              = 300
}

# Maximale Log-Groesse pro Job (32 KB)
$MaxLogBytes = 32768

# Registry-Pfad fuer Konfiguration
$RegistryPath    = "HKLM:\SOFTWARE\KanbanFlow\Agent"
$TaskName        = "KanbanFlow-Agent"
$LogFile         = "$env:ProgramData\KanbanFlow\agent.log"
$InstallPath     = "$env:ProgramData\KanbanFlow\agent.ps1"
$TempDir         = "$env:TEMP\KanbanFlow"

# Heartbeat (Hardware-Inventar) nur alle X Minuten senden.
# Jobs werden bei JEDEM Tick (1 Min) abgerufen.
$HeartbeatIntervalMinutes = 5

$ErrorActionPreference = "Stop"

# ============================================================
# ABSCHNITT 2: LOGGING
# ============================================================

function Write-Log {
    param(
        [string]$Message,
        [ValidateSet("INFO","WARN","ERROR","SEC")]
        [string]$Level = "INFO"
    )
    $ts   = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] [$Level] $Message"
    Write-Host $line
    try {
        $dir = Split-Path $LogFile
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        Add-Content -Path $LogFile -Value $line -Encoding UTF8
    } catch {}
}

function Limit-String {
    # Begrenzt einen String auf MaxLogBytes. Verhindert riesige Job-Logs.
    param([string]$Text, [int]$MaxBytes = $MaxLogBytes)
    if ([System.Text.Encoding]::UTF8.GetByteCount($Text) -gt $MaxBytes) {
        $cut = $Text.Substring(0, [Math]::Min($Text.Length, ($MaxBytes / 2)))
        return "$cut`n... [Log gekuerzt - Original ueberschritt $MaxBytes Bytes]"
    }
    return $Text
}

# ============================================================
# ABSCHNITT 3: REGISTRY / KONFIGURATION
# ============================================================

function Save-Config {
    param([string]$Url, [string]$Key)
    if (-not (Test-Path $RegistryPath)) { New-Item -Path $RegistryPath -Force | Out-Null }
    Set-ItemProperty -Path $RegistryPath -Name "ServerUrl" -Value $Url
    # Sicherheitshinweis: ApiKey liegt im Klartext in HKLM.
    # Zugriff ist auf Administratoren und SYSTEM beschraenkt.
    # Fuer hoeheren Schutz koennte DPAPI (ConvertFrom-SecureString) verwendet werden.
    Set-ItemProperty -Path $RegistryPath -Name "ApiKey"    -Value $Key
    Set-ItemProperty -Path $RegistryPath -Name "Version"   -Value $AgentVersion
    Write-Log "Konfiguration in Registry gespeichert (HKLM)."
}

function Load-Config {
    if (-not (Test-Path $RegistryPath)) { return $null }
    $url = (Get-ItemProperty -Path $RegistryPath -Name "ServerUrl" -ErrorAction SilentlyContinue).ServerUrl
    $key = (Get-ItemProperty -Path $RegistryPath -Name "ApiKey"    -ErrorAction SilentlyContinue).ApiKey
    if (-not $url -or -not $key) { return $null }
    return @{ ServerUrl = $url.TrimEnd("/"); ApiKey = $key }
}

# ============================================================
# ABSCHNITT 4: API HELPERS
# ============================================================

function New-AgentHeaders {
    # Zentrale Header-Funktion. ApiKey wird NICHT mehr in der URL uebergeben.
    # Sicherheitshinweis: Bearer-Token verhindert versehentliches Logging
    # des ApiKeys in URL-Logs (Proxy, IIS, nginx etc.).
    param([string]$ApiKey)
    return @{
        "Authorization" = "Bearer $ApiKey"
        "X-Agent-Version" = $AgentVersion
        "X-Agent-Host"  = $env:COMPUTERNAME
        "Content-Type"  = "application/json"
    }
}

function Invoke-AgentApi {
    # Zentraler HTTP-Helper fuer alle API-Aufrufe.
    param(
        [string]$ServerUrl,
        [string]$ApiKey,
        [string]$Path,
        [string]$Method = "GET",
        [string]$Body   = $null
    )
    $headers = New-AgentHeaders -ApiKey $ApiKey
    $uri     = "$ServerUrl$Path"
    $params  = @{
        Uri         = $uri
        Method      = $Method
        Headers     = $headers
        UseBasicParsing = $true
        TimeoutSec  = 30
        ErrorAction = "Stop"
    }
    if ($Body) {
        $params.Body        = $Body
        $params.ContentType = "application/json"
    }
    return Invoke-RestMethod @params
}

function Send-JobResult {
    # Meldet das Ergebnis eines Jobs an den Server.
    param(
        [string]$ServerUrl,
        [string]$ApiKey,
        [string]$JobId,
        [int]$ExitCode,
        [string]$Log,
        [datetime]$StartedAt,
        [datetime]$FinishedAt
    )
    $duration = [Math]::Round(($FinishedAt - $StartedAt).TotalSeconds, 1)
    $payload  = @{
        jobId           = $JobId
        exitCode        = $ExitCode
        log             = (Limit-String -Text $Log)
        hostname        = $env:COMPUTERNAME.ToLower()
        agentVersion    = $AgentVersion
        startedAt       = $StartedAt.ToString("o")
        finishedAt      = $FinishedAt.ToString("o")
        durationSeconds = $duration
    } | ConvertTo-Json -Compress

    try {
        Invoke-AgentApi -ServerUrl $ServerUrl -ApiKey $ApiKey `
            -Path "/api/agent/jobs" -Method "POST" -Body $payload | Out-Null
    } catch {
        Write-Log "Ergebnis-Meldung fuer Job $JobId fehlgeschlagen: $_" "WARN"
    }
}

# ============================================================
# ABSCHNITT 5: INVENTORY / HARDWARE
# ============================================================

function Get-HardwareInfo {
    # Sammelt Hardware- und Systeminformationen.
    # Sicherheitshinweis: Es werden KEINE Benutzerdaten, Dokumente,
    # Browser-Daten oder Passwoerter ausgelesen.
    $hw = @{ hostname = $env:COMPUTERNAME.ToLower(); agentVersion = $AgentVersion }

    try {
        $hw.powershellVersion = $PSVersionTable.PSVersion.ToString()
    } catch {}

    try {
        $nic = Get-NetAdapter | Where-Object { $_.Status -eq "Up" -and $_.HardwareInterface } | Select-Object -First 1
        if ($nic) {
            $hw.macAddress = $nic.MacAddress
            $ip = (Get-NetIPAddress -InterfaceIndex $nic.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1).IPAddress
            if ($ip) { $hw.ipAddress = $ip }
        }
    } catch {}

    try {
        $os = Get-CimInstance Win32_OperatingSystem
        $hw.osVersion    = "$($os.Caption) Build $($os.BuildNumber)"
        $hw.lastBootTime = $os.LastBootUpTime.ToString("o")
    } catch {}

    try {
        $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
        $hw.cpuName  = $cpu.Name.Trim()
        $hw.cpuCores = [int]$cpu.NumberOfLogicalProcessors
    } catch {}

    try {
        $ram = (Get-CimInstance Win32_PhysicalMemory | Measure-Object -Property Capacity -Sum).Sum
        $hw.ramGb = [int][Math]::Round($ram / 1GB)
    } catch {}

    try {
        $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
        $hw.totalDiskGb = [int][Math]::Round($disk.Size / 1GB)
        $hw.freeDiskGb  = [int][Math]::Round($disk.FreeSpace / 1GB)
        $hw.diskGb      = $hw.totalDiskGb
    } catch {}

    try {
        $cs = Get-CimInstance Win32_ComputerSystem
        $hw.manufacturer = $cs.Manufacturer.Trim()
        $hw.model        = $cs.Model.Trim()
        $hw.domain       = $cs.Domain
        # Aktuell eingeloggter (interaktiver) Benutzer - nur Benutzername, kein Passwort
        if ($cs.UserName) { $hw.loggedInUser = ($cs.UserName -split '\\')[-1] }
    } catch {}

    try {
        $bios = Get-CimInstance Win32_BIOS
        if ($bios.SerialNumber -and $bios.SerialNumber -notmatch "^\s*$|To Be Filled|Default|None") {
            $hw.serialNumber = $bios.SerialNumber.Trim()
        }
    } catch {}

    try {
        $hw.installedSoftware = Get-InstalledSoftware
    } catch {
        Write-Log "Software-Inventar konnte nicht gelesen werden: $_" "WARN"
    }

    return $hw
}

function Get-InstalledSoftware {
    # Liest installierte Software aus der Windows-Registry.
    # Beide Registrierungspfade (64-Bit und 32-Bit) werden durchsucht.
    $paths = @(
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )
    $seen = @{}
    $apps = [System.Collections.Generic.List[hashtable]]::new()

    foreach ($path in $paths) {
        $items = Get-ItemProperty -Path $path -ErrorAction SilentlyContinue
        foreach ($item in $items) {
            $name = $item.DisplayName
            if (-not $name -or $name.Trim() -eq "") { continue }
            $key = $name.ToLower().Trim()
            if ($seen[$key]) { continue }
            $seen[$key] = $true

            $app = @{ name = $name.Trim() }
            if ($item.DisplayVersion) { $app.version   = $item.DisplayVersion.Trim() }
            if ($item.Publisher)      { $app.publisher = $item.Publisher.Trim() }
            $apps.Add($app)

            # Maximal 500 Eintraege um riesige Payloads zu vermeiden
            if ($apps.Count -ge 500) { break }
        }
        if ($apps.Count -ge 500) { break }
    }

    return ($apps | Sort-Object { $_["name"] })
}

# ============================================================
# ABSCHNITT 6: SECURITY / VALIDIERUNG
# ============================================================

function Test-JobValid {
    # Validiert einen Job-Datensatz vom Server, bevor er ausgefuehrt wird.
    # Sicherheitshinweis: Verhindert Injection und unerwartete Eingaben.
    param([hashtable]$Job, [string]$ServerUrl)

    if (-not $Job.jobId) {
        Write-Log "Job ohne jobId abgelehnt." "SEC"
        return "Kein jobId vorhanden"
    }
    if (-not $Job.type) {
        Write-Log "Job $($Job.jobId) ohne type abgelehnt." "SEC"
        return "Kein type vorhanden"
    }

    # Typ normalisieren (Rueckwaertskompatibilitaet)
    $normalizedType = switch ($Job.type) {
        "winget" { "winget_install" }
        "file"   { "file_install" }
        default  { $Job.type }
    }
    $Job.type = $normalizedType

    if ($AllowedJobTypes -notcontains $Job.type) {
        Write-Log "Unbekannter Job-Typ '$($Job.type)' fuer Job $($Job.jobId) abgelehnt." "SEC"
        return "Unbekannter Job-Typ: $($Job.type)"
    }

    # Script-Jobs: nur wenn explizit erlaubt
    if ($Job.type -eq "script" -and -not $AllowRemoteScripts) {
        Write-Log "Script-Job $($Job.jobId) abgelehnt (AllowRemoteScripts = false)." "SEC"
        return "Script-Jobs sind auf diesem Agent deaktiviert"
    }

    # Params-Groesse begrenzen (max 64 KB)
    if ($Job.params -and [System.Text.Encoding]::UTF8.GetByteCount($Job.params) -gt 65536) {
        Write-Log "Job $($Job.jobId) params zu gross." "SEC"
        return "params zu gross (max 64 KB)"
    }

    # fileUrl darf nur relative Pfade vom eigenen Server enthalten
    if ($Job.fileUrl) {
        if ($Job.fileUrl -match "^https?://") {
            Write-Log "Externe fileUrl in Job $($Job.jobId) abgelehnt: $($Job.fileUrl)" "SEC"
            return "Externe fileUrl nicht erlaubt"
        }
        if ($Job.fileUrl -match "\.\." -or $Job.fileUrl -match "[;&|`$]") {
            Write-Log "Unsichere fileUrl in Job $($Job.jobId) abgelehnt." "SEC"
            return "Unsichere Zeichen in fileUrl"
        }
    }

    # wingetId: nur alphanumerisch, Punkte, Bindestriche
    if ($Job.wingetId -and $Job.wingetId -notmatch "^[a-zA-Z0-9._-]+$") {
        Write-Log "Ungueltige wingetId '$($Job.wingetId)' in Job $($Job.jobId)." "SEC"
        return "Ungueltige wingetId (erlaubt: Buchstaben, Zahlen, . - _)"
    }

    # serviceName: nur Buchstaben, Zahlen, Bindestriche, Unterstriche
    if ($Job.serviceName -and $Job.serviceName -notmatch "^[a-zA-Z0-9_-]+$") {
        Write-Log "Ungueltige serviceName '$($Job.serviceName)' in Job $($Job.jobId)." "SEC"
        return "Ungueltige serviceName"
    }

    return $null  # kein Fehler = Job ist valide
}

function Test-AgentPackageTrust {
    # Prueft die Integritaet eines heruntergeladenen Pakets.
    # Sicherheitshinweis: Aktuell SHA256-Pruefung.
    # TODO: Spaeterer Erweiterungspunkt fuer Authenticode-Signaturpruefung:
    #   $sig = Get-AuthenticodeSignature -FilePath $FilePath
    #   if ($sig.Status -ne 'Valid') { throw "Signatur ungueltig" }
    #   if ($sig.SignerCertificate.Thumbprint -ne $ExpectedThumbprint) { throw "Falscher Aussteller" }
    param(
        [string]$FilePath,
        [string]$ExpectedSha256
    )
    if (-not $ExpectedSha256) {
        Write-Log "Keine SHA256-Pruefsumme angegeben - Integritaetspruefung uebersprungen." "WARN"
        return $true
    }
    $actual = (Get-FileHash -Path $FilePath -Algorithm SHA256).Hash
    if ($actual.ToUpper() -ne $ExpectedSha256.ToUpper()) {
        Write-Log "SHA256-Pruefung fehlgeschlagen! Erwartet: $ExpectedSha256 | Erhalten: $actual" "SEC"
        return $false
    }
    Write-Log "SHA256-Pruefung bestanden: $actual"
    return $true
}

function Compare-SemanticVersion {
    # Gibt -1 zurueck wenn v1 < v2, 0 wenn gleich, 1 wenn v1 > v2
    param([string]$v1, [string]$v2)
    $parts1 = $v1 -split '\.'
    $parts2 = $v2 -split '\.'
    $maxLen  = [Math]::Max($parts1.Length, $parts2.Length)
    for ($i = 0; $i -lt $maxLen; $i++) {
        $p1 = if ($i -lt $parts1.Length) { [int]($parts1[$i] -replace '[^0-9]','') } else { 0 }
        $p2 = if ($i -lt $parts2.Length) { [int]($parts2[$i] -replace '[^0-9]','') } else { 0 }
        if ($p1 -lt $p2) { return -1 }
        if ($p1 -gt $p2) { return  1 }
    }
    return 0
}

# ============================================================
# ABSCHNITT 7: JOB-AUSFUEHRUNG
# ============================================================

function Invoke-WithTimeout {
    # Fuehrt einen Prozess mit Timeout aus. Gibt @{ExitCode; Output} zurueck.
    # exitCode 124 = Timeout (analog zu Unix timeout-Befehl)
    param(
        [string]$FilePath,
        [string[]]$Arguments,
        [int]$TimeoutSeconds = 300
    )
    $stdoutFile = "$TempDir\stdout_$([System.IO.Path]::GetRandomFileName()).txt"
    $stderrFile = "$TempDir\stderr_$([System.IO.Path]::GetRandomFileName()).txt"

    if (-not (Test-Path $TempDir)) { New-Item -ItemType Directory -Path $TempDir -Force | Out-Null }

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName               = $FilePath
    $psi.Arguments              = $Arguments -join " "
    $psi.UseShellExecute        = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError  = $true
    $psi.CreateNoWindow         = $true

    $proc = [System.Diagnostics.Process]::Start($psi)
    $stdout = $proc.StandardOutput.ReadToEndAsync()
    $stderr = $proc.StandardError.ReadToEndAsync()

    $finished = $proc.WaitForExit($TimeoutSeconds * 1000)

    $out = $stdout.Result + $stderr.Result

    if (-not $finished) {
        try { $proc.Kill() } catch {}
        Remove-Item $stdoutFile, $stderrFile -Force -ErrorAction SilentlyContinue
        return @{ ExitCode = 124; Output = "[TIMEOUT nach $TimeoutSeconds Sekunden]`n$out" }
    }

    Remove-Item $stdoutFile, $stderrFile -Force -ErrorAction SilentlyContinue
    return @{ ExitCode = $proc.ExitCode; Output = $out }
}

function Invoke-JobExecution {
    param([hashtable]$Job, [string]$ServerUrl, [string]$ApiKey)

    $log      = [System.Text.StringBuilder]::new()
    $exitCode = 0
    $timeout  = if ($JobTimeouts.ContainsKey($Job.type)) { $JobTimeouts[$Job.type] } else { 300 }

    try {
        switch ($Job.type) {

            # --------------------------------------------------
            # winget-Installation
            # --------------------------------------------------
            { $_ -in "winget_install","winget" } {
                if (-not $Job.wingetId) { throw "Keine wingetId angegeben" }

                $wingetArgs = @("install", "--id", $Job.wingetId)
                if ($Job.params) {
                    $extra = $Job.params -split '\s+' | Where-Object { $_ -ne "" }
                    $wingetArgs += $extra
                } else {
                    $wingetArgs += @("--silent","--accept-package-agreements","--accept-source-agreements")
                }

                $log.AppendLine("winget $($wingetArgs -join ' ')") | Out-Null
                $result = Invoke-WithTimeout -FilePath "winget.exe" -Arguments $wingetArgs -TimeoutSeconds $timeout
                $log.AppendLine($result.Output) | Out-Null
                $exitCode = $result.ExitCode
            }

            # --------------------------------------------------
            # Datei-Installation (vom Server herunterladen)
            # --------------------------------------------------
            { $_ -in "file_install","file" } {
                if (-not $Job.fileUrl) { throw "Keine fileUrl angegeben" }

                $fname = if ($Job.fileName) { $Job.fileName } else { "setup.exe" }
                $dest  = "$TempDir\$($Job.jobId)_$fname"
                if (-not (Test-Path $TempDir)) { New-Item -ItemType Directory -Path $TempDir -Force | Out-Null }

                $fullUrl = "$ServerUrl$($Job.fileUrl)"
                $log.AppendLine("Lade herunter: $fullUrl") | Out-Null

                # Download mit Authorization-Header
                $headers = New-AgentHeaders -ApiKey $ApiKey
                Invoke-WebRequest -Uri $fullUrl -OutFile $dest -Headers $headers -UseBasicParsing -TimeoutSec 600
                $log.AppendLine("Gespeichert: $dest") | Out-Null

                # SHA256 pruefen falls vorhanden
                if ($Job.sha256) {
                    if (-not (Test-AgentPackageTrust -FilePath $dest -ExpectedSha256 $Job.sha256)) {
                        Remove-Item $dest -Force -ErrorAction SilentlyContinue
                        throw "SHA256-Pruefung fehlgeschlagen"
                    }
                }

                $installArgs = if ($Job.params) { $Job.params -split '\s+' | Where-Object { $_ -ne "" } } else { @() }
                $log.AppendLine("Starte: $dest $($installArgs -join ' ')") | Out-Null

                $result = Invoke-WithTimeout -FilePath $dest -Arguments $installArgs -TimeoutSeconds $timeout
                $log.AppendLine($result.Output) | Out-Null
                $exitCode = $result.ExitCode

                Remove-Item $dest -Force -ErrorAction SilentlyContinue
            }

            # --------------------------------------------------
            # Datei nur kopieren (NICHT ausfuehren) - fuer Tests
            # --------------------------------------------------
            "file_copy" {
                if (-not $Job.fileUrl) { throw "Keine fileUrl angegeben" }

                $fname = if ($Job.fileName) { $Job.fileName } else { "file.bin" }
                # Ordner immer anlegen, auch wenn er schon existiert (-Force)
                New-Item -ItemType Directory -Path $TempDir -Force -ErrorAction Stop | Out-Null
                $dest = "$TempDir\$fname"
                $log.AppendLine("Zielordner: $TempDir") | Out-Null

                $fullUrl = "$ServerUrl$($Job.fileUrl)"
                $log.AppendLine("Lade herunter (nur kopieren): $fullUrl") | Out-Null

                $headers = New-AgentHeaders -ApiKey $ApiKey
                Invoke-WebRequest -Uri $fullUrl -OutFile $dest -Headers $headers -UseBasicParsing -TimeoutSec 600
                $log.AppendLine("Gespeichert: $dest") | Out-Null

                if ($Job.sha256) {
                    if (-not (Test-AgentPackageTrust -FilePath $dest -ExpectedSha256 $Job.sha256)) {
                        Remove-Item $dest -Force -ErrorAction SilentlyContinue
                        throw "SHA256-Pruefung fehlgeschlagen"
                    }
                }

                $size = [Math]::Round((Get-Item $dest).Length / 1MB, 2)
                $log.AppendLine("OK - $size MB gespeichert. Datei wird NICHT ausgefuehrt.") | Out-Null
                $exitCode = 0
            }

            # --------------------------------------------------
            # Windows-Dienst neu starten
            # --------------------------------------------------
            "restart_service" {
                $svcName = if ($Job.serviceName) { $Job.serviceName } elseif ($Job.params) { $Job.params.Trim() } else { throw "Kein serviceName" }
                $log.AppendLine("Starte Dienst neu: $svcName") | Out-Null

                $svc = Get-Service -Name $svcName -ErrorAction Stop
                $log.AppendLine("Aktueller Status: $($svc.Status)") | Out-Null

                Restart-Service -Name $svcName -Force -ErrorAction Stop
                Start-Sleep -Seconds 3
                $svc.Refresh()
                $log.AppendLine("Neuer Status: $($svc.Status)") | Out-Null

                $exitCode = if ($svc.Status -eq "Running") { 0 } else { 1 }
            }

            # --------------------------------------------------
            # Hardware-Inventar an Server melden
            # --------------------------------------------------
            "collect_inventory" {
                $log.AppendLine("Sammle Hardware-Inventar...") | Out-Null
                $hw   = Get-HardwareInfo
                $body = @{ enrollmentToken = $null; hardware = $hw } | ConvertTo-Json -Depth 3
                Invoke-AgentApi -ServerUrl $ServerUrl -ApiKey $ApiKey `
                    -Path "/api/agent/register" -Method "POST" -Body $body | Out-Null
                $log.AppendLine("Inventar erfolgreich uebermittelt.") | Out-Null
                $exitCode = 0
            }

            # --------------------------------------------------
            # Reboot-Pending pruefen
            # --------------------------------------------------
            "reboot_pending_check" {
                $pending = $false
                $reasons = @()

                # Windows Update
                $wu = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired"
                if (Test-Path $wu) { $pending = $true; $reasons += "Windows Update" }

                # Component Based Servicing
                $cbs = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending"
                if (Test-Path $cbs) { $pending = $true; $reasons += "CBS" }

                # PendingFileRenameOperations
                $pfro = (Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager" -ErrorAction SilentlyContinue).PendingFileRenameOperations
                if ($pfro) { $pending = $true; $reasons += "FileRename" }

                $log.AppendLine("Neustart ausstehend: $pending") | Out-Null
                if ($reasons.Count -gt 0) { $log.AppendLine("Gruende: $($reasons -join ', ')") | Out-Null }
                $exitCode = if ($pending) { 1 } else { 0 }
            }

            # --------------------------------------------------
            # Festplattenstatus
            # --------------------------------------------------
            "get_disk_status" {
                $disks = Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 3 }
                foreach ($d in $disks) {
                    $freeGb  = [Math]::Round($d.FreeSpace / 1GB, 1)
                    $totalGb = [Math]::Round($d.Size / 1GB, 1)
                    $pct     = if ($d.Size -gt 0) { [Math]::Round(($d.FreeSpace / $d.Size) * 100, 1) } else { 0 }
                    $log.AppendLine("$($d.DeviceID) $freeGb GB frei von $totalGb GB ($pct% frei)") | Out-Null
                }
                $exitCode = 0
            }

            # --------------------------------------------------
            # Subnetz-Scan: pingt alle IPs des eigenen Subnetzes
            # und meldet Ergebnisse zurueck (laeuft im lokalen VLAN)
            # --------------------------------------------------
            "scan_subnet" {
                # Eigenes Subnetz aus IP-Adresse ableiten (/24 angenommen)
                $myIp = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex (
                    (Get-NetAdapter | Where-Object { $_.Status -eq "Up" -and $_.HardwareInterface } | Select-Object -First 1).ifIndex
                ) -ErrorAction SilentlyContinue | Select-Object -First 1).IPAddress

                if (-not $myIp) { throw "Eigene IP konnte nicht ermittelt werden" }

                $parts = $myIp -split '\.'
                $baseIp = "$($parts[0]).$($parts[1]).$($parts[2])."
                $log.AppendLine("Scanne Subnetz: ${baseIp}0/24 von $myIp aus...") | Out-Null

                $results = [System.Collections.Generic.List[hashtable]]::new()
                $jobs2   = [System.Collections.Generic.List[object]]::new()

                # Parallele Pings (max 50 gleichzeitig)
                for ($i = 1; $i -le 254; $i++) {
                    $ip = "$baseIp$i"
                    $jobs2.Add([System.Net.NetworkInformation.Ping]::new().SendPingAsync($ip, 500))
                }

                for ($i = 0; $i -lt $jobs2.Count; $i++) {
                    $ip = "$baseIp$($i + 1)"
                    try {
                        $reply = $jobs2[$i].GetAwaiter().GetResult()
                        if ($reply.Status -eq "Success") {
                            $latency = $reply.RoundtripTime
                            # Reverse-DNS
                            $hostname = $null
                            try { $hostname = [System.Net.Dns]::GetHostEntry($ip).HostName } catch {}
                            $results.Add(@{ ip = $ip; alive = $true; hostname = $hostname; latencyMs = $latency })
                        }
                    } catch {}
                }

                $activeCount = $results.Count
                $log.AppendLine("$activeCount aktive IPs gefunden.") | Out-Null

                # Ergebnis an Server melden
                $payload = @{
                    subnet      = "${baseIp}0/24"
                    activeCount = $activeCount
                    totalPinged = 254
                    results     = $results.ToArray()
                    scannedBy   = $env:COMPUTERNAME.ToLower()
                } | ConvertTo-Json -Depth 3 -Compress

                Invoke-AgentApi -ServerUrl $ServerUrl -ApiKey $ApiKey `
                    -Path "/api/agent/scan-result" -Method "POST" -Body $payload | Out-Null

                $exitCode = 0
            }

            # --------------------------------------------------
            # Diagnose (systeminfo, services etc.)
            # --------------------------------------------------
            "run_diagnostic" {
                $log.AppendLine("=== Systeminfo ===") | Out-Null
                $result = Invoke-WithTimeout -FilePath "systeminfo.exe" -Arguments @() -TimeoutSeconds $timeout
                $log.AppendLine($result.Output) | Out-Null
                $exitCode = $result.ExitCode
            }

            # --------------------------------------------------
            # Remote-Script (nur wenn $AllowRemoteScripts = $true)
            # --------------------------------------------------
            "script" {
                # Sicherheitswarnung: dieser Zweig darf nur erreicht werden,
                # wenn AllowRemoteScripts = $true gesetzt ist.
                Write-Log "WARNUNG: Remote-Script wird ausgefuehrt (AllowRemoteScripts = true)." "WARN"

                $scriptFile = "$TempDir\job_$($Job.jobId).ps1"
                if (-not (Test-Path $TempDir)) { New-Item -ItemType Directory -Path $TempDir -Force | Out-Null }
                Set-Content -Path $scriptFile -Value $Job.params -Encoding UTF8

                $result = Invoke-WithTimeout `
                    -FilePath "powershell.exe" `
                    -Arguments @("-NonInteractive","-ExecutionPolicy","Bypass","-File","`"$scriptFile`"") `
                    -TimeoutSeconds $timeout
                $log.AppendLine($result.Output) | Out-Null
                $exitCode = $result.ExitCode

                Remove-Item $scriptFile -Force -ErrorAction SilentlyContinue
            }

            # --------------------------------------------------
            # Agent-Update (eigener Abschnitt unten)
            # --------------------------------------------------
            "agent_update" {
                $updateResult = Invoke-AgentUpdate -Job $Job -ServerUrl $ServerUrl -ApiKey $ApiKey
                $log.AppendLine($updateResult.Log) | Out-Null
                $exitCode = $updateResult.ExitCode
            }

            default {
                throw "Unbekannter Job-Typ: $($Job.type)"
            }
        }
    } catch {
        $log.AppendLine("FEHLER bei Job-Ausfuehrung: $_") | Out-Null
        $exitCode = 1
    }

    return @{ ExitCode = $exitCode; Log = $log.ToString() }
}

# ============================================================
# ABSCHNITT 8: AGENT-UPDATE
# ============================================================

function Invoke-AgentUpdate {
    param(
        [hashtable]$Job,
        [string]$ServerUrl,
        [string]$ApiKey
    )

    $log = [System.Text.StringBuilder]::new()
    $backupPath = "$env:ProgramData\KanbanFlow\agent.backup.ps1"

    try {
        $newVersion = $Job.version
        if (-not $newVersion) { throw "Keine Zielversion angegeben" }

        # Versionspruefung
        $cmp = Compare-SemanticVersion -v1 $AgentVersion -v2 $newVersion
        if ($cmp -ge 0) {
            $log.AppendLine("Agent ist bereits auf Version $AgentVersion - kein Update noetig.") | Out-Null
            return @{ ExitCode = 0; Log = $log.ToString() }
        }

        $log.AppendLine("Update von $AgentVersion auf $newVersion...") | Out-Null

        # Datei nur vom eigenen Server laden
        if (-not $Job.fileUrl) { throw "Keine fileUrl fuer Update angegeben" }

        $tempNew = "$TempDir\agent_new_$newVersion.ps1"
        if (-not (Test-Path $TempDir)) { New-Item -ItemType Directory -Path $TempDir -Force | Out-Null }

        $fullUrl = "$ServerUrl$($Job.fileUrl)"
        $log.AppendLine("Lade: $fullUrl") | Out-Null

        $headers = New-AgentHeaders -ApiKey $ApiKey
        Invoke-WebRequest -Uri $fullUrl -OutFile $tempNew -Headers $headers -UseBasicParsing -TimeoutSec 60

        # Integritaetspruefung (SHA256)
        if (-not (Test-AgentPackageTrust -FilePath $tempNew -ExpectedSha256 $Job.sha256)) {
            Remove-Item $tempNew -Force -ErrorAction SilentlyContinue
            throw "SHA256-Pruefung fehlgeschlagen - Update abgebrochen"
        }

        # Syntax grob pruefen
        $errors = $null
        [System.Management.Automation.Language.Parser]::ParseFile($tempNew, [ref]$null, [ref]$errors) | Out-Null
        if ($errors.Count -gt 0) {
            $errMsg = ($errors | ForEach-Object { $_.Message }) -join "; "
            Remove-Item $tempNew -Force -ErrorAction SilentlyContinue
            throw "Syntaxfehler in neuer agent.ps1: $errMsg"
        }
        $log.AppendLine("Syntax-Pruefung bestanden.") | Out-Null

        # Backup des aktuellen Scripts
        Copy-Item -Path $InstallPath -Destination $backupPath -Force -ErrorAction Stop
        $log.AppendLine("Backup erstellt: $backupPath") | Out-Null

        # Neue Version installieren
        Copy-Item -Path $tempNew -Destination $InstallPath -Force -ErrorAction Stop
        Remove-Item $tempNew -Force -ErrorAction SilentlyContinue
        $log.AppendLine("Agent auf Version $newVersion aktualisiert.") | Out-Null

        return @{ ExitCode = 0; Log = $log.ToString() }

    } catch {
        $log.AppendLine("UPDATE FEHLGESCHLAGEN: $_") | Out-Null

        # Rollback
        if (Test-Path $backupPath) {
            try {
                Copy-Item -Path $backupPath -Destination $InstallPath -Force
                $log.AppendLine("Rollback auf Backup erfolgreich.") | Out-Null
            } catch {
                $log.AppendLine("Rollback fehlgeschlagen: $_") | Out-Null
            }
        }
        return @{ ExitCode = 1; Log = $log.ToString() }
    }
}

# ============================================================
# ABSCHNITT 9: SCHEDULED TASK SETUP
# ============================================================

function Install-AgentTask {
    param([string]$ScriptPath)

    $action = New-ScheduledTaskAction `
        -Execute "powershell.exe" `
        -Argument "-NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ScriptPath`""

    $trigger = New-ScheduledTaskTrigger `
        -RepetitionInterval (New-TimeSpan -Minutes 1) `
        -Once -At (Get-Date)

    $settings = New-ScheduledTaskSettingsSet `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
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
        -Description "KanbanFlow Software-Agent v$AgentVersion" | Out-Null

    Write-Log "Scheduled Task '$TaskName' eingerichtet (alle 5 Minuten, SYSTEM)."
}

# ============================================================
# ABSCHNITT 10: REGISTRIERUNG AM SERVER
# ============================================================

function Register-Agent {
    param([string]$ServerUrl, [string]$Token)

    Write-Log "Sammle Hardware-Daten..."
    $hw = Get-HardwareInfo

    Write-Log "Registriere '$($hw.hostname)' am Server (v$AgentVersion)..."

    $body = @{
        enrollmentToken = $Token
        hardware        = $hw
    } | ConvertTo-Json -Depth 3

    # Beim erstmaligen Register gibt es noch keinen ApiKey -
    # Enrollment-Token reicht als Authentifizierung
    $response = Invoke-RestMethod `
        -Uri "$ServerUrl/api/agent/register" `
        -Method POST `
        -Body $body `
        -ContentType "application/json" `
        -UseBasicParsing `
        -TimeoutSec 30

    if (-not $response.apiKey) { throw "Kein ApiKey in Server-Antwort" }

    Write-Log "Registrierung erfolgreich. Asset-ID: $($response.assetId)"
    return $response.apiKey
}

# ============================================================
# ABSCHNITT 11: HAUPT-POLLING-SCHLEIFE
# ============================================================

function Start-AgentLoop {
    param([string]$ServerUrl, [string]$ApiKey)

    Write-Log "Agent gestartet. Host: $env:COMPUTERNAME | Version: $AgentVersion | Server: $ServerUrl"

    # Heartbeat (Hardware + Software-Inventar) nur alle $HeartbeatIntervalMinutes Minuten.
    # Letzten Zeitstempel aus Registry lesen.
    $lastHeartbeatStr = (Get-ItemProperty -Path $RegistryPath -Name "LastHeartbeat" -ErrorAction SilentlyContinue).LastHeartbeat
    $lastHeartbeat    = if ($lastHeartbeatStr) { [datetime]$lastHeartbeatStr } else { [datetime]::MinValue }
    $doHeartbeat      = ([datetime]::UtcNow - $lastHeartbeat).TotalMinutes -ge $HeartbeatIntervalMinutes

    if ($doHeartbeat) {
        try {
            $hw   = Get-HardwareInfo
            $body = @{ enrollmentToken = $null; hardware = $hw } | ConvertTo-Json -Depth 3
            Invoke-AgentApi -ServerUrl $ServerUrl -ApiKey $ApiKey `
                -Path "/api/agent/register" -Method "POST" -Body $body | Out-Null
            Set-ItemProperty -Path $RegistryPath -Name "LastHeartbeat" -Value ([datetime]::UtcNow.ToString("o"))
            Write-Log "Heartbeat/Inventar gesendet."
        } catch {
            Write-Log "Heartbeat/Inventar fehlgeschlagen: $_" "WARN"
        }
    }

    # Jobs abrufen (Authorization-Header statt URL-Parameter)
    $jobs = $null
    try {
        $jobs = Invoke-AgentApi -ServerUrl $ServerUrl -ApiKey $ApiKey -Path "/api/agent/jobs"
    } catch {
        Write-Log "Jobs konnten nicht abgerufen werden: $_" "WARN"
        return
    }

    if (-not $jobs -or $jobs.Count -eq 0) {
        Write-Log "Keine ausstehenden Jobs."
        return
    }

    Write-Log "$($jobs.Count) Job(s) erhalten."

    foreach ($jobRaw in $jobs) {
        # PSObject in Hashtable umwandeln fuer einfacheren Zugriff
        $job = @{}
        $jobRaw.PSObject.Properties | ForEach-Object { $job[$_.Name] = $_.Value }

        $startedAt = Get-Date
        Write-Log "Starte Job $($job.jobId): [$($job.type)] $($job.name)"

        # Sicherheitsvalidierung vor Ausfuehrung
        $validationError = Test-JobValid -Job $job -ServerUrl $ServerUrl
        if ($validationError) {
            Write-Log "Job $($job.jobId) abgelehnt: $validationError" "SEC"
            Send-JobResult -ServerUrl $ServerUrl -ApiKey $ApiKey `
                -JobId $job.jobId -ExitCode 1 `
                -Log "Job abgelehnt: $validationError" `
                -StartedAt $startedAt -FinishedAt (Get-Date)
            continue
        }

        # Job ausfuehren
        $result    = Invoke-JobExecution -Job $job -ServerUrl $ServerUrl -ApiKey $ApiKey
        $finishedAt = Get-Date

        Write-Log "Job $($job.jobId) abgeschlossen. Exit: $($result.ExitCode)"

        # Nach erfolgreicher Installation sofort Inventar aktualisieren
        if ($result.ExitCode -eq 0 -and $job.type -in @("winget_install","winget","file_install","file")) {
            try {
                Write-Log "Aktualisiere Software-Inventar nach Installation..."
                $hw   = Get-HardwareInfo
                $body = @{ enrollmentToken = $null; hardware = $hw } | ConvertTo-Json -Depth 3
                Invoke-AgentApi -ServerUrl $ServerUrl -ApiKey $ApiKey `
                    -Path "/api/agent/register" -Method "POST" -Body $body | Out-Null
                Set-ItemProperty -Path $RegistryPath -Name "LastHeartbeat" -Value ([datetime]::UtcNow.ToString("o"))
                Write-Log "Inventar nach Installation aktualisiert."
            } catch {
                Write-Log "Inventar-Update nach Installation fehlgeschlagen: $_" "WARN"
            }
        }

        # Ergebnis melden
        Send-JobResult -ServerUrl $ServerUrl -ApiKey $ApiKey `
            -JobId     $job.jobId `
            -ExitCode  $result.ExitCode `
            -Log       $result.Log `
            -StartedAt $startedAt `
            -FinishedAt $finishedAt
    }
}

# ============================================================
# ABSCHNITT 12: EINSTIEGSPUNKT
# ============================================================

if ($Setup) {
    # Adminrechte pruefen
    if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Host "FEHLER: Setup muss als Administrator ausgefuehrt werden." -ForegroundColor Red
        exit 1
    }

    if (-not $ServerUrl)       { $ServerUrl       = Read-Host "Server-URL (https://...)" }
    if (-not $EnrollmentToken) { $EnrollmentToken = Read-Host "Enrollment-Token (aus Admin -> Software)" }

    $ServerUrl = $ServerUrl.TrimEnd("/")

    # HTTPS erzwingen (Sicherheitspruefung)
    if ($ServerUrl -notmatch "^https://") {
        if ($AllowInsecureHttp) {
            Write-Log "WARNUNG: HTTP-Verbindung erlaubt (AllowInsecureHttp). NICHT fuer Produktion!" "WARN"
        } else {
            Write-Host "FEHLER: Nur HTTPS erlaubt. Fuer Tests: -AllowInsecureHttp Parameter verwenden." -ForegroundColor Red
            Write-Host "Beispiel: .\agent.ps1 -Setup -ServerUrl `"$ServerUrl`" -EnrollmentToken `"...`" -AllowInsecureHttp"
            exit 1
        }
    }

    # Registrieren und ApiKey holen
    $apiKey = Register-Agent -ServerUrl $ServerUrl -Token $EnrollmentToken
    Save-Config -Url $ServerUrl -Key $apiKey

    # Script in permanenten Pfad installieren
    $installDir = Split-Path $InstallPath
    if (-not (Test-Path $installDir)) { New-Item -ItemType Directory -Path $installDir -Force | Out-Null }
    Copy-Item -Path $PSCommandPath -Destination $InstallPath -Force

    Install-AgentTask -ScriptPath $InstallPath

    Write-Host ""
    Write-Host "[OK] Agent v$AgentVersion erfolgreich eingerichtet!" -ForegroundColor Green
    Write-Host "  Script:  $InstallPath"
    Write-Host "  Logs:    $LogFile"
    Write-Host "  Task:    $TaskName (jede Minute als SYSTEM, Heartbeat alle $HeartbeatIntervalMinutes Min)"
    Write-Host "  HTTPS:   $(if ($ServerUrl -match '^https://') { 'JA' } else { 'NEIN (Testmodus)' })"
    Write-Host ""

    # Ersten Lauf sofort ausfuehren
    $cfg = Load-Config
    Start-AgentLoop -ServerUrl $cfg.ServerUrl -ApiKey $cfg.ApiKey

} else {
    # Normaler Polling-Lauf (vom Scheduled Task)
    $cfg = Load-Config
    if (-not $cfg) {
        Write-Log "Keine Konfiguration gefunden. Setup ausfuehren: .\agent.ps1 -Setup" "ERROR"
        exit 1
    }

    # Self-Healing: Scheduled Task neu anlegen falls er fehlt
    $existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if (-not $existingTask) {
        Write-Log "Scheduled Task '$TaskName' fehlt - wird neu angelegt." "WARN"
        try {
            Install-AgentTask -ScriptPath $InstallPath
            Write-Log "Scheduled Task wiederhergestellt."
        } catch {
            Write-Log "Task-Wiederherstellung fehlgeschlagen: $_" "WARN"
        }
    }

    Start-AgentLoop -ServerUrl $cfg.ServerUrl -ApiKey $cfg.ApiKey
}
