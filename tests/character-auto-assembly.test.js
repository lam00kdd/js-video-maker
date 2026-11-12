import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { analyzeAlphaGeometry, candidateSourceAnchors, createForceFitAssemblyCandidate, createHybridAssemblyCandidate, fitImagePartToJoints } from '../src/render/character-auto-assembly.js';
import { createCanonicalM1EditorRig, createInitialRigEditorParts } from '../src/render/character-rig-editor.js';
import { CharacterLibraryStorage } from '../src/render/character-library-storage.js';
import { resolveHumanRig } from '../src/render/human-rig.js';
import { FakeIndexedDB } from './support/fake-indexed-db.js';

function alpha(width,height,points){const data=new Uint8ClampedArray(width*height*4);for(const [x,y,a=255]of points)data[(y*width+x)*4+3]=a;return data;}
function part(id,width=100,height=100){return{id,type:'image',asset_id:'libsha256_'+id.padEnd(64,'a').slice(0,64),source_dimensions_px:{width,height},alpha:true,pivot:{space:'image_px',x:width/2,y:height/2},size_rig_units:{width:.13*width/height,height:.13},binding:['head','torso','pelvis'].includes(id)?{joint_id:id}:undefined,transform:{offset:{x:0,y:0},rotation:0,scale:1},z_index:10,opacity:1,visible:true};}

test('alpha geometry reports visible bounds, center, padding and deterministic coverage',()=>{
 const image=analyzeAlphaGeometry({width:10,height:8,data:alpha(10,8,[[2,1],[7,5,128],[8,5,0]])});
 assert.deepEqual(image.alpha_bounds_px,{x:2,y:1,width:6,height:5});assert.equal(image.visible_pixel_count,2);assert.equal(image.alpha_coverage,.025);assert.equal(image.transparent_padding_px.left,2);assert.equal(image.visible_center_px.x,(2.5*255+7.5*128)/383);
 assert.deepEqual(image,analyzeAlphaGeometry({width:10,height:8,data:alpha(10,8,[[2,1],[7,5,128],[8,5,0]])}));
});

test('source orientation classifies vertical, horizontal and diagonal axes without guessing ambiguous shapes',()=>{
 const vertical=analyzeAlphaGeometry({width:30,height:100,data:alpha(30,100,Array.from({length:60},(_,i)=>[14+(i%3),15+i]))});
 const horizontal=analyzeAlphaGeometry({width:100,height:30,data:alpha(100,30,Array.from({length:60},(_,i)=>[15+i,14+(i%3)]))});
 const diagonal=analyzeAlphaGeometry({width:100,height:100,data:alpha(100,100,Array.from({length:60},(_,i)=>[15+i,15+i]))});
 const ambiguous=analyzeAlphaGeometry({width:30,height:30,data:alpha(30,30,Array.from({length:25},(_,i)=>[5+i%5,5+Math.floor(i/5)]))});
 assert.equal(vertical.orientation,'vertical');assert.equal(horizontal.orientation,'horizontal');assert.equal(diagonal.orientation,'diagonal');assert.equal(ambiguous.orientation,'ambiguous');
});

test('hybrid candidate maps canonical parts, applies uniform scale and stable hierarchy layer order',()=>{
 const rig=createCanonicalM1EditorRig('rig_auto'),parts=['head','torso','pelvis','left_upper_arm','left_forearm','left_hand','right_upper_arm','right_forearm','right_hand','left_thigh','left_shin','left_foot','right_thigh','right_shin','right_foot'].map(id=>part(id,120,200));
 const geometry=Object.fromEntries(parts.map(p=>[p.id,analyzeAlphaGeometry({width:120,height:200,data:alpha(120,200,Array.from({length:80},(_,i)=>[58+i%4,10+i]))})]));
 const result=createHybridAssemblyCandidate({rig,parts,vocabulary:parts.map(p=>({part_id:p.id,required:true})),geometryByPart:geometry,rigProfile:'adult'});
 assert.equal(result.parts.length,15);assert.equal(result.status,'review_required');assert.deepEqual(result.applied_constraints.includes('uniform transform.scale'),true);
 assert.equal(result.parts.find(p=>p.id==='left_upper_arm').binding.joint_id,'left_upper_arm');assert.notEqual(result.parts.find(p=>p.id==='head').transform.scale,1);
 assert(result.diagnostics.some(d=>d.code==='vertical_source_axis_joint_fit'&&d.part_id==='left_upper_arm'));
 assert.equal(result.parts.find(p=>p.id==='left_foot').z_index,10);assert(result.manual_review.includes('head'));
});

