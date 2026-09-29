#!/usr/bin/env bash
# pg.sh — Funciones compartidas por backup.sh y restore.sh (se carga con `source`).
#
# - pg_parse_url: convierte una URL postgres:// en PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE.
#   La contraseña viaja por variable de entorno, nunca en la línea de comandos.
# - pg_tool: ejecuta pg_dump/pg_restore/psql. Usa el binario local si es versión >= 17;
#   si no, usa la imagen docker postgres:17 (Supabase corre Postgres 17).
#   Los archivos se referencian por nombre relativo a PG_WORKDIR.

PG_MIN_MAJOR=17
PG_DOCKER_IMAGE="${PG_DOCKER_IMAGE:-postgres:17}"

# Lee una sola variable de .env sin ejecutar el archivo.
env_file_value() {
  local file="$1" name="$2"
  [[ -f "$file" ]] || return 0
  grep -E "^${name}=" "$file" | tail -n 1 | cut -d '=' -f2- | tr -d '\r' | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

url_decode() {
  local s="${1//+/ }"
  printf '%b' "${s//%/\\x}"
  return 0
}

pg_parse_url() {
  local url="$1" rest userinfo hostport
  case "$url" in
    postgres://*) rest="${url#postgres://}" ;;
    postgresql://*) rest="${url#postgresql://}" ;;
    *) echo "ERROR: la URL debe empezar por postgres:// o postgresql://" >&2; return 1 ;;
  esac
  rest="${rest%%\?*}" # quita ?pgbouncer=true&sslmode=... etc.

  if [[ "$rest" == *@* ]]; then
    userinfo="${rest%@*}"
    rest="${rest##*@}"
  else
    userinfo=""
  fi
  hostport="${rest%%/*}"
  if [[ "$rest" == */* ]]; then PGDATABASE="${rest#*/}"; else PGDATABASE="postgres"; fi
  [[ -n "$PGDATABASE" ]] || PGDATABASE="postgres"

  if [[ "$userinfo" == *:* ]]; then
    PGUSER="$(url_decode "${userinfo%%:*}")"
    PGPASSWORD="$(url_decode "${userinfo#*:}")"
  else
    PGUSER="$(url_decode "$userinfo")"
    PGPASSWORD=""
  fi
  if [[ "$hostport" == *:* ]]; then
    PGHOST="${hostport%%:*}"
    PGPORT="${hostport##*:}"
  else
    PGHOST="$hostport"
    PGPORT="5432"
  fi
  PGDATABASE="$(url_decode "$PGDATABASE")"
  [[ -n "$PGHOST" ]] || { echo "ERROR: la URL no tiene host." >&2; return 1; }
  export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
}

pg_is_local_host() {
  case "$1" in
    localhost|127.0.0.1|::1) return 0 ;;
    *) return 1 ;;
  esac
}

# Decide una sola vez si se usan binarios locales o docker.
pg_select_runner() {
  PG_RUNNER=""
  if command -v pg_dump >/dev/null 2>&1; then
    local major
    major="$(pg_dump --version | grep -oE '[0-9]+' | head -n 1)"
    if [[ "${major:-0}" -ge "$PG_MIN_MAJOR" ]]; then PG_RUNNER="local"; fi
  fi
  if [[ -z "$PG_RUNNER" ]]; then
    if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
      PG_RUNNER="docker"
    else
      echo "ERROR: se necesita pg_dump/pg_restore >= $PG_MIN_MAJOR instalado, o Docker en ejecución." >&2
      return 1
    fi
  fi
}

# Uso: pg_tool <pg_dump|pg_restore|psql> [args...]  (se ejecuta dentro de PG_WORKDIR)
pg_tool() {
  local tool="$1"; shift
  if [[ "$PG_RUNNER" == "local" ]]; then
    (cd "$PG_WORKDIR" && "$tool" "$@")
    return
  fi

  local mount host="$PGHOST" user_args=()
  mount="$(cd "$PG_WORKDIR" && (pwd -W 2>/dev/null || pwd))"
  # Dentro del contenedor, "localhost" es el propio contenedor: se apunta al host.
  if pg_is_local_host "$host"; then host="host.docker.internal"; fi
  if [[ "$(uname -s)" == "Linux" ]]; then user_args=(--user "$(id -u):$(id -g)"); fi

  # -e NOMBRE sin valor pasa la variable desde el entorno: la contraseña no aparece en argv.
  MSYS_NO_PATHCONV=1 PGHOST="$host" docker run --rm -i \
    --add-host=host.docker.internal:host-gateway \
    "${user_args[@]}" \
    -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD -e PGDATABASE \
    -v "$mount:/work" -w /work \
    "$PG_DOCKER_IMAGE" "$tool" "$@"
}
