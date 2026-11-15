import { assertCharacterLibraryAssetsReady, assertPublishedSpriteReferencesReady, prepareCharacterLibraryInstances, preparePublishedSpriteInstances } from './character-library-renderer.js';
import { normalizeHumanActions } from './human-rig.js';

const stableStringify = value => JSON.stringify(value, (key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(name => [name, item[name]])) : item);
const hex = bytes => [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
async function digestBlob(blob) { return hex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())); }
async function base64Blob(blob) { const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(binary); }

function sceneEntries(document, variants = null) {
  const allowed = variants ? new Set(variants) : null;
  const names = document.aspect_ratio === 'both' ? ['landscape', 'portrait'].filter(name => !allowed || allowed.has(name)) : ['root'];
  return names.flatMap(variant => (variant === 'root' ? document.scenes : document.variants?.[variant]?.scenes || []).map(scene => ({ variant, scene })));
}

export function collectVisualDslV3CharacterReferences(document, { variants = null } = {}) {
  const references = [], visit = (node, owner) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'published_character') {
      const g = node.geometry;
      const character_type = g.motion_id ? 'rigged' : 'sprite';
      const actions = character_type === 'rigged' ? normalizeHumanActions([{ id: `v3_${g.motion_id}`, motion: g.motion_id, start_seconds: g.start_seconds ?? 0, duration_seconds: Math.max(.001, owner.scene.duration_seconds - (g.start_seconds ?? 0)), loop_mode: g.loop === false ? 'none' : 'repeat' }], owner.scene.duration_seconds, `scene ${owner.scene.id} node ${node.id}`) : [];
      references.push({
        instance_id: node.id, character_id: g.character_id, character_type,
        character_version: g.character_version, character_version_checksum: g.character_version_checksum,
        transform: { x: g.x, y: g.y, scale: g.scale, opacity: 1 }, visible: node.visible !== false,
        z_index: node.z_index || 0, active_start_seconds: 0, active_duration_seconds: owner.scene.duration_seconds,
        ...(character_type === 'sprite' ? { animation: { mode: 'clip', clip_id: g.clip_id, start_seconds: g.start_seconds ?? 0, loop: g.loop ?? false, hold_last_frame: g.hold_last_frame !== false } } : { motion_style: 'natural', actions }),
        owner: { variant: owner.variant, scene_id: owner.scene.id, node_id: node.id }
      });
    }
    node.children?.forEach(child => visit(child, owner));
  };
  for (const owner of sceneEntries(document, variants)) visit(owner.scene.root, owner);
  for (const [symbolId, symbol] of Object.entries(document.symbols || {})) {
    const owner = { variant: 'symbol', scene: { id: symbolId, duration_seconds: 300 } };
    visit(symbol.root, owner);
  }
  return references;
}

