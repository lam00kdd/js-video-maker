# Visual DSL v2.7 mechanism synchronization

Visual DSL v2 documents may add `scene_graph.synchronizations` to connect angular mechanisms in one scene graph:

```json
{
  "synchronizations": [
    { "master_id": "engine-cycle", "dependent_id": "intake-cam-drive", "ratio": 0.5, "phase_offset": 0.7853981633974483 },
    { "master_id": "engine-cycle", "dependent_id": "exhaust-cam-drive", "ratio": 0.5, "phase_offset": 2.356194490192345 }
  ]
}
```

The resolver evaluates the master's unwrapped angle at absolute scene time and computes `dependent_angle = master_angle * ratio + phase_offset`. Angles and phase offsets are radians, positive counterclockwise. Ratio is signed and may represent any finite nonzero transmission ratio supported by the validator. Offsets are unwrapped and are not restricted to one turn. In the fixture, the two cam offsets are independently chosen to place the intake and exhaust events in their respective crank intervals.

The master timeline is the only clock for a synchronized chain. `run` advances the master; `hold`, timeline gaps, and time after the final segment retain its accumulated angle. A dependent must have `rotational_speed: 0` and an empty timeline. Because evaluation derives every angle from the requested absolute time, seek, pause/resume, and export frame ordering do not accumulate phase error. A mechanism can have at most one master. Missing IDs, self-links, zero/out-of-range ratios, dependent clock conflicts, multiple masters, and dependency cycles are rejected during normalization. Only `slider_crank`, `gear_pair`, and `cam_follower` are angular synchronization targets.

## Four-stroke reference

[`Scientific_Mechanism_Four_Stroke_Synchronized.json`](../examples/Scientific_Mechanism_Four_Stroke_Synchronized.json) is a 72-second, four-scene lesson with matching narration and scene IDs in independently composed landscape and portrait variants. It keeps the accepted slider-crank geometry and adds two isotropic cam-follower mechanisms bound to the intake and exhaust valves. The crank runs at 10°/s, or 180° per 18-second scene. Its initial mechanical angle is -90° at top dead center; the lesson's cycle-relative 0°, 180°, 360°, 540°, and 720° boundaries therefore occur at 0, 18, 36, 54, and 72 seconds. The intake is active during the first 180° interval, both valves remain closed in the middle intervals, and exhaust is active during the last 180° interval. The exhaust and intake have separate angular phase offsets.

The model is an educational idealization: it omits valve lead/lag, overlap, valve acceleration design, combustion dynamics, forces, friction, and 3D contact. The flat-follower cam contours are generated from the same cosine lift law used by the resolver. Browser preview and MP4 export still require manual QA.

## v2.7.1 fixture geometry and diagnostics

The cam artwork in the fixture currently uses a 0.043-unit base radius and 0.006-unit maximum lift (4.32 px at the 720 px isotropic scale). Its polygon contour follows the same lift law used by the resolver. The valve root is bound to the follower and moves along its configured axis. The intake and exhaust valves use the same idealized 180° crank opening window, with their separate crank-to-cam phase offsets placing the windows in strokes 1 and 4. The model remains visually schematic; the fixture does not include a separate rotating spoke or a detailed guide sleeve.

The runtime diagnostic resolves uniquely named `*-outline` and `*-face` children and reports the transformed follower-face residual. These are measurements of a 2D rigid, flat-face kinematic model. The fixture therefore has geometric contact checks, but it does not simulate physical force, compliance, friction, a roller, valve dynamics, or 3D contact. A zero measured residual applies only to the sampled transformed geometry and is not evidence of physical contact behavior.

## v2.7.1 release QA — scene and narration duration

The fixture configures four 18-second scenes (72 seconds total) in both aspect-ratio variants. Before the v2.7.1 fix, export decoded each narration WAV and replaced each scene's configured duration with that clip's duration. This could shorten a mechanism scene and stop its synchronized animation before the configured 720° cycle completed. The reported 61.7-second MP4 is consistent with that behavior (an average of 15.425 seconds per scene), but its exact audio durations were not available in the repository to independently probe.

For Scene Graph scenes, effective duration now uses the greater of configured scene duration and decoded narration duration. A shorter narration therefore leaves the mechanism running through the full configured scene; a longer narration still extends the scene so dialogue is not truncated. With the fixture's four 18-second scenes and narration clips no longer than 18 seconds, expected export duration is 72 seconds in both landscape and portrait (excluding an explicitly enabled outro). Runtime tests cover short and long narration, the 1,728-frame 24 fps schedule, and all four 18-second scene boundaries.

