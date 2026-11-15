# CP5.5A — Unified AI Visual Director

## Status

- Shared Visual Director for the V3 single-video and multi-episode Prompt Builders: **IMPLEMENTED**.
- V3 Published Sprite rendering: **IMPLEMENTED; production outputs NOT VERIFIED**. R3A adds an exact-pinned `published_character` schema node and adapter to the existing Sprite evaluator, with Preview/MP4 shared rendering and per-file batch preflight. Library publication or legacy Scene Graph support does not establish V3 compatibility.
- Prompt generation can include verified Published Sprite IDs, exact revisions/checksums, and real clip IDs in AUTO/PREFER/REQUIRE/OFF policy guidance. REQUIRE fails with `V3_CHARACTER_REQUIRED_MISSING` when the live catalog has no eligible Sprite. Rigged remains gated.
- Preview, MP4, folder batch, and app-level end-to-end verification for generated V3 scripts: **NOT VERIFIED**. CP5.5A-R2 later confirmed the existing local app responds on port 4173 and loads in the in-app browser; this verifies app availability only, not generated V3 rendering, MP4, batch, or console health.

## Architecture

`src/render/visual-director.js` is the common resolver and policy prompt section. Both V3 wrappers in `src/render/visual-dsl-v3-prompt.js` call it. It owns policy normalization, exact registered asset ID validation, deduplication, a four-asset bound, reviewed-anchor filtering, catalog truncation reporting, character runtime status, and scene guidance. Single-video and series prompts still differ in duration/episode planning and filenames, while both use the same V3 manifest, validator-derived contract, asset selection rules, anchor schema, and Visual Director section.

The canonical V3 capability manifest and `validateVisualDslV3` remain authoritative. Supported V3 elements include image, vector, text, timeline, camera, `anchor_annotation`, and the new pinned Published Sprite node. Browser/export acceptance remains open pending real-output QA.

## Character Direction

The existing legacy Character Direction form and persisted settings remain intact. The V3 builders use the shared policy selector and a read-only Published Character catalog, filtered to validated Sprite versions with supported clips. AUTO/PREFER/REQUIRE/OFF are documented; REQUIRE only directs the model to include a listed Sprite node. Published IDs, checksum pins, and clips are never invented. A character may not substitute for the scientific subject asset.

## Asset and anchor direction

Asset candidates come from `VisualAssetRegistry.selectPromptAssets`, which uses semantic ranking and avoids weak ambiguous matches. The shared resolver accepts only `visual_<sha256>` IDs, deduplicates, and bounds the prompt catalog to four resources. The compact catalog includes subject identity, description, category/subcategory and taxonomy version, scientific domain, visible components, educational usage, source/license notes where supplied, and eligible anchors. PREFER_LIBRARY uses an exact registered match when present; REQUIRE_REGISTERED stops if no candidate exists; ALLOW_VECTOR permits scientifically suitable vector-only explanations. Missing subject assets are never replaced with an unrelated image.

Only anchors in `human_reviewed` or `human_edited` state enter the prompt. `ai_suggested` points are excluded. Each anchor is grouped with its exact parent asset and spatial fingerprint. The contract identifies `image_node_id`, `anchor_id`, optional `instance_path`, and `metadata_fingerprint`; the renderer still validates actual runtime resolution and fingerprint. Anchor OFF removes anchor IDs and instructions from both builders.

## Scene guidance and UI

Both V3 Prompt Builders share Character, Asset, Anchor, composition, and quality-check settings. The defaults are AUTO, PREFER_LIBRARY, REVIEWED_ONLY, Scientific Hybrid, and quality checks on. The settings are saved under shared Visual Director preference keys. The single-video legacy character controls remain separate and hidden while V3 is selected; their saved meaning is not migrated or overwritten.

Composition guidance varies by educational purpose: use a matching photograph for physical subject identity, a photograph plus callout for visible components, image plus vector for operating principles, vector diagrams for invisible phenomena, and distinct matching resources for comparisons. It cautions against depicting conceptual vectors as literal internal parts of a PNG. Landscape and portrait variants continue to use the existing independent V3 variant schema.

## Multi-episode workflow

