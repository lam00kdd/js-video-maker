import test from 'node:test';
import assert from 'node:assert/strict';
import {collectVisualDslV3AssetReferences,evaluateVisualDslV3Scene,normalizeVisualDslV3,validateVisualDslV3,VisualDslV3ValidationError,visualDslV3Capabilities} from '../src/visual-dsl-v3.js';
import {renderVisualDslV3Scene,resolveVisualImageFit} from '../src/render/visual-dsl-v3-renderer.js';
import {renderVisualDslV3Frame} from '../src/render/visual-dsl-v3-frame.js';

const ASSET='visual_'+'a'.repeat(64),image=(id='subject',extra={})=>({id,type:'image',z_index:10,geometry:{asset_id:ASSET,x:0,y:0,width:100,height:100,fit:'contain'},...extra});
function doc(children=[image()]){return{visual_dsl_version:3,title:'Hybrid image test',language:'vi-VN',aspect_ratio:'16:9',symbols:{},scenes:[{id:'scene',title:'Image',duration_seconds:4,narration:'Chủ thể thật cùng chú thích vector.',stage:{width:1600,height:900,background:'#FFFFFF'},timeline:{tracks:[]},root:{id:'root',type:'group',children}}]};}
function canvas(width=1280,height=720){const log=[],stack=[];const ctx={canvas:null,globalAlpha:1,fillStyle:'#fff',strokeStyle:'#000',lineWidth:1,imageSmoothingEnabled:false,matrix:{a:1,b:0,c:0,d:1,e:0,f:0},save(){stack.push({alpha:this.globalAlpha,fill:this.fillStyle,stroke:this.strokeStyle,width:this.lineWidth,matrix:{...this.matrix}});},restore(){const s=stack.pop();if(s){this.globalAlpha=s.alpha;this.fillStyle=s.fill;this.strokeStyle=s.stroke;this.lineWidth=s.width;this.matrix=s.matrix;}},setTransform(a,b,c,d,e,f){this.matrix={a,b,c,d,e,f};log.push(['setTransform',...Object.values(this.matrix)]);},getTransform(){return{...this.matrix};},translate(x,y){this.matrix.e+=x;this.matrix.f+=y;log.push(['translate',x,y]);},rotate(){},scale(x,y){this.matrix.a*=x;this.matrix.d*=y;this.matrix.e*=x;this.matrix.f*=y;},clearRect(){},fillRect(){},beginPath(){},rect(...v){log.push(['rect',...v]);},clip(){log.push(['clip']);},moveTo(){},lineTo(){},quadraticCurveTo(){},bezierCurveTo(){},closePath(){},stroke(){log.push(['stroke',this.globalAlpha,this.strokeStyle]);},fill(){log.push(['fill',this.globalAlpha,this.fillStyle]);},arc(){},ellipse(){},fillText(...v){log.push(['fillText',...v]);},strokeText(){},measureText(t){return{width:t.length*8};},drawImage(...v){log.push(['drawImage',this.globalAlpha,...v,{matrix:{...this.matrix}}]);},createLinearGradient(){return{addColorStop(){}};},createRadialGradient(){return{addColorStop(){}};}};const c={width,height,getContext:()=>ctx};ctx.canvas=c;return{canvas:c,ctx,log};}
const bitmap={width:200,height:100,close(){}};
function issueCode(fn,code){assert.throws(fn,error=>error instanceof VisualDslV3ValidationError&&error.diagnostics.some(item=>item.code===code));}

test('image nodes validate, normalize immutably, collect unique assets and preserve per-scene references',()=>{
  const source=doc([image('rice'),image('corn',{z_index:11})]);assert.equal(validateVisualDslV3(source),true);const normalized=normalizeVisualDslV3(source);assert.equal(normalized.scenes[0].root.children[0].geometry.asset_id,ASSET);assert.equal(normalized.scenes[0].root.children[0].geometry.fit,'contain');assert(Object.isFrozen(normalized));assert.deepEqual(collectVisualDslV3AssetReferences(normalized),[{asset_id:ASSET,references:[{kind:'scene',variant:'root',scene_id:'scene',scene_index:0,node_id:'rice'},{kind:'scene',variant:'root',scene_id:'scene',scene_index:0,node_id:'corn'}]}]);assert(visualDslV3Capabilities.nodes.includes('image'));
});

test('image schema rejects bad identity, geometry, fit, fields and image-node overflow',()=>{
  const badId=doc();badId.scenes[0].root.children[0].geometry.asset_id='visual_fake';issueCode(()=>validateVisualDslV3(badId),'image_asset_id');
  for(const [key,value,code]of [['width',0,'image_size'],['height',Infinity,'image_geometry_number'],['fit','stretch','image_fit'],['crop',{},'unsupported_field']]){const bad=doc();bad.scenes[0].root.children[0].geometry[key]=value;issueCode(()=>validateVisualDslV3(bad),code);}
  issueCode(()=>validateVisualDslV3(doc(Array.from({length:33},(_,i)=>image(`img_${i}`,{z_index:i})))),'image_node_budget');
});

