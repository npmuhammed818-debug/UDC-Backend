#!/bin/sh
set -eu

DATA_DIR="${HERMES_DATA_DIR:-/opt/data}"
BOOTSTRAP_DIR="${HERMES_BOOTSTRAP_DIR:-/opt/akif-bootstrap}"

mkdir -p "$DATA_DIR/skills/akif-trade-research" "$DATA_DIR/memories"

if [ ! -f "$DATA_DIR/config.yaml" ]; then
  cp "$BOOTSTRAP_DIR/config.yaml" "$DATA_DIR/config.yaml"
fi

# Existing persistent Hermes homes keep their settings across deploys. Migrate
# only the previously pinned free model, preserving all other user settings.
sed -i 's/^[[:space:]]*default: qwen\/qwen3\.8-27b:free[[:space:]]*$/  default: openrouter\/free/' "$DATA_DIR/config.yaml"

# Hermes otherwise classifies the router slug as a paid auxiliary fallback.
# Add the free-only guard to existing homes without changing other settings.
if ! grep -q '^[[:space:]]*free_only:' "$DATA_DIR/config.yaml"; then
  if grep -q '^auxiliary:' "$DATA_DIR/config.yaml"; then
    sed -i '/^auxiliary:/a\  free_only: true' "$DATA_DIR/config.yaml"
  else
    printf '\nauxiliary:\n  free_only: true\n' >> "$DATA_DIR/config.yaml"
  fi
fi

if [ ! -f "$DATA_DIR/SOUL.md" ]; then
  cp "$BOOTSTRAP_DIR/SOUL.md" "$DATA_DIR/SOUL.md"
fi

if [ ! -f "$DATA_DIR/skills/akif-trade-research/SKILL.md" ]; then
  cp "$BOOTSTRAP_DIR/skills/akif-trade-research/SKILL.md"     "$DATA_DIR/skills/akif-trade-research/SKILL.md"
fi
