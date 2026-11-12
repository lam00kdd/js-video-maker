# Visual DSL v2.8 Natural Human Animation

## Milestone status

M1 and M2 are implemented on `codex/visual-dsl-v2.8-natural-human-rig`, based on tagged commit `visual-dsl-v2.7-mechanism-sync-stable`. M2 adds only `idle`, `breathe`, and `blink`. Talk, pointing, target resolution, runtime IK, character Inspector rules, and full facial performance remain later work.

## Scene graph extension

`scene_graph.character_rigs` contains reusable artwork-independent rig definitions. `scene_graph.characters` places instances of those rigs. Both fields are optional; graphs without them follow the existing v2 path unchanged. A character can include an optional `initial_pose:{joints:{joint_id:{rotation}}}` and `actions` array.

An M2 action has `{id,motion,start_seconds,duration_seconds,loop_mode,parameters}`. `motion` is `idle`, `breathe`, or `blink`; `loop_mode` is `repeat` or `none`. `duration_seconds` is the active window. Idle and breathe use `{intensity,cycle_seconds}`; cycle_seconds (1–20) sets the seamless oscillator period independently of the active window. Blink uses `{seed,interval_min_seconds,interval_max_seconds,blink_duration_seconds}` and places events with a seeded deterministic interval sequence. Duplicate motion channels on one character are rejected. Unknown parameters, out-of-range values, and clips extending beyond the scene are rejected.

```json
{
  "character_rigs": [{
    "id": "teacher-rig",
    "joints": [{
      "id": "root", "parent_id": null,
      "position": {"x": 0, "y": 0}, "rotation": 0,
      "rest_pose": {"rotation": 0}, "pivot": {"x": 0, "y": 0},
      "limits": {"min": -6.283185, "max": 6.283185}, "length": 0,
      "visual_part_id": null, "z_index": 0
    }],
    "parts": [{
      "id": "body", "joint_id": "root", "type": "rounded_rect",
      "offset": {"x": 0, "y": 0}, "rotation": 0,
      "width": 0.2, "height": 0.3, "fill": "#3978a8",
      "stroke": "none", "stroke_width": 0, "z_index": 0
    }]
  }],
  "characters": [{
    "id": "teacher", "rig_id": "teacher-rig",
    "appearance_id": "default",
    "transform": {"x": 0.5, "y": 0.5, "scale": 1, "rotation": 0, "opacity": 1},
    "initial_pose": null
  }]
}
```

## Rig and coordinate conventions

The required joint vocabulary is `root`, `pelvis`, `torso`, `neck`, `head`, both upper arms, forearms, hands, thighs, shins, and feet. A rig may contain additional joints. IDs are unique within each rig; joints form one tree rooted at `root`. Each joint has `parent_id`, local `position`, `rotation`, `rest_pose`, `pivot`, `limits`, `length`, optional `visual_part_id`, and `z_index`.

The scene graph uses normalized coordinates: character root `x` and `y` are fractions of canvas width and height. Joint and part geometry use isotropic character-local units: both axes map to pixels using `min(canvas width, canvas height)`. Character scale is uniform. Rotation uses radians, positive counterclockwise in Canvas2D coordinates as currently implemented. A child joint position is transformed by its parent's rotation and uniform scale. Part pivots are at the part center; `offset` is expressed in its bound joint's local space. Parts are drawn in ascending `z_index`, with input order retained for ties.

Supported artwork part types are `capsule`, `ellipse`, and `rounded_rect`. Parts bind to an existing joint; a joint's optional `visual_part_id` must identify a part bound to that joint. Artwork can therefore be replaced without changing the skeleton's joint names or hierarchy.

## Validation and failure handling

The normalizer checks duplicate IDs, missing parents, cycles, a single `root`, finite positions and rotations, valid lengths and limits, missing part bindings, unsupported part types, and optional two-bone IK chain declarations (`root_joint_id`, `mid_joint_id`, `end_joint_id`) for contiguous parent links. IK chains are validated but not solved in M2. Invalid rig definitions are retained as invalid entries with `validation_error`; their character instance is skipped by rendering so other scene graph objects can still render. Character actions with unsupported motion types or parameters are rejected so unsupported runtime behavior cannot be silently accepted.

## Absolute-time motion and composition

