#!/usr/bin/env bash
# ============================================================
#  SL-Translate - stop the website (stops the background server).
#  Start it again with:  ./start.sh
# ============================================================
set -u
cd "$(dirname "$0")"

PORT="${PORT:-8000}"

IS_WINDOWS=0
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) IS_WINDOWS=1 ;;
esac

echo "[stop] stopping the SL-Translate server on port $PORT ..."
STOPPED=0

if [ "$IS_WINDOWS" = "1" ]; then
  # kill whatever listens on the port (taskkill works from Git Bash)
  PIDS=$(netstat -ano 2>/dev/null | grep -E "LISTENING" | grep -E ":$PORT[[:space:]]" | awk '{print $NF}' | sort -u)
  for p in $PIDS; do
    taskkill //PID "$p" //F >/dev/null 2>&1 && STOPPED=1
  done
else
  # 1) by pidfile written by start.sh
  if [ -f .server.pid ]; then
    PID=$(cat .server.pid 2>/dev/null || true)
    if [ -n "${PID:-}" ] && kill "$PID" 2>/dev/null; then STOPPED=1; fi
  fi
  # 2) fallback: whoever listens on the port
  if command -v lsof >/dev/null 2>&1; then
    PIDS=$(lsof -ti tcp:"$PORT" 2>/dev/null || true)
  elif command -v fuser >/dev/null 2>&1; then
    fuser -k "$PORT/tcp" >/dev/null 2>&1 && STOPPED=1
    PIDS=""
  else
    PIDS=""
  fi
  for p in ${PIDS:-}; do
    kill "$p" 2>/dev/null || kill -9 "$p" 2>/dev/null
    STOPPED=1
  done
fi

rm -f .server.pid

if [ "$STOPPED" = "1" ]; then
  echo "[stop] server stopped."
else
  echo "[stop] no server was running on port $PORT."
fi
echo ""
echo "  Open again : ./start.sh"
