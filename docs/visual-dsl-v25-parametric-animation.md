# Visual DSL v2.5 Parametric Animation

Visual DSL v2 supports an optional `scene_graph.mechanisms` array. The first registered constraint is `slider_crank`.

```json
{
  "id": "engine-drive",
  "type": "slider_crank",
  "params": {
    "crank_center": { "x": 0.5, "y": 0.7 },
    "crank_radius": 0.105,
    "connecting_rod_length": 0.29,
    "cylinder_axis": { "x": 0, "y": -1 },
    "initial_angle": 1.57079632679,
    "rotational_speed": 1.57079632679
  },
  "timeline": [
    { "start_seconds": 0, "duration_seconds": 3, "mode": "run" },
    { "start_seconds": 3, "duration_seconds": 1, "mode": "hold" },
    { "start_seconds": 4, "duration_seconds": 4, "mode": "run" }
  ],
  "bindings": {
    "crank": "crank",
    "connecting_rod": "connecting-rod",
    "piston": "piston"
  }
}
```

Each referenced root object also declares `binding: { "mechanism_id": "engine-drive", "role": "crank" }` (with its matching role). The crank target must be a group, connecting rod a line/connector, and piston a drawable shape. Mechanical lengths are measured in units proportional to the shorter canvas dimension; `crank_center` is normalized. `cylinder_axis` is normalized during validation. `connecting_rod_length` must be greater than `crank_radius`.

`run` advances the angle by `rotational_speed` radians per second; `hold` stops it. Unspecified time intervals hold the current angle. Without a timeline, the mechanism runs for the full scene. After a timeline ends, it holds its final angle. Resolver evaluation is absolute-time and stateless, so seeking and export frame order produce the same pose.

This is a rigid 2D slider-crank constraint. It does not model combustion, pressure, mass, inertia, or out-of-plane geometry. Existing Visual DSL v1 documents and v2 documents without mechanisms remain unchanged.

Fixture: [`Visual_DSL_v25_Slider_Crank.json`](../examples/Visual_DSL_v25_Slider_Crank.json).
