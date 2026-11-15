import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCharacterAppearance, normalizeProceduralStyle, proceduralLookOptions } from '../src/render/character-appearances.js';
import { characterRigJointIds } from '../src/render/character-assets.js';
import { drawHumanCharacter } from '../src/render/object-scene-renderer.js';
import { normalizeHumanRig } from '../src/render/human-rig.js';
import { createCanonicalM1EditorRig } from '../src/render/character-rig-editor.js';
import { createProceduralAdultCharacter, resolveProceduralGeometryBounds } from '../src/render/character-procedural.js';

test('procedural adult geometry is deterministic, asset-free and bound only to canonical M1 joints',()=>{
 const first=createProceduralAdultCharacter(),second=createProceduralAdultCharacter();assert.deepEqual(first,second);assert.equal(first.profile,'adult');assert.deepEqual(first.diagnostics.joint_ids.sort(),[...characterRigJointIds].sort());assert.deepEqual(first.asset_refs,[]);assert.equal(first.diagnostics.asset_free,true);assert(first.diagnostics.primitive_count>=20);
 for(const part of first.geometry){assert(characterRigJointIds.includes(part.part_id));assert.equal(part.joint_id,part.attachment.joint_id);assert.equal(part.pivot.x,0);assert.equal(part.pivot.y,0);assert(part.shape.width>0&&part.shape.height>0);assert(part.render_bounds.width>0&&part.render_bounds.height>0);assert(Number.isInteger(part.z_index));}
 for(const id of ['head','neck','torso','pelvis','left_upper_arm','left_forearm','left_hand','right_upper_arm','right_forearm','right_hand','left_thigh','left_shin','left_foot','right_thigh','right_shin','right_foot'])assert(first.diagnostics.part_ids.includes(id));
});

test('arm and leg segment contracts share exact M1 articulation anchors and intentional overlap',()=>{
 const character=createProceduralAdultCharacter(),byId=new Map(character.geometry.map(item=>[item.primitive_id,item]));
 for(const [upper,lower,elbow] of [['teacher-arm-left-upper','teacher-arm-left-lower','left_forearm'],['teacher-arm-right-upper','teacher-arm-right-lower','right_forearm'],['teacher-leg-left-upper','teacher-leg-left-lower','left_shin'],['teacher-leg-right-upper','teacher-leg-right-lower','right_shin']]){
  const a=byId.get(upper),b=byId.get(lower),ca=a.limb_contract,cb=b.limb_contract;assert(ca&&cb);assert.equal(ca.distal_anchor.joint_id,elbow);assert.equal(cb.proximal_anchor.joint_id,elbow);assert.deepEqual(ca.distal_anchor.shared_joint_local,{x:0,y:0});assert.deepEqual(cb.proximal_anchor.local,{x:0,y:0});assert(ca.overlap.distal_rig_units>0&&cb.overlap.proximal_rig_units>0);assert.equal(a.pivot.joint_id,ca.proximal_anchor.joint_id);assert.equal(b.pivot.joint_id,elbow);assert(a.render_bounds.height>a.limb_contract.distal_anchor.local.y-ca.proximal_anchor.local.y);assert(b.z_index>=a.z_index);const delta=ca.distal_anchor.local,length=Math.hypot(delta.x,delta.y),axis={x:-Math.sin(a.local.rotation),y:Math.cos(a.local.rotation)};assert(Math.abs(axis.x-delta.x/length)<1e-9);assert(Math.abs(axis.y-delta.y/length)<1e-9);
 }
 for(const side of ['left','right']){const upper=byId.get(`teacher-arm-${side}-upper`),lower=byId.get(`teacher-arm-${side}-lower`),cap=byId.get(`teacher-elbow-${side}-cap`),knee=byId.get(`teacher-knee-${side}-cap`),shoulder=byId.get(`teacher-shoulder-${side}-bridge`),torso=byId.get('teacher-torso');assert(cap.joint_connector);assert.equal(cap.pivot.joint_id,`${side}_forearm`);assert(cap.z_index>lower.z_index&&lower.z_index>upper.z_index);assert(cap.shape.stroke_width<upper.shape.stroke_width);assert(knee.joint_connector);assert.equal(knee.pivot.joint_id,`${side}_shin`);assert.equal(shoulder.joint_connector.anchor_joint_id,`${side}_upper_arm`);assert.equal(shoulder.joint_id,'torso');assert(shoulder.z_index>torso.z_index);assert(shoulder.shape.width>upper.shape.width);}
});

