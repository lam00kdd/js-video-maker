import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVisualDslV3, validateVisualDslV3, VisualDslV3ValidationError } from '../src/visual-dsl-v3.js';
import { prepareVisualDslV3CharacterResources, createVisualDslV3CharacterBundle, readVisualDslV3CharacterBundle } from '../src/render/visual-dsl-v3-characters.js';
import { readFile } from 'node:fs/promises';
import { renderVisualDslV3Frame } from '../src/render/visual-dsl-v3-frame.js';
import { collectVisualDslV3CharacterReferences } from '../src/render/visual-dsl-v3-characters.js';
import { characterRigJointIds } from '../src/render/character-assets.js';
import { resolveHumanPose } from '../src/render/human-rig.js';

const checksum = 'a'.repeat(64), charId = 'char_qa_sprite_teacher', version = '1.0.0';
function makeCanvas(width = 1280, height = 720) {
  const calls = [], stack = [];
  const ctx = { canvas: null, globalAlpha: 1, fillStyle: '#000', matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, save() { stack.push({ alpha: this.globalAlpha, fill: this.fillStyle, matrix: { ...this.matrix } }); }, restore() { const saved = stack.pop(); this.globalAlpha = saved.alpha; this.fillStyle = saved.fill; this.matrix = saved.matrix; }, setTransform(a,b,c,d,e,f) { this.matrix = {a,b,c,d,e,f}; }, getTransform() { return { ...this.matrix }; }, translate(x,y) { this.matrix.e += x; this.matrix.f += y; calls.push(['translate',x,y]); }, rotate(angle) { calls.push(['rotate',angle]); }, scale(x,y) { this.matrix.a *= x; this.matrix.d *= y; calls.push(['scale',x,y]); }, clearRect(){}, fillRect(){}, beginPath(){}, rect(){}, clip(){}, moveTo(){}, lineTo(){}, quadraticCurveTo(){}, bezierCurveTo(){}, closePath(){}, stroke(){}, fill(){calls.push(['fill',this.fillStyle]);}, arc(){}, ellipse(){}, fillText(){}, strokeText(){}, measureText(){return{width:1};}, drawImage(...args){calls.push(['drawImage',...args,{alpha:this.globalAlpha,matrix:{...this.matrix}}]);} };
  const canvas = { width, height, getContext: () => ctx }; ctx.canvas = canvas; return { canvas, calls };
}

function documentWithCharacter({ aspect = '16:9', transform = {}, loop = true } = {}) {
  const geometry = { character_id: charId, character_version: version, character_version_checksum: checksum, clip_id: 'wave', x: .72, y: .78, scale: 1.15, start_seconds: .25, loop, hold_last_frame: true, ...transform };
  const scene = { id: 'scene-character', title: 'Sprite wave', duration_seconds: 4, narration: 'Xin chào.', stage: { width: 1600, height: 900, background: '#FFFFFF' }, timeline: { tracks: [] }, root: { id: 'root', type: 'group', children: [{ id: 'presenter', type: 'published_character', geometry }] } };
  const base = { visual_dsl_version: 3, title: 'V3 Sprite QA', language: 'vi-VN', aspect_ratio: aspect };
  if (aspect === 'both') return { ...base, variants: { landscape: { scenes: [structuredClone(scene)] }, portrait: { scenes: [{ ...structuredClone(scene), stage: { width: 900, height: 1600, background: '#FFFFFF' } }] } } };
  return { ...base, scenes: [scene] };
}

function spriteStorage({ badChecksum = false } = {}) {
  const ids = Array.from({ length: 4 }, (_, index) => `libsha256_${String(index + 1).padStart(64, '0')}`);
  const frames = ids.map((asset_id, frame_index) => ({ frame_index, asset_id, width: 20 + frame_index, height: 40, anchor: { x: .5, y: .92 }, alignment: { offset_x: frame_index * .005, offset_y: 0, scale: 1 }, duration_seconds: .125 }));
  const snapshot = { character_id: charId, character_type: 'sprite', version, default_pose_id: 'idle', master: { revision: 1, asset_id: ids[0], width: 20, height: 40 }, poses: [{ pose_id: 'idle', asset_id: ids[0], width: 20, height: 40, anchor: { x: .5, y: .92 }, alignment: { offset_x: 0, offset_y: 0, scale: 1 } }], clips: [{ character_id: charId, clip_id: 'wave', fps: 8, frame_count: frames.length, loop: true, hold_last_frame: true, source_master_revision: 1, frames }], asset_refs: ids };
  const blob = new Blob(['png fixture']);
  return { ids, snapshot, storage: { async resolvePublishedSpriteCharacter(id, pinnedVersion) { if (id !== charId || pinnedVersion !== version) return { status: 'missing_version', diagnostics: [{ severity: 'error', code: 'missing_version', message: 'Pinned Sprite version is unavailable.' }] }; return { status: 'resolved', snapshot, content_checksum: badChecksum ? 'b'.repeat(64) : checksum, assets: new Map(ids.map(id => [id, blob])) }; } } };
}

