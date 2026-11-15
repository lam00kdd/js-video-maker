# CP4.3 — Sprite Animation Runtime

## Runtime

`src/render/sprite-animation.js` exports `normalizeSpriteTimeline` and the pure `evaluateSpriteAnimation(character, timeline, timeSeconds, options)` function. Evaluation depends on absolute time, so callers can seek or resume without accumulated frame state. It returns the active pose and asset references, alignment metadata, deterministic transform, transition opacity and diagnostics. Rendering remains an adapter responsibility.

The timeline shape is `{duration_seconds, loop, segments}`. Each segment uses `pose_id`, `start_seconds`, `duration_seconds`, optional `micro_motion` (`none`, `breathing`, `sway`, `float`, `gentle_bob`), `transition` (`cut`, `fade`, `crossfade`) and `transition_seconds`. `fade` is accepted as the crossfade behavior. Segments may overlap: the most recently started segment wins. Gaps hold the last started pose; a leading gap uses the default pose. At a crossfade start the incoming image opacity is zero; progress reaches one at the specified duration. A zero-duration transition is an immediate cut.

Only poses with approved review state, an asset reference/ID and matching current Master revision are returned as production poses. Invalid requested poses create errors in `diagnostics`. By default, preview evaluation may use an approved idle fallback; the requested ID remains separately reported and a warning identifies the fallback. Pass `{previewFallback:false}` for strict output. The harness explicitly treats its four local demo images as approved preview fixtures; this does not alter production records or approvals.

Motion is sinusoidal and bounded by default: breathing scale ±0.75%, sway ±1 degree, float ±1.5% of stage height and gentle bob 0–1% of stage height. `period_seconds` and per-effect `amplitude` options tune these safely; output transforms never mutate source pose data. Alignment metadata is copied through for the renderer to place each image in shared registration space.

## Harness and future clips

Open `dev/character-sprite-harness.html` for a local preview with playback, seeking, looping, pose, motion and transition controls. The harness lists only Sprite records from the existing Character Library, reads draft metadata and content-addressed asset blobs without writing, validates blobs through `CharacterLibraryStorage.getAsset`, and keeps all timeline state in memory. The CP4.1 sample remains an explicitly labeled demo entry. The returned render state leaves room for a future `source_kind: 'frame_clip'` and clip/frame reference resolver, but CP4.3 does not load frame sequences, slice sheets or play clips.

Pose options are built from the canonical registry plus additional IDs present in character metadata. Missing, pending, rejected, stale-master, and corrupt/missing-blob entries remain visible and disabled with their reason. The harness decodes a managed PNG once per asset ID, revokes its object URL after decode, and renders with the existing stored anchor and alignment metadata.

## Review notes

The Character Studio persistence and rigged renderer paths are not used by this runtime. The pose registry remains in `character-sprite-workflow.js`; `point` stays independent from directional point poses. The harness uses the existing `drawSpritePose` path.
