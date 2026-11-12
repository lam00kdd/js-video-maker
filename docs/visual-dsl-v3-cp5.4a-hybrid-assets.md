# CP5.4A — Hybrid Asset Foundation

## Status

CP5.4A-1 registry and CP5.4A-2 hybrid image-node/rendering integration are implemented. Browser persistence/manager visual QA and MP4/batch export QA are **NOT VERIFIED**. Architecture recommendations below are distinguished from the implemented contract; CP5.4A-2 details are in `visual-dsl-v3-cp5.4a2-hybrid-image-node.md`.

## Repository baseline

- Branch: `codex/visual-dsl-v2.8-natural-human-rig`.
- The working tree was already substantially dirty before this task, including modified application, project, renderer, server, package, and styling files plus untracked assets, examples, tests, and documentation. Those changes are user work and must be preserved.
- Before CP5.4A-1 edits, the full `npm test` command completed with all existing chained suites passing; the final shell exit code was not retained in the tool transcript. After implementation the full suite was run again and its result is reported in the task completion summary.

## Architecture audit

### Visual DSL v3

- `src/visual-dsl-v3.js` owns the V3 capability manifest, structural validation, semantic validation, normalization, and deterministic timeline evaluation.
- `src/render/visual-dsl-v3-renderer.js` is the shared Canvas2D renderer. It sorts siblings by `z_index` and source order, applies parent transforms/clips/group opacity, and draws vector leaves.
- `src/render/visual-dsl-v3-frame.js` is the stateless render-at-time boundary.
- `src/render/visual-dsl-v3-project.js` adapts normalized scenes into Video Studio projects.
- `src/app.js` renders V3 scenes through the same V3 Canvas2D renderer for preview and MP4 frame production; folder batch normalizes V3 scripts and stages them through the same project adapter. Image assets are preflighted from the local Visual Asset Registry before V3 playback/export.
- The manifest supports vector/text/group/symbol and bounded hybrid `image` nodes. The Canvas2D renderer consumes prepared resources and supports `contain`, `cover`, and `fill`.
- Timeline evaluation patches image transforms, opacity, visibility, and camera values through the existing node tree; no parallel image animation path was added.

### Asset and persistence infrastructure

- `src/render/character-library-storage.js` already uses IndexedDB Blob storage for Character Library assets and metadata. Its ownership and schema are character-specific; general Visual Assets should not be inserted into that contract or the SQLite Published Character catalog.
- Existing image-backed character and sprite paths decode and draw PNG assets, but they require character manifests/instances and are not general-purpose V3 image nodes.
- The general Visual Asset Registry, PNG/WebP import manager, portable asset package manifest, and interactive V3 image preflight resolver are implemented in CP5.4A-1/2.
- Automatic folder-batch companion-package resolution/import remains pending; the batch workflow still needs its own asset staging contract.

## Recommended minimal architecture

1. Create a separate general Visual Asset Registry contract and storage module; do not reuse Published Character records. Store immutable asset metadata separately from image Blobs and key identity by stable ID plus SHA-256 content hash.
2. Use PNG and WebP first. Validate signatures, decoded dimensions/pixel count, file size, and hash at import. Do not support SVG in CP5.4A; arbitrary SVG is an unsafe and underspecified import surface. Revisit a restricted subset or sanitized rasterization in a later checkpoint.
3. Add a V3 `image` node that references a registered `asset_id`; keep geometry in the existing viewBox-local coordinate system and transforms in the existing node transform. Add explicit `fit` (`contain`, `cover`, optionally `fill`) and bounded source crop fields. Structural validation checks shape and ranges; a separate runtime preflight checks registry resolution, hash, MIME, and decode readiness.
4. Resolve and decode all scene assets before preview/export/batch frame rendering. Pass immutable decoded resources to the existing renderer. Rendering stays synchronous and deterministic after preflight; no network, file reads, or decode work occurs per frame. Missing required assets block export with scene/node diagnostics; only preview may show an explicitly marked diagnostic.
5. General assets need portable ownership. IndexedDB-only IDs are insufficient for folder batch or another browser profile. Use a project/batch companion asset package with a manifest and content-addressed files, imported/relinked into the local registry for interactive preview. Batch should resolve either the approved package adjacent to the scripts or a registered immutable asset, and fail clearly if neither is present. Do not embed image base64 in each JSON.
6. Keep images and vector nodes in the same V3 scene tree and painter order. Existing group transforms, clipping, opacity, camera, and timeline evaluation then apply naturally. The renderer consumes pre-decoded resources keyed by asset ID; image transforms animate using the existing node tracks.
7. Prompt builders must receive a capability and available-asset manifest. They may select only registered IDs; unavailable subjects must be reported rather than represented by invented IDs or anonymous geometry.

## Integration boundaries and remaining work

- The registry/package foundation and bounded immutable identity are implemented in CP5.4A-1.
- V3 image-node validation, normalization, capability manifest, prompt contract, Canvas2D composition, and app preflight are implemented in CP5.4A-2.
- App preview and single MP4 frame rendering use prepared local-registry resources. Folder-batch companion-package resolution/import remains pending.
- Original benchmark art and hybrid JSON fixtures for foods and an industrial sensor are included in the CP5.4A-2 examples; an additional pump cutaway asset is packaged for later composition work. Browser visual QA and actual MP4/batch QA remain outstanding.
- Automated tests pass; separate browser, MP4, and batch QA are still required before claiming visual/export acceptance.

