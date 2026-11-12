# CP5.1B — Premium styling and composition

**Status:** implemented for isolated v3 preview and ready for visual review. This does not connect v3 to Video Studio, MP4 export, or batch rendering. User acceptance remains pending.

## Audit summary

CP5.1A normalized leaf styles to solid fill/stroke, stroke width, cap, and join. It had no gradients, shadows, clipping, design tokens, text wrapping, or layout metadata. Canvas groups already supported bounded tree depth and used full-output offscreen canvases for group opacity. Nested transforms use translate → rotate → scale → translate by negative origin. Stage fitting is a uniform centered fit to the explicit viewBox. Text previously rendered as one Canvas text call with an Arial fallback. The renderer decision documents recommend preserving this shared Canvas2D path and avoiding a second rendering backend.

## Implemented paint contract

`fill` and `stroke` accept a supported solid hex color, `none`, or a declarative paint object. No CSS, URL, expression, or script paint is evaluated.

```json
{"type":"linear","units":"local","x1":0,"y1":0,"x2":120,"y2":0,
 "stops":[{"offset":0,"color":"#D6E6E8"},{"offset":1,"color":"#547782"}]}
```

```json
{"type":"radial","units":"scene","cx":450,"cy":420,"fx":430,"fy":400,
 "radius":180,"inner_radius":0,
 "stops":[{"offset":0,"color":"#FFFFFF"},{"offset":1,"color":"#71C9C4","opacity":0.25}]}
```

- `local` coordinates are in the painted node's local viewBox space and follow the node and ancestor transforms. Unequal scales make a radial gradient elliptical.
- `scene` coordinates are in the scene viewBox and ignore node-local transforms. Stage fit and letterboxing still apply.
- A radial gradient uses its outer center/radius (`cx`, `cy`, `radius`) and may use a separate focal center (`fx`, `fy`) with `inner_radius`.
- Linear endpoints must differ. Stops are solid hex colors with nondecreasing offsets, optional alpha, and a maximum of 8 stops. Unsupported spread modes are rejected.
- Paint and Canvas state are isolated per node; solid styles can follow gradient-painted nodes without inheriting gradient state.

## Opacity, shadows, clipping

