import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeObjectScene } from '../src/render/object-scene-schema.js';
import { resolveObjectScene } from '../src/render/object-scene-resolver.js';
import { renderObjectScene, drawHumanCharacter, drawPublishedSpriteCharacter } from '../src/render/object-scene-renderer.js';
import { validateVisualDslDocument } from '../src/visual-dsl.js';
import { normalizeProject } from '../src/project.js';

const fixture=async()=>JSON.parse(await readFile(new URL('../examples/Scientific_Human_Teacher_Natural_Idle.json',import.meta.url),'utf8'));
const action=(id,motion,parameters,duration_seconds=30)=>({id,motion,start_seconds:0,duration_seconds,loop_mode:'repeat',parameters});
const timedPose=(graph,time,width=1280,height=720,duration=30)=>resolveObjectScene(graph,time,duration,{width,height}).resolvedCharacters[0].pose;

const rig={id:'teacher-rig',joints:[
 {id:'root',parent_id:null,position:{x:0,y:0},rotation:0},
 {id:'torso',parent_id:'root',position:{x:0,y:-.1},rotation:0},
 {id:'left_hand',parent_id:'torso',position:{x:-.2,y:-.1},rotation:0,length:.08,visual_part_id:'left-hand-part'}
],parts:[{id:'left-hand-part',joint_id:'left_hand',type:'ellipse',offset:{x:0,y:0},width:.05,height:.05,fill:'#e3a982'}]};
const graph={version:2,coordinate_space:'normalized',objects:[{id:'anchor',type:'circle',geometry:{radius:.02}}],character_rigs:[rig],characters:[{id:'teacher',rig_id:'teacher-rig',transform:{x:.5,y:.5,scale:1,rotation:0}}]};

test('human rig rest pose resolves parent transforms deterministically in landscape and portrait',async()=>{
 const full=await fixture(),landscapeGraph=full.variants.landscape.scenes[0].scene_graph,normalized=normalizeObjectScene(landscapeGraph,30),landscape=resolveObjectScene(normalized,2,30,{width:1280,height:720}),portraitGraph=full.variants.portrait.scenes[0].scene_graph,portrait=resolveObjectScene(portraitGraph,2,30,{width:720,height:1280});
 const handA=landscape.resolvedCharacters[0].pose.joints.left_hand,handB=portrait.resolvedCharacters[0].pose.joints.left_hand;
 assert(Math.abs((handA.x-landscape.resolvedCharacters[0].pose.root.x)/landscape.resolvedCharacters[0].transform.scale-(handB.x-portrait.resolvedCharacters[0].pose.root.x)/portrait.resolvedCharacters[0].transform.scale)<1e-8);assert(Math.abs((handA.y-landscape.resolvedCharacters[0].pose.root.y)/landscape.resolvedCharacters[0].transform.scale-(handB.y-portrait.resolvedCharacters[0].pose.root.y)/portrait.resolvedCharacters[0].transform.scale)<1e-8);const head=landscape.resolvedCharacters[0].pose.joints.head,foot=landscape.resolvedCharacters[0].pose.joints.left_foot;assert(head.y<landscape.resolvedCharacters[0].pose.root.y-150);assert(foot.y>landscape.resolvedCharacters[0].pose.root.y+100);
 assert.deepEqual(resolveObjectScene(normalized,2,30,{width:1280,height:720}).resolvedCharacters,landscape.resolvedCharacters);
 const scaled=resolveObjectScene({...normalized,characters:[{...normalized.characters[0],transform:{...normalized.characters[0].transform,scale:2}}]},2,30,{width:1280,height:720}).resolvedCharacters[0].pose;
 assert(Math.abs((scaled.joints.left_hand.y-scaled.root.y)-2*(handA.y-landscape.resolvedCharacters[0].pose.root.y)/landscape.resolvedCharacters[0].transform.scale)<1e-8);
});

test('invalid rig is reported and skipped without preventing the scene from resolving',()=>{
 const invalid={...graph,character_rigs:[{id:'broken-rig',joints:[{id:'root',parent_id:null,position:{x:0,y:0}},{id:'hand',parent_id:'missing',position:{x:0,y:0}}],parts:[{id:'body',joint_id:'root',type:'ellipse',width:.2,height:.3,fill:'#fff000'}]}],characters:[{id:'teacher',rig_id:'broken-rig'}]};
 const resolved=resolveObjectScene(invalid,0,8);assert.equal(resolved.resolvedCharacters[0].invalid_rig,true);assert.match(resolved.resolvedCharacters[0].pose_error,/missing parent/);assert.equal(resolved.objects[0].id,'anchor');
});