## Current QA labels

- Architecture audit: **COMPLETED**.
- PNG / WebP validation and registration API: **IMPLEMENTED** (file signature, MIME, browser decode, SHA-256, dimensions and bounded budgets).
- Persistent metadata and binary storage: **IMPLEMENTED** (dedicated IndexedDB database `lam-motion-studio.visual-assets`, separate from Character Library).
- Asset Manager UI: **IMPLEMENTED** (import, thumbnail/list metadata, hash verification, companion-folder import/export).
- Portable package contract: **IMPLEMENTED** (version 1 manifest plus `assets/<sha256>.png|webp`; no ZIP dependency).
- Decoded resource preparation boundary: **IMPLEMENTED** (`prepareAssetResources` returns an ID-to-bitmap map and explicit disposer).
- V3 image node / Canvas composition: **IMPLEMENTED** (CP5.4A-2; unit tested, browser pixel QA **NOT VERIFIED**).
- Preview and single MP4 export local-registry preflight: **IMPLEMENTED** (actual browser/MP4 QA **NOT VERIFIED**).
- Folder batch companion-package resolution/import: **NOT IMPLEMENTED**.
- Registry package portability: **AUTOMATED TESTED** with isolated in-memory stores; real browser File System Access QA **NOT VERIFIED**.
- IndexedDB reopen persistence: **AUTOMATED TESTED** with the repository FakeIndexedDB test double; actual browser-profile persistence **NOT VERIFIED**.
- Hash timing: **MEASURED** for tiny fixture inputs only; browser decode/storage performance **NOT VERIFIED**.
- Batch package resolution and missing-asset gating: **NOT IMPLEMENTED** (future integration).
- Browser QA: **NOT VERIFIED**.
- MP4 QA: **NOT VERIFIED**.
- Batch QA: **NOT VERIFIED**.
- CP5.4A acceptance: **NOT ACCEPTED**.

## CP5.4A-1 implementation contract

### Storage and identity

General visual assets use a new IndexedDB database named `lam-motion-studio.visual-assets`, object store `assets`, keyed by `asset_id`. Each record stores immutable metadata plus a Blob. It is a separate storage owner from the Character Library database and server-side Published Character SQLite store. Browser profile storage is persistent locally but is not itself portable; use the package format below when moving to another profile or a folder batch workflow.

The logical ID is `visual_<full lowercase SHA-256>`. The hash is recomputed from binary bytes. Identical content deduplicates to the same ID; a same-ID/different-hash conflict is rejected. Replacement is not supported. Display name, ID, and hash remain distinct metadata fields.

### Import and safety limits

`src/render/visual-asset-registry.js` exports `VisualAssetRegistry`, `VisualAssetIndexedDbStore`, `validateVisualImage`, `validateManifest`, `VISUAL_ASSET_LIMITS`, and `VisualAssetError`. PNG and WebP signatures and declared MIME are checked; dimensions are parsed from PNG IHDR or WebP VP8/VP8L/VP8X headers and bounded before browser decode, then the browser decoder must successfully decode the file. Hash, decoded dimensions, and byte size are recorded. The default budgets are 25 MiB per image, 8192 px per side, 32 million decoded pixels, two concurrent decodes, 100 assets per package, and 500 MiB aggregate package content. Asset display names are limited to 160 characters; category, subject, provenance, and license notes have bounded lengths.

The UI assigns image metadata using DOM `textContent`; it does not insert user strings as markup. SVG and remote references are not supported. Deletion requires an explicit reference-check callback; without dependency tracking it is refused.

Test fixtures under `tests/fixtures/visual-assets/` are small synthetic format fixtures: opaque PNG, transparent PNG, WebP, and a truncated/corrupt PNG. They are format tests, not representative subject artwork or quality benchmarks.

### Portable package

The browser companion-directory format is:

```text
manifest.json
assets/<sha256>.png
assets/<sha256>.webp
```

The manifest format is `lam-visual-asset-package`, version 1. Package paths must exactly match the content hash and MIME-derived extension. Import validates all manifest entries and stages/decodes/re-hashes every file before one IndexedDB transaction writes records. A failed validation does not write a partial package. This is a directory package, not ZIP. Chrome/Edge File System Access support is required for manager folder import/export; the registry API remains usable without that UI capability.

### Performance sample

On Node v22 in the current Windows development environment, WebCrypto SHA-256 was measured over 100 repetitions: 341-byte PNG mean 0.225 ms, 239-byte transparent PNG mean 0.050 ms, and 578-byte WebP mean 0.042 ms. These are hash-only microbenchmarks for tiny fixtures, not browser import/decode, IndexedDB throughput, or large-image performance claims. Browser import, decode, package, storage, and memory measurements remain **NOT VERIFIED**.

### Asset Manager and CP5.4A-2 handoff

The top-bar `▧` button opens the general Visual Asset Manager. The registry API provides `registerAsset`, `getAssetMetadata`, `getAssetBytes`, `listAssets`, `verifyAsset`, `removeAsset`, `exportAssetPackage`, `importAssetPackage`, and `prepareAssetResources`. The last operation prepares verified decoded resources as a `Map<asset_id, ImageBitmap>` and returns a disposer that closes them. Future render preflight must own that disposer for the complete preview/export job and never decode or read bytes per frame.

The renderer integration should accept the prepared resource map, validate V3 image-node references against the registry before staging, and block MP4/batch when required assets are missing. That work is not part of CP5.4A-1.