Fill and stroke opacity are independent values in 0–1. A shadow is one optional object: `color`, `blur`, `offset_x`, `offset_y`, `opacity`, and `enabled`. Authored values use scene-local viewBox units. The renderer transforms the offset vector through the active Canvas transform and scales isotropic blur by the square root of the absolute transform determinant. It rejects effective output blur above 24 units or offset magnitude above 40. Canvas shadow blur is not transformed by the browser itself, so this explicit conversion preserves stage and object scaling ([HTML Canvas Standard](https://html.spec.whatwg.org/multipage/canvas.html#shadows)). Blur values are not equivalent to a fixed pixel count.

Only group nodes may clip. Supported clip geometries are rectangles, rounded rectangles, and validated v3 paths. Nested clip depth is capped at 4. Clips inherit the group's transform and are restored with Canvas save/restore. Shadows, gradients, symbols, and child groups render inside the active clip.

Group opacity is applied once to the completed child layer. Offscreen output is bounded by the renderer's 2,880,000-pixel output cap and a maximum of 16 compositions per scene. State restoration uses `finally` blocks on both successful and exceptional draws. Blend modes, arbitrary filters, alpha masks, and unbounded offscreen buffers remain unsupported.

## Vietnamese typography

Text supports `font_weight` (`normal`, `600`, `700`, or `bold`), `max_width`, word wrapping, `line_height` (0.8–2.4), `letter_spacing` (−12–12), and `max_lines` (1–12), in addition to CP5.1A's alignment and baseline. Wrapping measures through Canvas and preserves Vietnamese grapheme clusters when applying letter spacing. The allowlist remains Arial, sans-serif, serif, and monospace; fonts are not bundled, so the browser's available font fallback and glyph rasterization may vary by OS.

## Design tokens and presets

Paint may use `{ "token": "palette.accent" }`. Tokens are flat solid colors, limited to 64. Recursive references are impossible by contract. Custom top-level token keys are exposed beneath `palette.*` and override preset values deterministically.

Two palette presets are implemented:

- `scientific_premium`: graphite, paper, teal, coral, and satin-metal palette.
- `educational_cartoon_premium`: warm paper, indigo, teal, and coral palette.

Presets supply tokens; they do not silently restyle authored nodes. Scenes use explicit fills, strokes, gradients, shadows, and independent portrait/landscape geometry.

## Composition diagnostics and benchmarks

Scenes may declare `layout.minimum_text_px` and up to 8 named `safe_regions`. `diagnoseVisualDslV3Layout()` reports text below the output-size target, text outside the stage, approximate overlaps between text boxes, and text intersecting a safe region. These warnings are advisory and do not change the document. Bounds account for basic translation and scaling; they approximate text and do not solve rotations, arbitrary path bounds, or all symbol expansion, so human review remains necessary.

Two strict v3 benchmark fixtures are included and selectable in the isolated harness:

- `scientific_pump_premium.json`: the existing pump lesson in two compositions, with satin-body and tire gradients, subtle shadows, callouts, clipping at the scene edge, and separate 16:9/9:16 layout. The portrait scene was reworked after the supplied preview showed crowded lower labels; it now has a larger pump, side piston callout, separated valve labels, and an explanation card.
- `educational_cartoon_premium.json`: a new robot sensor lesson with a distinct indigo/warm-paper visual direction, larger friendly forms, a sensor beam, information card, and independent landscape and portrait compositions.

The user's supplied landscape preview showed the pump group's body clipped at the right edge. That too-tight component clip was removed; the scene-edge clip remains. The revised portrait JSON and removed component clip have not yet been captured in a fresh browser screenshot.

## Resource limits

| Resource | Limit |
|---|---:|
| Gradient stops | 8 per gradient |
| Shadow blur / offsets | 24 / 40 authored units, plus 24 / 40 effective output units |
| Nested group clips | 4 |
| Offscreen compositions | 16 per scene |
| Output canvas | 2,400 px per side; 2,880,000 pixels total |
| Text | 512 characters, 12 lines, width ≤2,400 units |
| Nodes / expanded nodes / depth | 160 / 320 / 10 (existing CP5.1A limits) |
| JSON document | 1 MiB serialized character budget (existing CP5.1A limit) |

## Tests, visual QA, and known limits

Tests cover valid and invalid linear/radial gradients, local versus scene coordinates, shadow limits/state reset/transform scaling, nested clips, path validation, Vietnamese wrapping, tokens/presets, diagnostics, benchmark fixture validation, symbol and group behavior, and the CP5.1A foundation. Automated rendering uses a deterministic Canvas test double; it does not establish visual quality or browser pixel parity.

**Browser QA: NOT VERIFIED by the implementation run.** The local harness was already open in Chrome, but two fresh desktop snapshots timed out. The screenshots supplied by the user were visually inspected as reference evidence; they are not a fresh capture after the latest portrait and clip corrections. Existing Video Studio behavior, SQLite, Published Character Library, and the folder batch renderer were not opened or modified by this checkpoint.

**Performance:** no 1280×720 / 720×1280 browser timing is reported because the browser capture runtime was unavailable. The hard limits are implemented, but practical render-time measurements remain a review item. No FPS claim is made.

## CP5.1C preparation

The shared pure scene render entry point accepts a normalized scene and symbol table, making a future `render-at-time` evaluator possible without another renderer. Future timeline targets can include node transform, opacity, gradient stop values/coordinates, shadow values, and text reveal/layout. Keep clips attached to stable groups while animating their transforms; avoid rebuilding clip paths per frame. A camera can be composed as an outer transform before the scene root, with stage fit applied last. Preview and future MP4 should call this same renderer with the same normalized frame state and differ only in canvas target and deterministic clock. No timeline is implemented here.
