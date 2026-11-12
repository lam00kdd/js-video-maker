# Creative Visual DSL v3 — CP5.1A implemented contract

**Status:** vector-only foundation implemented in isolation. This is not wired into Video Studio import, project storage, the existing prompt builder, MP4 export or folder batch rendering. The harness and three valid fixtures use the real validator, normalizer and Canvas2D renderer.

## Deliberate CP5.0 decisions

The CP5.0 concept used `schema`/`schema_version`, normalized 0–1 coordinates, image and character references, camera tracks and style tokens. CP5.1A deliberately uses the established codebase naming pattern `visual_dsl_version: 3`, explicit `stage.width/height` viewBox units, and only a renderable vector subset. CP5.0 fixture properties not implemented here are rejected or reserved. No hidden conversion from those design fixtures occurs.

## Top-level video contract

Required fields: `visual_dsl_version: 3`, nonempty `title`, `aspect_ratio`, and either root `scenes` (`16:9` or `9:16`) or `variants.landscape.scenes` plus `variants.portrait.scenes` (`both`). Optional metadata: `language` (only `vi-VN` when specified), `topic`, `audience`, `learning_objectives`, `structure`, `voice`, `subtitles`, `metadata`, `art_direction`, empty `assets`, empty `characters`, `symbols`, and `outro`. Unknown top-level fields are rejected. Voice/subtitle/metadata are preserved for future integration, but CP5.1A does not generate audio or burn subtitles.

Every scene requires `id`, `title`, `duration_seconds`, nonempty `narration` up to 1,200 characters, `stage`, and a `root` group. One variant has 1–100 scenes; each scene is 1–300 seconds; total per variant is <=180 seconds including enabled outro. Paired variants must have equal scene count, narration and scene durations but may use independent stage geometry/layout. Educational content remains Vietnamese by default and must not fabricate ISO/IATF clauses or requirements.

Example scene:

```json
{
  "id": "scene-01",
  "title": "A valve controls airflow",
  "duration_seconds": 8,
  "narration": "Van một chiều giúp không khí chuyển động theo hướng phù hợp.",
  "stage": {"width": 1600, "height": 900, "background": "#F3F7FA"},
  "root": {"id": "scene-root", "type": "group", "children": []}
}
```

## Coordinate and transform contract

- Stage `width`/`height` define a logical viewBox in units, not pixels. Current fixtures use 1600×900 (landscape) or 900×1600 (portrait). Each dimension is positive, at most 2400, area at most 2,880,000, and ratio must match its declared variant within 0.002.
- Origin is top-left; +X points right; +Y points down. Local node geometry uses the units of its parent coordinate space. Rect width/height and path coordinates are local units. Stroke width is local units and is transformed with the object, including nonuniform scale.
- Canvas output uses uniform contain-fit scale `min(canvasWidth/viewBoxWidth, canvasHeight/viewBoxHeight)` and centers the stage. The stage is clipped; content outside its logical bounds is not visible.
- Node transform fields default to x/y 0, rotation 0°, scaleX/scaleY 1, originX/originY 0. Rotation is clockwise-positive degrees in this Y-down system and is bounded to ±360,000°. Translation, origins, and geometry coordinates are finite and bounded to ±1,000,000 units. Negative nonzero scale is supported for mirroring; zero scale is rejected; absolute scale is capped at 100.
- Local-to-world transform is `ParentWorld × T(x,y) × R(clockwise θ) × S(scaleX,scaleY) × T(-originX,-originY) × LocalGeometry`. Canvas2D post-multiplication call order is translate, rotate, scale, translate negative origin. Parent transforms apply before child-local transforms.
- `z_index` sorts only among siblings in one group; ties preserve source order. A group is composited at its sibling slot. Symbol content remains inside the symbol instance's slot and its own child ordering. Input arrays are never sorted or mutated.

## Implemented nodes and styles

Nodes: `group`, `rect`, `rounded_rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `path`, `text`, `symbol_instance`.

Each node needs a unique local-tree `id` and `type`; applicable fields include `geometry`, `transform`, `style`, `z_index`, `opacity` [0,1], `visible`, and group `children`. Groups use ordered children and bounded depth. Leaf nodes cannot contain children. Unknown properties fail validation.

Styles: `fill`, `stroke`, `stroke_width`, `line_cap`, `line_join`. Colors are `#RGB`, `#RRGGBB`, `none`, null or omitted. Stroke width is 0–200 viewBox units; caps are butt/round/square; joins miter/round/bevel. Fill and stroke are solid only. Node opacity applies once to the node. Group opacity <1 renders descendants into one bounded canvas-sized offscreen layer and composites once, so overlapping children do not darken each other through repeated alpha multiplication. This path requires Canvas2D transform capture plus OffscreenCanvas or a document canvas factory.

Text is a single Canvas2D line with `x`, `y`, `text`, optional font size 1–300 viewBox units, font family from Arial/sans-serif/serif/monospace, align left/center/right and baseline top/middle/alphabetic/bottom. Text length <=512. Wrapping, bundled fonts, font weights, deterministic cross-platform shaping and text animation are not implemented; browser font rasterization may differ by OS.

## Path grammar

