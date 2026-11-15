import { characterRigJointIds } from './character-assets.js';
import { motionStyleIds } from './motion-styles.js';
import { createRigReadyMetadataTemplates } from './character-rig-ready-metadata.js';
import { resolveStarterAppearance, starterCharacterProfiles } from './character-starter-library.js';
const roles=Object.freeze({male_teacher:'giáo viên nam',female_teacher:'giáo viên nữ',student:'học sinh',engineer:'kỹ sư',electrician:'thợ điện',humanoid_robot:'robot hình người',custom:'nhân vật tùy chỉnh'});
const styles=Object.freeze({educational_cartoon:'hoạt hình giáo dục 2D, đường nét sạch, màu sắc hài hòa và biểu cảm thân thiện',minimal_cartoon:'hoạt hình 2D tối giản, silhouette rõ và ít chi tiết',mechanical_cartoon:'hoạt hình 2D cơ khí thân thiện, khớp nối dễ đọc'});
const proportionDefaults=Object.freeze({adult:{head_to_body:.14,shoulder_to_head:1.55,torso_to_body:.31,arm_to_body:.34,leg_to_body:.47},student:{head_to_body:.18,shoulder_to_head:1.35,torso_to_body:.30,arm_to_body:.33,leg_to_body:.42},humanoid_robot:{head_to_body:.16,shoulder_to_head:1.7,torso_to_body:.32,arm_to_body:.36,leg_to_body:.45}});
const rigProfiles=Object.freeze({adult:{label:'adult',joints:characterRigJointIds},student:{label:'student',joints:characterRigJointIds},humanoid_robot:{label:'humanoid_robot',joints:characterRigJointIds}});
const partBlueprint=Object.freeze([
  ['head','head','head'],['torso','torso','torso'],['pelvis','pelvis','pelvis'],
  ['left_upper_arm','upper_arm','left_upper_arm'],['left_forearm','lower_arm','left_forearm'],['left_hand','hand','left_hand'],
  ['right_upper_arm','upper_arm','right_upper_arm'],['right_forearm','lower_arm','right_forearm'],['right_hand','hand','right_hand'],
  ['left_thigh','upper_leg','left_thigh'],['left_shin','lower_leg','left_shin'],['left_foot','foot','left_foot'],
  ['right_thigh','upper_leg','right_thigh'],['right_shin','lower_leg','right_shin'],['right_foot','foot','right_foot']
].map(([part_id,role,joint_id])=>Object.freeze({part_id,role,joint_id})));
export const characterArtworkStages=Object.freeze([
  Object.freeze({id:'master',label:'Stage A — Master Character',group:'master'}),
  Object.freeze({id:'head_body',label:'Stage B — Head & Body',group:'head_body'}),
  Object.freeze({id:'arms',label:'Stage C — Arms',group:'arms'}),
  Object.freeze({id:'legs',label:'Stage D — Legs',group:'legs'}),
  Object.freeze({id:'qa',label:'Stage E — QA & Export Instructions',group:'qa'})
]);
const stageGroupForPart=part=>{
  if(part.group&&['head_body','arms','legs'].includes(part.group))return part.group;
  const tokens=(String(part.part_id||'')+' '+String(part.role||'')+' '+(part.joint_ids||[]).join(' ')).toLowerCase().replace(/[^a-z0-9]+/g,'_');
  if(/head|neck|torso|spine|pelvis|body/.test(tokens))return'head_body';
  if(/arm|forearm|hand|wrist|shoulder|bicep/.test(tokens))return'arms';
  if(/leg|thigh|shin|foot|ankle|hip/.test(tokens))return'legs';
  throw new Error('Could not assign required artwork part "'+part.part_id+'" to a workflow stage. Add a semantic role/group to the manifest.');
};
export function resolveArtworkPromptParts({manifest=null,rig=null}={}){
  const activeJointSet=new Set(Array.isArray(rig?.joints)?rig.joints.map(joint=>String(joint.id||'')):
    Array.isArray(manifest?.rig_compatibility?.required_joints)?manifest.rig_compatibility.required_joints.map(String):characterRigJointIds);
  const rigJointSet=new Set(characterRigJointIds.filter(joint=>activeJointSet.has(joint)));
  const source=Array.isArray(manifest?.parts)&&manifest.parts.length?manifest.parts:partBlueprint;
  const seen=new Set();
  const parts=source.filter(part=>part.required!==false).map((part,index)=>{
    const part_id=String(part.part_id||part.id||'');
    if(!part_id)throw new Error('Manifest artwork part at index '+index+' is missing its ID.');
    if(!/^[a-z][a-z0-9_-]{0,127}$/.test(part_id))throw new Error('Manifest artwork part ID "'+part_id+'" is not a supported semantic identifier.');
    if(seen.has(part_id))throw new Error('Manifest contains duplicate artwork part ID "'+part_id+'".');
    seen.add(part_id);
    const binding=part.binding||{};
    const joint_ids=[binding.joint_id,binding.from_joint_id,binding.to_joint_id,part.joint_id].filter(Boolean).map(String);
    if(!joint_ids.length)throw new Error('Manifest artwork part "'+part_id+'" is missing a semantic joint binding.');
    const invalid=joint_ids.find(joint=>!rigJointSet.has(joint));
    if(invalid)throw new Error('Manifest artwork part "'+part_id+'" references joint "'+invalid+'", which is not in the active rig.');
    const uniqueJoints=[...new Set(joint_ids)];
    const normalized={part_id,role:String(part.role||part.semantic_role||(part.type&&part.type!=='image'?part.type:'')||uniqueJoints.join('_')||part_id),joint_id:uniqueJoints[0],joint_ids:uniqueJoints,required:part.required!==false,...(Number.isFinite(Number(part.z_index))?{z_index:Number(part.z_index)}:{})};
    return{...normalized,group:stageGroupForPart(normalized)};
  });
  return parts;
}
export function groupArtworkPromptParts(parts){
  const groups={head_body:[],arms:[],legs:[]},seen=new Set();
  for(const part of parts){if(seen.has(part.part_id))throw new Error('Duplicate artwork part in stage coverage: "'+part.part_id+'".');seen.add(part.part_id);const group=stageGroupForPart(part);groups[group].push({...part,group});}
  return groups;
}
const safeText=(value,label,max=500)=>{const text=String(value??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,'').trim();if(text.length>max)throw new Error(label+' exceeds '+max+' characters.');return text;};
const list=(value,label,maxItems=20)=>{if(value==null)return[];if(!Array.isArray(value)||value.length>maxItems)throw new Error(label+' must be an array of at most '+maxItems+' items.');return value.map((item,index)=>safeText(item,label+'['+index+']',120)).filter(Boolean);};
const quote=value=>JSON.stringify(value);

