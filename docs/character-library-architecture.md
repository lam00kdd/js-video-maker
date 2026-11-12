# Character Library Architecture Checkpoint

**Status:** architecture contract, IndexedDB persistence foundation, CP2 image-backed PNG renderer, and CP3.1 independent Character Studio workspace/library manager. Prompt generation, artwork import/rig editing, preview/publishing UI, portable archive implementation, cloud service, and stable tag are not included. See docs/character-library-storage.md for storage and renderer boundaries.

## 1. Audit findings

- Active branch is codex/visual-dsl-v2.8-natural-human-rig at HEAD 77d53c7894ade7668012abbb10d1c531ed5d3c30. The working tree already contains uncommitted code, docs, fixtures and supplied artwork; this checkpoint preserves it.
- Human Rig, pose resolution, M2 actions and the current appearance registry are presently stored inline in each scene graph as character_rigs and characters. They are scene/project data, not reusable library entities.
- CP1 adds character_asset_library data URLs and character_appearance_manifests inside a project graph. This remains project-scoped schema/lifecycle data, not the reusable-library source of truth.
- normalizeProject normalizes scenes and objectScene, while saveProject/loadProject serialize the complete project JSON to localStorage. There is no independent character persistence layer or IndexedDB service. PNG data URLs therefore enlarge project data and compete with browser localStorage quotas.
- The project JSON export/import path can preserve scene references, but no archive/package format, asset checksum workflow, or portable character package resolver exists.
- The current pose resolver and Canvas2D renderer consume scene-local rig/appearance data. They do not query persistence and do not render the proposed character_instances references.

## 2. Module boundaries

| Module | Owns | Must not own |
|---|---|---|
| Character Studio | Draft editing, prompt generation, art import, rig binding, validation/preview and publishing a version | Video project state or MP4 encoding |
| Character Library | Local metadata, immutable published versions, content-addressed asset blobs and reference-safe deletion | Pose calculation or drawing |
| Video Studio | Pinned character instances, per-instance transform/actions and aspect-specific layout | Copying character artwork blobs into every scene |
| Shared animation engine | Rig validation, absolute-time pose/action resolution and rendering of already resolved appearance inputs | IndexedDB, project lookup, “latest” selection |
| Project asset store | Temporary assets explicitly owned by one project | Reusable Character Library identity |

The render boundary receives a resolved version object and prepared image map. Persistence adapters resolve IDs before this call. The shared engine remains independent of whether the resolved data came from a local library or a portable package. CP2 preparation happens before per-frame rendering; the pose resolver and image renderer do not access IndexedDB.

## CP3.1 — Independent workspace and Character Library manager

- `Video Studio` and `Character Studio` are navigation states within the existing single-page shell; no router or project-state migration was introduced. Switching workspaces only hides/shows their DOM roots. It does not call project save, load, normalization, scene selection, or timeline reset.
- Character Studio is initialized on first entry and uses `CharacterLibraryStorage` directly. Draft metadata is stored in IndexedDB stores `characters` and `drafts`; role, rig profile and motion style are small metadata values on the character record for list/search/filter rendering. No PNG assets are read for list rows.
- New IDs use the immutable `char_<slug>_<unique suffix>` format. Display name changes never recalculate the ID. Roles are descriptive metadata and have no dependency in the pose resolver.
- The editor changes metadata only. Saving forwards existing rig, manifest and asset references unchanged. Published version identifiers are shown read-only; CP3.1 exposes no publish or delete action.
- Unsaved metadata changes prompt before changing character or workspace and before leaving the page. Save feedback and IndexedDB/list loading, empty and error states are local to Character Studio.
- Future CP3.2 prompt tools, CP3.3 artwork/rig tools, and CP3.4 preview/validation/publish tools have no placeholder action controls in this checkpoint.
- Known limitation: browser storage remains scoped to the current origin/profile and subject to browser eviction. CP3.1 does not add library archive export/import or thumbnails.

## CP3.2 — Artwork Prompt Builder