test('joint-bound vertical limb fit aligns both anchors through the CP2 transform with uniform scale',()=>{
 const rig=createCanonicalM1EditorRig('rig_fit'),source=part('left_upper_arm',100,200);source.size_rig_units={width:.065,height:.13};source.transform.offset={x:.2,y:-.3};const anchors={from:{x:50,y:10},to:{x:50,y:190}},fitted=fitImagePartToJoints({part:source,rig,anchors,targetJointIds:['left_upper_arm','left_forearm']}),right=fitImagePartToJoints({part:{...source,id:'right_upper_arm'},rig,anchors,targetJointIds:['right_upper_arm','right_forearm']});
 assert.equal(fitted.part.binding.joint_id,'left_upper_arm');assert.equal(fitted.part.transform.scale,fitted.uniform_scale);assert.equal(fitted.part.transform.offset.x,0);assert.equal(fitted.part.transform.offset.y,0);assert.equal(fitted.part.assembly_anchors_px.target_joint_ids[1],'left_forearm');assert(fitted.residual.max<1e-8);assert.equal(right.part.binding.joint_id,'right_upper_arm');assert(right.residual.max<1e-8);
 assert.equal(fitted.part.transform.scaleX,undefined);assert.equal(fitted.part.transform.scaleY,undefined);
});

test('verified asset-bound rig metadata outranks alpha-axis anchor estimates without changing canonical M1 joint IDs',()=>{
 const rig=createCanonicalM1EditorRig('rig_metadata_priority'),source=part('left_upper_arm',100,200),geometry=analyzeAlphaGeometry({width:100,height:200,data:alpha(100,200,Array.from({length:80},(_,i)=>[48+i%4,20+i]))}),checksum=source.asset_id.slice('libsha256_'.length);source.rig_ready_metadata={schema_version:1,part_id:source.id,asset_reference:source.asset_id,asset_checksum:checksum,verified_asset_checksum:checksum,source_width:100,source_height:200,validation_status:'verified',target_proportion_guidance:{rig_profile:'adult'},orientation:{observed:'vertical'},proximal_anchor:{x:50,y:25,joint:'left_upper_arm'},distal_anchor:{x:51,y:165,joint:'left_forearm'}};
 const candidate=createHybridAssemblyCandidate({rig,parts:[source],geometryByPart:{left_upper_arm:geometry}}),fitted=candidate.parts[0];assert.deepEqual(fitted.assembly_anchors_px.from,{x:50,y:25});assert.deepEqual(fitted.assembly_anchors_px.to,{x:51,y:165});assert.equal(fitted.binding.joint_id,'left_upper_arm');assert(candidate.diagnostics.some(item=>item.part_id==='left_upper_arm'&&item.message.includes('Verified metadata')));
 source.user_confirmed=true;const preserved=createHybridAssemblyCandidate({rig,parts:[source],geometryByPart:{left_upper_arm:geometry}}).parts[0];assert.equal(preserved.assembly_anchors_px,undefined);
});

