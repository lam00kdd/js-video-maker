# Visual DSL v2.5 Stable Baseline

Created: 2026-11-08

## Accepted features

This baseline preserves Visual DSL v1/v2, the 2D scene graph, `slider_crank`, `gear_pair`, isotropic parametric geometry, the Scientific Visual Planner, Quality Inspector, AI JSON repair, landscape/portrait imports, voice, subtitles, and MP4 export.

## Supported mechanisms

- `slider_crank`: crank, connecting rod, and piston with absolute-time evaluation and run/hold timelines.
- `gear_pair`: meshing driver and driven gears with pitch geometry, reverse speed ratio, phase, and absolute-time evaluation.

## Geometry and fixtures

Scene graph positions use normalized coordinates. Parametric geometry can use `local_geometry_space: "isotropic"`, where local units map equally to pixels using the shorter canvas dimension. Gear pairs require isotropic geometry; legacy slider-crank files default to normalized geometry.

Canonical fixtures include `Visual_DSL_v25_Slider_Crank.json`, `Scientific_Mechanism_Gear_Pair.json`, `Scientific_Visual_Planner_Four_Stroke_Slider_Crank.json`, and the v1/v2 compatibility fixtures listed in `docs/visual-dsl-test-fixtures.md`.

## Verification

- `npm test`: 14/14 passed on 2026-11-08.
- `npm run test:focused`: 3/3 passed on 2026-11-08.
- Fixture existence was checked in `examples/`.
- Baseline commit: recorded by Git tag `visual-dsl-v2.5-stable` (the tag resolves to the baseline commit).

## Recovery

Run `git checkout visual-dsl-v2.5-stable` to inspect the baseline in a detached checkout, or create a branch at that tag with `git switch -c <name> visual-dsl-v2.5-stable`. Do not reset a working branch unless its changes have been preserved.

## Known limits

The test suites exercise import, schema, resolver, geometry, timing, and Inspector behavior in Node. They do not constitute browser preview or MP4 export QA. The four-stroke model and other visual mechanisms are idealized and do not calculate physical forces or contacts.
