# CP5.3B — AI Visual Director

## Status and audit

CP5.3A prerequisites were present before this change:

- The Single-Video Prompt Builder offers `Visual DSL v3 — Premium Animated` and routes to `buildVisualDslV3SinglePrompt`.
- The Multi-Episode Prompt Builder has the same V3 choice and routes to `buildVisualDslV3SeriesPrompt`.
- Both builders use `visualDslV3PromptContract`, which reads the runtime capability manifest rather than maintaining a second node/property registry.
- `createVisualDslV3CanonicalExamples` supplies minimal, animated, portrait-cartoon and both-aspect examples. `validateVisualDslV3CanonicalExamples` checks them with the production validator; matching fixtures are checked in under `examples/visual_dsl_v3/cp53a/`.
- The implementation and validator are in `src/visual-dsl-v3.js`; the renderer consumes normalized V3 scene trees and absolute-time timelines.
- Single-video controls already provide topic, audience, objective, animation type, duration, aspect ratio, preset, subtitle size, Scientific Visual Planner and detail levels `basic`, `detailed`, `advanced`. Their values and persistence are retained.
- Published Character controls are explicitly disabled for V3 because the current V3 runtime does not render character nodes. Legacy Scene Graph, Canvas 2D and classic prompt routes remain separate.
- Series prompts already specify independent files, episode numbering, batch import and truthful ZIP limitations.
- The app's downloadable Project Instruction contains a concise V3 schema summary; prompts add the capability-aware runtime contract and validated example.

The pre-change V3 prompt emphasized a generic design sequence and vector craft, but did not explicitly direct the model to inventory functional object parts, align every shot to narration, vary scene purpose, choose a representative equipment configuration, preserve object identity across scenes or review mechanism contradictions. The series prompt requested non-repetition but lacked the same object-level method used by single-video generation.

### Repository baseline

Work began on branch `codex/visual-dsl-v2.8-natural-human-rig`. The workspace already contained many modified and untracked files, including the app, V3 runtime, Character Library, renderer and existing CP5 documents. Their state was recorded before editing and preserved. This checkpoint changes only the V3 prompt builder, its prompt tests, this document and the CP5.3B benchmark input fixture.

Baseline checks before CP5.3B edits: `npm run test:focused` passed 8/8. `npm test` emitted passing results for all completed script groups, including V3, batch, renderer, Character Library and script prompt groups; it terminated without a returned final process status in the tool session, so the final post-change run is the authoritative full-suite result.

## Visual Director architecture

`buildVisualDirectorGuidance` is the shared prompt-planning module. Single and series builders call it; it creates internal reasoning instructions only. It does not add planning fields to the V3 document or introduce a competing Prompt Builder architecture.

The pipeline is:

1. Interpret topic, audience and narrated learning point.
2. Identify concepts, causal mechanisms and representative object configurations.
3. Specify object function, silhouette, essential/fixed/moving parts, inputs/outputs, connections, axes, materials and labels.
4. Choose scene purpose and framing based on the narrated idea.
5. Build recognizable vector structures with the supported geometry vocabulary.
6. Direct motion and camera only with current timeline capabilities.
7. Review scientific consistency, continuity, composition and JSON/runtime validity.

The final output remains the existing V3 envelope. Storyboards, object inventories, QA scores and other planning notes are not emitted as JSON fields.

## Scientific object planning and fidelity

The detail selector remains backward-compatible:

| Existing value | Prompt meaning |
| --- | --- |
| `basic` | Conceptual simplification that preserves essential physical or causal relationships. |
| `detailed` | Recommended recognizable representative object, important components/connections and readable labels. |
| `advanced` | Useful cutaways, component relationships, motion paths and callouts, without invented dimensions, tolerances or model-specific claims. |

When designs vary, the model is directed to use a representative generic configuration, avoid mixing incompatible assemblies and avoid claiming that external research was performed. User references are only used if actually attached; hidden internal components must not be inferred as observed facts. Exact manufacturer/model fidelity remains dependent on supplied, readable references.

The planning language explicitly covers mechanical, electrical/electronics, industrial automation, natural-science, quality-management and robotics lessons without hardcoding runtime objects for individual topics. It allows a block diagram when abstraction is the teaching goal. It warns against using a generic labeled rectangle when the lesson requires recognition of a physical device.

## Scene diversity and narration alignment

The shared director suggests conceptual scene purposes: establishing/context, introduction, close-up, cutaway, exploded view, process flow, mechanism, comparison, cause/effect, system overview, problem/solution and summary. These are storyboard categories, not V3 node types.

Each scene is planned around one learning point, subject, relationship, framing, labels and viewer takeaway. Adjacent shots should add an insight or change visual emphasis; required repeated views are allowed when they show different phases. Every visual action must explain or reinforce the corresponding narration.

## Composition, continuity, motion and style

