import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { validateArtworkPng, resolveArtworkImportParts, matchArtworkFileToPart, validateRigArtworkSidecar, snapshotArtworkBlob } from '../src/render/character-artwork-import.js';
import { CharacterLibraryStorage } from '../src/render/character-library-storage.js';
import { CharacterStudioManager } from '../src/character-studio.js';
import { FakeIndexedDB } from './support/fake-indexed-db.js';

const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
const file = (bytes = pngBytes, type = 'image/png', name = 'head.png') => Object.assign(new Blob([bytes], { type }), { name });

test('artwork import snapshots selected File bytes into a stable Blob for deferred draft save', async () => {
  let reads=0;const source={name:'female teacher.png',type:'image/png',size:pngBytes.length,async arrayBuffer(){reads++;if(reads>1)throw new DOMException('file handle expired','NotReadableError');return Uint8Array.from(pngBytes).buffer;}};
  const staged=await snapshotArtworkBlob(source);assert.equal(staged.type,'image/png');assert.equal(reads,1);assert.deepEqual(Buffer.from(await staged.arrayBuffer()),pngBytes);assert.deepEqual(Buffer.from(await staged.arrayBuffer()),pngBytes);assert.equal(reads,1);
  await assert.rejects(()=>snapshotArtworkBlob({...source,arrayBuffer:async()=>{throw new DOMException('permission lost','NotReadableError');}}),/Could not read female teacher\.png while importing: permission lost/);
});
let sequence = 0;

test('artwork PNG validation checks signature, MIME, decoded dimensions and actual alpha result', async () => {
  const valid = await validateArtworkPng(file(), { crypto: webcrypto, decode: async () => ({ width: 1, height: 1 }), inspectAlpha: async () => true });
  assert.equal(valid.validation_state, 'validated_png'); assert.equal(valid.has_transparency, true); assert.equal(valid.width, 1); assert.match(valid.sha256, /^[a-f0-9]{64}$/);
  const opaque = await validateArtworkPng(file(), { crypto: webcrypto, decode: async () => ({ width: 1, height: 1 }), inspectAlpha: async () => false });
  assert.equal(opaque.validation_state, 'imported_candidate'); assert.equal(opaque.has_transparency, false);
  await assert.rejects(() => validateArtworkPng(file(pngBytes, 'image/jpeg')), /MIME/);
  await assert.rejects(() => validateArtworkPng(file(Buffer.from('invalid'))), /signature/);
  await assert.rejects(() => validateArtworkPng(file(), { crypto: webcrypto, decode: async () => ({ width: 2, height: 1 }), inspectAlpha: async () => true }), /dimensions/);
});

test('part vocabulary uses the draft manifest, validates active M1 joints and filename mapping is explicit', () => {
  const fallback = resolveArtworkImportParts();
  assert.equal(fallback.length, 15);
  assert.equal(matchArtworkFileToPart('character_engineer_head_v1.png', fallback, 'engineer'), 'head');
  assert.throws(() => matchArtworkFileToPart('some-image.png', fallback, 'engineer'), /Cannot map/);
  const custom = resolveArtworkImportParts({ manifest: { parts: [{ id: 'helmet', type: 'image', role: 'helmet', binding: { joint_id: 'head' }, required: false }] }, rig: { joints: [{ id: 'head' }] } });
  assert.deepEqual(custom.map(part => part.part_id), ['helmet']);
  const savedVocabulary=resolveArtworkImportParts({manifest:{parts:[{part_id:'head',role:'head',joint_ids:['head'],required:true},{part_id:'left_upper_arm',role:'upper_arm',joint_ids:['left_upper_arm','left_forearm'],required:true}]}});
  assert.equal(savedVocabulary[0].joint_id,'head');assert.deepEqual(savedVocabulary[1].joint_ids,['left_upper_arm','left_forearm']);
  assert.throws(() => resolveArtworkImportParts({ manifest: { parts: [{ id: 'bad_part', binding: { joint_id: 'not_m1' } }] } }), /outside the active M1 rig/);
});

