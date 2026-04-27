# Sync Prusawire-Configurator with latest CADScope

## Context

Prusawire-Configurator is a derivative of an early CADScope. CADScope has since gained a solid set of rendering and UX improvements that Prusawire missed. The configurator core of Prusawire (compatibility rules, multi-part assembly, ZIP downloads) is unique to it and stays untouched — this work is purely a viewer / rendering / coloring upgrade applied on top.

After scoping with Erik, the work is:

1. Modernize Three.js setup (version bump, HDRI + PMREM, ACES tone mapping, soft shadows, sRGB output, dispose hygiene).
2. Improve viewer UX (full view cube, brightness slider, loading-phrase easter egg).
3. Refactor sub-part mesh-name routing to a manifest-driven model using CADScope's three-tier name matching, while keeping the existing main/accent two-slot UI.
4. Add a `README.md` note that GLBs must be authored through the CADScope STEP→GLB pipeline.

A4T → Prusawire naming cleanup is intentionally **out of scope** (separate task).

---

## 1. Three.js modernization (`js/app.js`, `index.html`, new `assets/bg.hdr`)

**Reuse:** `assets/viewer.js` lines 28–106 (renderer + lights + PMREM + RGBELoader) and lines 355–369 (`disposeObject`) in `~/Code/CADSCope`.

- Bump the import map in `index.html:219-226` from `three@0.160.0` to `three@0.164.1`. Add `RGBELoader` to the addons used in `js/app.js`.
- In `initThreeJS()` (`js/app.js:299`) set:
  - `renderer.toneMapping = THREE.ACESFilmicToneMapping`
  - `renderer.toneMappingExposure = 0.5`
  - `renderer.outputEncoding = THREE.sRGBEncoding` (replaces the existing `outputColorSpace = THREE.SRGBColorSpace` line — pick whichever the 0.164 API exposes; check release notes during implementation)
  - `renderer.shadowMap.enabled = true`, `renderer.shadowMap.type = THREE.PCFSoftShadowMap`
- Build a `PMREMGenerator` and load `./assets/bg.hdr` via `RGBELoader`; set `scene.environment` from the prefiltered envmap. Match CADScope's loader config exactly.
- Copy `~/Code/CADSCope/assets/bg.hdr` → `~/Code/Prusawire-Configurator/assets/bg.hdr` (1 MB binary). New `assets/` directory.
- Add a `disposeObject()` helper modeled on CADScope's. Call it inside `updateViewer()` (`js/app.js:880`) when removing parts from `state.activeModels`, and also when `state.loadedModels` cache entries are evicted (today they aren't, so this won't fire unless we add eviction — note in code that the helper is ready when needed). The active-model removal path is the real leak today.

## 2. Viewer UX (`index.html`, `css/style.css`, `js/app.js`)

**Reuse:** `index.html:58-81` viewer-controls block and CADScope's `setView()` / `zoom()` / `resetZoom()` (`assets/viewer.js:606-677`).