- Landscape may pair a context view with a close-up; portrait must be independently composed with a larger subject, fewer callouts, shorter labels and safe subtitle space.
- Repeated devices keep the same identity, orientation, component geometry, terminology and color conventions. Symbols and tokens should be reused where useful.
- Motion follows the narrated mechanism: correct direction, axes, state and coordination. Key motion should not finish well before its explanation.
- Camera direction remains within supported V3 camera tracks. The prompt explicitly excludes unsupported 3D, physics simulation, perspective, depth of field, path morphing and raster-image features.
- Scientific Premium and Educational Cartoon Premium alter presentation only; cartoon style does not alter physical relationships.
- An internal 0–5 quality rubric covers relevance, scientific coherence, recognizability, structural plausibility, scene variety, composition, typography, motion and continuity. No score is emitted, and the instructions state that a score does not prove scientific correctness. Contradictions and invalid JSON require revision.

## Prompt construction and optimization

The runtime contract remains the source of truth for nodes, exact geometry fields, styles, path commands, transforms, typography, timelines, easing, presets and budgets. Manifest and example JSON are now compact JSON in the prompt, reducing whitespace without changing their data. Canonical fixtures and validator checks remain unchanged.

Single-video generation includes the shared director when Scientific Visual Planner is enabled and provides a concise accuracy/runtime guard when it is disabled. The existing `basic`/`detailed`/`advanced` values now change the semantic depth of the planning instructions. Series generation uses the same shared guidance and now exposes the same three-level Scientific Detail selector in the Multi-Episode dialog; its choice is saved as `batchV3ScientificDetail` and restored the next time the dialog opens. Existing topic, audience, duration, ratio, style, art preset, filename, episode count and ZIP behavior remain in place and continue to be persisted.

The single-video dialog reuses its existing Scientific Visual Planner toggle and Scientific Detail Level selector. The Multi-Episode dialog adds a V3-only Scientific Detail Level selector because it previously had no control for this choice. The new preference is validated to `basic`, `detailed` or `advanced` and defaults safely to `detailed` for older saved preferences.

### Prompt-size observation

With the same sample inputs (`Pump`/`students`, and `sensors`/`students` for the series), prompt lengths changed as follows:

| Prompt | Before | After | Change |
| --- | ---: | ---: | ---: |
| Single 16:9 | 18,447 | 16,314 | -11.6% |
| Single both | 26,948 | 19,044 | -29.3% |
| Series both | 27,004 | 19,931 | -26.2% |

These are deterministic character counts for the recorded sample arguments, not hard maxima; longer user topics/styles add characters.

## CP5.3B static benchmark inputs

`examples/visual_dsl_v3/cp53b/benchmark-topics.json` defines reproducible prompt inputs and human review targets for:

1. Bicycle pump: pump silhouette, piston/cylinder, intake/outlet behavior and airflow direction.
2. Inductive proximity sensor: body/sensing face, metal target, detection zone and controller signal.
3. Induction motor: stator/rotor/shaft, rotation axis, consistent motor type and independent portrait composition.
4. Industrial robot arm: base/links/joints/end effector, workpiece, sequence and workspace.
5. School water-filtration lab: suitable apparatus, process order, causal claims and portrait subtitle safety.

Automated benchmark tests verify deterministic prompt construction, shared guidance, selected aspect and validator-compatible embedded examples. They do not generate model outputs or establish the listed targets as satisfied in a rendered video.

## Before/after comparison

The controlled prompt-level comparison keeps topic, audience, duration, aspect, preset and detail level constant. Before CP5.3B, the single prompt contained a short generic concept-to-composition sequence; the series prompt asked for episode outlines and non-repetition. After CP5.3B, both contain the same object specification, scene-purpose, narration alignment, structure, composition, continuity, motion/domain and internal review guidance. This is a structural prompt comparison only; model output variation and actual visual quality have not been measured.

## Validation and QA status

- Automated tests cover the shared guidance, all detail levels, planner on/off behavior, series reuse, five static benchmark inputs, canonical example validation, aspect variants, runtime contract and legacy builder option retention.
- `npm test`, `npm run test:focused`, `node --check` and `git diff --check` are required after implementation; exact post-change results belong in the final report.
- **BROWSER UI QA: NOT VERIFIED.** The Computer Use app approval timed out during target-window inspection. Source-level and automated route checks pass; a screenshot or static test is not a substitute for interacting with both Prompt Builders.
- Browser QA should still verify both actual Prompt Builder routes and inspect generated prompt content. A screenshot of the builder alone is not evidence of accurate generated artwork.
- **REAL AI OUTPUT QA: NOT VERIFIED.** No authorized AI-generation environment was available during this implementation. No AI-generated JSON, imported output, rendered frame or scientific visual review is claimed.

## Known limitations and CP5.4 handoff

Prompt instructions guide probabilistic model behavior; they cannot guarantee scientific accuracy, varied scene composition or valid JSON on every generation. The current vector renderer has finite node/path/text/timeline limits and does not render external images, arbitrary filters, masks, blend modes, 3D, or Published Characters. Prompt-time reference use is limited to material the user actually supplies to the external AI workflow; the app does not fetch references or attach them automatically.

CP5.4 can add a deliberate reference attachment workflow, validated domain asset packages, renderer-supported raster/SVG assets and a human-reviewed visual QA loop. It should keep reference provenance separate from AI inference and continue to gate unsupported features against the runtime manifest.
