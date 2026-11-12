# CP4.7C — Multi-Character AI Director Integration

## Current contracts

The Prompt Builder receives verified immutable capabilities from `loadPublishedPromptCharacters`; it does not read Draft records. The UI stores a selected cast of up to five `{character_id, published_version, role_hint}` pins in browser preferences and refreshes the exact capability/checksum before generating a prompt. Directions remain the CP4.7B scene-level `character_directions[]` entries, each carrying ID, type, exact version, checksum, animation, normalized placement, and supported visibility/layer/opacity fields. No video-level cast field is required, preserving existing single-character JSON.

The resolver converts each direction into one `sprite_instances[]` or `character_instances[]` entry in that scene's Scene Graph v2. Instance IDs are unique per scene/direction. Exact version records are cached across landscape and portrait preflight within one import. The resolver checks the published type, immutable version, checksum, manifest integrity, and approved animation capability; Draft fallback is not used.

## Modes and validation

AI-decides remains the default and may emit zero directions. Require Character needs at least one valid direction in each output variant, but does not require every cast member or every scene. Explicit import confirmation validates against all selected exact pins. If that comparison is declined, each direction is still resolved and checked against its exact Published record and capabilities.

## Runtime limits

The current Scene Graph normalizers accept up to 100 Sprite references and 100 Rigged references per graph. The director prompt recommends at most two characters together in one scene; this is not a renderer limit. The UI limits the allowed cast to five to bound prompt size and published asset preparation.

Coordinates preserve the existing normalized Scene Graph convention: origin upper-left, x right, y down, range 0–1 for script directions, scale 0.01–10. The transform origin maps to the existing runtime origin; published Sprite anchor/alignment metadata and renderer baseline offsets remain authoritative. Scale 1 retains each renderer's native convention. Sprite `layer` maps to `z_index`, lower first. Rigged instance layer overrides and hidden Rigged instances are unsupported and rejected. The renderer draws objects, then Rigged/image-backed characters, then Sprites sorted by z-index; a single cross-type layer order is not currently implemented. Sprite opacity is 0–1. Horizontal flip/rotation overrides are not part of the accepted direction schema.

Both variants retain their separate scene arrays and are independently resolved. Each variant's coordinates and animation directions remain separate. Project persistence continues to use the existing project graph format and SQLite Published asset references.

## Verification limits

Automated tests cover capability prompts, AI-decides/required semantics, selected-cast matching, invalid outside-cast references, multi-instance Sprite/Rigged graph mapping, and exact-version caching. Browser, cross-browser and actual MP4 QA require manual Video Studio verification.
