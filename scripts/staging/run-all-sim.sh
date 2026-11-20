#!/bin/bash
# Runs every sim-*.json against staging with replies read back from the sink. The app secret is read from a
# file path in WHATSAPP_APP_SECRET_FILE (never printed). Usage: WHATSAPP_APP_SECRET_FILE=/path ./run-all-sim.sh https://udc-staging-api.onrender.com
set -u
BASE="${1:?base url}"; DIR="$(cd "$(dirname "$0")" && pwd)"
export WHATSAPP_APP_SECRET="$(cat "${WHATSAPP_APP_SECRET_FILE:?path to a file holding the secret}")"
for f in "$DIR"/sim-*.json; do echo "=== $(basename "$f")"; node "$DIR/signed-webhook-sim.mjs" --base "$BASE" --script "$f" --send --read; done
