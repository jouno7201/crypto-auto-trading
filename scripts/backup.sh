#!/bin/bash
# 일일 자동 백업 스크립트
# crontab -e → 0 3 * * * /path/to/scripts/backup.sh
#
# 최근 7일 백업 유지, 이전 백업 자동 삭제

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="${SCRIPT_DIR}/../data"
BACKUP_DIR="${SCRIPT_DIR}/../backups"

mkdir -p "$BACKUP_DIR"

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/backup_${DATE}.tar.gz"

# Create backup
tar -czf "$BACKUP_FILE" -C "$(dirname "$DATA_DIR")" "$(basename "$DATA_DIR")" 2>/dev/null

echo "[$(date)] Backup created: ${BACKUP_FILE} ($(du -h "$BACKUP_FILE" | cut -f1))"

# Remove backups older than 7 days
find "$BACKUP_DIR" -name "backup_*.tar.gz" -mtime +7 -delete 2>/dev/null || true

echo "[$(date)] Old backups cleaned. Current backups:"
ls -lh "$BACKUP_DIR"/backup_*.tar.gz 2>/dev/null || echo "  (none)"
