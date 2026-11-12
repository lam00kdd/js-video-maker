# CP5.0 — Visual quality audit

## Summary and evidence limits

The repository already has several renderer generations, domain-aware mechanisms, a visual-quality inspector and published character support. The main architectural constraint is fragmented expressive capability: current prompt guides select among renderer-specific contracts, while broad illustration style, reusable detailed props, art direction and camera staging are not represented as one portable scene model. This is an architectural inference from the inspected code, not a claim that every existing output is visually poor.

Two baseline MP4s were located in Downloads (listed in [the architecture map](cp5.0-current-architecture-map.md)). A frame decoder was unavailable (`ffmpeg`/`ffprobe` absent), so appearance, motion smoothness, typography, clipping and aspect-specific composition have **not been visually judged**. No symptoms are attributed to those videos. Frame-level review is a required follow-up before final acceptance.

## Diagnosis matrix

| Symptom / risk to investigate | Evidence | Root cause class | Potential solution | Priority | Cost |
|---|---|---|---|---|---|
| Scene may read as disconnected symbols instead of a designed illustration | Current DSL v2 is object/action centric; prompt guide asks for connected geometry, but no broad layout or illustration descriptor | B: JSON expressiveness; A: prompt | Add reusable symbols, semantic anchors, layout constraints, art-direction tokens and component variants | High | High |
| Similar scenes can repeat the same built-in look | `illustrations.js` and `scene-renderer.js` use registered drawing routines and environment palettes | D: asset range; E: defaults | Local curated illustration packs and image nodes with provenance; art direction should select palette/material/style | High | Medium-high |
| Rendering choices differ by mode | `scene-renderer.js` dispatches classic, Canvas2D, Asset2D, Scene Graph; project normalizer carries mode-specific fields | C: renderer architecture | Normalize v3 to one intermediate scene graph and shared Canvas renderer modules | High | High |
| Fine typography may overflow or vary across machines | Current text is Canvas-rendered; general font fallback/wrapping/measurement are not a cross-mode shared contract | E: layout/typography | Bundled font allowlist, deterministic text layout, line boxes and diagnostics | High | Medium |
| Portrait can place content under subtitle/title regions | Existing code contains portrait-specific caption-safe remapping for some graph scenes; this is evidence that aspect-safe layout requires explicit logic | E: layout defaults | Per-variant safe regions and content-aware layout warnings, not blind coordinate conversion | High | Medium |
| Motion can be mechanically valid but compositionally inert | Actions and mechanisms are explicit, but a valid timeline does not encode staging, anticipation, focus or camera intent | F: animation capability; B: schema | Add bounded keyframes, easing, camera framing and scene beats; avoid unrestricted physics | Medium-high | High |
| Preview and MP4 may differ in timing or readiness | Shared renderer functions are used, but export has fixed frame clock/dimensions and preflight while preview is interactive | C/F | Same normalized renderer, frozen font/image/character readiness, deterministic frame sampling | High | Medium-high |
| Rich real-world imagery is constrained | Built-in environments and object types are finite; character artwork pipeline exists separately | D | Asset manifest and locally packaged PNG/WebP plus sanitized vector assets | High | Medium |
| Character depth can be hard to interleave with arbitrary drawing nodes | `renderObjectScene()` draws ordinary objects, then rigged/Sprite composition ordered in a character-only composition list | C | Flatten all drawables into one ordered render list while preserving character adapters | High | Medium |
| More prompt text may increase invalid/unsupported field rate | Current guides contain many narrow instructions; Visual DSL capability lists are renderer specific | A | Machine-readable capability manifest generated from validator/renderer registry | Medium | Medium |

These are code-derived risks and design hypotheses, not measured defects in the two videos. The current visual quality inspector can flag select geometry/layout issues; its own UI notes approximate object bounds and does not claim to determine artistic quality.

## Root-cause taxonomy for future sample review

When frames are available, classify each observed issue exactly once by primary cause and optionally record contributing causes:

- **A — Prompt:** the supported renderer could produce the intended composition, but directions omit subject hierarchy, visual variety, contrast, or narration-linked motion.
- **B — Schema:** the prompt cannot express the wanted feature concisely or structurally.
- **C — Renderer:** a valid representation is ignored, approximated poorly, or cannot be composed consistently.
- **D — Assets:** required visual material is missing, low resolution, inconsistent, or unlicensed.
- **E — Layout/type:** text, margins, density, aspect adaptation or subtitle safety defaults fail.
- **F — Animation:** timing, easing, path, camera, layering or temporal continuity is insufficient.

## Review protocol for the two videos

For each video, capture opening, midpoint, ending, and at least two motion-heavy frames; include a subtitle-active frame and scene transition if present. Record timestamp, scene, frame dimensions, screenshot, observation, educational consequence, likely class and confidence. Review the whole timeline at normal playback speed for motion/transition claims. Compare against 9:16 safe areas; 16:9 remains an unreviewed sample need.

## Quality targets

Automated diagnostics should report (not silently repair): normalized safe margins, subtitle collision/overlap, text bounds and minimum effective pixel size, missing assets, contrast warnings, duplicate/overlapping objects, out-of-scene animation intervals, transform finiteness, aspect-specific bounds and preview/export frame parity. For 1080-pixel-high portrait masters, target body text at least 32 px and labels at least 26 px; titles at least 48 px. Scale by output height and permit exceptions only for dense technical labels with a zoom/inset. Reserve subtitle panel space in the bottom 18% and keep critical content at least 5% from edges. WCAG contrast ratio 4.5:1 is a useful target for small text; large text can target 3:1.

Human review remains required for scientific correctness, hierarchy, visual rhythm, style cohesion, illustration craft, legibility in context and perceived polish. A machine score cannot establish artistic quality.

## Benchmark scenes

1. Bicycle pump cross-section with labeled piston, inlet/outlet valves and airflow; test technical correctness, cutaway clarity, callouts and motion.
2. Contemporary robot lab; test layered environment, prop variety, light/depth cues, portrait framing and a character host.
3. Conveyor with photoelectric sensor; test repeated symbols, signal path and synchronized indicator animation.
4. Two-character explanation; test Sprite and Rigged integration, speech turns, subtitle placement and style matching.
5. Scientific process diagram; test semantic sequence, transitions, data labels and aspect variants.

Do not mark CP5.0 accepted until the two supplied files receive frame review and representative baseline findings are entered into this matrix.
