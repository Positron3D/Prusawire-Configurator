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

# Link a local STL tree for dev downloads (serve with ?stlBase=stls/).
STL_SRC="${STL_SRC:-../Prusawire-erikbuild/STLs}"
if [ -d "$STL_SRC" ]; then
    ln -sfn "$(cd "$STL_SRC" && pwd)" stls
    echo "linked stls -> $STL_SRC"
fi
