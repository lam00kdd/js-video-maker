# CP5.0 — Visual Director and batch production design

## Visual Director prompt pipeline

Separate the model's work into constrained stages, even when delivered as one prompt:

1. **Learning plan:** audience, learning objective, source constraints, accurate Vietnamese explanation, opening/development/conclusion.
2. **Visual concept:** choose a coherent metaphor/technical illustration strategy that does not distort science.
3. **Art direction:** palette, bundled type tokens, illustration language, material/light cues and recurring series identity.
4. **Scene composition:** focal subject, support visuals, callouts, negative space, title/subtitle safe regions and intended reading order.
5. **Object planning:** choose registered symbols and concise parameters before adding freeform path details.
6. **Motion direction:** map each movement/reveal/camera beat to narration and bounded time.
7. **Character direction:** use only catalog capability references and pinned Published versions; auto/required mode applies.
8. **Output validation:** emit JSON only, validate IDs, durations, character pins, asset manifest and supported fields.

The renderer ships a machine-readable capability manifest derived from validators and registries: schema version, node types, style fields, easing/actions, symbol registry/version, fonts, asset MIME limits, character capability IDs, aspect modes and budgets. Prompt builder injects the selected manifest subset and never relies on prose alone. Unknown fields fail validation with a structured path/message; the repair prompt is generated from errors.

Use shared styles and symbols, theme tokens and scene templates to avoid repeating JSON. Keep per-scene content and composition explicit. Do not ask the model to draw thousands of path points; prefer symbols, a small number of curated paths and bundled imagery. The prompt can suggest but must not claim artistic quality based on machine checks.

## Multi-video generation

Current app capability: prompt generation for a series exists in `generateBatchScriptPrompt()` in `src/app.js`; it requests an ordered outline and separate JSON per episode with stable `*_Tap_01_*` filenames and optional ZIP from the AI tool. It carries topic, audience, count, duration, ratio, style and motion mode. It does not itself create a ZIP or generate episode JSON. Episode numbering is requested by naming pattern, not verified at prompt stage. Per-episode duration is prompt constrained; each file's current importer/batch validator enforces schema rules. Existing shared series style is a single prompt style string; selected Published character cast is not currently wired into the series prompt UI. Multi-video asset2d is explicitly disallowed.

Future staged flow: (1) series brief and source map, (2) episode outline with unique learning objective and no duplicated coverage, (3) freeze `series_id`, palette, typography, symbol set, asset pack refs and selected pinned cast, (4) produce one independent prompt/file per episode, (5) validate each file independently and report filename/errors, (6) package each JSON plus referenced local assets and optional ZIP. If output is too large, generate numbered batches with a persisted episode manifest; never concatenate all episodes into one video JSON. Suggested filename: `KHTN6_Tap_01_Nguyen-ly-bom-xe-dap.json`.

The series manifest should record episode number/count, slug, source references, shared art direction, cast pins and expected filename. Validate unique numbering, filenames, distinct objectives and per-video duration. Each video remains independently importable and batch renderable.

## Protected current folder-to-MP4 behavior

The present batch workflow is documented in [the architecture map](cp5.0-current-architecture-map.md). Keep its directory picker, review-first validation, selected aspect outputs, sequential execution, Vietnamese voice generation, item-level failure isolation, progress UI, output naming and cleanup behavior. Today successful source JSON moves to `processed-scripts`; do not silently change that contract during integration.

### Smallest v3 integration boundary

Add a version-dispatching import adapter: v1/v2 continue through current import; v3 validates and normalizes to a common render-job interface. Keep `runBatchExport` responsible for file discovery, queue, user review, naming, per-item outcome, output writing and progress. The renderer bridge receives an immutable normalized job and resolved local assets/character pins, then returns the same MP4 Blob contract. Do not put v3-only orchestration in file picker code. Validation/preflight runs on every file before any render starts.

### Future job manifest

For each batch, record source relative name/hash, schema version, output names/aspects, voice status, validation report, pinned character versions/checksums, renderer build, status, timestamps, frame counts, error and retry count. Keep manifest adjacent to output and write atomically. Retry only failed items; never re-render successful outputs without explicit overwrite choice. Bounded concurrency starts at 1 and rises only after memory measurements. Cache assets by content hash within a job. Include optional preview thumbnails and deterministic structured logs. Preserve source scripts on failure and archive only after all requested outputs pass validation.

### Batch acceptance

Test 3+ independent files, duplicate titles, malformed JSON, missing asset/character, voice failure, aspect variants, cancellation mid-render, output collision, retry after failure, partial output cleanup, restart/resume, and deterministic rerender naming. Verify one failed file does not prevent later files. Verify source archive semantics explicitly. Measure peak memory and wall time at concurrency 1 before testing higher values.
