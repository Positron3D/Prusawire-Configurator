# Prusawire-Configurator

A static, browser-based 3D configurator for the Prusawire 2026.R1 printer. Pick build options (mainboard, PSU, pulleys, frame, toolhead, …), see a live preview of the whole machine, and share your configuration by URL. Inspired by and based on the [A4T Toolhead Configurator](https://a4t.dwtas.net/).

## Running locally

ES modules and CDN imports require an HTTP server, not `file://`:

```sh
./sync-models.sh          # copy the model assets from a sibling CADScope checkout
python3 -m http.server 8000
# open http://localhost:8000
```

STL downloads fetch from the Prusawire GitHub repo (`downloads.base` in the manifest). For local testing, `sync-models.sh` links `stls/` to a sibling `Prusawire-erikbuild/STLs` checkout — open `http://localhost:8000/?stlBase=stls/` to download from it instead.

## Authoring the model and options

The configurator is entirely data-driven by three generated files in `models/` (gitignored — supplied by `sync-models.sh` or at deploy time):

- **`Prusawire_2026.R1.glb`** — one composite Draco GLB containing every build variant, produced by the [CADScope](https://github.com/erikbuild/CADScope) STEP→GLB pipeline.
- **`Prusawire_2026.R1.manifest.json`** — options, choices, and per-part `visible: { when/unless }` rules.
- **`Prusawire_2026.R1.colors.json`** — palette, autoAssign color rules, and per-node overrides.

All three are generated from a single hand-authored spec — `CADScope/models/Prusawire_2026.R1.spec.yaml` — by `CADScope/model_converter/build_configurator.py` (schema reference: `CADScope/model_converter/SPEC.md`). To change options, visibility, names, or colors: edit the spec there, regenerate, and re-run `./sync-models.sh`. Never hand-edit the generated files.

## Structure

See [`CLAUDE.md`](./CLAUDE.md) for a tour of the code. Run the unit tests with `node --test tests/manifest_rules.test.js tests/sidecar_colors.test.js`.

## License

MIT with Commons Clause — see [`LICENSE`](./LICENSE).