- Replace the two-button viewer-controls block in `index.html:194-202` with CADScope's full layout: top/bottom/front/back/left/right + home + zoom-out/zoom-in/reset-zoom + a brightness slider. Keep the wireframe button — it's a Prusawire-only feature worth preserving.
- Port `setView()`, `zoom()`, `resetZoom()` into `js/app.js`. Auto-frame distance should derive from the current scene bounding box (Prusawire computes one implicitly via `centerCameraOnModels` at `js/app.js:980`). Reuse that bounding-box logic to pick the camera distance.
- Add a brightness slider wired to scaling all directional/hemisphere lights from a `BASE_BRIGHTNESS` constant, matching CADScope's pattern (`assets/viewer.js:45-73`). Slider range 0–200, default 150 (= 1.5× base).
- Port the `loadingPhrases` array and the random-pick-on-load behavior. Wire it to `#loading` in `index.html:205-208`.
- Style the new buttons by extending `css/style.css` with the relevant rules from `~/Code/CADSCope/assets/viewer.css` (search-wrapper isn't needed for this scope; just `.viewer-btn`, `.viewer-btn-separator`, `.slider-label` and `input[type=range]`).

## 3. Manifest-driven sub-part coloring (`js/partsManifest.js`, `js/app.js`)

**Reuse:** `cleanNodeName()` and `stripNumericSuffix()` (`~/Code/CADSCope/assets/viewer.js:228-243`), plus the first-match traverse pattern in `applyColorSet()` (lines 245–278).

Today, sub-part routing inside `applyMaterial()` (`js/app.js:484`) is hardcoded substring matching for `motor_plate` / `tension_arm` / `main_body` / `hexagon` / `support`. This is brittle and can't be extended without code changes.

**New manifest field per part variant** (`js/partsManifest.js`), all optional:

```js
"wwbmg-…": {
    file: "…",
    requires: { … },
    transform: { … },
    colorMap: {
        accent: ["motor_plate", "tension_arm"],
        hidden: ["support"]   // mesh names to hide entirely
        // unmatched meshes inherit the part's category-default color (today's behavior)
    }
}
```

For Hex cowling variants (which are a runtime file-path swap, not separate manifest entries today), add a sibling `colorMapHex` field on cowling parts that activates only when `state.config.hexCowl === true`.

**Routing logic in `js/app.js`:**

- Drop the WW-BMG and hex-cowl substring blocks from `applyMaterial()` (`js/app.js:496-531`).
- Replace with a unified router: for each mesh, compute `cleanNodeName(mesh.name)`, `stripNumericSuffix(cleanNodeName)`, and `cleanNodeName(parent.name)`. First-match against the part's `colorMap` (or `colorMapHex` when applicable) wins. Roles map to slots: `main` → `state.mainColor`, `accent` → `state.accentColor`, `hidden` → `mesh.visible = false`. No match → fall through to the existing per-category default in `updateModelColors()` (`js/app.js:549`).
- The user-facing UI (two color pickers) is unchanged. This refactor is purely internal — the manifest is now the truth, the router is generic, and adding a new variant's coloring is a manifest edit instead of a `js/app.js` edit.
- Migrate the existing five hardcoded matches into manifest entries during this change so behavior is preserved.

## 4. README pipeline note (`README.md`)

Replace the one-line README with a brief section stating that all 3D models loaded by the configurator must be produced via the CADScope STEP→GLB pipeline (`~/Code/CADSCope/model_converter/`). The Blender step normalizes mesh names (spaces → underscores, strips `.step` and Three.js illegal chars) so that the `cleanNodeName` router matches reliably; bypassing the pipeline will break sub-part coloring. Link to `~/Code/CADSCope/model_converter/convert.sh` and `~/Code/CADSCope/README.md` for details rather than duplicating instructions here.

---

## Critical files

- `index.html` — import map version, viewer-controls block, loading-text id
- `js/app.js` — renderer setup, HDRI loader, disposeObject, view/zoom/brightness controls, loading phrases, applyMaterial refactor
- `js/partsManifest.js` — new optional `colorMap` / `colorMapHex` fields on existing variants (no schema break; absent field = today's behavior)
- `css/style.css` — styles for new viewer buttons, brightness slider
- `assets/bg.hdr` — new file (copied from CADScope)
- `README.md` — pipeline note
- `CLAUDE.md` — update the "key concepts" coloring bullet to reflect the new router

## Verification

No automated tests in this repo (none in CADScope either), so verification is manual against `python3 -m http.server 8000`:

1. **Renderer**: Page loads with no console errors; envmap visible in reflective surfaces; shadows soft, not jagged; brightness slider scales lighting smoothly across full range.
2. **Viewer UX**: Each of top/bottom/front/back/left/right/home buttons frames the assembly correctly; zoom buttons are responsive; reset returns to home; loading phrase appears once per model load with random selection.
3. **Coloring parity** (the risky bit): For every shipped configuration permutation that touches sub-parts, confirm visually the colors match the pre-refactor build:
   - WW-BMG: no-sensors / single-sensor / dual-sensors × no-crossbow / crossbow × smooth-bearing / bmg-dual-drive idler — main_body should be main color, motor_plate + tension_arm accent.
   - Hex cowl: with `hexCowl` toggled on, support meshes are hidden, hexagon meshes are accent, body is main. With `hexCowl` off, the standard cowling routing is used.
   - Carriages/hotends/extruders/visualOnly: still gray and 60% opaque.
   - Hotend ducts: still 20%-darkened main color.
   - Extruder adapters / board mounts: still accent color.
4. **Memory**: Open devtools Memory tab, switch through 5–10 configurations, force GC, verify GLTF scene count doesn't grow unboundedly. The `state.loadedModels` cache is intentional and should hold; only `state.activeModels` removals should free.
5. **Sharing**: URL-hash share / sessionStorage persistence still round-trips after the manifest changes (no schema break expected, but verify a saved URL from before the change still loads).
6. **Mobile**: Confirm the new viewer-controls block doesn't break the existing mobile layout (`css/style.css` has responsive rules for the config-panel; test on a narrow viewport).