/** Build a deterministic external-art prompt. This module does not call an AI service. */
export function generateCharacterArtworkPrompt(config={}) {
  if(!config||typeof config!=='object'||Array.isArray(config))throw new Error('Character prompt config must be an object.');
  const role=String(config.role||''),style=String(config.style||'educational_cartoon'),rigProfile=String(config.rig_profile||'adult'),motionStyle=String(config.motion_style||''),outputStage=String(config.output_stage||'concept'),language=String(config.language||'vi');
  if(!Object.hasOwn(roles,role))throw new Error('Unsupported character role "'+role+'".');
  if(!Object.hasOwn(styles,style))throw new Error('Unsupported appearance style "'+style+'".');
  if(!Object.hasOwn(rigProfiles,rigProfile))throw new Error('Unsupported rig profile "'+rigProfile+'".');
  if(motionStyle&&!motionStyleIds.includes(motionStyle))throw new Error('Unsupported motion style "'+motionStyle+'".');
  if(!['concept','rig_ready_parts','qa'].includes(outputStage))throw new Error('output_stage must be concept, rig_ready_parts or qa.');
  if(!['vi','en'].includes(language))throw new Error('language must be vi or en.');
  const characterId=safeText(config.character_id,'character_id',160),description=safeText(config.description,'description'),hair=safeText(config.hair,'hair'),colors=list(config.colors,'colors',20),clothing=list(config.clothing,'clothing'),accessories=list(config.accessories,'accessories'),facialFeatures=list(config.facial_features,'facial_features',10),preserve=list(config.reference_guidance?.preserve,'reference_guidance.preserve',20),referenceEnabled=config.reference_guidance?.enabled===true;
  const roleProfile=starterCharacterProfiles.find(item=>item.role===role)?.id||'engineer',appearance=resolveStarterAppearance({...config.appearance_options,starter_template:config.appearance_options?.starter_template||roleProfile});
  const rawProportions=config.body_proportions==null?{}:config.body_proportions;if(!rawProportions||typeof rawProportions!=='object'||Array.isArray(rawProportions))throw new Error('body_proportions must be an object.');const bodyProportions={...proportionDefaults[rigProfile]};for(const[key,value]of Object.entries(rawProportions)){if(!Object.hasOwn(bodyProportions,key))throw new Error('Unsupported body proportion "'+key+'".');bodyProportions[key]=Number(value);if(!Number.isFinite(bodyProportions[key])||bodyProportions[key]<.05||bodyProportions[key]>2)throw new Error('body_proportions.'+key+' must be within [0.05, 2].');}
  const current={pngPartsRenderable:true,pngAssetPreload:true,transparentPngStorage:true,svgLayerImport:false};
  const blueprint=Array.isArray(config.parts)?config.parts.map(part=>({...part})):partBlueprint.map(part=>({...part}));
  const workflowStage=String(config.workflow_stage||'all_parts');
  const actualLayerOrder=blueprint.filter(part=>Number.isFinite(part.z_index)).slice().sort((a,b)=>a.z_index-b.z_index).map(part=>part.part_id+' (z='+part.z_index+')');
  const lines=[];
  if(language==='vi'){
    lines.push('# PROMPT CHARACTER ARTWORK — '+(outputStage==='concept'?'CONCEPT':outputStage==='qa'?'QA & EXPORT':'CÁC BỘ PHẬN RIG-READY'));
    lines.push('Character Design Specification — ID: '+quote(characterId||'chưa gán')+'.');
    lines.push('Vai trò: '+roles[role]+' ('+role+'). Phong cách: '+styles[style]+'. Rig profile: '+rigProfile+'.');
    if(motionStyle)lines.push('Motion style profile của draft: '+motionStyle+'. Đây là metadata tham khảo; không thay đổi rig hoặc action timeline.');
    lines.push('Mô tả người dùng: '+quote(description||'Không có mô tả bổ sung.'));
    lines.push('Tỷ lệ cơ thể tham khảo (head/body, shoulder/head, torso/body, arm/body, leg/body): '+quote(bodyProportions)+'. Hãy giữ nhất quán và xem đây là hướng dẫn concept, không phải kích thước xương resolver.');
    lines.push('Tóc: '+quote(hair||'Theo mô tả hoặc thiết kế tự nhiên phù hợp.'));lines.push('Khuôn mặt: '+quote(facialFeatures));lines.push('Trang phục: '+quote(clothing));lines.push('Phụ kiện: '+quote(accessories));lines.push('Bảng màu cần giữ nhất quán: '+quote(colors||['Theo master artwork hoặc lựa chọn người dùng']));
    lines.push('STARTER APPEARANCE — '+appearance.profile.label+': tông da/chất liệu '+appearance.skin_tone+'; tóc '+appearance.hair_style+'; gương mặt '+appearance.face_style+'; trang phục '+appearance.outfit+'. Đây là lựa chọn appearance cố định dùng xuyên suốt master và mọi part; không tự đổi thiết kế giữa các stage.');
    if(referenceEnabled)lines.push('Ảnh tham chiếu: hãy đính kèm ảnh trong cuộc trò chuyện ChatGPT. Chỉ giữ những nét người dùng yêu cầu: '+quote(preserve)+'. Hãy lấy cảm hứng từ đặc điểm được nêu; không sao chép nguyên khuôn mặt nếu người dùng không yêu cầu.');
    else lines.push('Không có ảnh tham chiếu được khai báo. Không tự giả định có ảnh.');
    if(outputStage==='concept')lines.push('MASTER CHARACTER FIT: chính diện trong neutral rest pose, góc nhìn gần orthographic với phối cảnh tối thiểu; anatomy sạch, rõ để rig 2D. Giữ tỷ lệ profile '+rigProfile+' theo mục tiêu '+quote(bodyProportions)+'; tránh foreshortening hoặc méo phối cảnh. Đây là chuẩn hình học cho toàn bộ parts: tạo silhouette dễ phân đoạn tại neck, shoulders, elbows, wrists, hip/crotch, knees và ankles; đặt các khớp trái/phải cân đối, dễ nhận biết dưới trang phục.');
    if(outputStage==='concept')lines.push('RIG REFERENCE MASTER: thể hiện một người duy nhất, thẳng chính diện, hai tay hơi tách thân, lòng bàn tay và hai chân thấy rõ, bàn chân hướng trước; không bắt chéo tay/chân, không che khớp bằng phụ kiện. Giữ các mốc joint là hình thể tự nhiên dưới quần áo, KHÔNG vẽ skeleton, xương, chấm màu, nhãn, pivot hoặc tọa độ lên ảnh. Stage tạo parts sẽ dùng silhouette/tỷ lệ/trang phục của master làm chuẩn, không suy ra pixel anchors từ prompt.');
    if(outputStage==='concept')lines.push('Tạo MỘT concept toàn thân trên canvas dọc 4:5, nhân vật chính diện đứng giữa khung, neutral standing rest pose, hai tay và bàn chân thấy trọn, silhouette tách nền rõ và có lề an toàn. Dùng nền phẳng dễ xem, không crop nhân vật. Giữ nhất quán nhận dạng, tỷ lệ, trang phục và phụ kiện; tránh phối cảnh làm sai hình học cơ thể. Đây là concept để duyệt nhân dạng/trang phục, KHÔNG phải artwork rig-ready và KHÔNG tuyên bố đã có skeleton hoặc pivot chính xác.');
    else if(outputStage==='rig_ready_parts'){
      lines.push('RIG PROFILE FIT: '+rigProfile+' target body proportions '+quote(bodyProportions)+'. Match the approved Master Character; do not independently resize one body-part group.');
      lines.push('Tạo các file PNG riêng cho từng part sau. Nếu công cụ hỗ trợ alpha thì dùng nền trong suốt; nếu không, xuất nền phẳng đơn sắc và ghi rõ để xử lý riêng. Dùng canvas vuông hoặc cùng kích thước/cùng origin cho cả bộ; giữ cùng nhân dạng, màu sắc, tỷ lệ, chất liệu và hướng nhìn giữa các part. Nếu crop khác nhau, ghi crop offset; phần nối khớp cần artwork overlap vừa đủ để tránh khe hở.');
      lines.push('Ngoài PNG, trả thêm MỘT file JSON độc lập tên character_'+role+'_rig-sidecar.json. JSON chỉ ghi ý nghĩa part/joint và ghi chú seam; không ghi pivot, anchor pixel, alpha bounds, kích thước đoán, checksum, transform hoặc trạng thái verified. Dùng đúng schema/template dưới đây và đúng tên PNG đã xuất:');
      lines.push(JSON.stringify({schema_version:1,kind:'character_rig_artwork_sidecar',character_id:characterId||'chưa gán',rig_profile:rigProfile,master_reference:'approved Master Character attached in this conversation',look_configuration:appearance,parts:blueprint.map(part=>({part_id:part.part_id,file_name:'character_'+role+'_'+part.part_id+'_v1.png',role:part.role,joint_ids:part.joint_ids||[part.joint_id],orientation:'unspecified',attachment_semantics:{proximal_joint:(part.joint_ids||[part.joint_id])[0],...((part.joint_ids||[])[1]?{distal_joint:(part.joint_ids||[])[1]}:{})},seam_notes:''}))}));
      lines.push('Sidecar là mô tả do AI tạo, chưa được xác minh. Chỉ dùng nó để map tên file, kiểm tra part_id/joint mapping và gợi ý review. Không tự đặt toạ độ pixel; app sẽ giải mã PNG thật để đo geometry rồi mới tạo assembly candidate.');
      lines.push('Danh sách part_id / role / semantic joint:');
      for(const part of blueprint)lines.push('- '+part.part_id+' / '+part.role+' / '+(part.joint_ids||[part.joint_id]).join('+'));
      lines.push('Quy tắc tên file: character_'+role+'_<part_id>_v1.png. Dùng view chính diện, không thêm chữ, bóng nền hoặc nền màu; vùng ngoài nhân vật trong suốt nếu công cụ thực sự hỗ trợ alpha.');
      lines.push(actualLayerOrder.length?'Thứ tự layer z_index hiện có của manifest (từ sau ra trước): '+quote(actualLayerOrder)+'. Giữ thứ tự này trừ khi người dùng chỉnh manifest.':'Gợi ý layer order từ sau ra trước: left/right limbs behind torso, legs behind pelvis, torso behind head/neck overlaps, hands and front-facing accessories above sleeves. Chốt z_index theo artwork thực tế và kiểm tra occlusion thủ công.');
      lines.push('Không vẽ skeleton giả bên trong artwork. Pivot, offsets, bounds, z-order và rig binding sẽ được đặt/kiểm tra thủ công sau khi nhận file.');
      lines.push('GROUP SCOPE: chỉ tạo đúng các canonical part_id được liệt kê trong group đang chọn; không thêm part hoặc lặp ID. Giữ identity, khuôn mặt, màu sắc, chất liệu và trang phục của Master Character. Dùng hướng artwork thân thiện cho rig, vùng proximal/distal rõ, PNG nền trong suốt thật và không marker trong pixel cuối. App đo geometry sau import; tuyệt đối không bịa pixel anchor coordinates.');
      lines.push('PART OWNERSHIP CONTRACT: pelvis chỉ sở hữu cạp quần và khối hông trung tâm; không chứa hai ống đùi. left_thigh/right_thigh mỗi part sở hữu đúng một ống đùi từ háng đến gối; left_shin/right_shin chỉ từ gối đến cổ chân; left_foot/right_foot gồm bàn chân và giày. Không để hai part sở hữu hoặc lặp lại một mảng lớn của cùng trang phục.');
      lines.push('SEAM CONTRACT: kéo artwork vào trong vùng nối vừa đủ để layer kế cận che mép cắt khi joint xoay. Đặt overlap dưới chi tiết che seam (cạp áo, đáy quần, gối, cổ giày); không lặp túi, logo, đường may hoặc silhouette ngoài. Khi ráp rest pose phải khớp silhouette và chi tiết trang phục của master; kiểm tra pose gập để tránh khe hở và lộ mép cắt.');
      lines.push('RIG-READY ARTWORK INSTRUCTIONS: giữ chính diện và quy ước trái/phải nhất quán; tách sạch từng part; không vẽ joint markers, nhãn, skeleton hay pixel metadata vào PNG. Làm rõ vùng nối và overlap vừa đủ; không để các part không liên quan chồng lẫn. Đây là artwork candidate, không tự tuyên bố anchors hoặc metadata đã verified.');
      lines.push('CP2 SOURCE GEOMETRY: bone binding hiện hỗ trợ attachment points tăng theo source X trên cùng hàng ngang. Không tự xoay, crop hoặc làm méo PNG để giả tương thích; artwork dọc dùng joint-bound fitting khi rig hiện tại hỗ trợ. Pixel dimensions, alpha bounds và tọa độ anchor chỉ được xác định sau khi import PNG thật.');
      lines.push('Giới hạn tích hợp: CP2 renderer có thể render PNG parts khi có manifest hợp lệ, rig binding và asset đã được import vào Character Library. Prompt này chỉ đặc tả artwork; không tạo manifest/package import-ready. Sau khi tạo, hãy kiểm tra PNG, rigging, pivots, offsets, z_index và seam thủ công.');
      lines.push('Capability hiện tại: '+quote(current)+'. PNG parts được hỗ trợ; SVG layer import chưa có.');
      if(workflowStage==='head_body')lines.push('Hướng nối Stage B: giữ vùng chồng artwork rõ tại đầu/cổ, thân/hông và eo. Tay áo/thân áo che qua vùng vai; trang phục ở hông che điểm đầu đùi. Che seam bằng layer trang phục phù hợp, không kéo giãn xương.');
      if(workflowStage==='head_body')lines.push('Ranh giới pelvis Stage B: pelvis là cạp quần và vùng hông trung tâm, dừng tại đường ráp tự nhiên ngay dưới đáy quần/háng. Không vẽ lại hoặc kéo dài hai ống đùi vào pelvis; hai ống đùi thuộc riêng left_thigh và right_thigh ở Stage D. Mép dưới pelvis overlap vừa đủ để che đầu trên của hai đùi.');
      if(workflowStage==='arms')lines.push('Hướng nối Stage C: ghi rõ attachment tại vai, nối khuỷu và cổ tay/bàn tay cho cả hai bên. Artwork tay trên và cẳng tay cần overlap đủ để che khớp; giữ mép tay áo/cổ tay thống nhất với master design.');
      if(workflowStage==='legs')lines.push('Hướng nối Stage D: ghi rõ hông/đùi, đầu gối và cổ chân/bàn chân. Quần che gốc đùi, cẳng chân nối kín đầu gối và giày che attachment cổ chân; dùng overlap artwork thay vì kéo xương.');
      if(workflowStage==='legs')lines.push('Ranh giới part chân Stage D: left_thigh và right_thigh là hai ống đùi riêng, mỗi part bắt đầu dưới mép che pelvis tại háng và kết thúc dưới mép che shin tại gối. left_shin/right_shin là đoạn riêng từ dưới gối đến trên cổ giày; left_foot/right_foot sở hữu bàn chân và giày. Không đưa cả hai ống quần vào pelvis, không gộp hai chân vào một part. Rest pose sau khi ráp phải khớp độ rộng, đường may, túi và silhouette của master.');
      if(workflowStage&&workflowStage!=='all_parts')lines.push('Chỉ tạo part candidate thuộc stage đang chọn. Ưu tiên tạo từng part riêng. Nếu công cụ không thể trả nhiều file độc lập, hãy tạo contact sheet để duyệt rồi crop thủ công hoặc dùng công cụ riêng. Tạo lại riêng từng part lỗi; sheet không phải các asset import độc lập.');
    }
    else {lines.push('Giai đoạn E — QA & hướng dẫn xuất file. Không tạo artwork mới trong stage này; chỉ trả checklist kiểm tra và hướng dẫn xuất.');lines.push('Kiểm tra từng part bắt buộc: '+quote(blueprint.map(part=>part.part_id))+'; xác nhận không thiếu hoặc lặp part ID.');lines.push('Với mỗi file, kiểm tra alpha PNG thật bằng image viewer; nếu không có alpha, ghi rõ nền phẳng để xử lý riêng. Ghi kích thước pixel thực tế, canvas/origin dùng chung, crop bounds và offsets; không tự đặt kích thước chưa đo.');lines.push('Ghi pivot theo pixel ảnh nguồn, semantic joint attachment, vùng overlap/occlusion và z_index. Layer order từ manifest nếu có: '+quote(actualLayerOrder.length?actualLayerOrder:'Manifest chưa có z_index; cần sắp thứ tự và kiểm tra thủ công.')+'. Kiểm tra khe hở tại đầu/thân, vai/khuỷu/cổ tay và hông/gối/cổ chân.');lines.push('Quy tắc tên: character_'+role+'_<part_id>_v1.png. Tạo lại riêng part lỗi hoặc crop review sheet thủ công/bằng công cụ riêng. Không gọi sheet hoặc ZIP là package asset đã validate.');lines.push('Trạng thái asset: concept preview → part candidate → validated PNG asset (sau khi kiểm tra file/alpha/kích thước/binding) → rig-ready imported asset (sau import, manifest validation và preview). Chỉ có prompt/output không làm asset thành validated.');}
    if(workflowStage&&workflowStage!=='master')lines.push('Giữ nhất quán master: đính kèm Master Character Artwork đã duyệt trực tiếp trong cuộc trò chuyện ChatGPT này. Dùng cùng Character Design Specification; không lấy hoặc tải ảnh từ dịch vụ bên ngoài.');
    if(outputStage==='qa')lines.push('Dùng checklist Stage E để phân loại kết quả; chỉ gọi là validated PNG asset sau khi kiểm tra file thật, và chỉ gọi là rig-ready imported asset sau khi import/validate/preview.');
    else if(outputStage==='rig_ready_parts'&&workflowStage!=='all_parts')lines.push('Sau khi nhận part candidate của stage này: đối chiếu với master, xác nhận part/joint ID, alpha, kích thước/crop và vùng overlap. Đây chưa phải asset validated hoặc rig-ready imported.');
    else lines.push('Sau khi nhận concept: kiểm tra đủ toàn thân, tỷ lệ và nhận dạng; sau đó rigging thủ công theo M1 joints '+quote(rigProfiles[rigProfile].joints)+'; preview rest pose/pose xoay khớp và sửa seam trước khi duyệt.');
  }else{
    lines.push('# CHARACTER ARTWORK PROMPT — '+(outputStage==='concept'?'CONCEPT':outputStage==='qa'?'QA & EXPORT':'RIG-READY PARTS'));
    lines.push('Character Design Specification — ID: '+quote(characterId||'unassigned')+'.');
    lines.push('Role: '+role+' ('+roles[role]+'). Style: '+styles[style]+'. Rig profile: '+rigProfile+'.');
    if(motionStyle)lines.push('Draft motion style profile: '+motionStyle+'. This is descriptive metadata; do not change the rig or action timeline.');
    lines.push('User description: '+quote(description||'No additional description.'));
    lines.push('Reference body proportions (head/body, shoulder/head, torso/body, arm/body, leg/body): '+quote(bodyProportions)+'. Keep them consistent; they are concept guidance, not resolver bone dimensions.');
    lines.push('Hair: '+quote(hair||'Follow the description or a natural design choice.'));lines.push('Face: '+quote(facialFeatures));lines.push('Clothing: '+quote(clothing));lines.push('Accessories: '+quote(accessories));lines.push('Keep this color palette consistent: '+quote(colors||['Follow approved master artwork or user choice']));
    lines.push('STARTER APPEARANCE — '+appearance.profile.label+': skin/material '+appearance.skin_tone+'; hair '+appearance.hair_style+'; face '+appearance.face_style+'; outfit '+appearance.outfit+'. These are locked appearance choices shared by the master and every part; do not redesign them between stages.');
    if(referenceEnabled)lines.push('Reference image: attach it to the ChatGPT conversation. Preserve only these user-selected traits: '+quote(preserve)+'. Use them as inspiration; do not reproduce the exact face unless explicitly requested.');
    else lines.push('No reference image was declared; do not assume one.');
    if(outputStage==='concept')lines.push('MASTER CHARACTER FIT: front-facing neutral rest pose, orthographic-like view with minimal perspective, and clean readable anatomy for downstream 2D rigging. Match the '+rigProfile+' Rig Profile target proportions '+quote(bodyProportions)+'; avoid foreshortening and perspective distortion. This master is the geometry reference for every part: keep the silhouette easy to segment at neck, shoulders, elbows, wrists, hip/crotch, knees and ankles, with balanced, clearly readable left/right joints beneath clothing.');
    if(outputStage==='concept')lines.push('RIG REFERENCE MASTER: show one character standing straight toward camera, arms slightly separated from the torso, hands and both legs clearly visible, feet facing forward; do not cross limbs or hide joints with accessories. Keep joint locations as natural anatomy beneath clothing. Do NOT draw a skeleton, bones, colored dots, labels, pivots or coordinates on the image. Later part prompts will use this master silhouette, proportions and costume as the source of truth; do not infer pixel anchors from prompt text.');
    if(outputStage==='concept')lines.push('Create ONE full-body concept on a 4:5 portrait canvas, centered and front-facing in a neutral standing rest pose, with hands and feet visible, a clear silhouette and safe margins. Use a simple review-friendly background and do not crop the character. Keep the same identity, proportions, clothing and accessories; avoid perspective that alters body geometry. This is a design concept for review, NOT rig-ready art and does not contain a guaranteed skeleton or accurate pivots.');
    else if(outputStage==='rig_ready_parts'){
      lines.push('RIG PROFILE FIT: '+rigProfile+' target body proportions '+quote(bodyProportions)+'. Match the approved Master Character; do not independently resize one body-part group.');
      lines.push('Create separate PNG files for the parts below. Use transparent alpha only if the image tool supports it; otherwise use a flat solid background and label it for separate processing. Use square canvases or the same size/shared origin across the set; keep identity, colors, proportions, materials and facing consistent. Document any crop offsets; add enough artwork overlap at joints to prevent visible gaps.');
      lines.push('Alongside the PNGs, return ONE standalone JSON file named character_'+role+'_rig-sidecar.json. It records semantic part/joint mapping and seam notes only; do not include pixel pivots/anchors, alpha bounds, guessed dimensions, checksums, transforms or verified status. Follow this exact schema/template and use the exact exported PNG filenames:');
      lines.push(JSON.stringify({schema_version:1,kind:'character_rig_artwork_sidecar',character_id:characterId||'unassigned',rig_profile:rigProfile,master_reference:'approved Master Character attached in this conversation',look_configuration:appearance,parts:blueprint.map(part=>({part_id:part.part_id,file_name:'character_'+role+'_'+part.part_id+'_v1.png',role:part.role,joint_ids:part.joint_ids||[part.joint_id],orientation:'unspecified',attachment_semantics:{proximal_joint:(part.joint_ids||[part.joint_id])[0],...((part.joint_ids||[])[1]?{distal_joint:(part.joint_ids||[])[1]}:{})},seam_notes:''}))}));
      lines.push('This AI-authored sidecar is unverified. Use it only to map filenames, check part_id/joint mapping and guide review. Never invent pixel coordinates; the app decodes the actual PNGs, measures geometry, then creates the assembly candidate.');
      lines.push('part_id / role / semantic joint:');for(const part of blueprint)lines.push('- '+part.part_id+' / '+part.role+' / '+(part.joint_ids||[part.joint_id]).join('+'));
      lines.push('File naming: character_'+role+'_<part_id>_v1.png. Front view, no text, cast background shadow or colored background; keep outside pixels transparent when the image tool truly supports alpha.');
      lines.push(actualLayerOrder.length?'Existing manifest z_index order, back to front: '+quote(actualLayerOrder)+'. Keep it unless the user explicitly edits the manifest.':'Suggested back-to-front layer order: limbs behind torso, legs behind pelvis, torso behind head/neck overlaps, hands and foreground accessories above sleeves. Set z_index from the actual artwork and inspect occlusion manually.');
      lines.push('Do not draw a pretend skeleton into the artwork. Pivots, offsets, bounds, z-order and rig bindings are assigned and checked manually after delivery.');
      lines.push('GROUP SCOPE: create only the exact canonical part IDs listed for the selected group; add no extra parts or duplicate IDs. Preserve identity, face, colors, materials and costume from the approved Master Character. Use rig-friendly orientation and clear proximal/distal attachment regions. Export clean transparent PNGs with no markers in final pixels. The app measures geometry after import; never fabricate pixel anchor coordinates.');
      lines.push('PART OWNERSHIP CONTRACT: pelvis owns only the waistband and central hip/crotch mass; it must not contain either full thigh tube. left_thigh/right_thigh each own exactly one leg section from hip to knee; left_shin/right_shin own knee to ankle only; left_foot/right_foot own the foot and shoe. Do not let two parts own or duplicate a large area of the same garment.');
      lines.push('SEAM CONTRACT: extend artwork inside each joint seam just enough for the neighboring layer to cover the cut edge during rotation. Put overlap under the intended seam cover (waistband, crotch, knee, shoe cuff); do not duplicate pockets, logos, seams or the outer silhouette. Reassembled rest pose must match the master silhouette and costume details; inspect bent joints for gaps and exposed cut edges.');
      lines.push('RIG-READY ARTWORK INSTRUCTIONS: keep a consistent front-facing view and left/right convention; separate every requested part cleanly; do not draw joint markers, labels, skeletons or metadata pixels into PNGs. Make attachment regions clear with enough intentional artwork overlap, and avoid unrelated parts overlapping. This is candidate artwork; do not claim anchors or metadata are verified.');
      lines.push('CP2 SOURCE GEOMETRY: bone binding currently supports increasing source-X attachment points on one horizontal row. Do not rotate, crop or distort the original PNG to imitate compatibility; portrait artwork uses joint-bound fitting when supported by the active rig. Pixel dimensions, alpha bounds and anchor coordinates are derived only after importing the actual PNG.');
      lines.push('Integration limit: the CP2 renderer supports PNG parts when a valid manifest, rig bindings and imported Character Library assets are supplied. This prompt describes artwork only; it does not create an import-ready manifest/package. Inspect PNGs, rigging, pivots, offsets, z_index and seams manually.');
      lines.push('Current capabilities: '+quote(current)+'. PNG parts are supported; SVG layer import is not available.');
      if(workflowStage==='head_body')lines.push('Stage B attachment notes: preserve visible overlap at neck/head, torso/pelvis and waist. Extend sleeves/torso cloth across shoulder attachment zones; keep pelvis garment overlap over thigh roots. Hide seams with intended clothing layers, not by stretching bones.');
      if(workflowStage==='head_body')lines.push('Stage B pelvis boundary: pelvis is only the waistband and central hip mass, ending at the natural seam just below the crotch. Do not redraw or extend either full trouser leg into pelvis; both thighs belong only to left_thigh and right_thigh in Stage D. Leave enough inner overlap at the pelvis bottom to cover the top of both thigh parts.');
      if(workflowStage==='arms')lines.push('Stage C attachment notes: document shoulder attachment, elbow connection and wrist-to-hand connection on both sides. Upper-arm and forearm artwork must overlap enough to cover joints; keep sleeve/cuff edges consistent with the master design.');
      if(workflowStage==='legs')lines.push('Stage D attachment notes: document hip-to-thigh, knee and ankle-to-foot connections. Trousers overlap hip/thigh roots, shin coverage meets the knee, and shoes cover ankle attachment; use artwork overlap rather than bone stretching.');
      if(workflowStage==='legs')lines.push('Stage D leg boundaries: left_thigh and right_thigh are separate single-leg tubes, each starting under the pelvis cover at the hip and ending under the shin cover at the knee. left_shin/right_shin are separate knee-to-upper-ankle sections; left_foot/right_foot own the foot/shoe. Never put both trouser legs into pelvis or combine both legs into one part. The assembled rest pose must reproduce the master width, seams, pockets and silhouette.');
      if(workflowStage&&workflowStage!=='all_parts')lines.push('Create only selected stage part candidates. Prefer one part per generation. If the image tool cannot return independent files, make a clearly separated review sheet and crop manually or with a separate tool. Regenerate failed parts individually; a sheet is not a set of imported assets.');
    }
    else {lines.push('Stage E — QA & export checklist. Do not generate new artwork in this stage; return inspection and export instructions only.');lines.push('Check each required part: '+quote(blueprint.map(part=>part.part_id))+'; confirm no missing or duplicate part IDs.');lines.push('For every file, inspect true PNG alpha; if unavailable, label the flat background for separate processing. Record actual pixel dimensions, shared canvas/origin, crop bounds and offsets; do not invent dimensions.');lines.push('Document each part pivot in source-image pixels, semantic attachment joint(s), measured overlap/occlusion and z_index back-to-front from actual artwork/manifest. Manifest order when supplied: '+quote(actualLayerOrder.length?actualLayerOrder:'No z_index values supplied; assign and validate order manually.')+'. Check head/body, shoulders/elbows/wrists, hips/knees/ankles for gaps.');lines.push('Naming: character_'+role+'_<part_id>_v1.png. Regenerate an individual failed part or crop a review sheet manually/separately; do not claim a sheet or ZIP is a validated package.');lines.push('Asset state: concept preview → part candidate → validated PNG asset after file/alpha/dimension/binding checks → rig-ready imported asset after import, manifest validation and preview. Prompt output alone is not a validated asset.');}
    if(workflowStage&&workflowStage!=='master')lines.push('Master consistency: attach approved Master Character Artwork directly in this ChatGPT conversation and use the same Character Design Specification. Do not fetch or upload it from an external service.');
      if(outputStage==='qa')lines.push('Use Stage E to label the result honestly; only call it a validated PNG asset after checking the actual file, and rig-ready imported only after import, validation and preview.');
      else if(outputStage==='rig_ready_parts'&&workflowStage!=='all_parts')lines.push('After receiving this stage part candidate, compare it with the master, verify part/joint IDs, alpha, dimensions/crop and attachment overlap. It is not yet a validated or rig-ready imported asset.');
      else lines.push('After receiving the concept, inspect full-body coverage, proportions and identity; then manually rig using M1 joints '+quote(rigProfiles[rigProfile].joints)+'; preview rest pose/joint rotations and repair seams before approval.');
  }
  return{prompt:lines.join('\n'),output_stage:outputStage,language,rig_profile:rigProfile,...(motionStyle?{motion_style:motionStyle}:{}),body_proportions:bodyProportions,starter_appearance:appearance,parts:outputStage==='rig_ready_parts'?blueprint:outputStage==='qa'?blueprint:[],asset_naming_rule:'character_'+role+'_<part_id>_v1.png',output_canvas:outputStage==='concept'?'4:5 portrait':'square or shared dimensions with common origin',capabilities:current};
}

