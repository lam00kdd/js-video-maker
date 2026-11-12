# CP5.0 — Creative Visual DSL v3 proposal

**Status:** proposed only; none of this schema is implemented by the current app. The JSON examples under `examples/cp5.0-v3/` are design fixtures and are not importable by today’s renderer.

## Goals

Let a visual director specify coherent educational scenes in compact declarative JSON: reusable illustrations, semantic layout, style, timing, camera framing, aspect-specific compositions, local media and pinned character references. The renderer resolves and validates all references before drawing. The document contains no executable code and never embeds the Published Character Library.

## Proposed top-level contract

```json
{
  "schema": "lam.motion.video",
  "schema_version": 3,
  "title": "...",
  "language": "vi-VN",
  "topic": "...",
  "audience": "...",
  "learning_objectives": ["..."],
  "structure": {"opening": "...", "development": "...", "conclusion": "..."},
  "aspect_ratio": "both",
  "voice": {"voice_id": "...", "rate": 1},
  "subtitles": {"enabled": true, "size": "large", "safe_region": "subtitle"},
  "metadata": {"social": {}, "youtube": {}},
  "art_direction": {"palette": {}, "type_style": "...", "illustration_style": "..."},
  "assets": [], "symbols": {}, "characters": [],
  "variants": {"landscape": {"scenes": []}, "portrait": {"scenes": []}}
}
```

For one aspect ratio use root `scenes`; for `both`, require independent `variants.landscape.scenes` and `variants.portrait.scenes`. Narration, scene IDs, order, and duration align across variants; node layout can differ. The schema requires 1–100 scenes, nonempty Vietnamese narration of at most 1,200 characters per scene, 1–300 seconds per scene and at most 180 seconds of scene time. Enabled outro consumes the same 180-second cap. Voice and subtitle settings, topic/audience, opening/development/conclusion, social/YouTube metadata and educational accuracy rules remain first-class requirements. ISO/IATF scripts must not fabricate clauses, requirements or quotes.

## Scene and visual node model

```json
{
  "id": "pump-cutaway",
  "title": "How the pump moves air",
  "duration_seconds": 12,
  "narration": "...",
  "layout": {"safe_regions": ["title", "subtitle"], "focus": "pump"},
  "camera": {"from": {"x": 0.5, "y": 0.5, "scale": 1}, "to": {"x": 0.5, "y": 0.48, "scale": 1.08}, "duration_seconds": 4},
  "root": {"type": "group", "id": "scene", "children": []},
  "tracks": []
}
```

Each node has stable `id`, `type`, optional local `transform` (`x`,`y`,`rotation`,`scale_x`,`scale_y`,`origin`), `opacity`, `style_ref`, local `style`, `children` where supported, and semantic `role`/`anchor` metadata. Coordinates are normalized to a scene-local 0–1 canvas; node geometry uses local units and the renderer owns pixel conversion. Parent transforms compose in a documented order. Groups can set opacity, clipping and inherited style. Reusable symbols are declared once and instantiated by ID with typed parameters and constrained overrides; validator rejects recursive symbol expansion.

Required node types: group, rect, rounded_rect, ellipse, line, polyline, polygon, path, text, image, symbol_instance, character_instance. MVP path geometry uses compact SVG `d` strings from a strict command subset, with path count/command budgets. Optional clip nodes reference local declarative paths. No HTML, scripts or event handlers.

### Style profile

| Feature | Classification | Notes |
|---|---|---|
| Solid fill, stroke, cap/join, alpha | MVP | Color values normalized and validated |
| Linear gradient | MVP | Bounded stop count; scene-local coordinates |
| Rounded geometry | MVP | Primitive property, not filter |
| Soft shadow | MVP subset | One bounded shadow; deterministic blur budget |
| Group opacity and transforms | MVP | Save/restore bounded by tree depth |
| Radial gradients | Later | Add after parity/performance proof |
| Blur filters | Later | Raster cost and parity risk |
| Blend modes | Later | Browser/encoder differences; whitelist only |
| Arbitrary masks | Later | Start with clip path; masks are expensive |
| External filter graphs | Not recommended | Unbounded cost and inconsistent output |

### Text

Text nodes support font token from a bundled family allowlist, weight enum, pixel/scene-relative size, alignment, baseline anchor, max width, wrap mode, line height, letter spacing and decoration. The validator resolves the bundled font manifest before render; missing fonts produce a diagnostic and deterministic approved fallback. Text background labels and callouts are symbol compositions. Text reveals use character/word timing from bounded tracks, but subtitle rendering remains a separate synchronized overlay. Safe regions are layout constraints consumed by diagnostics and optional deterministic layout.

### Image assets

The video document references `asset_id`; an adjacent package manifest binds ID to MIME, dimensions, byte size, SHA-256, provenance/license, and relative package path. PNG/WebP are MVP; decode and cache once per render job. `fit` is contain/cover/stretch, with explicit crop rect and alpha. Missing or mismatched hash is a preflight error or visibly marked placeholder in preview; never silently substitute a remote resource. Images are not base64 repeated in scene JSON. Package resolver rejects traversal, symlinks escaping package root, URLs and unsupported MIME. Offline render has no network dependency.

