# CP5.1C-R3 — Visual DSL v3 folder batch rendering

Status: implementation and automated checks complete; final production acceptance is pending real browser batch QA.

## Architecture audit

The existing batch path is in `src/app.js`:

1. `showExportSettings()` selects source and output directories with `showDirectoryPicker()` and requests read/write permission.
2. `runBatchExport()` enumerates top-level `.json` entries, sorts them, and creates/uses `processed-scripts` under the output directory.
3. `readScriptProject()` parses JSON and dispatches explicit `visual_dsl_version` values before checking scene/narration shape.
4. `preflightBatchScript()` validates v3 through `normalizeVisualDslV3()`; legacy v1/v2 continue through `validateBatchScript()` and the existing import conversion.
5. `planBatchOutputs()` selects the declared v3 aspect(s), sanitizes output names, detects intra-batch collisions, and preflight checks existing MP4 and processed JSON names.
6. Each file and each required aspect is exported sequentially through `exportSingleVideo()`. V3 staging calls `createVisualDslV3Project()` from `src/render/visual-dsl-v3-project.js`; it does not call the interactive import choice dialog. Frames use the shared R2 `renderVisualDslV3Frame()` path through `renderSceneFrameAt()`.
7. A script is copied to `processed-scripts` and removed from its source folder only after every required MP4 completes. A failed or cancelled script remains in the source folder. The pre-batch project, selected scene/time and ratio are restored after processing.

`exportSingleVideo()` reports its export only after encoder frame counts, mux timestamps/duration and audio-track checks pass. It cancels the Mediabunny output on failure and closes the audio decoder in its existing `finally` block. Voice generation remains on the existing Vietnamese TTS pipeline. Both variants share generated scene audio by index, and each new script starts from a clean project so audio cannot leak from the previous job.

## Dispatch, aspect and failure behavior

- `visual_dsl_version: 3` is normalized once during preflight, then the immutable normalized document is passed to the shared adapter for staging without a second validation pass.
- Explicit v1/v2 and unmarked legacy JSON keep the existing route. Any other explicit version gets an unsupported-version diagnostic; it is not downgraded.
- A v3 `16:9` document outputs `-16x9`; a `9:16` document outputs `-9x16`; a `both` document renders its independent landscape and portrait variants regardless of the legacy ratio selector. It never stretches one variant into the other.
- Output names replace path/control-invalid characters and strip leading/trailing dots. Existing files and duplicate planned names block the affected script before rendering. The destination is checked again immediately before write.
- Completed outputs are preserved if another required aspect fails. The JSON stays in the source folder. A retry is blocked by the existing output name, preventing overwrite; the operator can inspect and remove or move the partial output before retrying.
- If final JSON movement fails after export, MP4s remain and the result reports `BATCH_SCRIPT_MOVE_FAILED`; the source JSON is retained and a partial `processed-scripts` copy is cleaned up where possible.
- A user cancellation stops the current export, marks the file cancelled, and prevents later jobs from starting. Completed prior files and outputs remain intact; pending source files remain in place.
- Per-file parse, validation, staging, voice, render and write failures do not terminate unrelated queue items. A failure while moving JSON is distinguished from render failure.

## Voice, subtitles and visual output

The v3 adapter preserves `voice`, subtitles, metadata, normalized scene durations, animation tracks, and independent variants. Export keeps the R2 canvas frame renderer and the existing caption compositor; subtitles are rendered in output screen space after the scene frame. A BOTH job carries the generated voice audio into its second aspect, avoiding duplicate TTS work. Audio resources are rebuilt per export and the decoder is closed by the existing exporter.

No source artwork, camera behavior, or scene layout is changed by batch. The accepted R2 pump MP4s remain the visual baseline; safe-area findings stay a separate visual-quality follow-up.

## Automated checks

Added routing tests cover v1/v2/v3 dispatch, unsupported explicit versions, filename sanitization, declared v3 aspects, and output collision planning. Existing v3 project tests cover adapter reuse, metadata preservation, and both independent variants. R1 timeline and existing legacy/character tests remain in `npm test`.

Results from this implementation run:

- `node tests/batch-script-routing.test.js`: latest exit 0, 4 passed.
- `npm test`: earlier R3 run exit 0; latest follow-up rerun exits 1 because the workspace no longer contains `examples/visual_dsl_v3/scientific_pump_premium.json`, which `tests/visual-dsl-v3-foundation.test.js` requires.
- `npm run test:focused`: exit 0, 8 passed.
- `node --check` for `src/app.js`, `src/render/visual-dsl-v3-project.js`, `src/render/batch-script-routing.js`, and `tests/batch-script-routing.test.js`: exit 0.
- `git diff --check`: exit 0.