export function generateCharacterArtworkStagePrompt(config={}){
  const stage=String(config.workflow_stage||'master');
  const stageDefinition=characterArtworkStages.find(item=>item.id===stage);
  if(!stageDefinition)throw new Error('Unsupported artwork workflow stage "'+stage+'".');
  const parts=stage==='master'?[]:resolveArtworkPromptParts({manifest:config.manifest,rig:config.rig});
  const groups=stage==='master'?{head_body:[],arms:[],legs:[]}:groupArtworkPromptParts(parts);
  const selected=stageDefinition.group==='master'?[]:stageDefinition.group==='qa'?parts:groups[stageDefinition.group];
  const output_stage=stage==='master'?'concept':stage==='qa'?'qa':'rig_ready_parts';
  const result=generateCharacterArtworkPrompt({...config,parts:selected,workflow_stage:stage,output_stage});
  const vi=config.language!=='en';
  const shared=vi?['=== THÔNG SỐ THIẾT KẾ NHÂN VẬT DÙNG CHUNG ===',
    'Character ID: '+JSON.stringify(String(config.character_id||'chưa gán')),
    'Phong cách artwork: '+String(config.style||'educational_cartoon')+'. Rig profile: '+String(config.rig_profile||'adult')+'.',
    'Mô tả nhân vật: '+JSON.stringify(String(config.description||'')),
    'Tóc: '+JSON.stringify(String(config.hair||''))+'; khuôn mặt: '+JSON.stringify(config.facial_features||[])+'.',
    'Trang phục: '+JSON.stringify(config.clothing||[])+'; phụ kiện: '+JSON.stringify(config.accessories||[])+'; bảng màu: '+JSON.stringify(config.colors||[])+'.',
    'Tỷ lệ cơ thể: '+JSON.stringify(config.body_proportions||result.body_proportions)+'.',
    'Hướng dẫn ảnh tham chiếu: '+(config.reference_guidance?.enabled?'đính kèm ảnh do người dùng cung cấp trực tiếp trong cuộc trò chuyện ChatGPT này; chỉ giữ: '+JSON.stringify(config.reference_guidance.preserve||[]):'chưa chọn ảnh tham chiếu; không tự giả định hoặc lấy ảnh từ dịch vụ bên ngoài.'),
    'Khóa nhận dạng: giữ nguyên nhân vật, khuôn mặt, tóc, bảng màu, trang phục, phụ kiện và tỷ lệ ở mọi stage; không thiết kế lại giữa các prompt.',
    'Master Character Artwork: '+(stage==='master'?'tạo và duyệt một concept toàn thân trước. Đây chỉ là concept preview.':'dùng Master Character Artwork đã duyệt làm nguồn nhận dạng. Đính kèm trực tiếp trong cuộc trò chuyện ChatGPT; không lấy hoặc tải từ dịch vụ bên ngoài.')]:['=== SHARED CHARACTER DESIGN SPECIFICATION ===',
    'Character ID: '+JSON.stringify(String(config.character_id||'unassigned')),
    'Appearance style: '+String(config.style||'educational_cartoon')+'. Rig profile: '+String(config.rig_profile||'adult')+'.',
    'Character description: '+JSON.stringify(String(config.description||'')),
    'Hair: '+JSON.stringify(String(config.hair||''))+'; face: '+JSON.stringify(config.facial_features||[])+'.',
    'Clothing: '+JSON.stringify(config.clothing||[])+'; accessories: '+JSON.stringify(config.accessories||[])+'; color palette: '+JSON.stringify(config.colors||[])+'.',
    'Proportions: '+JSON.stringify(config.body_proportions||result.body_proportions)+'.',
    'Reference guidance: '+(config.reference_guidance?.enabled?'attach user-provided reference image directly in this ChatGPT conversation and preserve only: '+JSON.stringify(config.reference_guidance.preserve||[]):'no reference image selected; do not assume one or retrieve one externally.'),
    'Identity lock: keep the same person/character, face, hair, palette, clothing, accessories and body proportions across all stages; do not redesign the character between prompts.',
    'Master character artwork: '+(stage==='master'?'Create and review one full-body master concept first. It is a concept preview only.':'The approved Master Character Artwork is the identity source. Attach it directly in this ChatGPT conversation for consistency; do not fetch or upload it from an external service.')];
  const stageLabel=vi?({master:'GIAI ĐOẠN A — MASTER CHARACTER',head_body:'GIAI ĐOẠN B — ĐẦU & THÂN',arms:'GIAI ĐOẠN C — TAY',legs:'GIAI ĐOẠN D — CHÂN',qa:'GIAI ĐOẠN E — QA & HƯỚNG DẪN XUẤT FILE'}[stage]):stageDefinition.label.toUpperCase();
  const stageTitle=vi?'=== HƯỚNG DẪN RIÊNG CHO STAGE ===':'=== STAGE INSTRUCTIONS ===';
  const rigReadyMetadataTemplates=stage==='master'||stage==='qa'?[]:createRigReadyMetadataTemplates({characterId:config.character_id||'',rigProfile:config.rig_profile||'adult',bodyProportions:config.body_proportions||result.body_proportions,rig:config.rig,parts:selected,group:stageDefinition.group});
  const templateGuide=rigReadyMetadataTemplates.length?(vi?['=== HƯỚNG DẪN ANCHOR TỪ RIG (KHÔNG PHẢI TỌA ĐỘ PIXEL) ===',...rigReadyMetadataTemplates.map(item=>'- '+item.part_id+': proximal '+item.proximal_anchor.joint+(item.distal_anchor?' → distal '+item.distal_anchor.joint:'')+'; expected orientation '+item.orientation.expected+'; coordinate source_image_px sẽ được đo sau import.')]:['=== RIG ANCHOR GUIDE (SEMANTICS, NOT PIXEL LOCATIONS) ===',...rigReadyMetadataTemplates.map(item=>'- '+item.part_id+': proximal '+item.proximal_anchor.joint+(item.distal_anchor?' → distal '+item.distal_anchor.joint:'')+'; expected orientation '+item.orientation.expected+'; source_image_px coordinates are measured only after import.')]):[];
  return{...result,workflow_stage:stage,stage_label:stageDefinition.label,parts:selected,all_parts:parts,part_groups:groups,rig_ready_metadata_templates:rigReadyMetadataTemplates,prompt:['=== '+stageLabel+' ===',...shared,stageTitle,result.prompt,...templateGuide].join('\n')};
}

export const characterPromptRoles=Object.freeze(Object.keys(roles));
export const characterPromptRigProfiles=Object.freeze(Object.keys(rigProfiles));
export const characterPromptPartBlueprint=partBlueprint;
