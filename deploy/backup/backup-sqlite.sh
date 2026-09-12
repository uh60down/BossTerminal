#!/bin/sh
# Snapshots the portfolio SQLite database and prunes old snapshots.
# Run as a one-shot container (see docker-compose.prod.yml's `backup`
# service, profile "backup") — it is not meant to stay running.
set -eu

SRC_DB="${SRC_DB:-/data/terminal.db}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

if [ ! -f "$SRC_DB" ]; then
  echo "backup: no database at $SRC_DB yet — nothing to back up"
  exit 0
fi

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%d-%H%M%S)"
dest="$BACKUP_DIR/terminal-$stamp.db"

# `.backup` uses SQLite's online backup API (not a raw file copy), so it
# produces a consistent snapshot even while the app is writing in WAL mode.
sqlite3 "$SRC_DB" ".backup '$dest'"
echo "backup: wrote $dest ($(du -h "$dest" | cut -f1))"

# Prune anything older than the retention window. -mtime uses whole days,
# so this can keep one extra day's worth at the boundary — fine for a
# lightweight local retention policy.
deleted=$(find "$BACKUP_DIR" -name 'terminal-*.db' -type f -mtime "+$RETENTION_DAYS" -print -delete)
if [ -n "$deleted" ]; then
  echo "backup: pruned backups older than ${RETENTION_DAYS}d:"
  echo "$deleted"
fi

echo "backup: $(find "$BACKUP_DIR" -name 'terminal-*.db' -type f | wc -l) snapshot(s) retained"
