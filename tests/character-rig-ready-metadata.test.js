import test from 'node:test';
import assert from 'node:assert/strict';
import { createRigReadyMetadataTemplates, createImportedRigReadyMetadata, updateRigReadyAnchor, validateRigReadyMetadata, verifyRigReadyMetadata } from '../src/render/character-rig-ready-metadata.js';
import { analyzeAlphaGeometry } from '../src/render/character-auto-assembly.js';
import { createCanonicalM1EditorRig } from '../src/render/character-rig-editor.js';
import { characterArtworkStages, generateCharacterArtworkStagePrompt, resolveArtworkPromptParts, groupArtworkPromptParts } from '../src/render/character-prompt-builder.js';
import { CharacterLibraryStorage } from '../src/render/character-library-storage.js';
import { FakeIndexedDB } from './support/fake-indexed-db.js';
import { webcrypto } from 'node:crypto';
import { canvasPointFromSource, sourcePointFromCanvas } from '../src/render/character-rig-editor.js';

function rgba(w,h,points){const data=new Uint8ClampedArray(w*h*4);for(const[x,y]of points)data[(y*w+x)*4+3]=255;return data;}
const asset={asset_id:'libsha256_'+'a'.repeat(64),sha256:'a'.repeat(64),width:32,height:100};

test('templates follow existing staged groups and M1 mapping without inventing pixel coordinates',()=>{
 const rig=createCanonicalM1EditorRig('rig_metadata'),all=resolveArtworkPromptParts({rig}),groups=groupArtworkPromptParts(all),parts=groups.arms,templates=createRigReadyMetadataTemplates({characterId:'char_lam',rigProfile:'adult',rig,parts,group:'arms'});
 assert.equal(characterArtworkStages.length,5);assert.deepEqual(templates.map(item=>item.part_id),parts.map(item=>item.part_id));assert.equal(templates.length,6);assert(templates.every(item=>item.group==='arms'&&item.character_id==='char_lam'&&item.proximal_anchor.x===null&&item.proximal_anchor.y===null&&item.validation_status==='missing'));
 assert.deepEqual(templates.find(item=>item.part_id==='left_forearm').distal_anchor.joint,'left_hand');assert.deepEqual(templates[0].coordinate_space,'source_image_px');
 const master=generateCharacterArtworkStagePrompt({workflow_stage:'master',role:'engineer',language:'en'}),arms=generateCharacterArtworkStagePrompt({workflow_stage:'arms',role:'engineer',rigProfile:'adult',rig,language:'en'});
 assert.equal(master.rig_ready_metadata_templates.length,0);assert.equal(arms.rig_ready_metadata_templates.length,6);assert.match(master.prompt,/front-facing in a neutral standing rest pose/);assert.match(arms.prompt,/RIG-READY ARTWORK INSTRUCTIONS/);assert.match(arms.prompt,/do not claim anchors or metadata are verified/);assert.match(arms.prompt,/source_image_px coordinates are measured only after import/);assert.equal(arms.parts.length,6);
});

test('PNG-derived metadata binds real asset geometry but remains a heuristic review candidate',()=>{
 const points=Array.from({length:60},(_,i)=>[15+(i%3),15+i]),geometry=analyzeAlphaGeometry({width:32,height:100,data:rgba(32,100,points)}),template=createRigReadyMetadataTemplates({parts:[{part_id:'left_upper_arm',joint_ids:['left_upper_arm','left_forearm']}],group:'arms'})[0],metadata=createImportedRigReadyMetadata(template,{asset,geometry});
 assert.equal(metadata.asset_checksum,asset.sha256);assert.deepEqual([metadata.source_width,metadata.source_height],[32,100]);assert.equal(metadata.orientation.observed,'vertical');assert.equal(metadata.provenance,'heuristic_estimate');assert.equal(metadata.validation_status,'candidate');assert(metadata.proximal_anchor.y<metadata.distal_anchor.y);assert.equal(validateRigReadyMetadata(metadata,{partId:'left_upper_arm',assetId:asset.asset_id,sha256:asset.sha256,width:asset.width,height:asset.height}).valid,true);
 const stale=validateRigReadyMetadata(metadata,{partId:'left_upper_arm',assetId:asset.asset_id,sha256:'b'.repeat(64),width:asset.width,height:asset.height});assert.equal(stale.valid,false);assert.match(stale.reasons.join(' '),/stale/);
});

test('manual calibration and explicit verification are tied to checksum, bounds, active M1 and profile',()=>{
 const rig=createCanonicalM1EditorRig('rig_verify'),geometry=analyzeAlphaGeometry({width:32,height:100,data:rgba(32,100,Array.from({length:60},(_,i)=>[15,15+i]))}),template=createRigReadyMetadataTemplates({rig,rigProfile:'adult',parts:[{part_id:'left_upper_arm',joint_ids:['left_upper_arm','left_forearm']}],group:'arms'})[0],candidate=createImportedRigReadyMetadata(template,{asset,geometry}),manual=updateRigReadyAnchor(updateRigReadyAnchor(candidate,'proximal_anchor',{x:15,y:15}),'distal_anchor',{x:15,y:74}),verified=verifyRigReadyMetadata(manual,asset,rig,'adult');
 assert.equal(verified.validation_status,'verified');assert.equal(verified.verified_asset_checksum,asset.sha256);assert.equal(verified.distal_anchor.status,'verified');
 assert.throws(()=>verifyRigReadyMetadata(verified,{...asset,sha256:'b'.repeat(64)},rig,'adult'),/stale/);assert.throws(()=>verifyRigReadyMetadata(verified,asset,rig,'student'),/Rig Profile/);
 assert.throws(()=>updateRigReadyAnchor(manual,'distal_anchor',{x:33,y:50}),/inside the source PNG/);
});

