# CP4.1 Sprite Character POC

## Scope

Character Library drafts have an explicit `character_type`: `rigged` or `sprite`. Missing/empty type values normalize to `rigged` for existing records; unsupported values are rejected. The type is immutable for a library identity.

`rigged` stays on the existing M1/CP2 workflow. `sprite` drafts store local fixed-pose artwork metadata and can be edited in Character Studio without rig fields. The sample `lam_educator_sprite_v1` has `idle`, `greet`, `point`, and `explain` poses. Each local SVG has a 256×384 viewBox and the same bottom-center anchor `(128, 360)`. The preview renderer applies deterministic uniform scaling by anchoring the asset bounds at a common registration point.

Sprite data is draft metadata only. The pose selector is preview state and does not alter the saved draft. Sprite artwork is local under `assets/character-sprites/lam-educator/`; no Blob is embedded in the draft and no external AI/API is used. Existing IndexedDB stores and M1 schema are not replaced.

## Boundaries

- No changes to CP2 scene rendering, M1 joints, animation clips, artwork import or MP4 pipeline.
- Sprite assets are not yet resolved by Video Studio and cannot be published as immutable M1 versions. Storage explicitly rejects publishing sprite identities.
- These poses are separate fixed illustrations, not skeletal animation; they do not blend or interpolate.
- Character Library currently supports local sample creation and editing. Sprite import, asset replacement and a broader template catalog are follow-on work.

## QA entry points

- Character Studio: create `Sprite · fixed poses`, then switch Idle/Greet/Point/Explain.
- Standalone dev harness: `/dev/character-sprite-harness.html`.
- Focused tests: `node tests/character-studio.test.js`, `node tests/character-library-storage.test.js`.
