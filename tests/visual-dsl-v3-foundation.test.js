import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeVisualDslV3,parseVisualPath,validateVisualDslV3,visualDslV3Capabilities,VisualDslV3ValidationError,diagnoseVisualDslV3Layout} from '../src/visual-dsl-v3.js';
import {renderVisualDslV3Scene} from '../src/render/visual-dsl-v3-renderer.js';

const fixture=async name=>JSON.parse(await readFile(new URL(`../examples/visual_dsl_v3/${name}`,import.meta.url),'utf8'));
function baseDocument(root={id:'root',type:'group',children:[]}){return{visual_dsl_version:3,title:'Test',language:'vi-VN',aspect_ratio:'16:9',symbols:{},scenes:[{id:'s1',title:'Scene',duration_seconds:4,narration:'Lời thoại tiếng Việt.',stage:{width:1600,height:900,background:'#FFFFFF'},root}]};}

class RecordingContext{
  constructor(canvas){this.canvas=canvas;this.globalAlpha=1;this.fillStyle='#000';this.strokeStyle='#000';this.lineWidth=1;this.log=[];this.matrix={a:1,b:0,c:0,d:1,e:0,f:0};this.stack=[];}
  save(){this.stack.push({globalAlpha:this.globalAlpha,fillStyle:this.fillStyle,strokeStyle:this.strokeStyle,lineWidth:this.lineWidth,lineCap:this.lineCap,lineJoin:this.lineJoin,font:this.font,textAlign:this.textAlign,textBaseline:this.textBaseline,shadowColor:this.shadowColor,shadowBlur:this.shadowBlur,shadowOffsetX:this.shadowOffsetX,shadowOffsetY:this.shadowOffsetY,matrix:{...this.matrix}});}
  restore(){const state=this.stack.pop();if(state)Object.assign(this,state);}
  setTransform(a,b,c,d,e,f){this.matrix={a,b,c,d,e,f};this.log.push(['setTransform',a,b,c,d,e,f]);}
  getTransform(){return{...this.matrix};}
  mul(a,b,c,d,e,f){const m=this.matrix;this.matrix={a:m.a*a+m.c*b,b:m.b*a+m.d*b,c:m.a*c+m.c*d,d:m.b*c+m.d*d,e:m.a*e+m.c*f+m.e,f:m.b*e+m.d*f+m.f};}
  translate(x,y){this.mul(1,0,0,1,x,y);this.log.push(['translate',x,y]);}
  rotate(r){this.mul(Math.cos(r),Math.sin(r),-Math.sin(r),Math.cos(r),0,0);this.log.push(['rotate',r]);}
  scale(x,y){this.mul(x,0,0,y,0,0);this.log.push(['scale',x,y]);}
  clearRect(...a){this.log.push(['clearRect',...a]);}fillRect(...a){this.log.push(['fillRect',this.fillStyle,...a]);}beginPath(){this.log.push(['beginPath']);}rect(...a){this.log.push(['rect',...a]);}clip(){this.log.push(['clip']);}moveTo(...a){this.log.push(['moveTo',...a]);}lineTo(...a){this.log.push(['lineTo',...a]);}quadraticCurveTo(...a){this.log.push(['quadraticCurveTo',...a]);}bezierCurveTo(...a){this.log.push(['bezierCurveTo',...a]);}closePath(){this.log.push(['closePath']);}arc(...a){this.log.push(['arc',...a,{...this.matrix}]);}ellipse(...a){this.log.push(['ellipse',...a]);}fill(){this.log.push(['fill',this.fillStyle,this.globalAlpha,this.shadowBlur,this.shadowOffsetX,this.shadowOffsetY]);}stroke(){this.log.push(['stroke',this.strokeStyle,this.lineWidth,this.globalAlpha,this.shadowBlur]);}fillText(...a){this.log.push(['fillText',...a,this.fillStyle,this.globalAlpha]);}strokeText(...a){this.log.push(['strokeText',...a,this.strokeStyle,this.globalAlpha]);}drawImage(...a){this.log.push(['drawImage',this.globalAlpha,...a.slice(1)]);}measureText(value){return{width:value.length*10};}createLinearGradient(...args){this.log.push(['linearGradient',...args,{...this.matrix}]);return{addColorStop:(...stop)=>this.log.push(['colorStop',...stop])};}createRadialGradient(...args){this.log.push(['radialGradient',...args,{...this.matrix}]);return{addColorStop:(...stop)=>this.log.push(['colorStop',...stop])};}
}
function canvas(width=1280,height=720){const el={width,height};el.ctx=new RecordingContext(el);el.getContext=()=>el.ctx;return el;}
function replaceScene(doc,mutate){const copy=structuredClone(doc);mutate(copy.scenes[0]);return copy;}
function assertDiagnostic(fn,code){assert.throws(fn,error=>error instanceof VisualDslV3ValidationError&&error.diagnostics.some(item=>item.code===code),`expected diagnostic ${code}`);}

