#!/usr/bin/env bash
# ============================================================
#  SL-Translate - start the complete website (backend +
#  frontend) and open it in the browser.
#  Usage :  ./start.sh
#  Stop  :  ./stop.sh        (the server runs in the background)
# ============================================================
set -u
cd "$(dirname "$0")"

PORT="${PORT:-8000}"
URL="http://127.0.0.1:$PORT"

IS_WINDOWS=0
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) IS_WINDOWS=1 ;;
esac

if [ "$IS_WINDOWS" = "1" ]; then
  PY=".venv/Scripts/python.exe"
else
  PY=".venv/bin/python"
fi

echo "============================================"
echo "  SL-Translate  -  real-time ASL recognition"
echo "============================================"
echo

health_ok() {
  "$PY" -c "import urllib.request; opener = urllib.request.build_opener(urllib.request.ProxyHandler({})); opener.open('$URL/api/health', timeout=2)" >/dev/null 2>&1
}

open_browser() {
  if [ "${SL_NO_BROWSER:-0}" = "1" ]; then return 0; fi
  if [ "$IS_WINDOWS" = "1" ]; then
    cmd.exe //c start "" "$URL" >/dev/null 2>&1
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 &
  elif command -v open >/dev/null 2>&1; then
    open "$URL" >/dev/null 2>&1 &
  else
    echo "[warn] no browser opener found - open $URL manually"
  fi
}

# ---- first run: virtualenv, dependencies, model ----
if [ ! -x "$PY" ]; then
  echo "[setup] creating virtual environment..."
  python3 -m venv .venv 2>/dev/null || python -m venv .venv 2>/dev/null || { echo "[error] Python 3 was not found - install it and try again."; exit 1; }
fi

if ! "$PY" -c "import fastapi, uvicorn, torch, mediapipe" >/dev/null 2>&1; then
  echo "[setup] installing dependencies (first run only, a few minutes)..."
  "$PY" -m pip install --progress-bar off torch torchvision --extra-index-url https://download.pytorch.org/whl/cpu || exit 1
  "$PY" -m pip install --progress-bar off -r backend/requirements.txt || exit 1
fi

if [ ! -f "backend/models/best_model.pth" ]; then
  echo "[setup] downloading model assets (~52 MB)..."
  "$PY" -m backend.download_models || exit 1
fi

# ---- already running? then just open the browser ----
if health_ok; then
  echo "[run] server already running - opening $URL"
  open_browser
  echo
  echo "  Close : ./stop.sh"
  exit 0
fi

# ---- start the server in the background ----
echo "[run] starting server on $URL ..."
nohup "$PY" -m uvicorn backend.main:app --host 127.0.0.1 --port "$PORT" > server.log 2>&1 &
echo $! > .server.pid

echo "[run] waiting for the model to load..."
READY=0
for _ in $(seq 1 60); do
  if health_ok; then READY=1; break; fi
  sleep 1
done

if [ "$READY" = "1" ]; then
  echo "[run] server is up."
else
  echo "[warn] server did not answer in time - check server.log"
fi

open_browser

echo
echo "  Website    : $URL"
echo "  Open again : ./start.sh"
echo "  Close      : ./stop.sh      (logs go to server.log)"
