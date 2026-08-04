# Experimental Toolhead Options (AntHead, Jabberwocky) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> Approved design: `plans/2026-08-03_experimental_toolheads_SPEC.md`.

**Goal:** Add AntHead and Jabberwocky as experimental choices on the Toolhead
option — bare-carriage 3D preview, sidebar warning notice, and correct STL
swaps in the download ZIP.

**Architecture:** Data change plus one line of app wiring. The spec edits land
in `CADScope/models/Prusawire_2026.R1.spec.yaml`; `build_configurator.py`
compiles it to the manifest, `./sync-models.sh` copies it here. The rules
engine already supports everything used; `js/app.js` init additionally calls
`updateConfiguration()` after restoring state so warnings evaluate on a fresh
page load.

**Tech Stack:** YAML spec + Python compiler (CADScope), Node's built-in test
runner, plain static site.

## Global Constraints

- Only Erik commits. Suggest exact `git add` paths and a message, then stop. No
  `Co-Authored-By`/generated-with trailers, ever.
- Never hand-edit files in `models/` — edit the spec and regenerate.
- Both repos involved: `/Users/erik/Code/CADScope` (spec, compiler) and
  `/Users/erik/Code/Prusawire-Configurator` (this repo). Sibling STL source of
  record: `/Users/erik/Code/Prusawire-Positron3D` (folder `STLs/Experimental
  Files/AntHead` — note titlecase; raw.githubusercontent paths are
  case-sensitive).
- Match the spec file's existing YAML style: 2-space indent, inline `{ }`
  choice maps, quoted download paths.
- One-off scripts go in the session scratchpad, not the repo.
- **Deploy gate:** the regenerated manifest must not reach GitHub Pages before
  Erik pushes Prusawire-Positron3D (Jabberwocky folder + AntHead rename are
  local-only right now).

---

### Task 1: Branch + failing pipeline check (red)

**Files:**
- Create: `<scratchpad>/check_experimental_toolheads.mjs` (one-off, never committed)

**Interfaces:**
- Consumes: `defaultConfig(configOptions)` and
  `downloadFileList(downloads, config)` from `js/manifest_rules.js`;
  `models/Prusawire_2026.R1.manifest.json`.
- Produces: the red/green gate Tasks 3 uses to prove the regenerated manifest
  is correct.

- [ ] **Step 1: Create the working branch**

```bash
cd /Users/erik/Code/Prusawire-Configurator
git status --short   # expect clean; if not, STOP and ask Erik
git checkout -b experimental-toolheads
```

- [ ] **Step 2: Write the failing check script**

Write `<scratchpad>/check_experimental_toolheads.mjs`:

```js
// ABOUTME: One-off pipeline check for the experimental toolhead options —
// ABOUTME: asserts manifest choices, warnings, and ZIP swaps for all four toolheads.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { defaultConfig, downloadFileList } from '/Users/erik/Code/Prusawire-Configurator/js/manifest_rules.js';

const manifest = JSON.parse(await readFile(
  '/Users/erik/Code/Prusawire-Configurator/models/Prusawire_2026.R1.manifest.json', 'utf8'));

const toolheadIds = manifest.configOptions.toolhead.choices.map(c => c.id);
assert.deepEqual(toolheadIds, ['stealthburner', 'afterburner', 'anthead', 'jabberwocky'],
  `toolhead choices are ${JSON.stringify(toolheadIds)}`);

const warned = (manifest.compatibility ?? []).map(r => r.when?.toolhead).sort();
assert.deepEqual(warned, ['anthead', 'jabberwocky'], 'compatibility notices missing');

const files = toolhead =>
  downloadFileList(manifest.downloads, { ...defaultConfig(manifest.configOptions), toolhead });
const PAIR = ['X_Gantry/x_carriage_left.stl', 'X_Gantry/x_carriage_right.stl'];
const RETAINERS = 'X_Gantry/[a]_belt_tensioner_retainers.stl';
const UMBILICAL = 'Electronics/umbilical_strain_relief_by_nagelwerkstatt.stl';
const ANTHEAD = [
  'Experimental Files/AntHead/README.md',
  'Experimental Files/AntHead/x_carriage_db_anthead_left.stl',
  'Experimental Files/AntHead/x_carriage_db_anthead_right.stl',
];
const JW = [
  'Experimental Files/Jabberwocky/JW_Belt_mounts.stl',
  'Experimental Files/Jabberwocky/JW_carriage_mounts_presupported.stl',
  'Experimental Files/Jabberwocky/JW_front_mount_plate.stl',
  'Experimental Files/Jabberwocky/PW_X_carriage_belt_clips.stl',
];

for (const [th, want, wantNot] of [
  ['stealthburner', [...PAIR, RETAINERS, UMBILICAL], [...ANTHEAD, ...JW]],
  ['afterburner',   [...PAIR, RETAINERS],            [...ANTHEAD, ...JW, UMBILICAL]],
  ['anthead',       [...ANTHEAD, RETAINERS],         [...PAIR, ...JW]],
  ['jabberwocky',   JW,                              [...PAIR, RETAINERS, ...ANTHEAD]],
]) {
  const list = files(th);
  for (const f of want) assert.ok(list.includes(f), `${th}: missing ${f}`);
  for (const f of wantNot) assert.ok(!list.includes(f), `${th}: unexpectedly contains ${f}`);
}
console.log('all experimental-toolhead checks passed');
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node <scratchpad>/check_experimental_toolheads.mjs`
Expected: FAIL on the first assertion —
`toolhead choices are ["stealthburner","afterburner"]`.