test('V3 Published Sprite node pins exact identity, version, checksum, and real clip contract', () => {
  const source = documentWithCharacter(); assert.equal(validateVisualDslV3(source), true); const normalized = normalizeVisualDslV3(source); assert.equal(normalized.scenes[0].root.children[0].type, 'published_character'); assert(Object.isFrozen(normalized));
  for (const [key, value, code] of [['character_id','invented','character_id'], ['character_version','latest','character_version'], ['character_version_checksum','bad','character_checksum'], ['clip_id','not real','character_clip'], ['scale',0,'character_scale'], ['x',3,'character_position'], ['unknown',1,'unsupported_field']]) { const bad = documentWithCharacter(); bad.scenes[0].root.children[0].geometry[key] = value; assert.throws(() => validateVisualDslV3(bad), error => error instanceof VisualDslV3ValidationError && error.diagnostics.some(item => item.code === code)); }
});

function riggedDocument(motion='breathe',aspect='16:9'){
  const scene={id:'scene-rigged',title:'Rigged motion',duration_seconds:4,narration:'Giáo viên minh họa chuyển động.',stage:{width:1600,height:900,background:'#FFFFFF'},timeline:{tracks:[]},root:{id:'root',type:'group',children:[{id:'teacher',type:'published_character',geometry:{character_id:'char_cp2_demo_teacher',character_version:'1.0.1',character_version_checksum:'c'.repeat(64),motion_id:motion,x:.5,y:.62,scale:1}}]}};
  return{visual_dsl_version:3,title:'Rigged QA',language:'vi-VN',aspect_ratio:aspect,scenes:[scene]};
}
function riggedStorage(){
  const blob=new Blob([Uint8Array.from([137,80,78,71,13,10,26,10,1,2])],{type:'image/png'}),asset_id='libsha256_'+ 'd'.repeat(64);
  const joints=characterRigJointIds.map(id=>({id,parent_id:id==='root'?null:'root',position:{x:0,y:id==='torso'?-.04:0},rotation:0,rest_pose:{rotation:0},pivot:{x:0,y:0},limits:{min:-2,max:2},length:0}));
  const part=(id,feature_bindings={})=>({id,type:'image',asset_id,source_dimensions_px:{width:10,height:10},alpha:true,opacity:1,binding:{joint_id:id==='torso_art'?'torso':'head'},pivot:{space:'image_px',x:5,y:5},size_rig_units:{width:.04,height:.04},transform:{offset:{x:0,y:0},rotation:0,scale:1},z_index:id==='torso_art'?1:2,visible:true,required:true,feature_bindings});
  const manifest={rig_compatibility:{required_joints:characterRigJointIds},parts:[part('torso_art'),part('eye_left',{eye_left:'blink.eye_left'}),part('eye_right',{eye_right:'blink.eye_right'})]};
  const version={character_id:'char_cp2_demo_teacher',character_type:'rigged',version:'1.0.1',content_checksum:'c'.repeat(64),validation_status:'validated',motion_style:'natural',compatible_motion_features:['idle','breathe','blink'],manifest,rig:{id:'teacher',joints,parts:[]}};
  const storage={async resolveCharacterVersion(ref){return{status:'resolved',version,manifest,rig:version.rig,assets:new Map([[asset_id,blob]])};}};
  return{storage,version,asset_id,blob};
}