test('capability manifest advertises the bounded hybrid image and vector subset',()=>{
  assert.equal(visualDslV3Capabilities.visual_dsl_version,3);assert(visualDslV3Capabilities.nodes.includes('symbol_instance'));assert(visualDslV3Capabilities.nodes.includes('image'));assert.deepEqual(visualDslV3Capabilities.image_asset.formats,['image/png','image/webp']);assert.deepEqual(visualDslV3Capabilities.image_asset.fit_modes,['contain','cover','fill']);assert.equal(visualDslV3Capabilities.image_asset.resolution,'preflight-required');assert(visualDslV3Capabilities.path_commands.includes('Q'));assert(visualDslV3Capabilities.reserved_unavailable.includes('mp4_export'));
});

test('premium pump, geometry stress, and robot composition fixtures validate and normalize',async()=>{
  for(const name of ['premium_bicycle_pump.json','vector_geometry_stress.json','robot_sensor_composition.json']){const doc=await fixture(name);assert.equal(validateVisualDslV3(doc),true);const normalized=normalizeVisualDslV3(doc);assert.equal(normalized.visual_dsl_version,3);assert(Object.isFrozen(normalized));}
  const pump=await fixture('premium_bicycle_pump.json');assert.equal(pump.aspect_ratio,'both');assert.equal(pump.variants.landscape.scenes[0].narration,pump.variants.portrait.scenes[0].narration);
});

test('required fields, unsupported nodes, invalid transforms/styles/stages/durations, and budgets fail with paths',()=>{
  assertDiagnostic(()=>validateVisualDslV3({visual_dsl_version:3,aspect_ratio:'16:9',scenes:[]}), 'title_required');
  assertDiagnostic(()=>validateVisualDslV3(baseDocument({id:'g',type:'group',children:[{id:'bad',type:'image',geometry:{}}]})),'image_asset_id');
  assertDiagnostic(()=>validateVisualDslV3(baseDocument({id:'g',type:'group',children:[{id:'r',type:'rect',geometry:{x:0,y:0,width:10,height:10},transform:{scale_x:0}}]})),'scale_range');
  assertDiagnostic(()=>validateVisualDslV3(baseDocument({id:'g',type:'group',children:[{id:'r',type:'rect',geometry:{x:0,y:0,width:10,height:10},style:{fill:'url(javascript:alert(1))'}}]})),'color_syntax');
  assertDiagnostic(()=>validateVisualDslV3(replaceScene(baseDocument(),scene=>{scene.stage.width=3000;})),'stage_range');
  assertDiagnostic(()=>validateVisualDslV3(replaceScene(baseDocument(),scene=>{scene.duration_seconds=301;})),'duration_range');
  assertDiagnostic(()=>validateVisualDslV3(replaceScene(baseDocument(),scene=>{scene.narration='x'.repeat(1201);} )),'narration_length');
  const over=baseDocument({id:'g',type:'group',children:Array.from({length:161},(_,i)=>({id:`r${i}`,type:'rect',geometry:{x:0,y:0,width:2,height:2}}))});assertDiagnostic(()=>validateVisualDslV3(over),'node_budget');
});