Series prompts use the same resolver and shared series-level candidate catalog. Each episode is instructed to use only the exact listed resources appropriate to its scientific subject, maintain stable IDs for recurring equipment, and avoid substituting related devices. Each output remains an independent V3 JSON using the existing filename contract. The prompt warns that asset IDs are local registry references and companion assets must be imported into the target registry; this prompt does not claim that it packages the companion files.

## Diagnostics and tests

- `V3_CHARACTER_REQUIRED_UNSUPPORTED`: no V3 Published Character runtime.
- `VISUAL_ASSET_REQUIRED_MISSING`: REQUIRE_REGISTERED has no matching catalog entry.
- Catalog entries are bounded/deduplicated; truncation is stated in the prompt.
- `tests/visual-director.test.js` covers shared single/series contract, exact ID bounds, duplicate removal, reviewed-only anchors, OFF policy, and impossible REQUIRE policies.
- Existing V3 validators and import/export asset tests remain unchanged and authoritative.

## Known limitations and release gate

- Real Preview, MP4, batch, and hybrid-scene outputs remain unverified in this workspace session; CP5.5A is not accepted until those release checks pass.
- The current asset discovery is topic-level for a series. The prompt constrains per-episode selection, but it does not yet precompute a separate application-side candidate catalog for every episode title because those titles are not known until the AI plans the series.
- The app's V3 batch package workflow and portable target registry behavior were not exercised in a browser during this change.
- No claims of BROWSER VERIFIED, MP4 VERIFIED, or BATCH VERIFIED are made.

## Vietnamese user guide

Trong cả Prompt Builder một video và nhiều tập, mở **AI Visual Direction** rồi chọn chính sách nhân vật, ảnh, anchor, kiểu bố cục và kiểm tra chất lượng. Nên giữ mặc định: AUTO, PREFER_LIBRARY, REVIEWED_ONLY, Scientific Hybrid và Quality checks bật. Ảnh/anchor trong prompt là tài nguyên local; khi chuyển JSON sang app hoặc máy khác, cần có đúng asset trong Visual Asset Registry. Nếu chọn REQUIRE_REGISTERED mà không có ảnh phù hợp, hãy đăng ký đúng ảnh trước. V3 hiện chưa render Published Character; chọn REQUIRE sẽ báo lỗi và không tạo prompt. Chọn AUTO/PREFER nếu muốn prompt V3 tiếp tục tạo bằng ảnh, anchor và vector được hỗ trợ.

## CP5.5A-R2 server and Published Character audit (as-of R2; superseded by R3A below)

R2 recorded the pre-integration state. Its blockers and proposed steps are historical; use the R3A results below for current implementation status.

- The process occupying `127.0.0.1:4173` was PID `13328`, `node.exe` at `D:\App\nodejs\node.exe`. TCP reported a listener bound to `0.0.0.0:4173`. HTTP `GET /` returned 200 and the `LAM AI Motion Studio` document; `GET /api/character-library/status` returned SQLite status with 3 characters, 7 versions, and 55 assets. The in-app browser displayed the Video Studio dashboard. The process command line was unavailable to this shell, and the process was left running.
- The current catalog has one published `rigged` record, `char_cp2_demo_teacher`, versions `1.0.0` and `1.0.1`; both are validated image-backed revisions with 12 immutable image dependencies and compatible motions `idle`, `breathe`, and `blink`. Its description identifies it as a technical renderer fixture, not production artwork.
- The catalog also has `sprite` records `char_female_teacher_1_beca662a_b7af_4a6d_9683_22d106eabd0a` (versions `1.0.0`–`1.0.2`) and `char_robot_1_e0f1409d_68c5_4899_b871_c5b75bf96692` (versions `1.0.0`–`1.0.1`). The latest revisions are validated and each has a real `wave` clip with 8 frames; older listed revisions contain static poses but no clip. Published snapshot poses include `idle`, `greet`, `point`, `explain`, `point_left`, `point_right`, `present_left`, `present_right`, `thinking`, `question`, `emphasize`, `like`, and `heart`. These are actual Library records, not yet V3 capabilities.
- The accepted legacy Scene Graph path already has immutable reference resolution, one-time asset preparation, deterministic absolute-time Sprite evaluation, image-backed Rigged rendering, and shared scene rendering used for Preview/MP4. This makes reuse plausible, but does not itself connect those facilities to V3.
- V3 currently reserves character nodes as unavailable; `validateVisualDslV3` rejects them. `visual-dsl-v3-renderer.js` has no character draw branch. V3 scene adaptation and render-at-time only pass Visual Asset resources/spatial metadata. `prepareVisualDslV3ExportAssets` and its companion package importer handle hash-addressed Visual Assets only. Folder batch preflights that same package and does not resolve/pin/import Character Library bundles. Therefore there is no validated node contract, character preflight, V3 pose/clip clock mapping, parity, or portable batch dependency contract to safely enable.
- Scope decision: do not add a paint-only branch or turn on AUTO/PREFER/REQUIRE. Doing so would make V3 appear capable while missing timing/resource/package guarantees. Keep the current prompt gate and plan the smallest complete integration: (1) define a strict `published_character` V3 reference pinned by character ID, type, exact version and checksum, with explicit clip/pose and bounded transform/timing fields; (2) validate the exact published snapshot and compatibility, then prepare immutable dependencies once per render/export scope; (3) adapt existing absolute-time rig/sprite evaluators into the shared V3 traversal with deterministic painter order and group semantics; (4) add a versioned companion character bundle package that checks local revision conflicts without silently overwriting, and make batch preflight per-file/isolation aware; (5) only then advertise compatible real IDs/actions in both prompt builders and enable policy modes; (6) cover aspect, seek, Preview/MP4, package conflicts, batch isolation and legacy regressions with automated and browser/export checks.
- Browser status: app navigation **VERIFIED**. Character selection, V3 generated character render, animated playback, sensor/anchor hybrid, MP4, folder batch, console cleanliness and old-workflow regression remain **NOT VERIFIED**. Do not report CP5.5A accepted from this audit.