`resolveHumanPose(rig, actions, absoluteTime, context)` is a pure result resolver. It begins from the rest pose (or the character's initial pose), evaluates each active clip from absolute time, adds its supported joint channel rotations, clamps rotations to the joint limits, then resolves the hierarchy. It retains no previous-frame state and uses no wall clock or per-frame random values. Idle drives small periodic rotations at torso, neck, head, upper arms, and forearms. Breathe adds a second periodic contribution to torso and shoulders. These contributions add on shared joints with the resulting angle clamped by the rig limits. Neither motion scales artwork or changes bone lengths. Legs and feet receive no motion channels, so idle preserves their world positions. Blink uses a seeded interval schedule and sets the `eyes_open`, `left_eye_open`, and `right_eye_open` facial channels. Rig parts opt into `eye_left` or `eye_right` with `facial_channel`; the renderer compresses only those parts vertically during a blink.

Scene actions are normalized by `normalizeHumanActions` and resolved as part of `resolveObjectScene`. Both live canvas preview and the offline frame pipeline call `renderObjectScene`, so they use the same resolver and absolute scene time. Projects without character fields keep their existing rendering behavior.

## Runtime and limitations

`resolveObjectScene(graph, absoluteSeconds, duration, {width,height})` returns `resolvedCharacters`; each valid entry contains resolved world-pixel joint positions, part transforms, facial channels, and motion channel metadata. It derives the pose from the rest pose and absolute input on every call. It has no frame accumulator. `renderObjectScene` draws the resolved, independently layered parts after the existing scene graph objects and restores Canvas2D state around each part and character.

## M3.1.3 CP1 image asset metadata

An optional scene_graph.character_asset_library stores portable project PNG assets by stable ID, and character_appearance_manifests declares image/vector/hybrid parts, source dimensions and image-space pivots, M1 semantic bindings, rig-local offsets/transforms, alpha/opacity, layer order, visibility, required state, and optional face channels. Asset references are project-managed IDs backed by PNG data URLs rather than machine-local paths. normalizeObjectScene validates and preserves the metadata across JSON save/reload. prepareCharacterAssets preloads required images into a shared decode cache and returns readiness diagnostics; assertCharacterAssetsReady exposes an export gate for a future integration.

CP1 is metadata and asset lifecycle only. The current Human Pose Resolver and Canvas2D character renderer do not consume image-backed parts, so these manifests do not render yet and existing procedural appearances continue to be used. The readiness API is not connected to MP4 export. Image drawing, pivot application, browser preview and export gating are deferred to later checkpoints. No AI generation, segmentation, auto-rigging, or character library UI is included.

CP1 also exposes a deterministic, provider-free Character Prompt Builder in src/render/character-prompt-builder.js. It generates concept or rig-ready-parts prompts in Vietnamese or English for the registered roles/styles/profiles, emits canonical M1 part and joint IDs, and describes the current missing image renderer honestly. It does not upload references, call an AI service, or provide UI. Character Library record shape is documented in docs/character-art-integration-pipeline.md; it is not a cloud service.

The Architecture Checkpoint adds the optional scene_graph.character_instances reference contract for reusable characters. Each instance pins character_id, character_version and character_version_checksum; the scene normalizer does not substitute a latest version. These refs are preserved on save/reload, but remain metadata only until the renderer/library adapter is implemented. See docs/character-library-architecture.md for the separate project/library asset ID domains, local IndexedDB proposal, version rules and migration contract.

The fixture uses simple vector shapes as demo artwork. It demonstrates eye compression, not complete facial animation. M2 has no talk, pointing, walking, runtime IK, target interaction, or character-aware Inspector diagnostics. Character layer interleaving with mechanical objects is also not yet exposed; characters currently draw after the scene graph objects. No browser preview capture or MP4 export QA was performed for M2.

## M2 checks

Run `npm test` and `npm run test:focused`. The human-rig tests cover deterministic rest-pose resolution, idle/breathe/blink, arbitrary seek order, loop continuity, stationary feet, stable bone lengths, save/reload, portrait/landscape variants, malformed rig isolation, and invalid motion configuration. The existing suites cover legacy scene graphs and mechanism regressions. The two-ratio 30-second demo is `examples/Scientific_Human_Teacher_Natural_Idle.json`.
