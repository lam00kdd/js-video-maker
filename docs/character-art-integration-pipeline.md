# Character Art Integration Pipeline (contract v0.1)

**Status:** integration contract plus CP2 PNG renderer. The Character Concept Pack remains a technical reference; it is not production artwork. This contract does not register production artwork or open M3.2.

## Artwork acceptance standard

Educational 2D cartoon artwork must be a readable, appealing full-body character in a neutral standing rest pose. The whole silhouette (including hands and feet) must remain inside its declared canvas with clear separation from the background. Head, shoulder span, torso, pelvis, arm and leg lengths should read as a balanced human figure at both 16:9 and 9:16 scene layouts. Overlapping forms should cover seams at shoulders, elbows, hips, knees, neck and wrists in the intended draw order; there must be no visible gaps, detached limbs, accidental intersections, or clipping. Facial features, clothing and accessories must remain legible at target output size. Acceptance includes a rest-pose preview plus representative bent-arm and bent-leg poses; an image model is not expected to supply a correctly placed skeleton.

Artwork is authored on a transparent canvas or as clean SVG layers, with an explicit intrinsic size/viewBox, a consistent coordinate origin, and named semantic layers. Maintain enough overlap at joints to tolerate the rig's approved motion range. A clean silhouette and attachment quality take priority over decorative detail.

## Contract and coordinate spaces

The registry appearance is separate from the M1 rig and M2/M3.1 motion. Its importer output binds named appearance parts to M1 semantic joint IDs. The runtime receives normalized part data and resolved joint transforms; it never reads source-image pixel coordinates. No Human Pose Resolver changes or old concept-board coordinates are permitted for this pipeline.

Each asset record carries:

| Field | Meaning |
|---|---|
| `id`, `role` | Stable layer id and semantic slot, such as `head`, `upper_arm`, `lower_leg`, `hair_front`, `shirt` |
| `source` | Relative asset file and source layer/group name |
| `source_dimensions_px` | Original layer/canvas dimensions, retained as import metadata |
| `pivot_px` | Artist/rigging pivot in source-canvas pixels, retained only by the importer |
| `joint_id` or `from_joint_id`/`to_joint_id` | M1 semantic attachment; bone art may span two joints |
| `attachment_points_px` | Optional pair of source-image pixels mapped exactly to bone endpoints; alpha outside the pair provides intentional overlap. Bone pivot matches the `from` point |
| `runtime_binding` | Normalized `offset`, dimensions, rotation and optional scale in rig-local units (units are fractions of the short canvas edge) |
| `z_index` | Stable draw order; lower values draw behind higher values |
| `compatibility` | Required rig semantic version/profile and any authored proportion profile |
| `features` | Optional facial/blink channel or optional accessory capability |

The required slots are `head`, `torso`, `pelvis`, left/right `upper_arm`, `lower_arm`, `hand`, `upper_leg`, `lower_leg`, and `foot`. Optional slots include `neck`, `hair_back`, `hair_front`, clothing layers (for example shirt, trousers, sleeves), eyewear, hat, helmet, shoes detail, and held accessories. Side-specific records use explicit `left`/`right` roles and semantic IDs, not array position. Facial parts attach to `head` local space. Optional assets may be omitted without changing the rig.

Source `pivot_px` is converted once during import/rigging: subtract the chosen pivot from source geometry, divide by the short canvas edge, then store normalized offsets/dimensions. The rig's semantic joint position is the attachment origin. The runtime must not reinterpret source pixel coordinates or derive anatomy from asset dimensions. If an artwork's proportions differ, select an explicitly compatible rest-pose profile or author a retarget mapping; do not stretch bones implicitly. Existing M1 semantic IDs are the compatibility baseline. A proportion profile may change authored rest offsets while preserving IDs and action semantics.

## Layering guidance

Use explicit integer `z_index` values and keep related seams overlapped. Suggested bands (adjustable per appearance): rear hair/accessories 5–9; legs and shoes 10–19; pelvis/back clothing 20–24; torso and rear sleeves 25–34; forearms, hands and held props 35–39; neck/head base 40–44; facial features and glasses 45–54; front hair/hat brim 55–60. Where limbs cross the torso, split clothing into rear/front layers rather than relying on incidental ordering. Layer names and ordering are appearance data, never resolver logic.

## Intake, rigging and QA

