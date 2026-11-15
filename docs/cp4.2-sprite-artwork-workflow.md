# CP4.2 Sprite Artwork Import & Pose Library

## Architecture

CP4.2 extends the `sprite` Character Draft with a deterministic identity configuration, a revisioned Master PNG reference, and four fixed pose records (`idle`, `greet`, `point`, `explain`). The `rigged` draft and its M1 workflow remain separate. Prompt strings are generated locally from templates; the app does not call a ChatGPT or image-generation API.

The workflow reuses Character Studio, `CharacterLibraryStorage`, its existing IndexedDB `assets` and `assetRefs` stores, content-addressed SHA-256 PNG IDs, and the existing atomic draft transaction. PNG bytes stay in the managed asset store. Draft metadata contains IDs and dimensions, never Blob data or object URLs. Saving the draft updates its metadata, managed asset blobs, and references in a single IndexedDB transaction. Revisions referenced by the Master history remain referenced and are not overwritten when a newer Master is imported.

## Image validation and identity lock

Sprite import accepts PNG only. The browser verifies file MIME, PNG signature/IHDR, decode dimensions, non-empty visible pixels, <=20 MB, dimensions <=4096×4096, and <=16 million pixels. Transparency is detected by scanning decoded alpha. Opaque backgrounds are kept as-is and require explicit acknowledgement before approval; no background removal is performed.

Approving a Master records its managed asset ID, Character ID at prompt use, revision, normalized identity snapshot, appearance settings, style, image dimensions, transparency, and approval state. Pose prompts are deterministic and include the Master revision, explicit instructions to manually attach the approved Master, consistent identity constraints, action description, and anatomical/screen left-right convention. Replacing a Master preserves its older revision assets and marks existing poses for revalidation.

## Pose registration and review

Imported pose images preserve their source pixels. Preview placement applies a normalized anchor and only uniform scale, plus independent horizontal/vertical translation controls. Idle ghosting, Idle/selected toggling, bounds, and baseline are preview-only. Each production pose stores native dimensions, transparency state, anchor, alignment, source Master revision and asset ID, and manual review state. Approval is separate from technical diagnostics; diagnostics cannot verify visual identity.

CP4.1 SVG demo poses remain available and explicitly labeled demo content. Sprite remains a fixed-pose artwork draft: no timeline playback, Sprite publishing, Video Studio resolver, external image service, or M1/CP2/MP4 modifications are introduced by CP4.2.

## Checks

Focused coverage: `node tests/character-sprite-workflow.test.js`, `node tests/character-library-storage.test.js`, and `node tests/character-studio.test.js`. The full `npm test` script includes the CP4.2 workflow test. Browser acceptance is separate and must be manually/automatically completed against the real Character Studio before marking the checkpoint accepted.