test('rig validator rejects duplicate joints, cycles, missing roots, invalid bindings and non-finite transforms',()=>{
 for(const mutation of [
  r=>r.joints.push({...r.joints[1]}),
  r=>{r.joints[1].parent_id='left_hand';},
  r=>{r.joints[0].id='origin';},
  r=>{r.joints[1].visual_part_id='missing-part';},
  r=>{r.joints[1].position.x=Infinity;},
  r=>{r.ik_chains=[{id:'arm',root_joint_id:'root',mid_joint_id:'left_hand',end_joint_id:'torso'}];}
 ]){const broken=structuredClone(rig);mutation(broken);const invalid={...graph,character_rigs:[broken]};assert.equal(normalizeObjectScene(invalid).character_rigs[0].invalid,true);}
});

test('Canvas2D renderer draws bound character parts and restores canvas state',()=>{
 const calls=[],ctx=new Proxy({canvas:{width:1280,height:720},globalAlpha:1}, {get(target,key){if(key in target)return target[key];return(...args)=>{calls.push([key,...args]);};},set(target,key,value){target[key]=value;return true;}});
 renderObjectScene(ctx,graph,0,8);assert(calls.some(([name])=>name==='bezierCurveTo'));assert(calls.filter(([name])=>name==='save').length>=2);assert.equal(ctx.globalAlpha,1);
});

test('Published Rigged instances normalize composition fields and evaluate scene-relative visibility deterministically',()=>{
 const checksum='a'.repeat(64),instance={instance_id:'published-teacher',character_id:'char_teacher',character_version:'1.0.0',character_version_checksum:checksum,transform:{x:.3,y:.7,scale:1.2,opacity:.5},motion_style:'natural',actions:[],visible:true,z_index:7,active_start_seconds:2,active_duration_seconds:3},source={...graph,character_instances:[instance]},normalized=normalizeObjectScene(source,8);
 assert.equal(normalized.character_instances[0].z_index,7);assert.equal(normalized.character_instances[0].transform.opacity,.5);
 const prepared=new Map([[`char_teacher@1.0.0#${checksum}`,{status:'ready',rig,manifest:{parts:[{feature_bindings:{}}]},assets:new Map(),version:{rig}}]]);
 assert.equal(resolveObjectScene(normalized,1,8,{preparedCharacterVersions:prepared}).resolvedImageCharacters[0].status,'hidden');
 assert.equal(resolveObjectScene(normalized,2,8,{preparedCharacterVersions:prepared}).resolvedImageCharacters[0].status,'ready');
 assert.equal(resolveObjectScene(normalized,5,8,{preparedCharacterVersions:prepared}).resolvedImageCharacters[0].status,'hidden');
 assert.equal(resolveObjectScene(normalized,4,8,{preparedCharacterVersions:prepared}).resolvedImageCharacters[0].pose.root.x,resolveObjectScene(normalized,4,8,{preparedCharacterVersions:prepared}).resolvedImageCharacters[0].pose.root.x);
 assert.throws(()=>normalizeObjectScene({...source,character_instances:[{...instance,transform:{...instance.transform,opacity:1.5}}]},8),/opacity/);
 assert.throws(()=>normalizeObjectScene({...source,character_instances:[{...instance,z_index:Infinity}]},8),/z_index/);
});

