@echo off
setlocal
title LAM AI Motion Studio
cd /d "%~dp0"

set "OPEN_PATH="
if /i "%~1"=="canvas2d" set "OPEN_PATH=/canvas2d-prototype.html"
if /i "%~1"=="asset2d" set "OPEN_PATH=/asset-animation-prototype.html"

set "NODE_EXE="
where node.exe >nul 2>nul
if not errorlevel 1 set "NODE_EXE=node.exe"
if not defined NODE_EXE if exist "D:\App\nodejs\node.exe" set "NODE_EXE=D:\App\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\OpenAI\Codex\runtimes\cua_node\9c26d707817e90a7\bin\node.exe" set "NODE_EXE=%LOCALAPPDATA%\OpenAI\Codex\runtimes\cua_node\9c26d707817e90a7\bin\node.exe"

if not defined NODE_EXE (
  echo [ERROR] Node.js was not found.
  echo Install Node.js 20 or newer, then run this file again.
  echo https://nodejs.org/
  pause
  exit /b 1
)

for /f "tokens=1 delims=.v" %%V in ('"%NODE_EXE%" --version') do set "NODE_MAJOR=%%V"
if not defined NODE_MAJOR (
  echo [ERROR] Could not determine the Node.js version.
  pause
  exit /b 1
)
if %NODE_MAJOR% LSS 20 (
  echo [ERROR] Node.js 20 or newer is required. Found version:
  "%NODE_EXE%" --version
  pause
  exit /b 1
)

rem Keep npm's install cache and all app packages inside this project.
set "NPM_CONFIG_CACHE=%~dp0.runtime\npm-cache"
set "NPM_CONFIG_PREFIX=%~dp0.runtime\npm-global"
if not exist ".runtime" mkdir ".runtime"

if exist "package-lock.json" if not exist "node_modules\.package-lock.json" (
  echo [SETUP] Installing project dependencies into the local app folder...
  if exist "node_modules" (
    call npm.cmd install --cache "%NPM_CONFIG_CACHE%" --prefer-offline --no-audit --no-fund
  ) else (
    call npm.cmd ci --cache "%NPM_CONFIG_CACHE%" --prefer-offline --no-audit --no-fund
  )
  if errorlevel 1 goto install_failed
)

echo [START] Starting LAM AI Motion Studio at http://127.0.0.1:4173/
netstat -ano | findstr /R /C:":4173 .*LISTENING" >nul
if not errorlevel 1 (
  if defined OPEN_PATH (
    start "" "http://127.0.0.1:4173%OPEN_PATH%"
    exit /b 0
  )
  echo [ERROR] Port 4173 is already in use.
  echo Close the other LAM AI Motion Studio server, or stop the process using port 4173.
  echo This launcher will not terminate another process.
  goto failed
)
if not exist "logs" mkdir "logs"
echo [%date% %time%] Starting server with "%NODE_EXE%" > "logs\run.log"
echo Browser opens after the server is ready. Keep this window open while using the app.
set "LAM_STUDIO_OPEN_BROWSER=1"
if defined OPEN_PATH set "LAM_STUDIO_OPEN_PATH=%OPEN_PATH%"
"%NODE_EXE%" "%~dp0server.mjs"
set "SERVER_EXIT=%errorlevel%"
echo.
echo [ERROR] The local server stopped with exit code %SERVER_EXIT%.
echo Recent log:
type "logs\run.log"
goto failed

:install_failed
echo.
echo [ERROR] Dependency installation failed.
echo This project needs network access or packages already present in its local npm cache.
echo The app files were kept unchanged. Check the npm error above and run run.bat again.
:failed
echo.
echo Press any key to close this window.
pause
exit /b 1
