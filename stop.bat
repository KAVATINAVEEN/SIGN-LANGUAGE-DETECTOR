@echo off
REM ============================================================
REM  SL-Translate - stop the website (stops the backend server).
REM  Start it again with:  start.bat
REM ============================================================
setlocal
if not defined PORT set "PORT=8000"

echo [stop] stopping the SL-Translate server on port %PORT% ...
powershell -NoProfile -Command "$found = $false; $list = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue; if ($list) { $found = $true; $list | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }; Start-Sleep -Milliseconds 700; Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'cmd.exe' -and $_.CommandLine -match 'uvicorn backend\.main' -and $_.CommandLine -match '--port %PORT%' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; if ($found) { Write-Host '[stop] server stopped.' } else { Write-Host '[stop] no server was running on port %PORT%.' }"

echo.
echo   Open again : start.bat
timeout /t 4 >nul
exit /b 0
