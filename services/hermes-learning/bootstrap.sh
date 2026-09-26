#!/bin/sh
set -eu

DATA_DIR="${HERMES_DATA_DIR:-/opt/data}"
BOOTSTRAP_DIR="${HERMES_BOOTSTRAP_DIR:-/opt/akif-bootstrap}"

mkdir -p "$DATA_DIR/skills/akif-trade-research" "$DATA_DIR/memories"

if [ ! -f "$DATA_DIR/config.yaml" ]; then
  cp "$BOOTSTRAP_DIR/config.yaml" "$DATA_DIR/config.yaml"
fi

if [ ! -f "$DATA_DIR/SOUL.md" ]; then
  cp "$BOOTSTRAP_DIR/SOUL.md" "$DATA_DIR/SOUL.md"
fi

if [ ! -f "$DATA_DIR/skills/akif-trade-research/SKILL.md" ]; then
  cp "$BOOTSTRAP_DIR/skills/akif-trade-research/SKILL.md"     "$DATA_DIR/skills/akif-trade-research/SKILL.md"
fi