test('rig artwork sidecar validates semantic mapping against draft and selected PNGs while rejecting fabricated geometry',()=>{
 const parts=resolveArtworkImportParts(),files=[file(pngBytes,'image/png','character_engineer_left_thigh_v1.png')],base={schema_version:1,kind:'character_rig_artwork_sidecar',character_id:'char_lam_engineer',rig_profile:'adult',master_reference:'approved master',look_configuration:{starter_template:'engineer',skin_tone:'warm_medium',hair_style:'short_neat',face_style:'friendly_glasses',outfit:'lam_engineer_uniform'},parts:[{part_id:'left_thigh',file_name:files[0].name,role:'upper_leg',joint_ids:['left_thigh'],orientation:'unspecified',attachment_semantics:{proximal_joint:'left_thigh'},seam_notes:'hide top under pelvis'}]};
 const valid=validateRigArtworkSidecar(base,{characterId:'char_lam_engineer',rigProfile:'adult',parts,files});
 assert.equal(valid.parts[0].part_id,'left_thigh');assert.equal(valid.parts[0].provenance,'chatgpt_semantic_sidecar_unverified');assert.equal(valid.look_configuration.outfit,'lam_engineer_uniform');
 assert.throws(()=>validateRigArtworkSidecar({...base,character_id:'char_other'},{characterId:'char_lam_engineer',rigProfile:'adult',parts,files}),/character_id/);
 assert.throws(()=>validateRigArtworkSidecar({...base,parts:[{...base.parts[0],joint_ids:['pelvis']}]},{characterId:'char_lam_engineer',rigProfile:'adult',parts,files}),/joint_ids/);
 assert.throws(()=>validateRigArtworkSidecar({...base,parts:[{...base.parts[0],proximal_anchor:{x:12,y:20}}]},{characterId:'char_lam_engineer',rigProfile:'adult',parts,files}),/proximal_anchor/);
 assert.throws(()=>validateRigArtworkSidecar(base,{characterId:'char_lam_engineer',rigProfile:'student',parts,files}),/rig_profile/);
});

test('bundle workflow validates one sidecar and forwards only mapped PNGs as a semantic import candidate',async()=>{
 const manager=new CharacterStudioManager({querySelector:()=>null}),parts=resolveArtworkImportParts();manager.current={character_id:'char_bundle'};manager.currentDraft={role:'engineer',rig_profile:'adult'};manager.getArtworkParts=()=>parts;let forwarded=null;
 manager.importArtworkFiles=async(entries,sidecar)=>{forwarded={entries,sidecar};};
 const png=file(pngBytes,'image/png','character_engineer_head_v1.png'),json=Object.assign(new Blob([JSON.stringify({schema_version:1,kind:'character_rig_artwork_sidecar',character_id:'char_bundle',rig_profile:'adult',master_reference:'master.png',look_configuration:{starter_template:'engineer',skin_tone:'warm_medium',hair_style:'short_neat',face_style:'friendly_glasses',outfit:'lam_engineer_uniform'},parts:[{part_id:'head',file_name:png.name,role:'head',joint_ids:['head'],orientation:'unspecified',attachment_semantics:{proximal_joint:'head'},seam_notes:'neck overlap'}]})],{type:'application/json'}),{name:'character_engineer_rig-sidecar.json'});
 await manager.importArtworkBundleFiles([png,json]);assert.equal(forwarded.entries.length,1);assert.equal(forwarded.entries[0].part_id,'head');assert.equal(forwarded.sidecar.parts[0].part_id,'head');assert.equal(forwarded.sidecar.look_configuration.outfit,'lam_engineer_uniform');assert.match(manager.error,/Imported 1 PNG part/);
 manager.current.character_id='char_other';await manager.importArtworkBundleFiles([png,json]);assert.equal(manager.error.includes('character_id does not match'),true);
});

test('draft artwork save atomically persists referenced PNGs, partial mappings and safe replacement cleanup', async () => {
  const indexedDB = new FakeIndexedDB(), dbName = `artwork-draft-${++sequence}`;
  const storage = new CharacterLibraryStorage({ indexedDB, dbName, crypto: webcrypto, decodePng: async () => ({ width: 1, height: 1 }) });
  await storage.createCharacter({ character_id: 'char_lam_engineer', display_name: 'Kỹ sư LAM' });
  const blob = file(), sha256 = [...new Uint8Array(await webcrypto.subtle.digest('SHA-256', pngBytes))].map(byte => byte.toString(16).padStart(2, '0')).join(''), asset_id = `libsha256_${sha256}`;
  const partial = { display_name: 'Kỹ sư LAM', role: 'engineer', rig_profile: 'adult', motion_style: 'natural', artwork_parts: [{ part_id: 'head', asset_id, sha256, file_name: blob.name, width: 1, height: 1, size: blob.size, has_transparency: true, validation_state: 'validated_png',generation_sidecar:{schema_version:1,provenance:'chatgpt_semantic_sidecar_unverified',part:{part_id:'head',joint_ids:['head'],seam_notes:'neck overlap'}} }], asset_refs: [asset_id] };
  await storage.saveCharacterDraft('char_lam_engineer', partial, { assets: [{ asset_id, blob }] });
  await storage.close();
  const reloaded = new CharacterLibraryStorage({ indexedDB, dbName, crypto: webcrypto, decodePng: async () => ({ width: 1, height: 1 }) });
  assert.equal((await reloaded.getCharacterDraft('char_lam_engineer')).artwork_parts[0].part_id, 'head');
  assert.equal((await reloaded.getCharacterDraft('char_lam_engineer')).artwork_parts[0].generation_sidecar.part.seam_notes,'neck overlap');
  assert.equal((await reloaded.getAsset(asset_id)).sha256, sha256);
  await assert.rejects(() => reloaded.saveCharacterDraft('char_lam_engineer', { ...partial, artwork_parts: [{ ...partial.artwork_parts[0], asset_id: 'libsha256_' + '0'.repeat(64) }], asset_refs: ['libsha256_' + '0'.repeat(64)] }), error => error.code === 'missing_asset');
  assert.equal((await reloaded.getCharacterDraft('char_lam_engineer')).asset_refs[0], asset_id);
  const state = indexedDB.inspect(dbName);
  assert.equal(state.stores.get('assetRefs').size, 1);
});

