#!/usr/bin/env bash
# astro-data jobs — pipeline automático (cron cada 2h)
set -euo pipefail

PROJECT_DIR="/home/pxtroniwnl/Documents/projects/personal/portfolio/astrodata-jobs"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/pipeline_$(date +%Y-%m-%d_%H%M).log"

mkdir -p "$LOG_DIR"

echo "=== astro-data jobs pipeline — $(date) ===" | tee "$LOG_FILE"
cd "$PROJECT_DIR"
uv run python -m src.main 2>&1 | tee -a "$LOG_FILE"
echo "=== Fin: $(date) ===" | tee -a "$LOG_FILE"

# Limpiar logs de hace más de 30 días
find "$LOG_DIR" -name "pipeline_*.log" -mtime +30 -delete 2>/dev/null || true
