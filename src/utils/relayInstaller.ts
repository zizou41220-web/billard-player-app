/**
 * Génère et télécharge un lanceur autonome Windows (.bat) pour démarrer le Relais Live
 * Facebook & YouTube sur N'IMPORTE QUEL PC Windows sans avoir le dossier du projet,
 * sans droits administrateur, et sans installer Node.js ni FFmpeg manuellement.
 */

const GITHUB_RAW_RELAY_URL =
  'https://raw.githubusercontent.com/zizou41220-web/billard-player-app/main/server/rtmp-relay.mjs';

export function buildPortableRelayBatContent(appBaseUrl?: string): string {
  const cleanBase = (appBaseUrl || '').trim().replace(/\/+$/, '');
  const primaryRelayUrl =
    cleanBase && /^https?:\/\//i.test(cleanBase)
      ? `${cleanBase}/rtmp-relay.mjs`
      : GITHUB_RAW_RELAY_URL;

  const lines = [
    '@echo off',
    'chcp 65001 >nul',
    'setlocal EnableDelayedExpansion',
    'title MonClubBillard - Relais Live Portable (Facebook & YouTube)',
    '',
    'set "MCB_DIR=%USERPROFILE%\\.local\\mcb-relay"',
    'set "NODE_DIR=%MCB_DIR%\\node-v20.18.0-win-x64"',
    'set "NODE_ZIP=%MCB_DIR%\\node.zip"',
    'set "RELAY_JS=%MCB_DIR%\\rtmp-relay.mjs"',
    `set "RELAY_URL_PRIMARY=${primaryRelayUrl}"`,
    `set "RELAY_URL_FALLBACK=${GITHUB_RAW_RELAY_URL}"`,
    'set "NODE_URL=https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip"',
    '',
    'if not exist "%MCB_DIR%" mkdir "%MCB_DIR%"',
    '',
    'echo.',
    'echo  ================================================================',
    'echo     MONCLUBBILLARD - RELAIS LIVE PORTABLE (FACEBOOK ^& YOUTUBE)',
    'echo  ================================================================',
    'echo.',
    'echo  Ce relais fonctionne sur n\'importe quel PC Windows sans installation.',
    'echo  NE FERMEZ PAS cette fenetre pendant votre diffusion Live.',
    'echo.',
    '',
    'REM 1. Rechercher Node.js existant ou installer Node.js portable dans le dossier utilisateur',
    'set "NODE_BIN="',
    'if exist "%NODE_DIR%\\node.exe" set "NODE_BIN=%NODE_DIR%\\node.exe"',
    'if not defined NODE_BIN if exist "%USERPROFILE%\\.local\\node\\node-v20.12.2-win-x64\\node.exe" set "NODE_BIN=%USERPROFILE%\\.local\\node\\node-v20.12.2-win-x64\\node.exe"',
    'if not defined NODE_BIN if exist "%LOCALAPPDATA%\\ms-playwright-go\\1.57.0\\node.exe" set "NODE_BIN=%LOCALAPPDATA%\\ms-playwright-go\\1.57.0\\node.exe"',
    'if not defined NODE_BIN (',
    '  for /f "delims=" %%I in (\'where node 2^>nul\') do if not defined NODE_BIN set "NODE_BIN=%%I"',
    ')',
    '',
    'if not defined NODE_BIN (',
    '  echo  [1/3] Installation automatique de Node.js portable (1 seule fois, ~25 Mo)...',
    '  curl.exe -fL --progress-bar "%NODE_URL%" -o "%NODE_ZIP%"',
    '  if errorlevel 1 (',
    '    echo.',
    '    echo  [ERREUR] Impossible de telecharger Node.js. Verifiez votre connexion Internet.',
    '    pause',
    '    exit /b 1',
    '  )',
    '  echo  Extraction de Node.js...',
    '  tar -xf "%NODE_ZIP%" -C "%MCB_DIR%" 2>nul',
    '  if not exist "%NODE_DIR%\\node.exe" (',
    '    powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path \'%NODE_ZIP%\' -DestinationPath \'%MCB_DIR%\' -Force"',
    '  )',
    '  del /q "%NODE_ZIP%" 2>nul',
    '  if exist "%NODE_DIR%\\node.exe" set "NODE_BIN=%NODE_DIR%\\node.exe"',
    ')',
    '',
    'if not defined NODE_BIN (',
    '  echo.',
    '  echo  [ERREUR] Node.js introuvable apres installation.',
    '  pause',
    '  exit /b 1',
    ')',
    '',
    'REM 2. Telecharger ou mettre a jour le script Relais Live',
    'echo  [2/3] Mise a jour du script Relais Live...',
    'curl.exe -fsSL "%RELAY_URL_PRIMARY%" -o "%RELAY_JS%.tmp" 2>nul',
    'if errorlevel 1 (',
    '  curl.exe -fsSL "%RELAY_URL_FALLBACK%" -o "%RELAY_JS%.tmp" 2>nul',
    ')',
    'if not errorlevel 1 (',
    '  if exist "%RELAY_JS%.tmp" move /y "%RELAY_JS%.tmp" "%RELAY_JS%" >nul',
    ') else (',
    '  if exist "%RELAY_JS%.tmp" del /q "%RELAY_JS%.tmp" 2>nul',
    ')',
    '',
    'if not exist "%RELAY_JS%" (',
    '  echo.',
    '  echo  [ERREUR] Impossible de telecharger le script Relais Live.',
    '  echo  Verifiez votre connexion Internet puis relancez ce fichier.',
    '  pause',
    '  exit /b 1',
    ')',
    '',
    'REM 3. Demarrer le Relais Live (FFmpeg sera telecharge automatiquement si besoin)',
    'echo  [3/3] Demarrage du Relais Live sur ws://127.0.0.1:8765 ...',
    'echo  Retournez dans votre navigateur : le voyant va passer au VERT ("Relais PC pret").',
    'echo.',
    '"%NODE_BIN%" "%RELAY_JS%"',
    'echo.',
    'pause'
  ];

  return lines.join('\r\n') + '\r\n';
}

export function downloadPortableRelayBat(appBaseUrl?: string): void {
  const content = buildPortableRelayBatContent(appBaseUrl);
  const blob = new Blob([content], { type: 'application/x-msdos-program;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Lancer-Relais-Live-MonClubBillard.bat';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}
