@echo off
title SFSR-REMS - Create Internal System shortcut

rem ---------------------------------------------------------------------------
rem  Puts a desktop shortcut on this machine that opens the Internal Management
rem  System in its own window -- no address bar, no tabs, the company logo on
rem  the icon and in the taskbar.
rem
rem  Run this ONCE per machine. After that the shortcut is what gets used.
rem
rem  WHAT THIS IS NOT: a security control. The shortcut only opens a URL, and
rem  the same URL typed into any browser reaches the same page. Access is held
rem  by the employee login and the RBAC matrix behind it, not by this file.
rem
rem  Usage:
rem    create-internal-shortcut.bat                 uses the URL set below
rem    create-internal-shortcut.bat https://...     uses the one you pass
rem ---------------------------------------------------------------------------

rem  EDIT THIS after the internal system is deployed. Until then it points at a
rem  local server, which is what run-internal.bat starts.
set "APP_URL=http://127.0.0.1:3001"

if not "%~1"=="" set "APP_URL=%~1"

pushd "%~dp0"
set "ICON=%~dp0apps\internal\public\sfsr-internal.ico"

echo.
echo   SFSR-REMS - Internal Management System
echo   ======================================
echo.
echo   Target : %APP_URL%
echo.

if not exist "%ICON%" (
  echo   [FAIL] The icon is missing:
  echo          %ICON%
  echo          Run this from inside the project folder.
  goto :fail
)

rem -- Which browser can do app mode? -----------------------------------------
rem  --app opens a chromeless window. Edge ships with Windows 11, so it is
rem  tried first; Chrome is accepted because some machines have only that.
set "BROWSER="
for %%P in (
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
) do if not defined BROWSER if exist %%P set "BROWSER=%%~P"

if not defined BROWSER (
  echo   [FAIL] Neither Microsoft Edge nor Google Chrome was found.
  echo          One of them is needed for the app-style window.
  goto :fail
)
echo   [ ok ] Browser: %BROWSER%

rem -- Create the shortcut -----------------------------------------------------
set "LINK=%USERPROFILE%\Desktop\SFSR Internal System.lnk"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut('%LINK%');" ^
  "$s.TargetPath = '%BROWSER%';" ^
  "$s.Arguments = '--app=%APP_URL%';" ^
  "$s.IconLocation = '%ICON%,0';" ^
  "$s.Description = 'St. Francis Square Realty - Internal Management System';" ^
  "$s.WindowStyle = 1;" ^
  "$s.Save()"

if errorlevel 1 (
  echo   [FAIL] The shortcut could not be created.
  goto :fail
)

echo   [ ok ] Shortcut created on your Desktop
echo.
echo   "SFSR Internal System" is now on the Desktop. Double-click it to open
echo   the system in its own window.
echo.
echo   If the address changes, run this again with the new one:
echo       create-internal-shortcut.bat https://your-address-here
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