## CP5.5A-R3A — Published Sprite integration

### Forensic audit

- Read-only Git history for the relevant render files starts with the visual asset/character studio foundation; no earlier native V3 character node or V3 commit was found. The evidenced prior workflow is legacy Video Studio Scene Graph v2 plus Character Studio, not native V3. This is a V3 integration gap, not a demonstrated V3 regression.
- Reused legacy components: `resolveObjectScene`, `evaluateSpriteClip`, `drawPublishedSpriteCharacter`, `preparePublishedSpriteInstances`, and `assertPublishedSpriteReferencesReady`. Legacy Preview/MP4 usage was left in place.
- The local read-only status endpoint returned 3 identities, 7 versions, and 55 assets. The teacher Sprite `char_female_teacher_1_beca662a_b7af_4a6d_9683_22d106eabd0a@1.0.2` has checksum `d872aac5409c5099460677ed6c4a1ba44e6fb30d07bc4ce7ab741f44063bdb0a`; the robot Sprite `char_robot_1_e0f1409d_68c5_4899_b871_c5b75bf96692@1.0.1` has checksum `90f2364961c9be0828f2d4d09d2ba5a0dd26380820e0082dafdc83a237e15f23`. Both accessible latest revisions contain validated `wave` clips with 8 frames at 8 fps; frame count and duration are read from each published clip, never hardcoded. No Library record was changed.

### V3 contract and render path

- New node: `type: "published_character"`; exact geometry pins `character_id`, `character_version`, `character_version_checksum`, and `clip_id`; `x/y` use bounded normalized Sprite coordinates, `scale` is bounded, and optional `start_seconds`, `loop`, `hold_last_frame` control the published clip. Standard node transforms, visibility, opacity, z-order, parent groups, camera, timeline, and aspect variants use the shared V3 tree. `character_instance` and Rigged nodes remain unavailable.
- Preview and MP4 route through `renderVisualDslV3Frame` and the same Canvas renderer. The adapter translates the V3 node into the existing immutable Sprite instance resolver at absolute scene time, then calls `drawPublishedSpriteCharacter`; it does not create a second animation engine. Forward/backward/repeated timestamps are stateless.
- Preflight gathers exact revision/clip references per selected aspect, decodes dependencies once via the accepted Sprite resource preparer, and includes scene/variant/node/character/version/clip diagnostics. Revision checksum mismatch or missing clip/frame fails explicitly. No database writes occur.

### Prompt builders and portability