1. Receive full-body source art and identify canvas, layer names, transparency, and intended proportion profile.
2. For SVG, sanitize and parse the allowed subset; for layered PNG, retain the common canvas origin and alpha. Preserve source dimensions and layer identity. Cropping may be used only if its crop offset is retained and applied to the pivot conversion.
3. A rigger separately places M1 semantic joints on the artwork, chooses pivots, assigns required slots and draw order, and records the proportion profile. Artwork itself need not contain a skeleton.
4. Convert design-space pivots to normalized runtime bindings and validate IDs, bounds, dimensions, layer order, and compatibility. Produce a skeleton-over-art inspection view, then a clean appearance preview.
5. Review rest pose and representative M2/M3.1 poses at both 16:9 and 9:16. Fix artwork bindings or art overlaps where seams open; do not compensate by changing global character scale or pose resolver coordinates.
6. Approve only when full-body silhouette, joint coverage, facial readability, clipping, and expected motion range pass visual review.

## Current renderer feasibility

| Input | Current state | Feasible integration path |
|---|---|---|
| Native appearance vectors | Supported for the current appearance-part subset: bones, joint markers, curves and basic geometric parts | Can be authored as normalized registry data today; this is suitable for a contract fixture, not a substitute for finished art |
| SVG | No arbitrary external SVG layer importer in the character renderer | Feasible with a separate sanitized build/import adapter that converts supported paths/shapes into native part data. SVG filters, masks, embedded images, external references and text are outside the current subset unless rasterized/converted upstream |
| Layered PNG | CP2 supports published Character Library PNG parts with a decode cache and joint/bone-bound image renderer | Each part supplies normalized rig-local size, pivot, binding and z-index. SVG remains preprocessing-only; no arbitrary SVG importer is included |

SVG is conditionally feasible through preprocessing, with fidelity limits. Layered PNG rendering is implemented additively in CP2 for exact, published Character Library versions. Import/rigging UI, production artwork and registry expansion remain deferred. M1/M2/M3.1 resolution is unchanged; MP4 encoding/timing remains unchanged, with an additive asset readiness gate before export.

## M3.1.3 CP1 — asset schema and lifecycle

CP1 adds scene_graph.character_asset_library and scene_graph.character_appearance_manifests. The manifest fields are:

- Appearance ID, semantic version, backend (image, vector, hybrid) and M1 rig compatibility/profile.
- Part ID/type, project-managed asset_id (or vector part ID), source pixel dimensions, optional `size_rig_units` (required for CP2 library image parts), alpha and opacity.
- Joint or bone endpoint binding; image-space pivot; rig-local offset, rotation and uniform scale.
- Integer draw order, visibility, required/optional state and optional eye/mouth feature bindings.

The four spaces remain distinct: source dimensions/pivot are image pixels; normalized part transforms are rig-local fractions of the short canvas edge; character placement is scene-normalized; final drawing is canvas pixels. The schema never copies source pixel coordinates into the Human Pose Resolver. Manifest validation checks IDs, PNG MIME/data URL, source dimensions and pivot bounds, supported semantic joints, feature channels, scale, opacity and project asset references.

The CP1 project-owned asset fixture embeds assets in character_asset_library.assets[] as {id,mime_type,data_url}, referenced within that project only. This keeps those fixture references independent of machine-local file paths and lets JSON save/reload preserve the bytes. The current project-scoped contract caps one encoded asset at 10 MB and supports PNG only. This mechanism is not the reusable Character Library store; see docs/character-library-architecture.md for the independent IndexedDB/content-addressed design. External package-relative paths and archive import/export are not implemented.

prepareCharacterAssets() preloads project-owned CP1 PNGs through a shared decode cache and returns decoded objects plus explicit missing/unsupported/decode/dimension-mismatch diagnostics. Decoded image dimensions are compared with manifest source dimensions. CP1 itself remains project asset schema/lifecycle. CP2 adds a separate image-backed renderer for exact published library versions, applies part pivots and bindings, and gates video export on readiness; no fallback to latest is permitted. The renderer accepts only PNG library assets in this checkpoint.

The appearance manifest is preserved through normalizeObjectScene() and project JSON normalization. The CP2 library renderer is selected for `scene_graph.character_instances`; existing project-managed/procedural appearance paths remain intact. The CP2 preparation happens outside the per-frame pose resolver, and the export gate runs before MP4 frame encoding. M1/M2/M3.1 motion, mechanical scene resolution and MP4 encoding/timing are unchanged.

## Future Character Creator data contract

The long-term pipeline remains staged and provider-neutral:

