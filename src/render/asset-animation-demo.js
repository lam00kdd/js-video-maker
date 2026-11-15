const clamp = (n, min = 0, max = 1) => Math.max(min, Math.min(max, n));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => lerp(a, b, ease(t));
const TAU = Math.PI * 2;

/** Small deterministic scene-graph example: all state is reconstructed from absolute time. */
export const measurementDemo = Object.freeze({
  version: 1, id: 'measure-length-demo', duration: 8, measurement: { value_cm: 5 },
  background_asset: 'classroom_lab_01',
  entities: [
    { id: 'lab', asset_id: 'classroom_lab_01', kind: 'background', transform: { x: 0, y: 0, scale: 1 } },
    { id: 'student', asset_id: 'student_child_01', kind: 'rigged_character', transform: { x: 300, y: 642, scale: 1 }, properties: { facing: 'right' } },
    { id: 'ruler', asset_id: 'ruler_30cm', kind: 'articulated_prop', transform: { x: 460, y: 506, scale: 1 } },
    { id: 'block', asset_id: 'wood_block', kind: 'prop', transform: { x: 790, y: 500, scale: 1 } }
  ],
  timeline: [
    { at: .2, entity: 'student', method: 'walk_to', params: { x: 600, duration: 1.25 } },
    { at: 1.65, entity: 'student', method: 'reach', params: { x: 790, y: 497, duration: .8, hand: 'right' } },
    { at: 2.45, entity: 'student', method: 'pick_up', params: { target: 'block', hand: 'right', duration: .3 } },
    { at: 2.75, entity: 'student', method: 'place', params: { target: 'block', anchor: 'ruler.zero_mark', duration: .75 } },
    { at: 3.55, entity: 'student', method: 'step_back', params: { x: 450, duration: .55 } },
    { at: 4.2, entity: 'student', method: 'point_to', params: { target: 'ruler.measurement_mark', duration: .65, hand: 'right' } }
  ],
  events: [
    { at: 2.45, method: 'attach', entity: 'block', to: 'student.hand.right' },
    { at: 3.5, method: 'detach', entity: 'block', anchor: 'ruler.zero_mark' }
  ]
});

