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
# 127.0.0.1 only, on a port of its own. Not 0.0.0.0 -- nothing on the network can
# reach it, which is checked by `npm run start:internal:app`, not decided
# here. The LAN-facing form is a separate script and stays that way.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$Port = 3101
$Url = "http://127.0.0.1:$Port"
$LogFile = Join-Path $env:TEMP 'sfsr-internal.log'

$shell = New-Object -ComObject WScript.Shell

# -- Who reads these messages ----------------------------------------------
#
# Documentation clerks, billing staff, a cashier. Not developers. Every message
# below is written for someone who did not install this, cannot fix it, and
# should not be asked to try -- so each one says what happened in plain words
# and then points at the person who CAN fix it.
#
# The technical detail is kept, but underneath, prefixed, and clearly aimed at
# whoever gets called. A message that only says "contact IT" wastes the trip;
# one that only says ".env.local is missing" wastes the reader.
function Fail([string]$plain, [string]$detail) {
    # 16 = error icon. Silent is right until something goes wrong; a launcher
    # that fails without saying so is worse than one that shows a console.
    $text = $plain + "`n`n" + '--------------------------------------' +
            "`nFor your IT administrator:`n" + $detail
    [void]$shell.Popup($text, 0, 'St. Francis Square Realty', 16)
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
    Fail ("This computer is not ready to run the Internal Management System yet." +
          "`n`nPlease ask your IT administrator to finish setting it up. Nothing is wrong with your work or your account.") `
         ("Node.js is not installed, or not on PATH. Install Node 22 from https://nodejs.org, then run create-internal-shortcut.bat again.")
}

if (-not (Test-Path (Join-Path $root '.env.local'))) {
    Fail ("This computer is not authorised to open the Internal Management System." +
          "`n`nPlease ask your IT administrator to set it up for you.") `
         (".env.local is missing from $root - it holds the Firebase and Cloudinary credentials. Copy .env.example to .env.local and fill it in. This file is deliberately not distributed with the project: it is what decides which machines may run the system.")
}

# First-run setup is deliberately NOT silent. Installing and building takes
# minutes, and a hidden window doing that looks like nothing happened, so the
# visible script handles it and this one only runs the everyday path.
if (-not (Test-Path (Join-Path $root 'node_modules')) -or
    -not (Test-Path (Join-Path $root 'apps\internal\.next'))) {
    [void]$shell.Popup(
        ("Setting up this computer for the first time." +
         "`n`nA window will open and show the progress. This takes a few minutes and only happens once -- please leave it running." +
         "`n`nAfter it finishes, open this icon again."),
        0, 'St. Francis Square Realty', 64)
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
        Fail ("The Internal Management System could not start." +
              "`n`nPlease try again. If it still will not open, report it to your IT administrator and show them this message.") `
             ("The server did not answer on $Url within 20 seconds. Full log: $LogFile`n`nLast output:`n$tail")
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
    Fail ("This computer is missing a program the system needs to display." +
          "`n`nPlease ask your IT administrator to install Microsoft Edge.") `
         ("Neither msedge.exe nor chrome.exe was found in Program Files. One of them provides the --app window.")
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
