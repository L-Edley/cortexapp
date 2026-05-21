#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../aion-core"
source .venv/Scripts/activate
export PYTHONPATH=src
exec python -m uvicorn aion.main:app --host 127.0.0.1 --port 8000 --reload
