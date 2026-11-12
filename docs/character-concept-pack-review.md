# Character Concept Pack — M3.1 compatibility review

**Status:** concept and feasibility review only. No concept in this document is registered as a production appearance, and no Character Library or animation engine work is included.

## Shared art direction

Use one friendly 2D vector language across all six concepts: clear silhouettes, rounded but restrained shapes, consistent dark blue-gray outlines, flat color blocks, small highlights, and simple eyes and mouths. Show each character in a full-body neutral standing rest pose with feet visible. Keep clothing, hair, PPE, tools, and facial details as replaceable artwork parts bound to semantic joints; they do not belong in the Human Pose Resolver or IK.

The accompanying [concept board](../artifacts/character-concept-pack/concepts.svg) is a static design study. It is not a production asset sheet and does not add IDs to the appearance registry.

## Compatibility summary

| Concept | Rig/profile recommendation | M1/M3.1 compatibility | Mapping or retargeting |
|---|---|---|---|
| `male_teacher` | Existing adult teacher rig | Direct. Bind hair, face, jacket, shirt, tie, trousers, shoes, and optional book/pointer parts to head, torso, pelvis, limbs, hands, and feet. | None when the canonical adult joint IDs are retained. |
| `female_teacher` | Existing adult teacher rig | Direct. Use head-local hair/face, torso-local blouse/cardigan, pelvis-local skirt or trousers, and foot-bound shoes. | None. Clothing silhouette is appearance data. |
| `student` | Student proportion profile with canonical joint IDs | Compatible after defining shorter limb/body rest offsets and a slightly larger head-to-body ratio. Keep the same joint names so current semantic clips remain reusable. | Requires a distinct proportion/rest-pose profile. No runtime retargeter is needed for current M1/M2 angle-based clips if the semantic IDs stay 1:1. If a future student skeleton changes or omits those IDs, an explicit semantic map and motion validation will be needed. |
| `engineer` | Existing adult teacher rig | Direct. Bind hardhat and glasses to head; workwear to torso/pelvis; gloves to hands; optional tablet/tool to hand. | None. PPE and tools remain visual parts. |
| `electrician` | Existing adult teacher rig | Direct. Bind helmet, eyewear, coveralls, belt, gloves, and tester to the corresponding head/body/hand joints. | None. A handheld tool follows its hand binding; no action engine change is implied. |
| `humanoid_robot` | Existing humanoid rig and `humanoid_robot` appearance | Direct reuse of the M3.1 registry appearance, rig semantics, optional LED face, and `robotic` style profile. The concept board is a style sketch, not a replacement asset. | None for current rig. Preserve the existing appearance and its bindings. |

## Proportion profiles

- **Adult:** retain the current full joint vocabulary and adult rest-pose offsets. Male/female teachers, engineer, and electrician differ through appearance parts only.
- **Student:** use the same semantic joint IDs in a separately authored student rest-pose profile. A starting art target is approximately 0.78–0.84 of adult total height, a modestly larger head-to-body ratio, shorter upper/lower limbs, and narrower shoulders. Treat these as concept targets, not approved rig measurements. Keep uniform character scale for framing; express the age silhouette through the student profile's joint offsets and part bindings.
- **Robot:** reuse the current humanoid rig as-is. Mechanical panels, joint caps, LED face, and grippers are appearance parts, not alternate motion semantics.

## Attachment and painter-order proposal

Use semantic IDs rather than array positions:

| Part group | Joint binding | Suggested layer |
|---|---|---:|
| Rear hair, back straps, backpack | `head`, `torso` | 5–9 |
| Shoes and legs | `left/right_foot`, `left/right_shin`, `left/right_thigh` | 10–19 |
| Pelvis garment and belt | `pelvis` | 20–24 |
| Upper sleeves and torso clothing | `left/right_upper_arm`, `torso` | 25–34 |
| Forearms, gloves, handheld tools | `left/right_forearm`, `left/right_hand` | 35–39 |
| Neck and head base | `neck`, `head` | 40–44 |
| Eyes, brows, mouth, glasses | `head` | 45–54 |
| Front hair, helmet brim, headwear trim | `head` | 55–60 |

Keep face marks in head-local coordinates so head motion carries them together. Hardhats should be head-bound artwork with back/front pieces on separate layers where the silhouette needs to wrap around the head. Tools should bind to the relevant hand and use a local pivot; do not encode their shape or color in the resolver.

## Feasibility and risks

Five concepts can use the existing skeleton semantics; four human adult roles can use the same adult rig directly, and the robot can reuse its current M3.1 appearance. The student is the only concept that benefits from a distinct proportion profile. Because M1 stores rest offsets per rig and M2 clips address semantic joints, that profile can be a separate rig definition with matching IDs rather than a new solver. Before production registration, verify student joint limits and idle/breathe amplitudes against the shorter limbs, then inspect rest-pose attachment and layering in both aspect ratios.

Current M1 artwork schema supports `capsule`, `ellipse`, and `rounded_rect`, plus semantic bone and joint-marker parts in the appearance registry. Some proposed details (glasses, small pockets, belt, straps, expressive helmet trim) can be assembled from those shapes. If a final concept requires curved custom paths or layered occlusion that cannot be expressed with the supported appearance data, record that as a renderer/artwork capability gap for a later scope decision; do not extend the animation engine for it.

## Decision checkpoint

Recommended next approval boundary: accept or revise the adult/student proportions and the six concept silhouettes. Only after that review should any subset be selected for production artwork and registry work. M3.2 remains unopened by this concept study.
