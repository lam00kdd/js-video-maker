# CP5.0 — Roadmap, acceptance and risks

## Checkpoint sequence

| Checkpoint | Scope and dependencies | Deliverables | Verification / exit criteria | Main risk |
|---|---|---|---|---|
| CP5.1 — DSL foundation | New schema, versioned validator, normalization; no legacy compatibility requirement, but no data deletion | JSON schema, validator, capability registry, normalized tree, minimal vector/group/symbol renderer bridge | Schema/security tests; normalization fixtures; browser scene and basic export; 1:1 preview/export frame clock; current batch workflow smoke pass | Scope creep into style, assets and character rewrite |
| CP5.2 — Premium 2D | Depends on stable normalized tree | Gradients, typography, shadows, camera pan/zoom, bounded tracks | Font fallback/wrapping tests; golden frames; portrait/landscape review; MP4 parity | Font or Canvas differences |
| CP5.3 — AI Visual Director | Depends on capability manifest | Staged prompt architecture, art direction, composition grammar, repair diagnostics | Prompt snapshots; generated JSON validates only supported fields; blind educator/designer review | Long prompts/token size; unsupported suggestions |
| CP5.4 — Asset and character composition | Depends on asset manifest and render-layer contract | Local image package/cache, Sprite/Rigged adapter, stable z-order, pinned reference preflight | Offline render, checksum/missing asset cases, layering fixtures, no SQLite mutation | Asset licensing and cross-version rendering |
| CP5.5 — Series and batch production | Depends on stable v3 jobs, asset/character preflight | Series manifest/prompts, independent files, v3 batch adapter, logs/retry/optional thumbnails | Multi-file integration, failure isolation, retry, naming, 16:9/9:16 outputs, batch manifest | Memory pressure; input archival semantics |
| CP5.6 — Visual QA and optimization | Depends on benchmark scene pack | Layout diagnostics, visual regression, profiling and production polish | Five benchmark scenes reviewed by humans; visual threshold and memory budget met; defects triaged | Automated metrics mistaken for artistic approval |

Each checkpoint uses isolated new schema/runtime modules and incremental integration. No checkpoint replaces the full app. Existing project/history data and Published Character records remain untouched; historical project auto-open compatibility is optional for the future v3 format.

## Proposed CP5.1 scope in detail

1. Freeze top-level/scene/node/track JSON schema and numeric budgets from the DSL design.
2. Implement strict parser/validator that rejects unsafe fields, unknown features, nonfinite values, recursive symbols and package traversal.
3. Normalize to a stable intermediate tree with deterministic IDs/order and explicit defaults.
4. Render primitives, strict path subset, nested groups, solid fills/strokes and symbol instances.
5. Define renderer adapter contract and integrate only a small v3 preview/export bridge.
6. Keep all existing mode imports and current batch path unchanged; no Character Library writes in the bridge.
7. Establish benchmark fixture plus frame time/parity and basic performance gates.

**Exit:** validated v3 can render the primitive benchmark deterministically in preview and MP4; unsupported documents fail before rendering with useful paths; current batch can still process existing supported JSON; no DB or browser project data migration occurs.

## Acceptance metrics

- Text: at 1080px portrait master, body >=32px, labels >=26px, title >=48px; report effective output size and overflow. Scaled equivalents apply to landscape.
- Safe layout: critical content within 5% edge margin; subtitle panel reserves bottom 18%; no overlap with title/subtitles or clipped required labels.
- Contrast: target 4.5:1 for small text, 3:1 for large text; warn and identify elements.
- Accuracy: qualified reviewer confirms diagram labels, ordering, direction, state and narration align; no fabricated ISO/IATF clause requirements.
- Consistency: character version/checksum exact; image hashes valid; no missing assets; approved style pack IDs match.
- Temporal: no invalid/off-scene tracks, no unexplained discontinuity at scene boundaries; deterministic frame timestamps and stable easing.
- Parity: same browser/build/input/time gives same normalized scene and near-identical preview/export pixels; establish a tolerance from codec/composite behavior, starting at <=1 RGB value per channel for raw canvas captures.
- Aspect: human-inspected separate 16:9 and 9:16 designs, safe regions and readable text.
- Performance: establish time/frame and peak memory targets on the five benchmark scenes before increasing caps/concurrency.

Automated checks are diagnostic gates. Human review must sign off visual hierarchy, composition, clarity, style and animation quality.

## Feasibility spikes (design only)

| Spike | Hypothesis / minimal scene | Acceptance and measurement | Risk / scope |
|---|---|---|---|
| Strict SVG path | bicycle pump silhouette using cubic paths | same path at preview/export; parse <10ms; command budget enforced | parser edge cases; 2–3 days |
| Group transforms | nested pump barrel/piston group | origin/scale/rotation exact at frame samples; benchmark draw cost | transform order confusion; 1–2 days |
| Gradient + shadow | one metal cylinder, two gradient stops, one shadow | stable pixels across preview/export; frame time/memory recorded | Canvas blur variance; 1–2 days |
| Local PNG overlay | packaged lab background plus vector labels | offline decode, hash failure diagnostics, no network calls | large decode memory; 1–2 days |
| Sprite/vector interleave | one pinned Sprite behind callout and in front of panel | correct single z-order list and checksum resolution | current renderer passes characters separately; 2–3 days |
| Rigged/vector parity | one rigged explainer with two action intervals | stable time sampling, exact version and frame consistency | rig runtime may have mutable state; 2–4 days |
| Deterministic timeline | 3 tracks sampled out of order | same absolute timestamp yields byte-identical transforms | easing/time rounding; 1–2 days |
| Batch v3 adapter | 3 files, one invalid, one both-ratio, one character pinned | valid files complete independently; invalid preflighted; log reproducible | retain archive/retry semantics; 3–5 days |

These are not implemented in CP5.0.

## Current CP5.0 verification record

- Repository root/branch/status recorded; substantial pre-existing dirty/untracked state left unchanged.
- Startup command identified: `npm start` (`node server.mjs`).
- Shared SQLite path and IndexedDB database/key responsibilities documented. Neither database was opened or changed.
- Folder batch workflow traced from directory handles through parse/validation, sequential render, output write and success archive/error cleanup.
- MP4 files located, but frame extraction tool unavailable; visual review remains open.
- Proposed JSON fixtures are syntax-checked separately; `git diff --check` requested in task and will be run after docs are complete.
- Runtime tests are not run for this documentation-only checkpoint; no runtime code modified by CP5.0.

## Known unknowns

No frame-level findings on the two supplied videos; no 16:9 baseline sample; no measured renderer throughput or peak memory; no formal file-level schema for existing classic mode; no external art-generation service is assumed. Asset provenance/licensing, browser support floor for File System Access API and chosen bundled fonts must be settled before production. CP5.0 is a proposal and must not be marked accepted until the user reviews it.
