#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
export HERMES_HOME="${HERMES_HOME:-/opt/render/project/src/.hermes}"
export HERMES_DATA_DIR="$HERMES_HOME"
export HERMES_BOOTSTRAP_DIR="$ROOT_DIR"

sh "$ROOT_DIR/bootstrap.sh"

export API_SERVER_ENABLED=true
export API_SERVER_HOST=0.0.0.0
export API_SERVER_PORT="${PORT:-8642}"
export API_SERVER_MODEL_NAME=akif-hermes

exec hermes gateway run
