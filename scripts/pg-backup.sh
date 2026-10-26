#!/bin/bash
# PostgreSQL backup script for CuraVet
# Usage: ./pg-backup.sh
# This script creates a compressed pg_dump of the PostgreSQL database
# and stores it in the backups directory.

set -e

# Configuration
BACKUP_DIR="${PG_BACKUP_DIR:-./backups}"
PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5433}"
PG_USER="${PG_USER:-curavet}"
PG_DATABASE="${PG_DATABASE:-curavet}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/curavet_${TIMESTAMP}.sql.gz"

# Create backup directory if it doesn't exist
mkdir -p "${BACKUP_DIR}"

# Create pg_dump backup
echo "Starting backup of PostgreSQL ${PG_USER}@${PG_HOST}:${PG_PORT}/${PG_DATABASE}..."
pg_dump -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" "${PG_DATABASE}" | gzip > "${BACKUP_FILE}"

if [ $? -eq 0 ]; then
    echo "Backup completed: ${BACKUP_FILE}"
    # Remove backups older than 30 days
    find "${BACKUP_DIR}" -name "curavet_*.sql.gz" -mtime +30 -delete
    echo "Old backups cleaned (kept last 30 days)."
else
    echo "Backup FAILED!"
    exit 1
fi