#!/usr/bin/env bash
# restore.sh — Restaurar un respaldo de BILLIFY en una base de datos VACÍA.
# Uso: bash scripts/restore.sh <archivo.dump> --target <postgresql://...> [--yes] [--i-know-this-is-production]
#
# - El destino se indica siempre de forma explícita (nunca se lee de .env).
# - Si el destino es Supabase (supabase.com / supabase.co) se exige además
#   --i-know-this-is-production y confirmación escrita.
# - Se restaura en una sola transacción: si algo falla no queda nada a medias.
#   El destino debe estar vacío (sin las tablas de la app); no se borra nada existente.
# - Al terminar imprime conteos de filas para compararlos con admin.dbStats.
# Requiere: pg_restore/psql >= 17 instalados, o Docker (usa la imagen postgres:17).

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/pg.sh
source "$SCRIPT_DIR/lib/pg.sh"

usage() {
  echo "Uso: $0 <archivo.dump> --target <postgresql://usuario:clave@host:puerto/base> [--yes] [--i-know-this-is-production]" >&2
  exit 1
}

DUMP_FILE=""
TARGET_URL=""
ASSUME_YES=0
ALLOW_PROD=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) [[ $# -ge 2 ]] || usage; TARGET_URL="$2"; shift 2 ;;
    --yes) ASSUME_YES=1; shift ;;
    --i-know-this-is-production) ALLOW_PROD=1; shift ;;
    -h|--help) usage ;;
    -*) echo "Opción desconocida: $1" >&2; usage ;;
    *) [[ -z "$DUMP_FILE" ]] || usage; DUMP_FILE="$1"; shift ;;
  esac
done

[[ -n "$DUMP_FILE" && -n "$TARGET_URL" ]] || usage
if [[ ! -f "$DUMP_FILE" ]]; then
  echo "ERROR: Archivo no encontrado: $DUMP_FILE" >&2
  exit 1
fi

pg_parse_url "$TARGET_URL"
unset TARGET_URL

IS_PROD=0
case "$PGHOST" in
  *supabase.com*|*supabase.co*) IS_PROD=1 ;;
  *) ;;
esac
if [[ $IS_PROD -eq 1 && $ALLOW_PROD -eq 0 ]]; then
  echo "ERROR: el destino $PGHOST es Supabase (producción). Si de verdad quieres restaurar ahí," >&2
  echo "       agrega --i-know-this-is-production. Normalmente se restaura en una base local de prueba." >&2
  exit 1
fi

echo "Archivo de respaldo: $DUMP_FILE"
echo "Destino:             $PGUSER@$PGHOST:$PGPORT/$PGDATABASE"
if [[ $IS_PROD -eq 1 ]]; then
  read -rp "Destino de PRODUCCIÓN. Escribe el nombre del host para confirmar: " CONFIRM
  [[ "$CONFIRM" == "$PGHOST" ]] || { echo "Restauración cancelada."; exit 1; }
elif [[ $ASSUME_YES -eq 0 ]]; then
  read -rp "¿Confirmar restauración? (escribe 'si' para continuar): " CONFIRM
  [[ "$CONFIRM" == "si" || "$CONFIRM" == "sí" ]] || { echo "Restauración cancelada."; exit 0; }
fi

pg_select_runner

# Se trabaja sobre una copia en un directorio temporal: así docker solo monta ese directorio.
PG_WORKDIR="$(mktemp -d)"
trap 'rm -rf "$PG_WORKDIR"' EXIT
cp "$DUMP_FILE" "$PG_WORKDIR/restore.dump"

# El dump incluye CREATE SCHEMA public, que ya existe en cualquier base nueva y rompería
# la transacción única. Se filtra esa entrada (y su COMMENT) con --use-list.
pg_tool pg_restore --list restore.dump \
  | grep -vE '^[0-9]+; [0-9]+ [0-9]+ (SCHEMA - public|COMMENT - SCHEMA public) ' \
  > "$PG_WORKDIR/restore.list"

echo "Restaurando (pg_restore vía $PG_RUNNER, transacción única)..."
pg_tool pg_restore \
  --no-owner \
  --no-privileges \
  --no-password \
  --single-transaction \
  --exit-on-error \
  --use-list=restore.list \
  --dbname="$PGDATABASE" \
  restore.dump

echo "Restauración completada. Conteo de filas (compáralo con admin.dbStats):"
pg_tool psql --no-password -X -v ON_ERROR_STOP=1 -P pager=off -c "
  SELECT 'sales' AS tabla, count(*) AS filas FROM public.sales
  UNION ALL SELECT 'products', count(*) FROM public.products
  UNION ALL SELECT 'customers', count(*) FROM public.customers
  UNION ALL SELECT 'cash_registers', count(*) FROM public.cash_registers
  UNION ALL SELECT 'audit_logs', count(*) FROM public.audit_logs;"
