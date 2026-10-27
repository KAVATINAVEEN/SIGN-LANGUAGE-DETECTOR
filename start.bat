@echo off
REM ============================================================
REM  SL-Translate - start the complete website (backend +
REM  frontend) and open it in the browser.
REM  Stop it again with:  stop.bat
REM ============================================================
setlocal
cd /d "%~dp0"
title SL-Translate launcher

if not defined PORT set "PORT=8000"
set "URL=http://127.0.0.1:%PORT%"

echo ============================================
echo   SL-Translate  -  real-time ASL recognition
echo ============================================
echo.

REM ---- already running? then just open the browser ----
powershell -NoProfile -Command "try { $r = Invoke-WebRequest '%URL%/api/health' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1" >nul 2>&1
if not errorlevel 1 (
  echo [run] server already running - opening %URL%
  if not defined SL_NO_BROWSER start "" "%URL%"
  echo.
  echo   Close : stop.bat
  timeout /t 4 >nul
  exit /b 0
)

REM ---- first run: virtualenv ----
where python >nul 2>&1
if errorlevel 1 (
  echo [error] Python was not found in PATH. Install Python 3.10+ and try again.
  goto :fail
)
if not exist ".venv\Scripts\python.exe" (
  echo [setup] creating virtual environment...
  python -m venv .venv
  if errorlevel 1 goto :fail
)

REM ---- first run: dependencies ----
.venv\Scripts\python.exe -c "import fastapi, uvicorn, torch, mediapipe" 2>nul
if errorlevel 1 (
  echo [setup] installing dependencies ^(first run only, a few minutes^)...
  .venv\Scripts\python.exe -m pip install --progress-bar off torch torchvision --extra-index-url https://download.pytorch.org/whl/cpu
  if errorlevel 1 goto :fail
  .venv\Scripts\python.exe -m pip install --progress-bar off -r backend\requirements.txt
  if errorlevel 1 goto :fail
)

REM ---- first run: model assets ----
if not exist "backend\models\best_model.pth" (
  echo [setup] downloading model assets ^(~52 MB^)...
  .venv\Scripts\python.exe -m backend.download_models
  if errorlevel 1 goto :fail
)

REM ---- start the server (its console window shows the live logs) ----
echo [run] starting server on %URL% ...
start "SL Translate server" cmd /k ".venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port %PORT%"

REM ---- wait until the model is loaded, then open the browser ----
echo [run] waiting for the model to load...
powershell -NoProfile -Command "for ($i = 0; $i -lt 120; $i++) { try { $r = Invoke-WebRequest '%URL%/api/health' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; Start-Sleep -Milliseconds 500 }; exit 1"
if errorlevel 1 (
  echo [warn] server did not answer in time - opening the browser anyway...
) else (
  echo [run] server is up.
)

if not defined SL_NO_BROWSER start "" "%URL%"

echo.
echo   Website    : %URL%
echo   Open again : start.bat
echo   Close      : stop.bat
echo.
timeout /t 5 >nul
exit /b 0

:fail
echo.
echo [error] setup failed - fix the messages above and re-run start.bat
pause
exit /b 1
