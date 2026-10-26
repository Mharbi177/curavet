#!/bin/bash
# PostgreSQL restore script for CuraVet
# Usage: ./pg-restore.sh <backup_file>
# This script restores a PostgreSQL database from a compressed pg_dump backup.

set -e

if [ -z "$1" ]; then
    echo "Usage: ./pg-restore.sh <backup_file>"
    exit 1
fi

BACKUP_FILE="$1"

# Configuration
PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5433}"
PG_USER="${PG_USER:-curavet}"
PG_DATABASE="${PG_DATABASE:-curavet}"

echo "Starting restore of PostgreSQL ${PG_USER}@${PG_HOST}:${PG_PORT}/${PG_DATABASE} from ${BACKUP_FILE}..."

# Decompress and restore
zcat "${BACKUP_FILE}" | psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" "${PG_DATABASE}"

if [ $? -eq 0 ]; then
    echo "Restore completed successfully."
else
    echo "Restore FAILED!"
    exit 1
fi