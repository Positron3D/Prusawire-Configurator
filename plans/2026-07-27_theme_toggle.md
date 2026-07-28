# Light/Dark Theme Toggle Port — Implementation Plan

> Ported from CADScope's approved design (`CADScope/plans/2026-07-27_theme_toggle_SPEC.md`
> and `2026-07-27_theme_toggle.md`). Erik's port decisions (2026-07-27): CADScope
> sun/moon slider style; placed far right in `.header-links` after Discord;
> browser e2e explicitly skipped for this repo (unit tests + scripted manual sweep).

**Goal:** Same theme feature as CADScope 1.8.0: labeled sun/moon switch, dark
default, per-device persistence, canvas background follows the theme.

**Deltas from CADScope:**
- localStorage key is `prusawire-theme` (matches this repo's `prusawire-config` naming; origins differ so nothing is shared).
- The Three.js scene is created lazily by `initThreeJS()` only when the opt-in
  3D preview loads — the `themechange` listener guards on `scene` existing, and
  `initThreeJS()` applies the themed background at creation.
- This repo uses 4-space indentation — match it.
- Extra hardcoded colors to promote beyond CADScope's set: radio dot
  (`background: white`), `.btn-download` / `#dev-copy-transform` text
  (`color: white`), and the `.warnings` amber tint
  (`rgba(251, 191, 36, 0.1)` → `--warning-bg`, same value in both themes).
- `--gradient-primary` stays untouched.

## Global Constraints

- Only Erik commits; suggest exact paths, never `git add .`.
- New files start with two `// ABOUTME:` lines.
- Verify modules with `node --check --input-type=module < file`.
- Attribute contract identical to CADScope: absent = dark, `data-theme="light"` on `<html>` = light.

---

### Task 1: Theme module (TDD)

- Branch: `git checkout -b theme-toggle`.
- Create `tests/theme.test.js` — identical cases to CADScope's
  (resolveTheme: light/dark/garbage/empty/`LIGHT`/null/undefined; nextTheme flips).
- Run `node --test tests/theme.test.js` → fails (`ERR_MODULE_NOT_FOUND`).
- Create `js/theme.js`: CADScope's `assets/theme.js` with `STORAGE_KEY =
  'prusawire-theme'` and 4-space indentation. Full module in one task (pure
  functions + `initTheme()`), since the reference implementation already exists
  and is verified.
- Tests pass; `node --check --input-type=module < js/theme.js` clean; full suite
  (`node --test tests/*.test.js`) green.
- Prompt Erik: `git add js/theme.js tests/theme.test.js` /
  `"Add theme resolution logic with unit tests."`

### Task 2: CSS

In `css/style.css`:

- Append to `:root` (after `--gradient-primary`):
  `--viewport-bg: #0a0c10`, `--hover-overlay: rgba(255, 255, 255, 0.05)`,
  `--hover-overlay-strong: rgba(255, 255, 255, 0.1)`,
  `--overlay-bg: rgba(26, 26, 46, 0.9)`,
  `--overlay-bg-strong: rgba(26, 26, 46, 0.95)`,
  `--badge-bg: rgba(10, 12, 16, 0.8)`,
  `--warning-bg: rgba(251, 191, 36, 0.1)`, `--on-accent: #ffffff`.
- Replacements (dark values preserved exactly):
  `.option:hover` bg → `var(--hover-overlay)`;
  radio `:checked::after` bg white → `var(--on-accent)`;
  checkbox `:checked::after` color white → `var(--on-accent)`;
  `.warnings` bg → `var(--warning-bg)`;
  `.btn-download` color white → `var(--on-accent)`;
  `.viewer-btn:hover` bg → `var(--hover-overlay-strong)`;
  `.viewer-btn:active, .viewer-btn.active` color white → `var(--on-accent)`;
  `.loading-indicator` bg → `var(--overlay-bg)`;
  `#dev-copy-transform` color white → `var(--on-accent)`;
  `.attribution` bg → `var(--badge-bg)`;
  `.viewer-notice` bg → `var(--overlay-bg-strong)`.
- Add `:root[data-theme="light"]` block after `:root` — same values as
  CADScope: bg `#f6f8fa`/`#ffffff`/`#f0f3f6`/`#e6eaf0`; accent
  `#9a6700`/`#bf7d00`/`#de9400`; text `#1f2328`/`#57606a`/`#8c959f`; borders
  `#d0d7de`/`#afb8c1`; `--viewport-bg: #e8ecf0`; overlays flipped to
  white/black rgba as in CADScope. No `--warning-bg` or `--gradient-primary`
  override.
- Add `.theme-switch` styles (verbatim from CADScope's viewer.css, 4-space
  indent) next to `.preview-toggle` at the end of the file.
- Verify: old literals only remain as `:root` definitions; brace balance.
- Prompt Erik: `git add css/style.css` /
  `"Add light theme palette and promote hardcoded colors to variables."`

### Task 3: Markup + wiring

- `index.html`: pre-paint script after the stylesheet link (line 12), reading
  `prusawire-theme`; switch markup (☾ / checkbox `id="themeToggle"`
  `role="switch"` `aria-label="Light theme"` / track / ☀) as the LAST child of
  `.header-links`, after the Discord link.
- `js/app.js`:
  - `import { initTheme } from './theme.js';` with the local imports.
  - In `initThreeJS()`: replace `scene.background = new THREE.Color(0x0a0c10);`
    with `applyViewportBackground();`.
  - Module scope (near `requestRender`):
    ```js
    // Canvas background follows the active UI theme.
    function applyViewportBackground() {
        const bg = getComputedStyle(document.documentElement).getPropertyValue('--viewport-bg').trim();
        scene.background = new THREE.Color(bg);
    }

    document.addEventListener('themechange', () => {
        if (!scene) return;
        applyViewportBackground();
        requestRender();
    });
    initTheme();
    ```
    Placement after the `renderQueued` declaration to avoid TDZ when
    `initTheme()` dispatches synchronously.
- Syntax checks + full test suite.
- Browser sweep (scripted, port 8000): dark default; toggle to light (UI now,
  canvas after enabling 3D preview); persistence both ways across reload;
  garbage → dark; Space toggles; enable 3D preview while light → canvas comes
  up light.
- Prompt Erik: `git add index.html js/app.js js/theme.js` (theme.js only if
  changed) / `"Add light/dark theme toggle to the title bar."`

### Task 4: Docs sweep

- Check README.md / CLAUDE.md for statements the feature invalidates
  (`css/style.css — dark-theme styles` line in CLAUDE.md needs updating to
  mention the light override). Update matching lines only.
- Final verification pass; prompt Erik to commit.
