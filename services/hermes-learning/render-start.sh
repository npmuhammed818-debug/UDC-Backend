#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
export HERMES_HOME="${HERMES_HOME:-/opt/render/project/src/.hermes}"
export HERMES_DATA_DIR="$HERMES_HOME"
export HERMES_BOOTSTRAP_DIR="$ROOT_DIR"

: "${API_SERVER_KEY:?API_SERVER_KEY is required}"

sh "$ROOT_DIR/bootstrap.sh"

# Hermes keeps aiohttp in its optional messaging extra, while the API server
# itself uses aiohttp. The lightweight editable Render install omits that
# extra, so add only the exact API dependency when it is missing.
if ! python -c "import aiohttp" >/dev/null 2>&1; then
  python -m pip install --disable-pip-version-check "aiohttp==3.14.3"
fi

export API_SERVER_ENABLED=true
export API_SERVER_HOST=0.0.0.0
export API_SERVER_PORT="${PORT:-8642}"
export API_SERVER_MODEL_NAME=akif-hermes

exec hermes gateway run --external-supervisor
