import { normalizeHumanRig, normalizeHumanActions, resolveHumanPose, resolveHumanRig } from './human-rig.js';
import { characterRigJointIds, normalizeCharacterAppearanceManifests } from './character-assets.js';

const finite = (value, fallback, min, max, label) => {
  const number = value == null ? fallback : Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return number;
};
const imagePartId = part => String(part.part_id || part.id || '');

/** M1 fallback is only an editor starting pose; saved character rigs always take precedence. */
export function createCanonicalM1EditorRig(rigId = 'character_rig') {
  const rows = [
    ['root', null, 0, 0, 0, 0], ['pelvis', 'root', 0, 0, 0, .12], ['torso', 'pelvis', 0, -.05, 0, .25],
    ['neck', 'torso', 0, -.19, 0, .07], ['head', 'neck', 0, -.07, 0, .14],
    ['left_upper_arm', 'torso', -.105, -.16, -.12, .17], ['left_forearm', 'left_upper_arm', -.035, .14, .18, .15], ['left_hand', 'left_forearm', -.005, .13, 0, .07],
    ['right_upper_arm', 'torso', .105, -.16, .12, .17], ['right_forearm', 'right_upper_arm', .035, .14, -.18, .15], ['right_hand', 'right_forearm', .005, .13, 0, .07],
    ['left_thigh', 'pelvis', -.045, .04, 0, .19], ['left_shin', 'left_thigh', 0, .18, 0, .18], ['left_foot', 'left_shin', -.02, .13, 0, .07],
    ['right_thigh', 'pelvis', .045, .04, 0, .19], ['right_shin', 'right_thigh', 0, .18, 0, .18], ['right_foot', 'right_shin', .02, .13, 0, .07]
  ];
  const joints = rows.map(([id, parent_id, x, y, rest, length]) => ({ id, parent_id, position: { x, y }, rotation: rest, rest_pose: { rotation: rest }, pivot: { x: 0, y: 0 }, limits: { min: -Math.PI, max: Math.PI }, length }));
  return normalizeHumanRig({ id: rigId, joints, parts: [] }, 'rig_editor.fallback_rig');
}

function defaultBinding(partId, rig) {
  const lower = partId.toLowerCase(), joints = new Set(rig.joints.map(joint => joint.id));
  const side = lower.startsWith('left_') ? 'left' : lower.startsWith('right_') ? 'right' : '';
  const segment = lower.match(/^(left|right)_(upper_arm|forearm|thigh|shin)$/);
  let binding;
  if (segment) {
    const [, limbSide, kind] = segment;
    const pairs = { upper_arm: [`${limbSide}_upper_arm`, `${limbSide}_forearm`], forearm: [`${limbSide}_forearm`, `${limbSide}_hand`], thigh: [`${limbSide}_thigh`, `${limbSide}_shin`], shin: [`${limbSide}_shin`, `${limbSide}_foot`] };
    const [from_joint_id, to_joint_id] = pairs[kind]; binding = { from_joint_id, to_joint_id };
  } else {
    const joint_id = joints.has(lower) ? lower : lower === 'head' ? 'head' : lower === 'torso' ? 'torso' : lower === 'pelvis' ? 'pelvis' : side ? `${side}_${lower.endsWith('foot') ? 'foot' : lower.endsWith('hand') ? 'hand' : 'upper_arm'}` : 'root';
    binding = { joint_id };
  }
  if (binding.joint_id && !joints.has(binding.joint_id)) return { joint_id: 'root' };
  return binding;
}

export function createInitialRigEditorParts(artworkParts = [], rig, currentManifest = null) {
  const existingParts = new Map((currentManifest?.parts || []).map(part => [String(part.id || part.part_id), part]));
  return artworkParts.map((art, index) => {
    const id = imagePartId(art), old = existingParts.get(id) || {}, width = Number(art.width || old.source_dimensions_px?.width || 1), height = Number(art.height || old.source_dimensions_px?.height || 1);
    const heightUnits = Number(old.size_rig_units?.height) || ({ head: .22, torso: .34, pelvis: .17 }[id] || (/hand|foot/.test(id) ? .1 : .13));
    const pivot = old.pivot?.space === 'image_px' ? { x: old.pivot.x, y: old.pivot.y } : { x: width / 2, y: height / 2 };
    const binding = old.binding && (old.binding.joint_id || old.binding.from_joint_id) ? structuredClone(old.binding) : defaultBinding(id, rig);
    const attachment_points_px = binding.from_joint_id
      ? structuredClone(old.binding?.attachment_points_px || { from: { x: 0, y: height / 2 }, to: { x: width, y: height / 2 } })
      : undefined;
    return {
      id, type: 'image', asset_id: art.asset_id, source_dimensions_px: { width, height }, alpha: art.has_transparency === true,
      pivot: { space: 'image_px', x: binding.from_joint_id ? attachment_points_px.from.x : pivot.x, y: binding.from_joint_id ? attachment_points_px.from.y : pivot.y },
      ...(old.size_rig_units ? { size_rig_units: structuredClone(old.size_rig_units) } : { size_rig_units: { width: heightUnits * width / height, height: heightUnits } }),
      binding: { ...binding, ...(attachment_points_px ? { attachment_points_px } : {}) },
      transform: structuredClone(old.transform || { offset: { x: 0, y: 0 }, rotation: 0, scale: 1 }), z_index: Number.isInteger(old.z_index) ? old.z_index : 10 + index,
      opacity: Number.isFinite(old.opacity) ? old.opacity : 1, visible: old.visible !== false, required: art.required !== false, feature_bindings: structuredClone(old.feature_bindings || {})
    };
  });
}

