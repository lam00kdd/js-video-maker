# CP3.3A — Artwork Import & Part Manager

Character Studio now has an **Artwork Parts** tab for importing PNG candidates into an editable Character Library draft. The feature does not publish, bind pivots, change rig semantics, or modify a Video Project.

## Vocabulary and compatibility

The part list uses `draft.manifest.parts` when it exists. Each listed part must have a unique semantic part ID and at least one joint binding from the active M1 rig. The importer rejects joints outside the active M1 vocabulary. Drafts without a manifest use the canonical M1 part blueprint and the UI labels this as a fallback. The fallback is not copied into or attached to the draft manifest.

## PNG checks and states

An imported file must declare `image/png`, contain the PNG signature and IHDR, decode successfully, and have dimensions that match the decoded bitmap. Alpha is inspected from decoded canvas pixels; a PNG with no transparent pixel remains an **Imported Candidate** and receives an explicit diagnostic. A PNG with decoded transparency is **Validated PNG** for file-level checks only. The UI never labels an imported image **Ready for Rig Binding**: CP3.3A does not assign pivots/bindings or run appearance preview QA. Invalid files are rejected with a diagnostic and do not replace the current part mapping.

The browser must be able to decode the image and inspect its pixels. Browser canvas/decode limits can therefore reject a technically valid but exceptionally large PNG. Storage quota is checked against new unique Blob bytes, while the IndexedDB transaction remains authoritative and quota failures are reported.

## Import and mapping

Each part row supports Import/Replace and Remove. Multi-file import maps only exact `part_id.png`, `character_<role>_<part_id>_v1.png`, or `character_<part_id>_v1.png` names; unmatched files are reported and not mapped. Use the row action for other filenames. Duplicate image content uses its SHA-256 content address, so identical files share one stored Blob.

The Artwork Prompt Builder asks for one `character_<role>_rig-sidecar.json` alongside the PNGs. In Artwork Parts choose **Import PNGs + rig JSON** and select that JSON plus every PNG it describes. The app checks schema version, draft Character ID, rig profile, unique active part IDs, exact PNG filenames, and semantic joint mapping before staging the bundle. The sidecar may contain only descriptive orientation/attachment/seam notes; fabricated pixel anchors, bounds, dimensions, checksum, transforms, and verified claims are rejected. The app decodes each PNG and measures its own alpha geometry. Sidecar entries are stored as unverified generation notes; after Save Draft, open Rig Editor and run Auto Assemble to create a review-only candidate. Inspect diagnostics and seams before Apply Assembly.

## Draft asset lifecycle

Imported files are held as draft candidates in memory until Save Draft. Saving writes referenced Blob records, artwork mappings, draft metadata, and `assetRefs` in a single IndexedDB transaction. The transaction verifies that each draft asset reference already exists or is included in the staged PNG set. A failed transaction rolls back the mapping and newly staged assets together. Replaced/removed draft references are cleared; unreferenced old Blobs are removed in that transaction, while Blobs referenced by a published version remain protected. Save permits partial artwork sets. Discard restores the saved mappings and drops pending in-memory imports.

Published version records are not modified. Character Studio draft changes remain isolated from Video Studio and project localStorage.

## Limitations and next checkpoint

CP3.3A provides thumbnails and metadata review, not a rig editor. Crop bounds, pivot placement, overlap, draw order, pose preview, and final rig compatibility still require CP3.3B binding/preview QA. PNG background removal, SVG import, AI generation, publishing, and bulk library cleanup are not part of this checkpoint.