test('parent motion carries child M1 joints and horizontal/diagonal/ambiguous source axes are classified distinctly',()=>{
 const rig=createCanonicalM1EditorRig('rig_chain'),rest=resolveHumanRig(rig,{x:0,y:0,scale:1,rotation:0},0,{width:100,height:100}),animated=resolveHumanRig(rig,{x:0,y:0,scale:1,rotation:0},0,{width:100,height:100,initialPose:{joints:{left_upper_arm:{rotation:Math.PI/3}}}});
 assert.notDeepEqual(animated.joints.left_forearm,rest.joints.left_forearm);
 const horizontal=analyzeAlphaGeometry({width:100,height:30,data:alpha(100,30,Array.from({length:60},(_,i)=>[15+i,14+(i%3)]))}),diagonal=analyzeAlphaGeometry({width:100,height:100,data:alpha(100,100,Array.from({length:60},(_,i)=>[15+i,15+i]))}),ambiguous=analyzeAlphaGeometry({width:30,height:30,data:alpha(30,30,Array.from({length:25},(_,i)=>[5+i%5,5+Math.floor(i/5)]))});
 assert.equal(horizontal.orientation,'horizontal');assert.equal(diagonal.orientation,'diagonal');assert.equal(ambiguous.orientation,'ambiguous');assert.equal(candidateSourceAnchors(diagonal),null);assert.equal(candidateSourceAnchors(ambiguous),null);
});

test('existing binding and valid user attachment geometry are preserved; CP2 rejects vertical anchors',()=>{
 const rig=createCanonicalM1EditorRig('rig_auto'),asset=part('left_upper_arm',100,200);asset.binding={from_joint_id:'left_upper_arm',to_joint_id:'left_forearm',attachment_points_px:{from:{x:10,y:90},to:{x:90,y:90}}};asset.pivot={space:'image_px',x:10,y:90};asset.binding.user_confirmed=true;
 const kept=createHybridAssemblyCandidate({rig,parts:[asset],geometryByPart:{left_upper_arm:analyzeAlphaGeometry({width:100,height:200,data:alpha(100,200,[[10,90],[90,90]])})}}).parts[0];
 assert.deepEqual(kept.binding,asset.binding);assert.deepEqual(kept.pivot,asset.pivot);
 asset.binding.attachment_points_px.to.y=120;
 const rejected=createHybridAssemblyCandidate({rig,parts:[asset]});assert.equal(rejected.status,'blocked');assert(rejected.errors.some(e=>e.code==='cp2_horizontal_attachment_required'));
});

test('required missing parts and unsupported IDs produce diagnostics without inventing joints',()=>{
 const rig=createCanonicalM1EditorRig('rig_auto'),candidate=createHybridAssemblyCandidate({rig,parts:[part('alien_hat')],vocabulary:[{part_id:'head',required:true},{part_id:'alien_hat',required:false}]});
 assert(candidate.diagnostics.some(d=>d.code==='missing_semantic_joint'));assert(candidate.diagnostics.some(d=>d.code==='missing_part'));assert.equal(candidate.rig.joints.length,17);
});

test('assembly output is deterministic and does not mutate source parts or rig',()=>{
 const rig=createCanonicalM1EditorRig('rig_auto'),parts=[part('head')],original=structuredClone(parts),one=createHybridAssemblyCandidate({rig,parts}),two=createHybridAssemblyCandidate({rig,parts});
 assert.deepEqual(one,two);assert.deepEqual(parts,original);
});

