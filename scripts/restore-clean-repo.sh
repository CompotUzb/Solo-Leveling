#!/usr/bin/env bash
set -euo pipefail

OLD_APP_DIR="${OLD_APP_DIR:-/home/hbai-academy/workspaces/projects/my/solo-tracker}"
NEW_APP_DIR="${NEW_APP_DIR:-/home/hbai-academy/workspaces/projects/my/solo-leveling}"
REPO_URL="${REPO_URL:-https://github.com/CompotUzb/Solo-Leveling.git}"
BRANCH="${BRANCH:-main}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3333/api/health}"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/solo-leveling-restore-backup}"
DELETE_BACKUP_ON_SUCCESS="${DELETE_BACKUP_ON_SUCCESS:-1}"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

safe_delete_backup() {
  local target="$1"

  [ -n "$target" ] || fail "Refusing to delete empty backup path."
  [ "$target" != "/" ] || fail "Refusing to delete filesystem root."
  [ "$target" != "$HOME" ] || fail "Refusing to delete HOME."
  [ "$target" != "$OLD_APP_DIR" ] || fail "Refusing to delete OLD_APP_DIR."
  [ "$target" != "$NEW_APP_DIR" ] || fail "Refusing to delete NEW_APP_DIR."

  rm -rf -- "$target"
}

restore_database_name() {
  local data_dir="$1"
  local old_base="$data_dir/solo-system.sqlite"
  local new_base="$data_dir/solo-leveling.sqlite"

  if [ ! -f "$new_base" ] && [ -f "$old_base" ]; then
    cp -a "$old_base" "$new_base"
  fi

  for suffix in -shm -wal; do
    if [ ! -f "${new_base}${suffix}" ] && [ -f "${old_base}${suffix}" ]; then
      cp -a "${old_base}${suffix}" "${new_base}${suffix}"
    fi
  done
}

set_database_path() {
  local env_file="$1"
  local line="DATABASE_PATH=./data/solo-leveling.sqlite"

  if grep -q '^DATABASE_PATH=' "$env_file"; then
    sed -i.bak "s#^DATABASE_PATH=.*#${line}#" "$env_file"
    rm -f "${env_file}.bak"
  else
    printf '\n%s\n' "$line" >> "$env_file"
  fi
}

require_cmd git
require_cmd docker
require_cmd curl

[ -d "$OLD_APP_DIR" ] || fail "OLD_APP_DIR does not exist: $OLD_APP_DIR"
[ -f "$OLD_APP_DIR/.env" ] || fail "Missing old .env: $OLD_APP_DIR/.env"
[ -d "$OLD_APP_DIR/data" ] || fail "Missing old data directory: $OLD_APP_DIR/data"
[ "$OLD_APP_DIR" != "$NEW_APP_DIR" ] || fail "OLD_APP_DIR and NEW_APP_DIR must be different."

if [ -e "$NEW_APP_DIR" ] && [ -n "$(find "$NEW_APP_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
  fail "NEW_APP_DIR already exists and is not empty: $NEW_APP_DIR"
fi

echo "== Stop old container without deleting data =="
if [ -f "$OLD_APP_DIR/docker-compose.yml" ]; then
  (cd "$OLD_APP_DIR" && docker compose down)
fi

echo "== Create temporary backup =="
safe_delete_backup "$BACKUP_ROOT"
mkdir -p "$BACKUP_ROOT"
cp -a "$OLD_APP_DIR/.env" "$BACKUP_ROOT/.env"
cp -a "$OLD_APP_DIR/data" "$BACKUP_ROOT/data"

echo "== Clone clean repository =="
mkdir -p "$(dirname "$NEW_APP_DIR")"
git clone --branch "$BRANCH" "$REPO_URL" "$NEW_APP_DIR"

echo "== Restore env and SQLite data into new repo =="
cp -a "$BACKUP_ROOT/.env" "$NEW_APP_DIR/.env"
mkdir -p "$NEW_APP_DIR/data"
cp -a "$BACKUP_ROOT/data/." "$NEW_APP_DIR/data/"
restore_database_name "$NEW_APP_DIR/data"
set_database_path "$NEW_APP_DIR/.env"

echo "== Deploy new repo =="
(
  cd "$NEW_APP_DIR"
  APP_DIR="$NEW_APP_DIR" BRANCH="$BRANCH" HEALTH_URL="$HEALTH_URL" bash scripts/deploy.sh
)

echo "== Final health check =="
curl -fsS "$HEALTH_URL" >/dev/null

if [ "$DELETE_BACKUP_ON_SUCCESS" = "1" ]; then
  echo "== Delete temporary backup after successful restore =="
  safe_delete_backup "$BACKUP_ROOT"
else
  echo "Backup kept at: $BACKUP_ROOT"
fi

echo "== Restore completed =="
echo "Old app directory kept unchanged: $OLD_APP_DIR"
echo "New app directory active: $NEW_APP_DIR"
