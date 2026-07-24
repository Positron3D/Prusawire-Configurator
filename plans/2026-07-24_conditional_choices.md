# Conditional choices: gate bearing types on the selected Z rod

## Context

`z_rod_bearing` (LM10LUU/LM8UU/LM8LUU) is independent of `z_rod`, so a 10mm
rod + LM8 bearing combo is currently selectable — showing adapters and
downloading STLs that make no physical sense. Erik chose the **conditional
choices** mechanism: a selection choice may carry a `when:` clause; the PWC
UI filters unavailable choices live and auto-resets an invalidated selection.
Generic — any future cross-option constraint reuses it.

## CADScope (TDD)

1. `model_converter/spec.py` `_parse_options`: per-choice optional `when:` —
   must be a non-empty mapping, values string/bool or lists thereof (same
   validation as `_parse_downloads` clauses); emitted verbatim on the choice.
   SpecError on bad shapes.
2. `model_converter/SPEC.md`: document choice-level `when` under Option
   types ("choice is offered only while the clause matches; the manifest
   consumer filters and auto-resets").
3. Tests first: `test_spec.py` (round-trip, bad shape), e2e in
   `test_build_configurator.py` (manifest carries choice `when`).
4. `models/Prusawire_2026.R1.spec.yaml` — `z_rod_bearing` choices:
   - `lm10luu` → `when: { z_rod: [10x320, 10x325, 10x330, 10x341] }`
   - `lm8uu`, `lm8luu` → `when: { z_rod: [8x320, 8x325, 8x330] }`
   Scene/download clauses stay single-key — validity is guaranteed by the
   UI plus config reconciliation (which also sanitizes stale share URLs).

## PWC (TDD)

5. `js/manifest_rules.js`:
   - `availableChoices(optionBody, config)` — choices whose `when` is absent
     or passes `matchesClause`.
   - `reconcileConfig(configOptions, config)` — returns a corrected copy:
     for each selection option whose current value is not among available
     choice ids, pick the flagged default if available, else the first
     available choice; loop until stable (bounded) so cascades settle.
   Tests: filtering, reset-to-default vs reset-to-first, untouched valid
   config, cascade convergence.
6. `js/options_ui.js`: controller gains `refresh(config)` — radio labels of
   unavailable choices get `style.display = 'none'`; dropdown `<option>`s
   get `hidden` + `disabled`. Imports `availableChoices`.
7. `js/app.js`: option onChange sets the key, then
   `state.config = reconcileConfig(...)`, `optionsUI.refresh(state.config)`,
   `optionsUI.setValues(state.config)`, `updateConfiguration()`, save.
   Same reconcile+refresh after the bootstrap restore and on `hashchange`.

## Verification

```sh
cd ~/Code/CADScope && model_converter/.venv/bin/python -m unittest model_converter.test_spec model_converter.test_build_configurator
cd ~/Code/Prusawire-Configurator && node --test tests/manifest_rules.test.js tests/sidecar_colors.test.js && node --check js/app.js js/options_ui.js
./sync-models.sh && python3 -m http.server 8000
```

Browser: default shows only LM10LUU in the bearing list; pick 8mm rod →
LM10LUU disappears, selection auto-moves to LM8UU, adapters appear in the
scene and the LM8UU STL joins the download; back to 10x325 → resets to
LM10LUU. Share-URL round trip with an invalid combo reconciles on load.

Staging folds into the pending CADScope options commit (message gains a
conditional-choices line) and one new PWC commit.