export function createDraftAppearanceManifest(characterId, rig, parts, proportionProfile = 'adult') {
  const required_joints = [...new Set(['root', 'head', ...parts.flatMap(part => [part.binding.joint_id, part.binding.from_joint_id, part.binding.to_joint_id].filter(Boolean))])];
  return normalizeCharacterAppearanceManifests([{
    appearance_id: 'draft_' + String(characterId || 'character').toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 110), version: '0.0.0', backend: 'image',
    rig_compatibility: { rig_semantics: 'm1-human-rig', proportion_profile: proportionProfile, required_joints }, parts
  }], { assets: [...new Set(parts.map(part => part.asset_id))].map(id => ({ id })) })[0];
}

export function updateRigEditorPart(parts, partId, patch) {
  return parts.map(part => {
    if (part.id !== partId) return part;
    const next = structuredClone(part);
    if (patch.binding) next.binding = { ...next.binding, ...structuredClone(patch.binding) };
    if (patch.pivot) next.pivot = { ...next.pivot, ...patch.pivot };
    if (patch.attachment_points_px) next.binding.attachment_points_px = structuredClone(patch.attachment_points_px);
    if (patch.offset) next.transform.offset = structuredClone(patch.offset);
    if (patch.transform) next.transform = { ...next.transform, ...structuredClone(patch.transform) };
    for (const key of ['z_index', 'opacity', 'visible']) if (key in patch) next[key] = patch[key];
    return next;
  });
}

export function createRigEditorDiagnostics(rig, parts, assetImages = new Map()) {
  const diagnostics = [], jointIds = new Set((rig?.joints || []).map(joint => joint.id));
  for (const joint of rig?.joints || []) if (!characterRigJointIds.includes(joint.id)) diagnostics.push({ code: 'invalid_joint', severity: 'error', message: `Joint "${joint.id}" is outside M1 semantics.` });
  for (const part of parts || []) {
    const binding = part.binding || {}, joints = [binding.joint_id, binding.from_joint_id, binding.to_joint_id].filter(Boolean);
    if (!joints.length || joints.some(id => !jointIds.has(id))) diagnostics.push({ code: 'missing_joint_binding', severity: 'error', part_id: part.id, message: 'Part has a missing or invalid semantic joint binding.' });
    const { width, height } = part.source_dimensions_px || {};
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) diagnostics.push({ code: 'invalid_asset_dimensions', severity: 'error', part_id: part.id, message: 'Source image dimensions are missing or invalid.' });
    if (!part.asset_id || !assetImages.has(part.asset_id)) diagnostics.push({ code: 'missing_asset', severity: part.required === false ? 'warning' : 'error', part_id: part.id, message: 'Verified PNG image is not available for this draft part.' });
    if (!Number.isFinite(part.pivot?.x) || !Number.isFinite(part.pivot?.y)) diagnostics.push({ code: 'invalid_pivot', severity: 'error', part_id: part.id, message: 'Pivot must use finite source image pixel coordinates.' });
    else if (part.pivot.x < 0 || part.pivot.y < 0 || part.pivot.x > width || part.pivot.y > height) diagnostics.push({ code: 'asset_outside_bounds', severity: 'error', part_id: part.id, message: 'Pivot lies outside source image pixel bounds.' });
    const anchors = binding.attachment_points_px;
    if (binding.from_joint_id && (!anchors?.from || !anchors?.to || anchors.from.x < 0 || anchors.from.y < 0 || anchors.from.x > width || anchors.from.y > height || anchors.to.x < 0 || anchors.to.y < 0 || anchors.to.x > width || anchors.to.y > height || anchors.to.x <= anchors.from.x || Math.abs(anchors.to.y - anchors.from.y) > .5)) diagnostics.push({ code: 'invalid_attachment', severity: 'error', part_id: part.id, message: 'Bone attachments must be in source bounds with a horizontal proximal-to-distal axis; rotate/crop the PNG if needed.' });
    if (!Number.isInteger(part.z_index)) diagnostics.push({ code: 'invalid_layer', severity: 'error', part_id: part.id, message: 'z_index must be an integer.' });
    if (!Number.isFinite(part.opacity) || part.opacity < 0 || part.opacity > 1 || !Number.isFinite(part.transform?.scale) || part.transform.scale <= 0 || !Number.isFinite(part.transform?.rotation)) diagnostics.push({ code: 'invalid_transform', severity: 'error', part_id: part.id, message: 'Scale, rotation or opacity is outside supported finite bounds.' });
  }
  const layers = new Map(); for (const part of parts || []) { if (layers.has(part.z_index)) diagnostics.push({ code: 'layer_occlusion_review', severity: 'warning', part_id: part.id, message: `Shares z_index ${part.z_index} with "${layers.get(part.z_index)}"; renderer preserves manifest order, so inspect overlap in preview.` }); else layers.set(part.z_index, part.id); }
  return diagnostics;
}

