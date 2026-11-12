import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createVisualDslV3Project,resolveVisualDslV3ProjectScene} from '../src/render/visual-dsl-v3-project.js';
import {evaluateVisualDslV3Scene} from '../src/visual-dsl-v3.js';
import {renderVisualDslV3Frame} from '../src/render/visual-dsl-v3-frame.js';
import {exportFrameCount,exportFrameLocation,exportFrameTime} from '../src/render/export-frame-clock.js';

const fixture=async name=>JSON.parse(await readFile(new URL(`../examples/visual_dsl_v3/${name}`,import.meta.url),'utf8'));

test('v3 project staging preserves normalized scenes, exact duration, voice/subtitle settings, metadata, and both independent variants',async()=>{
 const source=await fixture('scientific_pump_animated_r1.json');source.voice={voice_id:'bao_kim',rate:.9,auto_generate:false};source.subtitles={enabled:true,size:'large',karaoke:false};source.metadata={youtube:{title:'Pump'},social_post:{caption:'Lesson'}};const before=JSON.stringify(source),staged=createVisualDslV3Project(source,{baseProject:{title:'Old project',scenes:[]},sourceFileName:'pump.json'}),project=staged.project;
 assert.equal(staged.hasVariants,true);assert.equal(project.motionMode,'visualdslv3');assert.equal(project.title,source.title);assert.equal(project.visualDslV3.visual_dsl_version,3);assert.equal(project.scenes[0].duration,source.variants.landscape.scenes[0].duration_seconds);assert.equal(project.scenes[0].narration,source.variants.landscape.scenes[0].narration);assert.equal(project.scenes[0].voice.voiceId,'bao_kim');assert.equal(project.scenes[0].voice.rate,.9);assert.equal(project.scenes[0].voice.autoGenerate,false);assert.equal(project.scenes[0].subtitleSize,'large');assert.equal(project.captionsEnabled,true);assert.equal(project.karaokeCaptions,false);assert.equal(project.youtube.title,'Pump');assert.equal(project.socialPost.caption,'Lesson');assert.equal(project.variants.landscape[0].visualDslV3Ref.variant,'landscape');assert.equal(project.variants.portrait[0].visualDslV3Ref.variant,'portrait');assert.notEqual(project.variants.landscape[0].visualDslV3Ref.sceneId,project.variants.portrait[0].visualDslV3Ref.sceneId);assert.equal(resolveVisualDslV3ProjectScene(project,project.variants.portrait[0]).stage.height,1600);assert.equal(JSON.stringify(source),before);
});

test('invalid v3 staging fails before it can mutate the active project; the v3 marker never falls back to legacy conversion',async()=>{
 const active={title:'Untouched',sentinel:{value:7}},before=structuredClone(active),source=await fixture('scientific_pump_animated_r1.json');source.variants.portrait.scenes[0].timeline.tracks[0].target_id='missing-node';assert.throws(()=>createVisualDslV3Project(source,{baseProject:active}),/target|Target/i);assert.deepEqual(active,before);assert.equal(active.title,'Untouched');
});

test('shared v3 frame adapter resolves landscape and portrait variants and matches explicit evaluator state at any timestamp',async()=>{
 const source=await fixture('scientific_pump_animated_r1.json'),staged=createVisualDslV3Project(source),calls=[];
 const ctx={canvas:null,globalAlpha:1,fillStyle:'#000',strokeStyle:'#000',lineWidth:1,save(){},restore(){},setTransform(){},getTransform(){return{a:1,b:0,c:0,d:1,e:0,f:0}},clearRect(){},fillRect(){},beginPath(){},rect(){},clip(){},translate(){},scale(){},rotate(){},moveTo(){},lineTo(){},bezierCurveTo(){},quadraticCurveTo(){},closePath(){},stroke(){calls.push('stroke')},fill(){},arc(){},ellipse(){},fillText(){},strokeText(){},drawImage(){},measureText(s){return{width:s.length*8}},createLinearGradient(){return{addColorStop(){}}},createRadialGradient(){return{addColorStop(){}}}},createCanvas=(width,height)=>{const layerCtx={...ctx},layer={width,height,getContext(){return layerCtx;}};layerCtx.canvas=layer;return layer;};
 for(const portrait of [false,true]){const candidate=createVisualDslV3Project(source,{portrait}),scene=candidate.project.scenes[0],normalized=resolveVisualDslV3ProjectScene(candidate.project,scene),expected=evaluateVisualDslV3Scene(normalized,3.25),canvas={width:portrait?720:1280,height:portrait?1280:720,getContext(){return ctx;}};ctx.canvas=canvas;const result=renderVisualDslV3Frame(canvas,candidate.project.visualDslV3,scene.visualDslV3Ref.variant,scene.visualDslV3Ref.sceneId,3.25,{createCanvas});assert.deepEqual(result.evaluated.camera,expected.camera);assert.deepEqual(result.evaluated.root,expected.root);assert(calls.includes('stroke'));assert.equal(result.scene.id,normalized.id);assert.deepEqual(result.render.stage,portrait?{width:900,height:1600}:{width:1600,height:900});}
});

test('existing integer-frame MP4 clock maps fractional scene boundaries without gaps or negative local time',()=>{
 const source={visual_dsl_version:3,title:'Fractional timing',language:'vi-VN',aspect_ratio:'16:9',symbols:{},scenes:[{id:'a',title:'A',duration_seconds:1.01,narration:'Cảnh một.',stage:{width:1600,height:900},root:{id:'root-a',type:'group',children:[]}},{id:'b',title:'B',duration_seconds:1.03,narration:'Cảnh hai.',stage:{width:1600,height:900},root:{id:'root-b',type:'group',children:[]}}]},project=createVisualDslV3Project(source).project,count=exportFrameCount(2.04,24);
 assert.equal(count,49);assert.equal(exportFrameTime(24,24,2.04),1);assert.equal(exportFrameLocation(project,24,24,2.04).scene.id,project.scenes[0].id);const afterBoundary=exportFrameLocation(project,25,24,2.04);assert.equal(afterBoundary.scene.id,project.scenes[1].id);assert(afterBoundary.localTime>=0);assert(Math.abs(afterBoundary.localTime-(25/24-1.01))<1e-9);assert(exportFrameTime(count-1,24,2.04)<2.04);
});
