@echo off
setlocal
cd /d "%~dp0"
echo.
echo =================================================
echo     CHORUS KARAOKE - START YOUR PARTY
echo =================================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Install Node.js from https://nodejs.org/
  echo Then run this file again.
  echo.
  pause
  exit /b 1
)
echo Starting Chorus Karaoke...
echo Open http://localhost:3000 in your web browser.
echo Keep this window running during the karaoke party.
echo.
node server.js
if errorlevel 1 (
  echo.
  echo The server could not start. Check the error above.
  pause
)
