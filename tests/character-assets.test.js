import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeObjectScene } from '../src/render/object-scene-schema.js';
import { normalizeProject } from '../src/project.js';
import { assertCharacterAssetsReady, clearCharacterAssetCache, normalizeCharacterAppearanceManifests, normalizeCharacterAssetLibrary, normalizeCharacterAssetPackage, prepareCharacterAssets } from '../src/render/character-assets.js';

const tinyPng='data:image/png;base64,iVBORw0KGgo=';
const base={version:2,coordinate_space:'normalized',objects:[{id:'anchor',type:'circle',geometry:{radius:.02}}]};
const packageData={assets:[{id:'img-head',mime_type:'image/png',data_url:tinyPng}],appearances:[{appearance_id:'image_demo',version:'1.0.0',backend:'image',rig_compatibility:{rig_semantics:'m1-human-rig',proportion_profile:'adult',required_joints:['root','head']},parts:[{id:'head',type:'image',asset_id:'img-head',source_dimensions_px:{width:256,height:320},size_rig_units:{width:.16,height:.20},alpha:true,opacity:1,binding:{joint_id:'head'},pivot:{space:'image_px',x:128,y:290},transform:{offset:{x:0,y:-.01},rotation:0,scale:1},z_index:40,visible:true,required:true,feature_bindings:{eye_left:'blink.left',eyelid_left:'blink.left'}}]}]};

test('image appearance schema keeps source pixels, rig units, references, alpha and optional features distinct',()=>{
 const normalized=normalizeCharacterAssetPackage(packageData),part=normalized.character_appearance_manifests[0].parts[0];
 assert.equal(part.asset_id,'img-head');assert.deepEqual(part.source_dimensions_px,{width:256,height:320});assert.deepEqual(part.size_rig_units,{width:.16,height:.20});assert.deepEqual(part.pivot,{space:'image_px',x:128,y:290});assert.deepEqual(part.transform.offset,{x:0,y:-.01});assert.equal(part.alpha,true);assert.equal(part.feature_bindings.eye_left,'blink.left');assert.equal(part.feature_bindings.eyelid_left,'blink.left');
 const scene=normalizeObjectScene({...base,...normalized});assert.deepEqual(scene.character_asset_library,normalized.character_asset_library);assert.deepEqual(scene.character_appearance_manifests,normalized.character_appearance_manifests);
 const saved=normalizeProject({scenes:[{duration:8,objectScene:{...base,...normalized}}]}).scenes[0].objectScene;assert.deepEqual(saved.character_asset_library,normalized.character_asset_library);assert.deepEqual(saved.character_appearance_manifests,normalized.character_appearance_manifests);assert.deepEqual(JSON.parse(JSON.stringify(saved)).character_asset_library,normalized.character_asset_library);
});

test('appearance validator rejects missing IDs, unsupported formats, invalid dimensions, pivots and rig bindings',()=>{
 assert.throws(()=>normalizeCharacterAssetLibrary({assets:[{id:'bad',mime_type:'image/jpeg',data_url:'data:image/jpeg;base64,AA=='}]}),/unsupported/);
 assert.throws(()=>normalizeCharacterAssetLibrary({assets:[{id:'bad',mime_type:'image/png',data_url:'/absolute/file.png'}]}),/data URL/);
 const missing=structuredClone(packageData.appearances);missing[0].parts[0].asset_id='missing';assert.throws(()=>normalizeCharacterAppearanceManifests(missing,normalizeCharacterAssetLibrary({assets:packageData.assets})),/missing from character_asset_library/);
 const invalid=structuredClone(packageData.appearances);invalid[0].parts[0].source_dimensions_px.width=0;assert.throws(()=>normalizeCharacterAppearanceManifests(invalid,normalizeCharacterAssetLibrary({assets:packageData.assets})),/source_dimensions_px.width/);
 const outside=structuredClone(packageData.appearances);outside[0].parts[0].pivot.x=257;assert.throws(()=>normalizeCharacterAppearanceManifests(outside,normalizeCharacterAssetLibrary({assets:packageData.assets})),/pivot.x/);
 const badJoint=structuredClone(packageData.appearances);badJoint[0].parts[0].binding.joint_id='nose';assert.throws(()=>normalizeCharacterAppearanceManifests(badJoint,normalizeCharacterAssetLibrary({assets:packageData.assets})),/joint_id/);
 const badAspect=structuredClone(packageData.appearances);badAspect[0].parts[0].size_rig_units={width:.2,height:.2};assert.throws(()=>normalizeCharacterAppearanceManifests(badAspect,normalizeCharacterAssetLibrary({assets:packageData.assets})),/preserve the PNG aspect ratio/);
 assert.throws(()=>normalizeObjectScene({...base,character_asset_library:{assets:[{id:'../bad',mime_type:'image/png',data_url:tinyPng}]}},8),/id is invalid/);
});