test('force fit deterministically aligns a bone to the default profile skeleton with uniform scale and rotation',()=>{
 const rig=createCanonicalM1EditorRig('rig_force_input'),source=part('left_upper_arm',100,100),geometry=analyzeAlphaGeometry({width:100,height:100,data:alpha(100,100,Array.from({length:60},(_,i)=>[15+i,49+(i%2)]))}),input={rig,parts:[source],vocabulary:[{part_id:source.id,required:true}],geometryByPart:{left_upper_arm:geometry},rigProfile:'student'},first=createForceFitAssemblyCandidate(input),second=createForceFitAssemblyCandidate(input),fit=first.fit_diagnostics.find(item=>item.part_id==='left_upper_arm'),fitted=first.parts.find(item=>item.id==='left_upper_arm');
 assert.deepEqual(first,second);assert.equal(first.mode,'force_fit');assert.equal(first.rig.id,'default_student_force_fit');assert.notEqual(first.rig.joints.find(j=>j.id==='left_forearm').position.y,createForceFitAssemblyCandidate({...input,rigProfile:'adult'}).rig.joints.find(j=>j.id==='left_forearm').position.y);assert.equal(fit.anchor_source,'alpha_axis_candidate');assert(fit.source_length_px>0);assert(fit.target_length_rig_units>0);assert(fit.scale>0);assert(Math.abs(fit.residual_rig_units)<1e-8);assert.equal(fit.status,'valid');assert.equal(fitted.transform.scaleX,undefined);assert.equal(fitted.transform.scaleY,undefined);assert.equal(fitted.binding.joint_id,'left_upper_arm');
 const pose=resolveHumanRig(first.rig,{x:0,y:0,scale:1,rotation:0},0,{width:1,height:1}),from=pose.joints.left_upper_arm,to=pose.joints.left_forearm,targetAngle=Math.atan2(to.y-from.y,to.x-from.x),sourceAngle=Math.atan2(fit.source_anchors_px.to.y-fit.source_anchors_px.from.y,fit.source_anchors_px.to.x-fit.source_anchors_px.from.x),expected=targetAngle-pose.joints.left_upper_arm.rotation-sourceAngle;assert(Math.abs(fitted.transform.rotation-expected)<1e-9);
});

test('force fit reports residual status per bone and blocks parts without measurable anchors',()=>{
 const rig=createCanonicalM1EditorRig('rig_force_diagnostics'),fitted=part('right_shin',100,200);fitted.size_rig_units={width:.7,height:.13};const geometry=analyzeAlphaGeometry({width:100,height:200,data:alpha(100,200,Array.from({length:80},(_,i)=>[10+i,99+i%2]))}),candidate=createForceFitAssemblyCandidate({rig,parts:[fitted,part('left_thigh')],vocabulary:[],geometryByPart:{right_shin:geometry,left_thigh:{orientation:'ambiguous',alpha_bounds_px:{x:1,y:1,width:30,height:30}}}}),shin=candidate.fit_diagnostics.find(item=>item.part_id==='right_shin'),thigh=candidate.fit_diagnostics.find(item=>item.part_id==='left_thigh');
 assert.equal(shin.status,'review_required');assert(shin.residual_rig_units>.006);assert(candidate.diagnostics.some(item=>item.code==='force_fit_bone'&&item.part_id==='right_shin'));assert.equal(thigh.status,'blocked');assert(candidate.errors.some(item=>item.code==='force_fit_anchors_missing'&&item.part_id==='left_thigh'));assert.equal(candidate.status,'blocked');
});