- The selected character now has `Overview` and `Artwork Prompt` sections inside the existing Character Studio workspace; the Character Library sidebar and read-only inspector remain in place.
- Prompt generation reuses `generateCharacterArtworkPrompt()` from `src/render/character-prompt-builder.js`. Per-character options and generated text are held in memory keyed by immutable character ID; switching characters cannot reuse another character's options or output.
- Role, rig profile, motion style and description default from the open draft. Draft metadata edits remain independent: changing prompt options or generating/copying a prompt never saves or mutates the draft. CP3.1 unsaved metadata warning and Save/Discard actions remain available in both sections.
- Appearance styles are educational cartoon, minimal cartoon, and friendly mechanical cartoon; motion styles map from natural/minimal/robotic draft metadata. Both concept and rig-ready PNG-part prompts are available in Vietnamese and English. Reference guidance asks the user to attach the image directly in ChatGPT and lists only user-selected traits.
- Prompt output is deterministic and generated locally. Copy uses the Clipboard API with a selection/`execCommand` fallback and visible failure feedback; Select All offers manual copy. No ChatGPT API or network call is made.
- Rig-ready prompts describe CP2-supported PNG parts, canonical M1 semantic joints, suggested back-to-front layers, naming and manual validation. They do not make a package import-ready: asset import, manifest mapping, pivot/rig editing and publish remain future CP3 work.
- Responsive behavior keeps the same workspace and inspector, with stacked sections and one primary page scroll on narrow viewports.

## CP3.2.1 — Staged Rig-Ready Artwork workflow

- Rig-Ready mode adds Stage A Master Character, Stage B Head & Body, Stage C Arms, Stage D Legs, and Stage E QA & Export Instructions. Concept mode remains available and corresponds to the master concept prompt.
- `resolveArtworkPromptParts()` uses required parts and semantic bindings from the open draft appearance manifest and rig when present. It validates every joint against the active M1 semantic vocabulary, rejects duplicate/invalid IDs and maps parts to stages from semantic part IDs/roles/joints. Drafts without a manifest use the existing canonical M1 prompt-part blueprint as a clearly labeled fallback; the workflow does not assume every future character has 15 parts.
- Each generated stage repeats a shared character specification including character ID, style/profile, description, hair/face, clothing/accessories, colors, profile proportions and reference guidance. Later stages instruct the user to attach the approved master artwork directly in the same ChatGPT conversation. No image is fetched or uploaded by the app.
- Stages B–D request only that stage's part candidates and explain attachment/overlap. Prompts recommend generating parts individually; a review sheet may be cropped manually or with a separate tool. They do not promise multiple independent images or ZIP creation.
- Stage E is instructions-only and covers actual PNG alpha, measured dimensions/crops, pivots/attachments, manifest layer order, file naming, missing/duplicate parts and seam checks. It distinguishes concept preview, part candidate, validated PNG asset and rig-ready imported asset. Prompt output does not mark assets validated.
- Prompt options and generated outputs remain page-memory data keyed by character ID. Metadata and project state are not changed; CP3.1 draft Save/Discard and unsaved-change guard remain active. Artwork import, automatic segmentation, AI API, rig editor and publish UI are out of scope.

## 3. ID domains and record schema

Project asset IDs and library asset IDs are different domains:

- project_asset_id: project-owned temporary/import asset. Its lifetime follows that project and it is not a reusable Character Library ID.
- library_asset_id: libsha256_ followed by 64 lowercase hex characters, derived from PNG bytes. It is content-addressed and portable; no path or machine name participates.
- character_id: immutable identity, char_ followed by a stable slug. Display names can change without changing identity.
- character_version: explicit SemVer snapshot. A scene never asks for latest.

Character metadata is stored separately from binary assets. The CP1 normalizer formalizes this record shape:

    {
      "character_id": "char_lam_teacher",
      "display_name": "Giáo viên Lam",
      "description": "...",
      "source_metadata": {
        "role": "teacher",
        "style_profile": "educational_cartoon",
        "reference_asset_id": "reference-library-id",
        "reference_saved_by_user": true
      },
      "versions": [{
        "version": "1.0.0",
        "rig_profile": "adult",
        "motion_style": "natural",
        "manifest_ref": {
          "manifest_id": "teacher-manifest",
          "version": "1.0.0",
          "checksum": "64-lowercase-hex-digest"
        },
        "content_checksum": "64-lowercase-hex-digest",
        "asset_refs": ["libsha256_64-lowercase-hex-digest"],
        "compatible_motion_features": ["idle", "breathe", "blink"],
        "validation_status": "validated",
        "validation_report_checksum": "64-lowercase-hex-digest"
      }]
    }

Asset blobs live in a separate store keyed by library_asset_id. A record never embeds a data URL, Blob, byte array, or absolute path. Reference metadata is optional; it may point to a library asset only after the user explicitly chooses to save it. It is never rendered as character artwork.

## 4. Local persistence strategy

Use IndexedDB for the independent local Character Library. The foundation now creates these object stores:

- characters: identity and display metadata.
- characterVersions: append-only published version snapshots, keyed by character_id + version.
- characterDrafts: mutable working copies, separate from published versions.
- characterAssets: Blob records keyed by content-addressed library_asset_id, with MIME, byte length and checksum metadata.
- characterUsage: optional local reference index; correctness must not depend on this index because projects can be moved or deleted outside the app.

