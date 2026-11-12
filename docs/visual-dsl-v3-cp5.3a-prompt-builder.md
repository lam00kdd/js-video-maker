# CP5.3A — Visual DSL v3 Prompt Builder Integration

## Scope

The single-video and multi-episode Prompt Builder can now produce prompts for **Visual DSL v3 — Premium Animated**. Existing Scene Graph, Visual DSL v2, Canvas 2D, and legacy motion choices remain available. This change only generates instructions and schema examples; it does not add rendering or encoding features.

The shared prompt contract is implemented in `src/render/visual-dsl-v3-prompt.js`. It reads `visualDslV3Capabilities` from the runtime and includes supported node and geometry fields, styles, gradients, bounded shadows, clips, text, symbols, timeline fields, easing, loop modes, and limits. It also embeds a complete example selected for the requested aspect ratio. Four canonical examples are checked in under `examples/visual_dsl_v3/cp53a/` and are validated with the production V3 validator.

## Single video

Selecting V3 requests a directly importable V3 JSON document. The prompt carries topic, audience, learning objective, scientific detail, selected aspect ratio, subtitle size, duration target, supported art preset, and optional style description. `both` instructs the model to compose independent landscape and portrait variants with matching narration and durations. The preset picker offers the runtime presets `scientific_premium` and `educational_cartoon_premium`.

Published Characters are not supported by the current V3 renderer. In V3 mode, Character Direction controls are disabled and a limitation notice is shown. Previously selected character options are preserved for legacy prompt modes.

## Multi-episode

V3 series mode specifies an exact or automatic episode count, duration cap, aspect ratio, consistent art preset, independent scenes per aspect, and individually named JSON files. It asks for a ZIP only when the active AI tool can actually create one, and tells the model to disclose when it cannot. It does not imply the app itself creates a ZIP from generated prompt output.

Single and series preset choices are persisted independently (`promptV3Style` and `batchV3Style`).

## Verification and limits

- `node tests/visual-dsl-v3-prompt.test.js`: 5/5 passing, including validation of every canonical example, prompt aspect selection, series instructions, legacy option retention, and UI wiring.
- `npm run test:focused`: 8/8 passing.
- `npm test`: passing on this workspace.
- `node --check src/app.js` and `node --check src/render/visual-dsl-v3-prompt.js`: passing.
- `git diff --check`: passing; Git only reported its configured LF-to-CRLF notices.

Browser interaction and actual ChatGPT-generated JSON import/render QA were not performed. The checked-in examples and prompt examples pass the runtime validator; that is not evidence that an external model will follow the prompt every time. No acceptance is claimed for those unperformed checks.