function command(scene, method) { return scene.timeline.find(item => item.method === method); }
function progress(time, start, duration) { return ease((time - start) / duration); }
function measurementGeometry(scene) {
  const ruler = scene.entities.find(entity => entity.asset_id === 'ruler_30cm');
  const scale = ruler.transform.scale, valueCm = Number(scene.measurement?.value_cm ?? 5);
  const zeroX = ruler.transform.x + 40 * scale, rulerY = ruler.transform.y;
  return { ruler, scale, valueCm, zeroX, zeroY: rulerY, markX: zeroX + valueCm * 24 * scale, markY: rulerY, blockCenterX: zeroX + valueCm * 12 * scale, blockCenterY: rulerY - 6 * scale };
}
export function resolveMeasurementState(scene, time) {
  const walk = command(scene, 'walk_to'), reach = command(scene, 'reach'), pick = command(scene, 'pick_up'), place = command(scene, 'place'), stepBack = command(scene, 'step_back'), point = command(scene, 'point_to');
  const student = scene.entities.find(entity => entity.asset_id === 'student_child_01'), blockEntity = scene.entities.find(entity => entity.asset_id === 'wood_block');
  const attachEvent = scene.events.find(event => event.method === 'attach'), detachEvent = scene.events.find(event => event.method === 'detach');
  const measurement = measurementGeometry(scene), blockEnd = { x: measurement.blockCenterX, y: measurement.blockCenterY };
  const pointHand = { x: measurement.markX - 25, y: measurement.markY + 17 };
  const rootStart = student.transform.x, rootEnd = walk.params.x, walkProgress = clamp((time - walk.at) / walk.params.duration), walkT = progress(time, walk.at, walk.params.duration);
  const actorX = time < walk.at ? rootStart : time < walk.at + walk.params.duration ? mix(rootStart, rootEnd, walkT) : time < stepBack.at ? rootEnd : mix(rootEnd, stepBack.params.x, progress(time, stepBack.at, stepBack.params.duration));
  const walkEnd=walk.at+walk.params.duration,walkWeight=time<walk.at?0:time<walkEnd?ease(clamp(walkProgress*4)):time<walkEnd+.22?1-ease((time-walkEnd)/.22):0,walking=walkWeight>0,walkPhase=walkProgress*Math.PI*4;
  const armSwing = -Math.sin(walkPhase) * 8 * walkWeight;
  const restingHand = { x: actorX + 104 + armSwing, y: 486 + Math.abs(armSwing) * .16 };
  const blockStart = { x: blockEntity.transform.x, y: blockEntity.transform.y };
  const reachT = progress(time, reach.at, reach.params.duration);
  const blockPickupT = progress(time, pick.at, pick.params.duration);
  const placeT = progress(time, place.at, place.params.duration);
  let hand = restingHand, handAction = 'relaxed';
  if (time >= reach.at && time < pick.at + pick.params.duration) {
    hand = { x: mix(restingHand.x, reach.params.x, reachT), y: mix(restingHand.y, reach.params.y, reachT) };
    handAction = time < pick.at ? 'open' : 'grip';
  }
  if (time >= pick.at + pick.params.duration && time < place.at + place.params.duration) {
    hand = { x: mix(blockStart.x, blockEnd.x, placeT), y: mix(blockStart.y, blockEnd.y, placeT) - Math.sin(Math.PI * placeT) * 42 };
    handAction = 'grip';
  }
  const placeEnd = place.at + place.params.duration, stepBackEnd = stepBack.at + stepBack.params.duration;
  if (time >= placeEnd && time < stepBackEnd) {
    const retractT = progress(time, placeEnd, stepBackEnd - placeEnd);
    hand = { x: mix(blockEnd.x, restingHand.x, retractT), y: mix(blockEnd.y, restingHand.y, retractT) };
    handAction = 'relaxed';
  }
  if (time >= point.at) {
    const pointT = progress(time, point.at, point.params.duration);
    hand = { x: mix(restingHand.x, pointHand.x, pointT), y: mix(restingHand.y, pointHand.y, pointT) };
    handAction = 'point';
  }
  let block = blockStart;
  if (time >= attachEvent.at && time < pick.at + pick.params.duration) {
    block = { x: mix(blockStart.x, hand.x, blockPickupT), y: mix(blockStart.y, hand.y, blockPickupT) };
  } else if (time >= pick.at + pick.params.duration && time < detachEvent.at) {
    block = { x: hand.x, y: hand.y + 8 };
  } else if (time >= detachEvent.at) block = blockEnd;
  const pickupEnd = pick.at + pick.params.duration;
  const reaching = time >= reach.at && time < pickupEnd, carrying = time >= pickupEnd && time < placeEnd;
  const reachProgress = clamp((time - reach.at) / (pickupEnd - reach.at));
  const lean = reaching ? reachProgress * 12 : carrying ? (1 - placeT) * 12 : 0;
  const crouch = reaching ? Math.sin(Math.PI * reachProgress) * 9 : carrying ? Math.sin(Math.PI * placeT) * 3 : 0;
  const gazeTarget = time < pick.at ? blockStart : time < placeEnd ? hand : time < point.at ? blockEnd : { x: measurement.markX, y: measurement.markY };
  return { time, actor: { x: actorX, groundY: 642, hand, handAction, walking, walkWeight, walkPhase, lean, crouch, gazeX: clamp((gazeTarget.x - actorX) / 170, -.5, .65), gazeY: clamp((gazeTarget.y - 396) / 130, -.25, .65) }, block, showResult: time >= point.at + .25 };
}

