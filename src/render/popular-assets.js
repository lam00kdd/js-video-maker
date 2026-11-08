const TAU=Math.PI*2;
const blob=(c,x,y,rx,ry,color)=>{c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fill();};
const outlinedText=(c,text,x,y,maxWidth,s)=>{c.save();c.textAlign='center';c.textBaseline='middle';const fontSize=String(c.font).match(/([\d.]+)px/);if(fontSize)c.font=c.font.replace(fontSize[0],`${Math.round(Number(fontSize[1])*1.45)}px`);const match=String(c.fillStyle).match(/^#([0-9a-f]{6})$/i),rgb=match?match[1].match(/.{2}/g).map(value=>parseInt(value,16)):null,luminance=rgb?.reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0)??220,fill=c.fillStyle,metrics=c.measureText(text),textHeight=(metrics.actualBoundingBoxAscent||s*.065)+(metrics.actualBoundingBoxDescent||s*.02),padX=Math.max(4,s*.025),padY=Math.max(3,s*.018),badgeWidth=Math.min(maxWidth,metrics.width)+padX*2,badgeHeight=Math.max(s*.085,textHeight+padY*2);c.fillStyle=luminance>145?'rgba(16,24,32,.90)':'rgba(248,246,235,.96)';c.beginPath();c.roundRect(x-badgeWidth/2,y-badgeHeight/2,badgeWidth,badgeHeight,Math.max(2,s*.018));c.fill();c.fillStyle=fill;c.fillText(text,x,y,maxWidth);c.restore();};
const label=(c,s,text)=>{c.fillStyle='#24394a';c.font='700 '+Math.max(11,Math.round(s*.10))+'px system-ui';c.textAlign='center';c.textBaseline='middle';outlinedText(c,text,0,s*.38,s*.72,s);};
const card=(c,s,fill='#f7f1df')=>{c.fillStyle=fill;c.beginPath();c.roundRect(-s*.34,-s*.40,s*.68,s*.80,s*.06);c.fill();c.strokeStyle='#526879';c.lineWidth=s*.018;c.stroke();};
const groups={
 language:new Set(['hanzi_grid','pinyin_tones','stroke_order','chinese_radical_card','hiragana_chart','katakana_chart','kanji_lookup','japanese_dictionary','chinese_dictionary','conversation_card','chinese_map','japan_map']),
 automation:new Set(['contactor','ladder_contact_no','ladder_contact_nc','ladder_coil','start_button','stop_button','proximity_sensor','photoelectric_sensor','pressure_sensor','temperature_sensor','flow_sensor','encoder','limit_switch','vision_camera','scada_dashboard','scada_trend','scada_alarm','scada_process','ladder_logic','modbus_gateway','operator_station','robot_gripper','robot_cell','pneumatic_cylinder','solenoid_valve','safety_light_curtain','io_module','industrial_switch','ethernet_cable','servo_motor','stepper_motor','vfd_drive','conveyor_motor']),
 health:new Set(['doctor','nurse','veterinarian','first_aid_kit','stethoscope','heart_monitor','tooth','medicine_bottle','thermometer','syringe','pill','bandage','virus','hospital_bed','health_chart']),
 cooking:new Set(['chef','frying_pan','cooking_pot','kitchen_knife','cutting_board','carrot','vegetable_basket','fruit_basket','oven','dinner_plate','cake','bread','spoon','mixing_bowl']),
 sports:new Set(['soccer_ball','basketball','tennis_racket','medal','dumbbell','running_shoe','bicycle','stopwatch','water_bottle','whistle','yoga_mat','trophy']),
 nature:new Set(['seedling','recycling_bin','water_drop','solar_panel','wind_turbine','thermometer','trash_sort','globe','leaf']),
 finance:new Set(['coin_stack','wallet','calculator','bar_chart','piggy_bank','receipt','shopping_cart','bank_building','handshake','briefcase','budget_sheet']),
 construction:new Set(['hard_hat','crane','road_cone','ladder','safety_vest','brick_stack','tape_measure','wrench','excavator','cement_mixer','building_frame']),
 technology:new Set(['laptop','smartphone','tablet','wifi_router','cloud_server','digital_lock','keyboard','game_controller','satellite']),
 travel:new Set(['suitcase','passport','airplane','train','bus','map_pin','camera','beach_umbrella','tent','backpack','ticket','binoculars']),
 logistics:new Set(['delivery_truck','forklift','pallet','package','cargo_ship','cargo_plane','barcode_scanner','warehouse']),
 animals:new Set(['dog','cat','paw_print','bone','food_bowl','pet_carrier','lion','elephant','rabbit','turtle','dinosaur'])
};

export function drawPopularAsset(c,s,kind,color='#69b9a3',time=0,word='',properties={}){
 const title=word||kind.replaceAll('_',' ').toUpperCase();
 if(kind==='contactor'){
  c.save();c.shadowColor='rgba(0,0,0,.28)';c.shadowBlur=s*.05;c.shadowOffsetY=s*.025;
  c.fillStyle='#334957';c.beginPath();c.roundRect(-s*.36,-s*.43,s*.72,s*.82,s*.055);c.fill();c.restore();
  c.fillStyle='#d5dfdc';c.beginPath();c.roundRect(-s*.32,-s*.40,s*.64,s*.75,s*.045);c.fill();
  c.strokeStyle='#f0f1e8';c.lineWidth=Math.max(1.5,s*.014);c.stroke();
  c.fillStyle='#91a6ab';c.fillRect(-s*.27,-s*.34,s*.54,s*.09);
  c.fillStyle='#273b48';
  for(let i=0;i<3;i++){
   const x=-s*.19+i*s*.19;
   c.beginPath();c.roundRect(x-s*.065,-s*.20,s*.13,s*.39,s*.018);c.fill();
   c.fillStyle='#b7c7c6';c.fillRect(x-s*.035,-s*.18,s*.07,s*.25);
   c.fillStyle='#d8e3df';c.fillRect(x-s*.055,-s*.29,s*.11,s*.045);
   blob(c,x,-s*.265,s*.018,s*.018,'#536975');
   c.fillStyle='#d8e3df';c.fillRect(x-s*.055,s*.21,s*.11,s*.045);
   blob(c,x,s*.235,s*.018,s*.018,'#536975');
   c.fillStyle='#273b48';
  }
  c.fillStyle='#213b4a';c.beginPath();c.roundRect(-s*.15,-s*.06,s*.30,s*.12,s*.025);c.fill();
  c.fillStyle='#73d6b2';c.font=`700 ${Math.max(10,Math.round(s*.075))}px system-ui`;c.textAlign='center';c.textBaseline='middle';c.fillText('K1',0,0,s*.24);
  if(word)label(c,s,word);else label(c,s,'CONTACTOR K1');return true;
 }
 if(['ladder_contact_no','ladder_contact_nc','ladder_coil'].includes(kind)){
  c.save();const transientOn=Number(properties.highlight_amount)>0.02,energized=properties.energized_state==='on'||transientOn;c.strokeStyle=transientOn?(properties.highlight_color||properties.on_color||'#65f5a6'):energized?(properties.on_color||'#65f5a6'):(properties.off_color||'#7f8b99');
  if(energized){c.shadowColor=c.strokeStyle;c.shadowBlur=s*(transientOn ? .11 : .045)*Math.max(.55,Math.min(1,Number(properties.highlight_amount)||1));}
  c.lineWidth=Math.max(1.6,s*.018);c.lineCap='round';c.lineJoin='round';c.beginPath();
  // Integral wire tails terminate at x = ±0.46s; neighboring wires should meet/overlap these pins.
  if(kind==='ladder_coil'){
   c.moveTo(-s*.46,0);c.lineTo(-s*.15,0);c.moveTo(s*.15,0);c.lineTo(s*.46,0);
   c.moveTo(-s*.12,-s*.18);c.bezierCurveTo(-s*.31,-s*.12,-s*.31,s*.12,-s*.12,s*.18);
   c.moveTo(s*.12,-s*.18);c.bezierCurveTo(s*.31,-s*.12,s*.31,s*.12,s*.12,s*.18);
  }else{
   c.moveTo(-s*.46,0);c.lineTo(-s*.065,0);c.moveTo(s*.065,0);c.lineTo(s*.46,0);
   c.moveTo(-s*.065,-s*.16);c.lineTo(-s*.065,s*.16);c.moveTo(s*.065,-s*.16);c.lineTo(s*.065,s*.16);
   if(kind==='ladder_contact_nc'){c.moveTo(-s*.11,s*.19);c.lineTo(s*.11,-s*.19);}
  }
  c.stroke();
  for(const x of [-s*.46,s*.46]){c.fillStyle=c.strokeStyle;c.beginPath();c.arc(x,0,Math.max(1.5,s*.018),0,TAU);c.fill();}
  c.restore();if(word)label(c,s,word);return true;
 }
 if(groups.language.has(kind)){
  card(c,s,kind.startsWith('scada')?'#20394a':'#f7f1df');
  if(['hanzi_grid','hiragana_chart','katakana_chart'].includes(kind)){
   c.strokeStyle='#c8bfa5';c.lineWidth=s*.012;
   for(let i=0;i<3;i++){c.beginPath();c.moveTo(-s*.25,-s*.2+i*s*.14);c.lineTo(s*.25,-s*.2+i*s*.14);c.moveTo(-s*.25+i*s*.17,-s*.2);c.lineTo(-s*.25+i*s*.17,s*.22);c.stroke();}
   c.fillStyle='#bd4d4c';c.font='700 '+Math.round(s*.19)+'px serif';c.textAlign='center';c.fillText(word||'あ 汉',0,s*.02,s*.48);
  }else{
   c.fillStyle='#3e7891';c.fillRect(-s*.28,-s*.25,s*.56,s*.13);
   c.fillStyle='#566c79';for(let i=0;i<3;i++)c.fillRect(-s*.22,-s*.03+i*s*.11,s*.44,s*.018);
   if(kind==='pinyin_tones'||kind==='stroke_order'){c.strokeStyle='#d35d59';c.lineWidth=s*.025;for(let i=0;i<4;i++){const x=-s*.18+i*s*.12;c.beginPath();c.moveTo(x,-s*.08);c.lineTo(x+s*.07,-s*.14);c.stroke();}}
  }
  label(c,s,title);return true;
 }
 if(['red_lantern','pagoda','chinese_fan','japanese_fan','chinese_knot','torii_gate','sakura','origami_crane','bento_box','shinkansen','daruma','japanese_flag','chinese_flag','tea_cup','chopsticks','bamboo'].includes(kind)){
  if(kind==='red_lantern'){c.strokeStyle='#d6b86c';c.lineWidth=s*.025;c.beginPath();c.moveTo(0,-s*.46);c.lineTo(0,-s*.34);c.stroke();c.fillStyle='#d83e46';c.beginPath();c.ellipse(0,-s*.1,s*.24,s*.29,0,0,TAU);c.fill();c.fillStyle='#f2cb6c';for(let y=-.3;y<.2;y+=.12)c.fillRect(-s*.22,s*y,s*.44,s*.022);c.fillRect(-s*.06,s*.19,s*.12,s*.05);c.fillRect(-s*.02,s*.24,s*.04,s*.15);}
  else if(kind==='torii_gate'){c.fillStyle='#c94743';c.fillRect(-s*.34,-s*.34,s*.68,s*.08);c.fillRect(-s*.42,-s*.25,s*.84,s*.07);c.fillRect(-s*.27,-s*.20,s*.10,s*.55);c.fillRect(s*.17,-s*.20,s*.10,s*.55);c.fillStyle='#ddbd6b';c.fillRect(-s*.38,s*.31,s*.76,s*.05);}
  else if(kind==='pagoda'){for(let i=0;i<3;i++){const y=-s*.28+i*s*.19,w=s*(.34+i*.08);c.fillStyle=['#d4544d','#dfb658','#9f5a4e'][i];c.beginPath();c.moveTo(-w*.55,y);c.lineTo(0,y-s*.12);c.lineTo(w*.55,y);c.quadraticCurveTo(0,y-s*.035,-w*.55,y);c.fill();c.fillRect(-w*.34,y,w*.68,s*.12);}c.fillStyle='#e4c678';c.fillRect(-s*.06,-s*.12,s*.12,s*.48);}
  else if(kind==='sakura'){for(let i=0;i<5;i++){const a=i*TAU/5;blob(c,Math.cos(a)*s*.15,Math.sin(a)*s*.15,s*.12,s*.09,'#f2a9be');}blob(c,0,0,s*.055,s*.055,'#f3d16d');}
  else if(kind==='origami_crane'){c.fillStyle='#f5f0df';c.beginPath();c.moveTo(-s*.37,0);c.lineTo(-s*.04,-s*.16);c.lineTo(s*.38,-s*.34);c.lineTo(s*.19,s*.02);c.lineTo(s*.39,s*.28);c.lineTo(0,s*.12);c.lineTo(-s*.23,s*.34);c.closePath();c.fill();c.strokeStyle='#b8aa8c';c.lineWidth=s*.015;c.stroke();}
  else if(kind==='bento_box'){c.fillStyle='#604b43';c.beginPath();c.roundRect(-s*.36,-s*.23,s*.72,s*.48,s*.06);c.fill();c.fillStyle='#f7f0dd';c.fillRect(-s*.29,-s*.17,s*.58,s*.36);blob(c,-s*.15,-s*.04,s*.08,s*.08,'#6ca86e');blob(c,s*.08,-s*.04,s*.09,s*.09,'#dc7966');c.fillStyle='#e7c366';c.fillRect(-s*.2,s*.10,s*.4,s*.06);}
  else if(kind==='shinkansen'){c.fillStyle='#f0f2eb';c.beginPath();c.moveTo(-s*.36,-s*.03);c.quadraticCurveTo(s*.05,-s*.28,s*.39,-s*.16);c.lineTo(s*.34,s*.17);c.lineTo(-s*.30,s*.17);c.closePath();c.fill();c.fillStyle='#39a7bf';c.fillRect(-s*.22,-s*.01,s*.51,s*.06);c.fillStyle='#36454d';for(let i=0;i<3;i++)c.fillRect(-s*.18+i*s*.15,s*.20,s*.07,s*.04);}
  else if(kind==='chinese_fan'||kind==='japanese_fan'){c.fillStyle=kind==='chinese_fan'?'#e56254':'#f2e8d2';c.beginPath();c.moveTo(0,s*.30);c.arc(0,s*.30,s*.48,Math.PI*1.12,Math.PI*1.88);c.closePath();c.fill();c.strokeStyle=kind==='chinese_fan'?'#f0cc70':'#bd806e';c.lineWidth=s*.018;for(let i=-3;i<=3;i++){c.beginPath();c.moveTo(0,s*.30);c.lineTo(i*s*.09,-s*.08);c.stroke();}}
  else if(kind==='chinese_knot'){c.strokeStyle='#c93d47';c.lineWidth=s*.075;c.lineCap='round';c.beginPath();c.moveTo(0,-s*.32);c.bezierCurveTo(-s*.36,-s*.2,s*.36,s*.2,0,s*.32);c.bezierCurveTo(s*.36,s*.2,-s*.36,-s*.2,0,-s*.32);c.stroke();blob(c,0,0,s*.06,s*.06,'#e6be65');}
  else if(kind==='tea_cup'){c.fillStyle='#f2eee2';c.beginPath();c.roundRect(-s*.25,-s*.06,s*.45,s*.28,s*.05);c.fill();c.strokeStyle='#d0b779';c.lineWidth=s*.025;c.beginPath();c.arc(s*.20,s*.06,s*.10,-Math.PI/2,Math.PI/2);c.stroke();c.fillStyle='#9a674a';c.fillRect(-s*.20,-s*.02,s*.35,s*.05);}
  else if(kind==='chopsticks'){c.strokeStyle='#bd8054';c.lineWidth=s*.035;c.beginPath();c.moveTo(-s*.18,-s*.35);c.lineTo(s*.13,s*.35);c.moveTo(-s*.06,-s*.38);c.lineTo(s*.25,s*.32);c.stroke();}
  else if(kind==='bamboo'){c.strokeStyle='#578f62';c.lineWidth=s*.09;c.beginPath();c.moveTo(-s*.12,s*.38);c.lineTo(s*.12,-s*.38);c.stroke();c.strokeStyle='#b2d17b';c.lineWidth=s*.025;for(let i=-1;i<=1;i++){c.beginPath();c.moveTo(-s*.1,s*i*.2);c.lineTo(s*.1,s*i*.2);c.stroke();}}
  else if(kind==='daruma'){blob(c,0,s*.02,s*.27,s*.34,'#d94d43');blob(c,-s*.1,-s*.02,s*.018,s*.022,'#27333c');blob(c,s*.1,-s*.02,s*.018,s*.022,'#27333c');c.fillStyle='#f0cc70';c.beginPath();c.arc(0,s*.02,s*.12,0,TAU);c.stroke();}
  else {c.fillStyle=kind==='chinese_flag'?'#d84c45':'#f8f4e9';c.fillRect(-s*.34,-s*.24,s*.68,s*.48);if(kind==='chinese_flag')blob(c,-s*.18,-s*.05,s*.07,s*.07,'#f1cb62');else blob(c,0,0,s*.12,s*.12,'#d84c45');}
  label(c,s,title);return true;
 }
 if(kind==='ladder_logic'){
  const contactLeft=-s*.105,contactRight=-s*.045,coilLeft=s*.19,coilRight=s*.25,left=-s*.34,right=s*.34;
  c.fillStyle='#102838';c.beginPath();c.roundRect(-s*.46,-s*.38,s*.92,s*.76,s*.04);c.fill();
  c.strokeStyle='#7dd9bd';c.lineWidth=Math.max(1.5,s*.012);c.strokeRect(-s*.46,-s*.38,s*.92,s*.76);c.lineWidth=Math.max(1.5,s*.014);c.beginPath();
  c.moveTo(left,-s*.24);c.lineTo(left,s*.24);c.moveTo(right,-s*.24);c.lineTo(right,s*.24);
  c.moveTo(left,0);c.lineTo(contactLeft,0);c.moveTo(contactRight,0);c.lineTo(coilLeft,0);c.moveTo(coilRight,0);c.lineTo(right,0);
  c.moveTo(contactLeft,-s*.075);c.lineTo(contactLeft,s*.075);c.moveTo(contactRight,-s*.075);c.lineTo(contactRight,s*.075);
  if(properties.contact_type==='normally_closed'){c.moveTo(contactLeft-s*.035,s*.085);c.lineTo(contactRight+s*.035,-s*.085);}
  c.moveTo(coilLeft,-s*.085);c.bezierCurveTo(coilLeft-s*.065,-s*.085,coilLeft-s*.065,s*.085,coilLeft,s*.085);
  c.moveTo(coilRight,-s*.085);c.bezierCurveTo(coilRight+s*.065,-s*.085,coilRight+s*.065,s*.085,coilRight,s*.085);c.stroke();
  c.fillStyle='#d1e4e1';c.font='700 '+Math.max(10,Math.round(s*.075))+'px system-ui';c.textAlign='center';c.textBaseline='middle';
  outlinedText(c,properties.contact_label||'I0.0',contactLeft+s*.03,-s*.15,s*.24,s);outlinedText(c,properties.coil_label||'Q0.0',coilLeft+s*.03,-s*.15,s*.24,s);
  c.fillStyle='#a5c9c6';c.font='600 '+Math.max(9,Math.round(s*.065))+'px system-ui';outlinedText(c,word||'LADDER LOGIC',0,s*.31,s*.82,s);return true;
 } if(['proximity_sensor','photoelectric_sensor','pressure_sensor','temperature_sensor','flow_sensor','encoder','limit_switch','vision_camera'].includes(kind)){const photo=kind==='photoelectric_sensor'||kind==='vision_camera';c.fillStyle='#667e89';c.beginPath();if(photo)c.roundRect(-s*.25,-s*.22,s*.50,s*.45,s*.055);else c.roundRect(-s*.20,-s*.27,s*.40,s*.54,s*.10);c.fill();c.strokeStyle='#d7e2dd';c.lineWidth=s*.018;c.stroke();c.strokeStyle='#9ab0b3';c.lineWidth=s*.022;for(let i=0;i<4;i++){c.beginPath();c.moveTo(-s*.18,-s*.06+i*s*.075);c.lineTo(s*.18,-s*.06+i*s*.075);c.stroke();}c.fillStyle=photo?'#e4655e':'#d7ad5b';c.beginPath();if(photo)c.roundRect(-s*.13,-s*.30,s*.26,s*.11,s*.02);else c.ellipse(0,-s*.27,s*.14,s*.06,0,0,TAU);c.fill();c.strokeStyle='#384e5a';c.lineWidth=s*.035;c.beginPath();c.moveTo(0,s*.26);c.lineTo(0,s*.40);c.stroke();c.fillStyle='#45c6a0';c.beginPath();c.arc(s*.13,s*.05,s*.025,0,TAU);c.fill();c.fillStyle='#24394a';c.font='700 '+Math.max(11,Math.round(s*.09))+'px system-ui';c.textAlign='center';outlinedText(c,word||(kind==='photoelectric_sensor'?'PHOTO SENSOR':kind.replaceAll('_',' ').toUpperCase()),0,s*.46,s*.92,s);return true;}
 if(['servo_motor','stepper_motor','conveyor_motor'].includes(kind)){c.fillStyle='#526d7c';c.beginPath();c.roundRect(-s*.30,-s*.25,s*.60,s*.50,s*.09);c.fill();c.fillStyle='#91a8ad';for(let i=-2;i<=2;i++)c.fillRect(i*s*.075-s*.012,-s*.19,s*.024,s*.38);c.fillStyle='#93a9ad';c.beginPath();c.ellipse(-s*.29,0,s*.08,s*.25,0,0,TAU);c.fill();c.fillRect(s*.28,-s*.045,s*.24,s*.09);c.fillStyle='#263b4b';c.font='700 '+Math.max(11,Math.round(s*.09))+'px system-ui';c.textAlign='center';outlinedText(c,word||kind.replaceAll('_',' ').toUpperCase(),0,s*.45,s*.95,s);return true;}
 if(groups.automation.has(kind)){
  if(kind==='start_button'||kind==='stop_button'){
   const stop=kind==='stop_button',active=properties.action==='pulse'||properties.action==='highlight';
   const face=stop?'#e64b50':'#36bd83';
   c.fillStyle='#263b48';c.beginPath();c.roundRect(-s*.24,-s*.31,s*.48,s*.62,s*.065);c.fill();
   c.strokeStyle='#aebfc0';c.lineWidth=s*.025;c.stroke();
   c.fillStyle='#435d69';c.fillRect(-s*.105,-s*.12,s*.21,s*.27);
   c.fillStyle=active?'#ffe28a':face;c.beginPath();c.ellipse(0,-s*.13,s*.19,s*.105,0,Math.PI,TAU);c.lineTo(s*.19,s*.04);c.quadraticCurveTo(0,s*.12,-s*.19,s*.04);c.closePath();c.fill();
   c.strokeStyle=stop?'#ff9a87':'#9cf2c4';c.lineWidth=s*.014;c.beginPath();c.ellipse(0,-s*.13,s*.14,s*.055,0,Math.PI,TAU);c.stroke();
   c.fillStyle='#d9e3df';c.fillRect(-s*.17,s*.22,s*.34,s*.045);
  }else if(kind.startsWith('scada_')||kind==='operator_station'){
   c.fillStyle='#344f60';c.beginPath();c.roundRect(-s*.36,-s*.29,s*.72,s*.54,s*.05);c.fill();c.fillStyle='#142d3d';c.fillRect(-s*.30,-s*.23,s*.60,s*.42);
   c.strokeStyle=kind==='scada_alarm'?'#ef896b':'#63dbb6';c.lineWidth=s*.024;c.beginPath();
   if(kind==='ladder_logic'){for(let i=0;i<3;i++){const y=-s*.2+i*s*.15;c.moveTo(-s*.22,y);c.lineTo(s*.22,y);c.moveTo(-s*.12,y);c.lineTo(-s*.12,y+s*.1);c.moveTo(s*.1,y);c.lineTo(s*.1,y+s*.1);}}
   else{c.moveTo(-s*.25,s*.12);c.lineTo(-s*.12,s*.02);c.lineTo(-s*.03,s*.07);c.lineTo(s*.07,-s*.11);c.lineTo(s*.24,-s*.16);}
   c.stroke();if(kind==='scada_alarm')blob(c,s*.22,-s*.16,s*.035,s*.035,'#ef7162');
  }else if(kind.includes('sensor')||kind==='encoder'||kind==='limit_switch'||kind==='vision_camera'){
   c.fillStyle='#627d89';c.beginPath();c.roundRect(-s*.21,-s*.18,s*.42,s*.43,s*.06);c.fill();blob(c,0,-s*.08,s*.10,s*.10,kind==='photoelectric_sensor'||kind==='vision_camera'?'#67dfd5':'#e5bd66');c.fillStyle='#d35b58';c.fillRect(-s*.15,-s*.27,s*.30,s*.08);c.fillStyle='#344956';c.fillRect(-s*.07,s*.25,s*.14,s*.18);
  }else if(kind==='robot_gripper'||kind==='robot_cell'){
   c.strokeStyle='#e7b94e';c.lineWidth=s*.11;c.lineCap='round';c.beginPath();c.moveTo(-s*.23,s*.32);c.lineTo(-s*.14,s*.02);c.lineTo(s*.12,-s*.13);c.lineTo(s*.19,-s*.31);c.stroke();c.strokeStyle='#546c78';c.lineWidth=s*.05;c.beginPath();c.moveTo(s*.18,-s*.3);c.lineTo(s*.08,-s*.42);c.moveTo(s*.19,-s*.3);c.lineTo(s*.31,-s*.4);c.stroke();blob(c,-s*.14,s*.02,s*.075,s*.075,'#f0d16e');
  }else if(kind==='ethernet_cable'){
   c.strokeStyle='#56b69b';c.lineWidth=s*.05;c.beginPath();c.moveTo(-s*.36,-s*.18);c.bezierCurveTo(s*.35,-s*.34,-s*.34,s*.32,s*.30,s*.18);c.stroke();c.fillStyle='#dae3dd';c.fillRect(-s*.4,-s*.24,s*.12,s*.12);c.fillRect(s*.27,s*.12,s*.12,s*.12);
  }else{
   c.fillStyle='#d3dfdc';c.beginPath();c.roundRect(-s*.28,-s*.29,s*.56,s*.58,s*.05);c.fill();c.fillStyle='#203847';c.fillRect(-s*.2,-s*.19,s*.4,s*.22);for(let i=0;i<4;i++)blob(c,-s*.14+i*s*.09,s*.15,s*.025,s*.025,'#58c4a2');
  }
  label(c,s,title);return true;
 }
 if(groups.health.has(kind)){
  if(['doctor','nurse','veterinarian'].includes(kind)){c.fillStyle=kind==='nurse'?'#57b8b2':'#f4f1e8';c.beginPath();c.roundRect(-s*.24,-s*.02,s*.48,s*.38,s*.07);c.fill();blob(c,0,-s*.22,s*.15,s*.16,'#edbd94');c.fillStyle='#4f5d68';c.fillRect(-s*.03,s*.03,s*.06,s*.22);c.fillRect(-s*.12,s*.10,s*.24,s*.06);}
  else if(kind==='first_aid_kit'){c.fillStyle='#f1f3eb';c.beginPath();c.roundRect(-s*.31,-s*.22,s*.62,s*.49,s*.06);c.fill();c.strokeStyle='#d65351';c.lineWidth=s*.065;c.beginPath();c.moveTo(0,-s*.13);c.lineTo(0,s*.17);c.moveTo(-s*.15,s*.02);c.lineTo(s*.15,s*.02);c.stroke();}
  else if(kind==='heart_monitor'||kind==='health_chart'){c.fillStyle='#1d3748';c.fillRect(-s*.32,-s*.25,s*.64,s*.47);c.strokeStyle='#6be0bc';c.lineWidth=s*.025;c.beginPath();c.moveTo(-s*.27,0);c.lineTo(-s*.12,0);c.lineTo(-s*.04,-s*.12);c.lineTo(s*.02,s*.11);c.lineTo(s*.09,-s*.03);c.lineTo(s*.27,-s*.03);c.stroke();}
  else if(kind==='tooth'){c.fillStyle='#f6f4e9';c.beginPath();c.moveTo(-s*.24,-s*.22);c.quadraticCurveTo(-s*.12,-s*.38,0,-s*.25);c.quadraticCurveTo(s*.16,-s*.39,s*.25,-s*.21);c.quadraticCurveTo(s*.30,0,s*.10,s*.34);c.quadraticCurveTo(0,s*.41,-s*.06,s*.16);c.quadraticCurveTo(-s*.12,s*.4,-s*.19,s*.28);c.quadraticCurveTo(-s*.34,-s*.03,-s*.24,-s*.22);c.fill();}
  else{c.fillStyle=kind==='pill'?'#e8777d':'#e8f0e8';c.beginPath();c.roundRect(-s*.17,-s*.30,s*.34,s*.60,s*.1);c.fill();c.fillStyle='#d75d61';c.fillRect(-s*.14,s*.02,s*.28,s*.23);if(kind==='stethoscope'){c.strokeStyle='#4b6675';c.lineWidth=s*.04;c.beginPath();c.moveTo(-s*.2,-s*.25);c.lineTo(-s*.2,s*.08);c.quadraticCurveTo(0,s*.31,s*.2,s*.08);c.lineTo(s*.2,-s*.25);c.stroke();}}
  label(c,s,title);return true;
 }
 if(groups.cooking.has(kind)){
  if(kind==='chef'){c.fillStyle='#f5f2e8';c.beginPath();c.roundRect(-s*.23,-s*.02,s*.46,s*.36,s*.07);c.fill();blob(c,0,-s*.24,s*.17,s*.14,'#fffdf5');blob(c,-s*.12,-s*.31,s*.1,s*.1,'#fffdf5');blob(c,s*.12,-s*.31,s*.1,s*.1,'#fffdf5');}
  else if(kind==='frying_pan'){blob(c,-s*.09,s*.07,s*.26,s*.17,'#465660');c.strokeStyle='#465660';c.lineWidth=s*.07;c.beginPath();c.moveTo(s*.14,s*.08);c.lineTo(s*.42,s*.21);c.stroke();}
  else if(kind==='kitchen_knife'){c.fillStyle='#becdc9';c.beginPath();c.moveTo(-s*.04,-s*.34);c.lineTo(s*.11,-s*.34);c.lineTo(s*.08,s*.04);c.lineTo(-s*.06,s*.04);c.fill();c.fillStyle='#8d5a47';c.fillRect(-s*.06,s*.03,s*.12,s*.31);}
  else if(kind==='carrot'){c.fillStyle='#ee9849';c.beginPath();c.moveTo(-s*.2,-s*.23);c.lineTo(s*.22,-s*.3);c.lineTo(-s*.04,s*.35);c.closePath();c.fill();c.strokeStyle='#5b9d64';c.lineWidth=s*.04;c.beginPath();c.moveTo(-s*.16,-s*.22);c.lineTo(-s*.22,-s*.38);c.moveTo(-s*.12,-s*.24);c.lineTo(-s*.04,-s*.38);c.stroke();}
  else if(kind==='dinner_plate'){blob(c,0,0,s*.32,s*.32,'#f1f3e9');c.strokeStyle='#94aeb0';c.lineWidth=s*.02;c.beginPath();c.arc(0,0,s*.24,0,TAU);c.stroke();blob(c,-s*.08,0,s*.09,s*.08,'#78ad79');blob(c,s*.11,s*.05,s*.08,s*.07,'#dc8062');}
  else{c.fillStyle=kind==='cake'?'#e890a2':kind==='bread'?'#cf9854':'#c58c59';c.beginPath();if(kind==='bread')c.ellipse(0,s*.04,s*.31,s*.23,0,0,TAU);else c.roundRect(-s*.3,-s*.05,s*.6,s*.33,s*.05);c.fill();if(kind==='cake'){c.fillStyle='#fff0da';c.fillRect(-s*.3,-s*.1,s*.6,s*.08);}else if(kind==='vegetable_basket'||kind==='fruit_basket'){for(let i=0;i<4;i++)blob(c,-s*.22+i*s*.15,-s*.16,s*.08,s*.1,['#76b57a','#e99752','#cf6761','#e3c565'][i]);}}
  label(c,s,title);return true;
 }
 if(groups.sports.has(kind)){
  if(kind==='soccer_ball'||kind==='basketball'){blob(c,0,0,s*.3,s*.3,kind==='basketball'?'#e58d47':'#f4f4ec');c.strokeStyle='#40515b';c.lineWidth=s*.025;c.beginPath();c.arc(0,0,s*.3,0,TAU);c.stroke();if(kind==='basketball'){c.beginPath();c.arc(-s*.28,0,s*.27,-Math.PI/2,Math.PI/2);c.arc(s*.28,0,s*.27,Math.PI/2,Math.PI*1.5);c.stroke();}}
  else if(kind==='trophy'||kind==='medal'){c.fillStyle='#e8c45e';c.beginPath();c.roundRect(-s*.17,-s*.28,s*.34,s*.36,s*.04);c.fill();c.fillRect(-s*.05,s*.08,s*.1,s*.18);c.fillRect(-s*.19,s*.26,s*.38,s*.06);}
  else{c.fillStyle=color;c.beginPath();c.roundRect(-s*.25,-s*.24,s*.5,s*.48,s*.1);c.fill();c.strokeStyle='#e5eee8';c.lineWidth=s*.025;c.beginPath();c.arc(0,0,s*.17,0,TAU);c.stroke();}
  label(c,s,title);return true;
 }
 if(groups.nature.has(kind)){if(kind==='seedling'){c.strokeStyle='#4a966a';c.lineWidth=s*.035;c.beginPath();c.moveTo(0,s*.3);c.lineTo(0,-s*.08);c.stroke();blob(c,-s*.12,-s*.1,s*.15,s*.08,'#52b879');blob(c,s*.14,-s*.2,s*.15,s*.08,'#70cb84');blob(c,0,s*.34,s*.2,s*.07,'#886449');}else if(kind==='solar_panel'){c.fillStyle='#315b7d';c.fillRect(-s*.33,-s*.22,s*.66,s*.43);c.strokeStyle='#80c4d7';for(let i=-2;i<=2;i++){c.beginPath();c.moveTo(i*s*.12,-s*.22);c.lineTo(i*s*.12,s*.21);c.stroke();}}else{c.fillStyle='#3b9d91';c.beginPath();c.roundRect(-s*.25,-s*.25,s*.5,s*.55,s*.05);c.fill();c.fillStyle='#eef5e9';c.font='700 '+Math.round(s*.25)+'px system-ui';c.textAlign='center';c.fillText(kind==='recycling_bin'||kind==='trash_sort'?'↻':'♻',0,s*.1);}label(c,s,title);return true;}
 if(groups.finance.has(kind)){if(kind==='coin_stack'){for(let i=0;i<4;i++){c.fillStyle=i%2?'#f0d47c':'#dcb950';c.beginPath();c.ellipse((i%2)*s*.08-s*.04,s*(.22-i*.13),s*.24,s*.08,0,0,TAU);c.fill();}}else if(kind==='calculator'){c.fillStyle='#3b4c58';c.beginPath();c.roundRect(-s*.23,-s*.35,s*.46,s*.7,s*.05);c.fill();c.fillStyle='#a6d6cd';c.fillRect(-s*.17,-s*.26,s*.34,s*.12);for(let i=0;i<9;i++)blob(c,-s*.13+i%3*s*.13,-s*.04+Math.floor(i/3)*s*.13,s*.025,s*.025,'#e1e6dc');}else{card(c,s,'#f7f2e4');c.fillStyle='#58a28d';for(let i=0;i<4;i++)c.fillRect(-s*.22+i*s*.12,s*(.18-(i%3)*.12),s*.07,s*(.12+(i%3)*.12));}label(c,s,title);return true;}
 if(groups.construction.has(kind)){if(kind==='hard_hat'){c.fillStyle='#edc250';c.beginPath();c.ellipse(0,s*.07,s*.32,s*.18,0,0,TAU);c.fill();c.beginPath();c.roundRect(-s*.18,-s*.22,s*.36,s*.30,s*.15);c.fill();c.fillRect(-s*.38,s*.1,s*.76,s*.06);}else if(kind==='road_cone'){c.fillStyle='#ee8852';c.beginPath();c.moveTo(-s*.24,s*.28);c.lineTo(-s*.1,-s*.31);c.lineTo(s*.1,-s*.31);c.lineTo(s*.24,s*.28);c.fill();c.fillStyle='#f7efdb';c.fillRect(-s*.16,s*.04,s*.32,s*.07);}else{card(c,s,'#31628a');c.strokeStyle='#b9e4e4';c.strokeRect(-s*.23,-s*.26,s*.46,s*.52);c.beginPath();c.moveTo(-s*.18,s*.16);c.lineTo(-s*.18,-s*.13);c.lineTo(0,-s*.13);c.lineTo(0,s*.04);c.lineTo(s*.17,s*.04);c.stroke();}label(c,s,title);return true;}
 if(groups.technology.has(kind)){c.fillStyle='#344f5e';c.beginPath();c.roundRect(-s*.32,-s*.29,s*.64,s*.52,s*.05);c.fill();c.fillStyle='#173244';c.fillRect(-s*.27,-s*.24,s*.54,s*.41);c.strokeStyle='#68d7b6';c.lineWidth=s*.023;c.beginPath();c.moveTo(-s*.22,s*.1);c.lineTo(-s*.1,s*.02);c.lineTo(0,s*.07);c.lineTo(s*.09,-s*.12);c.lineTo(s*.22,-s*.15);c.stroke();label(c,s,title);return true;}
 if(groups.travel.has(kind)||groups.logistics.has(kind)){if(kind==='airplane'||kind==='cargo_plane'){c.fillStyle='#edf2eb';c.beginPath();c.moveTo(-s*.38,-s*.02);c.lineTo(-s*.04,-s*.08);c.lineTo(s*.03,-s*.35);c.lineTo(s*.14,-s*.34);c.lineTo(s*.14,-s*.05);c.lineTo(s*.38,s*.04);c.lineTo(s*.38,s*.13);c.lineTo(s*.13,s*.1);c.lineTo(s*.08,s*.34);c.lineTo(0,s*.34);c.closePath();c.fill();}else if(kind==='map_pin'){blob(c,0,-s*.14,s*.27,s*.27,'#e16962');blob(c,0,-s*.14,s*.09,s*.09,'#f7eedc');}else if(kind==='forklift'){c.fillStyle='#e8b94e';c.fillRect(-s*.24,-s*.04,s*.39,s*.25);c.strokeStyle='#4d5c63';c.lineWidth=s*.04;c.beginPath();c.moveTo(s*.13,-s*.04);c.lineTo(s*.13,-s*.34);c.lineTo(s*.34,-s*.34);c.moveTo(s*.13,s*.20);c.lineTo(s*.38,s*.20);c.stroke();}else{c.fillStyle=kind==='package'?'#bd915d':'#58889b';c.beginPath();c.roundRect(-s*.29,-s*.23,s*.58,s*.48,s*.06);c.fill();if(kind==='suitcase'){c.strokeStyle='#e2e7dc';c.strokeRect(-s*.12,-s*.35,s*.24,s*.13);}if(kind==='delivery_truck'||kind==='bus'||kind==='train'){c.fillStyle='#243d4a';blob(c,-s*.18,s*.23,s*.06,s*.06,'#243d4a');blob(c,s*.18,s*.23,s*.06,s*.06,'#243d4a');}}label(c,s,title);return true;}
 if(groups.animals.has(kind)){if(kind==='paw_print'){blob(c,0,s*.13,s*.17,s*.16,color);for(const [x,y]of [[-.2,-.08],[-.07,-.22],[.08,-.22],[.21,-.08]])blob(c,s*x,s*y,s*.08,s*.11,color);}else if(kind==='food_bowl'){c.fillStyle='#65aabd';c.beginPath();c.moveTo(-s*.3,-s*.08);c.lineTo(s*.3,-s*.08);c.lineTo(s*.2,s*.24);c.quadraticCurveTo(0,s*.34,-s*.2,s*.24);c.fill();}else{const fur=kind==='cat'?'#d9a778':kind==='lion'?'#dbae52':kind==='dinosaur'?'#65a77f':kind==='elephant'?'#819daa':'#bc835f';blob(c,0,s*.06,s*.25,s*.22,fur);blob(c,0,-s*.2,s*.19,s*.19,fur);if(['cat','rabbit','lion'].includes(kind)){c.fillStyle=fur;c.beginPath();c.moveTo(-s*.16,-s*.28);c.lineTo(-s*.18,-s*.45);c.lineTo(-s*.02,-s*.34);c.moveTo(s*.16,-s*.28);c.lineTo(s*.19,-s*.45);c.lineTo(s*.02,-s*.34);c.fill();}blob(c,-s*.07,-s*.21,s*.02,s*.022,'#293945');blob(c,s*.07,-s*.21,s*.02,s*.022,'#293945');}label(c,s,title);return true;}
 return false;
}
