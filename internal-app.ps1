# SFSR-REMS -- Internal Management System, opened as an application.
#
# Started by the desktop shortcut that create-internal-shortcut.bat writes.
# Runs hidden: it brings the local server up, waits for it, opens a chromeless
# window, and shuts the server down again when that window is closed.
#
# -- Why PowerShell and not a .bat -----------------------------------------
#
# A .bat always shows a console window when double-clicked, and the point here
# is that this behaves like an application. PowerShell can be launched with
# -WindowStyle Hidden and still hold a handle on the browser process, which is
# what lets the server be stopped when the window closes.
#
# -- The server is never exposed -------------------------------------------
#
# 127.0.0.1 only. Not 0.0.0.0 -- nothing on the office network or the WiFi can
# reach it, which is checked by `npm run start:internal:local`, not decided
# here. The LAN-facing form is a separate script and stays that way.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$Port = 3001
$Url = "http://127.0.0.1:$Port"
$LogFile = Join-Path $env:TEMP 'sfsr-internal.log'

$shell = New-Object -ComObject WScript.Shell

function Fail([string]$message) {
    # 16 = error icon. Silent is right until something goes wrong; a launcher
    # that fails without saying so is worse than one that shows a console.
    [void]$shell.Popup($message, 0, 'SFSR Internal System', 16)
    exit 1
}

function Test-ServerUp {
    try {
        $r = Invoke-WebRequest -Uri "$Url/login" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
        return $r.StatusCode -ge 200
    } catch {
        # A 3xx or 4xx still means something is listening and answering.
        if ($_.Exception.Response) { return $true }
        return $false
    }
}

# -- Prerequisites ---------------------------------------------------------
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Fail "Node.js is not installed on this machine.`n`nInstall Node 22 from https://nodejs.org and run this again."
}

if (-not (Test-Path (Join-Path $root '.env.local'))) {
    Fail "The file .env.local is missing from:`n$root`n`nThis machine is not set up to run the Internal Management System. Copy .env.example to .env.local and fill it in."
}

# First-run setup is deliberately NOT silent. Installing and building takes
# minutes, and a hidden window doing that looks like nothing happened, so the
# visible script handles it and this one only runs the everyday path.
if (-not (Test-Path (Join-Path $root 'node_modules')) -or
    -not (Test-Path (Join-Path $root 'apps\internal\.next'))) {
    [void]$shell.Popup(
        "This machine needs its first-time setup -- installing dependencies and building.`n`nA window will open and show the progress. It only happens once.",
        0, 'SFSR Internal System', 64)
    Start-Process -FilePath 'cmd.exe' `
        -ArgumentList '/c', "`"$root\run-internal.bat`"" `
        -WorkingDirectory $root -Wait
    exit 0
}

# -- Bring the server up, unless it already is -----------------------------
$startedByUs = $null

if (-not (Test-ServerUp)) {
    $startedByUs = Start-Process -FilePath 'cmd.exe' `
        -ArgumentList '/c', "npm run start:internal:local > `"$LogFile`" 2>&1" `
        -WorkingDirectory $root -WindowStyle Hidden -PassThru

    $ready = $false
    foreach ($attempt in 1..40) {
        Start-Sleep -Milliseconds 500
        if (Test-ServerUp) { $ready = $true; break }
        if ($startedByUs.HasExited) { break }
    }

    if (-not $ready) {
        $tail = if (Test-Path $LogFile) { (Get-Content $LogFile -Tail 12) -join "`n" } else { '(no output)' }
        if ($startedByUs -and -not $startedByUs.HasExited) { Stop-Process -Id $startedByUs.Id -Force -ErrorAction SilentlyContinue }
        Fail "The Internal Management System could not start.`n`nLast output:`n$tail"
    }
}

# -- Open the window -------------------------------------------------------
# --app strips the address bar and the tabs. Edge first because it ships with
# Windows 11; Chrome accepted for machines that only have that.
$browser = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $browser) {
    if ($startedByUs) { Stop-Process -Id $startedByUs.Id -Force -ErrorAction SilentlyContinue }
    Fail "Neither Microsoft Edge nor Google Chrome was found. One of them is needed for the application window."
}

# A separate user-data-dir keeps this out of the normal browser profile, so the
# staff session does not ride on whoever is signed into Edge, and closing the
# window cannot log someone out of their own browsing.
$profileDir = Join-Path $env:LOCALAPPDATA 'SFSR-Internal-App'

$window = Start-Process -FilePath $browser `
    -ArgumentList "--app=$Url", "--user-data-dir=`"$profileDir`"", '--no-first-run' `
    -PassThru

$window.WaitForExit()

# -- Close the server behind it --------------------------------------------
# Only if this launcher started it. A server that was already running belongs
# to something else -- a terminal, another window -- and stopping it would take
# that down too.
if ($startedByUs -and -not $startedByUs.HasExited) {
    # The npm script sits under cmd.exe, so the node process is a grandchild
    # and dies with the tree rather than with its parent alone.
    Start-Process -FilePath 'taskkill.exe' -ArgumentList '/PID', $startedByUs.Id, '/T', '/F' `
        -WindowStyle Hidden -Wait -ErrorAction SilentlyContinue
}