test('V3 Rigged published_character uses the shared absolute-time evaluator for stable seeks and Breathe motion',async()=>{
  const {storage,asset_id,version}=riggedStorage(),document=normalizeVisualDslV3(riggedDocument()),references=collectVisualDslV3CharacterReferences(document);
  assert.equal(references[0].character_type,'rigged');assert.equal(references[0].actions[0].motion,'breathe');
  const prepared=await prepareVisualDslV3CharacterResources(document,storage,{decodeImage:async()=>({width:10,height:10,asset_id})});assert.equal(prepared.ready,true);
  const sample=time=>{const target=makeCanvas();renderVisualDslV3Frame(target.canvas,document,'root','scene-rigged',time,{preparedCharacterVersions:prepared.versions});assert.equal(target.calls.filter(call=>call[0]==='drawImage').length,3);return target.calls.filter(call=>call[0]==='rotate').map(call=>call[1]);};
  const start=sample(0),mid=sample(.5),repeat=sample(.5),back=sample(.25),actions=references[0].actions,poseStart=resolveHumanPose(version.rig,actions,0,{width:1600,height:900,transform:references[0].transform}),poseMid=resolveHumanPose(version.rig,actions,.5,{width:1600,height:900,transform:references[0].transform});assert.equal(mid.length,start.length);assert.deepEqual(mid,repeat,'same timestamp must produce the same pose');assert.notEqual(poseStart.joints.torso.rotation,poseMid.joints.torso.rotation,'the shared evaluator applies Breathe motion');assert.notDeepEqual(back,mid,'backward seek evaluates from absolute time, without accumulated pose state');
  const mismatched=riggedStorage();mismatched.version.character_type='sprite';await assert.rejects(()=>prepareVisualDslV3CharacterResources(document,mismatched.storage,{decodeImage:async()=>({width:10,height:10,asset_id})}),/character_type_mismatch/);
});

test('V3 Rigged schema rejects unsupported motions and preserves the existing Sprite clip contract',()=>{
  const source=riggedDocument('blink');assert.equal(validateVisualDslV3(source),true);const bad=riggedDocument('wave');assert.throws(()=>validateVisualDslV3(bad),error=>error instanceof VisualDslV3ValidationError&&error.diagnostics.some(item=>item.code==='character_motion'));
  const sprite=normalizeVisualDslV3(documentWithCharacter());assert.equal(sprite.scenes[0].root.children[0].geometry.clip_id,'wave');assert.equal(sprite.scenes[0].root.children[0].geometry.motion_id,undefined);
});

test('shared preflight resolves immutable Sprite dependencies once and reports exact pin/clip failures', async () => {
  const { storage, ids } = spriteStorage(), document = normalizeVisualDslV3(documentWithCharacter()), prepared = await prepareVisualDslV3CharacterResources(document, storage, { decodeImage: async (_blob, id) => ({ width: 19 + Number(id.match(/(\d+)$/)[1]), height: 40, asset_id: id }) });
  assert.equal(prepared.ready, true); assert.equal(prepared.references.length, 1); assert.equal(prepared.versions.size, 1); assert(ids.every(id => prepared.versions.values().next().value.assets.has(id)));
  const unknown = structuredClone(document); unknown.scenes[0].root.children[0].geometry.clip_id = 'missing'; await assert.rejects(() => prepareVisualDslV3CharacterResources(unknown, storage, { decodeImage: async (_blob, id) => ({ width: 19 + Number(id.match(/(\d+)$/)[1]), height: 40 }) }), /root scene scene-character node presenter.*published_clip_missing/);
  const badPin = spriteStorage({ badChecksum: true }); await assert.rejects(() => prepareVisualDslV3CharacterResources(document, badPin.storage, { decodeImage: async (_blob, id) => ({ width: 19 + Number(id.match(/(\d+)$/)[1]), height: 40 }) }), /version_checksum_mismatch/);
});

test('shared V3 Preview/MP4 frame path reuses published Sprite clip evaluation for forward/backward seeks and both aspects', async () => {
  const { storage, ids } = spriteStorage(), source = documentWithCharacter({ aspect: 'both' }), normalized = normalizeVisualDslV3(source), prepared = await prepareVisualDslV3CharacterResources(normalized, storage, { decodeImage: async (_blob, id) => ({ width: 19 + Number(id.match(/(\d+)$/)[1]), height: 40, asset_id: id }) });
  for (const [variant, width, height] of [['landscape',1280,720],['portrait',720,1280]]) {
    const doc = normalized, expected = [[0,'idle'],[.25,'frame-0'],[.5,'frame-2'],[.625,'frame-3'],[.75,'frame-0'],[.375,'frame-1']];
    for (const [time, frame] of expected) {
      const target = makeCanvas(width,height), result = renderVisualDslV3Frame(target.canvas, doc, variant, 'scene-character', time, { preparedCharacterVersions: prepared.versions });
      const draw = target.calls.find(call => call[0] === 'drawImage'); assert(draw, `${variant} t=${time}: sprite frame should draw`); const frameIndex = Number(draw[1].asset_id.match(/(\d+)$/)[1]) - 1; assert.equal(frameIndex, frame === 'idle' ? 0 : Number(frame.slice(-1)), `${variant} t=${time} should select ${frame}`);
      const repeat = makeCanvas(width,height); renderVisualDslV3Frame(repeat.canvas, doc, variant, 'scene-character', time, { preparedCharacterVersions: prepared.versions }); assert.deepEqual(repeat.calls.find(call => call[0] === 'drawImage').slice(1,3), draw.slice(1,3), 'repeated timestamp resolves the same pinned frame');
    }
    const frameAtMiddle = makeCanvas(width,height); renderVisualDslV3Frame(frameAtMiddle.canvas, doc, variant, 'scene-character', .5, { preparedCharacterVersions: prepared.versions }); assert(frameAtMiddle.calls.some(call => call[0] === 'scale' && call[1] === 1.15), 'character scale reaches the shared draw helper'); assert(ids.length === 4);
  }
});

