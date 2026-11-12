# CP4.7A — Script Character Direction Contract

## Optional prompt behavior

The Video Studio script prompt defaults to Character Direction off. In that mode the prompt builder does not open Character Library storage, add a capability manifest, or include `character_directions`. Existing video JSON options and Canvas2D `animation.actors` remain separate and unchanged.

When enabled, the user filters and selects a real Published Character, then explicitly selects one immutable version. The prompt builder reads only published version records, verifies their checksums/assets through `CharacterLibraryStorage`, and revalidates the selected version immediately before generating the prompt. It never reads drafts, picks a version automatically, uses a `latest` alias, or embeds image data.

## Capability adapter

`adaptPublishedCharacterCapabilities` emits a prompt-safe, read-only summary.

- Sprite capabilities come only from the verified published snapshot: its pose IDs, clip IDs, clip FPS/frame count/duration, default pose, pinned semantic version, and checksum.
- Rigged capabilities come from the verified Rigged version's existing `compatible_motion_features`, intersected with the runtime-supported `idle`, `breathe`, and `blink` motion IDs. Rig profile and motion style remain type-specific. Sprite poses/clips are never treated as Rigged actions.
- Versions with failed storage verification, invalid type/version/checksum, or unusable metadata are omitted from the selector and reported as diagnostics.

## Optional scene JSON extension

`character_directions` is optional scene-level script intent. It is not a Scene Graph instance and does not instantiate or publish a character. Initial scope is one character direction per scene; the array shape leaves room for future extension.

```json
{
  "character_directions": [
    {
      "character_id": "char_robot_1",
      "character_type": "sprite",
      "published_version": "1.0.0",
      "published_checksum": "<64 lowercase SHA-256 hex>",
      "animation": {
        "type": "clip",
        "id": "wave",
        "start_seconds": 0,
        "duration_seconds": 1,
        "loop": false,
        "hold_last_frame": true
      },
      "placement": { "x": 0.5, "y": 0.8, "scale": 1 }
    }
  ]
}
```

Valid `animation.type` values are `pose` (Sprite pose ID), `clip` (Sprite clip ID), and `motion` (Rigged motion ID). The ID must appear in the selected exact version's verified capability list. Sprite clips use their published FPS and frame timing. Optional placement uses normalized x/y from 0 to 1 and scale from 0.01 to 10. Optional duration must be positive and fit in its scene; start time must be non-negative and fit in its scene. Loop/hold flags, when present, must be booleans.

Unknown character ID/version, type mismatch, checksum mismatch, unsupported animation type/ID, invalid timing, and invalid placement are validation errors. CP4.7A's `validateScriptCharacterDirections` reports these errors; it never substitutes another character or action.

## Import compatibility and CP4.7B boundary

Legacy JSON without `character_directions` remains supported. The current Video Studio importer maps known visual/narration/duration fields and ignores unknown optional scene properties, so this extension does not corrupt an imported scene. It does **not** preserve `character_directions` in the runtime project yet and does not instantiate characters. CP4.7B should validate and retain these directions as project metadata, then resolve them into exact-pinned Scene Graph instances. Until then, generated directions are a prompt-time contract and should be resolved before relying on them in Video Studio.

## Multi-scene and duration guidance

Prompts require `title` and `scenes`, 1–100 scenes, a non-empty narration up to 1,200 characters per scene, and 1–300 seconds per scene. Scene count is selected dynamically; longer educational videos should separate the opening, coherent explanation steps, and conclusion. The exact sum of scene durations is capped at 180 seconds minus enabled outro duration. The prompt asks the model to estimate Vietnamese narration around 2.5–3.2 syllables per second and to recalculate the duration sum before returning JSON. The Asset2D measurement demo retains its existing single-scene restriction.