IndexedDB stores binary Blobs and transactional updates without putting reusable PNGs into localStorage. Small UI preferences stay in localStorage and current Video Project save semantics are unchanged. Publish writes version metadata, asset rows and references atomically; incomplete work remains a draft.

The database is local-only. Private browsing/storage eviction may remove the library; the Video Project then reports a missing local character until a portable package is imported. Do not silently fabricate artwork or select another version.

## 5. Version and deletion rules

Drafts may be edited. Publishing creates a new immutable SemVer snapshot with manifest checksum, aggregate content checksum and asset IDs. A published version is never overwritten; change requires a new version. Updating display name/description changes character metadata only, not the art version.

Projects pin character_id, character_version and content_checksum. Old project playback therefore never resolves to a newer release. Library UI should block deletion of a version while known project references exist. Because project JSON can exist outside the current browser and a local usage index can be stale, the safe default is deprecate/tombstone rather than physical deletion. Garbage collection may remove an asset only when no published version, draft, reference image or retained package references its content ID.

## 6. Video reference contract

Keep current inline character_rigs/characters as the legacy scene-local schema. New reusable characters use scene_graph.character_instances, a separate name to avoid changing old records:

    {
      "instance_id": "engineer_scene_01",
      "character_id": "char_lam_engineer",
      "character_version": "1.0.0",
      "character_version_checksum": "64-lowercase-hex-digest",
      "transform": {"x": 0.5, "y": 0.6, "scale": 0.8, "rotation": 0, "opacity": 1},
      "motion_style": "natural",
      "actions": []
    }

instance_id is unique within a scene; character_id may repeat for multiple instances. Actions and transforms belong to each instance. Landscape and portrait scene graphs may give instances different IDs/layouts while pinning the same immutable version. The reference stores only IDs, version/checksum, placement and motion data, never the appearance manifest or image bytes.

The schema normalizes and preserves these references through project JSON save/reload. The storage adapter resolves exact versions and reports missing character, missing version or checksum mismatch with no latest fallback. CP2 consumes this interface, prepares decoded PNGs, draws manifest parts using semantic joint/bone bindings, and blocks video export when required assets are not ready. Legacy inline references continue their established path.

## 7. Portability and integrity

**Local reference mode:** project scene stores character_id/version/checksum and resolves against IndexedDB. Missing character/version or checksum mismatch is a blocking diagnostic for deterministic rendering/export; never fall back to a different version. CP2 enforces exact checksum and required PNG readiness before frame rendering/export.

**Portable package mode (future):** a versioned archive contains a package manifest, exact character/version snapshots, appearance manifests, and only the referenced PNG assets under content-addressed names. Import verifies each SHA-256 before commit. Same character/version/checksum is idempotent; same identity/version with different checksum is a collision error and must never overwrite. A user may explicitly import as a new character ID. Asset deduplication uses byte checksum.

The existing project JSON alone does not carry library character bytes. Exporting it is therefore a local-reference project, not a portable character package. CP2 does not implement archive read/write. When a reference cannot resolve, preview shows deterministic diagnostics and export is blocked; it does not show a different character.

## 8. Migration and backward compatibility

- Legacy projects keep scene-local character_rigs and characters unchanged; no automatic library ID is inferred from appearance names.
- Old projects without character_instances normalize exactly as before.
- CP1 project-owned data URLs remain project-owned. Migration into the reusable library is an explicit future Character Studio import that computes library content IDs; it does not silently duplicate or delete project assets.
- New character_instances survive JSON round trips and resolve through the CP2 renderer; references remain pinned and local-library dependent.
- During rollout, legacy inline and new pinned references may coexist in a scene. IDs are not rewritten and existing motion/appearance fallback behavior is preserved.

## 9. Contract checks and risks

Automated tests cover record/blob separation, unique immutable character identity, append-only version publication, content-addressed asset references, multiple projects/instances, exact version/checksum pinning, missing-reference diagnostics, no latest fallback, portrait/landscape reference preservation, and old project compatibility. CP2 adds Canvas2D image rendering, binding/pivot/z-order, blink, readiness and technical fixture tests. Browser screenshot QA is performed separately through `tests/character-library-cp2-browser-qa.html`; verify its recorded result before making a visual-quality claim. Package archives remain unimplemented.

Remaining risks are browser storage eviction/quota, stale usage indexes, project/reference portability until archive support exists, and fixture art that is deliberately simple. CP2 renderer support does not imply production artwork quality. SVG import, portability and Character Studio remain separate checkpoints.