test('shoulder bridges follow the exact M1 shoulder pivot and paint over the torso shoulder edge',()=>{
 const character=createProceduralAdultCharacter(),byId=new Map(character.geometry.map(item=>[item.primitive_id,item])),unit=640;
 for(const side of ['left','right']){const bridge=byId.get(`teacher-shoulder-${side}-bridge`),torso=character.pose.joints.torso,shoulder=character.pose.joints[`${side}_upper_arm`],dx=bridge.local.x*unit*torso.scale,dy=bridge.local.y*unit*torso.scale,c=Math.cos(torso.rotation),s=Math.sin(torso.rotation),center={x:torso.x+dx*c-dy*s,y:torso.y+dx*s+dy*c};assert(Math.hypot(center.x-shoulder.x,center.y-shoulder.y)<1e-6);assert(bridge.z_index>byId.get('teacher-torso').z_index);assert.equal(bridge.joint_connector.kind,'shoulder_bridge');}
});

test('both arm sides keep distal-to-proximal anchors joined at -60, -30, 0, +30 and +60 degrees',()=>{
 for(const side of ['left','right'])for(const jointId of [`${side}_upper_arm`,`${side}_forearm`])for(const degrees of [-60,-30,0,30,60]){
  const character=createProceduralAdultCharacter({testJointId:jointId,testRotation:degrees*Math.PI/180}),upper=character.geometry.find(item=>item.primitive_id===`teacher-arm-${side}-upper`),lower=character.geometry.find(item=>item.primitive_id===`teacher-arm-${side}-lower`),from=character.pose.joints[upper.limb_contract.proximal_anchor.joint_id],target=character.pose.joints[upper.limb_contract.distal_anchor.joint_id],dx=upper.limb_contract.distal_anchor.local.x*Math.min(640,720)*from.scale,dy=upper.limb_contract.distal_anchor.local.y*Math.min(640,720)*from.scale,c=Math.cos(from.rotation),s=Math.sin(from.rotation),x=from.x+dx*c-dy*s,y=from.y+dx*s+dy*c;
  assert(Math.hypot(x-target.x,y-target.y)<1e-6,`${side} ${jointId} at ${degrees} degrees lost its elbow anchor`);assert.equal(lower.limb_contract.proximal_anchor.joint_id,target.id);
 }
});

test('modern artwork stays inside the preview canvas at supported joint extremes',()=>{
 for(const side of ['left','right'])for(const joint of ['upper_arm','forearm','thigh','shin'])for(const degrees of [-60,-30,0,30,60]){const character=createProceduralAdultCharacter({style:{hair_style:'tied_back',shoe_style:'ankle_boot',uniform_pattern:'chest_badge'},testJointId:`${side}_${joint}`,testRotation:degrees*Math.PI/180}),bounds=resolveProceduralGeometryBounds(character);assert(Math.min(...bounds.map(item=>item.bounds.x))>=0,`${side}_${joint} ${degrees}° clips left`);assert(Math.max(...bounds.map(item=>item.bounds.x+item.bounds.width))<=640,`${side}_${joint} ${degrees}° clips right`);assert(Math.min(...bounds.map(item=>item.bounds.y))>=0,`${side}_${joint} ${degrees}° clips top`);assert(Math.max(...bounds.map(item=>item.bounds.y+item.bounds.height))<=720,`${side}_${joint} ${degrees}° clips bottom`);}
});

test('appearance palette changes drawing styles without changing the M1 skeleton or geometry scale',()=>{
 const rig=createCanonicalM1EditorRig('test_style'),before=structuredClone(rig),base=createProceduralAdultCharacter({rig}),changed=createProceduralAdultCharacter({rig,style:{skin:'#6b3f2a',hair:'#101820',shirt:'#1255aa',trousers:'#112244',shoe:'#f1c644',outline:'#090909',outline_width:.006}});
 assert.deepEqual(rig,before);assert.notDeepEqual(changed.appearance.parts.map(part=>part.fill),base.appearance.parts.map(part=>part.fill));const outlined=changed.appearance.parts.filter(part=>part.stroke&&part.stroke!=='none');assert(outlined.length>0&&outlined.every(part=>part.stroke==='#090909'));assert(base.geometry.every((part,index)=>part.shape.width===changed.geometry[index].shape.width&&part.shape.height===changed.geometry[index].shape.height));assert.throws(()=>createProceduralAdultCharacter({style:{shirt:'blue'}}),/RRGGBB/);
});

