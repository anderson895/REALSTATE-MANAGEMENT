@echo off
title SFSR-REMS - Create Internal System shortcut

rem ---------------------------------------------------------------------------
rem  Puts a desktop shortcut on this machine that opens the Internal Management
rem  System as an application: the company logo on the icon, its own window with
rem  no address bar and no tabs, and no terminal left sitting behind it.
rem
rem  Run this ONCE per machine. After that the shortcut is what gets used.
rem
rem  The shortcut points at internal-app.ps1, which brings the LOCAL server up,
rem  waits for it, opens the window, and stops the server again when the window
rem  is closed. Nothing is deployed and nothing is exposed: the server binds
rem  127.0.0.1, so no other machine on the network can reach it.
rem ---------------------------------------------------------------------------

pushd "%~dp0"

set "LAUNCHER=%~dp0internal-app.ps1"
set "ICON=%~dp0apps\internal\public\sfsr-internal.ico"
set "LINK=%USERPROFILE%\Desktop\SFSR Internal System.lnk"

echo.
echo   SFSR-REMS - Internal Management System
echo   ======================================
echo.

if not exist "%LAUNCHER%" (
  echo   [FAIL] internal-app.ps1 is missing from this folder.
  echo          Run this from inside the project.
  goto :fail
)
echo   [ ok ] Launcher found

if not exist "%ICON%" (
  echo   [FAIL] The icon is missing:
  echo          %ICON%
  goto :fail
)
echo   [ ok ] Icon found

rem -- A browser is needed for the app-style window ----------------------------
set "BROWSER="
for %%P in (
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
) do if not defined BROWSER if exist %%P set "BROWSER=%%~P"

rem  Deliberately NOT reported inside an if/else block. The path holds
rem  "Program Files (x86)", and the ")" in that closes a parenthesised block
rem  early -- cmd answers "\Microsoft\Edge\Application\msedge.exe was
rem  unexpected at this time" and the script dies before writing the shortcut.
if not defined BROWSER goto :nobrowser
echo   [ ok ] Browser found
goto :makelink

:nobrowser
echo   [WARN] Neither Edge nor Chrome was found on this machine.
echo          The shortcut will still be created, but it cannot open a
echo          window until one of them is installed.

:makelink

rem -- Create the shortcut -----------------------------------------------------
rem  Hidden PowerShell, so double-clicking shows the application and nothing
rem  else. -ExecutionPolicy Bypass because the default policy refuses unsigned
rem  local scripts, and this one is read straight from the project folder.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut('%LINK%');" ^
  "$s.TargetPath = 'powershell.exe';" ^
  "$s.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"%LAUNCHER%\"';" ^
  "$s.WorkingDirectory = '%~dp0';" ^
  "$s.IconLocation = '%ICON%,0';" ^
  "$s.Description = 'St. Francis Square Realty - Internal Management System';" ^
  "$s.WindowStyle = 7;" ^
  "$s.Save()"

if errorlevel 1 (
  echo   [FAIL] The shortcut could not be created.
  goto :fail
)

echo   [ ok ] Shortcut created on your Desktop
echo.
echo   "SFSR Internal System" is now on your Desktop.
echo.
echo   Double-click it and the system opens in its own window. The first
echo   launch after a fresh copy of the project takes a few minutes, because
echo   it installs and builds; every launch after that is quick.
echo.
popd
echo   Press any key to close.
pause >nul
exit /b 0

:fail
echo.
popd
echo   Press any key to close.
pause >nul
exit /b 1
