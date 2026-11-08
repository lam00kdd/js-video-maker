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
