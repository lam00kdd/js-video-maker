import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { SPRITE_CORE_POSE_CATALOG, SPRITE_CORE_POSE_IDS, SPRITE_POSE_CATALOG, buildSpriteMasterPrompt, buildSpritePosePrompt, collectSpriteAssetReferences, createSpriteProductionDefinition, diagnoseSpritePoseLibrary, importSpriteMaster, importSpritePose, approveSpriteMaster, approveSpritePose, inspectSpritePng, normalizeSpriteProductionDefinition, resetSpriteAlignment, resolveSpriteDrawPlacement } from '../src/render/character-sprite-workflow.js';

const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC','base64');
const id=async data=>'libsha256_'+Array.from(new Uint8Array(await webcrypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
const image=(transparency='transparent')=>({width:128,height:256,transparency});

test('Master prompt is deterministic, appearance-driven, and separate from M1 rig vocabulary',()=>{
 const sprite=createSpriteProductionDefinition(undefined,{character_name:'Mina',role_or_profession:'teacher',hair_and_face:'curly black hair and round glasses',outfit:'teal lab coat',color_palette:'teal and cream',accessories:'small badge'});const first=buildSpriteMasterPrompt(sprite.identity);
 assert.equal(first,buildSpriteMasterPrompt(sprite.identity));assert.match(first,/Modern Educational Cartoon/);assert.match(first,/full-body/);assert.match(first,/transparent margins/);assert.match(first,/curly black hair/);assert.match(first,/teal lab coat/);assert.match(first,/No environment/);assert.doesNotMatch(first,/M1|rig profile|joint|pivot|bone vocabulary/i);
});

test('pose prompts require the approved reference and preserve identity with explicit anatomical left/right',()=>{
 let sprite=createSpriteProductionDefinition(undefined,{character_name:'Mina',role_or_profession:'teacher',hair_and_face:'curly black hair',outfit:'teal lab coat',color_palette:'teal'});sprite=importSpriteMaster(sprite,image(),{asset_id:'libsha256_'+'a'.repeat(64)});sprite=approveSpriteMaster(sprite);
 const point=buildSpritePosePrompt(sprite,'point');assert.match(point,/Attach the approved Master Character image as the reference image/);assert.match(point,/revision 1/);assert.match(point,/anatomical left arm \(screen-right\)/);assert.match(point,/character’s own body sides/);assert.match(point,/teal lab coat/);assert.match(point,/does not transmit the Master image automatically/);assert.doesNotMatch(point,/new jacket|new hat|M1 rig/i);
 assert.deepEqual(['idle','greet','point','explain'].map(pose=>buildSpritePosePrompt(sprite,pose).includes('Attach the approved Master Character image')), [true,true,true,true]);
});

test('registry exposes twelve stable core poses and keeps point as a distinct legacy entry',()=>{
 assert.equal(SPRITE_CORE_POSE_CATALOG.length,12);assert.equal(new Set(SPRITE_CORE_POSE_IDS).size,12);assert.deepEqual(SPRITE_CORE_POSE_IDS,['idle','greet','explain','point_left','point_right','present_left','present_right','thinking','question','emphasize','like','heart']);assert(SPRITE_POSE_CATALOG.some(item=>item.pose_id==='point'&&item.category==='Legacy'));assert(!SPRITE_CORE_POSE_IDS.includes('point'));
 const sprite=normalizeSpriteProductionDefinition(createSpriteProductionDefinition());assert.equal(sprite.poses.length,13);assert(SPRITE_CORE_POSE_IDS.every(id=>sprite.poses.some(item=>item.pose_id===id)));assert.equal(sprite.poses.find(item=>item.pose_id==='point').asset_ref,'/assets/character-sprites/lam-educator/point.svg');assert(sprite.poses.filter(item=>!['idle','greet','point','explain'].includes(item.pose_id)).every(item=>!item.asset_id&&!item.demo&&item.review_status==='needs_review'));
});

test('all twelve prompts are deterministic, Master-referenced, and directional poses name screen sides',()=>{
 let sprite=createSpriteProductionDefinition(undefined,{character_name:'Linh',role_or_profession:'teacher',hair_and_face:'short dark hair',outfit:'blue jacket',color_palette:'blue and cream'});sprite=approveSpriteMaster(importSpriteMaster(sprite,image(),{asset_id:'libsha256_'+'a'.repeat(64)}));
 for(const poseId of SPRITE_CORE_POSE_IDS){const prompt=buildSpritePosePrompt(sprite,poseId);assert.equal(prompt,buildSpritePosePrompt(sprite,poseId));assert.match(prompt,/approved Sprite Master Character, revision 1/);assert.match(prompt,/Attach the approved Master Character image as the reference image/);assert.match(prompt,/blue jacket/);assert.match(prompt,/No automatic.*|does not transmit the Master image automatically/i);}
 for(const [poseId,side] of [['point_left','screen-left'],['point_right','screen-right'],['present_left','screen-left'],['present_right','screen-right']])assert.match(SPRITE_CORE_POSE_CATALOG.find(item=>item.pose_id===poseId).action,new RegExp(side));
 assert.match(buildSpritePosePrompt(sprite,'point_left'),/do not mirror the character/i);assert.match(buildSpritePosePrompt(sprite,'point_right'),/screen-right/);assert.throws(()=>buildSpritePosePrompt(sprite,'walk'),/Unsupported Sprite pose/);assert.throws(()=>buildSpritePosePrompt(createSpriteProductionDefinition(),'like'),/Approve a Master/);
});

test('new poses import, align and approve without changing the legacy point image',()=>{
 let sprite=createSpriteProductionDefinition();sprite=approveSpriteMaster(importSpriteMaster(sprite,image(),{asset_id:'libsha256_'+'a'.repeat(64)}));sprite=importSpritePose(sprite,'point_left',image(),{asset_id:'libsha256_'+'b'.repeat(64)});sprite=approveSpritePose(sprite,'point_left');const point=sprite.poses.find(item=>item.pose_id==='point');assert.equal(point.demo,true);assert.equal(point.asset_ref,'/assets/character-sprites/lam-educator/point.svg');const left=sprite.poses.find(item=>item.pose_id==='point_left');assert.equal(left.review_status,'approved');assert.equal(left.source_master_revision,1);assert.equal(left.source_master_asset_id,'libsha256_'+'a'.repeat(64));
});

test('PNG import validates signature, decoding, limits and reports opaque backgrounds',async()=>{
 const file=new Blob([bytes],{type:'image/png'});const inspection=await inspectSpritePng(file,{decodeImage:async()=>({width:1,height:1,alpha:new Uint8Array([255])})});assert.equal(inspection.transparency,'opaque');assert.equal(inspection.width,1);
 await assert.rejects(()=>inspectSpritePng(new Blob(['bad'],{type:'image/png'}),{decodeImage:async()=>({width:1,height:1,alpha:new Uint8Array([255])})}),/signature/);
 await assert.rejects(()=>inspectSpritePng(new Blob([bytes],{type:'image/jpeg'})),/Only PNG/);
 await assert.rejects(()=>inspectSpritePng(file,{decodeImage:async()=>({width:2,height:1,alpha:new Uint8Array([255])})}),/dimensions do not match/);
 await assert.rejects(()=>inspectSpritePng(file,{decodeImage:async()=>({width:1,height:1,alpha:new Uint8Array([0])})}),/no visible pixels/);
});

test('Master approval is explicit; replacement preserves revisions and invalidates affected pose review',()=>{
 let sprite=createSpriteProductionDefinition();assert.equal(diagnoseSpritePoseLibrary(sprite)[0].code,'master_missing');
 sprite=importSpriteMaster(sprite,image('opaque'),{asset_id:'libsha256_'+'a'.repeat(64)});assert.equal(sprite.master.status,'needs_review');assert.throws(()=>approveSpriteMaster(sprite),/Review it explicitly/);
 sprite=approveSpriteMaster(sprite,{reviewOpaque:true,now:'2026-01-01T00:00:00.000Z'});assert.equal(sprite.master.status,'approved');assert.equal(sprite.master.revisions[0].status,'approved');
 sprite=importSpritePose(sprite,'greet',image(),{asset_id:'libsha256_'+'b'.repeat(64)});sprite=approveSpritePose(sprite,'greet');assert.equal(sprite.poses.find(p=>p.pose_id==='greet').review_status,'approved');
 sprite=importSpriteMaster(sprite,image(),{asset_id:'libsha256_'+'c'.repeat(64)});assert.equal(sprite.master.revisions.length,2);assert.equal(sprite.master.revisions[0].asset_id,'libsha256_'+'a'.repeat(64));assert.equal(sprite.poses.find(p=>p.pose_id==='greet').asset_id,'libsha256_'+'b'.repeat(64));assert.equal(sprite.poses.find(p=>p.pose_id==='greet').review_status,'needs_review');assert.equal(sprite.poses.find(p=>p.pose_id==='greet').source_master_revision,1);
 assert(collectSpriteAssetReferences(sprite).includes('libsha256_'+'a'.repeat(64)));assert(collectSpriteAssetReferences(sprite).includes('libsha256_'+'b'.repeat(64)));
});

test('pose import requires approved Master; replacement affects only selected pose; alignment stays uniform and resettable',()=>{
 let sprite=createSpriteProductionDefinition();assert.throws(()=>importSpritePose(sprite,'point',image(),{asset_id:'libsha256_'+'d'.repeat(64)}),/Approve the current Master/);
 sprite=approveSpriteMaster(importSpriteMaster(sprite,image(),{asset_id:'libsha256_'+'a'.repeat(64)}));sprite=importSpritePose(sprite,'point',image(),{asset_id:'libsha256_'+'d'.repeat(64)});const oldGreet=sprite.poses.find(p=>p.pose_id==='greet').asset_id; sprite=importSpritePose(sprite,'point',image('opaque'),{asset_id:'libsha256_'+'e'.repeat(64)});assert.equal(sprite.poses.find(p=>p.pose_id==='greet').asset_id,oldGreet);assert.equal(sprite.poses.find(p=>p.pose_id==='point').review_status,'needs_review');
 assert.deepEqual(resetSpriteAlignment(),{offset_x:0,offset_y:0,scale:1});const placement=resolveSpriteDrawPlacement({width:200,height:400,anchor:{x:.5,y:.94},alignment:{offset_x:.1,offset_y:0,scale:1.2},stageWidth:256,stageHeight:384});assert(Math.abs(placement.width/placement.height-.5)<1e-9);assert.equal(placement.registration.x,153.6);assert.throws(()=>resolveSpriteDrawPlacement({width:200,height:400,anchor:{x:.5,y:.94},alignment:{scale:0},stageWidth:256,stageHeight:384}),/alignment.scale/);
});

test('legacy CP4.1 Sprite definitions normalize and retain all four demo assets plus missing core slots',()=>{
 const sprite=normalizeSpriteProductionDefinition(createSpriteProductionDefinition());assert.equal(sprite.poses.length,13);assert(sprite.poses.filter(pose=>['idle','greet','point','explain'].includes(pose.pose_id)).every(pose=>pose.demo&&pose.asset_ref.endsWith('.svg')));assert.equal(sprite.master.status,'missing');
});
