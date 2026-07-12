#!/usr/bin/env bash
# Corrida diaria del pipeline (pensado para cron). Uso: ./run_pipeline.sh [--backfill]
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"
mkdir -p logs

exec >> "logs/pipeline_$(date +%F).log" 2>&1
echo "===== corrida $(date '+%F %T') ====="
~/.local/bin/uv run python -m src.main "$@"
