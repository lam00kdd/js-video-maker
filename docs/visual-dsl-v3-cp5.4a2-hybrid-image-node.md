# CP5.4A-2 — Visual DSL v3 Hybrid Image Node & Canvas2D Composition

## Implemented

- Added the general `image` node to the V3 capability manifest and structural validator. Geometry references a registry ID (`visual_<sha256>`) and declares a destination rectangle plus `fit: contain | cover | fill`.
- Added image-node limits and rejects unsupported children, clipping, crop fields, and arbitrary style properties. Existing transforms, opacity, visibility, z ordering, group clipping/opacity, symbols, and timeline evaluation remain shared with vector nodes.
- Added deterministic Canvas2D drawing through pre-decoded resources. No fetch, file access, or image decoding occurs in the frame renderer. `contain` preserves the whole image, `cover` center-crops to the target rectangle, and `fill` stretches to it.
- Added a strict missing-asset error for export/frame use and an explicit red diagnostic for preview. Images are prepared through the general Visual Asset Registry before playback/export.
- Updated the V3 prompt contract to require registered asset IDs and prohibit invented URLs, data URLs, base64, or pretending vectors are photographic assets.
- Added two validated example compositions and an asset companion package under `examples/visual_dsl_v3/cp54a2/` and `examples/visual_dsl_v3/cp54a2-assets/`.

## Benchmarks

1. `food-recognition-hybrid.json`: real generated bitmap subjects (rice, corn, sweet potato, fish, egg, vegetables) with editable vector labels and timeline motion, in landscape and portrait variants.
2. `inductive-proximity-sensor-hybrid.json`: a representative sensor cutout with separately animated metal target, field marks, indicator, and vector annotation. The fixture is illustrative, not a product datasheet or measurement source.

Both image fixtures are original project benchmark artwork. They are not scientific evidence. The pump cutaway is included in the companion package for subsequent mechanism composition work; its internal piston is not falsely animated as if it were a layered asset.

## Verification and limits

- Node validation passes for both JSON documents and the portable package manifest.
- Unit coverage checks image validation, resource lookup, fit math, draw ordering, parent transforms/clipping/opacity, timeline evaluation, strict missing assets, diagnostics, and frame rendering with prepared resources.
- Browser visual QA and MP4/batch export QA are **NOT VERIFIED** in this environment. The Canvas2D unit tests use a mock context and do not establish browser pixel output or export reliability.
- Current app asset preflight uses the local Visual Asset Registry. The companion package is portable and validated, but automatic folder-batch companion-package resolution/import is not added by this checkpoint.

## Relevant implementation

- `src/visual-dsl-v3.js`
- `src/render/visual-dsl-v3-renderer.js`
- `src/render/visual-dsl-v3-frame.js`
- `src/render/visual-asset-registry.js`
- `src/render/visual-dsl-v3-prompt.js`
- `src/app.js`
- `tests/visual-dsl-v3-images.test.js`
