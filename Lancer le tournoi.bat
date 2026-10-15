@echo off
chcp 65001 >nul
title Billard Club 41 - Serveur du tournoi
cd /d "%~dp0"
set "PATH=%USERPROFILE%\.local\node\node-v20.12.2-win-x64;%PATH%"

echo.
echo  ==============================================
echo     BILLARD CLUB 41 - Lancement du tournoi
echo  ==============================================
echo.
echo  NE FERMEZ PAS cette fenetre pendant le tournoi.
echo  Le QR code "rejoindre l'application" s'affiche
echo  dans la Vue d'ensemble pour les smartphones.
echo.

if not exist node_modules (
  echo  Premiere installation, patientez...
  call npm install
)

rem Ouvre le navigateur sur le PC apres quelques secondes
start "" /min cmd /c "timeout /t 5 >nul & start https://localhost:5173/"

call npm run dev
pause
