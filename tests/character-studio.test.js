import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { CHARACTER_ROLES, CharacterStudioManager, copyPromptText, createCharacterId, createMetadataDraft, filterCharacters, generatePromptForCharacter, generatePromptStageForCharacter, shortenCharacterId } from '../src/character-studio.js';
import { characterPromptPartBlueprint } from '../src/render/character-prompt-builder.js';
import { characterRigJointIds } from '../src/render/character-assets.js';
import { CHARACTER_TYPES, createSampleSpriteCharacterDefinition, drawSpritePose, normalizeCharacterType, normalizeSpriteCharacterDefinition, resolveCharacterPreviewMode, resolveSpritePose } from '../src/render/character-sprite.js';
import { CharacterLibraryStorage } from '../src/render/character-library-storage.js';
import { FakeIndexedDB } from './support/fake-indexed-db.js';
import { SPRITE_CORE_POSE_IDS } from '../src/render/character-sprite-workflow.js';

test('Character Studio creates immutable-format IDs independent of edited display name', () => {
  const id = createCharacterId('Giáo viên khoa học', '550e8400-e29b-41d4-a716-446655440000');
  assert.match(id, /^char_giao_vien_khoa_hoc_550e8400_e29b_41d4_a716_446655440000$/);
  assert.notEqual(createCharacterId('Renamed teacher', 'other'), id);
  assert.equal(CHARACTER_ROLES.length, 7);
  assert.equal(shortenCharacterId(id), 'char_giao_vien_…5440000');
  assert.equal(shortenCharacterId('short-id'), 'short-id');
});

test('metadata draft validates role/profile/style and keeps optional description', () => {
  const draft = createMetadataDraft({ display_name: '  Teacher ', description: ' Intro ', role: 'male_teacher', rig_profile: 'adult', motion_style: 'natural' });
  assert.equal(draft.display_name, 'Teacher');
  assert.equal(draft.description, 'Intro');
  assert.equal(draft.role, 'male_teacher');
  assert.throws(() => createMetadataDraft({ display_name: '', role: 'custom', rig_profile: 'adult', motion_style: 'natural' }), /Display name/);
  assert.throws(() => createMetadataDraft({ display_name: 'A', role: 'bad_role', rig_profile: 'adult', motion_style: 'natural' }), /role/);
});

test('sprite character definition is deterministic, local, anchored, and separate from the legacy rigged default', () => {
  assert.deepEqual(CHARACTER_TYPES, ['rigged', 'sprite']);
  assert.equal(normalizeCharacterType(undefined), 'rigged');
  assert.equal(normalizeCharacterType('sprite'), 'sprite');
  assert.throws(() => normalizeCharacterType('unknown'), /character_type/);
  const first = createSampleSpriteCharacterDefinition(), second = createSampleSpriteCharacterDefinition();
  assert.deepEqual(first, second);
  assert.deepEqual(first.poses.map(pose => pose.pose_id), ['idle', 'greet', 'point', 'explain']);
  assert(first.poses.every(pose => pose.asset_ref.startsWith('/assets/character-sprites/') && pose.anchor_x === 128 && pose.anchor_y === 360));
  assert.equal(normalizeSpriteCharacterDefinition(first).transparent_background, true);
  assert.equal(resolveSpritePose(first).pose_id, 'idle');
  assert.equal(resolveCharacterPreviewMode({ character_type: 'sprite', sprite_character: first }).pose.pose_id, 'idle');
  assert.deepEqual(resolveCharacterPreviewMode({}).character_type, 'rigged');
  const draws = [];
  const layout = drawSpritePose({ drawImage: (...args) => draws.push(args) }, {}, resolveSpritePose(first, 'greet'), { x: 40, y: 70, scale: 0.5 });
  assert.deepEqual(layout, { left: -24, top: -110, width: 128, height: 192, anchor: { x: 40, y: 70 } });
  assert.equal(draws.length, 1);
  assert.throws(() => normalizeSpriteCharacterDefinition({ ...first, poses: [{ ...first.poses[0], asset_ref: '/assets/../secret.svg' }] }), /local sprite asset/);
});

test('sprite creation draft uses fixed-pose metadata without an M1 rig contract', () => {
  const draft = createMetadataDraft({ display_name: 'Demo Sprite', role: 'male_teacher', character_type: 'sprite' });
  assert.equal(draft.character_type, 'sprite');
  assert.deepEqual(SPRITE_CORE_POSE_IDS.length,12);
  assert.equal(draft.sprite_character.poses.length, 13);
  assert(SPRITE_CORE_POSE_IDS.every(id=>draft.sprite_character.poses.some(pose=>pose.pose_id===id)));
  assert(draft.sprite_character.poses.some(pose=>pose.pose_id==='point'&&pose.pose_category==='Legacy'));
  assert(draft.sprite_character.poses.filter(pose=>['point_left','point_right','present_left','present_right','thinking','question','emphasize','like','heart'].includes(pose.pose_id)).every(pose=>!pose.asset_id&&!pose.demo));
  assert.equal(Object.hasOwn(draft, 'rig_profile'), false);
  assert.equal(createMetadataDraft({ display_name: 'Legacy', role: 'custom', rig_profile: 'adult', motion_style: 'natural' }).character_type, 'rigged');
});

