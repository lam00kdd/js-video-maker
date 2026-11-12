import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {identifyBatchScript,planBatchOutputs,sanitizeBatchFilenameBase,selectBatchProjectAspect} from '../src/render/batch-script-routing.js';
import {createVisualDslV3CanonicalExamples} from '../src/render/visual-dsl-v3-prompt.js';
import {createVisualDslV3Project,resolveVisualDslV3ProjectScene} from '../src/render/visual-dsl-v3-project.js';

test('batch dispatch keeps v1/v2 on legacy routing and rejects unknown explicit versions',()=>{
 assert.equal(identifyBatchScript({visual_dsl_version:1,scenes:[]}), 'legacy');
 assert.equal(identifyBatchScript({visual_dsl_version:2,scenes:[]}), 'legacy');
 assert.equal(identifyBatchScript({visual_dsl_version:3,scenes:[]}), 'visualdslv3');
 assert.throws(()=>identifyBatchScript({visual_dsl_version:4,scenes:[]}),/Không hỗ trợ visual_dsl_version 4/);
 assert.throws(()=>identifyBatchScript({visual_dsl_version:null,scenes:[]}),/Không hỗ trợ visual_dsl_version null/);
});

test('the batch app binds the v3 normalizer used by its preflight path',async()=>{
 const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
 assert.match(app,/import\s*\{[^}]*\bnormalizeVisualDslV3\b[^}]*\}\s*from\s*['"]\.\/visual-dsl-v3\.js['"]/);
 assert.match(app,/function preflightBatchScript\([^)]*\)[\s\S]*?normalizeVisualDslV3\(data\)/);
 assert.match(app,/selectBatchProjectAspect\(baseProject,key\)/);
 assert.doesNotMatch(app,/item\.parsed\.variants\[portrait\?'portrait':'landscape'\]\.scenes/);
});

test('batch output planning sanitizes filenames, follows declared v3 aspects and prevents intra-folder collisions',()=>{
 assert.equal(sanitizeBatchFilenameBase('../lesson?.json'),'-lesson-');
 const names=new Set(),both={motionMode:'visualdslv3',base:'lesson.json',visualDslV3:{aspect_ratio:'both'}};
 const planned=planBatchOutputs(both,'landscape','mp4',names);
 assert.deepEqual(planned.targets.map(([key])=>key),['landscape','portrait']);
 assert.deepEqual(planned.names,['lesson-16x9.mp4','lesson-9x16.mp4']);
 assert.throws(()=>planBatchOutputs(both,'both','mp4',names),/Trùng tên đầu ra/);
 const portrait=planBatchOutputs({motionMode:'visualdslv3',base:'vertical',visualDslV3:{aspect_ratio:'9:16'}},'landscape','mp4',new Set());
 assert.deepEqual(portrait.names,['vertical-9x16.mp4']);
});

test('aspect selection uses the staged portrait scenes instead of reusing landscape scenes',()=>{
 const landscape={id:'landscape-scene',narration:'Landscape composition',visualDslV3Ref:{variant:'landscape'}},portrait={id:'portrait-scene',narration:'Portrait composition',visualDslV3Ref:{variant:'portrait'}};
 const source={scenes:[landscape],variants:{landscape:[landscape],portrait:[portrait]},width:1920,height:1080};
 const vertical=selectBatchProjectAspect(source,'portrait'),horizontal=selectBatchProjectAspect(source,'landscape');
 assert.equal(vertical.scenes[0].id,'portrait-scene');assert.equal(vertical.scenes[0].visualDslV3Ref.variant,'portrait');assert.deepEqual([vertical.width,vertical.height],[720,1280]);
 assert.equal(horizontal.scenes[0].id,'landscape-scene');assert.deepEqual([horizontal.width,horizontal.height],[1920,1080]);
 assert.equal(source.scenes[0].id,'landscape-scene','selection must not mutate the staged project');
});

test('V3 folder batch stages the declared portrait scene ref and renders its portrait viewBox',()=>{
 const document=createVisualDslV3CanonicalExamples()['cp53a-both-aspects.json'];
 const base=createVisualDslV3Project(document,{portrait:false}).project;
 const staged=createVisualDslV3Project(document,{baseProject:base,portrait:true}).project;
 const portrait=selectBatchProjectAspect({...staged,variants:base.variants},'portrait');
 const scene=resolveVisualDslV3ProjectScene(portrait,portrait.scenes[0]);
 assert.equal(portrait.scenes[0].visualDslV3Ref.variant,'portrait');
 assert.equal(scene.stage.width,900);assert.equal(scene.stage.height,1600);
 assert.equal(scene.root.id,document.variants.portrait.scenes[0].root.id);
});

test('V3 batch uses fresh per-target staged variants, carries voice, and updates the active aspect before export',async()=>{
 const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
 assert.match(app,/shareVariantVoices\(staged\.variants,baseProject\.variants\)/);
 assert.match(app,/ratioPortrait=portrait;let blob;try\{blob=await exportSingleVideo\(requestedFormat,portrait\)/);
});