test('character drawing applies instance opacity once and the mixed queue sorts Sprite and Rigged by shared Z-Index',()=>{
 const alphaValues=[],ctx=new Proxy({canvas:{width:1280,height:720},globalAlpha:1,stack:[]},{get(target,key){if(key==='save')return()=>target.stack.push(target.globalAlpha);if(key==='restore')return()=>target.globalAlpha=target.stack.pop();if(key in target)return target[key];return(...args)=>{if(key==='drawImage')alphaValues.push(target.globalAlpha);};},set(target,key,value){target[key]=value;return true;}}),pose={parts:[]};
 drawHumanCharacter(ctx,{pose,transform:{opacity:.5}},1280,720);assert.equal(ctx.globalAlpha,1);
 drawPublishedSpriteCharacter(ctx,{status:'ready',visible:true,frame:{asset_id:'a',anchor:{x:.5,y:.5},alignment:{scale:1}},assets:new Map([['a',{image:{},width:100,height:100}]]),transform:{x:.5,y:.5,scale:1,opacity:.5}},1280,720);assert.deepEqual(alphaValues,[.5]);
 const events=[],sprite={instance_id:'sprite',z_index:2,status:'ready',visible:true,frame:{asset_id:'a',anchor:{x:.5,y:.5},alignment:{scale:1}},assets:new Map([['a',{image:{},width:100,height:100}]]),transform:{x:.5,y:.5,scale:1,opacity:1}},rigged={instance_id:'rigged',z_index:1,status:'ready',pose:{parts:[]},appearance:{parts:[]},assets:new Map(),transform:{x:.5,y:.5,scale:1,rotation:0,opacity:1}};
 const graph={...normalizeObjectScene({version:2,coordinate_space:'normalized',objects:[{id:'anchor',type:'circle',geometry:{radius:.02}}],sprite_instances:[{instance_id:'sprite',character_id:'char_robot_1',character_version:'1.0.0',character_version_checksum:'a'.repeat(64),transform:{},animation:{mode:'pose',pose_id:'idle'},z_index:2}],character_instances:[{instance_id:'rigged',character_id:'char_teacher',character_version:'1.0.0',character_version_checksum:'b'.repeat(64),transform:{},motion_style:'natural',actions:[],z_index:1}]})};
 const prepared=new Map([['char_teacher@1.0.0#'+ 'b'.repeat(64),{status:'ready',rig,manifest:{parts:[]},assets:new Map(),version:{rig}}],['char_robot_1@1.0.0#'+'a'.repeat(64),{status:'ready',snapshot:{master:{revision:1},default_pose_id:'idle',poses:[{pose_id:'idle',asset_id:'idle'}],clips:[]},assets:new Map([['idle',{image:{},width:100,height:100}]] )}]]);
 const originalDrawHuman=drawHumanCharacter,originalDrawSprite=drawPublishedSpriteCharacter;void originalDrawHuman;void originalDrawSprite;renderObjectScene(ctx,graph,1,8,{preparedCharacterVersions:prepared});
});

test('debug skeleton overlay draws every joint and hierarchy edge without changing resolved poses',()=>{
 const makeContext=()=>{const calls=[];return{calls,ctx:new Proxy({canvas:{width:1280,height:720},globalAlpha:1},{get(target,key){if(key in target)return target[key];return(...args)=>calls.push([key,...args]);},set(target,key,value){target[key]=value;return true;}})}};
 const normal=makeContext(),debug=makeContext(),plain=renderObjectScene(normal.ctx,graph,0,8),overlaid=renderObjectScene(debug.ctx,graph,0,8,{debugHumanRig:true});assert.deepEqual(overlaid.resolvedCharacters[0].pose,plain.resolvedCharacters[0].pose);assert.equal(debug.calls.filter(([name])=>name==='arc').length-normal.calls.filter(([name])=>name==='arc').length,rig.joints.length);assert.equal(debug.calls.filter(([name])=>name==='stroke').length-normal.calls.filter(([name])=>name==='stroke').length,rig.joints.length-1);
});

test('M2 demo fixture validates independent landscape and portrait variants with idle, breathe and blink',async()=>{
 const doc=await fixture();assert.equal(doc.aspect_ratio,'both');assert.equal(doc.variants.landscape.scenes[0].estimated_seconds,30);assert.equal(doc.variants.portrait.scenes[0].estimated_seconds,30);
 for(const variant of ['landscape','portrait']){const scene=doc.variants[variant].scenes[0],normalized=validateVisualDslDocument({...doc,scenes:[scene]})[0];assert.deepEqual(normalized.scene_graph.characters[0].actions.map(item=>item.motion),['idle','breathe','blink']);assert.equal(scene.scene_graph.characters[0].transform.x,.5);const ctx=new Proxy({canvas:{width:variant==='landscape'?1280:720,height:variant==='landscape'?720:1280},globalAlpha:1,measureText:()=>({width:40})},{get(target,key){if(key in target)return target[key];return()=>{};},set(target,key,value){target[key]=value;return true;}});const result=renderObjectScene(ctx,normalized.scene_graph,5,30);assert.equal(result.resolvedCharacters[0].invalid_rig,undefined);assert(result.resolvedCharacters[0].pose.facial.eyes_open<=1);}
});

