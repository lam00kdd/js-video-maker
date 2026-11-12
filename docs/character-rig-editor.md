# CP3.3B — Visual Rig Binding & Pivot Editor

The Character Studio Rig Editor builds a draft appearance manifest from CP3.3A artwork part mappings and the active Human Rig. It uses the draft rig when present; otherwise the canonical M1 rig is shown as a starting pose and is stored in the draft only after an edit. Save writes the editable rig, part geometry, appearance manifest, artwork mappings and asset references through the Character Library draft transaction. No version is published.

## Coordinates and transforms

- **Source image pixels:** `source_dimensions_px`, `pivot`, and `binding.attachment_points_px` use the decoded PNG's pixel coordinate system, origin at the top left.
- **Rig-local units:** joint positions and part `transform.offset` use the normalized Human Rig coordinates. Part scale is uniform and rotation is radians in the manifest; the UI displays degrees.
- **Joint/world coordinates:** resolved by the existing absolute-time Human Pose Resolver in canvas pixels using the shorter canvas dimension as its unit basis.
- **Canvas coordinates:** CSS pointer coordinates are converted to the backing-canvas pixel dimensions, then inverted through the exact CP2 image-part transform before changing a pivot.

When “Keep artwork position” is enabled, moving a pivot also adjusts the local offset so the PNG keeps its current displayed position. For a bone-bound segment the proximal and distal source anchors move together, preserving their span and the artwork's on-screen placement.

## Manifest and binding

The editor writes an editable `draft.manifest` using the CP2 appearance schema: `appearance_id`, draft SemVer `0.0.0`, `backend: image`, M1 `rig_compatibility`, and image parts with asset ID, source dimensions, alpha flag, pivot, `size_rig_units`, joint or bone binding, attachment points, local transform, z-index, opacity, visibility, and required status. The full part vocabulary is also retained in `rig_editor_vocabulary` so partial drafts do not lose not-yet-imported part IDs when their current manifest only contains imported images.

Single-joint artwork attaches at `binding.joint_id`. Bone parts use `from_joint_id`, `to_joint_id`, and `attachment_points_px`. The current CP2 bone renderer requires proximal/distal pixels to lie on the same horizontal source-image row with proximal X less than distal X. It scales along that X axis and applies a separate width scale; the editor warns when attachment data violates this contract. Artwork that runs along a vertical source axis must be reoriented/cropped into a compatible asset before binding. The editor does not non-uniformly stretch artwork to hide a mismatch.

## Preview and QA

The preview calls the existing CP2 renderer and Human Pose Resolver for landscape 16:9 and portrait 9:16. Rest, idle, breathe, blink, deterministic seek, and a temporary selected-joint seam test are available. The seam test is preview-only and does not create a production action clip.

Skeleton and joint overlay, per-part pivot/proximal/distal markers, background toggle, visibility, zoom, pan and Fit view are editor controls. Diagnostics distinguish the computed joint transform residual from sampled alpha coverage near each source attachment. Alpha bounds and coverage are inspected from a bounded downsample, so their pixel values are approximate; a low-alpha neighborhood is a review warning, not a proof of a rendered gap. Duplicate z-index values require visual overlap review because the renderer resolves ties in manifest order.

## Draft behavior and limitations

Geometry, binding, layer, visibility, and opacity edits are draft-only and participate in Save/Discard. Partial imported parts remain editable. Published versions and Video Project data are untouched. This checkpoint does not include automated segmentation, arbitrary source-axis bone mapping, production gestures, publishing, or MP4 pipeline changes. Actual full-body visual QA still requires a browser preview; automated geometry tests do not prove that supplied artwork has production-quality seams.

## CP3.3B-FIX browser checkpoint

The editor exposes Assemble and Bind modes. Assemble hit-tests visible parts in reverse z-index order using `calculateImagePartCanvasTransform()` from CP2, then converts canvas drag deltas into rig-local offsets. Bind drag moves a joint pivot or the nearest proximal/distal attachment marker; bone anchors retain a shared source Y and proximal-to-distal X ordering. The PNG asset remains content-addressed and unchanged. Preview motion only updates editor view state and never commits to the draft.

Undo/Redo records part geometry edits, reset is per selected part, and the selected layer is indicated in the parts list and canvas pivot marker. A drag without valid CP2 canvas geometry reports that the preview is rebuilding rather than attempting invalid coordinate conversion. Save Draft remains one IndexedDB readwrite transaction over character, draft, asset and asset-reference stores, so reload sees the complete saved record or the prior record.

Automated verification completed: `node tests/character-rig-editor.test.js` (8/8) and `node tests/character-library-storage.test.js` (11/11). Browser verification and screenshot evidence are **BLOCKED** in this environment: local server starts on `http://127.0.0.1:4174/`, but headless Chrome exits before page load with Windows `Access is denied` on its Mojo channel; no browser-control plugin is available in the session. Do not mark the checkpoint PASS until browser QA succeeds.

Manual QA checklist: open the app, enter Character Studio → Rig Editor, verify Assemble/Bind controls and diagnostics after first load and refresh; import/select known transparent PNG parts; click a visible layer directly on canvas and drag it, verify Inspector offset changes while source PNG bytes/hash do not; Bind a bone, drag each endpoint and its pivot, verify joint selection and horizontal source-axis diagnostics; exercise reset and Undo/Redo; switch rest/idle/breathe/blink and joint seam preview and confirm the draft dirty marker/manifest does not change from preview alone; Save Draft, refresh, and compare part transform, binding, pivot, visibility, z-index and screenshot. Capture before edit, after edit, and after refresh screenshots before recording PASS.
