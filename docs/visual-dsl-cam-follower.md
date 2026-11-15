# Visual DSL `cam_follower`

`cam_follower` adds an idealized rotating cam and a translating flat-faced follower to the parametric mechanism registry. It reuses the Visual DSL v2 scene graph, resolver, renderer, and Inspector.

## Schema

```json
{
  "id": "cam-drive",
  "type": "cam_follower",
  "local_geometry_space": "isotropic",
  "params": {
    "cam_center": { "x": 0.43, "y": 0.45 },
    "base_radius": 0.15,
    "max_lift": 0.045,
    "follower_axis": { "x": 0, "y": -1 },
    "initial_angle": 0,
    "rotational_speed": 0.3926990817,
    "profile": {
      "rise": 0.25,
      "high_dwell": 0.25,
      "return": 0.25,
      "low_dwell": 0.25,
      "phase_offset": 0
    }
  },
  "timeline": [{ "start_seconds": 0, "duration_seconds": 4, "mode": "run" }],
  "bindings": { "cam": "cam", "follower": "follower" }
}
```

The four phase fractions must total 1. `phase_offset` selects the starting location in the cycle and defaults to zero. Cam and follower bindings reference distinct root objects with matching `object.binding` roles. The cam root is a group centered by the mechanism; the follower root is authored in its low position. Bound roots cannot have independent move, rotate, scale, or follow-path actions.

Angles advance from absolute scene time through `run` intervals. `hold` intervals and gaps preserve the accumulated angle. Rise and return use cosine displacement, which is continuous with zero endpoint velocity. Follower travel is along `follower_axis`, scaled by the canvas short edge in isotropic units. The flat follower root origin marks its contact plane and is authored at low dwell. Its finite flat shoe must extend beyond the maximum envelope contact offset `|d′(θ)|`. The fixture outline is the envelope of that translating plane: for `d(θ)=base_radius+lift(θ)`, the local contour is `p(θ)=d n(θ)−d'(θ)n_perp(θ)`, where `n` is the plane normal expressed in cam coordinates. The closed polygon is sampled once, then kept fixed while its root rotates. Landscape and portrait variants use separate root positions and layouts while retaining the same local geometry and mechanism dimensions.

## Limits

This is an idealized 2D kinematic model of a translating flat-faced follower (no roller or offset). Its continuous envelope gives theoretical plane contact; the rendered polygon approximates it with finite samples, and the Inspector checks support, face-plane travel, and penetration within pixel tolerances. It does not simulate 3D contact, forces, friction, compliance, or manufacturing geometry.

## Fixture and coverage

`examples/Scientific_Mechanism_Cam_Follower.json` contains six matched scenes in independent 16:9 and 9:16 variants. Tests cover all four phases, phase boundaries, run/hold/resume, isotropic geometry, flat-face support and follower travel, binding, invalid parameters, normalization, and Inspector results.