test('security and recursion budgets reject nonfinite values, unsafe paths, deep trees, bad overrides, and unused recursive symbols',()=>{
  assertDiagnostic(()=>validateVisualDslV3(baseDocument({id:'g',type:'group',children:[{id:'r',type:'rect',geometry:{x:0,y:0,width:10,height:10},transform:{x:Number.NaN}}]})),'number_range');
  assertDiagnostic(()=>validateVisualDslV3(baseDocument({id:'g',type:'group',children:[{id:'p',type:'path',geometry:{d:'M 0 0 '+(' '.repeat(4100))}}]})),'path_length');
  assertDiagnostic(()=>validateVisualDslV3(baseDocument({id:'g',type:'group',children:[{id:'r',type:'rect',geometry:{x:0,y:0,width:10,height:10},style:{filter:'url(https://example.invalid/x)'}}]})),'unsupported_field');
  assertDiagnostic(()=>validateVisualDslV3(baseDocument({id:'g',type:'group',children:[{id:'s',type:'symbol_instance',geometry:{symbol:'x',width:2,height:2},style_overrides:{fill:'url(https://invalid)'}}]})),'color_syntax');
  let tree={id:'deep-leaf',type:'circle',geometry:{cx:0,cy:0,radius:1}};for(let i=0;i<12;i++)tree={id:`deep-${i}`,type:'group',children:[tree]};assertDiagnostic(()=>validateVisualDslV3(baseDocument(tree)),'tree_depth');
  const unusedCycle=baseDocument();unusedCycle.symbols={cycle:{view_box:{width:10,height:10},root:{id:'root-symbol',type:'group',children:[{id:'loop',type:'symbol_instance',geometry:{symbol:'cycle',width:5,height:5}}]}}};assertDiagnostic(()=>validateVisualDslV3(unusedCycle),'symbol_recursive');
});

test('both aspect variants require matching scenes, narration, and duration while allowing separate geometry',async()=>{
  const pump=await fixture('premium_bicycle_pump.json'),valid=structuredClone(pump);assert.equal(validateVisualDslV3(valid),true);
  const mismatch=structuredClone(pump);mismatch.variants.portrait.scenes[0].duration_seconds=17;assertDiagnostic(()=>validateVisualDslV3(mismatch),'variant_duration_mismatch');
  const narration=structuredClone(pump);narration.variants.portrait.scenes[0].narration+=' Khác.';assertDiagnostic(()=>validateVisualDslV3(narration),'variant_narration_mismatch');
});

test('path parser supports absolute/relative M L H V C S Q T Z and rejects arcs, markup, and invalid numbers',()=>{
  const parsed=parseVisualPath('M 10 10 l 5 0 h 5 v 5 C 20 20 25 20 30 25 S 40 30 45 35 Q 50 40 55 35 T 65 35 z');
  assert.deepEqual(parsed.map(item=>item.cmd),['M','L','L','L','C','C','Q','Q','Z']);assert.deepEqual(parsed[4],{cmd:'C',x1:20,y1:20,x2:25,y2:20,x:30,y:25});assert.deepEqual(parsed[5],{cmd:'C',x1:35,y1:30,x2:40,y2:30,x:45,y:35});
  assert.throws(()=>parseVisualPath('M0 0 A4 4 0 0 1 9 9'),/Arc path commands/);assert.throws(()=>parseVisualPath('<svg onload="x">'),/Invalid path character/);assert.throws(()=>parseVisualPath('M 0 0 L NaN 3'),/requires 2 parameters/);assert.throws(()=>parseVisualPath('M 0 0 L 1e999 3'),/finite/);
});

test('invalid path fixture reports an actionable path diagnostic before rendering',async()=>{const doc=await fixture('invalid_arc_path.json');assertDiagnostic(()=>normalizeVisualDslV3(doc),'path_syntax');});

test('normalization is repeatable, immutable, canonical, and does not mutate source JSON',async()=>{
  const doc=await fixture('vector_geometry_stress.json'),before=JSON.stringify(doc),one=normalizeVisualDslV3(doc),two=normalizeVisualDslV3(doc);assert.equal(JSON.stringify(doc),before);assert.deepEqual(one,two);assert.equal(one.scenes[0].root.children[1].transform.origin_x,100);assert.equal(one.symbols['gear-mark'].root.children[2].geometry.parsed_commands.length,8);
});