test('procedural appearance library provides deterministic hair styles bound to the head joint',()=>{
 const rig=createCanonicalM1EditorRig('hair_library'),before=structuredClone(rig),signatures=new Set();assert.equal(normalizeProceduralStyle({}).hair_style,'short_neat');
 for(const[id]of proceduralLookOptions.hair_style){const character=createProceduralAdultCharacter({rig,style:{hair_style:id}}),hair=character.geometry.filter(item=>item.primitive_id.startsWith('teacher-hair-'));assert(hair.length,`${id} creates hair geometry`);assert(hair.every(item=>item.joint_id==='head'&&item.pivot.joint_id==='head'));signatures.add(hair.map(item=>item.primitive_id).join('|'));}
 assert.equal(signatures.size,proceduralLookOptions.hair_style.length);assert.deepEqual(rig,before);assert.throws(()=>normalizeProceduralStyle({hair_style:'made_up'}),/Unsupported hair_style/);
});

test('shoe library variants stay attached to both M1 feet and uniform patterns stay on torso or sleeve joints',()=>{
 const rig=createCanonicalM1EditorRig('appearance_library'),before=structuredClone(rig),shoeSignatures=new Set();for(const[id]of proceduralLookOptions.shoe_style){const character=createProceduralAdultCharacter({rig,style:{shoe_style:id}}),shoes=character.geometry.filter(item=>item.primitive_id.startsWith('teacher-shoe-'));assert(shoes.some(item=>item.joint_id==='left_foot'));assert(shoes.some(item=>item.joint_id==='right_foot'));assert(shoes.every(item=>['left_foot','right_foot'].includes(item.pivot.joint_id)));shoeSignatures.add(shoes.map(item=>`${item.primitive_id}:${item.shape.type}:${item.shape.width}:${item.shape.height}`).join('|'));}assert.equal(shoeSignatures.size,proceduralLookOptions.shoe_style.length);
 for(const[id]of proceduralLookOptions.uniform_pattern){const character=createProceduralAdultCharacter({rig,style:{uniform_pattern:id}}),details=character.geometry.filter(item=>item.primitive_id.startsWith('teacher-uniform-'));if(id==='plain')assert.equal(details.length,0);else assert(details.length>0);for(const part of details)assert(['torso','left_upper_arm','right_upper_arm'].includes(part.joint_id));}assert.deepEqual(rig,before);assert.throws(()=>normalizeProceduralStyle({shoe_style:'roller_skates'}),/Unsupported shoe_style/);assert.throws(()=>normalizeProceduralStyle({uniform_pattern:'camouflage'}),/Unsupported uniform_pattern/);
});

test('badge and tied-back hair details stay restrained in size and bound to M1',()=>{
 const rig=createCanonicalM1EditorRig('polished_details'),appearance=buildCharacterAppearance('cartoon_teacher',rig,{style:normalizeProceduralStyle({uniform_pattern:'chest_badge',hair_style:'tied_back'})}),badge=appearance.parts.find(item=>item.id==='teacher-uniform-badge-patch'),emblem=appearance.parts.find(item=>item.id==='teacher-uniform-badge-emblem'),ponytail=appearance.parts.find(item=>item.id==='teacher-hair-ponytail');assert(badge&&emblem&&ponytail);assert.equal(badge.joint_id,'torso');assert.equal(emblem.joint_id,'torso');assert.equal(badge.type,'rounded_rect');assert(badge.width<.04&&badge.height<.05);assert(emblem.width<badge.width/2);assert.equal(ponytail.joint_id,'head');assert(ponytail.width<.05&&ponytail.height<.09);
});