### Characters

`characters[]` is a list of immutable references: `character_id`, `character_type` (`sprite`/`rigged`), `published_version`, `checksum`, and optional capability snapshot/approved behavior IDs. Scene nodes refer to a `character_ref` and specify instance ID, placement, visible range, z-order and supported animation track. The resolver verifies identity, type, exact published version and checksum against the existing library; the DSL never copies version records or PNG blobs. A missing version blocks production preflight and provides an actionable diagnostic.

### Timelines

Tracks target node/character IDs and contain bounded keyframes for transform, opacity, draw progress, text reveal and supported character actions. Keyframes specify seconds, value and easing from a fixed enum. Multiple properties/tracks can overlap. Durations must stay inside scene bounds; all values finite; loops require a positive explicit repeat count. No implicit infinite loops. The MVP timeline evaluates pure functions at absolute time so preview and MP4 sample the same state deterministically.

## Layout, aspect ratio and educational composition

Provide optional named layout regions and semantic anchors (`title`, `subject`, `callout`, `subtitle`, `brand`). Author independent portrait and landscape roots: use the same symbol definitions and narration but recompose the scene, move secondary details to insets, and size labels for actual output. Do not auto-stretch a portrait scene into landscape. A future constraint solver may place simple callouts; MVP validates collisions and reports them rather than making hidden aesthetic changes.

## SVG and freeform strategy

| Option | Expressiveness | Safety / deterministic behavior | Size and authoring | Decision |
|---|---|---|---|---|
| A. Structured path commands | Good; verbose curves | Strong validation, easy animation | Can inflate tokens | Support internally and for generated geometry |
| B. SVG path `d` subset | High for illustration; compact | Safe when strict parser permits only M/L/H/V/C/S/Q/T/A/Z with bounded numbers and no references | AI can author; needs parser limits | **Recommended authoring format** |
| C. Sanitized external SVG asset | High, reusable | Parse as XML, allow geometry and safe style attrs only; reject scripts, foreignObject, links, CSS URL/import and external refs | Best in packaged asset bundles | Allow as future import pipeline, rasterize/freeze or normalize on ingest |
| D. Full SVG embedded in JSON | Very high | Large attack surface, namespace/URL/CSS complexity, browser differences | Bloats prompts and duplicates assets | Do not support |

No JavaScript, HTML, data URL indirections, remote references, animation elements, filters outside registry, or external fonts. Parse bounded SVG paths into internal commands once, then render through the shared Canvas2D backend. This makes MP4 parity and security auditable.

## Reusable visual vocabulary

Symbols are data templates, not hard-coded special renderer modes. Initial packs: gear pair, piston/cylinder, valve, circuit, sensor, conveyor segment, robot arm, chart, book, lab tool, arrow, safety sign, callout and speech bubble. Each declares typed parameters, anchors, supported style overrides, semantic labels and optional named animation targets. A video may define its own symbols; curated local packs can be versioned and reused.

## Security and resource budgets (proposal)

Reject unknown schema versions, prototype keys, duplicate IDs, recursive references, non-finite numbers, URLs, path traversal, scripts, HTML, unsupported MIME and unpinned characters. Initial conservative limits: 100 scenes/video; 300 seconds/scene; 180 seconds total including outro; 200 expanded nodes/scene; 2,000 nodes/video; depth 12; 100 path commands/path and 10,000 total path commands/video; 64 symbols; expansion factor 8; 32 animation tracks/node and 2,000/video; 64 keyframes/track; 64 gradient stops; 16 MiB/image and 128 MiB total package; 4096x4096 per raster; 30 fps export. Refine from performance spikes. Use timeouts and cancellation between nodes/frames. Validate-before-render and cap memory/concurrency.

## Renderer recommendation

Adopt a renderer-neutral v3 normalized scene tree, then a small deterministic Canvas2D renderer with modules for vector nodes, text, image cache, symbols, character adapters, compositing, timeline and diagnostics. Preview and MP4 must invoke the same normalized evaluation and draw functions; only target canvas and frame clock differ. Keep WebGL/classic and current render modes behind adapters until CP5.5; do not rewrite current paths as part of CP5.0. A DOM/SVG scene renderer is not recommended as the primary backend because fonts, filters, serialization and export parity are harder to bound. WebGL is unnecessary for the first 2D/2.5D target; fake depth with ordered layers, scale, shadows, parallax and camera transforms.

## Character and asset composition

Before each render: validate package hashes, decode/cache local images, resolve exact Published versions and verify approved capabilities. Convert all nodes and character instances to a single draw list with stable `z`, then stable insertion order. Character rendering remains an adapter to Sprite/Rigged runtimes. Freeze decoded assets and font readiness before preview/export frame sampling.

## Future acceptance gates

Require schema validation, deterministic serialized normalization, security/resource budget tests, golden frame comparisons at identical times, visual test fixture review, preview/export pixel tolerance, landscape/portrait crop review, asset failure diagnostics, and throughput/memory measurements. Human review covers composition and educational truth.
