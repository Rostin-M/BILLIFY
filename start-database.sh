#!/usr/bin/env bash
# Levanta un contenedor Docker/Podman con Postgres 17 para desarrollo local.
# Uso: ./start-database.sh   (Linux, macOS, WSL o Git Bash en Windows)
#
# - Solo escucha en 127.0.0.1 (no queda expuesto en la red).
# - Lee únicamente DATABASE_URL de .env (no ejecuta el archivo).
# - Si DATABASE_URL no apunta a localhost (p. ej. es la de producción), NO reutiliza
#   esa contraseña: genera una aleatoria y muestra la URL local a usar.

set -euo pipefail

POSTGRES_IMAGE="docker.io/library/postgres:17"

env_value() {
  [[ -f .env ]] || return 0
  grep -E "^$1=" .env | tail -n 1 | cut -d '=' -f2- | tr -d '\r' | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

DATABASE_URL="${DATABASE_URL:-$(env_value DATABASE_URL)}"

# postgresql://usuario:clave@host:puerto/base?parametros
URL_REST="${DATABASE_URL#*://}"
URL_REST="${URL_REST%%\?*}"          # quita ?pgbouncer=true, ?schema=..., etc.
USERINFO="${URL_REST%@*}"
HOSTPART="${URL_REST##*@}"
HOSTPORT="${HOSTPART%%/*}"
DB_HOST="${HOSTPORT%%:*}"
DB_PORT="${HOSTPORT##*:}"
DB_NAME="${HOSTPART#*/}"
DB_PASSWORD="${USERINFO#*:}"

[[ "$DB_PORT" =~ ^[0-9]+$ ]] || DB_PORT=5432
[[ -n "$DB_NAME" && "$DB_NAME" != "$HOSTPART" ]] || DB_NAME="billify"

case "$DB_HOST" in
  localhost|127.0.0.1) IS_LOCAL_URL=1 ;;
  *) IS_LOCAL_URL=0 ;;
esac

if [[ $IS_LOCAL_URL -eq 0 ]]; then
  # Nunca reutilizar la contraseña de una base remota para el contenedor local.
  echo "DATABASE_URL no apunta a localhost: se usará una base local independiente."
  DB_PORT=5432
  DB_NAME="billify"
  DB_PASSWORD=""
fi

if [[ -z "$DB_PASSWORD" || "$DB_PASSWORD" == "password" || "$DB_PASSWORD" == "$USERINFO" ]]; then
  DB_PASSWORD="$(openssl rand -hex 16 2>/dev/null || head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  GENERATED_PASSWORD=1
else
  GENERATED_PASSWORD=0
fi

DB_CONTAINER_NAME="$DB_NAME-postgres"

if [[ -x "$(command -v docker)" ]]; then
  DOCKER_CMD="docker"
elif [[ -x "$(command -v podman)" ]]; then
  DOCKER_CMD="podman"
else
  echo -e "Docker o Podman no están instalados.\nDocker: https://docs.docker.com/engine/install/\nPodman: https://podman.io/getting-started/installation"
  exit 1
fi

if ! $DOCKER_CMD info >/dev/null 2>&1; then
  echo "$DOCKER_CMD no está en ejecución. Inícialo e inténtalo de nuevo."
  exit 1
fi

if [[ -n "$($DOCKER_CMD ps -q -f "name=^${DB_CONTAINER_NAME}$")" ]]; then
  echo "El contenedor '$DB_CONTAINER_NAME' ya está en ejecución."
  exit 0
fi

if [[ -n "$($DOCKER_CMD ps -q -a -f "name=^${DB_CONTAINER_NAME}$")" ]]; then
  $DOCKER_CMD start "$DB_CONTAINER_NAME" >/dev/null
  echo "Contenedor existente '$DB_CONTAINER_NAME' iniciado."
  exit 0
fi

if command -v nc >/dev/null 2>&1 && nc -z 127.0.0.1 "$DB_PORT" 2>/dev/null; then
  echo "El puerto $DB_PORT ya está en uso."
  exit 1
fi

# La contraseña va por variable de entorno (-e NOMBRE), no en la línea de comandos.
export POSTGRES_PASSWORD="$DB_PASSWORD"
MSYS_NO_PATHCONV=1 $DOCKER_CMD run -d \
  --name "$DB_CONTAINER_NAME" \
  -e POSTGRES_USER="postgres" \
  -e POSTGRES_PASSWORD \
  -e POSTGRES_DB="$DB_NAME" \
  -p "127.0.0.1:$DB_PORT:5432" \
  "$POSTGRES_IMAGE" >/dev/null

echo "Contenedor '$DB_CONTAINER_NAME' creado (Postgres 17 en 127.0.0.1:$DB_PORT)."
if [[ $GENERATED_PASSWORD -eq 1 || $IS_LOCAL_URL -eq 0 ]]; then
  echo "Usa esta URL local en tu .env (DATABASE_URL y DIRECT_URL):"
  echo "  postgresql://postgres:$DB_PASSWORD@127.0.0.1:$DB_PORT/$DB_NAME"
fi