`geometry.d` is a path string <=4096 characters and <=160 commands. Supported commands are `M/m`, `L/l`, `H/h`, `V/v`, `C/c`, `S/s`, `Q/q`, `T/t`, `Z/z`; repeated coordinate groups and relative commands are converted to absolute canonical move/line/cubic/quadratic/close operations during normalization. Arc `A/a` is deliberately rejected with an actionable diagnostic; unsupported letters, markup, URLs and malformed/nonfinite/over-limit coordinates are rejected. No raw SVG/XML, CSS, HTML, URL, script or JavaScript expression is evaluated. Cubic/quadratic paths render directly through Canvas2D path calls.

## Symbols

`symbols` is a keyed registry; each entry contains `view_box:{width,height}` and a group `root`. A `symbol_instance` uses `geometry:{symbol,width,height}` where dimensions map the symbol's local viewBox into parent units. It supports the ordinary node transform, opacity, visibility and z-index plus optional solid style `style_overrides`. Overrides are applied to symbol descendants without mutating definitions. Missing symbols, recursive references and expanded-size overflow fail semantic validation. Maximum 32 definitions, depth 6, 160 source nodes per tree, and 320 expanded nodes per scene. Symbol IDs are globally named; IDs within each definition are local.

## Validation, normalization and diagnostics

`validateVisualDslV3Structure()` checks envelope, field types, node-local shape, colors, transform values, stage, text and source resource caps. `validateVisualDslV3()` adds unique IDs, symbol resolution and cycle detection, expansion budget and paired variant invariants. Errors are `VisualDslV3ValidationError` with `diagnostics[]` entries `{path,code,message}`; paths identify variant/scene, node ID and field where applicable. `normalizeVisualDslV3()` validates then creates a fresh canonical tree, fills defaults, parses paths once, preserves declared variant separation, and recursively freezes the output. It never mutates user input or falls back to legacy schema.

## Resource budgets

| Resource | Limit | Reason |
|---|---:|---|
| Scenes per variant | 100 | Retains required video series scale |
| Scene duration / total | 300 s / 180 s | Existing product rules |
| Stage dimension / area | 2400 / 2,880,000 units² | Keeps coordinate magnitudes and pixel viewport bounded |
| Geometry / transform coordinates | ±1,000,000 units; rotation ±360,000° | Rejects extreme numeric input before Canvas calls |
| Nodes per authored tree | 160 | Keeps interactive validation/render traversal bounded |
| Expanded nodes per scene | 320 | Allows reused symbols while capping work |
| Tree depth / symbol depth | 10 / 6 | Bounds recursion |
| Symbols | 32 | Bounds registry and AI output size |
| Path length / commands | 4096 chars / 160 per path | Bounds parser and path calls |
| Authored path commands / expanded scene | 1400 / 1400 | Bounds overall path complexity, including repeated coordinate groups and symbol expansion |
| Text | 512 chars/node | This subset is single-line with no wrapping |

These are conservative design limits rather than throughput claims. The current fixtures validate/normalize in tens of milliseconds in Node; browser render-time and peak-memory limits are not established by that measurement. Harness exposes repeat-render pixel comparison. Canvas group layers are stage-canvas-sized and allocated only for opacity groups.

## Capability manifest and unavailable features

At the accepted CP5.1A baseline, the exported `visualDslV3Capabilities` object in `src/visual-dsl-v3.js` listed the v3 nodes, path commands, styles, transforms, coordinate mode, unavailable features and budgets. CP5.1B supersedes the baseline for gradients, bounded shadows, group clips, text layout and tokens. Images, Published Characters, full timeline, arbitrary filters, masks, blend modes and MP4 export remain unavailable. See [CP5.1B premium styling](visual-dsl-v3-cp5.1b.md) for the current contract.

## Fixtures and browser harness

- `examples/visual_dsl_v3/premium_bicycle_pump.json`: static technical cutaway, two independent layouts, valve/air-arrow/air-particle symbol reuse, piston/shaft/handle, cutaway air chamber, hose, tire, callouts and Vietnamese labels.
- `vector_geometry_stress.json`: cubic/smooth paths, nested rotation/nonuniform transform, group alpha, repeated gear symbol, style override, text and stable z-order.
- `robot_sensor_composition.json`: different educational subject using group hierarchy, robot silhouette, sensor beam symbol and signal path.
- `invalid_arc_path.json`: verifies unsupported arc rejection.
- Harness: start a static server at repository root and open `dev/visual-dsl-v3-harness.html`; choose fixture/aspect/scene, inspect diagnostics/capabilities, and use “Re-render and compare pixels”. It invokes the production validator, normalizer and renderer modules.

## CP5.1B recommendations

Add validated bounded keyframe timelines and camera framing only after a shared absolute-time evaluator is defined. Then prove image assets as local manifest refs with hash/provenance and deterministic decode; next add gradient/shadow after browser/MP4 parity measurements; follow with a unified render-layer adapter for Sprite/Rigged version-pinned references. Integrate the v3 normalizer into Video Studio and batch only after preflight/error and data-retention contracts are approved. Do not rewrite batch orchestration. Add bundled font assets and wrapping before claiming typographic parity.
