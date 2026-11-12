import assert from 'node:assert/strict';
import { resolveScriptCharacterDirections } from '../src/render/script-character-import.js';

const checksum = 'a'.repeat(64);
const pose = { pose_id: 'idle', label: 'Idle' };
const clip = { clip_id: 'wave', frames: [{ frame_index: 0 }], fps: 12 };
const version = { character_id: 'char_robot_1', character_type: 'sprite', version: '1.0.0', content_checksum: checksum, sprite_snapshot: { schema_version: 1, poses: [pose], clips: [clip] } };
const rigged = { character_id: 'char_teacher', character_type: 'rigged', version: '2.0.0', content_checksum: 'b'.repeat(64), compatible_motion_features: ['idle', 'breathe'], motion_style: 'natural' };
let requests = 0;
const storage = { async getCharacterVersion(id, pinned) { requests++; if (id === version.character_id && pinned === version.version) return structuredClone(version); if (id === rigged.character_id && pinned === rigged.version) return structuredClone(rigged); return null; } };

const legacy = [{ title: 'legacy', duration: 5 }];
assert.deepEqual(await resolveScriptCharacterDirections(legacy, storage), legacy);
assert.equal(requests, 0, 'character-free scripts must not access the Published Character Library');

const source = [{ duration: 5, character_directions: [{ character_id: 'char_robot_1', character_type: 'sprite', published_version: '1.0.0', published_checksum: checksum, placement: { x: .2, y: .7, scale: 1.3 }, animation: { type: 'clip', id: 'wave', start_seconds: 1, duration_seconds: 2, loop: true, hold_last_frame: false } }] }];
const [resolved] = await resolveScriptCharacterDirections(source, storage);
assert.equal(resolved.scene_graph.version, 2);
assert.equal(resolved.scene_graph.sprite_instances[0].character_version, '1.0.0');
assert.deepEqual(resolved.scene_graph.sprite_instances[0].transform, { x: .2, y: .7, scale: 1.3, opacity: 1 });
assert.deepEqual(resolved.scene_graph.sprite_instances[0].animation, { mode: 'clip', clip_id: 'wave', start_seconds: 1, loop: true, hold_last_frame: false });
assert.equal(resolved.scene_graph.sprite_instances[0].z_index, 0);
assert.equal(resolved.scene_graph.sprite_instances[0].active_start_seconds, 1);
assert.equal(resolved.scene_graph.sprite_instances[0].active_duration_seconds, 2);
assert.equal(source[0].scene_graph, undefined, 'preflight must not mutate caller scenes');

const multiScene={duration:5,character_directions:[source[0].character_directions[0],{character_id:'char_teacher',character_type:'rigged',published_version:'2.0.0',published_checksum:rigged.content_checksum,placement:{x:.75,y:.7,scale:.9},animation:{type:'motion',id:'breathe',start_seconds:0,duration_seconds:4,loop:true}}]};
const multi=await resolveScriptCharacterDirections([multiScene],storage);
assert.equal(multi[0].scene_graph.sprite_instances.length,1);assert.equal(multi[0].scene_graph.character_instances.length,1);
assert.notEqual(multi[0].scene_graph.sprite_instances[0].instance_id,multi[0].scene_graph.character_instances[0].instance_id);
assert.equal(multi[0].scene_graph.character_instances[0].actions[0].motion,'breathe');
assert.equal(multi[0].scene_graph.character_instances[0].visible,true);
assert.equal(multi[0].scene_graph.character_instances[0].z_index,0);
assert.equal(multi[0].scene_graph.character_instances[0].active_duration_seconds,4,'legacy direction timing remains its visibility window');
const composed=await resolveScriptCharacterDirections([{duration:5,character_directions:[{...multiScene.character_directions[1],visible:false,opacity:.4,z_index:4,visibility_start_seconds:1,visibility_duration_seconds:2}]}],storage);
assert.equal(composed[0].scene_graph.character_instances[0].visible,false);
assert.equal(composed[0].scene_graph.character_instances[0].transform.opacity,.4);
assert.equal(composed[0].scene_graph.character_instances[0].z_index,4);
assert.equal(composed[0].scene_graph.character_instances[0].active_start_seconds,1);
assert.equal(composed[0].scene_graph.character_instances[0].active_duration_seconds,2);
const sharedCache=new Map(),requestCount=requests,landscapeScene=structuredClone(multiScene),portraitScene=structuredClone(multiScene);landscapeScene.character_directions[0].placement.x=.2;portraitScene.character_directions[0].placement.x=.8;
const [landscapeResolved]=await resolveScriptCharacterDirections([landscapeScene],storage,{versionCache:sharedCache,variant:'landscape'}),[portraitResolved]=await resolveScriptCharacterDirections([portraitScene],storage,{versionCache:sharedCache,variant:'portrait'});
assert.equal(sharedCache.size,2,'each exact Published version is fetched once across aspect variants');assert.equal(requests-requestCount,2,'SQLite/API version resolution is shared across variants');
assert.equal(landscapeResolved.scene_graph.sprite_instances[0].transform.x,.2);assert.equal(portraitResolved.scene_graph.sprite_instances[0].transform.x,.8,'aspect-specific placement stays independent');

await assert.rejects(() => resolveScriptCharacterDirections([{ duration: 5, character_directions: [{ ...source[0].character_directions[0], placement: undefined }] }], storage), /Scene 1, character char_robot_1.*placement/);
await assert.rejects(() => resolveScriptCharacterDirections([{ duration: 5, character_directions: [{ ...source[0].character_directions[0], animation: { type: 'clip', id: 'missing' } }] }], storage), /clip missing is not in the pinned version/);
await assert.rejects(() => resolveScriptCharacterDirections([{ duration: 5, character_directions: [{ ...source[0].character_directions[0], published_checksum: 'b'.repeat(64) }] }], storage), /checksum does not match/);

console.log('script-character-import: PASS (legacy no lookup, pinned Sprite mapping, validation, no source mutation)');
