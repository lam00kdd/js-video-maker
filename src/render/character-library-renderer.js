import { CharacterLibraryStorage } from './character-library-storage.js';
import { characterRigJointIds, assertCharacterAssetsReady } from './character-assets.js';

const decodedAssets = new Map();
const versionKey = reference => `${reference.character_id}@${reference.character_version}#${reference.character_version_checksum}`;

/** Stable exact-version key shared by async preparation and pure frame rendering. */
export function characterVersionReferenceKey(reference) {
  return versionKey(reference);
}

const spriteVersionKey=reference=>`${reference.character_id}@${reference.character_version}#${reference.character_version_checksum}`;
export async function preparePublishedSpriteInstances(instances=[],{storage=new CharacterLibraryStorage(),decodeImage=null}={}){const versions=new Map(),diagnostics=[],references=[...new Map(instances.map(reference=>[spriteVersionKey(reference),reference])).values()];await Promise.all(references.map(async reference=>{const key=spriteVersionKey(reference),resolved=await storage.resolvePublishedSpriteCharacter(reference.character_id,reference.character_version);if(resolved.status!=='resolved'){const entry={key,status:resolved.status,diagnostics:resolved.diagnostics||[]};versions.set(key,entry);diagnostics.push(...entry.diagnostics.map(item=>({...item,instance_id:reference.instance_id})));return;}const versionRecord=resolved.snapshot,entryDiagnostics=[];if(versionRecord.version!==reference.character_version||versionRecord.character_id!==reference.character_id)entryDiagnostics.push({severity:'error',code:'sprite_version_mismatch',message:'Resolved Sprite snapshot does not match the pinned version.'});if(resolved.content_checksum!==reference.character_version_checksum)entryDiagnostics.push({severity:'error',code:'version_checksum_mismatch',message:'Pinned Sprite checksum does not match the published version.'});const expectedDimensions=new Map(),addExpectedDimensions=(asset_id,width,height)=>{if(asset_id&&Number.isFinite(Number(width))&&Number(width)>0&&Number.isFinite(Number(height))&&Number(height)>0&&!expectedDimensions.has(asset_id))expectedDimensions.set(asset_id,{width:Number(width),height:Number(height)});};addExpectedDimensions(versionRecord.master?.asset_id,versionRecord.master?.width,versionRecord.master?.height);for(const frame of [...versionRecord.poses,...versionRecord.clips.flatMap(clip=>clip.frames)])addExpectedDimensions(frame.asset_id,frame.width,frame.height);const images=new Map();for(const asset_id of versionRecord.asset_refs){const blob=resolved.assets.get(asset_id);if(!blob){entryDiagnostics.push({severity:'error',code:'missing_asset',asset_id,message:'Published Sprite asset is missing.'});continue;}try{let decoded;if(decodeImage)decoded=await decodeImage(blob,asset_id);else if(globalThis.createImageBitmap)decoded=await globalThis.createImageBitmap(blob);else throw new Error('No PNG decoder is available.');const width=Number(decoded.naturalWidth??decoded.width),height=Number(decoded.naturalHeight??decoded.height),expected=expectedDimensions.get(asset_id);if(expected&&(width!==expected.width||height!==expected.height)){entryDiagnostics.push({severity:'error',code:'source_dimensions_mismatch',asset_id,message:`Published Sprite asset expects ${expected.width}×${expected.height}px but decoded as ${width}×${height}px.`});continue;}images.set(asset_id,{image:decoded,width,height});}catch(error){entryDiagnostics.push({severity:'error',code:'invalid_image',asset_id,message:`Published Sprite image could not be decoded: ${error.message}`});}}const entry={key,status:entryDiagnostics.some(item=>item.severity==='error')?'not_ready':'ready',reference,snapshot:versionRecord,assets:images,diagnostics:entryDiagnostics};versions.set(key,entry);diagnostics.push(...entryDiagnostics.map(item=>({...item,instance_id:reference.instance_id})));}));return{versions,diagnostics,ready:diagnostics.every(item=>item.severity!=='error')};}