/** Resolve exact published Sprite/Rigged pins and decode immutable dependencies once before Preview/export. */
export async function prepareVisualDslV3CharacterResources(document, storage, { variants = null, decodeImage = null, characterPackage = null } = {}) {
  const references = collectVisualDslV3CharacterReferences(document, { variants });
  if (!references.length) return { versions: new Map(), references, diagnostics: [], ready: true };
  const sprites = references.filter(reference => reference.character_type === 'sprite'), rigged = references.filter(reference => reference.character_type === 'rigged');
  const packageStorage = characterPackage || rigged.length ? {
    async resolvePublishedSpriteCharacter(character_id, version) {
      const key = `${character_id}@${version}`, bundled = characterPackage?.get(key), local = await storage.resolvePublishedSpriteCharacter(character_id, version);
      if (!bundled) return local;
      if (local.status === 'resolved') return local.content_checksum === bundled.record.content_checksum ? local : { status: 'revision_conflict', diagnostics: [{ severity: 'error', code: 'character_revision_conflict', message: `Local ${key} has a different immutable checksum; packaged revision is not substituted.` }] };
      if (local.content_checksum && local.content_checksum !== bundled.record.content_checksum) return { status: 'revision_conflict', diagnostics: [{ severity: 'error', code: 'character_revision_conflict', message: `Local ${key} conflicts with the package checksum.` }] };
      return { status: 'resolved', character_id, version, character_type: 'sprite', content_checksum: bundled.record.content_checksum, snapshot: bundled.record.sprite_snapshot, assets: bundled.assets, diagnostics: [] };
    },
    async resolveCharacterVersion(reference, options) {
      const key = `${reference.character_id}@${reference.character_version}`, bundled = characterPackage?.get(key), local = await storage.resolveCharacterVersion(reference, options);
      const identity = await storage.getCharacter?.(reference.character_id);
      if (identity && identity.character_type !== 'rigged') return { status: 'character_type_mismatch', diagnostics: [{ severity: 'error', code: 'character_type_mismatch', message: `Pinned identity ${reference.character_id} is ${identity.character_type}, not Rigged.` }] };
      if (local.status === 'resolved' && local.version?.character_type !== 'rigged') return { status: 'character_type_mismatch', diagnostics: [{ severity: 'error', code: 'character_type_mismatch', message: `Pinned version ${key} is not Rigged.` }] };
      if (!bundled || bundled.identity.character_type !== 'rigged') return local;
      if (local.status === 'resolved') return local.version.content_checksum === bundled.record.content_checksum ? local : { status: 'revision_conflict', diagnostics: [{ severity: 'error', code: 'character_revision_conflict', message: `Local ${key} has a different immutable checksum; packaged revision is not substituted.` }] };
      if (local.version?.content_checksum && local.version.content_checksum !== bundled.record.content_checksum) return { status: 'revision_conflict', diagnostics: [{ severity: 'error', code: 'character_revision_conflict', message: `Local ${key} conflicts with the package checksum.` }] };
      return { status: 'resolved', version: bundled.record, manifest: bundled.record.manifest, rig: bundled.record.rig, assets: bundled.assets, diagnostics: [] };
    }
  } : storage;
  const [spritePrepared, riggedPrepared] = await Promise.all([
    preparePublishedSpriteInstances(sprites, { storage: packageStorage, decodeImage }),
    prepareCharacterLibraryInstances(rigged, { storage: packageStorage, duration: Math.max(8, ...references.map(reference => reference.active_duration_seconds || 8)), decodeImage })
  ]);
  const prepared = { versions: new Map([...spritePrepared.versions, ...riggedPrepared.versions]), diagnostics: [...spritePrepared.diagnostics, ...riggedPrepared.diagnostics], ready: spritePrepared.ready && riggedPrepared.ready };
  try {
    if (!prepared.ready) {
      const details = prepared.diagnostics.map(item => {
        const owner = references.find(reference => reference.instance_id === item.instance_id)?.owner;
        return `${owner ? `${owner.variant} scene ${owner.scene_id} node ${owner.node_id}` : 'symbol'} · ${item.instance_id} · ${item.code}: ${item.message}`;
      }).join('; ');
      throw new Error(`V3_CHARACTER_PREFLIGHT_FAILED: ${details}`);
    }
    assertPublishedSpriteReferencesReady(sprites, prepared.versions); assertCharacterLibraryAssetsReady(riggedPrepared);
    return { ...prepared, references };
  } catch (error) {
    const context = references.map(reference => `${reference.owner.variant} scene ${reference.owner.scene_id} node ${reference.instance_id} character ${reference.character_id}@${reference.character_version} ${reference.animation?.clip_id ? `clip ${reference.animation.clip_id}` : `motion ${reference.actions?.[0]?.motion || ''}`}`).join('; ');
    throw new Error(`V3_CHARACTER_PREFLIGHT_FAILED: ${context}: ${error.message}`, { cause: error });
  }
}