test('library search and role filtering use metadata without needing published PNG assets', () => {
  const entries = [
    { character_id: 'char_science_1', display_name: 'Science Teacher', source_metadata: { role: 'male_teacher', rig_profile: 'adult', motion_style: 'natural' }, published_versions: [] },
    { character_id: 'char_robot_1', display_name: 'Lab Helper', source_metadata: { role: 'humanoid_robot', rig_profile: 'humanoid_robot', motion_style: 'robotic' }, published_versions: ['1.0.0'] }
  ];
  assert.deepEqual(filterCharacters(entries, 'science', 'all').map(item => item.character_id), ['char_science_1']);
  assert.deepEqual(filterCharacters(entries, '', 'humanoid_robot').map(item => item.character_id), ['char_robot_1']);
});

test('unsaved-change Stay preserves edits and Discard restores the saved draft', () => {
  const manager = new CharacterStudioManager({ querySelector: () => null });
  manager.savedDraft = { display_name: 'Kỹ sư LAM', description: 'Saved' };
  manager.currentDraft = { display_name: 'Kỹ sư LAM (edited)', description: 'Unsaved' };
  const previousConfirm = globalThis.confirm;
  try {
    globalThis.confirm = () => false;
    assert.equal(manager.confirmDiscard(), false);
    assert.equal(manager.currentDraft.display_name, 'Kỹ sư LAM (edited)');
    assert.equal(manager.isDirty(), true);
    globalThis.confirm = () => true;
    assert.equal(manager.confirmDiscard(), true);
    assert.equal(manager.currentDraft.display_name, 'Kỹ sư LAM');
    assert.equal(manager.currentDraft.description, 'Saved');
    assert.equal(manager.isDirty(), false);
  } finally {
    if (previousConfirm === undefined) delete globalThis.confirm;
    else globalThis.confirm = previousConfirm;
  }
});

test('selected draft defaults map role, motion style, profile and description without mutating the draft', () => {
  const draft = { role: 'engineer', rig_profile: 'adult', motion_style: 'robotic', description: 'Kỹ sư cơ khí' };
  const original = structuredClone(draft);
  const result = generatePromptForCharacter(draft, {});
  assert.equal(result.rig_profile, 'adult');
  assert.equal(result.motion_style, 'robotic');
  assert.match(result.prompt, /kỹ sư/);
  assert.match(result.prompt, /mechanical cartoon|hoạt hình/i);
  assert.deepEqual(draft, original);
});

test('concept prompt supports Vietnamese and English and clearly avoids rig-ready claims', () => {
  const draft = { role: 'female_teacher', rig_profile: 'adult', motion_style: 'natural', description: 'Áo tím' };
  const vi = generatePromptForCharacter(draft, { output_stage: 'concept', language: 'vi' });
  const en = generatePromptForCharacter(draft, { output_stage: 'concept', language: 'en' });
  assert.equal(vi.output_stage, 'concept');
  assert.equal(vi.parts.length, 0);
  assert.match(vi.prompt, /KHÔNG phải artwork rig-ready/);
  assert.match(en.prompt, /NOT rig-ready art/);
  assert.match(vi.prompt, /Tóc:/);
});

test('rig-ready prompt uses canonical parts and joints, alpha limits, naming and reference guidance', () => {
  const result = generatePromptForCharacter({ role: 'custom', rig_profile: 'student', motion_style: 'minimal', description: 'Lab assistant' }, {
    role: 'custom', style: 'minimal_cartoon', rig_profile: 'student', motion_style: 'minimal', output_stage: 'rig_ready_parts', language: 'en',
    hair: 'Short curly hair', clothing: 'Blue jacket\nWhite shoes', reference_enabled: true, reference_traits: 'Eye shape\nColor palette'
  });
  assert.deepEqual(result.parts.map(part => part.part_id), characterPromptPartBlueprint.map(part => part.part_id));
  assert(result.parts.every(part => characterRigJointIds.includes(part.joint_id)));
  assert.match(result.prompt, /PNG files/);
  assert.match(result.prompt, /alpha only if the image tool supports it/);
  assert.match(result.prompt, /layer order/);
  assert.match(result.prompt, /character_custom_<part_id>_v1\.png/);
  assert.match(result.prompt, /attach it to the ChatGPT conversation/);
  assert.match(result.prompt, /Short curly hair/);
  assert.equal(result.capabilities.svgLayerImport, false);
});

