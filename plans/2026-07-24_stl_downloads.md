# STL downloads: spec-defined, option-gated file groups

## Context

The PWC download button has been hidden since the migration because the old
A4T ZIP flow died with partsManifest. Erik wants the YAML spec to associate
STLs with options: a base folder URL pointing at the Prusawire git repo, an
`always` set included in every download, and option-gated groups. Confirmed:
production base is `https://raw.githubusercontent.com/Positron3D/Prusawire/main/STLs/`
(repo goes live later today); local testing uses `~/Code/Prusawire-erikbuild/`
via a dev override; group content is auto-seeded from the existing STL↔node
matching. Existing schema pieces: per-node `stl:` + top-level `stlBase`
(SPEC.md:52/:58) stay as-is for per-part manifest data; this adds a separate
`downloads:` section for the ZIP flow.

## 1. CADScope: schema + generator (TDD)

`models/<model>.spec.yaml` gains:

```yaml
downloads:
  base: "https://raw.githubusercontent.com/Positron3D/Prusawire/main/STLs/"
  always:
    - "Door_Puller/door_puller_anchor.stl"
  groups:
    - when: { pulley_size: 16t }
      files: ["Y_Axis/y_motor_bracket_16T_Pulley.stl"]
```

- `model_converter/spec.py`: `_parse_downloads` — `base` required string,
  `always` optional list of strings, `groups` optional list of
  `{when: <clause>, files: [str]}`; clause values string-or-list (same
  grammar as `visible.when`); SpecError on shape violations, stderr warning
  when a `when` key isn't a declared option id. Stored on `Spec.downloads`.
- `model_converter/build_configurator.py`: manifest gains a verbatim
  `downloads` block (colors.json unchanged).
- `model_converter/SPEC.md`: new "Downloads" section.
- Tests first: `test_spec.py` (parse/validate/round-trip, bad shapes),
  `test_build_configurator.py` (manifest carries the block; absent section
  emits nothing).

## 2. Seeding (one-off script, scratchpad)

For each spec node entry whose `displayName` equals an STL stem in
`~/Code/Prusawire-erikbuild/STLs/` (the STL-pinning convention):

- Compute **effective visibility** by merging the node's own and every
  ancestor's manifest rules: any unconditional `hidden` → skip to TODO;
  merged `when` keys → a group; no rules → `always`.
- Consolidate groups by identical merged clause; dedupe files (copies map
  to one STL).
- Every STL in the core dirs NOT seeded (the variant zoos: motor_mounts_*,
  xz_blocks_*, y_belt_tensioner_*, rod holders, idler blocks, front grills,
  mcu boxes, badge back/text, …) is emitted into a commented
  `# TODO: unassigned STLs` block inside the downloads section — nothing
  silently dropped. Erik sorts those by hand later.

Insert into the spec, regenerate, `--check` clean, re-run `sync-models.sh`.

## 3. PWC: download flow

- `js/manifest_rules.js`: add pure `downloadFileList(downloads, config)` —
  `always` plus files of every group whose `when` passes `matchesClause`,
  deduped, order-preserving. Tests first in `tests/manifest_rules.test.js`.
- `js/app.js`: new `downloadParts()` — resolve base as
  `new URLSearchParams(location.search).get('stlBase') || manifest.downloads.base`;
  fetch each file (path URL-encoded per segment, flattened filename into the
  ZIP like the old flow), JSZip → `Prusawire-STLs.zip`, button-text progress
  and failure alert ported from the old implementation (git history
  baa1f3f^ has it; JSZip is still loaded via CDN). Button disabled when
  `manifest.downloads` is absent.
- `index.html`: un-hide the download button (remove the `display: none` and
  its stl-follow-up comment).
- `sync-models.sh`: also `ln -sfn` a `stls` symlink → the sibling
  `~/Code/Prusawire-erikbuild/STLs` when that directory exists (python
  http.server follows symlinks; `stls` gets a `.gitignore` entry).
- README: document local testing with `?stlBase=stls/`.

## Verification

```sh
cd ~/Code/CADScope && model_converter/.venv/bin/python -m unittest model_converter.test_spec model_converter.test_build_configurator
model_converter/.venv/bin/python model_converter/build_configurator.py --check models/Prusawire_2026.R1.glb
cd ~/Code/Prusawire-Configurator && ./sync-models.sh
node --test tests/manifest_rules.test.js tests/sidecar_colors.test.js
python3 -m http.server 8000   # → http://localhost:8000/?stlBase=stls/
```

Manual: download with defaults → ZIP contains the `always` set + 16T/M3S/
rambo/black-PSU/nitehawk/stealthburner group files and nothing from hidden
variants; flip pulley_size to 20T → 16T files swap out; without `?stlBase`
the URLs point at raw.githubusercontent.com/Positron3D/Prusawire (will 404
until the repo is live — expected today).

Commit prep: CADScope commit (schema + seeded spec + regenerated outputs) and
PWC commit (download flow) staged separately with messages, Erik commits.
