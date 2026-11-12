# CP4.4 — Sprite Wave Frame Clip

## Clip record

Sprite production metadata now has an optional `clips` array. A clip is keyed by a stable `clip_id`, bound to a Character Library ID and approved Master revision, and records its source pose ID and asset, ordered frames, FPS or per-frame durations, loop/hold behavior, version, validation status, and manual approval status. Each frame references a SHA-256 managed PNG asset ID and stores native dimensions, normalized anchor, and uniform alignment. Temporary object URLs are used only to decode preview images; they are never persisted.

The initial template is `wave`, with eight frames and an 8 FPS default. The prompt requests a 2048×1024 sheet with eight 512×512 cells in a 4×2 row-major grid. Import accepts other dimensions when the PNG divides evenly into four columns and two rows, and rejects non-divisible sheets and empty cells. A PNG can instead be assigned into any explicitly numbered frame slot. Import and replacement preserve the previous clip until the new PNG validates.

## Prompt and import

`buildWaveFramePrompt` is deterministic. It requires an approved Master and current approved Greet pose and states: “Attach the approved Master Character image and the approved Greet pose image as references.” It also tells the user that images are not sent automatically. No AI API is called.

Sheet slicing uses Canvas to crop the eight cells into managed PNG blobs. The source art is not altered for alignment; frame corrections remain metadata. Opaque frames are retained and flagged for explicit manual review. Save Draft passes frame blobs and the draft metadata to the existing atomic Character Library transaction. Replaced blobs are cleaned up by that transaction only after checking remaining references.

## Playback and review

`evaluateSpriteClip(clip, timeSeconds, options)` chooses frames from absolute time, using cumulative per-frame durations or `floor(local_time * fps)` boundaries. It supports looping and hold-last-frame. Play, pause, stop, seek, step, loop, and FPS controls are local to the Sprite editor and do not add Video Studio or MP4 support.

Incomplete clips can be inspected but cannot be approved. Approval checks all eight managed assets and their decoded dimensions, current Master revision, current approved Greet source, technical diagnostics, and an explicit manual-review checkbox. Identity matching remains a human visual review.

## Scope

Only Wave is provided in this checkpoint. Future clip IDs can use the same frame schema. Rigged characters, M1, CP2, and MP4 rendering do not use this clip model.
