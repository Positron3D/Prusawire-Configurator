# Prusawire Configurator

Static browser-based 3D configurator for the Prusawire 2026.R1 printer, derived from the A4T Toolhead Configurator. Users pick build options, see a Three.js preview of one composite model with variant subtrees toggled by visibility rules, and can share their configuration by URL.

## Stack & layout

Plain HTML / CSS / ES-module JS. No build step, no `package.json`. Unit tests run on Node's built-in runner.

- `index.html` — single-page UI: config sidebar (widgets rendered from the manifest) + 3D viewer.
- `js/app.js` — state, Three.js scene, composite-model loading, visibility + color application, URL-hash sharing, `sessionStorage` persistence.
- `js/manifest_rules.js` — pure rules engine: config defaults, clause matching, part visibility. Mirrors CADScope `model_converter/spec.py`.
- `js/sidecar_colors.js` — pure sidecar lookups: palette, autoAssign glob rules, per-node entries, category cascade helpers.
- `js/options_ui.js` — renders `configOptions` into widgets (`radio` default, `dropdown`, `bool`; unknown types fall back to radio with a console warning).
- `tests/` — node:test suites for the pure modules (`node --test tests/manifest_rules.test.js tests/sidecar_colors.test.js`).
- `css/style.css` — dark-theme styles, CSS variables in `:root`.
- `assets/bg.hdr` — HDRI environment map (RGBELoader + PMREMGenerator).
- `models/` — the three generated assets (composite GLB, `manifest.json`, `colors.json`). **Not committed** — populate with `./sync-models.sh` from a sibling CADScope checkout.

Three.js (GLTFLoader + DRACOLoader) is loaded via the `<script type="importmap">` block in `index.html`.

## Source of truth

Everything the configurator shows is generated from **one hand-authored spec**: `CADScope/models/Prusawire_2026.R1.spec.yaml`, compiled by `CADScope/model_converter/build_configurator.py` into the manifest + color sidecar (schema reference: `CADScope/model_converter/SPEC.md`). Do not hand-edit the files in `models/`; edit the spec and regenerate.

## Key concepts

- **Visibility**: every manifest part carries `nodes: [path]` plus optional `hidden` or `visible: { when, unless }` clauses. `evaluateVisible` (js/manifest_rules.js) resolves them against the current config — `when` must match, `unless` must not, AND across keys, array value = OR within a key. `applyConfig` in app.js toggles the matching scene subtrees.
- **Node paths** are slash-joined cleaned names from the visual root, identical to CADScope's scaffold paths; `indexPartNodes` stamps each scene node's path into `userData.scaffoldPath` at load.
- **Colors**: the sidecar cascade — a node's own `nodes:` entry category wins, then its own autoAssign glob match, then the nearest ancestor's category (`categoryFor` in js/sidecar_colors.js). `Main` and `Accent` use the user-pickable colors; other categories use palette color/metalness/opacity. Categories without a color (e.g. `Hidden`) leave the GLB material untouched.
- **Options UI** is rendered from `manifest.configOptions` by js/options_ui.js; there is no hardcoded option markup.
- **Compatibility** warnings render from the manifest's uniform `compatibility: [{when, incompatible, message}]` list (currently empty in the spec).
- **Sharing**: `getShareableState()` → base64-JSON → URL hash, falling back to `sessionStorage` (key: `prusawire-config`). Valid config keys come from the manifest's option ids.
- **Downloads**: `downloadFileList` (js/manifest_rules.js) resolves the manifest's `downloads` block (`always` files + option-gated `groups`) for the current config; files fetch from `downloads.base` (a `?stlBase=` query param overrides it for local testing) and zip with folder structure preserved.
