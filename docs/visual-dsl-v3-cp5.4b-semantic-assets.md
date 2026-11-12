# CP5.4B-1 — Semantic Visual Asset Catalog & Prompt Builder Bridge

## Repository baseline and dependency audit

- Branch at start: `codex/visual-dsl-v2.8-natural-human-rig`.
- Worktree was already substantially dirty, with unrelated modified files and untracked work. Existing state was preserved; no reset, stash, clean, commit, push, or deployment was run.
- Baseline `npm test` passed before CP5.4B-1 edits (exit code 0).

| Dependency | Status | Evidence / limit |
| --- | --- | --- |
| CP5.4A-1 registry, PNG/WebP import, SHA-256 identity, IndexedDB bytes, Visual Asset Manager, companion package, `prepareAssetResources()` | IMPLEMENTED | `src/render/visual-asset-registry.js`, `src/render/visual-asset-manager.js`; metadata remains separate from immutable bytes and ID. |
| CP5.4A-2 V3 image node, validator, renderer and preview preflight | IMPLEMENTED | Shared V3 tree and Canvas2D renderer; automated image-node tests pass. Browser pixel and actual MP4 QA are still incomplete. |
| CP5.4A-3 image-backed MP4 and portable folder batch | PARTIAL | Single-video V3 code prepares local-registry assets before rendering frames, but MP4 acceptance is not verified. Folder batch does not automatically resolve/import the companion package. |
| CP5.3A/5.3B single and multi V3 prompt builders, shared runtime contract, Scientific Visual Director, scene diversity | IMPLEMENTED | Existing builders and app entry points are reused and now receive a filtered catalog. |

Do not describe asset-backed folder-batch generation as portable/production-ready until companion assets are staged in the destination and batch export is verified.

## Semantic metadata model

The immutable content record remains `asset_id = visual_<sha256>`, SHA-256, MIME, dimensions, byte size, and the original Blob. Mutable semantic data lives under optional `semantic_metadata` on the same record:

- `schema_version`, title suggestion, primary subject, category, description.
- `keywords_vi`, English aliases, visual type, viewpoint, educational usage, scientific domain, visible components.
- Source, license, `review_status` (`needs_review`, `reviewed`, `verified`), update time, and user-edited flag.
- An empty `anchors` object reserves a future extension; it does not assert coordinates or provide anchor behavior.

Metadata edits use `updateAssetSemanticMetadata`; they do not change the image Blob or content-addressed ID. Old records without semantic metadata remain readable and receive a filename-derived title suggestion with `needs_review`. Filename separators are normalized; filename text is never treated as proof of subject identity. The UI makes this distinction explicit.

## Asset Manager

The existing manager now has a local metadata search, semantic title, file name, category, description, keywords, review state, and actions to edit metadata, copy the exact ID, or verify the image. The editor covers Vietnamese and English terms, visual type, viewpoint, intended educational use, scientific domain, visible components, source/license and review state. Metadata uses bounded text/list sizes and schema validation.

The review state is a user assertion. No image understanding service, automatic recognition, technical model inference, or license verification was added.

## Search, ranking and ambiguity

`searchVisualAssets()` is deterministic local metadata search. It normalizes case, Vietnamese diacritics and `đ`, and supports token overlap plus title/subject/alias, category, usage, domain and description matches. Ranking favors exact subject and verified subject/alias matches, then overlap and supporting metadata. Filename alone is not indexed as a confidence signal. Results are stable by score, verification state, then asset ID, with a maximum of eight.

The current ambiguity rule marks close top results (score gap below 18). `selectVisualAssetPromptCandidates()` withholds a technically ambiguous match from automatic prompt selection and requires a minimum relevance score. A broad match such as “điện cảm” therefore cannot by itself choose between an inductive sensor and induction cooktop. If the candidates do not separate safely, the generated prompt reports no selected asset and directs the model to use supported vectors where suitable or state the missing resource.

This is lexical metadata matching. It is not embedding similarity, image recognition, or proof that a subject is technically correct.

## Prompt catalog contract

The public format is `lam-visual-asset-prompt-catalog/v1`. It contains real registry IDs, title, primary subject, a short description, aliases/keywords, visual type, viewpoint, suggested usage and review state. It excludes Blob bytes, base64 and local filesystem paths. `validateVisualAssetPromptCatalog()` validates schema and restricts fields. Current prompt bounds: at most four selected candidates, 9,000 catalog characters, 240 description characters and eight combined aliases/keywords per candidate.

