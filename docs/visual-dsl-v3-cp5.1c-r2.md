# CP5.1C-R2 · Video Studio import, preview and MP4 frame integration

## Audit

The Video Studio script importer is `importScript()` in `src/app.js`; previously it only had Visual DSL v1/v2 and Scene Graph v2 conversion. Its import-choice dialog stages a candidate and requires a backup before replacing the active project. The production preview clock is `frameLoop()`/`seekTo()` and scene scheduling uses `locateScene()` in `src/project.js`. MP4 uses `exportSingleVideo()` → `encodeOfflineFrames()` → `renderSceneFrameAt()`, then the existing Mediabunny WebCodecs encoder and mux verification. The legacy batch scheduler still calls `exportSingleVideo()` and is intentionally left for R3.

R2 adds explicit `visual_dsl_version === 3` dispatch before the legacy character/Scene Graph checks, and constructs the full candidate before opening the import dialog. Invalid v3 throws validation diagnostics without assigning to the active project. The canonical normalized v3 document is retained in `project.visualDslV3`; native Video Studio scene cards carry only `visualDslV3Ref` plus narration, duration, voice/subtitle settings and normal project IDs. Per-frame rendering resolves the referenced normalized scene; it does not validate or normalize again.

## Shared frame path

`renderVisualDslV3Frame()` in `src/render/visual-dsl-v3-frame.js` resolves the chosen variant and scene ID, evaluates `evaluateVisualDslV3Scene()` at explicit scene-local time, then calls the existing `renderVisualDslV3Scene()` Canvas2D renderer. Video Studio preview and every MP4 frame call through `renderVisualDslV3At()` in `src/app.js` to this function. Scene cards render a deterministic representative timestamp through the same evaluator/renderer.

Preview playback uses the existing RAF/audio clock and `locateScene()`. Scrubbing, frame stepping, playback and MP4 frame rendering all provide absolute scene-local time. The existing export clock derives timestamps from integer frame index (`index / fps`), uses `ceil(duration * fps)`, selects the next scene at an exact boundary, and clips the final frame duration to the remaining fractional interval. Automated timing coverage includes 1.01s + 1.03s scenes at 24 FPS.

V3 background and world content, including camera movement, are rendered on the v3 canvas. Subtitles are drawn afterward using the existing `drawCaption()` function, and the logo is then composited in screen space. MP4 voice generation, audio decoding/mixing and encoder validation remain the existing `exportSingleVideo()` mechanisms. Missing v3 narration audio follows that existing export voice-generation path; voice ID/rate and subtitle enabled/size/karaoke settings are mapped during project staging. Scene duration remains authoritative for v3 even if decoded narration is longer.

For `aspect_ratio: "both"`, scene wrappers point to the matching landscape or portrait v3 scene, preserving independent stage, targets, camera, and timeline. A single-aspect v3 import is locked to its supplied ratio in the Video Studio selector and export selection; it is not stretched into a second deliverable.

## Verification status

Automated tests cover v3 project staging, transaction-safe failure, voice/subtitle/metadata preservation, both variant references, shared scene-time rendering, and fractional scene boundaries. They do not verify a live browser or encoded MP4.

The local server was already listening on port 4173. A separate headless Chrome run was attempted, but the OS sandbox denied Chrome startup (`FATAL ... platform_channel ... Access is denied`). No app UI or real MP4 was inspected in this environment. Canvas render cost and MP4 throughput therefore remain unmeasured here; Node evaluator timing is reported in the task summary only.

## R3 batch handoff

- Preflight v3 JSON with `normalizeVisualDslV3()` or stage native scene references through `createVisualDslV3Project()` in `src/render/visual-dsl-v3-project.js`.
- The reusable production export entry is `exportSingleVideo(requestedFormat, portrait)` in `src/app.js`; R3 should continue to call it from the existing sequential scheduler.
- It returns a validated `Blob` after the encoder confirms frame count/timestamps/duration and expected audio. A null result means cancellation; a thrown error means failure. Only after output writing succeeds should batch move the source JSON into `processed-scripts`.
- The current `validateBatchScript()` has a v3 preflight branch, but its project setup is separate from `createVisualDslV3Project()`. R3 should consolidate it on the shared adapter, ensure single-aspect scripts generate only their declared ratio, and retain per-file failure isolation and processed-file semantics.
- Keep the current scheduler and its file-move transaction unchanged beyond the v3 adapter/dispatch needed for R3.