test('published Sprite nodes inherit V3 group and camera transforms and preserve sibling painter order', async () => {
  const { storage } = spriteStorage(), source = documentWithCharacter(), node = source.scenes[0].root.children[0]; source.scenes[0].root.children = [{ id: 'back', type: 'rect', z_index: 0, geometry: { x: 0, y: 0, width: 30, height: 30 }, style: { fill: '#123456' } }, { id: 'group', type: 'group', z_index: 1, transform: { x: 24, y: 18, rotation_degrees: 15, scale_x: 1.2, scale_y: 1.2 }, children: [node] }, { id: 'front', type: 'rect', z_index: 2, geometry: { x: 100, y: 100, width: 30, height: 30 }, style: { fill: '#654321' } }]; source.scenes[0].timeline.tracks = [{ target_id: 'camera', property: 'camera.pan_x', keyframes: [{ time_seconds: 0, value: 0 }, { time_seconds: 2, value: 12 }] }]; const normalized = normalizeVisualDslV3(source), prepared = await prepareVisualDslV3CharacterResources(normalized, storage, { decodeImage: async (_blob, id) => ({ width: 19 + Number(id.match(/(\d+)$/)[1]), height: 40, asset_id: id }) }), target = makeCanvas(); renderVisualDslV3Frame(target.canvas, normalized, 'root', 'scene-character', 2, { preparedCharacterVersions: prepared.versions }); const drawIndex = target.calls.findIndex(call => call[0] === 'drawImage'); assert(drawIndex > 0); assert(target.calls.some(call => call[0] === 'rotate' && Math.abs(call[1] - Math.PI / 12) < 1e-8)); const fills = target.calls.map((call,index) => call[0] === 'fill' ? index : -1).filter(index => index >= 0); assert(fills.length >= 2); assert(fills[0] < drawIndex && fills.at(-1) > drawIndex, 'sibling Z ordering paints character between earlier and later V3 nodes');
});

test('real QA fixture is importable and pins the published teacher wave revision', async () => {
  const fixture = JSON.parse(await readFile(new URL('../qa/visual-dsl-v3-published-sprite-smoke.json', import.meta.url), 'utf8'));
  assert.equal(validateVisualDslV3(fixture), true);
  const node = fixture.scenes[0].root.children.find(item => item.type === 'published_character');
  assert.equal(node.geometry.character_id, 'char_female_teacher_1_beca662a_b7af_4a6d_9683_22d106eabd0a');
  assert.equal(node.geometry.character_version, '1.0.2'); assert.equal(node.geometry.clip_id, 'wave');
});

test('Rigged Idle, Breathe, and Blink QA fixtures pin the real teacher revision for both aspect variants',async()=>{
  for(const motion of ['idle','breathe','blink']){
    const fixture=JSON.parse(await readFile(new URL(`../qa/visual-dsl-v3-published-rigged-${motion}.json`,import.meta.url),'utf8'));assert.equal(validateVisualDslV3(fixture),true);
    for(const variant of ['landscape','portrait']){const node=fixture.variants[variant].scenes[0].root.children[0];assert.equal(node.geometry.character_id,'char_cp2_demo_teacher');assert.equal(node.geometry.character_version,'1.0.1');assert.equal(node.geometry.character_version_checksum,'23b848d44f86c0b9a6eb49e3d0d7df03855c7a1077741e9eaab64cd749dc8d73');assert.equal(node.geometry.motion_id,motion);}
  }
});

