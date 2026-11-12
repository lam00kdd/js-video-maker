import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeObjectScene } from '../src/render/object-scene-schema.js';
import { normalizeProject } from '../src/project.js';
import { appendCharacterVersion, normalizeCharacterInstanceReferences, normalizeCharacterLibrary, normalizeCharacterLibraryRecord, resolvePinnedCharacterVersion } from '../src/render/character-library-contract.js';

const digest='a'.repeat(64),digest2='b'.repeat(64),asset='libsha256_'+'c'.repeat(64);
const version=(tag,content=digest)=>({version:tag,rig_profile:'adult',motion_style:'natural',manifest_ref:{manifest_id:'teacher-manifest',version:tag,checksum:digest2},content_checksum:content,asset_refs:[asset],compatible_motion_features:['idle','breathe','blink'],validation_status:'validated',validation_report_checksum:digest});
const record=()=>normalizeCharacterLibraryRecord({character_id:'char_lam_teacher',display_name:'Giáo viên Lam',description:'Character Library test record',versions:[version('1.0.0')]});
const instance=(id='teacher_a',tag='1.0.0',content=digest)=>({instance_id:id,character_id:'char_lam_teacher',character_version:tag,character_version_checksum:content,transform:{x:.4,y:.6,scale:.8,rotation:0,opacity:1},motion_style:'natural',actions:[]});
const graph=character_instances=>({version:2,coordinate_space:'normalized',objects:[{id:'anchor',type:'circle',geometry:{radius:.02}}],character_instances});

test('library metadata is separate from blobs and supports validated immutable version snapshots',()=>{
 const original=record();assert.equal(original.character_id,'char_lam_teacher');assert.deepEqual(original.versions[0].asset_refs,[asset]);assert(!Object.hasOwn(original,'data_url'));
 assert.throws(()=>normalizeCharacterLibraryRecord({...original,data_url:'data:image/png;base64,AA=='}),/must not embed asset blob/);
 assert.deepEqual(normalizeCharacterLibrary([original]),[original]);assert.throws(()=>normalizeCharacterLibrary([original,original]),/Duplicate immutable character_id/);
 const next=appendCharacterVersion(original,version('1.1.0',digest2));assert.deepEqual(original.versions,[version('1.0.0')]);assert.deepEqual(next.versions.map(item=>item.version),['1.0.0','1.1.0']);assert.throws(()=>appendCharacterVersion(next,version('1.0.0')),/unique semantic/);
 assert.throws(()=>normalizeCharacterLibraryRecord({...original,character_id:'teacher'}),/immutable char_/);
});

test('video scene references pin exact character versions and survive project save/reload',()=>{
 const first=normalizeCharacterInstanceReferences([instance('teacher_a'),instance('teacher_b')],8),second=normalizeCharacterInstanceReferences([instance('teacher_c')],8);
 assert.equal(first[0].character_id,first[1].character_id);assert.notEqual(first[0].instance_id,first[1].instance_id);assert.equal(second[0].character_version,'1.0.0');
 const scene=normalizeObjectScene(graph(first),8),project=normalizeProject({scenes:[{duration:8,objectScene:graph(first)}]});assert.deepEqual(scene.character_instances,first);assert.deepEqual(project.scenes[0].objectScene.character_instances,first);
 const landscape=normalizeObjectScene(graph([instance('teacher_layout_landscape')]),8),portrait=normalizeObjectScene(graph([instance('teacher_layout_portrait')]),8);assert.notEqual(landscape.character_instances[0].instance_id,portrait.character_instances[0].instance_id);assert.equal(landscape.character_instances[0].character_version,portrait.character_instances[0].character_version);
 const projectA=normalizeProject({scenes:[{duration:8,objectScene:graph([instance('project_a_teacher')])}]}),projectB=normalizeProject({scenes:[{duration:8,objectScene:graph([instance('project_b_teacher')])}]});assert.equal(projectA.scenes[0].objectScene.character_instances[0].character_id,projectB.scenes[0].objectScene.character_instances[0].character_id);
});

test('exact pinned versions resolve independently of later latest versions; missing IDs, versions and checksums diagnose without fallback',()=>{
 const original=record(),next=appendCharacterVersion(original,version('1.1.0',digest2)),pinned=normalizeCharacterInstanceReferences([instance()],8)[0];
 assert.equal(resolvePinnedCharacterVersion(pinned,[next]).version.version,'1.0.0');
 assert.equal(resolvePinnedCharacterVersion(instance('x','2.0.0'),[next]).status,'missing_version');
 assert.equal(resolvePinnedCharacterVersion(pinned,[]).status,'missing_character');
 assert.equal(resolvePinnedCharacterVersion(instance('x','1.0.0',digest2),[next]).status,'version_integrity_error');
});

test('instance validation rejects latest aliases, duplicate IDs, bad assets and missing pin metadata',()=>{
 assert.throws(()=>normalizeCharacterInstanceReferences([{...instance(),character_version:'latest'}]),/pinned as semantic version/);
 assert.throws(()=>normalizeCharacterInstanceReferences([instance('same'),instance('same')]),/Duplicate character instance_id/);
 assert.throws(()=>normalizeCharacterLibraryRecord({...record(),versions:[{...version('1.0.0'),asset_refs:['image-local-path.png']}]}),/content-addressed/);
 assert.throws(()=>normalizeObjectScene(graph([{instance_id:'x',character_id:'char_lam_teacher',character_version:'1.0.0'}]),8),/checksum/);
});

console.log('Character Library architecture contract passed; no persistent library backend was added.');
