@echo off
title SFSR-REMS Internal Management System

rem ---------------------------------------------------------------------------
rem  Starts the Internal Management System on THIS MACHINE ONLY.
rem
rem  Binds 127.0.0.1:3001, so nothing on the office network or the WiFi can
rem  reach it. The LAN-facing form is a different script -- npm run
rem  start:internal, which binds 0.0.0.0 -- and is the one described in
rem  README section 5. Do not "fix" this file to use that; the whole point of
rem  it is that it does not listen on the network.
rem
rem  Double-click to run. Pass --rebuild to force a fresh production build.
rem ---------------------------------------------------------------------------

pushd "%~dp0"

echo.
echo   SFSR-REMS - Internal Management System
echo   ======================================
echo.

rem -- Is Node installed? -----------------------------------------------------
where node >nul 2>&1
if errorlevel 1 (
  echo   [FAIL] Node.js was not found on this machine.
  echo          Install Node 22.x from https://nodejs.org then run this again.
  goto :fail
)
for /f "delims=" %%v in ('node --version') do set "NODE_VERSION=%%v"
echo   [ ok ] Node %NODE_VERSION%

rem -- Is the environment file there? ------------------------------------------
rem  Both apps read one .env.local at the repository root. Without it the app
rem  starts and then fails on the first Firestore call, which is a far more
rem  confusing way to find out.
if not exist ".env.local" (
  echo   [FAIL] .env.local is missing from the project folder.
  echo          Copy .env.example to .env.local and fill it in first.
  goto :fail
)
echo   [ ok ] .env.local found

rem -- Are dependencies installed? ---------------------------------------------
if not exist "node_modules" (
  echo   [ .. ] Installing dependencies. This happens once and takes a while.
  call npm install
  if errorlevel 1 (
    echo   [FAIL] npm install did not finish. Scroll up for the reason.
    goto :fail
  )
)
echo   [ ok ] Dependencies installed

rem -- Build, unless a usable one is already there ------------------------------
set "NEEDS_BUILD=0"
if not exist "apps\internal\.next" set "NEEDS_BUILD=1"
if /i "%~1"=="--rebuild" set "NEEDS_BUILD=1"

if "%NEEDS_BUILD%"=="1" (
  echo   [ .. ] Building the internal app. One or two minutes.
  call npm run build:internal
  if errorlevel 1 (
    echo   [FAIL] The build did not finish. Scroll up for the reason.
    goto :fail
  )
  echo   [ ok ] Build complete
) else (
  echo   [ ok ] Using the existing build ^(run with --rebuild to replace it^)
)

rem -- Serve --------------------------------------------------------------------
echo.
echo   Starting on http://127.0.0.1:3001
echo   This machine only - nobody else on the network can open it.
echo.
echo   Leave this window open. Press Ctrl+C or close it to stop the server.
echo.

rem  Open the browser a few seconds behind the server, in a detached window, so
rem  the user does not land on a connection-refused page while Next boots.
start "SFSR" /min cmd /c "timeout /t 8 >nul & start http://127.0.0.1:3001"

call npm run start:internal:local

rem  Reached when the server stops -- normally Ctrl+C, but also on a crash, so
rem  hold the window open rather than letting the error scroll past and vanish.
echo.
echo   Server stopped.
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
