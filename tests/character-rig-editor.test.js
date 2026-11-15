import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { calculateImagePartCanvasTransform } from '../src/render/object-scene-renderer.js';
import { canvasPointFromSource, clampSourcePoint, createCanonicalM1EditorRig, createDraftAppearanceManifest, createInitialRigEditorParts, createRigEditorDiagnostics, missingRequiredRigParts, resolveRigEditorPreview, sourcePointFromCanvas, updateRigEditorPart } from '../src/render/character-rig-editor.js';
import { CharacterLibraryStorage } from '../src/render/character-library-storage.js';
import { CharacterStudioManager } from '../src/character-studio.js';
import { FakeIndexedDB } from './support/fake-indexed-db.js';

const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
const assetHash = async () => [...new Uint8Array(await webcrypto.subtle.digest('SHA-256', pngBytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
const mapping = (asset_id, part_id = 'head') => ({ part_id, asset_id, sha256: asset_id.slice('libsha256_'.length), file_name: `${part_id}.png`, width: 1, height: 1, size: pngBytes.length, has_transparency: true, validation_state: 'validated_png', required: true });

test('canonical M1 fallback contains all semantic joints and valid rest hierarchy', () => {
  const rig = createCanonicalM1EditorRig('rig_test');
  assert.equal(rig.joints.length, 17);
  assert.equal(rig.joints.find(joint => joint.id === 'left_forearm').parent_id, 'left_upper_arm');
  assert.equal(rig.joints.find(joint => joint.id === 'right_foot').parent_id, 'right_shin');
});

test('draft artwork creates joint and two-point bone bindings from semantic part IDs', () => {
  const rig = createCanonicalM1EditorRig('rig_test');
  const parts = createInitialRigEditorParts([
    mapping('libsha256_' + 'a'.repeat(64), 'head'), mapping('libsha256_' + 'b'.repeat(64), 'left_upper_arm'), mapping('libsha256_' + 'c'.repeat(64), 'left_forearm')
  ], rig);
  assert.deepEqual(parts[0].binding, { joint_id: 'head' });
  assert.deepEqual([parts[1].binding.from_joint_id, parts[1].binding.to_joint_id], ['left_upper_arm', 'left_forearm']);
  assert.deepEqual([parts[2].binding.from_joint_id, parts[2].binding.to_joint_id], ['left_forearm', 'left_hand']);
  assert.equal(parts[1].pivot.x, parts[1].binding.attachment_points_px.from.x);
});

test('source-pixel and canvas-point conversions round-trip through the exact CP2 image renderer transform', () => {
  const rig = createCanonicalM1EditorRig('rig_test'), asset_id = 'libsha256_' + 'a'.repeat(64);
  const art = mapping(asset_id), part = createInitialRigEditorParts([art], rig)[0], pose = resolveRigEditorPreview(rig, [part], 0, { width: 720, height: 405 });
  const character = { pose, transform: { opacity: 1 } }, geometry = calculateImagePartCanvasTransform(character, part, 720, 405);
  const source = { x: 0, y: 0 }, canvas = canvasPointFromSource(source, geometry), recovered = sourcePointFromCanvas(canvas, geometry);
  assert(Math.abs(recovered.x - source.x) < 1e-8); assert(Math.abs(recovered.y - source.y) < 1e-8);
  assert.deepEqual(clampSourcePoint({ x: -2, y: 3 }, { width: 1, height: 1 }), { x: 0, y: 1 });
});

test('pivot/offset/visibility/layer edits modify the appearance manifest consumed by CP2', () => {
  const rig = createCanonicalM1EditorRig('rig_test'), asset_id = 'libsha256_' + 'a'.repeat(64), part = createInitialRigEditorParts([mapping(asset_id)], rig)[0];
  const changed = updateRigEditorPart([part], 'head', { pivot: { x: 0, y: 1 }, offset: { x: .02, y: -.01 }, z_index: 50, opacity: .6, visible: false, transform: { rotation: .2, scale: 1.1 } })[0];
  const manifest = createDraftAppearanceManifest('char_test', rig, [changed]);
  assert.deepEqual(manifest.parts[0].pivot, { space: 'image_px', x: 0, y: 1 });
  assert.deepEqual(manifest.parts[0].transform.offset, { x: .02, y: -.01 });
  assert.equal(manifest.parts[0].visible, false); assert.equal(manifest.parts[0].opacity, .6); assert.equal(manifest.parts[0].z_index, 50);
});

test('bone attachment diagnostics separate out-of-bounds/invalid mapping and required missing parts', () => {
  const rig = createCanonicalM1EditorRig('rig_test'), asset_id = 'libsha256_' + 'a'.repeat(64);
  const part = createInitialRigEditorParts([mapping(asset_id, 'left_upper_arm')], rig)[0];
  part.binding.attachment_points_px.to.y += 4;
  const diagnostics = createRigEditorDiagnostics(rig, [part], new Map([[asset_id, {}]]));
  assert(diagnostics.some(item => item.code === 'invalid_attachment'));
  assert.deepEqual(missingRequiredRigParts([{ part_id: 'head', required: true }, { part_id: 'optional_hat', required: false }], [part]), ['head']);
});

test('rest/idle/breathe/blink preview seek is deterministic and aspect layouts preserve rig proportions', () => {
  const rig = createCanonicalM1EditorRig('rig_test');
  for (const [width, height] of [[1280, 720], [720, 1280]]) {
    const rest = resolveRigEditorPreview(rig, [], 0, { width, height, motion: 'rest' });
    const idleA = resolveRigEditorPreview(rig, [], 1.25, { width, height, motion: 'idle' });
    const idleB = resolveRigEditorPreview(rig, [], 1.25, { width, height, motion: 'idle' });
    const breathe = resolveRigEditorPreview(rig, [], 1.25, { width, height, motion: 'breathe' });
    const blink = resolveRigEditorPreview(rig, [], 1.25, { width, height, motion: 'blink' });
    assert.deepEqual(idleA, idleB); assert.notDeepEqual(rest.joints.torso, idleA.joints.torso); assert.notDeepEqual(rest.joints.torso, breathe.joints.torso);
    assert.equal(blink.facial.blink_status, 'no_op');
    const spanY = Math.max(...Object.values(rest.joints).map(joint => joint.y)) - Math.min(...Object.values(rest.joints).map(joint => joint.y));
    assert(spanY > height * .70 && spanY < height * .85);
  }
});

test('editor state and draft geometry stay isolated per character; discard returns saved state', () => {
  const manager = new CharacterStudioManager({ querySelector: () => null });
  manager.current = { character_id: 'char_a' }; manager.rigEditorState().selectedPartId = 'head'; manager.rigEditorState().zoom = 1.6;
  manager.current = { character_id: 'char_b' }; assert.equal(manager.rigEditorState().selectedPartId, ''); assert.equal(manager.rigEditorState().zoom, 1);
  manager.current = { character_id: 'char_a' }; assert.equal(manager.rigEditorState().zoom, 1.6);
  manager.savedDraft = { rig: { id: 'saved' }, rig_editor_parts: [] }; manager.currentDraft = { rig: { id: 'edited' }, rig_editor_parts: [{ id: 'head' }] };
  assert.equal(manager.isDirty(), true); manager.discardChanges(); assert.equal(manager.currentDraft.rig.id, 'saved');
});

test('rig, geometry manifest and draft asset reference reload together without publishing', async () => {
  const indexedDB = new FakeIndexedDB(), dbName = 'rig-editor-draft-save', bytesHash = await assetHash(), asset_id = `libsha256_${bytesHash}`, blob = new Blob([pngBytes], { type: 'image/png' });
  const storage = new CharacterLibraryStorage({ indexedDB, dbName, crypto: webcrypto, decodePng: async () => ({ width: 1, height: 1 }) });
  await storage.createCharacter({ character_id: 'char_rig_editor', display_name: 'Kỹ sư LAM', source_metadata: { role: 'engineer', rig_profile: 'adult' } });
  const rig = createCanonicalM1EditorRig('rig_engineer'), art = mapping(asset_id), part = createInitialRigEditorParts([art], rig)[0], manifest = createDraftAppearanceManifest('char_rig_editor', rig, [part]);
  await storage.saveCharacterDraft('char_rig_editor', { display_name: 'Kỹ sư LAM', role: 'engineer', rig, manifest, rig_editor_parts: [part], rig_editor_vocabulary: [{ part_id: 'head', role: 'head', joint_id: 'head', joint_ids: ['head'], required: true }], artwork_parts: [art], asset_refs: [asset_id] }, { assets: [{ asset_id, blob }] });
  await storage.close();
  const reloaded = new CharacterLibraryStorage({ indexedDB, dbName, crypto: webcrypto, decodePng: async () => ({ width: 1, height: 1 }) }), draft = await reloaded.getCharacterDraft('char_rig_editor');
  assert.equal(draft.rig.joints.length, 17); assert.equal(draft.manifest.parts[0].binding.joint_id, 'head'); assert.equal(draft.manifest.parts[0].asset_id, asset_id); assert.equal((await reloaded.getAsset(asset_id)).sha256, bytesHash);
  assert.deepEqual((await reloaded.getCharacter('char_rig_editor')).published_versions, []);
});

console.log('CP3.3B rig editor geometry and persistence tests passed.');
