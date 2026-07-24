# Prusawire-Configurator: adopting the CADScope manifest schema

Handoff document. Lives in both repos:

- `CADScope/plans/2026-05-10_pwc_handoff.md` (source / outgoing)
- `Prusawire-Configurator/plans/2026-05-10_consume_cadscope_manifest.md` (target / incoming)

## Context

The CADScope `spec.yaml` → `manifest.json` generator (`model_converter/build_configurator.py`) now emits a richer `configOptions` block: every option and every selection choice can carry a `description:` string, and selection options carry a `type:` widget hint (`radio` default, `dropdown`, or any other string for forward-compat). Boolean options can also carry `description:`. See `CADScope/model_converter/SPEC.md` § "Option types" and `CADScope/plans/2026-05-10_option_descriptions.md`.

Prusawire-Configurator (PWC) currently uses a **hand-coded** `js/partsManifest.js`, not the generated manifest. The new fields land in PWC's UI only after PWC starts consuming the generated `manifest.json` shape (or after PWC's hand-coded manifest is extended in the same shape). This document captures the schema deltas, two migration paths, and the code locations to touch in either case. Per `CADScope/MEMORY.md`, the broader Prusawire migration has been blocked on the composite GLB.

## Schema deltas PWC needs to reconcile

| Concept | PWC `partsManifest.js` (today) | CADScope `manifest.json` (generated) |
|---|---|---|
| Option choices | `options: [{id, label, default}]` | `choices: [{id, label, default, description?}]` |
| Option widget hint | (none) | `type: "radio" \| "dropdown" \| "bool" \| <custom>` |
| Option/choice help text | (none — `description` exists at PART category level, different concept) | `description:` on option AND each choice (both optional) |
| Compatibility rules | `compatibility: { id: { incompatibleWith, compatibleExtruders, requiresAny, ... } }` (custom shape) | `compatibility: [{when:{...}, incompatible:bool, message:str}]` (uniform list) |
| Parts/variants | `parts: { category: { variants: { id: { file, requires, requiresAny, excludeIf, transform, ... } } } }` | `parts: [{id, nodes:[path], visible:{when?,unless?}, hidden?, stl?, visualOnly?}]` (flat array) |
| Asset path | `basePath`+`fileExtension`+per-part `file` | `glb` (single GLB) + optional `stlBase` |
| Asset format | GLTFs, one per variant | One composite GLB containing all variants; visibility toggles which nodes render |

The CADScope shape is fundamentally **composite-GLB-driven**: one model file, with `nodes[].visible.when` toggling sub-trees. PWC today is **per-variant-GLTF-driven**: one file per option permutation, with `requires`/`excludeIf` filtering which files load. Those are different architectures, not just different field names.

## Two migration paths

### Path A — full migration (recommended once the Prusawire composite GLB lands)

1. Generate `Prusawire_2026.R1.spec.yaml` + composite GLB through `build_configurator.py`.
2. Replace `js/partsManifest.js` with a fetch of `models/<model>.manifest.json` at startup.
3. Rewrite the option-rendering layer in `app.js` to consume `choices` + `type` + `description` instead of `options`.
4. Rewrite `partMatchesConfig` to read `parts[].visible.when/unless` against `config` (matches CADScope's `evaluate_visible` semantics — single key/value AND across `when`, then visible UNLESS the `unless` clause matches).
5. Move asset loading from per-variant GLTFs to single-GLB-with-visibility-toggles.
6. Migrate `compatibility` to the new list-of-rules shape.

### Path B — schema-only adoption (short-term)

Keep PWC's hand-coded `partsManifest.js` but extend its shape to mirror the new spec:

- Rename `options:` → `choices:` (or accept both during transition).
- Add `type:` and `description:` (option and choice level) as optional fields.
- Update the UI renderer to display descriptions and switch widget when `type: dropdown`.
- Unlocks the new copy/UX wins now without forcing the GLB migration.

Path B is small (a few hundred lines in `app.js` + `partsManifest.js`); Path A is a real project. Both are valid; pick based on whether the composite GLB is close.

## New field semantics PWC's renderer needs to handle

```js
// Option-level description: shown beside the question label
{ label: "Spindle",
  description: "Which spindle ships on the Z carriage. ...",
  type: "radio",
  choices: [...] }

// Choice-level description: shown beside each radio/option
{ id: "ac_15kw",
  label: "15 kW AC",
  description: "1.5 kW AC spindle. ..." }

// Widget hint values to support:
type: "radio"      // default for selections — render as <input type=radio> list
type: "dropdown"   // render as <select>
type: "bool"       // render as <input type=checkbox> (no choices)
type: <anything>   // unknown values: fall back to radio + warn in console; don't error
```

The "soft on unknown" rule matters — it lets the spec introduce `tabs`, `image_grid`, etc. later without breaking older PWC builds.

## Code locations to touch in PWC

### Path B (schema-only)

- `js/partsManifest.js` — add `description:` to each existing `configOptions` value + per-option entries; add `type:` (mostly `"radio"`, occasionally `"dropdown"`); rename `options` → `choices` (or support both).
- `js/app.js` — option-rendering code (search for where `<select>` / radio buttons are built from `configOptions`); add description rendering and the `type` switch.
- `css/style.css` — small style for description text (muted, below the label/choice).

### Path A (full migration)

- `js/app.js:11` — replace `import { partsManifest } from './partsManifest.js'` with a runtime `fetch('models/<id>.manifest.json')`.
- `js/app.js:346, 721+` — `partsManifest.parts` / `partsManifest.compatibility` consumer sites: rewrite to traverse the new flat `parts` array + visibility predicates.
- `js/partsManifest.js` — becomes obsolete or a thin loader.
- Compatibility logic — rewrite around the uniform `[{when, incompatible, message}]` list.

## Test scenarios to verify after either path

1. Option with no `description:` renders unchanged (no empty `<p>` blocks).
2. Option with description renders the help text beside the question.
3. Choice with description renders the help text beside that choice only.
4. `type: dropdown` renders a `<select>`; `type: radio` (or absent) renders radios.
5. Manifest with unknown `type:` (e.g., `tabs`) doesn't crash; falls back to radio and logs a console warning.
6. `type: bool` still renders a checkbox.
7. Existing PWC option flows still work after the schema rename (regression on the carriage/hotend/extruder pickers).

## Working example to drive the migration

The current Voron Cascade spec on the CADScope `shared-spec-generator` branch is the reference:

- `models/Voron_Cascade.spec.yaml` — six options exercising every new shape: `radio` selections with option- and choice-level `description`, plus two `bool` options with option-level `description`.
- `models/Voron_Cascade.manifest.json` — what the generator emits today; drop this into a PWC test page during renderer work to drive the new fields end-to-end.

## Next actions

1. Decide Path A vs B based on the composite-GLB status.
2. If Path A: confirm the Prusawire composite GLB is ready (or schedule its production through `CADScope/model_converter/convert.sh`).
3. Open a PWC session pointed at this document and implement against the Voron Cascade manifest as a stand-in until the Prusawire manifest exists.
