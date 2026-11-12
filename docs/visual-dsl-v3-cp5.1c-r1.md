# CP5.1C-R1 · Timeline stabilization

## Scope

R1 stabilizes the v3 scene-time evaluator and Canvas2D path reveal. Video Studio import, MP4 and batch end-to-end verification remain R2/R3 work. The existing partial app branches are retained but are not accepted or proven by this checkpoint.

## Timeline contract

Each scene may contain `timeline: { tracks: [...] }`. A track has `target_id`, `property`, `keyframes`, and optional `loop`. Targets are IDs in the scene node tree, or the reserved `camera` target. A keyframe has `time_seconds`, `value`, and optional `easing`. Times are finite, strictly increasing scene-local seconds within `[0, duration_seconds]`.

Supported node properties are `x`, `y`, `rotation_degrees`, `scale_x`, `scale_y`, `opacity`, `visible`, and `draw_progress`. Camera properties are `camera.pan_x`, `camera.pan_y`, and `camera.zoom`, all targeting `camera`. Node transforms are absolute transform values, not frame-to-frame offsets. Missing properties retain the source transform. A parent group transform composes with child-local transforms through the existing renderer. Symbol instances animate independently through their own transform/opacity/visibility tracks; symbol definitions remain immutable.

Numeric properties use linear interpolation by default. `ease_in` is `t²`, `ease_out` is `1-(1-t)²`, and `ease_in_out` is smoothstep `t²(3-2t)`. Easing belongs to the segment that starts at that keyframe. `visible` is discrete: a value takes effect at its keyframe timestamp and holds until the next. Before the first key and after the last, values clamp to the nearest endpoint. Evaluation clamps requested time to scene duration and never mutates normalized input.

Optional loop `{mode:"repeat"|"ping_pong", count:N}` adds N repetitions after the original keyframe span (N is 1–20). Exact cycle boundaries resolve to the arriving endpoint. After the bounded repeats, the property holds the final endpoint (or the ping-pong return endpoint). Loop tracks require at least two keyframes.

Limits: 32 tracks/scene, 64 keyframes/track, 512 keyframes/scene, 20 extra loop repetitions, zoom `[0.5,4]`, camera pan `±2400`, scale nonzero within `±100`, opacity/progress `[0,1]`. Duplicate target/property tracks are errors. Unsupported fields/properties are rejected.

## Bézier stroke reveal

`draw_progress` applies to the stroke only; it does not morph or reveal a filled shape. The validated path subset remains M/L/H/V/C/S/Q/T/Z (absolute and relative syntax). During normalization, the parsed commands are flattened once into bounded polyline subpaths using 24 samples per cubic/quadratic segment. Progress follows cumulative approximated arc length, preserves move boundaries, and is cached in normalized geometry. A single path is bounded by the existing 160-command limit and 8,192 flattened points. SVG arc commands remain unsupported.

## Camera

Camera transforms world-space v3 content around the viewBox center: translate to center, apply zoom, then offset by pan in viewBox units. Thus positive pan moves the framing toward positive coordinates and world content appears to move opposite pan. Stage background remains screen-space. Video Studio subtitles/logo are composited after v3 canvas rendering and remain screen-space. Camera state starts at pan `(0,0)`, zoom `1` for every scene.

## R1 fixtures and verification

- `examples/visual_dsl_v3/scientific_pump_animated_r1.json` retains the CP5.1B landscape and portrait artwork and adds piston/shaft, valve, hose reveal, and camera tracks.
- `examples/visual_dsl_v3/educational_cartoon_animated_r1.json` retains the premium robot composition and adds robot, sensor, and camera movement.
- `tests/visual-dsl-v3-timeline.test.js` covers validation, interpolation, seeks, loop boundaries, visibility, hierarchy, symbol instance transforms, camera, path reveal, and both animated fixtures.

Automated renderer tests use a deterministic Canvas2D recording context. Browser, MP4 export, and folder batch QA are separate integration tasks and are not asserted by R1.