/** Export only the immutable Character identities, revisions and PNGs referenced by this document. */
export async function createVisualDslV3CharacterBundle(document, storage, { variants = null } = {}) {
  const references = collectVisualDslV3CharacterReferences(document, { variants }), identities = new Map(), versions = new Map(), assets = new Map();
  for (const reference of references) {
    const key = `${reference.character_id}@${reference.character_version}`;
    if (versions.has(key)) continue;
    const identity = await storage.getCharacter(reference.character_id), record = await storage.getCharacterVersion(reference.character_id, reference.character_version);
    if (!identity || identity.character_type !== reference.character_type) throw new Error(`V3_CHARACTER_PACKAGE_FAILED: ${reference.owner.scene_id}/${reference.instance_id} ${reference.character_id} is not a published ${reference.character_type} identity.`);
    if (!record || record.diagnostics?.length || record.character_type !== reference.character_type || record.content_checksum !== reference.character_version_checksum) throw new Error(`V3_CHARACTER_PACKAGE_FAILED: ${reference.owner.scene_id}/${reference.instance_id} exact immutable revision/checksum is unavailable or conflicting.`);
    const plain = { ...record }; delete plain.assets; delete plain.diagnostics;
    const ids = [...new Set(plain.asset_refs || [])];
    for (const asset_id of ids) {
      if (assets.has(asset_id)) continue;
      const blob = record.assets?.get(asset_id) || (await storage.getAsset(asset_id))?.blob;
      if (!blob) throw new Error(`V3_CHARACTER_PACKAGE_FAILED: ${reference.owner.scene_id}/${reference.instance_id} missing PNG dependency ${asset_id}.`);
      const sha256 = await digestBlob(blob);
      if (`libsha256_${sha256}` !== asset_id) throw new Error(`V3_CHARACTER_PACKAGE_FAILED: immutable asset hash mismatch for ${asset_id}.`);
      assets.set(asset_id, { asset_id, sha256, mime_type: 'image/png', size: blob.size, data_base64: await base64Blob(blob) });
    }
    identities.set(identity.character_id, structuredClone(identity)); versions.set(key, { identity: structuredClone(identity), version: plain });
  }
  return { schema_version: 1, bundle_type: 'lam-published-character-dependencies', characters: [...identities.values()], versions: [...versions.values()], assets: [...assets.values()] };
}