Catalog construction filters malformed IDs; app integration obtains candidates directly from `VisualAssetRegistry.selectPromptAssets()`. Prompt context is selected from the current topic (and related subject/domain fields for single prompts), not the entire library. Series prompts include one compact catalog and ask episodes to reuse the exact ID for the same equipment where relevant.

## Prompt Builder integration and capability gating

Both Single-Video and Multi-Episode V3 builders use the same catalog instructions. A remembered checkbox controls optional library use in each form. The generated prompt itself shows the included IDs, so users can review them before copying. Legacy prompt modes do not receive the V3 catalog.

The prompt contract reflects the V3 runtime: image geometry is `{asset_id,x,y,width,height,fit}`, with `contain`, `cover` or `fill`; shared node transforms, opacity, visibility, z order, group clipping/opacity and supported timeline tracks apply. Crop fields, URLs, base64, invented IDs and independently moving parts inside a flattened bitmap are prohibited.

When the catalog is empty or ambiguous, prompts do not fabricate an ID. They recommend a supported vector depiction when it can explain the concept safely, otherwise require the missing visual to be registered. Prompt text explicitly says metadata is not pixel inspection.

Image IDs point to the current local registry. The prompt does not attach the companion package. Series prompts now require the matching package to be imported into the batch destination before any asset-backed batch render; they do not claim batch portability. Actual MP4/batch capability verification remains pending.

## Portable package and conflict policy

Companion package format/version remains `lam-visual-asset-package` version 1. Semantic metadata is an optional validated field on each manifest entry, so old packages without that field remain valid. Hash, path, MIME, dimensions, size and all image bytes keep their previous validation. Import stages all files before its atomic write; malformed semantic metadata fails before any record is committed.

Conflict policy is deterministic: if a content ID already exists locally with the same hash, package import skips that record and preserves its current metadata exactly, even if the incoming package offers different metadata. If the hash conflicts, import fails. The UI reports how many existing IDs were skipped. Users can review/edit local metadata explicitly; package import never silently replaces user work.

## Automated verification

New tests cover metadata bounds and review state, immutable hash/bytes, IndexedDB reload, package metadata round-trip and safe conflict behavior, backward-compatible manifests, Vietnamese with/without diacritics, English aliases, category/topic matching, unrelated exclusion, ambiguous sensors, stable and bounded results over 1,000 synthetic assets, catalog field/size validation, exact prompt IDs, missing-asset instructions, both prompt entry points and persisted preferences.

Performance sample (Node v26.13, deterministic synthetic data; not a browser benchmark):

- Search over 1,000 catalog records: 30.03 ms average over 100 runs.
- Prompt catalog generation for one selected asset: 0.012 ms average over 1,000 runs; resulting catalog 535 characters.
- Fake IndexedDB update and metadata read for one record: 47.33 ms and 12.01 ms average over 50 calls. This is a repository test double, not actual browser IndexedDB latency.
- One-asset prompt-size sample: single prompt grew by 1,683 characters (9.86%); series prompt grew by 1,890 characters (10.51%). These include selection instructions as well as catalog JSON.

## Browser and real AI QA

- **BROWSER VERIFIED — LIMITED:** user-provided browser screenshot shows the app at `127.0.0.1:4173`, the existing Asset Manager with two imported images, file names, “Sửa metadata”, “Copy ID”, and “Kiểm tra ảnh”. This confirms the manager list view renders. It does not verify editing/reload, search ranking, prompt generation or package import.
- **BROWSER QA: NOT VERIFIED** for metadata save/reload, Vietnamese/English searches, Single-Video prompt output, Multi-Episode prompt output, and package round-trip. Computer Use was denied permission to interact with the open Microsoft Edge window; no other browser automation package is installed in this workspace.
- **REAL AI OUTPUT QA: NOT VERIFIED.** No prompt was submitted to ChatGPT and no external AI response or rendered output was inspected.
- Automated test success must not be reported as browser or scientific-subject verification.

## CP5.4C visual-anchor handoff

The metadata reserves `anchors: {}` only. CP5.4C may define optional subject bounds, label-safe regions, named visible-component anchors, connection points, orientation, and movable-part references. It must preserve the rule that coordinates are supplied/reviewed from image evidence; do not infer them from filenames, hashes, or a generic model. Until then, image nodes remain a single bitmap rectangle with fit and shared node transforms.
