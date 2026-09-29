#!/usr/bin/env bash
# backup.sh — Respaldo del esquema public de la base de datos BILLIFY.
# Uso: npm run db:backup   (o bash scripts/backup.sh)
# Requiere: pg_dump >= 17 instalado, o Docker (usa la imagen postgres:17).
# Lee DIRECT_URL del entorno o, si no está, solo esa línea de .env.
# Los archivos se guardan en backups/ (formato custom de pg_dump, comprimido).
# Variables opcionales: BACKUP_DIR, BACKUP_KEEP (cuántos respaldos conservar, 7 por defecto).

set -euo pipefail
umask 077 # los respaldos contienen datos de clientes: solo legibles por el usuario

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
BACKUP_KEEP="${BACKUP_KEEP:-7}"
ENV_FILE="$PROJECT_DIR/.env"

# shellcheck source=lib/pg.sh
source "$SCRIPT_DIR/lib/pg.sh"

DIRECT_URL="${DIRECT_URL:-$(env_file_value "$ENV_FILE" DIRECT_URL)}"
if [[ -z "$DIRECT_URL" ]]; then
  echo "ERROR: DIRECT_URL no está definida. Configúrala en .env o como variable de entorno." >&2
  exit 1
fi

pg_parse_url "$DIRECT_URL"
unset DIRECT_URL
pg_select_runner

mkdir -p "$BACKUP_DIR"
BACKUP_DIR="$(cd "$BACKUP_DIR" && pwd)"
PG_WORKDIR="$BACKUP_DIR"

TIMESTAMP="$(date +"%Y%m%d_%H%M%S")"
FILE_NAME="billify_${TIMESTAMP}.dump"
PARTIAL_NAME=".${FILE_NAME}.partial"
OUTPUT_FILE="$BACKUP_DIR/$FILE_NAME"

cleanup() { rm -f "$BACKUP_DIR/$PARTIAL_NAME"; }
trap cleanup EXIT

echo "Respaldando $PGDATABASE en $PGHOST:$PGPORT (pg_dump vía $PG_RUNNER)..."
pg_tool pg_dump \
  --format=custom \
  --schema=public \
  --no-owner \
  --no-privileges \
  --no-password \
  --file="$PARTIAL_NAME"

# Verificación: el archivo debe ser legible por pg_restore y contener tablas.
TABLE_ENTRIES="$(pg_tool pg_restore --list "$PARTIAL_NAME" | grep -cE '^[0-9]+; [0-9]+ [0-9]+ TABLE DATA ' || true)"
if [[ "${TABLE_ENTRIES:-0}" -eq 0 ]]; then
  echo "ERROR: el respaldo no contiene datos de tablas; se descarta." >&2
  exit 1
fi

mv "$BACKUP_DIR/$PARTIAL_NAME" "$OUTPUT_FILE"
SIZE="$(du -h "$OUTPUT_FILE" | cut -f1)"
echo "Respaldo verificado: $TABLE_ENTRIES tablas con datos, $SIZE."

# Conservar solo los últimos $BACKUP_KEEP respaldos (los nombres llevan fecha, así que ordenan).
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'billify_*.dump' -print0 \
  | sort -z \
  | head -z -n "-$BACKUP_KEEP" \
  | xargs -0 -r rm -f --

echo "Archivo: $OUTPUT_FILE"
echo "Respaldos conservados en $BACKUP_DIR: $(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'billify_*.dump' | wc -l | tr -d ' ')"
