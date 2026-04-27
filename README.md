# Prusawire-Configurator

A static, browser-based 3D configurator for the Prusawire 2026.R1 toolhead. Pick options, see a live preview, and download a ZIP of matching STL / 3MF files. Inspired by and based on the [A4T Toolhead Configurator](https://a4t.dwtas.net/).

## Running locally

ES modules and CDN imports require an HTTP server, not `file://`:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Authoring 3D models

**All GLBs loaded by the configurator must be produced through the [CADScope](https://github.com/erikbuild/CADScope) STEP→GLB pipeline.** That pipeline is the source of truth for mesh-name normalization (spaces → underscores, `.step` stripped, illegal characters removed), and the configurator's per-part color router relies on those normalized names matching the entries declared in `js/partsManifest.js`. Hand-exported GLBs from OnShape, Blender, etc. will load — but sub-part coloring (e.g., the WW-BMG motor plate, hex-cowl insert) will silently fall back to the part's default color when names don't line up.

The pipeline scripts and instructions live in [`CADScope/model_converter/`](https://github.com/erikbuild/CADScope/tree/main/model_converter) — start with `convert.sh` for STEP files and `dump_parts.py` to scaffold the mesh-name list a new part variant should match.

## Structure

See [`CLAUDE.md`](./CLAUDE.md) for a tour of the code, manifest format, and how to add a part.

## License

MIT with Commons Clause — see [`LICENSE`](./LICENSE).