test('prompt generation is deterministic and makes no AI/network calls', () => {
  const oldFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = () => { calls++; throw new Error('network must not be called'); };
  try {
    const draft = { role: 'student', rig_profile: 'student', motion_style: 'minimal', description: 'Student' };
    const options = { output_stage: 'rig_ready_parts', language: 'vi', reference_enabled: true, reference_traits: 'Glasses' };
    assert.equal(generatePromptForCharacter(draft, options).prompt, generatePromptForCharacter(draft, options).prompt);
    assert.equal(calls, 0);
  } finally { if (oldFetch === undefined) delete globalThis.fetch; else globalThis.fetch = oldFetch; }
});

test('copy helper reports success and clipboard permission failure', async () => {
  let copied = '';
  await copyPromptText('prompt text', { clipboard: { writeText: async value => { copied = value; } } });
  assert.equal(copied, 'prompt text');
  const output = { focus() {}, select() {} };
  await assert.rejects(() => copyPromptText('prompt text', { clipboard: { writeText: async () => { throw new Error('denied'); } }, documentRef: { execCommand: () => false }, output }), /denied/);
});

test('prompt options and generated text are isolated per character', () => {
  const manager = new CharacterStudioManager({ querySelector: () => null });
  const draftA = { role: 'engineer', rig_profile: 'adult', motion_style: 'natural', description: 'Engineer A' };
  manager.current = { character_id: 'char_engineer_a', source_metadata: {} }; manager.currentDraft = draftA;
  manager.promptOptionsByCharacter.set('char_engineer_a', { clothing: 'Orange coveralls', output_stage: 'rig_ready_parts' });
  manager.generatedPromptByCharacter.set('char_engineer_a', 'prompt A');
  const promptOptionsA = manager.getPromptOptions();
  manager.current = { character_id: 'char_student_b', source_metadata: {} }; manager.currentDraft = { role: 'student', rig_profile: 'student', motion_style: 'minimal', description: 'Student B' };
  const promptOptionsB = manager.getPromptOptions();
  assert.equal(promptOptionsA.clothing, 'Orange coveralls');
  assert.equal(promptOptionsA.output_stage, 'rig_ready_parts');
  assert.equal(promptOptionsA.starter_template,'engineer');assert.equal(promptOptionsA.outfit,'lam_engineer_uniform');
  assert.equal(promptOptionsB.clothing, '');
  assert.equal(promptOptionsB.role, 'student');
  assert.equal(promptOptionsB.starter_template,'student');assert.equal(promptOptionsB.outfit,'school_uniform');
  assert.equal(manager.generatedPromptByCharacter.get('char_student_b'), undefined);
});

test('staged prompt uses the selected character ID and draft values without changing draft data', () => {
  const draft = { role: 'engineer', rig_profile: 'adult', motion_style: 'natural', description: 'Kỹ sư LAM', hair: 'Nâu', manifest: null, rig: null };
  const before = structuredClone(draft);
  const result = generatePromptStageForCharacter(draft, { output_stage: 'rig_ready_parts', workflow_stage: 'arms', language: 'vi', clothing: 'Áo xanh' }, 'char_engineer_lam');
  assert.equal(result.workflow_stage, 'arms');
  assert.equal(result.parts.length, 6);
  assert.match(result.prompt, /char_engineer_lam/);
  assert.match(result.prompt, /Stage C|GIAI ĐOẠN C/);
  assert.match(result.prompt,/STARTER APPEARANCE/);assert.match(result.prompt,/"look_configuration"/);
  assert.deepEqual(draft, before);
});

test('metadata saves update library list fields and preserve rig, manifest and published versions', async () => {
  const storage = new CharacterLibraryStorage({ indexedDB: new FakeIndexedDB(), crypto: webcrypto, dbName: 'character-studio-metadata-test' });
  const character = await storage.createCharacter({ character_id: 'char_teacher_example', display_name: 'Teacher', source_metadata: { role: 'male_teacher', rig_profile: 'adult', motion_style: 'natural' } });
  const rig = { id: 'existing-rig', joints: [{ id: 'root', parent_id: null, position: { x: 0, y: 0 } }], parts: [] };
  const manifest = { appearance_id: 'existing-appearance', version: 'draft' };
  await storage.saveCharacterDraft(character.character_id, { display_name: 'Teacher edited', description: 'Description', role: 'female_teacher', rig_profile: 'adult', motion_style: 'minimal', rig, manifest, asset_refs: [] });
  const [listed] = await storage.listCharacters();
  const saved = await storage.getCharacterDraft(character.character_id);
  assert.deepEqual(listed.source_metadata, { role: 'female_teacher', rig_profile: 'adult', motion_style: 'minimal', style_profile: 'minimal' });
  assert.deepEqual(saved.rig, rig);
  assert.deepEqual(saved.manifest, manifest);
  assert.deepEqual(listed.published_versions, []);
});
