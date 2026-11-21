@echo off
chcp 65001 >nul
title MonClubBillard - Relais Live Facebook & YouTube
cd /d "%~dp0"
set "PATH=%USERPROFILE%\.local\node\node-v20.12.2-win-x64;%LOCALAPPDATA%\ms-playwright-go\1.57.0;%PATH%"

echo.
echo  =========================================================
echo     RELAIS LIVE FACEBOOK ^& YOUTUBE (MonClubBillard)
echo  =========================================================
echo.
echo  Ce relais permet de diffuser vos lives Facebook et YouTube
echo  directement depuis https://zizou41220-web.github.io
echo  NE FERMEZ PAS cette fenetre pendant votre diffusion Live.
echo.

node server/rtmp-relay.mjs
pause