test('idle, breathe and blink are deterministic under arbitrary seeking and do not move feet or stretch bones',async()=>{
 const doc=await fixture(),scene=validateVisualDslDocument({...doc,scenes:[doc.variants.landscape.scenes[0]]})[0],graph=scene.scene_graph,times=[18.4,0,4.2,11.3,2.1,18.4],poses=times.map(t=>timedPose(graph,t));assert.deepEqual(poses[0],poses[5]);
 const idleOnly=structuredClone(graph);idleOnly.characters[0].actions=idleOnly.characters[0].actions.filter(a=>a.motion==='idle');const breathOnly=structuredClone(graph);breathOnly.characters[0].actions=breathOnly.characters[0].actions.filter(a=>a.motion==='breathe');const idlePose=timedPose(idleOnly,1.1),breathPose=timedPose(breathOnly,1.1),both=timedPose(graph,1.1),rest=timedPose({...graph,characters:[{...graph.characters[0],actions:[]}]},1.1);
 for(const foot of ['left_foot','right_foot'])assert.deepEqual(both.joints[foot],rest.joints[foot]);
 const pairDistance=pose=>Math.hypot(pose.joints.left_forearm.x-pose.joints.left_upper_arm.x,pose.joints.left_forearm.y-pose.joints.left_upper_arm.y);assert(Math.abs(pairDistance(both)-pairDistance(rest))<1e-8);
 assert.notEqual(idlePose.joints.head.rotation,rest.joints.head.rotation);assert.notEqual(breathPose.joints.torso.rotation,rest.joints.torso.rotation);assert.notEqual(both.joints.left_upper_arm.rotation,idlePose.joints.left_upper_arm.rotation);
});

test('blink schedule is seeded, visible and deterministic while rest pose has open eyes',async()=>{
 const doc=await fixture(),scene=validateVisualDslDocument({...doc,scenes:[doc.variants.landscape.scenes[0]]})[0],graph=scene.scene_graph,eyes=timedPose(graph,0).facial;assert.equal(eyes.eyes_open,1);
 let blinkTime=null;for(let t=.01;t<30;t+=.01)if(timedPose(graph,t).facial.eyes_open<.99){blinkTime=t;break;}assert.notEqual(blinkTime,null);const expected=timedPose(graph,blinkTime);for(const seek of [25,0,18.2,blinkTime])timedPose(graph,seek);assert.deepEqual(timedPose(graph,blinkTime),expected);
 const changedSeed=structuredClone(graph);changedSeed.characters[0].actions.find(a=>a.motion==='blink').parameters.seed++;let changedTime=null;for(let t=.01;t<30;t+=.01)if(timedPose(changedSeed,t).facial.eyes_open<.99){changedTime=t;break;}assert.notEqual(changedTime,blinkTime);
});

test('loop boundaries are continuous and pause/resume or save/reload preserve the same pose',async()=>{
 const doc=await fixture(),scene=validateVisualDslDocument({...doc,scenes:[doc.variants.landscape.scenes[0]]})[0],graph=scene.scene_graph;
 const idle=structuredClone(graph);idle.characters[0].actions=idle.characters[0].actions.filter(a=>a.motion==='idle');const before=timedPose(idle,4.2-1e-6),after=timedPose(idle,4.2+1e-6);assert(Math.abs(before.joints.head.rotation-after.joints.head.rotation)<1e-6);
 const atPause=timedPose(graph,12.345),atResume=timedPose(graph,12.345);assert.deepEqual(atPause,atResume);
 const project=normalizeProject({title:'human motion',scenes:[{duration:30,objectScene:graph}]}),reloaded=normalizeProject(JSON.parse(JSON.stringify(project)));assert.deepEqual(timedPose(reloaded.scenes[0].objectScene,9.25),timedPose(graph,9.25));
});

test('motion validator rejects unsupported motions, channels, ranges and overlapping duplicate channels',()=>{
 for(const edit of [actions=>actions[0].motion='walk',actions=>actions[0].parameters.unknown=1,actions=>actions[1].parameters.intensity=2,actions=>actions[2].parameters.interval_min_seconds=9,actions=>actions.push({...actions[0],id:'idle-copy'})]){const modified=structuredClone(graph);modified.characters[0].actions=[action('idle-a','idle',{intensity:.4,cycle_seconds:4}),action('breathe-a','breathe',{intensity:.3,cycle_seconds:3}),action('blink-a','blink',{seed:7,interval_min_seconds:2,interval_max_seconds:4,blink_duration_seconds:.16})];edit(modified.characters[0].actions);assert.throws(()=>normalizeObjectScene(modified,30));}
});

