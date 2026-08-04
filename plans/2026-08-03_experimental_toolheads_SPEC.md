# Experimental Toolhead Options (AntHead, Jabberwocky) — Design

**Goal:** Offer the two experimental toolhead mounts as choices on the existing
Toolhead option. Selecting one hides the toolhead in the 3D preview, shows an
informational warning, and swaps the correct STLs into the download ZIP.

Nearly all of the change lands in
`CADScope/models/Prusawire_2026.R1.spec.yaml` and flows through
`build_configurator.py` → `./sync-models.sh` — the rules engine already
handles array-valued `when` clauses, option-gated download groups, and
`compatibility` warning messages. One line of `js/app.js` rides along: init
calls `updateConfiguration()` after restoring state so warnings evaluate on a
fresh page load. (Previously only the interaction paths evaluated them —
invisible while `compatibility` was empty, surfaced by the share-URL
acceptance test.)

## Decisions (Erik, 2026-08-03)

- AntHead and Jabberwocky are choices on the existing `toolhead` option,
  labeled "(Experimental)".
- Viewer shows a bare carriage when an experimental toolhead is selected — the
  Stealthburner/Afterburner subtrees hide via their existing `when` gates, and
  nothing renders in their place. The stock `x_carriage_left/right` printed
  parts stay visible (they are not toolhead-gated).
- ZIP swaps, not additions: AntHead replaces the stock x-carriage pair;
  Jabberwocky replaces the x-carriage pair **and**
  `[a]_belt_tensioner_retainers.stl` (its `PW_X_carriage_belt_clips.stl` is
  the equivalent part).
- A warning notice renders while an experimental toolhead is selected.
- AntHead's `README.md` ships in its ZIP group (it carries sourcing and
  feedback instructions). Jabberwocky has no README yet; add one to its group
  if it gains one before release.
- No new unit tests: the pure modules are unchanged and their fixture-based
  suites stay green. Verification is manifest-diff review plus a scripted
  manual sweep (below).

## Spec changes

All in `CADScope/models/Prusawire_2026.R1.spec.yaml`.

### 1. Toolhead choices

```yaml
toolhead:
  label: "Toolhead"
  choices:
    - { id: stealthburner, label: "Stealthburner (Revo)", default: true }
    - { id: afterburner,   label: "Afterburner (With Owl)" }
    - { id: anthead,       label: "AntHead (Experimental)" }
    - { id: jabberwocky,   label: "Jabberwocky (Experimental)" }
```

### 2. Downloads

Remove from `always`:

- `X_Gantry/x_carriage_left.stl`
- `X_Gantry/x_carriage_right.stl`
- `X_Gantry/[a]_belt_tensioner_retainers.stl`

Add to `groups`:

```yaml
- when: { toolhead: [stealthburner, afterburner] }
  files:
    - "X_Gantry/x_carriage_left.stl"
    - "X_Gantry/x_carriage_right.stl"
- when: { toolhead: [stealthburner, afterburner, anthead] }
  files:
    - "X_Gantry/[a]_belt_tensioner_retainers.stl"
- when: { toolhead: anthead }
  files:
    - "Experimental Files/AntHead/README.md"
    - "Experimental Files/AntHead/x_carriage_db_anthead_left.stl"
    - "Experimental Files/AntHead/x_carriage_db_anthead_right.stl"
- when: { toolhead: jabberwocky }
  files:
    - "Experimental Files/Jabberwocky/JW_Belt_mounts.stl"
    - "Experimental Files/Jabberwocky/JW_carriage_mounts_presupported.stl"
    - "Experimental Files/Jabberwocky/JW_front_mount_plate.stl"
    - "Experimental Files/Jabberwocky/PW_X_carriage_belt_clips.stl"
```

The existing `when: { toolhead: stealthburner }` umbilical-strain-relief group
is untouched.

### 3. Warnings

New top-level `compatibility` block (currently absent). Entries need only
`when` + `message`; the compiler passes them through and the configurator
renders any whose `when` matches.

```yaml
compatibility:
  - when: { toolhead: anthead }
    message: "AntHead is an experimental toolhead mount and is not shown in the 3D preview. Its README (included in the download) covers sourcing the rest of AntHead and where to send feedback."
  - when: { toolhead: jabberwocky }
    message: "Jabberwocky is an experimental toolhead mount and is not shown in the 3D preview."
```

## Viewer behavior (no changes required)

`XZ_Axis/.../X_Carriage/Stealthburner` is gated
`when: { toolhead: stealthburner }` and the Afterburner assembly
`when: { toolhead: afterburner }`. An experimental selection matches neither
gate, so both subtrees hide and the carriage renders bare. No new node rules.

## Regeneration & verification

1. Regenerate manifest + sidecar with `build_configurator.py`, copy into this
   repo with `./sync-models.sh`.
2. Diff `models/Prusawire_2026.R1.manifest.json`: expect exactly the two new
   choices, the downloads restructure, and the new `compatibility` list — no
   `parts` churn. `colors.json` and the GLB should be byte-identical.
3. `node --test tests/manifest_rules.test.js tests/sidecar_colors.test.js`
   stays green.
4. Manual sweep on a local server: four toolhead choices render; each
   experimental pick empties the carriage and shows its warning; switching
   back restores the toolhead and clears the warning; the ZIP file list is
   correct for all four toolheads (spot-check the three moved files);
   share-URL round-trips a `toolhead: anthead` config. Use `?stlBase=`
   pointed at a local copy of the Positron3D `STLs/` tree to exercise the
   Jabberwocky downloads before that folder is on GitHub.

## Dependencies & risks

- **Jabberwocky is not on GitHub yet** (untracked in Prusawire-Positron3D).
  Its download URLs 404 until Erik pushes the folder. The AntHead titlecase
  rename (`Anthead` → `AntHead`, commit `29b6ad8`) is committed locally but
  also unpushed. **Push Prusawire-Positron3D before deploying the regenerated
  manifest** — raw.githubusercontent.com paths are case-sensitive.
- Old share URLs and stored sessions are unaffected: existing `toolhead`
  values remain valid, and unknown values were never possible.
