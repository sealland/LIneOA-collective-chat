@echo off
cd /d "%~dp0.."

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo [ERROR] Node.js not found. Install Node 18+ from https://nodejs.org
  echo.
  pause
  exit /b 1
)

if not exist "session-helper\config.json" (
  echo.
  echo [ERROR] Missing session-helper\config.json
  echo Copy config.json.example to config.json and set serverUrl + uploadToken
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo.
  echo Installing project dependencies ^(first run, may take a few minutes^)...
  call npm install
  if errorlevel 1 (
    echo npm install failed
    pause
    exit /b 1
  )
)

if not exist "node_modules\playwright" (
  echo.
  echo [ERROR] Playwright not installed. Run: npm install
  echo Do not use npm install --omit=dev on the admin PC.
  echo.
  pause
  exit /b 1
)

echo Checking Playwright Chromium...
call npx playwright install chromium
if errorlevel 1 (
  echo playwright install failed
  pause
  exit /b 1
)

if not exist "dist\scripts\lineOaConnect.js" (
  if not exist "node_modules\tsx\dist\cli.mjs" (
    echo.
    echo [ERROR] Missing build output and tsx.
    echo Run: npm install
    echo Then: npm run build
    echo.
    pause
    exit /b 1
  )
)

cd session-helper
if not exist "node_modules\electron" (
  echo Installing LINE OA Connect helper ^(first run^)...
  call npm install
  if errorlevel 1 (
    echo npm install failed
    pause
    exit /b 1
  )
)
call npm start
if errorlevel 1 pause
