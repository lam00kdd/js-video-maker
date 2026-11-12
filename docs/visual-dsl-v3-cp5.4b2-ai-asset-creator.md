# CP5.4B-2 — AI Visual Asset Creator and Safe Import

## Status

- **IMPLEMENTED:** prompt creator, strict semantic sidecar import, existing-image metadata import, alpha check, and guarded deletion.
- **AUTOMATED TESTED:** focused registry/catalog/import tests and the full test suite (see validation below).
- **BROWSER VERIFIED:** NOT VERIFIED for the new B-2 workflows. The earlier screenshot only showed the asset list; it did not exercise import or deletion.
- **AI OUTPUT VERIFIED:** NOT VERIFIED. The app builds a prompt and has no image-generation API integration.
- **User acceptance:** pending. Do not mark CP5.4B-2 accepted until the user exercises the import and delete flows.

## AI Asset Creator

The **Tạo prompt ảnh AI** panel accepts a subject, category, educational use, visual style, detail level, viewpoint, optional visible components and reference notes, plus a transparent-background preference. A subject alone is enough to create a prompt. Category guidance covers equipment, animals, plants, food, environments, and scientific phenomena without defining new renderer types.

The generated prompt includes a recognizable-subject art direction, image constraints, and an exact metadata sidecar example. It requests `<slug>.png` and `<slug>.asset.json`; it explicitly forbids invented hashes, registry IDs, dimensions, file sizes, local paths and verified licenses. It does not claim that either deliverable has already been generated. Prompt preview is read-only and copy uses the browser clipboard when available.

## Sidecar contract

Sidecars use `lam-visual-asset-semantic-sidecar/v1` and the existing semantic metadata fields. The accepted root keys are `schema`, `image_file`, `image_requirements` and `semantic_metadata`. The semantic object accepts the existing v1 fields: `schema_version`, `title`, `primary_subject`, `category`, `description`, `keywords_vi`, `aliases_en`, `visual_type`, `viewpoint`, `educational_usage`, `scientific_domain`, `visible_components` and `review_status`.

Unknown fields, path-like image names, unsupported extensions, mismatched pair names, invalid JSON and values rejected by the existing metadata validator are rejected. AI imports are always stored with `review_status: needs_review`, `metadata_origin: ai_generated` and `user_edited: false`. The conceptual sample in the task is normalized to this repository contract; it does not introduce parallel aliases such as `keywords_en` or `visible_parts`.

## Import lifecycle

**Nhập ảnh + metadata** requires exactly one PNG/WebP plus one same-basename `.asset.json`. The manager decodes and validates the image signature/MIME/dimensions, computes SHA-256, validates the sidecar and pairing, and stages a preview. Nothing is written until **Xác nhận nhập ảnh**. New image bytes and semantic metadata live in one IndexedDB record and are inserted through one read-write transaction. Failure before confirmation leaves the registry unchanged.

If the hash already exists, the preview identifies the duplicate. Confirming **Xác nhận thay metadata** updates only semantic metadata; the registry ID, hash, image bytes and dimensions remain untouched. Existing metadata is shown beside proposed metadata. A stale metadata change after preview blocks the write and requires a fresh preview.

An existing card's **Nhập JSON metadata** action reads its current Blob and requires the sidecar to match the existing display filename. It follows the same preview and explicit confirmation. This provides the sensor/cooktop metadata attachment workflow while preserving image identity.

When transparency is requested, import samples decoded alpha at up to 256×256 pixels and requires at least 0.5% of sampled pixels to have alpha below 250. This catches fully opaque images and minor antialiasing noise; it is a practical alpha check, not background segmentation or visual proof that every background pixel is transparent. Opaque images remain accepted when the sidecar says transparency is not required. If alpha decoding is unavailable, the transparent import fails safely.

## Safe deletion

**Xóa ảnh** first scans the open project and project JSON records stored under the app's localStorage project keys, recursively checking `asset_id` fields, including Visual DSL v3 image nodes. A scan limit, unreadable project or unavailable scanner blocks deletion. Any known dependency blocks deletion with its source/path. The confirmation names the subject and exact asset ID and explains what is removed.

After confirmation, the registry checks dependencies again and deletes the one general-asset record in a read-write IndexedDB transaction. That record owns both semantic metadata and Blob, so the delete is atomic. The app does not scan external JSON/packages, unsaved project state in another tab, or references unknown to the registry; it never claims these were checked. Exported companion folders are independent files and are not removed. Published Character records are in a separate store and are not touched.

Prompt Builder searches the registry when a prompt is generated, so removed assets cease to be candidates on the next prompt build. Existing rendered resources are held only by the current runtime until the document changes or the app reloads; no persistent catalog index requires cleanup.

## Portable package compatibility

The existing `lam-visual-asset-package` version 1 format remains in use (`manifest.json` plus `assets/<sha256>.png|webp`). Semantic metadata, including its origin/review state, remains in the manifest. Import validates package paths, hash, dimensions and metadata. Existing IDs are skipped; their metadata is not silently overwritten. Exported packages do not depend on the local registry after export.

## Validation

- Baseline `npm test` before B-2: passed.
- `npm run test:focused`: **PASS**, exit code 0 (registry, catalog, creator/import, and V3 image suites).
- `npm test`: **PASS**, exit code 0 (full configured regression chain, including Character Library, prompt builders, and batch/script tests).
- `node --check` on changed JavaScript modules and the creator test: **PASS**, exit code 0.
- `git diff --check`: **PASS**, exit code 0. Git printed line-ending normalization warnings for already-dirty files; no whitespace errors were reported.
- Browser QA for B-2 import, deletion, referenced deletion, and package portability: **NOT VERIFIED**.
- Real ChatGPT image/sidecar output QA: **NOT VERIFIED**; use a local valid fixture if validating the UI without an image-generation service.

## Known limitations

- Dependency scanning is intentionally limited to readable local project JSON and the open project. It cannot prove that no external portable JSON refers to an asset.
- The sidecar pairing requires the sidecar's `image_file`, selected image name and `.asset.json` basename to match exactly.
- Transparent-alpha sampling validates pixel alpha presence, not whether the transparent region is actually the intended background or whether the cutout is visually correct.
- Browser flows still require user QA, including cancellation and confirmation behavior.