test('Canvas2D renderer draws paths, text, shape types, and deterministic sibling Z order',()=>{
  const doc=baseDocument({id:'root',type:'group',children:[{id:'late',type:'rect',z_index:2,geometry:{x:0,y:0,width:10,height:10},style:{fill:'#FF0000'}},{id:'curve',type:'path',z_index:1,geometry:{d:'M 0 0 C 1 2 3 4 5 6 Q 7 8 9 10 Z'},style:{fill:'none',stroke:'#000000',stroke_width:2}},{id:'early',type:'circle',z_index:-1,geometry:{cx:5,cy:5,radius:2},style:{fill:'#0000FF'}},{id:'label',type:'text',z_index:4,geometry:{x:5,y:20,text:'Label',font_size:12},style:{fill:'#222222'}}]});
  const normalized=normalizeVisualDslV3(doc),target=canvas();renderVisualDslV3Scene(target,normalized.scenes[0]);const calls=target.ctx.log;assert.deepEqual(calls.filter(item=>item[0]==='fill').map(item=>item[1]),['#0000FF','#FF0000']);assert.equal(calls.filter(item=>item[0]==='bezierCurveTo').length,1);assert.equal(calls.filter(item=>item[0]==='quadraticCurveTo').length,1);assert(calls.some(item=>item[0]==='fillText'&&item[1]==='Label'));
});

test('all implemented vector node types reach Canvas2D drawing calls',()=>{
  const children=[
    {id:'rect',type:'rect',geometry:{x:0,y:0,width:10,height:10},style:{fill:'#111111'}},
    {id:'round',type:'rounded_rect',geometry:{x:12,y:0,width:10,height:10,radius:3},style:{fill:'#222222'}},
    {id:'circle',type:'circle',geometry:{cx:30,cy:5,radius:5},style:{fill:'#333333'}},
    {id:'ellipse',type:'ellipse',geometry:{cx:45,cy:5,rx:7,ry:4},style:{fill:'#444444'}},
    {id:'line',type:'line',geometry:{x1:55,y1:0,x2:65,y2:10},style:{stroke:'#555555',stroke_width:2}},
    {id:'polyline',type:'polyline',geometry:{points:[[70,0],[75,10],[80,0]]},style:{stroke:'#666666',stroke_width:2}},
    {id:'polygon',type:'polygon',geometry:{points:[[85,0],[95,0],[90,10]]},style:{fill:'#777777'}},
    {id:'path',type:'path',geometry:{d:'M 100 0 Q 105 10 110 0'},style:{stroke:'#888888',stroke_width:2}},
    {id:'text',type:'text',geometry:{x:115,y:10,text:'T',font_size:10},style:{fill:'#999999'}}
  ];const doc=baseDocument({id:'root',type:'group',children}),normalized=normalizeVisualDslV3(doc),target=canvas();renderVisualDslV3Scene(target,normalized.scenes[0]);const methods=new Set(target.ctx.log.map(item=>item[0]));for(const method of ['rect','arc','ellipse','moveTo','lineTo','quadraticCurveTo','fillText'])assert(methods.has(method),`missing Canvas2D call ${method}`);
});

test('parent and child transforms use T·R·S·T(-origin), including nonuniform and negative scale',()=>{
  const doc=baseDocument({id:'root',type:'group',transform:{x:10,y:20,rotation_degrees:0,scale_x:1,scale_y:1,origin_x:0,origin_y:0},children:[{id:'parent',type:'group',transform:{x:100,y:50,rotation_degrees:90,scale_x:2,scale_y:3,origin_x:10,origin_y:20},children:[{id:'leaf',type:'circle',transform:{x:5,y:7,scale_x:-1,scale_y:0.5},geometry:{cx:0,cy:0,radius:2},style:{fill:'#123456'}}]}]});
  const normalized=normalizeVisualDslV3(doc),target=canvas();renderVisualDslV3Scene(target,normalized.scenes[0]);const leafMatrix=target.ctx.log.filter(item=>item[0]==='arc').length;assert.equal(leafMatrix,1);assertDiagnostic(()=>validateVisualDslV3(replaceScene(doc,scene=>{scene.root.children[0].transform.scale_y=0;})),'scale_range');
  const matrix=target.ctx.log.find(item=>item[0]==='arc').at(-1);for(const key of ['a','b','c','d','e','f'])assert(Math.abs(matrix[key]-({a:0,b:-1.6,c:-1.2,d:0,e:119.2,f:48}[key]))<1e-8,`${key}: ${matrix[key]}`);
});

