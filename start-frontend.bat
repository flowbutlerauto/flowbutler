@echo off
netstat -ano | findstr :3001 >nul
if %errorlevel%==0 (
  echo Frontend already running on port 3001
  exit /b 0
)
cd /d C:\Flowbutler\public
npx serve . -l 3001