test('contain, cover and fill calculate centered aspect-preserving or explicit stretch geometry',()=>{
  assert.deepEqual(resolveVisualImageFit({sourceWidth:200,sourceHeight:100,x:10,y:20,width:100,height:100,fit:'contain'}),{sx:0,sy:0,sw:200,sh:100,dx:10,dy:45,dw:100,dh:50});
  assert.deepEqual(resolveVisualImageFit({sourceWidth:200,sourceHeight:100,x:10,y:20,width:100,height:100,fit:'cover'}),{sx:50,sy:0,sw:100,sh:100,dx:10,dy:20,dw:100,dh:100});
  assert.deepEqual(resolveVisualImageFit({sourceWidth:100,sourceHeight:200,x:1,y:2,width:300,height:100,fit:'fill'}),{sx:0,sy:0,sw:100,sh:200,dx:1,dy:2,dw:300,dh:100});
  assert.throws(()=>resolveVisualImageFit({sourceWidth:0,sourceHeight:2,x:0,y:0,width:1,height:1}),/positive/);
});

test('shared Canvas renderer composites transparent images at their Z position and reports missing assets explicitly',()=>{
  const source=doc([image('subject',{z_index:1,opacity:.5}),{id:'vector-label',type:'text',z_index:2,geometry:{x:5,y:5,text:'CẢM BIẾN',font_size:20},style:{fill:'#123456'}}]),normalized=normalizeVisualDslV3(source),target=canvas(),resourceMap=new Map([[ASSET,bitmap]]);
  renderVisualDslV3Scene(target.canvas,normalized.scenes[0],{resources:resourceMap});const draw=target.log.findIndex(item=>item[0]==='drawImage'),label=target.log.findIndex(item=>item[0]==='fillText');assert(draw>=0&&label>draw);assert.equal(target.log[draw][1],.5);assert.deepEqual(target.log[draw].slice(3,11),[0,0,200,100,0,25,100,50]);
  const missing=canvas();assert.throws(()=>renderVisualDslV3Scene(missing.canvas,normalized.scenes[0]),/Missing prepared image asset/);const diagnostic=renderVisualDslV3Scene(missing.canvas,normalized.scenes[0],{missingAssetPolicy:'diagnostic'});assert.equal(diagnostic.asset_diagnostics[0].asset_id,ASSET);assert(missing.log.some(item=>item[0]==='stroke'));assert(!missing.log.some(item=>item[0]==='drawImage'));
});

test('image and vector siblings share camera and parent transforms, group clipping and group opacity',()=>{
  const group={id:'group',type:'group',z_index:3,opacity:.6,transform:{x:10,y:20},clip:{type:'rect',geometry:{x:0,y:0,width:500,height:300}},children:[image('nested',{z_index:1}),{id:'marker',type:'circle',z_index:2,geometry:{cx:40,cy:50,radius:8},style:{fill:'#00AA88'}}]},source=doc([group]);source.scenes[0].timeline.tracks=[{target_id:'camera',property:'camera.pan_x',keyframes:[{time_seconds:0,value:0},{time_seconds:2,value:20}]},{target_id:'nested',property:'x',keyframes:[{time_seconds:0,value:0},{time_seconds:2,value:8}]}];const normalized=normalizeVisualDslV3(source).scenes[0],evaluated=evaluateVisualDslV3Scene(normalized,2),target=canvas(),created=[];
  renderVisualDslV3Scene(target.canvas,evaluated,{resources:new Map([[ASSET,bitmap]]),createCanvas:(w,h)=>{const layer=canvas(w,h);created.push(layer);return layer.canvas;}});assert.equal(evaluated.root.children[0].children[0].transform.x,8);assert(created.length>0,'group opacity uses the existing offscreen compositor');assert(created[0].log.some(item=>item[0]==='clip'));assert(created[0].log.some(item=>item[0]==='drawImage'));assert(target.log.some(item=>item[0]==='drawImage'&&item[1]===.6),'group opacity is applied once at composite');
});

test('existing timeline deterministically animates image position, rotation, scale, opacity and visibility across seeks',()=>{
  const source=doc();source.scenes[0].timeline.tracks=[['x',0,40],['rotation_degrees',0,90],['scale_x',1,1.5],['scale_y',1,1.5],['opacity',1,.4]].map(([property,from,to])=>({target_id:'subject',property,keyframes:[{time_seconds:0,value:from},{time_seconds:2,value:to}]}));source.scenes[0].timeline.tracks.push({target_id:'subject',property:'visible',keyframes:[{time_seconds:0,value:true},{time_seconds:2,value:false}]});const scene=normalizeVisualDslV3(source).scenes[0],a=evaluateVisualDslV3Scene(scene,1),b=evaluateVisualDslV3Scene(scene,1);assert.deepEqual(a,b);assert.equal(a.root.children[0].transform.x,20);assert.equal(a.root.children[0].transform.rotation_degrees,45);assert.equal(a.root.children[0].transform.scale_x,1.25);assert.equal(a.root.children[0].opacity,.7);assert.equal(a.root.children[0].visible,true);assert.equal(evaluateVisualDslV3Scene(scene,2).root.children[0].visible,false);assert.equal(evaluateVisualDslV3Scene(scene,.5).root.children[0].transform.x,10);
});

test('shared render-at-time accepts a preflight resource map and keeps camera/image state deterministic',()=>{
  const source=doc();source.scenes[0].timeline.tracks=[{target_id:'subject',property:'y',keyframes:[{time_seconds:0,value:0},{time_seconds:2,value:30}]}];const normalized=normalizeVisualDslV3(source),target=canvas(),result=renderVisualDslV3Frame(target.canvas,normalized,'root','scene',1,{resources:new Map([[ASSET,bitmap]])});assert.equal(result.evaluated.root.children[0].transform.y,15);assert(target.log.some(item=>item[0]==='drawImage'));assert.deepEqual(renderVisualDslV3Frame(canvas().canvas,normalized,'root','scene',1,{resources:new Map([[ASSET,bitmap]])}).evaluated.root,result.evaluated.root);
});