- Single-video and multi-episode builders share one Visual Director resolver. The live catalog is filtered to validated Sprite revisions with available clips and includes only exact IDs, semantic versions, checksums, display labels, and published clip metadata. REQUIRE cannot proceed without an eligible catalog record; series guidance preserves the same identity/revision/checksum across episodes.
- The Visual Asset Manager can export a companion `character-library.bundle.json` containing only the referenced immutable Sprite identities, revisions, and PNG dependencies. Bundle reading checks schema, identity/type, exact version, asset paths by fixed filename, PNG signature, byte size, SHA-256, and aggregate published content checksum. It overlays missing exact versions for the render only; a conflicting local checksum is rejected. It never writes to the local Published Character Library.
- Export and each batch file read the optional companion bundle and preflight character resources independently. Existing batch scheduler/move semantics were not rewritten. A real disposable batch run is still needed to verify failure isolation.
- Importable real-resource smoke fixture: `qa/visual-dsl-v3-published-sprite-smoke.json` (teacher 1.0.2, `wave`). It validates against the live V3 schema in the automated suite.

### Automated QA and remaining verification

- `tests/visual-dsl-v3-characters.test.js`: schema pins/rejections, exact preflight and clip failure, deterministic frame seeks, both aspect branches, group/camera/order, real fixture importability, companion bundle integrity/tamper rejection, and the post-export Preview loading guard.
- `tests/visual-director.test.js` and `tests/visual-dsl-v3-prompt.test.js`: prompt policy, capability and contract.
- The user supplied the rendered 16:9 MP4 and confirmed “mp4 ok”; the file exists at 1,073,755 bytes. Mark MP4 16:9 **user-verified**. The supplied browser screenshot showed a transient missing-prepared-Sprite Preview error immediately after export, followed by recovery. The cause was the async Preview preparation finishing after the export scope was cleared. The Preview stage and scene-thumbnail renderer now show a loading frame during that pending interval; the automated integration contract test passes. The UI fix has not yet been rechecked in the browser. MP4 9:16, portable-package use in another profile, and folder-batch outputs remain **NOT VERIFIED**.
- Resource-preflight and render-cost benchmarks, memory measurements, and decoded-image cleanup/cancellation profiling are **NOT VERIFIED**. Existing decoded resources are cached for the render scope; performance must be measured with real library art before release.

### Known limits and R3B handoff

- Sprite node geometry does not add character-specific rotation; any orientation must use supported shared node transform fields. Rigged motion support is covered in the R3B section below. No lip-sync is implied by `wave`.
- QA fixture is a single landscape smoke JSON; the automated tests cover both V3 variants synthetically, but there is no generated real sensor + reviewed anchor + Sprite hybrid fixture because those live registry IDs were not confirmed in this implementation pass.
- The user accepted R3A after production QA, including Sprite Preview, both MP4 aspects, folder batch, portable dependencies, hybrid assets/anchors, and both prompt builders. The remaining verification above concerns the later Preview loading fix and current implementation state.

## CP5.5A layout prompt correction — caption and text safe zones

The user reported captions covering the main diagram and on-canvas heading text being misplaced. The V3 app overlays narration captions after drawing the scene, centered at 85% of the rendered frame after the user clarified the desired position; prompt guidance had only said to leave subtitle space and did not state a consistent anchor or distinguish `scene.title` metadata from a rendered text node. The V3 contract and renderer now anchor the caption panel center at 85% in both 16:9 and 9:16 (the panel typically spans about 76–94%); the V3 contract gives explicit stage-relative title, brand, centered-content, margin, and caption zones; requires numeric `layout.safe_regions` values derived from stage dimensions; explains text anchor semantics (`text_align`/`text_baseline`); and asks for box-boundary/collision checks independently for landscape and portrait. Canonical sample diagrams move labels above/outside the caption band and define the matching safe region. Main artwork should stay centered around the middle of the stage and above the caption band. This is prompt-level direction plus a renderer position rule, not automatic collision avoidance: the renderer does not relocate badly placed text, so real generated scripts still need preview inspection.

## CP5.5A-R3B — Native Published Rigged Characters

### Existing evaluator and V3 adapter

