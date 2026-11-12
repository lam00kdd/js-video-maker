import { drawHumanCharacter } from '../src/render/object-scene-renderer.js';
import { createProceduralAdultCharacter, resolveProceduralGeometryBounds } from '../src/render/character-procedural.js';

const canvas=document.querySelector('#canvas'),ctx=canvas.getContext('2d'),motion=document.querySelector('#motion'),joint=document.querySelector('#joint'),angle=document.querySelector('#angle'),diagnostics=document.querySelector('#diagnostics'),styleKeys=['skin','hair','shirt','trousers','shoe','outline'];let started=performance.now(),lastCharacter=null;
function render(now=performance.now()){
  const selectedMotion=motion.value,time=((now-started)/1000)%8,style={...Object.fromEntries(styleKeys.map(key=>[key,document.querySelector('#'+key).value])),hair_style:document.querySelector('#hair-style').value,shoe_style:document.querySelector('#shoe-style').value,uniform_pattern:document.querySelector('#uniform-pattern').value},testJointId=joint.value;
  lastCharacter=createProceduralAdultCharacter({style,motion:selectedMotion,time,testJointId,testRotation:Number(angle.value)*Math.PI/180,transform:{x:.5,y:.5,scale:1.1,rotation:0,opacity:1}});
  ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#131a24';ctx.fillRect(0,0,canvas.width,canvas.height);drawHumanCharacter(ctx,lastCharacter,canvas.width,canvas.height);
  if(diagnostics.value==='on')drawDiagnostics(lastCharacter);
  document.querySelector('#angle-label').textContent=`${Number(angle.value)>0?'+':''}${angle.value}°`;
  const d=lastCharacter.diagnostics;document.querySelector('#summary').textContent=`Profile adult · ${d.joint_ids.length} M1 joints · ${d.primitive_count} vector primitives · ${d.limb_contract_count} jointed segments · ${d.joint_connector_count} overlap/shoulder connectors · ${d.asset_free?'no PNG assets':''}`;
  const adjacent=lastCharacter.geometry.filter(item=>item.limb_contract&&(item.limb_contract.proximal_anchor.joint_id===joint.value||item.limb_contract.distal_anchor.joint_id===joint.value)),connector=lastCharacter.geometry.find(item=>item.joint_connector?.joint_id===joint.value||item.joint_connector?.anchor_joint_id===joint.value),lines=adjacent.map(item=>`${item.primitive_id}: ${item.limb_contract.proximal_anchor.joint_id} → ${item.limb_contract.distal_anchor.joint_id}; pivot=${item.pivot.joint_id}; overlap P/D=${item.limb_contract.overlap.proximal_rig_units.toFixed(3)}/${item.limb_contract.overlap.distal_rig_units.toFixed(3)}; z=${item.z_index}`);if(connector)lines.push(`${connector.primitive_id}: ${connector.joint_connector.kind} ${connector.shape.width.toFixed(3)}×${connector.shape.height.toFixed(3)} rig units; z=${connector.z_index}`);document.querySelector('#joint-details').textContent=lines.length?lines.join(' · '):`No segment bound at ${joint.value}.`;
  document.querySelector('#parts').innerHTML=d.part_ids.map(id=>`<span>${id}</span>`).join('');
  requestAnimationFrame(render);
}
function drawDiagnostics(character){
  const unit=Math.min(canvas.width,canvas.height),pose=character.pose;
  ctx.save();ctx.lineWidth=1.5;ctx.strokeStyle='#39e0b0';ctx.fillStyle='#39e0b0';
  for(const item of resolveProceduralGeometryBounds(character)){if(item.status!=='ready')continue;const scale=pose.joints[item.joint_id].scale;ctx.save();ctx.translate(item.center.x,item.center.y);ctx.rotate(item.rotation);ctx.strokeRect(-item.shape.width*unit*scale/2,-item.shape.height*unit*scale/2,item.shape.width*unit*scale,item.shape.height*unit*scale);ctx.restore();}
  for(const source of character.rig.joints){const p=pose.joints[source.id];ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fill();}
  ctx.restore();
}
for(const input of document.querySelectorAll('input,select'))input.addEventListener('input',()=>{if(input===motion)started=performance.now();if(lastCharacter)render();});
for(const button of document.querySelectorAll('[data-angle]'))button.addEventListener('click',()=>{angle.value=button.dataset.angle;render();});
requestAnimationFrame(render);
