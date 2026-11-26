@echo off
rem StudyRemind: double-click to start the server and open the browser.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Install the LTS version from https://nodejs.org
  pause
  exit /b 1
)
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000"
node server\index.js
pause