test('verified anchors take precedence and preview preserves their exact verified record',()=>{
 const rig=createCanonicalM1EditorRig('rig_force_verified'),source=part('left_forearm',100,200),checksum=source.asset_id.slice('libsha256_'.length);source.rig_ready_metadata={schema_version:1,part_id:source.id,asset_reference:source.asset_id,asset_checksum:checksum,verified_asset_checksum:checksum,source_width:100,source_height:200,cp2_binding_mode:'bone',validation_status:'verified',target_proportion_guidance:{rig_profile:'adult'},proximal_anchor:{x:42,y:100,joint:'left_forearm'},distal_anchor:{x:57,y:100,joint:'left_hand'}};const original=structuredClone(source.rig_ready_metadata),geometry=analyzeAlphaGeometry({width:100,height:200,data:alpha(100,200,Array.from({length:80},(_,i)=>[49+i%2,20+i]))}),candidate=createForceFitAssemblyCandidate({rig,parts:[source],geometryByPart:{left_forearm:geometry}}),fitted=candidate.parts[0];
 assert.equal(candidate.fit_diagnostics[0].anchor_source,'verified_metadata');assert.deepEqual(candidate.fit_diagnostics[0].source_anchors_px,{from:{x:42,y:100},to:{x:57,y:100}});assert.deepEqual(fitted.rig_ready_metadata,original);assert.equal(fitted.assembly_anchors_px.user_confirmed,true);
 const vertical=part('right_upper_arm',100,200),verticalHash=vertical.asset_id.slice('libsha256_'.length);vertical.rig_ready_metadata={schema_version:1,part_id:vertical.id,asset_reference:vertical.asset_id,asset_checksum:verticalHash,verified_asset_checksum:verticalHash,source_width:100,source_height:200,cp2_binding_mode:'joint_bound',validation_status:'verified',target_proportion_guidance:{rig_profile:'adult'},proximal_anchor:{x:50,y:20,joint:'right_upper_arm'},distal_anchor:{x:50,y:180,joint:'right_forearm'}};const verticalCandidate=createForceFitAssemblyCandidate({rig,parts:[vertical]});assert.equal(verticalCandidate.fit_diagnostics[0].anchor_source,'verified_metadata');assert.deepEqual(verticalCandidate.fit_diagnostics[0].source_anchors_px,{from:{x:50,y:20},to:{x:50,y:180}});
});

test('force fit remains compatible with legacy drafts without metadata or new fields',()=>{
 const rig=createCanonicalM1EditorRig('rig_force_legacy'),legacy=part('left_thigh',100,200);delete legacy.rig_ready_metadata;const geometry=analyzeAlphaGeometry({width:100,height:200,data:alpha(100,200,Array.from({length:80},(_,i)=>[48+i%3,20+i]))}),candidate=createForceFitAssemblyCandidate({rig,parts:[legacy],geometryByPart:{left_thigh:geometry}});
 assert.equal(candidate.fit_diagnostics[0].anchor_source,'alpha_axis_candidate');assert.equal(candidate.parts[0].binding.joint_id,'left_thigh');assert.equal(candidate.parts[0].rig_ready_metadata,undefined);assert.equal(candidate.parts[0].transform.scaleX,undefined);
});

test('applied candidate round-trips through atomic draft storage without changing asset bytes',async()=>{
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC','base64'),hash=[...new Uint8Array(await webcrypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join(''),asset_id='libsha256_'+hash,blob=new Blob([bytes],{type:'image/png'}),indexedDB=new FakeIndexedDB(),options={indexedDB,crypto:webcrypto,dbName:'hybrid-auto-assembly-reload',decodePng:async()=>({width:1,height:1})},storage=new CharacterLibraryStorage(options);
 await storage.createCharacter({character_id:'char_auto_assembly',display_name:'Assembly'});const rig=createCanonicalM1EditorRig('rig_auto'),source=part('left_upper_arm',1,1);source.asset_id=asset_id;source.size_rig_units={width:.13,height:.13};const candidate=createHybridAssemblyCandidate({rig,parts:[source]}),calibrated=fitImagePartToJoints({part:candidate.parts[0],rig,anchors:{from:{x:0,y:0},to:{x:0,y:1}},targetJointIds:['left_upper_arm','left_forearm'],confirmed:true}).part;
 await storage.saveCharacterDraft('char_auto_assembly',{display_name:'Assembly',rig:candidate.rig,rig_editor_parts:[calibrated],asset_refs:[asset_id]},{assets:[{asset_id,blob}]});await storage.close();const reloaded=new CharacterLibraryStorage(options),draft=await reloaded.getCharacterDraft('char_auto_assembly');
 assert.deepEqual(draft.rig_editor_parts,[calibrated]);assert.equal(draft.rig_editor_parts[0].assembly_anchors_px.user_confirmed,true);assert.equal((await reloaded.getAsset(asset_id)).sha256,hash);await reloaded.close();
});
