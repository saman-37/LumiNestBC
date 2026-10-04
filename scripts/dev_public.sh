#!/usr/bin/env bash
# Build the frontend and serve the whole app (API + PWA + voice audio) from one port, so a
# single tunnel exposes everything:   scripts/dev_public.sh   then   ngrok http 8000
# See README "Test the real phone line".
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-8000}"
echo "==> building frontend (VITE_API_URL empty = same origin)"
(cd frontend && VITE_API_URL= npm run build)

# Use the first venv interpreter that has the backend's packages installed.
PY=""
for candidate in backend/.venv/bin/python backend/.venv/bin/python3 backend/.venv/bin/python3.12; do
  if [ -x "$candidate" ] && "$candidate" -c "import flask_socketio, twilio" 2>/dev/null; then
    PY="$candidate"; break
  fi
done
[ -n "$PY" ] || { echo "backend venv missing packages: cd backend && pip install -r requirements.txt"; exit 1; }
echo "==> starting backend on http://localhost:${PORT} (serving frontend/dist)"
echo "    BACKEND_PUBLIC_URL and TAG_BASE_URL in .env must be your public tunnel URL for phone tests."
cd backend
exec "../$PY" run.py