test('companion bundle exports only pinned dependencies and verifies identity, revision checksum and PNG bytes', async () => {
  const blob = new Blob([Uint8Array.from([137,80,78,71,13,10,26,10,1,2,3,4])], { type: 'image/png' });
  const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', value instanceof Blob ? await value.arrayBuffer() : new TextEncoder().encode(value)))].map(item => item.toString(16).padStart(2,'0')).join('');
  const asset_id = `libsha256_${await hash(blob)}`, snapshot = { schema_version: 1, character_id: charId, version, poses: [], clips: [] }, assets = [{ asset_id, sha256: asset_id.slice('libsha256_'.length) }];
  const stable = value => JSON.stringify(value, (key,item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(name => [name,item[name]])) : item);
  const content_checksum = await hash(stable({ sprite_snapshot: snapshot, assets }));
  const identity = { character_id: charId, character_type: 'sprite', display_name: 'QA Teacher' };
  const record = { character_id: charId, character_type: 'sprite', version, validation_status: 'validated', content_checksum, sprite_snapshot: snapshot, asset_refs: [asset_id], assets: new Map([[asset_id,blob]]) };
  const storage = { async getCharacter() { return identity; }, async getCharacterVersion() { return record; } };
  const document = documentWithCharacter(); document.scenes[0].root.children[0].geometry.character_version_checksum = content_checksum;
  const bundle = await createVisualDslV3CharacterBundle(document, storage);
  const directory = { async getFileHandle() { return { async getFile() { return new Blob([JSON.stringify(bundle)]); } }; } };
  const verified = await readVisualDslV3CharacterBundle(directory); assert(verified.has(`${charId}@${version}`));
  const tampered = structuredClone(bundle); tampered.assets[0].data_base64 = btoa('tampered');
  await assert.rejects(() => readVisualDslV3CharacterBundle({ async getFileHandle() { return { async getFile() { return new Blob([JSON.stringify(tampered)]); } }; } }), /V3_CHARACTER_PACKAGE_FAILED/);
});

test('Rigged companion bundle verifies manifest, rig, image dependencies, and preserves immutable revision identity',async()=>{
  const {version:source}=riggedStorage(),blob=new Blob([Uint8Array.from([137,80,78,71,13,10,26,10,1,2,3,4])],{type:'image/png'}),hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',value instanceof Blob?await value.arrayBuffer():new TextEncoder().encode(value)))].map(item=>item.toString(16).padStart(2,'0')).join(''),stable=value=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);
  const asset_id=`libsha256_${await hash(blob)}`,version=structuredClone(source);version.manifest.parts.forEach(part=>part.asset_id=asset_id);version.asset_refs=[asset_id];version.manifest_ref={manifest_id:'teacher',version:version.version,checksum:await hash(stable(version.manifest))};version.content_checksum=await hash(stable({character_id:version.character_id,version:version.version,manifest:version.manifest,rig:version.rig,assets:version.manifest.parts.filter(part=>part.type==='image').map(part=>({asset_id:part.asset_id,sha256:asset_id.slice(10)})).sort((a,b)=>a.asset_id.localeCompare(b.asset_id))}));
  const identity={character_id:version.character_id,character_type:'rigged',display_name:'CP2 Image-Backed Teacher Demo'},storage={async getCharacter(){return identity;},async getCharacterVersion(){return{...version,assets:new Map([[asset_id,blob]])};}},document=riggedDocument('breathe');document.scenes[0].root.children[0].geometry.character_version_checksum=version.content_checksum;
  const bundle=await createVisualDslV3CharacterBundle(document,storage),directory={async getFileHandle(){return{async getFile(){return new Blob([JSON.stringify(bundle)]);}};}},loaded=await readVisualDslV3CharacterBundle(directory);
  assert.equal(bundle.bundle_type,'lam-published-character-dependencies');assert(loaded.has(`${version.character_id}@${version.version}`));assert.equal(loaded.get(`${version.character_id}@${version.version}`).identity.character_type,'rigged');
});

test('V3 preview shows loading while post-export Sprite preparation is pending instead of drawing a transient preflight error', async () => {
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert(app.includes('ensurePreviewCharacterAssets();const characterRefs=collectVisualDslV3CharacterReferences(project.visualDslV3)'));
  assert(app.includes('characterRefs.length&&!prepared&&pendingCharacterPreparation){paintVisualDslLoading(canvas);return null;}'));
});