test('failed artwork draft transaction rolls back both draft mapping and newly staged Blob', async () => {
  const indexedDB = new FakeIndexedDB(), dbName = `artwork-rollback-${++sequence}`;
  const storage = new CharacterLibraryStorage({ indexedDB, dbName, crypto: webcrypto, decodePng: async () => ({ width: 1, height: 1 }) });
  await storage.createCharacter({ character_id: 'char_rollback', display_name: 'Rollback' });
  const blob = file(), hash = [...new Uint8Array(await webcrypto.subtle.digest('SHA-256', pngBytes))].map(byte => byte.toString(16).padStart(2, '0')).join(''), asset_id = `libsha256_${hash}`;
  indexedDB.failNextWrite = { store: 'drafts', operation: 'put', error: new DOMException('Injected failure', 'AbortError') };
  await assert.rejects(() => storage.saveCharacterDraft('char_rollback', { display_name: 'Rollback', artwork_parts: [{ part_id: 'head', asset_id }], asset_refs: [asset_id] }, { assets: [{ asset_id, blob }] }));
  const state = indexedDB.inspect(dbName);
  assert.equal(state.stores.get('assets').size, 0);
  assert.equal(state.stores.get('assetRefs').size, 0);
  assert.equal((await storage.getCharacterDraft('char_rollback')).artwork_parts, undefined);
});

test('draft reference cleanup preserves a Blob shared by another draft and deletes it after the last reference', async () => {
  const indexedDB = new FakeIndexedDB(), dbName = `artwork-shared-${++sequence}`;
  const storage = new CharacterLibraryStorage({ indexedDB, dbName, crypto: webcrypto, decodePng: async () => ({ width: 1, height: 1 }) });
  const blob = file(), hash = [...new Uint8Array(await webcrypto.subtle.digest('SHA-256', pngBytes))].map(byte => byte.toString(16).padStart(2, '0')).join(''), asset_id = `libsha256_${hash}`;
  for (const character_id of ['char_shared_a', 'char_shared_b']) await storage.createCharacter({ character_id, display_name: character_id });
  const mapping = { part_id: 'head', asset_id, sha256: hash, file_name: blob.name, width: 1, height: 1, size: blob.size, has_transparency: true, validation_state: 'validated_png' };
  await storage.saveCharacterDraft('char_shared_a', { artwork_parts: [mapping], asset_refs: [asset_id] }, { assets: [{ asset_id, blob }] });
  await storage.saveCharacterDraft('char_shared_b', { artwork_parts: [mapping], asset_refs: [asset_id] });
  await storage.saveCharacterDraft('char_shared_a', { artwork_parts: [], asset_refs: [] });
  assert.ok(await storage.getAsset(asset_id));
  await storage.saveCharacterDraft('char_shared_b', { artwork_parts: [], asset_refs: [] });
  assert.equal(await storage.getAsset(asset_id), null);
});

test('artwork edits participate in dirty state, discard and character-scoped isolation', () => {
  const manager = new CharacterStudioManager({ querySelector: () => null });
  manager.current = { character_id: 'char_a' };
  manager.savedDraft = { display_name: 'A', artwork_parts: [] };
  manager.currentDraft = structuredClone(manager.savedDraft);
  manager.currentDraft.artwork_parts.push({ part_id: 'head', asset_id: 'hash-a' });
  manager.pendingArtworkAssets.set('char_a', new Map([['hash-a', file()]]));
  assert.equal(manager.isDirty(), true);
  manager.discardChanges();
  assert.deepEqual(manager.currentDraft.artwork_parts, []);
  assert.equal(manager.pendingArtworkAssets.get('char_a').size, 0);
  manager.current = { character_id: 'char_b' }; manager.currentDraft = { display_name: 'B', artwork_parts: [] }; manager.savedDraft = structuredClone(manager.currentDraft);
  assert.equal(manager.pendingArtworkAssets.get('char_b'), undefined);
});

console.log('CP3.3A artwork import and transactional partial-draft tests passed.');