test('CP2 bone metadata requires horizontal source-X anchors; vertical artwork remains joint-bound',()=>{
 const horizontal=analyzeAlphaGeometry({width:100,height:32,data:rgba(100,32,Array.from({length:60},(_,i)=>[15+i,15+(i%3)]))}),template=createRigReadyMetadataTemplates({parts:[{part_id:'left_upper_arm',joint_ids:['left_upper_arm','left_forearm']}],group:'arms'})[0],assetWide={...asset,width:100,height:32},candidate=createImportedRigReadyMetadata(template,{asset:assetWide,geometry:horizontal});
 assert.equal(candidate.cp2_binding_mode,'bone');assert.equal(Math.abs(candidate.proximal_anchor.y-candidate.distal_anchor.y)<.5,true);assert.equal(validateRigReadyMetadata(candidate,{partId:'left_upper_arm',assetId:assetWide.asset_id,sha256:assetWide.sha256,width:assetWide.width,height:assetWide.height}).valid,true);
 const invalid=structuredClone(candidate);invalid.distal_anchor.y+=2;assert.equal(validateRigReadyMetadata(invalid,{partId:'left_upper_arm',assetId:assetWide.asset_id,sha256:assetWide.sha256,width:assetWide.width,height:assetWide.height}).valid,false);
});

test('single-anchor parts stay single-anchor and old records can generate a non-mutating template',()=>{
 const original={part_id:'head',joint_ids:['head']},template=createRigReadyMetadataTemplates({parts:[original],group:'head_body'})[0],candidate=createImportedRigReadyMetadata(template,{asset,geometry:null});
 assert.equal(candidate.distal_anchor,null);assert.equal(candidate.proximal_anchor.x,null);assert.equal(candidate.validation_status,'candidate');assert.deepEqual(original,{part_id:'head',joint_ids:['head']});
});

test('source-image guide coordinates round-trip through the same renderer geometry under fit, zoom, pan and DPR',()=>{
 const source={x:21.25,y:73.5},geometry={x:88,y:54,rotation:.31,pixelScaleX:2.2,pixelScaleY:2.2,sourceOriginX:0,sourceOriginY:0},devicePixelRatio=2,canvasPoint=canvasPointFromSource(source,geometry),cssPoint={x:canvasPoint.x/devicePixelRatio,y:canvasPoint.y/devicePixelRatio},backingPoint={x:cssPoint.x*devicePixelRatio,y:cssPoint.y*devicePixelRatio};
 const recovered=sourcePointFromCanvas(backingPoint,geometry);assert(Math.abs(recovered.x-source.x)<1e-9);assert(Math.abs(recovered.y-source.y)<1e-9);
});

test('asset replacement creates a stale-safe candidate and retains old confirmed metadata history',()=>{
 const template=createRigReadyMetadataTemplates({parts:[{part_id:'left_upper_arm',joint_ids:['left_upper_arm','left_forearm']}]} )[0],old=createImportedRigReadyMetadata(template,{asset,geometry:analyzeAlphaGeometry({width:32,height:100,data:rgba(32,100,Array.from({length:60},(_,i)=>[15,15+i]))})}),replacement={...asset,asset_id:'libsha256_'+'c'.repeat(64),sha256:'c'.repeat(64)},next=createImportedRigReadyMetadata(template,{asset:replacement,geometry:null,previous:{...old,validation_status:'verified'}});
 assert.equal(next.validation_status,'candidate');assert.equal(next.asset_checksum,replacement.sha256);assert.equal(next.proximal_anchor.x,null);assert.equal(next.metadata_history[0].validation_status,'verified');
});

test('calibrated metadata and asset checksum survive atomic draft save and reload',async()=>{
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC','base64'),hash=[...new Uint8Array(await webcrypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join(''),blob=new Blob([bytes],{type:'image/png'}),assetId='libsha256_'+hash,indexedDB=new FakeIndexedDB(),options={indexedDB,crypto:webcrypto,dbName:'rig-ready-metadata-reload',decodePng:async()=>({width:1,height:1})},storage=new CharacterLibraryStorage(options);
 await storage.createCharacter({character_id:'char_metadata_reload',display_name:'Metadata'});const sourceAsset={asset_id:assetId,sha256:hash,width:1,height:1},template=createRigReadyMetadataTemplates({characterId:'char_metadata_reload',rigProfile:'adult',parts:[{part_id:'left_upper_arm',joint_ids:['left_upper_arm','left_forearm']}]})[0],metadata=createImportedRigReadyMetadata(template,{asset:sourceAsset,geometry:null}),calibrated=updateRigReadyAnchor(updateRigReadyAnchor(metadata,'proximal_anchor',{x:.5,y:0}),'distal_anchor',{x:.5,y:1});
 await storage.saveCharacterDraft('char_metadata_reload',{display_name:'Metadata',rig_profile:'adult',artwork_parts:[{part_id:'left_upper_arm',asset_id:assetId,sha256:hash,width:1,height:1,rig_metadata:calibrated}],asset_refs:[assetId]},{assets:[{asset_id:assetId,blob}]});await storage.close();const reloaded=new CharacterLibraryStorage(options),draft=await reloaded.getCharacterDraft('char_metadata_reload');assert.deepEqual(draft.artwork_parts[0].rig_metadata,calibrated);assert.equal((await reloaded.getAsset(assetId)).sha256,hash);await reloaded.close();
});

console.log('CP3.3D rig-ready metadata contract tests passed.');