---

### Task 2: Spec edits in CADScope

**Files:**
- Modify: `/Users/erik/Code/CADScope/models/Prusawire_2026.R1.spec.yaml`
  (options `toolhead` ~line 165; `downloads.always` ~lines 207–215;
  `downloads.groups` after the `toolhead: stealthburner` group ~line 257;
  new top-level `compatibility` block after the `options` block ~line 179)

**Interfaces:**
- Produces: the spec Task 3 compiles. Choice ids `anthead` and `jabberwocky`
  are load-bearing — the check script, warning clauses, and download groups
  all reference them.

- [ ] **Step 1: Confirm CADScope is clean**

```bash
git -C /Users/erik/Code/CADScope status --short
```

If anything under `models/` or `model_converter/` is dirty, STOP and ask Erik
how to proceed.

- [ ] **Step 2: Add the two choices**

In the `options:` block, replace:

```yaml
  toolhead:
    label: "Toolhead"
    choices:
      - { id: stealthburner, label: "Stealthburner (Revo)", default: true }
      - { id: afterburner,   label: "Afterburner (With Owl)" }
```

with:

```yaml
  toolhead:
    label: "Toolhead"
    choices:
      - { id: stealthburner, label: "Stealthburner (Revo)", default: true }
      - { id: afterburner,   label: "Afterburner (With Owl)" }
      - { id: anthead,       label: "AntHead (Experimental)" }
      - { id: jabberwocky,   label: "Jabberwocky (Experimental)" }
```

- [ ] **Step 3: Add the compatibility block**

Between the end of the `options:` block (after the `badge_type` choices) and
the `# ZIP download contents…` comment, insert:

```yaml
# Cross-option warnings rendered in the sidebar while their `when` matches.
compatibility:
  - when: { toolhead: anthead }
    message: "AntHead is an experimental toolhead mount and is not shown in the 3D preview. Its README (included in the download) covers sourcing the rest of AntHead and where to send feedback."
  - when: { toolhead: jabberwocky }
    message: "Jabberwocky is an experimental toolhead mount and is not shown in the 3D preview."
```

- [ ] **Step 4: Move the swapped files out of `always`**

Delete these three lines from `downloads.always`:

```yaml
    - "X_Gantry/x_carriage_left.stl"
    - "X_Gantry/x_carriage_right.stl"
    - "X_Gantry/[a]_belt_tensioner_retainers.stl"
```

- [ ] **Step 5: Add the toolhead download groups**

Immediately after the existing group

```yaml
    - when: { toolhead: stealthburner }
      files:
        - "Electronics/umbilical_strain_relief_by_nagelwerkstatt.stl"
```

insert:

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

- [ ] **Step 6: Validate the spec (read-only)**

```bash
cd /Users/erik/Code/CADScope
python3 model_converter/build_configurator.py --check models/Prusawire_2026.R1.glb
```

Expected: parses clean; coverage report unchanged from before the edit (this
change touches no node rules). Any spec error → fix before proceeding.

---

### Task 3: Regenerate, sync, and go green

**Files:**
- Modify (generated): `/Users/erik/Code/CADScope/models/Prusawire_2026.R1.manifest.json`, `…colors.json`
- Modify (synced): `models/Prusawire_2026.R1.manifest.json` (this repo)

**Interfaces:**
- Consumes: the Task 2 spec; the Task 1 check script.
- Produces: the committed manifest Tasks 4–5 verify against.

- [ ] **Step 1: Full build in CADScope**

```bash
cd /Users/erik/Code/CADScope
python3 model_converter/build_configurator.py models/Prusawire_2026.R1.glb
```

Expected: writes `models/Prusawire_2026.R1.colors.json` and
`…manifest.json` (full mode — the spec exists).

- [ ] **Step 2: Sync into this repo, repointing the dev STL tree**

```bash
cd /Users/erik/Code/Prusawire-Configurator
STL_SRC=../Prusawire-Positron3D/STLs ./sync-models.sh
```

