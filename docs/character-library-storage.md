# Character Library Persistence Foundation

> Published Character identities, immutable versions, and managed PNG assets now use the app-wide SQLite catalog described in [character-library-sqlite.md](character-library-sqlite.md). Browser IndexedDB remains the per-profile store for drafts and session-local working data; the initial Published Library can be copied from Chrome with the migration page.

**Checkpoint:** local IndexedDB backend plus the CP2 consumer boundary. Character Studio UI, AI generation, ZIP packages and M3.2 are out of scope.

## IndexedDB schema

Database: lam-motion-studio.character-library, schema version 1.

| Object store | Key | Contents |
|---|---|---|
| characters | character_id | Immutable identity, display metadata, timestamps and published version list |
| drafts | character_id | Editable rig/appearance draft metadata and referenced asset IDs; no Blob/data URL fields |
| versions | [character_id, version] | Immutable published rig, normalized manifest, compatibility, checksums and content-addressed asset IDs |
| assets | asset_id | PNG Blob, SHA-256, MIME, byte length and creation time |
| assetRefs | [owner_id, asset_id] | Draft/published-version reference edges plus indexes by owner and asset |

Project storage remains the existing JSON/localStorage path. Library asset blobs never fall back to localStorage. Asset IDs use libsha256_<64 lowercase hex>; no absolute path is stored. Assets deduplicate by SHA-256.

## API

The class CharacterLibraryStorage exposes:

- createCharacter({character_id, display_name, description?, source_metadata?})
- saveCharacterDraft(character_id, draft)
- getCharacterDraft(character_id)
- saveCharacterAsset(pngBlob)
- publishCharacterVersion({character_id, version, manifest, rig, assets?})
- getCharacterVersion(character_id, version)
- listCharacters()
- resolveCharacterVersion(pinnedReference, {duration?})
- getAsset(asset_id)
- deleteAssetIfUnreferenced(asset_id)

Module-level async wrappers exist for the requested create/save/get/publish/list/resolve operations. The class is recommended when several operations need to share an open database connection.

## Publish flow and transaction guarantees

Before opening a write transaction, publish:

1. Validates and normalizes the Human Rig and appearance manifest.
2. Checks required semantic joint compatibility.
3. Checks PNG MIME, PNG signature/IHDR dimensions, browser PNG decode and decoded dimensions.
4. Computes SHA-256 from Blob bytes and verifies any supplied asset ID.
5. Verifies reused stored Blob hashes; resolves required assets and warns/omits missing optional parts.
6. Computes manifest, validation-report and aggregate version checksums.
7. Uses navigator.storage.estimate when available to reject an obviously insufficient remaining quota. It has no arbitrary per-asset byte cap; IndexedDB QuotaExceededError is converted to quota_exceeded with recovery guidance.

The commit is one readwrite transaction across characters, versions, assets and assetRefs. It checks identity and version conflicts, adds any new Blob, adds the immutable version and reference edges, and updates the character's version index. A failed request aborts the transaction; a version cannot commit without all referenced assets. SHA work and image decoding happen before the transaction because those async tasks would otherwise allow IndexedDB transactions to go inactive.

Published versions are append-only. Re-publishing the same character/version returns version_conflict. Changes require a new SemVer. Asset deletion checks the reference index inside a write transaction and refuses deletion while any draft or published version references the Blob.

## Resolution and diagnostics

resolveCharacterVersion requires character_id, explicit character_version and character_version_checksum. It returns exact-version rig, manifest and required asset Blobs after verifying asset IDs/hashes, Blob MIME/size, manifest checksum and aggregate version checksum. It never selects latest. Missing characters, missing versions, missing/corrupt assets and checksum conflicts return explicit diagnostics.

The CP2 renderer calls `resolveCharacterVersion()` for each exact pinned reference before frame rendering. `prepareCharacterLibraryInstances()` verifies the published version, prepares the manifest and required PNG Blobs once, and returns a prepared map keyed by character/version/checksum. `resolveObjectScene()` and the Canvas2D image renderer receive that map and do not access IndexedDB or decode images per frame. Missing versions, checksum conflicts, corrupt or missing required assets produce preview diagnostics and block export before MP4 frame encoding. There is no latest-version fallback. This does not make the project self-contained: exported project JSON still refers to the local Character Library.

Manifest image parts require `size_rig_units` to define intended image size in rig-local units. Joint-bound parts use their pivot and normalized size; bone-bound parts are uniformly fitted to their resolved endpoints. Character placement uses a uniform scene scale, preserving source art proportions. Feature bindings may connect eye PNGs to the existing deterministic M2 blink channel. The renderer currently supports PNG only; it does not import arbitrary SVG or layered source files.

## Errors

Stable storage error codes include indexeddb_unavailable, database_blocked, invalid_record, invalid_version, invalid_asset, unsupported_asset_type, invalid_png, png_decoder_unavailable, asset_hash_mismatch, asset_corrupt, missing_required_asset, rig_incompatible, version_conflict, asset_hash_conflict, quota_exceeded and storage_failed. No localStorage fallback is attempted.

## Tests and browser QA

tests/character-library-storage.test.js exercises transactions through a small test-only IndexedDB double. It covers create/update, duplicate identity/version, immutable versions, rollback, checksum verification, deduplication, reload semantics, pinning, missing/corrupt assets, quota and unavailable storage. This double is not a browser implementation.

`tests/character-library-browser-qa.html` exercises real-browser persistence with a small PNG. `tests/character-library-cp2-browser-qa.html` seeds the Scientific Image-Backed Demo through IndexedDB, verifies exact pinned version and checksum after reload, draws landscape/portrait composition through Canvas2D, and exposes seek, dual-instance and missing-version checks. Automated Node tests remain complementary; actual browser results must be recorded from the rendered harness and must not be inferred from fake IndexedDB tests. Browser storage remains subject to eviction and profile/origin boundaries.

## CP3.1 metadata fields

Character records may include `source_metadata.role`, `source_metadata.rig_profile`, and `source_metadata.motion_style` (with `style_profile` retained as a compatible alias). Draft saves synchronize these list-friendly metadata values from the editable draft in the same `characters` + `drafts` transaction. They are descriptive values, not renderer or pose-resolver inputs. The schema remains version 1 because no object-store migration is required.

The CP3.2 Artwork Prompt Builder reads the currently open in-memory draft as defaults and never saves it as a side effect. Prompt options/results are isolated by character ID for the current page session; the generator makes no network request and does not upload or persist reference images.
