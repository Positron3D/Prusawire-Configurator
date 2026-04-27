# Prusawire Configurator

Static browser-based 3D configurator for Prusawire 2026.R1 toolhead parts, derived from the A4T Toolhead Configurator. Users pick options, see a Three.js preview, and download matching STL / 3MF files as a ZIP.

## Stack & layout

Plain HTML / CSS / ES-module JS. No build step, no `package.json`, no tests.

- `index.html` — single-page UI: config sidebar + 3D viewer.
- `js/app.js` — state, Three.js scene, part filtering, coloring, download flow, URL-hash sharing, `sessionStorage` persistence.
- `js/partsManifest.js` — single source of truth: parts, variants, compatibility rules, transforms, file paths. The header docblock is the canonical reference for adding a part.
- `css/style.css` — dark-theme styles, CSS variables in `:root`.
- `images/favicon.png` — favicon.
- `assets/bg.hdr` — HDRI environment map used for image-based lighting / reflections (loaded via `RGBELoader` + `PMREMGenerator`).
- `models/` — GLTF assets loaded by the viewer. **Not committed.** `partsManifest.basePath` is the relative path `"models/"`, so this directory must be served alongside the site for the 3D preview to work.

Three.js 0.160.0 (GLTFLoader + DRACOLoader) is loaded from jsdelivr via the `<script type="importmap">` block in `index.html`. JSZip 3.10.1 is loaded from cdnjs. Inter font from Google Fonts.

## Running locally

ES modules + CDN imports require an HTTP server, not `file://`:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Key concepts

- **Part matching** (`partMatchesConfig` in `js/app.js:597`) filters `partsManifest.parts` using three optional predicates per part: `requires` (all keys must equal), `requiresAny` (each listed key's config value must appear in its allowed array), `excludeIf` (any match disqualifies).
- **STL-only parts** live in `partsManifest.stlOnlyParts`. They are bundled in downloads but never rendered.
- **Colors**: most categories pull `state.mainColor` / `state.accentColor` (user-pickable). Sub-part routing is **manifest-driven**: a part (or its category) can declare a `colorMap` (and an optional `colorMapHex` for the multi-colour Hex Cowl variant) listing mesh names per role — `accent`, `main`, `hidden`. The router (`applyMaterial` in `js/app.js`) matches each mesh's name against those lists using a three-tier rule borrowed from CADScope: cleaned name (`cleanNodeName`), name with `-N` numeric suffix stripped, then parent name. Unmatched meshes inherit the part's category default from `getCategoryDefault`. Mesh names must come through the CADScope STEP→GLB pipeline (see README) so this matching is reliable.
- **Transforms** in the manifest are in mm (position) and degrees (rotation). OnShape exports in meters; `globalScale: 1000` rescales on load and the per-part `transform` is applied after this scale.
- **Downloads** stream from `https://raw.githubusercontent.com/Armchair-Heavy-Industries/A4T/main/STL/` and `.../3mf/`. Any Prusawire-specific files must be mirrored into that repo or `GITHUB_STL_BASE` / `GITHUB_3MF_BASE` in `app.js` updated to a new source.
- **Sharing**: `getShareableState()` → base64-JSON → URL hash. Loaded by `loadStateFromHash()` on page load and `hashchange`. Falls back to `sessionStorage` (key: `a4t-config`).

## Adding a part

1. Export from OnShape as `.gltf` into `models/<Category>/`.
2. Add an entry under the matching category in `partsManifest.parts`. The `file` field has no extension — `fileExtension` (`"gltf"`) is appended automatically. See the docblock at the top of `partsManifest.js` for the full template and transform conventions.
3. STL download paths are derived from `file` unless overridden via `stlPath`. Hex-cowling variants prepend `"Hex "` to the filename and pull from the `/3mf/` base.
4. If a new option exists (a new dropdown value, a new `wwbmg*` sub-config), wire it into `defaultConfig` and `validateConfig` in `app.js`, the matching `<select>` in `index.html`, and the relevant rules in `updateDisabledOptions`.

## Naming caveat

UI / branding say "Prusawire 2026.R1", but most identifiers, file paths, sessionStorage key (`a4t-config`), GitHub download base, and comments still say "A4T". Treat A4T-named code as the live system unless an explicit rename is in flight — don't reflexively rename it without scope agreement.
