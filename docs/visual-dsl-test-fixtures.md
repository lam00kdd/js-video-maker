# Visual DSL regression fixtures

`Visual_DSL_v25_Slider_Crank.json` and `Visual_Quality_Inspector_Intentionally_Bad.json` were not present in the workspace, adjacent snapshot, or the accessible file tree. No Git metadata was available, and the available 7z archives could not be listed with the installed `tar` build. These are controlled re-creations for the current schema, not recovered originals.

## Slider-crank fixture

`examples/Visual_DSL_v25_Slider_Crank.json` contains one 8-second scene per ratio. The `engine-drive` slider-crank uses isotropic local geometry, a 0.105 crank radius, a 0.29 connecting rod, and a normalized upward cylinder axis. Its timeline runs for 3 seconds, holds for 1 second, then runs for 4 seconds. The crank group, connecting rod, and piston bindings are all explicit. Portrait and landscape keep the same mechanism dimensions and use separate cylinder artwork/layout dimensions.

## Inspector fixture

`examples/Visual_Quality_Inspector_Intentionally_Bad.json` contains a single 8-second scene for each ratio and keeps distinct IDs for each deliberate defect:

- `label-a` and `label-b`: overlapping labels.
- `caption-overlap`: text placed over the active subtitle panel.
- `offscreen-object`: static object outside the frame.
- `traveler`: animated label that moves outside the frame.
- `safe-traveler`: animated label that remains in-frame but leaves the safe area.
- `tiny-text`: text below the Inspector's readable-size threshold.
- `tiny-object`: object below the Inspector's minimum-size threshold.
- `logo-target`: object overlapping the top-right logo reservation when a logo is enabled.

The assertions identify each issue by code, object ID, and aspect ratio. A canvas-metrics check separately confirms subtitle overlap against the rendered caption-panel bounds and excludes the scene-end sample when no cue is active.
