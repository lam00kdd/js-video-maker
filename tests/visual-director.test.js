import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveVisualDirectorContext,buildVisualDirectorPromptSection,visualDslV3CharacterCapability} from '../src/render/visual-director.js';
import {buildVisualDslV3SinglePromptWithAssets,buildVisualDslV3SeriesPromptWithAssets,createVisualDslV3ResourceExamples} from '../src/render/visual-dsl-v3-prompt.js';
import {validateVisualDslV3} from '../src/visual-dsl-v3.js';

const id=n=>`visual_${String(n).repeat(64)}`;
const asset=(n,subject='Inductive proximity sensor')=>({asset_id:id(n),title:subject,primary_subject:subject,description:'A real registered sensor image.',category_id:'industrial_automation',subcategory_id:'sensors',taxonomy_version:1,scientific_domain:'Industrial automation',visible_components:['sensing face','threaded housing'],source:'User-provided image',license:'User supplied',keywords_vi:['cảm biến'],aliases_en:['inductive sensor'],review_status:'verified',anchors:[{id:'mat_cam_bien',label:'Sensing face',description:'Front sensing surface',review_status:'human_reviewed'},{id:'guess',label:'AI guess',description:'Unreviewed location',review_status:'ai_suggested'}],spatial_fingerprint:'fnv1a32-1234abcd'});

test('shared resource resolver bounds and deduplicates exact registered identities and excludes AI-only anchors',()=>{
 const rows=[asset('a'),asset('b'),asset('c'),asset('d'),asset('e'),asset('a'),{...asset('f'),asset_id:'visual_not_a_hash'}];
 const context=resolveVisualDirectorContext({topic:'sensor',candidates:rows});
 assert.equal(context.assets.length,4);assert.equal(context.catalogTruncated,true);assert.deepEqual(context.eligibleAnchors.map(item=>item.id),['mat_cam_bien','mat_cam_bien','mat_cam_bien','mat_cam_bien']);assert.deepEqual(context.assets[0].visible_components,['sensing face','threaded housing']);assert.equal(context.assets[0].scientific_domain,'Industrial automation');assert.equal(context.assets[0].license,'User supplied');
 assert.ok(!context.candidates.some(item=>item.anchors.some(anchor=>anchor.id==='guess')));
});

test('shared Visual Director lists Rigged motions separately and REQUIRE accepts a verified Rigged revision',()=>{
 const teacher={character_id:'char_cp2_demo_teacher',character_type:'rigged',published_version:'1.0.1',published_checksum:'a'.repeat(64),display_name:'Published Teacher',available_motions:['idle','breathe','blink','teleport'],available_clips:[]};
 const context=resolveVisualDirectorContext({characterCandidates:[teacher],characterPolicy:'REQUIRE'}),section=buildVisualDirectorPromptSection(context);
 assert.equal(context.characterCandidates[0].character_type,'rigged');assert.deepEqual(context.characterCandidates[0].available_motions,['idle','breathe','blink']);assert.match(section,/motion_id/);assert.match(section,/available_motions/);assert.doesNotMatch(section,/"clip_id"/);
 assert.throws(()=>resolveVisualDirectorContext({characterCandidates:[],characterPolicy:'REQUIRE'}),/V3_CHARACTER_REQUIRED_MISSING/);
});

test('OFF anchor policy omits anchor IDs while retaining the shared resource policy',()=>{
 const context=resolveVisualDirectorContext({candidates:[asset('a')],anchorPolicy:'OFF'});
 assert.equal(context.eligibleAnchors.length,0);assert.equal(context.candidates[0].anchors.length,0);
 assert.match(buildVisualDirectorPromptSection(context),/Không dùng anchor_annotation/);
});

test('REQUIRE policies fail before producing an impossible V3 prompt',()=>{
 assert.throws(()=>resolveVisualDirectorContext({characterPolicy:'REQUIRE'}),/V3_CHARACTER_REQUIRED_MISSING/);
 assert.throws(()=>resolveVisualDirectorContext({topic:'capacitive sensor',assetPolicy:'REQUIRE_REGISTERED'}),/VISUAL_ASSET_REQUIRED_MISSING/);
 const realSprite={character_id:'char_teacher',character_type:'sprite',published_version:'1.0.2',published_checksum:'a'.repeat(64),display_name:'Teacher',available_clips:[{clip_id:'wave',fps:8,frame_count:8}]};
 const required=resolveVisualDirectorContext({characterPolicy:'REQUIRE',characterCandidates:[realSprite]});assert.equal(required.characterCandidates[0].character_id,'char_teacher');
 const prompt=buildVisualDirectorPromptSection(required);assert.match(prompt,/published_character/);assert.match(prompt,/wave/);
 assert.equal(visualDslV3CharacterCapability.supported,true);
 assert.equal(visualDslV3CharacterCapability.preview,true);
 assert.equal(visualDslV3CharacterCapability.mp4,true);
 assert.equal(visualDslV3CharacterCapability.batch,true);
});

test('single and series builders use the same visual direction, resource catalog, and V3 schema authority',()=>{
 const shared={topic:'Cảm biến tiệm cận điện cảm',audience:'Học viên kỹ thuật',assetCandidates:[asset('a')],includeAssetCatalog:true,characterPolicy:'PREFER',assetPolicy:'PREFER_LIBRARY',anchorPolicy:'REVIEWED_ONLY',compositionStyle:'SCIENTIFIC_HYBRID'};
 const single=buildVisualDslV3SinglePromptWithAssets({...shared});
 const series=buildVisualDslV3SeriesPromptWithAssets({...shared,episodeCount:2});
 for(const prompt of [single,series]){assert.match(prompt,/UNIFIED AI VISUAL DIRECTOR/);assert.match(prompt,/mat_cam_bien/);assert.match(prompt,/human_reviewed/);assert.match(prompt,/anchor_annotation/);assert.match(prompt,/visual_<listed sha256>/);assert.match(prompt,/Published Sprite và Rigged support: shared Preview\/MP4\/batch preparation/);assert.doesNotMatch(prompt,/"type"\s*:\s*"character"/);}
 assert.match(single,/SINGLE VIDEO/);assert.match(series,/MULTI-EPISODE/);
 const rigged={character_id:'char_cp2_demo_teacher',character_type:'rigged',published_version:'1.0.1',published_checksum:'b'.repeat(64),display_name:'Teacher',available_motions:['idle','breathe','blink']};
 const directed=[buildVisualDslV3SinglePromptWithAssets({topic:'sensor',audience:'learner',characterCandidates:[rigged],characterPolicy:'REQUIRE'}),buildVisualDslV3SeriesPromptWithAssets({topic:'sensor',audience:'learner',episodeCount:2,characterCandidates:[rigged],characterPolicy:'REQUIRE'})];for(const prompt of directed){assert.match(prompt,/char_cp2_demo_teacher/);assert.match(prompt,/"motion_id"/);assert.match(prompt,/"available_motions":\["idle","breathe","blink"\]/);assert.match(prompt,/"character_type":"rigged"/);assert.doesNotMatch(prompt,/"available_clips"/);}
});

test('image plus vector, reviewed-anchor callout and highlight examples are complete validator-valid V3 documents',()=>{
 const examples=createVisualDslV3ResourceExamples([asset('a')]);assert.deepEqual(examples.map(item=>item.kind),['image-plus-vector','image-plus-callout','image-plus-highlight','image-vector-anchor-hybrid']);
 for(const {document} of examples){assert.equal(validateVisualDslV3(document),true);assert.equal(document.scenes[0].root.type,'group');}
});

