# CP3.3C-FIX — Anatomical Anchor Alignment

## Findings

The source art in `LAM AI LAB/Ky su LAM/` contains a master concept and 15 part-named PNGs. The upper arms, forearms, thighs, shins, hands and feet have predominantly vertical visible alpha axes. The existing CP2 bone renderer places a source-X attachment on the proximal joint, maps increasing source X to the target bone direction, and uses the source-Y extent for uniform joint-bound scale. Feeding automatically generated horizontal anchors for portrait artwork made the limb image axis run across the body, producing the detached horizontal fragments in the supplied screenshot.

The issue is separated by geometry category:

- **Part to joint:** canonical limb IDs map to the existing M1 proximal/distal joint pairs. The vocabulary is unchanged.
- **Source axis and binding:** vertical limb candidates are fitted as single-joint CP2 parts at the proximal joint. This uses the supported joint-bound transform and avoids rotating incompatible vertical anchors through CP2's horizontal bone binding.
- **Pivot and attachment:** proximal pivot is the source anchor; stale translation offsets are cleared so the proximal point lands on the joint. Calibrated anchors live in draft editor metadata `assembly_anchors_px`; the saved appearance keeps standard CP2 binding, pivot and transform fields.
- **Rotation and scale:** rotation aligns the source anchor vector with the target M1 joint vector. One uniform scale fits their lengths. No image bytes or dimensions are changed.
- **Offset and layer:** no engineer-specific position offsets are applied. Existing hierarchy layer suggestions are kept from the existing candidate behavior.
- **Ambiguous/diagonal art:** PCA labels the main alpha axis, but only clearly vertical or horizontal geometry generates source anchor candidates. Diagonal or ambiguous art requires user calibration; no mirroring is inferred.

Head, torso, pelvis and hand/foot single-joint candidates continue using canonical M1 joints. Hand/foot vertical artwork receives an upper-edge pivot candidate for wrist/ankle attachment; inspect these seams manually.

## Calibration and preview

Assembly preview remains an in-memory candidate until **Apply Assembly**. Bind mode exposes proximal/distal source markers, dragging either marker refits that candidate through the CP2 transform, and **Refit Selected Part** / **Refit All** are available. Skeleton diagnostics show the target segment, transformed anchors, canvas residual, and rest-pose rig-unit residual. Auto-derived or manually calibrated parts remain review-required until visually checked.

Do not modify the CP2 renderer to fit portrait artwork. When the source art or anchor semantics cannot be represented by the current CP2 contract, the editor reports a review/error state instead of claiming a valid bone fit. No source PNG/Blob is written.

## Verification

`tests/character-auto-assembly.test.js` covers alpha geometry and orientation categories, canonical mapping, left/right limb fitting, uniform scale, proximal alignment despite a stale offset, CP2 transform residual, hierarchical child motion, ambiguous/diagonal anchor refusal, horizontal attachment enforcement, deterministic non-mutating candidates, and draft save/reload of calibrated anchors with unchanged asset checksum.

Browser verification is **BLOCKED** in the current environment. Prior Chromium/Edge headless launches failed before app load with Windows Access Denied on Mojo/crashpad, and no browser-control tool is available. No after-fix or after-refresh screenshot is claimed. The user-supplied screenshot is only the before-state reference. A manual QA run should open the Kỹ sư LAM draft, compare preview and post-refresh, and inspect rest, idle, breathe, blink and seam motion; hand, foot and any ambiguous torso/head anchors may need manual calibration.
