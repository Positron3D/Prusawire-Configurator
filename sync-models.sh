#!/bin/sh
# ABOUTME: Copies the generated Prusawire model assets from the sibling
# ABOUTME: CADScope checkout into the gitignored models/ directory.
set -eu

SRC="${1:-../CADScope/models}"
MODEL="Prusawire_2026.R1"

for f in "$MODEL.glb" "$MODEL.manifest.json" "$MODEL.colors.json"; do
    cp "$SRC/$f" "models/$f"
    echo "synced models/$f"
done
