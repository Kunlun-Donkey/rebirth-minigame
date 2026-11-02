@echo off
setlocal
cd /d "%~dp0"
title Rebirth - CLI Play
rem Chinese menu lives in tools\menu.mjs (cmd garbles UTF-8 text in .bat files)
where node 1>nul 2>nul
if errorlevel 1 goto nonode
node tools\menu.mjs
exit /b %errorlevel%
:nonode
echo [ERROR] Node.js not found. Please install Node.js 18+ from https://nodejs.org/
pause
exit /b 1