The `STL_SRC` override repoints the gitignored `stls` symlink from the
erikbuild checkout (old loose AntHead layout, no Jabberwocky) to the
Positron3D checkout that matches `downloads.base` on GitHub.

- [ ] **Step 3: Run the check script to verify it passes**

Run: `node <scratchpad>/check_experimental_toolheads.mjs`
Expected: `all experimental-toolhead checks passed`.

- [ ] **Step 4: Review the diff surface**

```bash
git status --short          # expect ONLY models/Prusawire_2026.R1.manifest.json modified
git diff models/Prusawire_2026.R1.manifest.json
```

Expected diff: two new toolhead choices, the three moved download files, four
new groups, new top-level `compatibility` list. No `parts` churn; GLB and
colors.json unchanged (content-identical copies). Anything else → stop and
investigate the spec edit.

- [ ] **Step 5: Existing suites stay green**

Run: `node --test tests/manifest_rules.test.js tests/sidecar_colors.test.js`
Expected: all pass.

- [ ] **Step 6: Prompt Erik to commit (both repos)**

- CADScope: `git add models/Prusawire_2026.R1.spec.yaml models/Prusawire_2026.R1.manifest.json models/Prusawire_2026.R1.colors.json` /
  `"Add experimental AntHead and Jabberwocky toolhead options."`
- This repo (on `experimental-toolheads`):
  `git add models/Prusawire_2026.R1.manifest.json` /
  `"Add experimental AntHead and Jabberwocky toolhead options."`

---

### Task 4: Update project docs

**Files:**
- Modify: `CLAUDE.md` (compatibility bullet)

- [ ] **Step 1: Correct the compatibility note**

In `CLAUDE.md`, the Key concepts bullet reads:

```
…uniform `compatibility: [{when, incompatible, message}]` list (currently empty in the spec).
```

Remove the now-false parenthetical so it ends:

```
…uniform `compatibility: [{when, incompatible, message}]` list.
```

- [ ] **Step 2: Prompt Erik to commit**

`git add CLAUDE.md` / `"Note that the spec now populates compatibility warnings."`

---

### Task 5: Browser verification sweep

**Files:** none (verification only)

- [ ] **Step 1: Serve the site**

```bash
cd /Users/erik/Code/Prusawire-Configurator
python3 -m http.server 8000
```

Open `http://localhost:8000/?stlBase=stls/` (use the `run` skill to drive the
browser; anything it can't drive, hand Erik the checklist below).

- [ ] **Step 2: Viewer + warnings checklist**

- Toolhead widget shows four radios, Stealthburner selected.
- Pick **AntHead (Experimental)**: toolhead vanishes (bare carriage — stock
  x_carriage printed parts still visible), warnings panel shows the AntHead
  message.
- Pick **Jabberwocky (Experimental)**: Jabberwocky message replaces it.
- Back to **Stealthburner**: toolhead returns, warnings panel hides.

- [ ] **Step 3: ZIP contents for all four toolheads**

For each toolhead choice, download the ZIP (served from the local `stls/`
symlink via `?stlBase=stls/`) and inspect with `unzip -l`:

- stealthburner: has x_carriage pair + retainers + umbilical strain relief; no
  `Experimental Files/`.
- afterburner: pair + retainers; no umbilical, no `Experimental Files/`.
- anthead: `Experimental Files/AntHead/` README + left/right carriages +
  retainers; no stock pair.
- jabberwocky: the four `Experimental Files/Jabberwocky/` files; no stock
  pair, no retainers.

- [ ] **Step 4: Share-URL round-trip**

Set AntHead + a non-default color, use the share button, open the copied URL in
a fresh tab: config restores with AntHead selected and its warning shown.

---

### Task 6: Wrap-up and deploy gate

**Files:** none

- [ ] **Step 1: Full verification pass**

Run: `node --test tests/manifest_rules.test.js tests/sidecar_colors.test.js`
(use superpowers:verification-before-completion before claiming done).

- [ ] **Step 2: Production URL check — after Erik pushes Positron3D**

Wait for Erik to push Prusawire-Positron3D (`29b6ad8` rename + a Jabberwocky
commit). Then:

```bash
curl -sI "https://raw.githubusercontent.com/Positron3D/Prusawire/main/STLs/Experimental%20Files/AntHead/x_carriage_db_anthead_left.stl" | head -1
curl -sI "https://raw.githubusercontent.com/Positron3D/Prusawire/main/STLs/Experimental%20Files/Jabberwocky/JW_Belt_mounts.stl" | head -1
```

Expected: `HTTP/2 200` for both. Until then, do NOT merge/deploy the
manifest to the Pages branch.

- [ ] **Step 3: Finish the branch**

Use superpowers:finishing-a-development-branch — Erik decides merge timing
(gated on Step 2 passing).