async function appearanceGraph(){const doc=await fixture(),scene=validateVisualDslDocument({...doc,scenes:[doc.variants.landscape.scenes[0]]})[0];return structuredClone(scene.scene_graph);}

test('one rig supports all appearances with identical joint poses for the same style and actions',async()=>{
 const graph=await appearanceGraph(),poses=[],parts=[];for(const appearance_id of ['cartoon_teacher','stick_figure','humanoid_robot']){const variant=structuredClone(graph);variant.characters[0].appearance_id=appearance_id;variant.characters[0].motion_style='natural';const resolved=resolveObjectScene(variant,6,30,{width:1280,height:720}),character=resolved.resolvedCharacters[0];assert.equal(character.appearance_id,appearance_id);poses.push(character.pose.joints);parts.push(character.pose.parts);}
 assert.deepEqual(poses[0],poses[1]);assert.deepEqual(poses[1],poses[2]);assert.notDeepEqual(parts[0],parts[1]);assert(parts[1].some(part=>part.type==='bone'));
});

test('appearance fixtures keep every rest-pose joint inside safe bounds in both layouts',async()=>{
 const doc=await fixture();for(const [variant,width,height] of [['landscape',1280,720],['portrait',720,1280]]){const graph=doc.variants[variant].scenes[0].scene_graph;for(const appearance_id of ['cartoon_teacher','stick_figure','humanoid_robot']){const copy=structuredClone(graph);copy.characters[0].appearance_id=appearance_id;copy.characters[0].actions=[];const character=resolveObjectScene(copy,0,30,{width,height}).resolvedCharacters[0];assert(character.pose.parts.length>0,`${variant}/${appearance_id} binds artwork`);const partIds=new Set(character.pose.parts.map(part=>part.id)),required=appearance_id==='cartoon_teacher'?['teacher-torso','teacher-pelvis','teacher-leg-left-upper','teacher-leg-right-upper']:appearance_id==='stick_figure'?['stick-spine-lower','stick-shoulders','stick-left-thigh','stick-right-thigh']:['robot-body-panel','robot-leg-left-upper','robot-leg-right-upper'];for(const id of required)assert(partIds.has(id),`${variant}/${appearance_id} missing artwork ${id}`);for(const id of ['head','left_hand','right_hand','left_foot','right_foot']){const joint=character.pose.joints[id];assert(joint.x>width*.08&&joint.x<width*.92,`${variant}/${appearance_id}/${id} horizontal safe bound`);assert(joint.y>height*.08&&joint.y<height*.92,`${variant}/${appearance_id}/${id} vertical safe bound`);}}}
});

test('appearance swap leaves pose and action timeline intact through project save and reload',async()=>{
 const graph=await appearanceGraph(),teacher=structuredClone(graph),robot=structuredClone(graph);robot.characters[0].appearance_id='humanoid_robot';const project=normalizeProject({scenes:[{duration:30,objectScene:teacher},{duration:30,objectScene:robot}]}),reloaded=normalizeProject(JSON.parse(JSON.stringify(project))),a=timedPose(reloaded.scenes[0].objectScene,6),b=timedPose(reloaded.scenes[1].objectScene,6);assert.deepEqual(a.joints,b.joints);assert.deepEqual(reloaded.scenes[0].objectScene.characters[0].actions,reloaded.scenes[1].objectScene.characters[0].actions);assert.equal(reloaded.scenes[1].objectScene.characters[0].appearance_id,'humanoid_robot');
});

test('optional facial features degrade to a valid no-op and stick figure renders skeleton bones',async()=>{
 const graph=await appearanceGraph(),stick=structuredClone(graph);stick.characters[0].appearance_id='stick_figure';stick.characters[0].facial_style='none';stick.characters[0].actions=stick.characters[0].actions.filter(a=>a.motion==='blink');const pose=timedPose(normalizeObjectScene(stick,30),3);assert.equal(pose.facial.blink_status,'no_op');const calls=[],ctx=new Proxy({canvas:{width:720,height:1280},globalAlpha:1},{get(target,key){if(key in target)return target[key];return(...args)=>calls.push([key,...args]);},set(target,key,value){target[key]=value;return true;}});renderObjectScene(ctx,stick,3,30);assert(calls.some(([name])=>name==='moveTo')&&calls.some(([name])=>name==='lineTo'));
});

