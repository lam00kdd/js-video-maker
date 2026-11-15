# CP5.4B-3 — Unified Visual Asset Taxonomy

## Status

- **IMPLEMENTED:** shared taxonomy module with 18 primary families, built-in subcategories, persisted custom subcategories, taxonomy-aware metadata, search, manager filters, creator prompts, sidecars and V3 prompt catalogs.
- **AUTOMATED TESTED:** baseline `npm test` passed before B-3 edits; focused and full results are recorded after final validation below.
- **BROWSER VERIFIED:** NOT VERIFIED for B-3. The Category Manager, real stored assets and reload behavior still need browser review.
- **User acceptance:** pending. Do not mark CP5.4B-3 accepted before testing the real UI and classification persistence.

## Canonical taxonomy

`src/render/visual-asset-taxonomy.js` is the shared source of truth. Its 18 stable built-in IDs are:

`people_professions`, `animals`, `plants_fungi`, `food_nutrition`, `human_body_medicine`, `physics_phenomena`, `chemistry_laboratory`, `earth_environment`, `astronomy_space`, `mechanical_engineering`, `electrical_electronics`, `industrial_automation`, `robotics_ai`, `factory_manufacturing`, `quality_iso_iatf`, `home_everyday`, `transportation`, `environments_graphics`.

Each group has a Vietnamese and English label, searchable aliases and a bounded set of stable subcategory IDs. Custom subcategories use IDs derived once from the parent ID and normalized initial label; renaming preserves the ID. Built-in groups/subcategories cannot be renamed or removed. An unused custom subcategory can be archived; archiving is blocked while assets still use it. Custom definitions are stored under `lam-motion-studio.visual-asset-taxonomy.v1` in localStorage and validated when loaded.

## Metadata and legacy compatibility

Semantic metadata retains its old human-readable `category` field and adds `category_id`, `subcategory_id`, `subcategory_label`, `taxonomy_version`, `related_domains` and `classification_status`. `visual_type` and `viewpoint` remain separate dimensions. Taxonomy edits only update semantic metadata, never image bytes, SHA-256 or `visual_<sha256>` identity.

Legacy values are resolved lazily. Clear aliases such as `food`, `animal`, `plant`, `lab_equipment` and `industrial_sensor` map to broad compatible families. Ambiguous values such as `industrial_equipment`, `environment` and `other` remain readable and are marked `needs_review`. Missing classification remains usable as `unclassified`. No store migration runs at startup.

Sidecar v1 remains compatible. Old sidecars without taxonomy fields still import; new prompts emit canonical IDs and a matching subcategory ID when selected. Invalid parent-child relationships, unknown built-in IDs, unsafe keys, HTML-like markup and unsupported taxonomy versions are rejected. A custom subcategory's stable ID and label travel in asset metadata. Package import marks a custom assignment `unresolved` when the receiving browser does not have that custom definition, preserving the reference instead of dropping it.

## Visual Asset Manager

The Manager now has a category search/management panel with all 18 groups, expandable subcategories, per-group/subcategory counts, “Xem” filtering, custom-subcategory create/rename/archive actions, and protected built-ins. The toolbar composes text search, primary category, subcategory and visual-type filters. Empty-filter messages suggest removing filters or classifying metadata. Each asset card shows its category breadcrumb and classification review state. The existing metadata editor now includes a primary category selector, dependent subcategory selector and multi-select related domains; it continues to edit subject, description, keywords, visual type and viewpoint.

Unknown custom references imported from another taxonomy are displayed with their saved label and “chưa đồng bộ”. They can be reassigned in the metadata editor. Asset import, verification, delete and package controls remain available.

## AI Asset Creator and V3 prompt integration

The AI Asset Creator uses the same primary/subcategory list. Its prompt includes canonical IDs plus Vietnamese/English category labels and includes those IDs in the sidecar example. The prompt continues to request real transparent PNG when selected and forbids fabricated registry IDs, hashes and licenses. For Industrial Automation → Sensors it asks for recognizable sensor geometry and warns against substituting capacitive/photoelectric sensors, reed switches or an induction cooktop.

