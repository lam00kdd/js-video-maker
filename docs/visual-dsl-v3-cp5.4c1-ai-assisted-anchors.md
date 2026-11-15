# CP5.4C-1 — AI-assisted visual anchors

## Goal and integration

CP5.4C-1 adds optional point locations to the existing Visual Asset semantic metadata contract. Registry identity remains content addressed: anchor changes update semantic metadata only and do not change image bytes, SHA-256, or asset ID. Legacy metadata without spatial fields remains valid. Package v1 already serializes the semantic metadata object, so it carries spatial metadata without a package version change.

## Spatial schema

```json
{
  "schema_version": 1,
  "coordinate_system": "normalized_source_image",
  "anchors": [{
    "id": "sensing_face",
    "label": "Đầu cảm biến",
    "x": 0.25,
    "y": 0.52,
    "review_status": "ai_suggested"
  }]
}
```

The optional object is `semantic_metadata.spatial_metadata`. Coordinates are finite numbers in [0,1], relative to the full intrinsic image canvas (including transparent margins), top-left origin, before contain/cover/crop/transform and independent of viewport. Supported anchor states are `ai_suggested`, `human_reviewed`, and `human_edited`. The validator limits the list to 64, IDs to lowercase snake case, labels to 120 characters and descriptions to 300 characters; it rejects duplicate IDs, invalid coordinates, unknown fields, unsafe keys and unsupported versions.

The supplied `Cam_bien_tiem_can_Anchors_V2.json` is already canonical with seven array anchors, but also carries an empty legacy `anchors: {}` placeholder. The importer treated that empty placeholder as a second, conflicting representation and rejected the file before preview. Empty legacy placeholders are now ignored when canonical spatial metadata is present; nonempty conflicting dual representations still fail explicitly. Existing-asset import wraps normalized data with the selected asset `.asset.json` envelope. The import boundary now accepts the canonical `semantic_metadata.spatial_metadata.anchors` array and the older unambiguous `anchors: {id: {label,x,y,...}}` dictionary. Dictionary entries are converted to the canonical array and marked `ai_suggested`; unknown structures, invalid states/coordinates, and conflicting dual representations produce an explicit error. For an existing-asset import, the selected registry asset supplies the image identity and sidecar envelope; AI-provided identity values are ignored. Other semantic fields are normalized but are not overwritten during default anchor merge.

AI suggestions are not verification. The creation prompt requires ChatGPT to generate the final image first and inspect those actual pixels before proposing visible-only anchors. It allows zero anchors and forbids assumptions about unseen components.

## Workflows implemented

The existing AI Asset Creator includes a default-on “Tạo kèm Visual Anchors” option. Its prompt requests the existing PNG plus semantic JSON pair, and requests optional spatial metadata. Disabling the option asks the model to omit spatial metadata. The existing paired import stages and validates the pair before writing.

Each registered asset offers “Tạo prompt bổ sung Anchor”. The browser saves the original registered image Blob bytes and a `.anchor-prompt.txt`. The default is two files; selecting three also saves the complete `.asset.json`. In two-file mode the prompt embeds the complete current semantic JSON. The MIME and original filename follow the registered image.

Updated sidecars can be imported against a selected asset. Import recomputes the content ID from the original stored bytes and updates semantic metadata only. The preview lists proposed anchors and preserves existing human-reviewed anchors in the merge path. General package export/import continues to include the metadata object.

## Editor and limitations

The manager exposes a graphical Visual Anchor Editor with checkerboard image stage, numbered markers, explicit Thêm Anchor / Chọn-Di chuyển / Di chuyển ảnh modes, click-to-add, pointer drag, pan, zoom controls, reset, marker list, ID/label/description and normalized coordinate inputs, review status, delete, save and cancel. The marker overlay ignores pointer hits except on marker buttons so image clicks reach the stage handler; adding is default when the anchor list is empty. The mapping helpers fit the full source image with contain geometry and convert normalized coordinates independently of zoom and pan; ResizeObserver redraws after viewport resize. AI JSON for an existing asset opens in the same editor before save. The merge helper reports changed fields and anchor additions/moves/omissions; omitted anchors remain, added suggestions merge by default, reviewed-anchor movement and semantic fields are retained unless explicitly approved by the merge API. Multi-file export validates and stages all files before sequential save dialogs/downloads and reports each saved, failed, or cancelled result. Browser file APIs cannot roll back files already saved, so partial status is explicit.

## Verification

- Baseline `npm test`: passed before edits.
- `npm run test:focused`: passed after edits, including new validator and prompt checks.
- `npm test`: passed after edits (full suite).
- `node --check` for catalog, creator prompt, manager and anchor helpers: passed.
- `git diff --check`: passed (Git emitted only line-ending conversion notices).
- Browser QA: image visibility and manual marker placement/drag were reported confirmed by the user in prior screenshots/messages. The seven-anchor JSON import workflow remains NOT VERIFIED in a real browser; Windows Computer Use denied control of the Edge window.
- Real ChatGPT output QA: NOT VERIFIED; no model output or sensor image was supplied.
- Performance measurements: NOT VERIFIED.

## CP5.4C-2 handoff

Add IndexedDB revision-token compare-and-swap for concurrent metadata changes, richer explicit choices for all field and anchor conflicts (including rename/delete), drag and pointer-capture browser QA, multi-file package archive support if a ZIP facility is adopted, real sensor/cooktop AI output verification, package metadata reload coverage, and performance measurements.
