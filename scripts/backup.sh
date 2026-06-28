#!/usr/bin/env bash
# backup.sh — Respaldo completo de la base de datos BILLIFY
# Uso: ./scripts/backup.sh
# Requiere: pg_dump instalado, DIRECT_URL en .env o como variable de entorno
# Los archivos se guardan en backups/ con formato comprimido (pg custom format).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
ENV_FILE="$PROJECT_DIR/.env"

# Cargar DIRECT_URL desde .env si no está en el entorno
if [[ -z "${DIRECT_URL:-}" ]] && [[ -f "$ENV_FILE" ]]; then
  DIRECT_URL=$(grep -E '^DIRECT_URL=' "$ENV_FILE" | cut -d '=' -f2- | tr -d '"' | tr -d "'")
fi

if [[ -z "${DIRECT_URL:-}" ]]; then
  echo "ERROR: DIRECT_URL no está definida. Configúrala en .env o como variable de entorno." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
OUTPUT_FILE="$BACKUP_DIR/billify_${TIMESTAMP}.dump"

echo "Iniciando respaldo en: $OUTPUT_FILE"
pg_dump \
  --format=custom \
  --compress=9 \
  --no-password \
  --verbose \
  "$DIRECT_URL" \
  --file="$OUTPUT_FILE"

SIZE=$(du -sh "$OUTPUT_FILE" | cut -f1)
echo "Respaldo completado: $OUTPUT_FILE ($SIZE)"

# Mantener solo los últimos 7 respaldos para no saturar disco
BACKUPS_COUNT=$(find "$BACKUP_DIR" -name "billify_*.dump" | wc -l)
if [[ $BACKUPS_COUNT -gt 7 ]]; then
  OLDEST=$(find "$BACKUP_DIR" -name "billify_*.dump" | sort | head -n $((BACKUPS_COUNT - 7)))
  echo "Eliminando respaldos antiguos:"
  echo "$OLDEST" | xargs rm -v
fi

echo "Hecho. Total de respaldos en $BACKUP_DIR: $(find "$BACKUP_DIR" -name "billify_*.dump" | wc -l)"
