#!/usr/bin/env bash
# Superset workspace setup: runs inside each new git worktree.
set -euo pipefail

WORKTREE="$(git rev-parse --show-toplevel)"
# --git-common-dir points at the main checkout's .git; its parent is the main repo folder.
MAIN_REPO="$(cd "$(git rev-parse --git-common-dir)/.." && pwd)"
cd "$WORKTREE"

# 1. Env: copy .env from the main checkout (it's gitignored, so worktrees don't get it).
if [ "$MAIN_REPO" != "$WORKTREE" ] && [ -f "$MAIN_REPO/.env" ]; then
  cp "$MAIN_REPO/.env" .env
  echo "Copied .env from $MAIN_REPO"
elif [ ! -f .env ]; then
  cp .env.example .env
  echo "No .env in main repo; created .env from .env.example"
fi

# 2. Backend: Python venv + pip (see README "Local setup").
echo "Installing backend dependencies..."
[ -d backend/.venv ] || python3 -m venv backend/.venv
backend/.venv/bin/pip install --quiet --upgrade pip
backend/.venv/bin/pip install --quiet -r backend/requirements.txt

# 3. Frontend: npm (package-lock.json).
echo "Installing frontend dependencies..."
(cd frontend && npm ci --no-audit --no-fund)

echo "Workspace setup complete."