test('bone attachment pixels are validated in the source image and survive normalization',()=>{
 const candidateBase=structuredClone(packageData);candidateBase.appearances[0].rig_compatibility.required_joints=['root','head','left_upper_arm','left_forearm'];const sourcePart=candidateBase.appearances[0].parts[0];sourcePart.id='upper_arm';sourcePart.binding={from_joint_id:'left_upper_arm',to_joint_id:'left_forearm'};sourcePart.pivot={space:'image_px',x:24,y:44};
 const binding=sourcePart.binding;
 binding.attachment_points_px={from:{x:24,y:44},to:{x:192,y:44}};
 const normalized=normalizeCharacterAssetPackage(candidateBase),saved=normalized.character_appearance_manifests[0].parts.find(part=>part.id==='upper_arm').binding.attachment_points_px;
 assert.deepEqual(saved,{from:{x:24,y:44},to:{x:192,y:44}});
 for(const invalid of [{from:{x:24,y:44},to:{x:24,y:44}},{from:{x:24,y:10},to:{x:192,y:20}},{from:{x:-1,y:44},to:{x:192,y:44}}]){
  const candidate=structuredClone(candidateBase);candidate.appearances[0].parts.find(part=>part.id==='upper_arm').binding.attachment_points_px=invalid;
  assert.throws(()=>normalizeCharacterAssetPackage(candidate),/attachment|pivot/);
 }
});

test('asset readiness preloads required PNGs once, reports missing/invalid data, and gates readiness',async()=>{
 clearCharacterAssetCache();let decodes=0;const decodeImage=async()=>{decodes++;return{decoded:true,width:256,height:320};};const normalized=normalizeCharacterAssetPackage(packageData),appearance=normalized.character_appearance_manifests[0];
 const [first,second]=await Promise.all([prepareCharacterAssets(appearance,normalized.character_asset_library,{decodeImage}),prepareCharacterAssets(appearance,normalized.character_asset_library,{decodeImage})]);assert.equal(first.ready,true);assert.equal(second.ready,true);assert.equal(decodes,1);assert.equal(first.assets.get('img-head').decoded,true);assert.equal(assertCharacterAssetsReady(first),true);
 const missing=await prepareCharacterAssets(appearance,{assets:[]},{decodeImage});assert.equal(missing.ready,false);assert.equal(missing.diagnostics[0].code,'missing_asset');assert.throws(()=>assertCharacterAssetsReady(missing),/not ready/);
 clearCharacterAssetCache();const broken=await prepareCharacterAssets(appearance,normalized.character_asset_library,{decodeImage:async()=>{throw new Error('decode failed');}});assert.equal(broken.diagnostics[0].code,'invalid_image');assert.equal(broken.ready,false);clearCharacterAssetCache();
 const wrongSize=await prepareCharacterAssets(appearance,normalized.character_asset_library,{decodeImage:async()=>({width:10,height:10})});assert.equal(wrongSize.diagnostics[0].code,'source_dimensions_mismatch');assert.equal(wrongSize.ready,false);clearCharacterAssetCache();
});

test('optional missing parts warn without blocking required asset readiness',async()=>{
 const normalized=normalizeCharacterAssetPackage(packageData),appearance=structuredClone(normalized.character_appearance_manifests[0]);appearance.parts.push({...appearance.parts[0],id:'optional-hair',asset_id:'hair',required:false});const prepared=await prepareCharacterAssets(appearance,normalized.character_asset_library,{decodeImage:async()=>({width:256,height:320})});assert.equal(prepared.ready,true);assert(prepared.diagnostics.some(item=>item.code==='missing_optional_asset'&&item.severity==='warning'));
});

console.log('Character asset schema and lifecycle contract passed.');
