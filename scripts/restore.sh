#!/usr/bin/env bash
# restore.sh — Restaurar base de datos BILLIFY desde un respaldo
# Uso: ./scripts/restore.sh <archivo.dump>
# ADVERTENCIA: esta operación reemplaza todos los datos actuales.
# Detener la app antes de restaurar para evitar inconsistencias.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"

if [[ $# -lt 1 ]]; then
  echo "Uso: $0 <archivo.dump>" >&2
  echo "Ejemplo: $0 backups/billify_20260518_120000.dump" >&2
  exit 1
fi

DUMP_FILE="$1"

if [[ ! -f "$DUMP_FILE" ]]; then
  echo "ERROR: Archivo no encontrado: $DUMP_FILE" >&2
  exit 1
fi

# Cargar DIRECT_URL desde .env si no está en el entorno
if [[ -z "${DIRECT_URL:-}" ]] && [[ -f "$ENV_FILE" ]]; then
  DIRECT_URL=$(grep -E '^DIRECT_URL=' "$ENV_FILE" | cut -d '=' -f2- | tr -d '"' | tr -d "'")
fi

if [[ -z "${DIRECT_URL:-}" ]]; then
  echo "ERROR: DIRECT_URL no está definida. Configúrala en .env o como variable de entorno." >&2
  exit 1
fi

echo "ADVERTENCIA: Esta operación reemplazará todos los datos actuales."
echo "Archivo de respaldo: $DUMP_FILE"
read -rp "¿Confirmar restauración? (escribe 'sí' para continuar): " CONFIRM

if [[ "$CONFIRM" != "sí" ]]; then
  echo "Restauración cancelada."
  exit 0
fi

echo "Restaurando desde: $DUMP_FILE"
pg_restore \
  --no-password \
  --clean \
  --if-exists \
  --verbose \
  --dbname="$DIRECT_URL" \
  "$DUMP_FILE"

echo "Restauración completada."
echo "Verifica la integridad desde el panel de trazabilidad o ejecutando las migraciones de Prisma:"
echo "  npx prisma migrate status"
