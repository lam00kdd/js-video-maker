# CP4.7B — Character Direction Import Adapter

## Accepted script contract

The adapter consumes the CP4.7A optional scene-level `character_directions[]` contract. Each entry must pin `character_id`, `character_type`, `published_version`, and `published_checksum`, select a supported `animation`, and provide `placement.x`, `placement.y`, and `placement.scale`. Coordinates are normalized from 0 to 1, scale from 0.01 to 10. Directions are resolved against the exact server-backed Published version before the import candidate is offered; the active project is untouched on failure. Character-free scripts skip all character-library reads. Until the project render path can composite character instances over classic and Canvas2D scenes, character directions require `motion_mode: "scenegraph"` and valid v2 scene graphs; other modes receive an explicit import error to protect their scene visuals.

## Placement and timing

The runtime uses normalized canvas coordinates: origin at the upper-left, x increases right, y increases down. The direction coordinates map directly to the existing Scene Graph transform origin. They are not a ground-line promise: published Sprite anchor/alignment metadata and the existing renderer's baseline offset remain authoritative, and are not rewritten. In 16:9 and 9:16, the same normalized coordinate maps to the same fractional canvas position. Scale 1 preserves the renderer's existing published asset/rig size convention.

`visible` defaults true, `opacity` defaults 1, and `layer` defaults 0. Sprite `layer` maps to existing `z_index` (lower values render first). Sprite `active_start_seconds` and `active_duration_seconds` gate visibility inside the scene; the Sprite clip evaluator still supplies deterministic frame, loop, and hold behavior. X/Y, scale, opacity, visibility, and layer are validated by the existing Scene Graph normalizer.

Rigged directions map only to existing M1 `character_instances` and the approved `idle`, `breathe`, or `blink` action runtime. Rigged transform x/y/scale/opacity and action start/duration are passed to that runtime. Its current renderer does not expose instance visibility or a scene-level layer override, so those requests fail with an explicit diagnostic. No Sprite clip IDs are converted to Rigged actions.

## Current limits

The CP4.7A contract currently emits Sprite `pose`/`clip` and Rigged `motion`; it does not emit Sprite pose timelines. Timeline import remains unsupported until the script contract carries the runtime timeline data. Scene Graph instances are preserved by existing project normalization and project JSON serialization. Browser/MP4 behavior still requires manual verification in Video Studio.