function rounded(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function line(ctx, a, b, width, color) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineWidth = width; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.stroke(); }
function drawBackground(ctx, w, h) {
  const wall = ctx.createLinearGradient(0, 0, 0, h); wall.addColorStop(0, '#e8f0ec'); wall.addColorStop(.7, '#d2e1db'); wall.addColorStop(1, '#b4c8be'); ctx.fillStyle = wall; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#f7f8ef'; rounded(ctx, 72, 78, 370, 236, 16); ctx.fill(); ctx.strokeStyle = '#b9cec5'; ctx.lineWidth = 7; ctx.stroke();
  ctx.fillStyle = '#b9dce4'; ctx.fillRect(86, 92, 342, 208); ctx.fillStyle = '#d8edf0'; ctx.fillRect(86, 92, 342, 104); ctx.fillStyle = '#86a99d'; ctx.fillRect(86, 288, 342, 12);
  ctx.strokeStyle = '#f7f8ef'; ctx.lineWidth = 10; line(ctx, {x:257,y:92}, {x:257,y:300}, 10, '#f7f8ef');
  ctx.fillStyle = '#698a7e'; ctx.font = '600 19px system-ui'; ctx.textAlign = 'left'; ctx.fillText('PHÒNG THỰC HÀNH KHOA HỌC', 78, 54);
  ctx.fillStyle = '#91aa9d'; ctx.fillRect(0, 642, w, 78); ctx.fillStyle = '#d2b88d'; ctx.fillRect(0, 642, w, 8);
  for (let x=38;x<w;x+=82){ctx.strokeStyle='#c1a77e55';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,654);ctx.lineTo(x-18,720);ctx.stroke();}
  ctx.fillStyle='#a9bfaf';rounded(ctx,1040,124,156,374,20);ctx.fill();ctx.fillStyle='#7c9c88';rounded(ctx,1060,145,116,333,12);ctx.fill();
  for(let row=0;row<4;row++)for(let col=0;col<2;col++){const bx=1070+col*48,by=166+row*72;ctx.fillStyle=['#dcae67','#6aa6aa','#c97f68','#8c9bc0'][(row+col)%4];rounded(ctx,bx,by,38,53,5);ctx.fill();ctx.fillStyle='#fff7dc';ctx.fillRect(bx+7,by+8,24,3);}
}
function drawTable(ctx) {
  ctx.fillStyle='#00000027';ctx.beginPath();ctx.ellipse(755,604,370,24,0,0,TAU);ctx.fill();
  const top=ctx.createLinearGradient(0,535,0,570);top.addColorStop(0,'#d6a66d');top.addColorStop(1,'#9b6747');ctx.fillStyle=top;rounded(ctx,420,535,670,36,9);ctx.fill();
  const legs=ctx.createLinearGradient(0,570,0,640);legs.addColorStop(0,'#9a6748');legs.addColorStop(1,'#654b40');ctx.fillStyle=legs;rounded(ctx,460,564,22,78,5);ctx.fill();rounded(ctx,1025,564,22,78,5);ctx.fill();
  ctx.fillStyle='#f0c58d';ctx.fillRect(433,541,642,4);ctx.strokeStyle='#7d523c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(475,604);ctx.lineTo(1036,604);ctx.stroke();
}
function drawRuler(ctx, time, ruler) {
  const {x,y,scale}=ruler.transform,w=540,h=29;ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.shadowColor='#263e3450';ctx.shadowBlur=12;ctx.shadowOffsetY=6;
  const wood=ctx.createLinearGradient(0,0,0,h);wood.addColorStop(0,'#f8d889');wood.addColorStop(.45,'#e8bd68');wood.addColorStop(1,'#c88c48');ctx.fillStyle=wood;rounded(ctx,0,0,w,h,5);ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;
  ctx.strokeStyle='#9b6b3a';ctx.lineWidth=2;rounded(ctx,0,0,w,h,5);ctx.stroke();
  for(let i=0;i<=20;i++){const px=40+i*24,len=i%5===0?17:8;ctx.strokeStyle='#684b30';ctx.lineWidth=i%5===0?2:1;ctx.beginPath();ctx.moveTo(px,1);ctx.lineTo(px,len);ctx.stroke();if(i%5===0){ctx.fillStyle='#604a36';ctx.font='600 11px system-ui';ctx.textAlign='center';ctx.fillText(String(i),px,25);}}
  ctx.fillStyle='#f7e9c7';ctx.font='600 9px system-ui';ctx.textAlign='left';ctx.fillText('cm',12,19);
  ctx.globalAlpha=.25+.35*(.5+.5*Math.sin(time*2.2));ctx.strokeStyle='#fff8dd';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(40,2);ctx.lineTo(40,17);ctx.stroke();ctx.restore();
}
function drawMeasurementEndpoints(ctx, scene) {
  const geometry=measurementGeometry(scene),labels=[[geometry.zeroX,'0'],[geometry.markX,String(geometry.valueCm).replace(/\.0$/,'')]];ctx.save();ctx.textBaseline='middle';
  for(const [x,label] of labels){const width=Math.max(22,label.length*8+10),y=geometry.markY+5;ctx.strokeStyle='#16816c';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,geometry.markY-1);ctx.lineTo(x,geometry.markY+27*geometry.scale);ctx.stroke();ctx.fillStyle='#fffdf3';rounded(ctx,x-width/2,y,width,19,5);ctx.fill();ctx.strokeStyle='#16816c';ctx.lineWidth=1.5;ctx.stroke();ctx.fillStyle='#176a58';ctx.font='700 10px system-ui';ctx.textAlign='center';ctx.fillText(label,x,y+9.5);}
  ctx.restore();
}
function drawBlock(ctx, block, valueCm, scale) {
  const {x,y}=block,w=valueCm*24,h=50;ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.fillStyle='#00000035';ctx.beginPath();ctx.ellipse(0,31,w*.56,11,0,0,TAU);ctx.fill();
  const wood=ctx.createLinearGradient(-w/2,-h/2,w/2,h/2);wood.addColorStop(0,'#f0c47e');wood.addColorStop(.45,'#c89154');wood.addColorStop(1,'#9a603d');ctx.fillStyle=wood;rounded(ctx,-w/2,-h/2,w,h,6);ctx.fill();ctx.strokeStyle='#7e543a';ctx.lineWidth=2;ctx.stroke();
  ctx.strokeStyle='#f5d49a80';ctx.lineWidth=2;for(const offset of [-14,2,16]){ctx.beginPath();ctx.moveTo(-w*.42,offset);ctx.bezierCurveTo(-w*.15,offset-6,w*.15,offset+8,w*.42,offset-3);ctx.stroke();}
  ctx.fillStyle='#79543c';ctx.font='600 12px system-ui';ctx.textAlign='center';ctx.fillText('KHỐI GỖ',0,4);ctx.restore();
}
function solveElbow(shoulder, wrist, bendDirection=1) {
  const dx=wrist.x-shoulder.x,dy=wrist.y-shoulder.y,d=Math.max(1,Math.hypot(dx,dy));let upper=Math.max(28,Math.min(84,d*.58)),lower=upper;if(upper+lower<d+1)upper=lower=(d+1)/2;
  const safe=Math.min(d,upper+lower-1),a=(upper*upper-lower*lower+safe*safe)/(2*safe),height=Math.sqrt(Math.max(0,upper*upper-a*a)),ux=dx/d,uy=dy/d,bend=height*.62*bendDirection;
  return {x:shoulder.x+ux*a+uy*bend,y:shoulder.y+uy*a-ux*bend};
}
function drawLimb(ctx, shoulder, wrist, skin, shirt, sleeve=true, bendDirection=1) {
  const elbow=solveElbow(shoulder,wrist,bendDirection);line(ctx,shoulder,elbow,28,shirt);line(ctx,shoulder,elbow,21,'#00000015');
  if(sleeve){const cuff={x:lerp(shoulder.x,elbow.x,.28),y:lerp(shoulder.y,elbow.y,.28)};line(ctx,shoulder,cuff,29,shirt);}
  const forearm=ctx.createLinearGradient(elbow.x,elbow.y,wrist.x,wrist.y);forearm.addColorStop(0,'#e6aa84');forearm.addColorStop(.45,skin);forearm.addColorStop(1,'#c58366');
  line(ctx,elbow,wrist,19,'#a96e55');line(ctx,elbow,wrist,15,forearm);line(ctx,{x:elbow.x+1,y:elbow.y-2},{x:wrist.x+1,y:wrist.y-2},2,'#f0bc97');
  ctx.fillStyle='#00000012';ctx.beginPath();ctx.arc(wrist.x-3,wrist.y+2,6,0,TAU);ctx.fill();return elbow;
}
function drawFinger(ctx,start,control,end,width,skin) {
  const stroke=(color,thickness)=>{ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.quadraticCurveTo(control.x,control.y,end.x,end.y);ctx.strokeStyle=color;ctx.lineWidth=thickness;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();};
  stroke('#9f6852',width+2.2);stroke(skin,width);
}
function drawNail(ctx,x,y,angle=0) {
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle='#f1d0b8';ctx.beginPath();ctx.ellipse(0,0,2.4,1.35,0,0,TAU);ctx.fill();ctx.restore();
}
function drawHand(ctx,p,kind='relaxed') {
  ctx.save();ctx.translate(p.x,p.y);if(kind==='point')ctx.rotate(-.15);
  const skin=ctx.createLinearGradient(-12,-12,18,15);skin.addColorStop(0,'#f0bc97');skin.addColorStop(.48,'#d99c76');skin.addColorStop(1,'#bd795f');
  const digits=[];
  if(kind==='point'){
    digits.push([{x:3,y:-6},{x:14,y:-12},{x:27,y:-13},5.8],
      [{x:4,y:-2},{x:14,y:-6},{x:14,y:1},4.8],
      [{x:4,y:1},{x:14,y:0},{x:12,y:7},4.6],
      [{x:1,y:4},{x:10,y:8},{x:5,y:12},4.2],
      [{x:-7,y:0},{x:-14,y:-3},{x:-8,y:-9},5.2]);
  }else if(kind==='open'){
    digits.push([{x:2,y:-7},{x:10,y:-16},{x:18,y:-22},5.1],
      [{x:5,y:-5},{x:16,y:-13},{x:25,y:-15},5.3],
      [{x:6,y:-1},{x:18,y:-5},{x:27,y:-5},5.0],
      [{x:4,y:3},{x:14,y:8},{x:23,y:8},4.5],
      [{x:-7,y:0},{x:-15,y:5},{x:-11,y:13},5.2]);
  }else if(kind==='grip'){
    digits.push([{x:3,y:-7},{x:14,y:-9},{x:17,y:-2},5.2],
      [{x:5,y:-3},{x:16,y:-4},{x:18,y:3},5.0],
      [{x:5,y:1},{x:14,y:4},{x:14,y:9},4.8],
      [{x:1,y:5},{x:8,y:10},{x:7,y:13},4.2],
      [{x:-8,y:0},{x:-13,y:-5},{x:-4,y:-8},5.4]);
  }else{
    digits.push([{x:3,y:-6},{x:13,y:-8},{x:15,y:-1},4.8],
      [{x:5,y:-2},{x:14,y:-3},{x:15,y:4},4.7],
      [{x:4,y:2},{x:12,y:5},{x:10,y:10},4.4],
      [{x:0,y:5},{x:6,y:10},{x:2,y:13},4.0],
      [{x:-8,y:0},{x:-13,y:-3},{x:-7,y:-8},5.0]);
  }
  for(const [start,control,end,width] of digits)drawFinger(ctx,start,control,end,width,skin);
  ctx.fillStyle='#a96e55';ctx.beginPath();ctx.moveTo(-12,-7);ctx.quadraticCurveTo(-7,-14,0,-11);ctx.quadraticCurveTo(7,-10,12,-4);ctx.quadraticCurveTo(17,1,13,7);ctx.quadraticCurveTo(8,13,0,12);ctx.quadraticCurveTo(-8,12,-14,6);ctx.quadraticCurveTo(-18,0,-12,-7);ctx.closePath();ctx.fill();
  ctx.fillStyle=skin;ctx.beginPath();ctx.moveTo(-12,-7);ctx.quadraticCurveTo(-7,-13,0,-10);ctx.quadraticCurveTo(7,-9,11,-3);ctx.quadraticCurveTo(15,2,12,7);ctx.quadraticCurveTo(7,12,0,10);ctx.quadraticCurveTo(-8,10,-13,5);ctx.quadraticCurveTo(-16,0,-12,-7);ctx.closePath();ctx.fill();
  for(const [start,control,end] of digits.slice(0,kind==='open'?4:1))drawNail(ctx,end.x,end.y,-.18);
  ctx.strokeStyle='#b77c60';ctx.lineWidth=1.2;ctx.lineCap='round';ctx.globalAlpha=.7;
  if(kind==='point'){ctx.beginPath();ctx.moveTo(1,1);ctx.quadraticCurveTo(5,4,8,7);ctx.moveTo(3,5);ctx.quadraticCurveTo(7,8,9,9);ctx.stroke();}
  else{ctx.beginPath();ctx.moveTo(-4,-1);ctx.quadraticCurveTo(0,2,3,1);ctx.moveTo(-2,4);ctx.quadraticCurveTo(2,7,5,6);ctx.stroke();}
  ctx.restore();
}
function drawCharacter(ctx, actor, time) {
  const {x:rootX,groundY,hand,handAction,walking}=actor,crouch=actor.crouch||0,walkWeight=actor.walkWeight||0,walkPhase=actor.walkPhase||0,step=walkWeight?Math.sin(walkPhase)*14*walkWeight:0,bob=walkWeight?Math.abs(Math.sin(walkPhase))*1.5*walkWeight:Math.sin(time*2.4)*1.8,x=rootX+(actor.lean||0);
  const head={x,y:groundY-246+bob},neckY=groundY-204+bob,shoulderL={x:x-31,y:groundY-187+bob},shoulderR={x:x+31,y:groundY-187+bob};
  ctx.save();ctx.globalAlpha=.22;ctx.fillStyle='#263d35';ctx.beginPath();ctx.ellipse(rootX,groundY+5,61,13,0,0,TAU);ctx.fill();ctx.restore();
  // Legs: independently articulated at hip and knee for a planted walk cycle.
  const hipY=groundY-89+crouch*.45,legColor='#35455f';
  for(const side of [-1,1]){
    const phase=((walkPhase+(side===1?Math.PI:0))%(Math.PI*2)+Math.PI*2)%(Math.PI*2),stride=75*walkWeight;
    const footProgress=phase<Math.PI?ease(phase/Math.PI):ease((phase-Math.PI)/Math.PI),relativeFootX=phase<Math.PI?lerp(-stride/2,stride/2,footProgress):lerp(stride/2,-stride/2,footProgress),lift=Math.max(0,Math.sin(phase))*10.5*walkWeight;
    const footX=rootX+side*20+relativeFootX,hip={x:rootX+side*18,y:hipY},knee={x:lerp(rootX+side*18,footX,.48),y:groundY-47+crouch*.2-lift*.48},ankle={x:footX,y:groundY-10-lift};
    if(lift>0){ctx.save();ctx.globalAlpha=.16*(1-lift/22);ctx.fillStyle='#263d35';ctx.beginPath();ctx.ellipse(footX+8,groundY+3,Math.max(12,22-lift*.42),6,0,0,TAU);ctx.fill();ctx.restore();}
    line(ctx,hip,knee,25,legColor);line(ctx,knee,ankle,21,'#28384f');ctx.save();ctx.translate(ankle.x+8,ankle.y+5);ctx.rotate(-lift/10.5*.16);ctx.fillStyle='#252c38';rounded(ctx,-22,-8,46,16,7);ctx.fill();ctx.fillStyle='#e7e8df';rounded(ctx,-13,-5,24,3,1.5);ctx.fill();ctx.restore();
  }
  // Torso with soft fabric shading and a clean waist/neck connection.
  ctx.save();ctx.translate(0,crouch);
  const shirt=ctx.createLinearGradient(x-48,groundY-194,x+46,groundY-68);shirt.addColorStop(0,'#5d9ca0');shirt.addColorStop(.5,'#34747f');shirt.addColorStop(1,'#285a68');ctx.fillStyle=shirt;ctx.beginPath();ctx.moveTo(x-34,groundY-190+bob);ctx.quadraticCurveTo(x,groundY-207+bob,x+34,groundY-190+bob);ctx.lineTo(x+49,groundY-83);ctx.quadraticCurveTo(x,groundY-65,x-49,groundY-83);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#9bced0';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-22,groundY-168+bob);ctx.quadraticCurveTo(x-3,groundY-153+bob,x+10,groundY-171+bob);ctx.stroke();ctx.fillStyle='#f1d77d';ctx.beginPath();ctx.arc(x+28,groundY-111+bob,5,0,TAU);ctx.fill();
  // Neck and arms are separate rig parts. The right hand follows action targets.
  const neck=ctx.createLinearGradient(x-9,neckY,x+9,neckY+22);neck.addColorStop(0,'#eab18a');neck.addColorStop(1,'#bd795f');ctx.fillStyle=neck;rounded(ctx,x-10,neckY,20,30,7);ctx.fill();
  const leftShoulder={x:shoulderL.x,y:shoulderL.y+bob},leftWrist={x:x-61,y:groundY-117+bob+step*.42};drawLimb(ctx,leftShoulder,leftWrist,'#d99c76','#397783',true,1);drawHand(ctx,leftWrist,'relaxed');
  const rightShoulder={x:shoulderR.x,y:shoulderR.y+bob},rightWrist={x:hand.x,y:hand.y+bob};drawLimb(ctx,rightShoulder,rightWrist,'#d99c76','#397783',true,-1);drawHand(ctx,rightWrist,handAction);
  // Face, ears, hair, brows, nose and mouth.
  const skin=ctx.createRadialGradient(head.x-18,head.y-23,5,head.x,head.y,52);skin.addColorStop(0,'#f4c8a1');skin.addColorStop(1,'#ca896a');ctx.fillStyle=skin;ctx.beginPath();ctx.ellipse(head.x,head.y,42,50,0,0,TAU);ctx.fill();
  ctx.fillStyle='#c9896d';for(const ex of [-42,42]){ctx.beginPath();ctx.ellipse(head.x+ex,head.y+4,8,12,0,0,TAU);ctx.fill();}
  ctx.fillStyle='#302a30';ctx.beginPath();ctx.moveTo(head.x-42,head.y-10);ctx.quadraticCurveTo(head.x-49,head.y-56,head.x-8,head.y-55);ctx.quadraticCurveTo(head.x+38,head.y-58,head.x+43,head.y-20);ctx.quadraticCurveTo(head.x+23,head.y-36,head.x+4,head.y-31);ctx.quadraticCurveTo(head.x-14,head.y-13,head.x-42,head.y-10);ctx.fill();
  const blink=Math.sin(time*1.7+1)> .994?1:.0;for(const ex of [-15,14]){const pupilX=2+(actor.gazeX||0)*5,pupilY=-1+(actor.gazeY||0)*3;ctx.fillStyle='#fff8ed';ctx.beginPath();ctx.ellipse(head.x+ex,head.y-2,8,10*(1-blink)+1,0,0,TAU);ctx.fill();ctx.fillStyle='#3c3535';ctx.beginPath();ctx.arc(head.x+ex+pupilX,head.y-1+pupilY,4.2,0,TAU);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(head.x+ex+pupilX+1,head.y-3+pupilY,1.3,0,TAU);ctx.fill();ctx.strokeStyle='#563e38';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(head.x+ex-7,head.y-16);ctx.lineTo(head.x+ex+5,head.y-18);ctx.stroke();}
  ctx.strokeStyle='#a96e55';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(head.x+1,head.y+2);ctx.lineTo(head.x-2,head.y+14);ctx.lineTo(head.x+4,head.y+15);ctx.stroke();ctx.strokeStyle='#854d4b';ctx.lineWidth=2.4;ctx.beginPath();ctx.arc(head.x+1,head.y+20,8,.15,Math.PI-.15);ctx.stroke();
  ctx.restore();ctx.restore();
}
function drawResult(ctx, valueCm, actorX) {
  const width=170,height=93,rightX=842,leftX=482,overlapsCharacter=actorX+62>rightX&&actorX-62<rightX+width,x=overlapsCharacter?leftX:rightX,centerX=x+width/2,y=365;
  ctx.save();ctx.shadowColor='#264e4260';ctx.shadowBlur=20;ctx.fillStyle='#fffdf3';rounded(ctx,x,y,width,height,15);ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle='#8fb5a2';ctx.lineWidth=3;ctx.stroke();ctx.fillStyle='#557d68';ctx.font='600 14px system-ui';ctx.textAlign='center';ctx.fillText('CHIỀU DÀI',centerX,y+26);ctx.fillStyle='#305a49';ctx.font='700 34px system-ui';ctx.fillText(`${String(valueCm).replace(/\.0$/,'')} cm`,centerX,y+69);ctx.restore();
}
export function renderMeasurementDemo(canvas, time, sceneGraph=measurementDemo, duration=measurementDemo.duration, options={}) {
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,state=resolveMeasurementState(sceneGraph,clamp(time,0,duration));
  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='#d2e1db';ctx.fillRect(0,0,w,h);
  const scale=Math.min(w/1280,h/720),offsetX=(w-1280*scale)/2,offsetY=(h-720*scale)/2,ruler=sceneGraph.entities.find(entity=>entity.asset_id==='ruler_30cm'),measurement=Number(sceneGraph.measurement?.value_cm??5);ctx.save();ctx.translate(offsetX,offsetY);ctx.scale(scale,scale);drawBackground(ctx,1280,720);
  const floorShade=ctx.createLinearGradient(0,545,0,660);floorShade.addColorStop(0,'#b9cbbd00');floorShade.addColorStop(1,'#738e7d32');ctx.fillStyle=floorShade;ctx.fillRect(0,545,1280,115);
  drawTable(ctx);drawRuler(ctx,time,ruler);drawBlock(ctx,state.block,measurement,ruler.transform.scale);drawCharacter(ctx,state.actor,time);drawMeasurementEndpoints(ctx,sceneGraph);
  ctx.fillStyle='#2d4d45';ctx.font='700 26px system-ui';ctx.textAlign='left';ctx.fillText(String(options.title||'ĐO CHIỀU DÀI').toLocaleUpperCase('vi-VN').slice(0,42),482,112);ctx.fillStyle='#5e756b';ctx.font='400 17px system-ui';ctx.fillText('Đặt một đầu vật trùng với vạch số 0',482,142,440);
  if(state.showResult)drawResult(ctx,measurement,state.actor.x);
  ctx.fillStyle='#577068';ctx.font='600 12px system-ui';ctx.textAlign='right';ctx.fillText('ASSET ANIMATION · SCENE GRAPH',1210,692);
  ctx.restore();
}