### MP4 timing investigation (2026-11-08)

The latest supplied 16:9 file (`...-16x9 (1).mp4`) is H.264 1280×720, 71.6664 s and 647 encoded video samples (9.03 average fps). Its first 101 samples span 0–48.6074 s, which accounts for roughly 1–2 encoded frames per second over the first 48.6 seconds; later fragments contain substantially denser samples. The 9:16 file is H.264 720×1280, 71.834467 s and 1,662 samples (23.14 average fps), with a large PTS gap around 51.54–53.00 s. Both fall short of the required 1,728 frames. PTS at 17.5 s in landscape straddles the transition region (samples at about 16.986 and 17.985 s); PTS analysis alone cannot establish the pixels, but the reported early compression frame is consistent with the render clock skipping past scene time when it falls behind.

Root cause: the former exporter paced its render loop from wall-clock elapsed time and advanced directly to `floor(elapsed * fps)`. A slow render therefore skipped frame indices. `requestFrame()` on a canvas capture track has no per-frame encoded acknowledgement, and `MediaRecorder` timestamps captured frames from real time; it cannot guarantee a complete constant-frame-rate schedule in this real-time architecture. The landscape's initial 101 samples over 48.6 seconds demonstrate this failure directly. The exported AAC spans are also shorter than the video: about 69.864 s (landscape) and 70.207 s (portrait). This does not alone prove the final phoneme was cut, but means the former audio path did not provide a full-duration synchronized track.

The exporter now uses WebCodecs through Mediabunny for offline MP4/WebM creation. It renders every integer frame index at `index / fps`, awaits `CanvasSource.add()` backpressure before proceeding, and counts encoder output callbacks. Audio clips are decoded, gain-adjusted and mixed in an `OfflineAudioContext` on the same scene-offset timeline. After muxing, the app demuxes the file and checks encoded frame count, every video PTS, total duration, and audio start/duration before enabling download. Captions remain burned into each rendered frame via the existing time-based scene renderer. Regression covers fixed frame timestamps, all frame indices, final-frame duration and sequential backpressure.

### Post-offline MP4 QA (2026-11-08)

The exported files were decoded and inspected after the WebCodecs change:

| File | Codec / dimensions | Video frames | Video cadence / span | Audio |
|---|---|---:|---|---|
| 16:9 | H.264, 1280×720 | 1,728 | CFR 24 fps, 72.000 s | AAC stereo, 48 kHz, 72.000 s |
| 9:16 | H.264, 720×1280 | 1,728 | CFR 24 fps, 72.000 s | AAC stereo, 48 kHz, 72.000 s |

Both tracks start at PTS 0. Video PTS increments are exactly 1/24 s; the final sample starts at 71.958333 s and lasts 1/24 s. Every decoded frame was scanned at reduced resolution: both files decoded all 1,728 frames, with no all-black frame. The lowest sampled mean RGB was 31.16 (landscape) and 32.39 (portrait); no all-black candidate was found. AAC decode yielded 3,456,000 audio frames per channel with no packet timestamp gap. The two audio tracks are identical. Per-second RMS shows narration activity in each of the four scene intervals, with brief silence where the generated voice ends before the 18-second mechanism scene and silence after the final spoken sentence; this is not a track cutoff.

Decoded frame contact sheets confirm the rendered headings and scene state: 17.500 s and 17.958 s remain in intake, 18.000 s enters compression; 35.958 s remains in compression, 36.000 s enters power; 53.958 s remains in power, 54.000 s enters exhaust; 71.958 s is still the exhaust scene. Burned subtitles change with the narration at those boundaries. The piston/linkage/cam artwork is present in all sampled frames; the final frame is a valid exhaust frame. No black flashes or missing visual intervals were found. This resolves the previous 16:9 premature transition and frame-loss failures without changing the fixture. The v2.7 stable tag remains intentionally uncreated pending the release decision.

Browser integration surfaced two delivery issues while loading Mediabunny: importing its raw module graph selected the Node `node:fs/promises` shim, and the server did not serve `.mjs` with a JavaScript MIME type. The app now imports Mediabunny's browser bundle, and `server.mjs` maps `.mjs` to `text/javascript`. After restarting the local server, the browser console was clean, both exports completed, and the app's mux validation passed before the downloads became available.
