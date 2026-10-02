#!/bin/sh
set -eu

DATA_DIR="${HERMES_DATA_DIR:-/opt/data}"
BOOTSTRAP_DIR="${HERMES_BOOTSTRAP_DIR:-/opt/akif-bootstrap}"

mkdir -p "$DATA_DIR/skills/akif-trade-research" "$DATA_DIR/memories"

# Security policy and AKIF role are authoritative deployment configuration.
# Re-apply them on every boot so a prior runtime state cannot preserve broader
# tool permissions after a security update.
cp "$BOOTSTRAP_DIR/config.yaml" "$DATA_DIR/config.yaml"
cp "$BOOTSTRAP_DIR/SOUL.md" "$DATA_DIR/SOUL.md"

# Seed only the built-in research skill. Do not overwrite learned/approved
# skill content that Hermes may have persisted in the profile.
if [ ! -f "$DATA_DIR/skills/akif-trade-research/SKILL.md" ]; then
  cp "$BOOTSTRAP_DIR/skills/akif-trade-research/SKILL.md" \
    "$DATA_DIR/skills/akif-trade-research/SKILL.md"
fi
