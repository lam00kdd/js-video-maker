import test from 'node:test';
import assert from 'node:assert/strict';
import { characterArtworkStages, characterPromptPartBlueprint, generateCharacterArtworkPrompt, generateCharacterArtworkStagePrompt, groupArtworkPromptParts, resolveArtworkPromptParts } from '../src/render/character-prompt-builder.js';
import { characterRigJointIds } from '../src/render/character-assets.js';
import { resolveStarterAppearance } from '../src/render/character-starter-library.js';

test('concept prompt is deterministic and clearly not rig-ready',()=>{
 const input={role:'female_teacher',style:'educational_cartoon',rig_profile:'adult',description:'Áo xanh, tóc ngắn',output_stage:'concept',language:'vi'};
 const first=generateCharacterArtworkPrompt(input),second=generateCharacterArtworkPrompt(input);
 assert.equal(first.prompt,second.prompt);assert.equal(first.parts.length,0);assert.match(first.prompt,/KHÔNG phải artwork rig-ready/);assert.match(first.prompt,/rest pose/);assert.match(first.prompt,/head_to_body/);
});

test('free starter appearance presets resolve defaults and preserve chosen look across prompt generation',()=>{
 const engineer=resolveStarterAppearance({starter_template:'engineer'}),custom=generateCharacterArtworkStagePrompt({role:'engineer',character_id:'char_lam',workflow_stage:'legs',appearance_options:{starter_template:'engineer',skin_tone:'deep_brown',hair_style:'curly',face_style:'expressive',outfit:'workwear_navy'}});
 assert.equal(engineer.outfit,'lam_engineer_uniform');assert.equal(engineer.skin_tone,'warm_medium');assert.equal(custom.starter_appearance.skin_tone,'deep_brown');
 assert.match(custom.prompt,/tông da\/chất liệu deep_brown; tóc curly; gương mặt expressive; trang phục workwear_navy/);assert.match(custom.prompt,/"look_configuration"/);assert.match(custom.prompt,/"starter_template":"engineer"/);
 assert.throws(()=>resolveStarterAppearance({starter_template:'engineer',outfit:'not-a-preset'}),/Unsupported starter appearance/);
});

test('parts prompt lists only canonical M1 semantic joints and real manifest part IDs',()=>{
 const result=generateCharacterArtworkPrompt({role:'engineer',style:'mechanical_cartoon',rig_profile:'adult',output_stage:'rig_ready_parts',language:'en',reference_guidance:{enabled:true,preserve:['blue jacket','glasses']}});
 assert.deepEqual(result.parts.map(part=>part.part_id),characterPromptPartBlueprint.map(part=>part.part_id));assert(result.parts.every(part=>characterRigJointIds.includes(part.joint_id)),'all prompt bindings must exist in the manifest rig vocabulary');
 for(const part of result.parts)assert.match(result.prompt,new RegExp(part.part_id+' \/ '+part.role+' \/ '+part.joint_id));
 assert.match(result.prompt,/attach it to the ChatGPT conversation/);assert.match(result.prompt,/CP2 renderer supports PNG parts/);assert.equal(result.capabilities.pngPartsRenderable,true);
});