export function missingRequiredRigParts(vocabulary = [], parts = []) {
  const present = new Set((parts || []).map(part => part.id || part.part_id));
  return vocabulary.filter(part => part.required !== false && !present.has(part.part_id || part.id)).map(part => part.part_id || part.id);
}

export function resolveRigEditorPreview(rig, parts, time, { width, height, motion = 'rest', zoom = 1, panX = 0, panY = 0, testJointId = null, testRotation = 0 } = {}) {
  const normalizedRig = normalizeHumanRig(rig, 'rig_editor.rig');
  const rest = resolveHumanRig(normalizedRig, { x: 0, y: 0, scale: 1, rotation: 0 }, 0, { width: 1, height: 1 });
  const xValues = Object.values(rest.joints).map(joint => joint.x), yValues = Object.values(rest.joints).map(joint => joint.y);
  const xSpan = Math.max(.2, Math.max(...xValues) - Math.min(...xValues)), ySpan = Math.max(.6, Math.max(...yValues) - Math.min(...yValues));
  const unit = Math.min(width, height), fit = Math.min(.72 * width / unit / xSpan, .78 * height / unit / ySpan);
  const transform = { x: .5 + panX, y: .5 + panY, scale: fit * zoom, rotation: 0 };
  const actions = motion === 'rest' ? [] : normalizeHumanActions([{ id: 'rig_preview', motion, start_seconds: 0, duration_seconds: 8, loop_mode: motion === 'blink' ? 'repeat' : 'repeat', parameters: motion === 'blink' ? { seed: 1357, interval_min_seconds: 2, interval_max_seconds: 3, blink_duration_seconds: .16 } : { intensity: .7, cycle_seconds: motion === 'idle' ? 4 : 3 } }], 8);
  const initialPose = testJointId ? { joints: { [testJointId]: { rotation: finite(testRotation, 0, -1.5, 1.5, 'Test rotation') } } } : null;
  return resolveHumanPose(normalizedRig, actions, Math.max(0, Math.min(8, Number(time) || 0)), { width, height, transform, initialPose });
}

export function sourcePointFromCanvas(point, geometry) {
  const cosine = Math.cos(geometry.rotation), sine = Math.sin(geometry.rotation), dx = point.x - geometry.x, dy = point.y - geometry.y;
  const localX = (dx * cosine + dy * sine) / geometry.pixelScaleX, localY = (-dx * sine + dy * cosine) / geometry.pixelScaleY;
  return { x: localX - geometry.sourceOriginX, y: localY - geometry.sourceOriginY };
}

export function canvasPointFromSource(point, geometry) {
  const localX = (point.x + geometry.sourceOriginX) * geometry.pixelScaleX, localY = (point.y + geometry.sourceOriginY) * geometry.pixelScaleY, cosine = Math.cos(geometry.rotation), sine = Math.sin(geometry.rotation);
  return { x: geometry.x + localX * cosine - localY * sine, y: geometry.y + localX * sine + localY * cosine };
}

export function clampSourcePoint(point, dimensions) {
  return { x: Math.max(0, Math.min(dimensions.width, Number(point.x) || 0)), y: Math.max(0, Math.min(dimensions.height, Number(point.y) || 0)) };
}
