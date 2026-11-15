# CP5.4C-2 — Anchor-aware V3 composition

## Status

Implemented in the shared Visual DSL v3 Canvas2D renderer and export asset preflight. Automated tests cover fit mapping, transforms, duplicate image instances, symbol instance paths, cropped anchors, metadata fingerprints and missing-anchor preflight. Browser, MP4 output inspection and folder batch QA remain **NOT VERIFIED**; do not mark this checkpoint accepted until those workflows are exercised.

## Contract

An anchor annotation is a normal V3 leaf node, ordered by its parent group's `z_index` and source order:

```json
{
  "id": "sensor_face_callout",
  "type": "anchor_annotation",
  "geometry": {
    "target": {
      "image_node_id": "sensor_image",
      "anchor_id": "mat_cam_bien",
      "metadata_fingerprint": "fnv1a32-1234abcd"
    },
    "kind": "callout",
    "label": "Mặt cảm biến",
    "placement": "right",
    "offset": 24,
    "leader_length": 48,
    "arrowhead": true,
    "radius": 18
  },
  "style": { "stroke": "#F4B860", "fill": "none", "stroke_width": 3 }
}
```

`kind` supports `callout`, `leader`, and `highlight`. Callout requires `label`; placement is left/right/above/below. A highlight draws a point-centered ellipse; it does not claim to outline a component boundary. `offset`, `leader_length`, and `radius` are bounded to 0–2400 scene viewBox units. Existing node opacity, visibility and z ordering apply. `target.image_node_id` identifies the image node, not the content-addressed asset. If a target is inside a symbol instance, provide `instance_path` as the ordered enclosing symbol instance node IDs. Repeated symbol IDs without a path are not resolved by traversal order.

## Geometry and time

Spatial metadata uses CP5.4C-1 normalized full-source-image coordinates, including transparent margins. The resolver converts normalized coordinates to source pixels, applies the renderer's existing `contain`, `cover`, or `fill` image-fit mapping, then composes image, parent-group, symbol-instance and scene transforms. Timeline evaluation happens before this per-frame geometry pass. Camera pan/zoom is applied once by the shared renderer after anchor resolution, so Preview and MP4 frames use the same path. Anchors outside a `cover` crop are hidden and block export preflight instead of pointing to a default location.

This build does not add an explicit source crop mode; V3 currently supports fit only. Annotation labels are drawn in scene/world coordinates so camera zoom affects their size as well as their target. Annotations are hidden when the image node is hidden or the anchor point is outside the camera viewport. Collision avoidance, screen-space labels, automatic camera framing and subtitle changes are out of scope. Anchor annotations should be placed in scene tree order; annotations embedded inside reusable symbols are not a supported authoring pattern yet.

## Preflight and metadata identity

The runtime loads asset metadata once alongside decoded export resources and passes a prepared spatial metadata map into frame rendering. It performs no registry lookup, decode, or metadata hash on each frame. Export preflight rejects missing images, absent or ambiguous image instances, unknown anchors, cropped anchors, and an explicitly mismatched metadata fingerprint with scene, annotation, image and anchor context.

`metadata_fingerprint` is an optional deterministic `fnv1a32-xxxxxxxx` digest of the validated canonical spatial metadata JSON. It excludes image bytes and mutable asset title. Use it to pin scripts to an anchor revision. It is a change detector, not a cryptographic integrity guarantee. Existing scripts without anchor annotations and assets without spatial metadata remain valid.

Companion packages carry full semantic metadata. When importing a package, a matching asset ID with different existing local spatial metadata is blocked; the receiving user's local record is never silently overwritten. Reconcile the anchors explicitly, then import/render. Package metadata without a conflict can be used normally.

## Prompt Builder

Single and series prompt builders include only human-reviewed/human-edited anchors present in selected asset candidates. The exact anchor ID, label, description, metadata fingerprint and current `anchor_annotation` contract are listed. AI-suggested points are not presented as scientifically verified. If the catalog has no approved anchors, the prompt does not advertise anchor composition.

## Tests and QA

`tests/visual-dsl-v3-anchors.test.js` covers contain/fill mapping, nested transforms, duplicate assets, repeated symbol instances and instance paths, cover-cropped points, annotation schema, fingerprint matching and missing-anchor preflight. Existing V3 image, timeline, export-resource and CP5.4C-1 suites remain part of `npm test` and `npm run test:focused`.

Browser Preview, actual MP4 representative frame inspection, and folder batch isolation/processed-scripts behavior were not run in this environment. Performance numbers were not measured. These are outstanding acceptance checks. CP5.4C-3 can add collision avoidance, screen-space label policy, and region-based highlights after runtime workflows are verified.