test('symbol reuse keeps definitions unchanged, applies per-instance transforms and style overrides',async()=>{
  const source=await fixture('vector_geometry_stress.json'),before=JSON.stringify(source),normalized=normalizeVisualDslV3(source),target=canvas(),layers=[];renderVisualDslV3Scene(target,normalized.scenes[0],{symbols:normalized.symbols,createCanvas:(w,h)=>{const layer=canvas(w,h);layers.push(layer);return layer;}});assert.equal(JSON.stringify(source),before);const fills=[target,...layers].flatMap(item=>item.ctx.log.filter(call=>call[0]==='fill').map(call=>call[1]));assert(fills.includes('#56C5B8'));assert(fills.includes('#F4B860'));assert.equal(fills.filter(fill=>fill==='#F4B860').length,1);
  const missing=structuredClone(source);missing.scenes[0].root.children[1].children[1].geometry.symbol='nope';assertDiagnostic(()=>validateVisualDslV3(missing),'symbol_missing');
  const recursive=baseDocument({id:'root',type:'group',children:[{id:'again',type:'symbol_instance',geometry:{symbol:'loop',width:50,height:50}}]});recursive.symbols={loop:{view_box:{width:50,height:50},root:{id:'def',type:'group',children:[{id:'recurse',type:'symbol_instance',geometry:{symbol:'loop',width:10,height:10}}]}}};assertDiagnostic(()=>validateVisualDslV3(recursive),'symbol_recursive');
  const over=structuredClone(source);over.symbols['gear-mark'].root.children=Array.from({length:161},(_,i)=>({id:`x${i}`,type:'circle',geometry:{cx:1,cy:1,radius:1}}));assertDiagnostic(()=>validateVisualDslV3(over),'node_budget');
});

test('group opacity composites overlapping children once on an offscreen layer',()=>{
  const doc=baseDocument({id:'root',type:'group',children:[{id:'layer',type:'group',opacity:0.5,children:[{id:'a',type:'circle',geometry:{cx:10,cy:10,radius:8},style:{fill:'#FF0000'}},{id:'b',type:'circle',geometry:{cx:15,cy:10,radius:8},style:{fill:'#0000FF'}}]}]});const normalized=normalizeVisualDslV3(doc),main=canvas();let layerCanvas;const createCanvas=(w,h)=>{layerCanvas=canvas(w,h);return layerCanvas;};renderVisualDslV3Scene(main,normalized.scenes[0],{createCanvas});assert.equal(layerCanvas.ctx.log.filter(item=>item[0]==='fill').length,2);assert.equal(main.ctx.log.filter(item=>item[0]==='drawImage').length,1);assert.equal(main.ctx.log.find(item=>item[0]==='drawImage')[1],0.5);
});

test('visibility, node opacity, fill/stroke caps, stage fit, and repeated render are deterministic',async()=>{
  const doc=baseDocument({id:'root',type:'group',children:[{id:'hidden',type:'circle',visible:false,geometry:{cx:1,cy:1,radius:1},style:{fill:'#000000'}},{id:'visible',type:'line',opacity:0.4,geometry:{x1:0,y1:0,x2:10,y2:10},style:{stroke:'#123456',stroke_width:3,line_cap:'round'}}]});const normalized=normalizeVisualDslV3(doc),a=canvas(),b=canvas(),fit=renderVisualDslV3Scene(a,normalized.scenes[0]);renderVisualDslV3Scene(b,normalized.scenes[0]);assert.equal(a.ctx.log.filter(item=>item[0]==='arc').length,0);assert.equal(a.ctx.log.find(item=>item[0]==='stroke')[3],0.4);assert.deepEqual(a.ctx.log,b.ctx.log);assert.equal(fit.scale,0.8);
  const pump=normalizeVisualDslV3(await fixture('premium_bicycle_pump.json'));const landscape=canvas(1280,720),portrait=canvas(720,1280);assert.deepEqual(renderVisualDslV3Scene(landscape,pump.variants.landscape.scenes[0],{symbols:pump.symbols}).stage,{width:1600,height:900});assert.deepEqual(renderVisualDslV3Scene(portrait,pump.variants.portrait.scenes[0],{symbols:pump.symbols}).stage,{width:900,height:1600});
});