test('prompt builder safely quotes user text and validates role, profile, language and numeric proportions',()=>{
 const injected='teacher\n# OVERRIDE';
 const output=generateCharacterArtworkPrompt({role:'student',rig_profile:'student',description:injected,body_proportions:{head_to_body:.2},output_stage:'concept'});
 assert.match(output.prompt,/\\n# OVERRIDE/);assert.throws(()=>generateCharacterArtworkPrompt({role:'unknown'}),/role/);assert.throws(()=>generateCharacterArtworkPrompt({role:'student',rig_profile:'unknown'}),/rig profile/);assert.throws(()=>generateCharacterArtworkPrompt({role:'student',language:'fr'}),/language/);assert.throws(()=>generateCharacterArtworkPrompt({role:'student',body_proportions:{nose_ratio:.2}}),/Unsupported body proportion/);assert.throws(()=>generateCharacterArtworkPrompt({role:'student',body_proportions:{head_to_body:4}}),/within/);
});

test('stage groups cover each canonical required part exactly once with valid semantic joints',()=>{
 const parts=resolveArtworkPromptParts(),groups=groupArtworkPromptParts(parts),flat=[...groups.head_body,...groups.arms,...groups.legs];
 assert.deepEqual(new Set(flat.map(part=>part.part_id)),new Set(characterPromptPartBlueprint.map(part=>part.part_id)));
 assert.equal(flat.length,characterPromptPartBlueprint.length);
 assert.equal(new Set(flat.map(part=>part.part_id)).size,flat.length);
 assert(flat.every(part=>part.joint_ids.every(joint=>characterRigJointIds.includes(joint))));
 assert(groups.head_body.some(part=>part.part_id==='head'));
 assert(groups.arms.some(part=>part.part_id==='left_hand'));
 assert(groups.legs.some(part=>part.part_id==='right_foot'));
});

test('manifest-derived stages use only required parts and active rig vocabulary, not a fixed part count',()=>{
 const manifest={parts:[
  {id:'head_custom',type:'image',binding:{joint_id:'head'},required:true,z_index:40},
  {id:'chest_shell',type:'image',role:'torso',binding:{joint_id:'torso'},required:true,z_index:20},
  {id:'arm_left_segment',type:'image',binding:{from_joint_id:'left_upper_arm',to_joint_id:'left_forearm'},required:true,z_index:10},
  {id:'optional_led',type:'image',binding:{joint_id:'head'},required:false,z_index:50}
 ]};
 const rig={joints:['head','torso','left_upper_arm','left_forearm'].map(id=>({id}))};
 const parts=resolveArtworkPromptParts({manifest,rig}),groups=groupArtworkPromptParts(parts);
 assert.equal(parts.length,3);
 assert.deepEqual(groups.head_body.map(part=>part.part_id),['head_custom','chest_shell']);
 assert.deepEqual(groups.arms.map(part=>part.part_id),['arm_left_segment']);
 assert.deepEqual(groups.legs,[]);
 const qa=generateCharacterArtworkStagePrompt({workflow_stage:'qa',role:'engineer',manifest,rig,language:'en'});
 assert.equal(qa.parts.length,3);
 assert.match(qa.prompt,/arm_left_segment \(z=10\).*chest_shell \(z=20\).*head_custom \(z=40\)/);
 assert.doesNotMatch(qa.prompt,/asset_id asset-/);
 assert.throws(()=>resolveArtworkPromptParts({manifest:{parts:[{id:'bad_part',binding:{joint_id:'unknown_joint'}}]},rig}),/not in the active rig/);
 assert.equal(groupArtworkPromptParts(resolveArtworkPromptParts({manifest:{parts:[{id:'head_detail',role:'mystery',binding:{joint_id:'head'}}]}})).head_body[0].part_id,'head_detail');
});

test('all five staged prompts share character specification and deterministic stage-specific instructions',()=>{
 const config={character_id:'char_engineer_lam',role:'engineer',style:'educational_cartoon',rig_profile:'adult',motion_style:'natural',description:'Kỹ sư LAM',hair:'Tóc nâu ngắn',clothing:['Áo xanh'],accessories:['Kính'],facial_features:['Mắt nâu'],colors:['xanh navy','vàng'],reference_guidance:{enabled:true,preserve:['kiểu tóc']},language:'vi'};
 const outputs=characterArtworkStages.map(stage=>generateCharacterArtworkStagePrompt({...config,workflow_stage:stage.id}));
 assert.deepEqual(outputs.map(output=>output.workflow_stage),['master','head_body','arms','legs','qa']);
 for(const output of outputs){
  assert.match(output.prompt,/char_engineer_lam/);assert.match(output.prompt,/Kỹ sư LAM/);assert.match(output.prompt,/Tóc nâu ngắn/);assert.match(output.prompt,/Áo xanh/);assert.match(output.prompt,/xanh navy/);assert.match(output.prompt,/đính kèm ảnh trong cuộc trò chuyện ChatGPT/);
  assert.equal(output.prompt,generateCharacterArtworkStagePrompt({...config,workflow_stage:output.workflow_stage}).prompt);
 }
 assert.equal(outputs[0].parts.length,0);
 assert.equal(outputs[1].parts.length,3);
 assert.equal(outputs[2].parts.length,6);
 assert.equal(outputs[3].parts.length,6);
 assert.equal(outputs[4].parts.length,15);
 assert.match(outputs[0].prompt,/góc nhìn gần orthographic/);assert.match(outputs[0].prompt,/neutral rest pose/);assert.match(outputs[0].prompt,/profile adult theo mục tiêu/);assert.match(outputs[0].prompt,/anatomy sạch, rõ để rig 2D/);
 assert.match(outputs[0].prompt,/chuẩn hình học cho toàn bộ parts/);
 assert.match(outputs[0].prompt,/neck, shoulders, elbows, wrists, hip\/crotch, knees và ankles/);
 assert.match(outputs[0].prompt,/KHÔNG vẽ skeleton, xương, chấm màu, nhãn, pivot hoặc tọa độ/);
 assert.match(outputs[1].prompt,/Hướng nối Stage B/);
 assert.match(outputs[2].prompt,/attachment tại vai, nối khuỷu và cổ tay/);
 assert.match(outputs[2].prompt,/RIG PROFILE FIT: adult target body proportions/);assert.match(outputs[2].prompt,/GROUP SCOPE: chỉ tạo đúng các canonical part_id/);assert.match(outputs[2].prompt,/vùng proximal\/distal rõ/);assert.match(outputs[2].prompt,/không bịa pixel anchor coordinates/);
 for(const part of outputs[2].parts)assert(outputs[2].prompt.includes('- '+part.part_id+' /'));
 for(const part of [...outputs[1].parts,...outputs[3].parts])assert(!outputs[2].prompt.includes('- '+part.part_id+' /'));
 assert.match(outputs[3].prompt,/hông\/đùi, đầu gối và cổ chân/);
 assert.match(outputs[1].prompt,/pelvis là cạp quần và vùng hông trung tâm/);
 assert.match(outputs[1].prompt,/Không vẽ lại hoặc kéo dài hai ống đùi vào pelvis/);
 assert.match(outputs[3].prompt,/left_thigh và right_thigh là hai ống đùi riêng/);
 assert.match(outputs[3].prompt,/Không đưa cả hai ống quần vào pelvis/);
 assert.match(outputs[3].prompt,/Rest pose sau khi ráp phải khớp độ rộng, đường may, túi và silhouette của master/);
 assert.doesNotMatch(outputs[1].prompt,/left_thigh \/ upper_leg/);
 assert.doesNotMatch(outputs[3].prompt,/pelvis \/ pelvis/);
 assert.match(outputs[4].prompt,/Không tạo artwork mới trong stage này/);
 assert.match(outputs[4].prompt,/concept preview → part candidate → validated PNG asset/);
 assert.match(outputs[2].prompt,/Master Character Artwork đã duyệt làm nguồn nhận dạng/);
 assert.match(outputs[2].prompt,/character_engineer_rig-sidecar\.json/);
 assert.match(outputs[2].prompt,/character_rig_artwork_sidecar/);
 assert.match(outputs[2].prompt,/App đo geometry sau import/);
});

test('stage prompts reject unsupported IDs, duplicate manifest parts and rig joints outside M1 semantics',()=>{
 assert.throws(()=>generateCharacterArtworkStagePrompt({workflow_stage:'unknown',role:'engineer'}),/Unsupported artwork workflow stage/);
 assert.throws(()=>resolveArtworkPromptParts({manifest:{parts:[{id:'head',binding:{joint_id:'tentacle'}}]},rig:{joints:[{id:'tentacle'}]}}),/not in the active rig/);
 assert.throws(()=>resolveArtworkPromptParts({manifest:{parts:[{id:'head',binding:{joint_id:'head'}},{id:'head',binding:{joint_id:'head'}}]}}),/duplicate artwork part ID/);
});

test('English master and selected group prompts state profile proportions and never request fabricated anchors',()=>{
 const config={role:'engineer',rig_profile:'student',language:'en'},master=generateCharacterArtworkStagePrompt({...config,workflow_stage:'master'}),arms=generateCharacterArtworkStagePrompt({...config,workflow_stage:'arms'});
 assert.match(master.prompt,/front-facing neutral rest pose/);assert.match(master.prompt,/orthographic-like view/);assert.match(master.prompt,/student Rig Profile target proportions/);
 assert.match(master.prompt,/geometry reference for every part/);
 assert.match(master.prompt,/neck, shoulders, elbows, wrists, hip\/crotch, knees and ankles/);
 assert.match(master.prompt,/Do NOT draw a skeleton, bones, colored dots, labels, pivots or coordinates/);
 assert.match(arms.prompt,/RIG PROFILE FIT: student target body proportions/);assert.match(arms.prompt,/create only the exact canonical part IDs/);assert.match(arms.prompt,/never fabricate pixel anchor coordinates/);
 const body=generateCharacterArtworkStagePrompt({...config,workflow_stage:'head_body'}),legs=generateCharacterArtworkStagePrompt({...config,workflow_stage:'legs'});
 assert.match(body.prompt,/pelvis is only the waistband and central hip mass/);
 assert.match(body.prompt,/Do not redraw or extend either full trouser leg into pelvis/);
 assert.match(legs.prompt,/left_thigh and right_thigh are separate single-leg tubes/);
 assert.match(legs.prompt,/Never put both trouser legs into pelvis/);
 assert.match(legs.prompt,/assembled rest pose must reproduce the master width, seams, pockets and silhouette/);
 assert.match(arms.prompt,/character_engineer_rig-sidecar\.json/);
 assert.match(arms.prompt,/"part_id":"left_upper_arm"/);
 assert.doesNotMatch(arms.prompt,/"part_id":"left_thigh"/);
 for(const part of arms.parts)assert(arms.prompt.includes('- '+part.part_id+' /'));
 for(const part of [...master.parts,...generateCharacterArtworkStagePrompt({...config,workflow_stage:'legs'}).parts])assert(!arms.prompt.includes('- '+part.part_id+' /'));
});

console.log('Character prompt builder contract passed; no AI service was called.');