The automated batch tests exercise routing, output planning, normalized aspect selection, and the preflight import binding; the browser filesystem queue, real move/cancel behavior, and MP4 output are not mocked as acceptance proof and remain for manual QA.

Follow-up fix: aspect selection now reads from the normalized staged project's `variants` for both v3 and legacy scripts. The legacy batch path previously replaced normalized scenes with raw source JSON variant objects. A regression test gives landscape and portrait distinct scene IDs and verifies the portrait selection and 720×1280 dimensions.

Single-process validation/staging measurements on this workspace (one run per fixture; cold-start effects are included and these are not MP4 timings):

| Fixture | JSON bytes | Aspect | Validation | Landscape staging | Portrait staging | Combined |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| `scientific_pump_animated_r1.json` | 57,527 | both | 30.041 ms | 12.398 ms | 0.234 ms | 42.673 ms |
| `educational_cartoon_animated_r1.json` | 39,252 | both | 3.921 ms | 0.461 ms | 0.918 ms | 5.299 ms |
| `scientific_pump_premium.json` | 47,149 | both | 5.627 ms | 0.322 ms | 0.102 ms | 6.052 ms |

Voice preparation, encoding time, total batch duration, and output sizes require browser/TTS/MP4 execution and are not inferred from these measurements.

## Browser and production QA

**BATCH QA: NOT VERIFIED. MP4 QA: NOT VERIFIED in this run.** The file-system batch depends on browser-granted `FileSystemDirectoryHandle` permissions, and this run did not execute the browser batch UI or create real batch MP4s. No customer or user script folder was touched. Automated routing/project tests are not evidence of completed MP4 output.

Disposable-folder acceptance checklist:

1. Make a temporary source folder with the scientific pump v3 fixture, educational cartoon v3 fixture, one invalid v3 JSON, and a known valid v2 JSON. Make a separate empty output folder.
2. Choose MP4 and BOTH; preview the preflight list. Confirm invalid JSON is listed with its exact filename/error and the other files remain ready.
3. Run the batch. Confirm the two v3 fixtures and legacy script render through their respective routes, each output opens, and the invalid source remains untouched. Confirm successful JSONs alone move under output `processed-scripts`.
4. Use a BOTH v3 script and verify separate 1280×720 and 720×1280 MP4s, audio, duration, subtitles and representative animation frames.
5. For partial failure, make a second-aspect output fail in the disposable folder. Confirm the first MP4 remains, source JSON remains, result names the failed aspect, and a retry refuses to overwrite the first output.
6. Cancel another disposable batch during encoding. Confirm current temporary output is aborted, later files stay in source, and completed prior outputs remain.
7. Compare a batch output against a single-video export of the same JSON for dimensions, timing, camera, subtitles and audio.
8. Check the app's result list and filesystem for exact generated MP4s and `processed-scripts` contents; save the browser console/export log with the QA record.

## Prompt Builder handoff

The single-video Prompt Builder UI and option menu are assembled in `src/app.js` (`prompt-motion-mode`, currently “Visual DSL v2 · Scene Graph” plus legacy modes). Its prompt composition helpers are in `src/render/script-prompt-builder.js` (`buildScriptStructureGuide()` / `assembleScriptPrompt()`). The multi-episode Prompt Builder is `generateBatchScriptPrompt()` in `src/app.js`; its selector is `batch-motion-mode`. Both menus currently lack a Visual DSL v3 choice.

The next prompt-generation checkpoint should add a `Visual DSL v3 — Premium Animated` mode to both selectors. It should include the v3 runtime capability manifest (`visualDslV3Capabilities` in `src/visual-dsl-v3.js`) in the generated instructions, require schema version 3 and supported node/timeline properties, and direct multi-episode generation to produce one independent `.json` document per episode. Each episode should declare `16:9`, `9:16`, or `both`; `both` must carry independently composed variants. This batch milestone accepts v3 files for rendering but does not claim to generate them from either prompt builder.

## Acceptance boundary

The shared adapter, explicit version dispatch, batch aspect planning, sequential reuse of the existing exporter, failure isolation, collision checks, source movement gates, cancellation stop behavior and project restoration are implemented. Automated tests cover routing and adapter contracts. Real mixed-folder MP4 outputs, actual move behavior, partial output failure, cancellation, and visual parity still require final user browser QA before CP5.1C is accepted.
