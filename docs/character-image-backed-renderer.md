# CP2 Image-Backed Character Renderer

## Scope

CP2 draws PNG appearance parts from an exact published Character Library version. Human Rig semantics and M1/M2 pose resolution remain appearance-independent. The renderer does not add character editing, AI art generation, arbitrary SVG import, lip sync, M3.2, or a portable character package. The included Scientific Image-Backed Demo is a technical fixture, not production artwork.

## Data and transform contract

Each `character_instances[]` entry pins `character_id`, `character_version`, and `character_version_checksum`. Preparation calls `CharacterLibraryStorage.resolveCharacterVersion()` with that exact reference; there is no latest-version fallback. The version's rig and appearance manifest provide semantic joint IDs, part-to-joint or part-to-bone bindings, image-space pivot, optional bone `attachment_points_px`, rig-local offsets and sizes, `z_index`, alpha, and optional facial feature bindings. For bone parts the pivot must coincide with the source `from` attachment; the two attachment points must share one horizontal pixel axis.

Transforms proceed from scene placement to resolved rig joints, then through part binding/local pivot to source PNG pixels. `size_rig_units` defines joint-bound artwork size in fractions of the rig's short canvas edge. Bone-bound art maps its declared source attachment pixels exactly to the two resolved joints. PNG pixels outside those attachment points become controlled artwork overdraw at the joint; `size_rig_units.height` preserves the authored limb thickness while the rig bone length remains unchanged. Scene-level character scale is uniform. The renderer sorts by explicit `z_index` and uses manifest semantics rather than fixed array positions.

## Runtime boundary

`prepareCharacterLibraryInstances()` resolves versions, validates the rig/manifest and required assets, checks asset content hashes, decodes PNGs and caches the decoded images before rendering. Its result contains an immutable prepared-version map and diagnostics. `resolveObjectScene()` receives that map and computes the existing absolute-time human pose. Canvas drawing consumes the resolved joints and prepared image map; neither pose resolution nor frame drawing opens IndexedDB or decodes image files.

Preview renders diagnostics for unavailable references. Video export awaits preparation and calls `assertCharacterLibraryAssetsReady()` before frame encoding; missing or invalid required parts stop export. Existing projects without library instances skip this path. Existing procedural characters and CP1 project-owned assets retain their previous paths. MP4 frame timing, codec and muxing are unchanged.

## Verification

- `tests/character-image-renderer.test.js` covers exact pinning, checksum/missing/decode failures, cache reuse, pivots, bone continuity, alpha, draw order, blink, independent instances/aspect layouts, legacy procedural compatibility and fixture integrity.
- `scripts/report-character-joint-continuity.py` reports source alpha coverage beyond each attachment plane and compares it with the original fixture binding measurements.
- `tests/character-library-cp2-browser-qa.html` is the real-browser Canvas2D + IndexedDB harness. It provides 16:9/9:16 layouts, seek, dual instances, missing-version diagnostics and reload verification.
- The browser harness must be opened and its displayed PASS/FAIL evidence inspected before claiming real browser persistence or visual quality. Automated canvas mocks alone do not establish visual quality.

Limitations: PNG only; no SVG importer; no archive/portable package; no production art quality guarantee; local Character Library remains origin/profile scoped and may be evicted by the browser.
