# PWC Path A: full migration to the CADScope manifest + composite GLB

## Context

Prusawire-Configurator (PWC, `~/Code/Prusawire-Configurator`, branch
`cadscope-manifest`) is still the inherited A4T *toolhead* configurator:
`js/partsManifest.js` (1513 L) models carriages/hotends/32 cowlings, per-part
GLTFs load from an empty gitignored `models/`, and `index.html` was
half-reskinned with Prusawire selects (`frameType`, `squareNuts`,
`motorPulley`, `zRods`) that drive nothing (not in the manifest or
`validateConfig`). CADScope's `Prusawire_2026.R1.manifest.json` now models the
whole printer: 8 options, 50 `visible.when/unless` parts, one Draco composite
GLB (81 MB), plus `colors.json` (palette/autoAssign/nodes). Confirmed with
Erik: **full replacement** (partsManifest.js deleted), **sync script** for
assets, **download hidden** until spec `stl:` fields land, **sidecar-driven
colors** with the existing Main/Accent pickers bound to palette categories.
Per PWC CLAUDE.md: keep A4T-named identifiers (e.g. sessionStorage key
`a4t-config`); all GLBs must come from the CADScope pipeline (this one does).

Handoff reference: `plans/2026-05-10_consume_cadscope_manifest.md` (PWC copy).
Key exploration facts: no option-rendering layer exists (widgets are hardcoded
HTML; app.js only reads them at :1108-1140); DRACOLoader already configured
(app.js:36-38, 497); `cleanNodeName`/`stripNumericSuffix` already ported
(app.js:322-337); radio CSS exists unused (style.css:323-368); compatibility
is doubly-encoded (manifest map + hardcoded matrices at app.js:815-901) — all
of it A4T-specific and dying with the old model (the new manifest has no
compatibility entries yet).

## New modules (pure, node-testable — TDD, mirroring CADScope's tests/ pattern)

1. **`js/manifest_rules.js`** — `defaultConfig(configOptions)` (first
   `default: true` choice, else first; bool options use `default`),
   `matchesClause(clause, config)` (AND across keys; array value = OR),
   `evaluateVisible(part, config)` (hidden → false; `when` must match;
   `unless` must not). Semantics identical to CADScope `spec.py:322-344` —
   port, don't invent. Also `validConfigKeys(configOptions)` for hash/session
   validation.
2. **`js/sidecar_colors.js`** — `buildSidecarLookups(colorSet)` (palette
   defaults incl. `showInPicker`; ordered autoAssign as regexes; nodes by
   path + bare-leaf fallback) and `globToRegExp` — ported from CADScope
   `assets/viewer.js:429-470` (buildSidecarLookups) and `:411-415`. Reuses
   PWC's existing `cleanNodeName`/`stripNumericSuffix` (move them here,
   export, import back into app.js).