- Published Rigged versions store a manifest, rig/skeleton, compatible motion features, immutable PNG references, manifest checksum, and aggregate content checksum. `prepareCharacterLibraryInstances` resolves that exact record, validates required joints and image part bindings/dimensions, and decodes image dependencies before rendering. The V3 path reuses `resolveHumanPose` through `resolveObjectScene` and renders the prepared artwork with `drawImageBackedCharacter`; no second rig evaluator or artwork is introduced.
- The existing evaluator computes pose from absolute scene time. It has one additive motion channel per supported motion ID and combines channels by adding their evaluator deltas, but the V3 contract intentionally selects one `motion_id` per published character node. `idle`, `breathe`, and `blink` are admitted from the published `compatible_motion_features` set; prompt capabilities also require both bound eye features for `blink`. No lip-sync, new action, or motion synthesis is implied.
- V3 keeps the accepted `published_character` node and exact `character_id`, `character_version`, and `character_version_checksum` pins. `clip_id` selects Sprite clips; `motion_id` selects Rigged motions. Exactly one is required. Sprite and Rigged types are determined again from the prepared immutable resource at render time, and a type/action mismatch fails instead of switching adapters silently.
- The rig root uses normalized stage `x/y/scale`; part hierarchy, pivots, opacity and z-order come from the existing renderer. V3 group transforms, camera transforms, node visibility/opacity and sibling order remain on the shared Canvas context. Landscape and portrait fixtures use independent stage layouts. No mutable frame counter is used.

### Preflight, portability and batch

- Rigged preflight resolves exact ID/version/checksum and calls the existing Character Library preparer once per reference set before rendering. Missing revisions, invalid joints, missing parts, failed decoding, dimension mismatches, and checksum errors fail before an export. Frame rendering performs no IndexedDB read or image decode.
- The companion package now exports a `lam-published-character-dependencies` bundle with exact identity, immutable version record, manifest, rig, and PNGs. The reader verifies PNG signatures/size/SHA-256, the Rigged manifest fingerprint, required manifest image references, and the type-specific aggregate published checksum. It still reads the prior Sprite-only bundle format. Packaged missing versions are prepared for that render only; mismatched local checksums are rejected and no published library record is written or replaced.
- Single export and folder batch already call shared V3 preflight independently per document; the scheduler was not changed. The normal mixed batch and failure-isolation workflow has not yet been exercised in the browser for R3B.

### Unified Visual Director and test fixtures

- The shared catalog now allows only validated immutable revisions. Sprite entries carry their verified clips; Rigged entries carry only supported `available_motions`. AUTO/PREFER/REQUIRE/OFF share the same resolver in both prompt builders. REQUIRE fails visibly if there is no compatible published resource. Guidance never reassigns a Sprite clip to a Rigged character or vice versa.
- Real-ID `both` aspect QA scripts are provided in `qa/visual-dsl-v3-published-rigged-idle.json`, `qa/visual-dsl-v3-published-rigged-breathe.json`, and `qa/visual-dsl-v3-published-rigged-blink.json`. They pin the currently available local `char_cp2_demo_teacher@1.0.1` checksum `23b848d44f86c0b9a6eb49e3d0d7df03855c7a1077741e9eaab64cd749dc8d73`, whose published features are `idle`, `breathe`, and `blink`. They require that exact Library revision; they do not embed or mutate the user's Library.
- Automated coverage checks Rigged schema and unsupported motion rejection, preflight/decode, shared renderer dispatch, absolute-time pose determinism and backward seeks, both fixture aspect branches, type-specific prompt catalogs, REQUIRE behavior, and Sprite regression. A missing sensor registry ID was not confirmed in the asset registry during this pass, so no fake hybrid sensor/anchor fixture was added. A deliberately invalid batch input is also not advertised as a verified production fixture.

### Verification status and known limits

- Automated test and syntax results must be reported from the final run below. Browser visual checks against Character Studio, blink appearance, MP4 16:9/9:16 frame parity, hybrid sensor+anchor composition, real folder-batch isolation, and actual package import in a second profile remain **NOT VERIFIED** in this implementation pass. A render that does not throw is not claimed as visual approval.
- Final automated results: `npm test` exit 0, 314/314 passing; `npm run test:focused` exit 0, 83/83 passing; relevant `node --check` commands exit 0; `git diff --check` exit 0.
- Browser inspection was attempted through the available Computer Use surface, but access to the open Microsoft Edge window was not approved. Therefore no browser, MP4, or batch QA is claimed for R3B.
- Performance timing, memory use, large batch overhead, and explicit decoded-resource cancellation/cleanup measurements remain **NOT MEASURED**. The existing shared image decode cache remains in use.