test('linear and radial gradients validate, honor local and scene coordinates, and reset per node',()=>{
  const children=[{id:'local',type:'rect',transform:{x:12,y:8,scale_x:2,scale_y:.5},geometry:{x:0,y:0,width:20,height:10},style:{fill:{type:'linear',units:'local',x1:0,y1:0,x2:20,y2:0,stops:[{offset:0,color:'#112233'},{offset:1,color:'#AABBCC'}]}}},{id:'scene',type:'circle',geometry:{cx:50,cy:50,radius:18},style:{fill:{type:'radial',units:'scene',cx:50,cy:50,fx:45,fy:46,radius:18,inner_radius:2,stops:[{offset:0,color:'#FFFFFF'},{offset:1,color:'#224466',opacity:.4}]}}},{id:'solid',type:'rect',geometry:{x:80,y:0,width:10,height:10},style:{fill:'#FF0000'}}];
  const doc=baseDocument({id:'root',type:'group',children}),normalized=normalizeVisualDslV3(doc),target=canvas();renderVisualDslV3Scene(target,normalized.scenes[0]);assert.equal(target.ctx.log.filter(item=>item[0]==='linearGradient').length,1);assert.equal(target.ctx.log.filter(item=>item[0]==='radialGradient').length,1);const radial=target.ctx.log.find(item=>item[0]==='radialGradient');assert.deepEqual(radial.slice(1,7),[45,46,2,50,50,18]);assert.deepEqual(radial.at(-1),{a:.8,b:0,c:0,d:.8,e:0,f:0});assert(target.ctx.log.some(item=>item[0]==='fill'&&item[1]==='#FF0000'));
  const badStops=structuredClone(doc);badStops.scenes[0].root.children[0].style.fill.stops[1].offset=2;assertDiagnostic(()=>validateVisualDslV3(badStops),'gradient_stop');const badRadius=structuredClone(doc);badRadius.scenes[0].root.children[1].style.fill.radius=0;assertDiagnostic(()=>validateVisualDslV3(badRadius),'gradient_radius');const coincident=structuredClone(doc);coincident.scenes[0].root.children[0].style.fill.x2=0;assertDiagnostic(()=>validateVisualDslV3(coincident),'gradient_coincident');
});

test('bounded shadows and fill/stroke opacity reset between nodes, including zero opacity',()=>{
  const doc=baseDocument({id:'root',type:'group',children:[{id:'shadowed',type:'circle',geometry:{cx:20,cy:20,radius:8},style:{fill:'#123456',fill_opacity:0,shadow:{color:'#000000',blur:8,offset_x:2,offset_y:4,opacity:.2}}},{id:'plain',type:'circle',geometry:{cx:50,cy:20,radius:8},style:{fill:'#654321'}}]});const normalized=normalizeVisualDslV3(doc),target=canvas();renderVisualDslV3Scene(target,normalized.scenes[0]);const fills=target.ctx.log.filter(item=>item[0]==='fill');assert.equal(fills[0][2],0);assert.equal(fills[0][3],6.4);assert.equal(fills[0][4],1.6);assert.equal(fills[0][5],3.2);assert.equal(fills[1][2],1);assert.equal(fills[1][3],0);const bad=structuredClone(doc);bad.scenes[0].root.children[0].style.shadow.blur=25;assertDiagnostic(()=>validateVisualDslV3(bad),'shadow_range');bad.scenes[0].root.children[0].style.shadow.blur=4;bad.scenes[0].root.children[0].style.shadow.offset_x=41;assertDiagnostic(()=>validateVisualDslV3(bad),'shadow_range');
});

test('rectangular, rounded, and path clips nest safely and invalid clip geometry fails validation',()=>{
  const doc=baseDocument({id:'root',type:'group',clip:{type:'rect',geometry:{x:0,y:0,width:120,height:120}},children:[{id:'nested',type:'group',transform:{x:4,y:4},clip:{type:'rounded_rect',geometry:{x:0,y:0,width:100,height:100,radius:12}},children:[{id:'path-clip',type:'group',clip:{type:'path',geometry:{d:'M 0 0 L 60 0 L 60 60 Z'}},children:[{id:'rect',type:'rect',geometry:{x:0,y:0,width:80,height:80},style:{fill:'#123456'}}]}]}]});const normalized=normalizeVisualDslV3(doc),target=canvas();renderVisualDslV3Scene(target,normalized.scenes[0]);assert(target.ctx.log.filter(item=>item[0]==='clip').length>=4);const bad=structuredClone(doc);bad.scenes[0].root.clip.geometry.width=0;assertDiagnostic(()=>validateVisualDslV3(bad),'clip_size');bad.scenes[0].root.clip.geometry.width=10;bad.scenes[0].root.children[0].children[0].clip.geometry.d='M0 0 A2 2 0 0 1 5 5';assertDiagnostic(()=>validateVisualDslV3(bad),'path_syntax');
});