async function decodeBlob(blob, decodeImage) {
  if (decodeImage) return decodeImage(blob);
  if (typeof globalThis.createImageBitmap === 'function') return globalThis.createImageBitmap(blob);
  if (typeof globalThis.Image !== 'function' || typeof globalThis.URL?.createObjectURL !== 'function') {
    throw new Error('No PNG decoder is available in this browser.');
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    if (typeof image.decode === 'function') await image.decode();
    else await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function cachedDecode(assetId, blob, decodeImage) {
  const cacheKey = `${assetId}:${decodeImage ? 'injected' : 'browser'}`;
  if (decodedAssets.has(cacheKey)) return decodedAssets.get(cacheKey);
  const pending = decodeBlob(blob, decodeImage);
  decodedAssets.set(cacheKey, pending);
  try {
    return await pending;
  } catch (error) {
    decodedAssets.delete(cacheKey);
    throw error;
  }
}

/** Resolve and decode a set of exact, immutable library versions before a frame or export starts. */
export async function prepareCharacterLibraryInstances(instances = [], {
  storage = new CharacterLibraryStorage(),
  duration = 300,
  decodeImage = null,
} = {}) {
  const versions = new Map();
  const diagnostics = [];
  const references = [...new Map(instances.map(reference => [versionKey(reference), reference])).values()];

  await Promise.all(references.map(async reference => {
    const key = versionKey(reference);
    const resolved = await storage.resolveCharacterVersion(reference, { duration });
    if (resolved.status !== 'resolved') {
      const entry = { key, status: resolved.status, diagnostics: resolved.diagnostics || [] };
      versions.set(key, entry);
      diagnostics.push(...entry.diagnostics.map(item => ({ ...item, instance_id: reference.instance_id })));
      return;
    }

    const { version } = resolved;
    const preparedAssets = new Map();
    const entryDiagnostics = [];
    const jointIds = new Set(version.rig.joints.map(joint => joint.id));
    for (const jointId of version.manifest.rig_compatibility.required_joints) {
      if (!jointIds.has(jointId)) entryDiagnostics.push({ severity: 'error', code: 'rig_incompatible', message: `Published rig is missing required joint "${jointId}".` });
    }

    for (const part of version.manifest.parts) {
      if (part.type !== 'image' || part.visible === false) continue;
      if (!part.size_rig_units) {
        if (part.required !== false) entryDiagnostics.push({ severity: 'error', code: 'missing_runtime_size', part_id: part.id, asset_id: part.asset_id, message: `Image part "${part.id}" needs size_rig_units before it can be rendered.` });
        else entryDiagnostics.push({ severity: 'warning', code: 'missing_runtime_size', part_id: part.id, asset_id: part.asset_id, message: `Optional image part "${part.id}" has no size_rig_units and was skipped.` });
        continue;
      }
      if (!characterRigJointIds.includes(part.binding.joint_id || part.binding.from_joint_id) || (part.binding.to_joint_id && !characterRigJointIds.includes(part.binding.to_joint_id))) {
        entryDiagnostics.push({ severity: 'error', code: 'invalid_binding', part_id: part.id, asset_id: part.asset_id, message: `Image part "${part.id}" has an unsupported M1 joint binding.` });
        continue;
      }
      const blob = resolved.assets.get(part.asset_id);
      if (!blob) {
        const severity = part.required === false ? 'warning' : 'error';
        entryDiagnostics.push({ severity, code: 'missing_asset', part_id: part.id, asset_id: part.asset_id, message: `Image part "${part.id}" has no verified PNG Blob.` });
        continue;
      }
      try {
        const image = await cachedDecode(part.asset_id, blob, decodeImage);
        const width = Number(image.naturalWidth ?? image.width);
        const height = Number(image.naturalHeight ?? image.height);
        if (width !== part.source_dimensions_px.width || height !== part.source_dimensions_px.height) {
          entryDiagnostics.push({ severity: 'error', code: 'source_dimensions_mismatch', part_id: part.id, asset_id: part.asset_id, message: `Image part "${part.id}" expects ${part.source_dimensions_px.width}×${part.source_dimensions_px.height}px but decoded as ${width}×${height}px.` });
          continue;
        }
        preparedAssets.set(part.asset_id, image);
      } catch (error) {
        entryDiagnostics.push({ severity: part.required === false ? 'warning' : 'error', code: 'invalid_image', part_id: part.id, asset_id: part.asset_id, message: `Image part "${part.id}" could not be decoded: ${error.message}` });
      }
    }

    const readiness = { ready: entryDiagnostics.every(item => item.severity !== 'error'), diagnostics: entryDiagnostics };
    if (readiness.ready) assertCharacterAssetsReady(readiness);
    const prepared = { key, status: readiness.ready ? 'ready' : 'not_ready', reference, version, manifest: version.manifest, rig: version.rig, assets: preparedAssets, readiness, diagnostics: entryDiagnostics };
    versions.set(key, prepared);
    diagnostics.push(...entryDiagnostics.map(item => ({ ...item, instance_id: reference.instance_id })));
  }));

  return { versions, diagnostics, ready: diagnostics.every(item => item.severity !== 'error') };
}

export function assertCharacterLibraryAssetsReady(prepared) {
  const errors = prepared?.diagnostics?.filter(item => item.severity === 'error') || [];
  if (!prepared?.ready || errors.length) {
    throw new Error('Character Library assets are not ready: ' + errors.map(item => `${item.instance_id || ''} ${item.code}: ${item.message}`).join(' · '));
  }
  return true;
}

/** Fail an export before encoding if a pinned Sprite does not contain its selected animation. */
export function assertPublishedSpriteReferencesReady(instances = [], preparedVersions = new Map()) {
  const failures = [];
  for (const instance of instances) {
    const entry = preparedVersions.get(spriteVersionKey(instance));
    const fail = (code, message) => failures.push(`${instance.instance_id || instance.character_id} ${code}: ${message}`);
    if (!entry || entry.status !== 'ready') {
      fail('sprite_assets_not_ready', 'Pinned published version and required images are unavailable.');
      continue;
    }
    const snapshot = entry.snapshot;
    const poses = new Map((snapshot.poses || []).map(pose => [pose.pose_id, pose]));
    if (instance.animation?.mode === 'pose') {
      const pose = poses.get(instance.animation.pose_id);
      if (!pose) fail('published_pose_missing', `Pose "${instance.animation.pose_id}" is not included in the pinned version.`);
      else if (!entry.assets.has(pose.asset_id)) fail('published_pose_asset_missing', `Pose "${pose.pose_id}" image is unavailable in the pinned version.`);
    } else if (instance.animation?.mode === 'timeline') {
      const missing = (instance.animation.timeline?.segments || []).filter(segment => !poses.has(segment.pose_id)).map(segment => segment.pose_id);
      if (missing.length) fail('published_timeline_pose_missing', `Timeline poses are not included in the pinned version: ${[...new Set(missing)].join(', ')}.`);
      const missingAssets = (instance.animation.timeline?.segments || []).map(segment => poses.get(segment.pose_id)).filter(pose => pose && !entry.assets.has(pose.asset_id)).map(pose => pose.pose_id);
      if (missingAssets.length) fail('published_timeline_pose_asset_missing', `Timeline pose images are unavailable in the pinned version: ${[...new Set(missingAssets)].join(', ')}.`);
    } else if (instance.animation?.mode === 'clip') {
      const clip = (snapshot.clips || []).find(item => item.clip_id === instance.animation.clip_id);
      if (!clip) fail('published_clip_missing', `Clip "${instance.animation.clip_id}" is not included in the pinned version.`);
      else {
        const missing = (clip.frames || []).filter(frame => !entry.assets.has(frame.asset_id));
        if (clip.frames?.length !== clip.frame_count || missing.length) fail('published_clip_frames_missing', `Clip "${clip.clip_id}" has incomplete or unavailable frames (${clip.frames?.length || 0}/${clip.frame_count}).`);
      }
    } else fail('invalid_animation_mode', 'The selected Sprite animation mode is not supported.');
  }
  if (failures.length) throw new Error('Published Sprite export preflight failed: ' + failures.join(' · '));
  return true;
}

export function clearCharacterLibraryImageCache() {
  for (const value of decodedAssets.values()) Promise.resolve(value).then(image => image?.close?.()).catch(() => {});
  decodedAssets.clear();
}