Single-video and multi-episode prompt builders obtain candidates from the same semantic catalog. Prompt catalog entries may include category/subcategory IDs and related domains, but still contain only exact registered asset IDs. The instructions treat taxonomy as secondary evidence, distinguish category relationship from subject equivalence, and reject weak broad-keyword substitutions. Existing V3 image-node capability gating remains in the prompt-builder flow.

## Search and package behavior

Deterministic search normalizes Vietnamese diacritics, searches English aliases and category/subcategory labels/IDs, and accepts composable category, subcategory and visual-type filters. Strong subject/alias overlap ranks above broad category or related-domain overlap; ties remain ambiguous and are withheld from automatic prompt selection. No embeddings or image recognition are used.

Package format remains `lam-visual-asset-package` v1. Taxonomy fields ride inside `semantic_metadata`; asset IDs, hashes and image paths are unchanged. Existing package contents without taxonomy fields remain valid. Unknown custom assignments retain their label and are marked unresolved on import to a browser without their definition.

## Automated validation

The taxonomy tests cover the 18-family contract, subcategory-parent relationships, custom category lifecycle, safe legacy resolution, metadata validation, Vietnamese/English filtering, combined filters, subject ambiguity and a ten-subject synthetic benchmark (sensor variants, cooktop, bicycle pump, robot arm, fish, corn, microscope, caliper and classroom). They also verify canonical sidecars, manager UI wiring and category-aware single/series V3 prompts. Registry tests verify ID/hash/bytes stay unchanged and package v1 preserves taxonomy metadata.

Final command results:

- Baseline `npm test` before B-3 edits: **PASS**, exit code 0.
- `node tests/visual-asset-taxonomy.test.js`: **PASS**, 12 tests.
- Final `npm test`: **PASS**, exit code 0, full configured regression chain (V3, asset library, batch, Character Library and existing prompt tests).
- `npm run test:focused`: **PASS**, exit code 0.
- `node --check` modified JavaScript and taxonomy tests: **PASS**, exit code 0.
- `git diff --check`: **PASS**, exit code 0. Git printed line-ending normalization warnings for already-dirty files, with no whitespace errors.

## Synthetic performance sample

Measured in the local Node runtime on synthetic semantic metadata, not browser rendering or production hardware. Category filtering scans the full synthetic list; search reports the average of three catalog searches; prompt generation reports the average of 100 bounded (up to four candidate) catalogs; metadata save is a per-record average using an in-memory store.

| Assets | Category filter | Semantic search | Prompt catalog | Metadata save per record |
|---:|---:|---:|---:|---:|
| 100 | 0.031 ms | 45.505 ms | 0.019 ms | 0.1294 ms |
| 1,000 | 0.150 ms | 181.941 ms | 0.002 ms | 0.0576 ms |
| 5,000 | 0.286 ms | 1,341.945 ms | 0.005 ms | 0.1482 ms |

The 5,000-item full text search is noticeably slower than simple category filtering. These figures exclude IndexedDB reads, image thumbnails and DOM rendering; browser UI responsiveness at those catalog sizes is **NOT VERIFIED**.

## Browser QA and limitations

- **BROWSER QA: NOT VERIFIED** for Category Manager add/rename/archive, real asset assignment, reload persistence, import/export portability and real single/multi prompt workflows.
- No production asset, project, Published Character, image bytes, ID or hash was migrated or replaced.
- A category label is not evidence that an image is scientifically accurate. Review state remains separate.
- The deterministic search uses text and classification metadata only; it does not inspect image pixels, infer subjects, or use embeddings.
- Related-domain tags are optional hints and never establish scientific equivalence.
- Custom taxonomy is browser-local; packages preserve custom IDs and labels but do not distribute a standalone global taxonomy catalog. An unknown custom reference is retained and marked unresolved.