test('procedural pivots and render bounds resolve against posed M1 joints',()=>{
 const character=createProceduralAdultCharacter(),resolved=resolveProceduralGeometryBounds(character);assert.equal(resolved.length,character.geometry.length);assert(resolved.every(item=>item.status==='ready'&&item.bounds.width>0&&item.bounds.height>0&&Number.isFinite(item.rotation)));const head=resolved.find(item=>item.part_id==='head');assert(head);assert(Math.abs(head.center.x-character.pose.joints.head.x)<character.geometry.find(item=>item.part_id==='head').local.x*720+2);assert(Math.min(...resolved.map(item=>item.bounds.x))>=0);assert(Math.max(...resolved.map(item=>item.bounds.x+item.bounds.width))<=640);assert(Math.min(...resolved.map(item=>item.bounds.y))>=0);assert(Math.max(...resolved.map(item=>item.bounds.y+item.bounds.height))<=720);
});

test('CP2 vector draw path renders Bézier geometry without image draws',()=>{
 const calls=[],ctx=new Proxy({canvas:{width:640,height:720},globalAlpha:1},{get(target,key){if(key in target)return target[key];return(...args)=>calls.push([key,...args]);},set(target,key,value){target[key]=value;return true;}}),character=createProceduralAdultCharacter();drawHumanCharacter(ctx,character,640,720);assert(calls.some(([name])=>name==='ellipse'));assert(calls.some(([name])=>name==='bezierCurveTo'));assert(calls.some(([name])=>name==='quadraticCurveTo'));assert.equal(calls.some(([name])=>name==='drawImage'),false);
});

test('modern procedural silhouettes use finite normalized Bézier paths within the existing M1 part vocabulary',()=>{
 const rig=createCanonicalM1EditorRig('path_contract'),before=structuredClone(rig),character=createProceduralAdultCharacter({rig}),paths=character.appearance.parts.filter(part=>part.type==='path');assert(paths.length>=15);for(const item of paths){assert(characterRigJointIds.includes(item.joint_id));assert(item.commands.length>=2);for(const command of item.commands)for(const point of command.points){assert(Number.isFinite(point.x)&&Number.isFinite(point.y));assert(Math.abs(point.x)<=1&&Math.abs(point.y)<=1);}}assert.deepEqual(rig,before);
 const commands=paths[0].commands,valid={...rig,parts:[{id:'path-part',joint_id:'head',type:'path',offset:{x:0,y:0},rotation:0,width:.2,height:.2,fill:'#ffffff',stroke:'#000000',stroke_width:.002,z_index:1,commands}]};assert.equal(normalizeHumanRig(valid).parts[0].type,'path');const invalid=structuredClone(valid);invalid.parts[0].commands[0].points[0].x=2;assert.throws(()=>normalizeHumanRig(invalid),/normalized local bounds/);assert.equal(rig.joints.length,17);
});

test('idle and blink use existing Human Rig motion resolver while joint tests use the same rig',()=>{
 const rig=createCanonicalM1EditorRig('test_motion'),before=structuredClone(rig),rest=createProceduralAdultCharacter({rig}),idle=createProceduralAdultCharacter({rig,motion:'idle',time:1.25}),breathe=createProceduralAdultCharacter({rig,motion:'breathe',time:1.25}),blink=createProceduralAdultCharacter({rig,motion:'blink',time:2.1}),rotated=createProceduralAdultCharacter({rig,testJointId:'left_forearm',testRotation:.8});assert.notDeepEqual(idle.pose.joints,rest.pose.joints);assert.notDeepEqual(breathe.pose.joints,rest.pose.joints);assert.notEqual(blink.pose.facial.eyes_open,rest.pose.facial.eyes_open);assert.notEqual(rotated.pose.joints.left_forearm.rotation,rest.pose.joints.left_forearm.rotation);assert.deepEqual(rig,before);assert.throws(()=>createProceduralAdultCharacter({motion:'walk'}),/Unsupported/);
});

test('legacy draft data and imported artwork records are untouched by procedural preview creation',()=>{
 const legacyDraft={display_name:'Legacy',rig:{id:'legacy'},artwork_parts:[{part_id:'head',asset_id:'unchanged-png-reference'}]},before=structuredClone(legacyDraft),appearance=buildCharacterAppearance('cartoon_teacher',createCanonicalM1EditorRig());createProceduralAdultCharacter();assert(appearance.parts.length>0);assert.deepEqual(legacyDraft,before);
});