3. **`js/options_ui.js`** — renders `configOptions` into
   `.config-panel-content` using existing classes: selection `type` `radio`
   (default) → `.option-group` radio list, `dropdown` → `.config-section
   select`, `bool` → checkbox, unknown → radio + `console.warn` ("soft on
   unknown" per handoff). Renders option/choice `description` as
   `.section-note`. Emits `change` callbacks with `{optionId, value}`.

Tests: `tests/manifest_rules.test.js`, `tests/sidecar_colors.test.js`
(node:test + assert/strict, ABOUTME headers, run `node --test tests/...` —
same conventions as CADScope's `tests/share_codec.test.js`). Red first.

## app.js surgery (the big block)

- **Data load**: replace `import { partsManifest }` (app.js:11) with startup
  `fetch('models/Prusawire_2026.R1.manifest.json')` + `fetch(colors.json)`.
- **Model load**: one `GLTFLoader.load(manifest.glb)` with fetch-progress
  wired to a minimal loading overlay (TODO.md asks for CADScope's loading
  screen; keep it a simple percentage text in v1). Delete per-variant path
  building (:543-555, :945-952), `deepCloneModel`/`loadedModels` cache
  (:523-579), hex-cowl special case.
- **`applyConfig(config)`** replaces `getMatchingParts`/`updateViewer`
  diffing (:678-1017): walk `manifest.parts`, for each part resolve its
  `nodes` paths against the scene (path index built once with
  `cleanNodeName`-based extendPath like CADScope viewer.js:800-809), set
  `visible = evaluateVisible(part, config)` on the subtree root. Nodes
  without rules stay as loaded.
- **Colors**: one top-down walk applying the sidecar cascade (per-node entry
  category → own autoAssign leaf match → inherited), building
  MeshStandardMaterial per category (color/metalness/opacity from palette) —
  port of CADScope `applyColorSet` walk (viewer.js:520-575), simplified: no
  tree UI. Main/Accent pickers (existing DOM) write into the palette lookup
  and re-walk; picker rows map to palette categories with
  `showInPicker !== false`.
- **State**: `state.config = defaultConfig(...)` merged with hash/session
  restore; `validateConfig` whitelist becomes `validConfigKeys(configOptions)`
  instead of the hardcoded list (:88-100). Hash format and `a4t-config`
  session key unchanged.
- **Delete**: `partMatchesConfig`, `getMatchingParts`,
  `getMatchingStlOnlyParts`, `checkCompatibility`, `updateDisabledOptions`
  with its hardcoded matrices (:678-901), wwbmg special cases (:253, sub-
  option toggling), ZIP download flow (:1274-1403) — download button hidden
  in index.html with a comment pointing at the spec `stl:` follow-up.
- **Delete `js/partsManifest.js`.**

## index.html + css

- Remove all hardcoded option `<section>`s (:54-158); leave one container the
  renderer fills. Keep canvas, view controls, color pickers, warnings div
  (unused for now — manifest `compatibility` is empty), hide the download
  button. Keep importmap/three versions as-is.
- CSS: no changes expected (radio styles already exist); add only if the
  rendered layout genuinely needs it.

## Assets + docs

- **`sync-models.sh`** (repo root, executable): copies
  `../CADScope/models/Prusawire_2026.R1.{glb,manifest.json,colors.json}` into
  `models/` (gitignored, per existing convention). Run it as step 1 so dev
  has assets.
- README/CLAUDE.md: single source of truth becomes the generated
  manifest+sidecar (authored in CADScope's spec.yaml); document sync script;
  prune TODO items this ships (loading screen, real option set).

## Order of work

1. `sync-models.sh` + run (assets present).
2. TDD `js/manifest_rules.js` (red → green).
3. TDD `js/sidecar_colors.js` (move+export cleanNodeName helpers).
4. `js/options_ui.js` + index.html container swap.
5. app.js surgery (load, applyConfig, colors, state, deletions).
6. Delete partsManifest.js; docs pass.
7. Erik commits per step (messages prepared).

## Verification

```sh
cd ~/Code/Prusawire-Configurator
./sync-models.sh
node --test tests/manifest_rules.test.js tests/sidecar_colors.test.js
python3 -m http.server 8001   # → localhost:8001
```

Manual matrix: default view must match CADScope's default render (16T, M3S,
Rambo, black PSU, Nitehawk, Stealthburner, 10mm, MK4 — same GLB + same
sidecar); toggle each of the 8 options and confirm the expected subtrees
swap (SKR↔Rambo, silver↔black PSU + deck panel, 20T blocks/motors, 8mm rods,
MK3 carriage, V0S x-blocks, Afterburner); Main/Accent pickers recolor
printed parts live; share-URL round-trip restores a non-default config;
unknown `type:` in a hand-edited manifest falls back to radio with a console
warning, no crash.

On approval this plan is copied to
`~/Code/Prusawire-Configurator/plans/2026-07-24_pwc_path_a_migration.md`.

## Flagged assumptions

1. Color pickers stay the existing two (Main/Accent) bound to palette
   categories; fully dynamic per-category pickers are a follow-up.
2. Old share URLs (A4T config keys) degrade gracefully to defaults via the
   new whitelist — acceptable.
3. Compatibility warnings UI stays dormant until the spec grows
   `compatibility:` entries.