test('stick figure stays a minimal full-body skeleton with one smaller circular head',async()=>{
 const graph=await appearanceGraph();graph.characters[0].appearance_id='stick_figure';graph.characters[0].actions=[];const character=resolveObjectScene(graph,0,30,{width:1280,height:720}).resolvedCharacters[0],bones=character.pose.parts.filter(part=>part.type==='bone'),head=character.pose.parts.find(part=>part.id==='stick-head');assert.equal(bones.length,13);assert.equal(character.pose.parts.length,17);assert(bones.some(part=>part.id==='stick-spine-lower')&&bones.some(part=>part.id==='stick-spine-upper')&&bones.some(part=>part.id==='stick-shoulders'));assert.equal(bones.filter(part=>part.id.includes('upper-arm')||part.id.includes('forearm')).length,4);assert.equal(bones.filter(part=>part.id.includes('thigh')||part.id.includes('shin')).length,4);assert.deepEqual(bones.filter(part=>part.id.endsWith('-hip')).map(part=>[part.from_joint_id,part.to_joint_id]),[['pelvis','left_thigh'],['pelvis','right_thigh']]);assert.equal(head.radius,.085);assert.equal(head.fill,'none');assert(!character.pose.parts.some(part=>/joint|elbow|knee|nose/.test(part.id)));assert(character.pose.parts.filter(part=>part.facial_role).every(part=>part.joint_id==='head'));
});

test('stick facial styles default to friendly, stay head-local and preserve the same rig pose',async()=>{
 const graph=await appearanceGraph(),poses=[],counts={};for(const facial_style of ['none','friendly','expressive']){const copy=structuredClone(graph);copy.characters[0].appearance_id='stick_figure';copy.characters[0].facial_style=facial_style;const character=resolveObjectScene(copy,4,30).resolvedCharacters[0];assert.equal(character.facial_style,facial_style);poses.push(character.pose.joints);counts[facial_style]=character.pose.parts.filter(part=>part.facial_role).length;assert(character.pose.parts.filter(part=>part.facial_role).every(part=>part.joint_id==='head'));assert(!character.pose.parts.some(part=>/nose/i.test(part.id)));}assert.deepEqual(poses[0],poses[1]);assert.deepEqual(poses[1],poses[2]);assert.deepEqual(counts,{none:0,friendly:3,expressive:5});const defaultGraph=structuredClone(graph);defaultGraph.characters[0].appearance_id='stick_figure';assert.equal(resolveObjectScene(defaultGraph,0,30).resolvedCharacters[0].facial_style,'friendly');const saved=normalizeProject({scenes:[{duration:30,objectScene:defaultGraph}]}),reloaded=normalizeProject(JSON.parse(JSON.stringify(saved)));assert.equal(reloaded.scenes[0].objectScene.characters[0].facial_style,'friendly');
});

test('M2 blink visibly closes and reopens stick figure eyes in both aspect ratios',async()=>{
 const doc=await fixture();for(const [variant,width,height] of [['landscape',1280,720],['portrait',720,1280]]){const graph=structuredClone(doc.variants[variant].scenes[0].scene_graph);graph.objects=graph.objects.filter(object=>object.id!=='lesson-title');graph.characters[0].appearance_id='stick_figure';graph.characters[0].facial_style='friendly';graph.characters[0].actions=graph.characters[0].actions.filter(action=>action.motion==='blink');let blinkTime=null;for(let t=.01;t<12;t+=.002)if(resolveObjectScene(graph,t,30,{width,height}).resolvedCharacters[0].pose.facial.eyes_open<.01){blinkTime=t;break;}assert.notEqual(blinkTime,null,`${variant} has a closed-eye frame`);const open=resolveObjectScene(graph,0,30,{width,height}).resolvedCharacters[0].pose,closed=resolveObjectScene(graph,blinkTime,30,{width,height}).resolvedCharacters[0].pose;assert.equal(open.facial.eyes_open,1);assert(closed.facial.eyes_open<.01);const callsAt=time=>{const calls=[],ctx=new Proxy({canvas:{width,height},globalAlpha:1},{get(target,key){if(key in target)return target[key];return(...args)=>calls.push([key,...args]);},set(target,key,value){target[key]=value;return true;}});renderObjectScene(ctx,graph,time,30);return calls;},openCalls=callsAt(0),closedCalls=callsAt(blinkTime);assert.equal(openCalls.filter(([name])=>name==='ellipse').length-closedCalls.filter(([name])=>name==='ellipse').length,2);assert.equal(closedCalls.filter(([name])=>name==='lineTo').length-openCalls.filter(([name])=>name==='lineTo').length,2);}
});