test('offscreen composition budget is enforced and Canvas state restores after a rejected render',()=>{
  const children=Array.from({length:17},(_,i)=>({id:`layer-${i}`,type:'group',opacity:.5,children:[{id:`dot-${i}`,type:'circle',geometry:{cx:i+1,cy:5,radius:1},style:{fill:'#123456'}}]})),doc=baseDocument({id:'root',type:'group',children}),normalized=normalizeVisualDslV3(doc),target=canvas();assert.throws(()=>renderVisualDslV3Scene(target,normalized.scenes[0],{createCanvas:(w,h)=>canvas(w,h)}),/16 offscreen compositions/);assert.equal(target.ctx.stack.length,0);assert.deepEqual(target.ctx.matrix,{a:1,b:0,c:0,d:1,e:0,f:0});
});

test('Vietnamese word wrapping, grapheme letter spacing, and text clipping use bounded geometry',()=>{
  const doc=baseDocument({id:'root',type:'group',children:[{id:'vi',type:'text',geometry:{x:8,y:28,text:'Xin chào các bạn',font_size:16,font_weight:'bold',max_width:55,wrap:'word',line_height:1.4,letter_spacing:.5,max_lines:4},style:{fill:'#123456'}}]});const normalized=normalizeVisualDslV3(doc),target=canvas();renderVisualDslV3Scene(target,normalized.scenes[0]);const lines=target.ctx.log.filter(item=>item[0]==='fillText').map(item=>item[1]);assert(lines.length>1);assert(lines.every(line=>line.length>0));assertDiagnostic(()=>validateVisualDslV3(replaceScene(doc,scene=>{scene.root.children[0].geometry.max_width=2401;})),'text_width');
});

test('preset and custom design tokens resolve without recursion and layout warnings are actionable',()=>{
  const doc=baseDocument({id:'root',type:'group',children:[{id:'label',type:'text',geometry:{x:10,y:10,text:'Tiếng Việt',font_size:12},style:{fill:{token:'palette.accent'}}}]});doc.art_direction={preset:'scientific_premium'};doc.tokens={accent:'#FF0088'};doc.scenes[0].layout={minimum_text_px:14,safe_regions:[{name:'title',x:0,y:0,width:200,height:60}]};assert.equal(validateVisualDslV3(doc),true);const normalized=normalizeVisualDslV3(doc);assert.equal(normalized.scenes[0].root.children[0].style.fill,'#FF0088');const warnings=diagnoseVisualDslV3Layout(normalized.scenes[0],{canvasWidth:1280,canvasHeight:720});assert(warnings.some(item=>item.code==='text_below_minimum'));assert(warnings.some(item=>item.code==='text_safe_region_overlap'));const missing=structuredClone(doc);missing.art_direction.preset=undefined;missing.scenes[0].root.children[0].style.fill.token='palette.unknown';assertDiagnostic(()=>validateVisualDslV3(missing),'token_missing');const invalid=structuredClone(doc);invalid.tokens.accent={token:'palette.other'};assertDiagnostic(()=>validateVisualDslV3(invalid),'token_color');
});

test('both premium benchmark fixtures validate, render clean layout diagnostics, and use distinct art direction',async()=>{
  const scientific=await fixture('scientific_pump_premium.json'),cartoon=await fixture('educational_cartoon_premium.json');assert.equal(validateVisualDslV3(scientific),true);assert.equal(validateVisualDslV3(cartoon),true);assert.equal(scientific.aspect_ratio,'both');assert.equal(cartoon.aspect_ratio,'both');assert.equal(scientific.art_direction.preset,'scientific_premium');assert.equal(cartoon.art_direction.preset,'educational_cartoon_premium');const docs=[normalizeVisualDslV3(scientific),normalizeVisualDslV3(cartoon)];for(const normalized of docs)for(const variant of ['landscape','portrait']){const isPortrait=variant==='portrait',scene=normalized.variants[variant].scenes[0],target=canvas(isPortrait?720:1280,isPortrait?1280:720);renderVisualDslV3Scene(target,scene,{symbols:normalized.symbols});assert(target.ctx.log.some(item=>item[0]==='fill'||item[0]==='fillText'));assert.deepEqual(diagnoseVisualDslV3Layout(scene,{canvasWidth:target.width,canvasHeight:target.height}),[]);}assert.notDeepEqual(scientific.variants.landscape.scenes[0].stage,cartoon.variants.landscape.scenes[0].stage);
});