async function verifyCharacterBundle(bundle) {
  if (!bundle || bundle.schema_version !== 1 || !['lam-published-sprite-dependencies','lam-published-character-dependencies'].includes(bundle.bundle_type) || !Array.isArray(bundle.characters) || !Array.isArray(bundle.versions) || !Array.isArray(bundle.assets) || bundle.characters.length > 100 || bundle.versions.length > 500 || bundle.assets.length > 10000) throw new Error('Character companion bundle schema or size is invalid.');
  const identities = new Map();
  for (const identity of bundle.characters) {
    if (!['sprite','rigged'].includes(identity?.character_type) || !/^char_[a-z0-9]+(?:_[a-z0-9]+)*$/.test(String(identity.character_id || '')) || !String(identity.display_name || '').trim()) throw new Error('Character companion bundle contains an invalid identity.');
    if (identities.has(identity.character_id)) throw new Error(`Duplicate packaged Character identity ${identity.character_id}.`);
    identities.set(identity.character_id, identity);
  }
  const assetBlobs = new Map();
  for (const item of bundle.assets) {
    if (!/^libsha256_[a-f0-9]{64}$/.test(String(item?.asset_id || '')) || item.mime_type !== 'image/png' || typeof item.data_base64 !== 'string' || !/^[a-f0-9]{64}$/.test(String(item.sha256 || ''))) throw new Error('Character companion bundle contains invalid PNG metadata.');
    let binary; try { binary = atob(item.data_base64); } catch { throw new Error(`Invalid base64 for ${item.asset_id}.`); }
    const bytes = Uint8Array.from(binary, value => value.charCodeAt(0)), blob = new Blob([bytes], { type: 'image/png' }), sha256 = await digestBlob(blob), pngSignature = [137,80,78,71,13,10,26,10];
    if (bytes.length < 8 || pngSignature.some((value,index) => bytes[index] !== value) || sha256 !== item.sha256 || `libsha256_${sha256}` !== item.asset_id || bytes.length !== Number(item.size)) throw new Error(`Character companion PNG ${item.asset_id} failed PNG signature, size, or SHA-256 verification.`);
    if (assetBlobs.has(item.asset_id)) throw new Error(`Duplicate packaged PNG ${item.asset_id}.`);
    assetBlobs.set(item.asset_id, blob);
  }
  const versions = new Map();
  for (const entry of bundle.versions) {
    const identity = identities.get(entry?.identity?.character_id), record = entry?.version;
    if (!identity || entry.identity.character_type !== identity.character_type || !record || record.character_id !== identity.character_id || record.character_type !== identity.character_type || !/^\d+\.\d+\.\d+$/.test(String(record.version || '')) || record.validation_status !== 'validated' || !/^[a-f0-9]{64}$/.test(String(record.content_checksum || '')) || identity.character_type === 'sprite' && (record.sprite_snapshot?.schema_version !== 1 || record.sprite_snapshot.character_id !== record.character_id || record.sprite_snapshot.version !== record.version) || identity.character_type === 'rigged' && (!record.manifest || !Array.isArray(record.manifest.parts) || !record.rig || !Array.isArray(record.rig.joints))) throw new Error('Character companion published revision is invalid.');
    const key = `${record.character_id}@${record.version}`;
    if (versions.has(key)) throw new Error(`Duplicate packaged Published revision ${key}.`);
    const refs = [...new Set(record.asset_refs || [])];
    if (!refs.length || refs.some(id => !assetBlobs.has(id))) throw new Error(`Published revision ${key} is missing a referenced PNG dependency.`);
    if (identity.character_type === 'rigged') {
      const manifestChecksum = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableStringify(record.manifest))));
      if (!record.manifest_ref || manifestChecksum !== record.manifest_ref.checksum) throw new Error(`Published Rigged revision ${key} failed manifest checksum verification.`);
      const imageIds = [...new Set(record.manifest.parts.filter(part => part.type === 'image').map(part => part.asset_id))];
      if (imageIds.some(id => !refs.includes(id) || !assetBlobs.has(id))) throw new Error(`Published Rigged revision ${key} is missing a manifest artwork dependency.`);
    }
    const checksums = refs.map(asset_id => ({ asset_id, sha256: bundle.assets.find(item => item.asset_id === asset_id).sha256 })).sort((a, b) => a.asset_id.localeCompare(b.asset_id));
    const checksumPayload = identity.character_type === 'sprite' ? { sprite_snapshot: record.sprite_snapshot, assets: checksums } : { character_id: record.character_id, version: record.version, manifest: record.manifest, rig: record.rig, assets: record.manifest.parts.filter(part => part.type === 'image').map(part => ({ asset_id: part.asset_id, sha256: bundle.assets.find(item => item.asset_id === part.asset_id)?.sha256 })).sort((a, b) => a.asset_id.localeCompare(b.asset_id)) };
    const expected = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableStringify(checksumPayload))));
    if (expected !== record.content_checksum) throw new Error(`Published revision ${key} failed content checksum verification.`);
    versions.set(key, { identity, record, assets: new Map(refs.map(id => [id, assetBlobs.get(id)])) });
  }
  return versions;
}

export async function readVisualDslV3CharacterBundle(directory) {
  try {
    const handle = await directory.getFileHandle('character-library.bundle.json'), bundle = JSON.parse(await (await handle.getFile()).text());
    return await verifyCharacterBundle(bundle);
  } catch (error) {
    if (error.name === 'NotFoundError') return null;
    throw new Error(`V3_CHARACTER_PACKAGE_FAILED: ${error.message}`, { cause: error });
  }
}
