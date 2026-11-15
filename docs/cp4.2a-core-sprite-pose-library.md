# CP4.2A — Core Sprite Pose Library Expansion

## Scope

The CP4.2A expansion adds a stable, registry-driven pose vocabulary to the CP4.2 Sprite production workflow. It does not change the CP4.1 demo renderer, M1 rig, CP2 image renderer, draft storage schema, or video pipeline.

## Pose catalog

The core catalog contains 12 promptable pose IDs: `idle`, `greet`, `explain`, `point_left`, `point_right`, `present_left`, `present_right`, `thinking`, `question`, `emphasize`, `like`, and `heart`. `point` remains a separate `Legacy` entry. It is not aliased to either directional point pose, so existing `point` artwork and metadata keep their meaning.

The catalog in `src/render/character-sprite-workflow.js` is the source of labels, categories, action text, supported character types, and screen-direction guidance. Adding a pose is intended to be additive: register its definition and the workflow/UI discover it from the registry. Prompt generation rejects unregistered IDs instead of inventing an action.

Directional actions specify the viewer-facing screen side and the intended arm. Prompts also retain the anatomical left/right convention, request the approved Master image as a manual reference, preserve identity and framing, and do not ask the image model to fabricate pixel coordinates or send the image automatically.

## Draft compatibility and import lifecycle

Old Sprite drafts normalize with missing metadata-only slots for newly registered core poses. Existing pose records remain keyed by their original IDs and retain asset IDs, demo asset references, approvals, alignment, and review state. The `point` record remains intact. New slots do not contain or duplicate artwork blobs.

Each slot uses the existing CP4.2 workflow for PNG validation, managed asset storage, alignment, Master revision matching, review, and approval. Atomic persistence still stores draft metadata and referenced asset blobs together. CP4.1's demo definition remains a separate four-art asset contract and is not expanded into new fabricated demo PNGs.

## UI

The production editor groups catalog cards by category (Basic, Explanation, Interaction, Expression, Legacy). Missing slots are visibly marked `Missing`; only registered catalog entries can generate prompts. The separate legacy point remains accessible.

## Verification

Focused tests cover the 12 stable core IDs, the separate legacy `point`, deterministic Master-referenced prompts and direction language, safe legacy draft normalization, import/alignment/approval, atomic persistence and reload, and UI grouping. Full results are reported with the checkpoint delivery; browser verification is tracked separately from automated tests.