| Stage | Input | Output |
|---|---|---|
| Reference | User-selected project asset ID and optional role/style metadata | Private reference metadata; reference is never an animation part |
| Character design | Reference ID, role, style profile, design/version request | Reviewable design-art asset IDs and design metadata |
| Asset preparation | Approved design layers and alpha artwork | Named part assets with common canvas/crop metadata and source dimensions |
| Rig binding | Prepared parts, M1 semantic rig/profile, manually corrected joints/pivots | Appearance manifest with required/optional bindings |
| Validation | Manifest, rig and decoded asset library | Errors/warnings plus preview requests; no claim of automatic visual correctness |
| Rendering | Validated manifest and absolute scene time | Resolved appearance drawing while leaving pose resolution unchanged |
| Character library | Approved, versioned design, package and compatibility record | Reusable user-selected appearance |

Future AI design, segmentation, background removal, missing-part completion and semi-automatic rigging are extension points only. No provider API, automatic segmentation, reference-image embedding, UI or library registration is introduced in CP1. Manual correction of joints, pivots, bounds, layer order, attachment points, proportions and facial bindings remains required and explicit.

### CP1 limits and CP2 additions

- Implemented: portable project-managed PNG references, manifest schema/validation, rig semantic compatibility validation, preload/decode cache and readiness diagnostics.
- CP1 did not implement image-backed drawing, image pivot application or export gating.
- CP2 adds published-library PNG rendering, immutable version/checksum resolution, decode caching and a blocking asset-readiness preflight. It does not add archive/package transfer, arbitrary SVG ingestion, Studio UI, AI art generation or full Inspector checks.
- `examples/Scientific_Human_Image_Backed_Demo.json` and its PNGs are technical renderer fixtures, not production-quality character art. See `tests/character-library-cp2-browser-qa.html` for real-browser preview and persistence QA.
- No visual-quality claim is made without inspecting that real browser preview or an exported MP4.

## Character Prompt Builder contract (CP1)

The pure function generateCharacterArtworkPrompt(config) emits a deterministic Vietnamese or English prompt and structured part/naming metadata; it makes no network request and has no UI. It accepts one of the registered roles (male_teacher, female_teacher, student, engineer, electrician, humanoid_robot), styles (educational_cartoon, minimal_cartoon, mechanical_cartoon), M1 proportion profiles (adult, student, humanoid_robot), body proportion ratios, optional clothing/accessory/face descriptions, optional reference-image guidance, and output stage (concept or rig_ready_parts).

Concept mode requests one centered, front-facing full-body design on a 4:5 portrait canvas in neutral rest pose, explicitly marked concept-only. Parts mode emits the canonical M1 part IDs and joint IDs, repeatable filenames, canvas/crop and seam guidance, and a manual rigging checklist. It does not claim that a third-party image tool can produce alpha or aligned parts. It tells users to attach reference images themselves to ChatGPT, select traits to preserve, and avoid copying a face unless requested. It explicitly states that this app version stores/preloads PNGs but does not render image-backed parts. User text is JSON-quoted, length-limited, and the output is deterministic. Current API was tested at code level only; no UI or AI service was invoked.

## Character Library record contract

**Superseded by the independent Character Library Architecture Checkpoint:** this earlier sketch uses project asset IDs because it was written before the library/project boundary was established. Reusable published character versions must use the separate library asset IDs and metadata/blob separation described in docs/character-library-architecture.md.

For a future local project/library layer, a record may use:

```json
{
  "character_id": "engineer_adult_01",
  "display_name": "Kỹ sư",
  "appearance_version": "1.0.0",
  "rig_profile": "adult",
  "motion_style": "natural",
  "manifest_id": "engineer_adult_01",
  "reference_metadata": {
    "asset_id": "reference-engineer-01",
    "design_id": "design-engineer-01",
    "style_profile": "educational_cartoon",
    "character_role": "engineer",
    "creation_method": "external_prompt_workflow",
    "compatibility_version": "m1-human-rig"
  },
  "validation_status": "needs_review"
}
```

Allowed validation states are draft, needs_review, validated, rejected. A reusable manifest reference resolves within its immutable character version; optional reference metadata uses an explicitly saved library asset ID. A reference image is never automatically treated as a body part, rendered into a scene, or included in an export. CP1 documents the contract but does not create a cloud library, UI, AI connection, or registration workflow.

## Fixture and scope

`tests/fixtures/character-art-integration.manifest.json` is a test-only post-rigging contract fixture. It exercises required slots, semantic attachments, source metadata, normalized runtime bindings, and explicit SVG/PNG capability states. Its geometry is deliberately schematic and is not production artwork or a visual quality claim. `tests/character-art-integration-contract.test.js` checks this manifest contract only; it does not claim to test an importer or render an actual SVG/PNG asset.
