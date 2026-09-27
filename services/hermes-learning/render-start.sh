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

hermes gateway run --external-supervisor &
GATEWAY_PID=$!

# Non-fatal startup smoke test. It verifies the full authenticated Hermes
# inference path without logging credentials or response content.
(
  python - <<'PY'
import json
import os
import time
import urllib.error
import urllib.request

port = os.environ.get("API_SERVER_PORT", os.environ.get("PORT", "8642"))
key = os.environ["API_SERVER_KEY"]
base = f"http://127.0.0.1:{port}"
headers = {"Authorization": f"Bearer {key}"}

ready = False
for _ in range(90):
    try:
        req = urllib.request.Request(f"{base}/v1/capabilities", headers=headers)
        with urllib.request.urlopen(req, timeout=2) as response:
            if response.status == 200:
                ready = True
                break
    except Exception:
        time.sleep(1)

if not ready:
    print("AKIF_HERMES_SMOKE_FAIL stage=readiness")
    raise SystemExit(0)

payload = json.dumps({
    "model": "akif-hermes",
    "messages": [{"role": "user", "content": "Reply with OK only."}],
    "stream": False,
}).encode("utf-8")

req = urllib.request.Request(
    f"{base}/v1/chat/completions",
    data=payload,
    headers={**headers, "Content-Type": "application/json"},
    method="POST",
)

try:
    with urllib.request.urlopen(req, timeout=120) as response:
        body = json.loads(response.read().decode("utf-8"))
    content = (((body.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
    if content:
        print("AKIF_HERMES_SMOKE_OK")
    else:
        print("AKIF_HERMES_SMOKE_FAIL stage=inference reason=empty_response")
except urllib.error.HTTPError as exc:
    print(f"AKIF_HERMES_SMOKE_FAIL stage=inference http={exc.code}")
except Exception as exc:
    print(f"AKIF_HERMES_SMOKE_FAIL stage=inference type={type(exc).__name__}")
PY
) &

trap 'kill "$GATEWAY_PID" 2>/dev/null || true; wait "$GATEWAY_PID" 2>/dev/null || true; exit 0' TERM INT
wait "$GATEWAY_PID"
