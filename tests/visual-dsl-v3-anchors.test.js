import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveVisualDslV3Anchor, resolveVisualDslV3Anchors, visualAnchorMetadataFingerprint } from '../src/render/visual-dsl-v3-anchors.js';
import { evaluateVisualDslV3Scene, normalizeVisualDslV3, validateVisualDslV3 } from '../src/visual-dsl-v3.js';
import { prepareVisualDslV3ExportAssets } from '../src/render/visual-dsl-v3-export-assets.js';
import { buildVisualAssetPromptCatalog } from '../src/render/visual-asset-catalog.js';
import { buildVisualDslV3SinglePromptWithAssets, buildVisualDslV3SeriesPromptWithAssets } from '../src/render/visual-dsl-v3-prompt.js';
import { renderVisualDslV3Scene } from '../src/render/visual-dsl-v3-renderer.js';

const asset='visual_'+'c'.repeat(64),spatial={schema_version:1,coordinate_system:'normalized_source_image',anchors:[{id:'face',label:'Sensing face',x:.25,y:.5,review_status:'human_edited'}]};
const image=(id,x,fit='contain')=>({id,type:'image',transform:{x},geometry:{asset_id:asset,x:0,y:0,width:100,height:100,fit}});
const annotation=(id,target)=>({id,type:'anchor_annotation',geometry:{target,kind:'callout',label:'Sensing face',placement:'right',offset:10,leader_length:20,arrowhead:true},style:{stroke:'#123456',fill:'#FFFFFF',stroke_width:2}});
function doc(children,tracks=[]){return{visual_dsl_version:3,title:'Anchor composition',language:'vi-VN',aspect_ratio:'16:9',symbols:{},scenes:[{id:'scene',title:'Anchor scene',duration_seconds:4,narration:'The sensor detects an object.',stage:{width:1600,height:900,background:'#FFFFFF'},timeline:{tracks},root:{id:'root',type:'group',children}}]};}
function canvas(){const calls=[],stack=[];const ctx={canvas:null,globalAlpha:1,matrix:{a:1,b:0,c:0,d:1,e:0,f:0},save(){stack.push({a:this.globalAlpha,m:{...this.matrix}});},restore(){const s=stack.pop();this.globalAlpha=s.a;this.matrix=s.m;},setTransform(a,b,c,d,e,f){this.matrix={a,b,c,d,e,f};calls.push(['matrix',a,b,c,d,e,f]);},getTransform(){return this.matrix;},translate(){},rotate(){},scale(){},clearRect(){},beginPath(){},rect(){},clip(){},fillRect(){},moveTo(...p){calls.push(['moveTo',...p]);},lineTo(...p){calls.push(['lineTo',...p]);},ellipse(...p){calls.push(['ellipse',...p]);},stroke(){calls.push(['stroke']);},fill(){calls.push(['fill']);},fillText(...p){calls.push(['fillText',...p]);},drawImage(){},set lineWidth(value){},set strokeStyle(value){},set fillStyle(value){},set lineCap(value){},set lineJoin(value){},set font(value){},set textAlign(value){},set textBaseline(value){}};const value={width:1600,height:900,getContext:()=>ctx};ctx.canvas=value;return{value,calls};}

test('instance-aware resolver applies contain fit and nested translation; duplicate asset nodes stay distinct',()=>{
 const scene={stage:{width:1600,height:900},root:{id:'root',type:'group',transform:{x:5},children:[image('left',10),image('right',80,'fill')]}};
 const result=resolveVisualDslV3Anchors(scene,{spatialMetadata:new Map([[asset,spatial]]),resources:new Map([[asset,{width:200,height:100}]])});
 assert.deepEqual(result.map(item=>item.world),[{x:40,y:50},{x:110,y:50}]);
 assert.equal(resolveVisualDslV3Anchor(scene,{image_node_id:'right'},'face',{spatialMetadata:new Map([[asset,spatial]]),resources:new Map([[asset,{width:200,height:100}]])}).ok,true);
});

test('resolver reports points hidden by cover crop and supports repeated symbol instances by path',()=>{
 const cropScene={stage:{width:1,height:1},root:{id:'r',type:'group',children:[image('cover',0,'cover')]}},leftEdge={...spatial,anchors:[{...spatial.anchors[0],x:.1}]};
 const cropped=resolveVisualDslV3Anchor(cropScene,{image_node_id:'cover'},'face',{spatialMetadata:new Map([[asset,leftEdge]]),resources:new Map([[asset,{width:200,height:100}]])});assert.equal(cropped.code,'anchor_cropped');
 const symbols={sensor:{view_box:{width:100,height:100},root:{id:'sr',type:'group',children:[image('inside',0)]}}};
 const repeated={stage:{width:1,height:1},root:{id:'r',type:'group',children:[{id:'one',type:'symbol_instance',geometry:{symbol:'sensor',width:100,height:100},transform:{x:0}},{id:'two',type:'symbol_instance',geometry:{symbol:'sensor',width:100,height:100},transform:{x:200}}]}};
 const resolved=resolveVisualDslV3Anchors(repeated,{symbols,spatialMetadata:new Map([[asset,spatial]]),resources:new Map([[asset,{width:100,height:100}]])});assert.deepEqual(resolved.map(item=>item.ref.instance_path),[['one'],['two']]);assert.deepEqual(resolved.map(item=>item.world.x),[25,225]);
 const hidden={stage:{width:1600,height:900},camera:{pan_x:5000,pan_y:0,zoom:1},root:{id:'r',type:'group',children:[{...image('hidden',0),visible:false}]}};const hiddenAnchor=resolveVisualDslV3Anchors(hidden,{spatialMetadata:new Map([[asset,spatial]]),resources:new Map([[asset,{width:100,height:100}]])})[0];assert.equal(hiddenAnchor.reason,'anchor_hidden');const visibleOffscreen=resolveVisualDslV3Anchors({...hidden,root:{id:'r',type:'group',children:[image('offscreen',0)]}},{spatialMetadata:new Map([[asset,spatial]]),resources:new Map([[asset,{width:100,height:100}]])})[0];assert.equal(visibleOffscreen.reason,'anchor_offscreen');
});

test('shared renderer paints callout and highlight at timeline-evaluated anchor coordinates through camera transform',()=>{
 const children=[image('subject',100),annotation('callout',{image_node_id:'subject',anchor_id:'face'}),{id:'glow',type:'anchor_annotation',geometry:{target:{image_node_id:'subject',anchor_id:'face'},kind:'highlight',radius:20},style:{stroke:'#F4B860',fill:'#F4B860',fill_opacity:.2,stroke_width:3}}],source=doc(children,[{target_id:'subject',property:'x',keyframes:[{time_seconds:0,value:0},{time_seconds:2,value:40}]},{target_id:'camera',property:'camera.zoom',keyframes:[{time_seconds:0,value:1},{time_seconds:2,value:2}]},{target_id:'camera',property:'camera.pan_x',keyframes:[{time_seconds:0,value:-400},{time_seconds:2,value:-400}]},{target_id:'camera',property:'camera.pan_y',keyframes:[{time_seconds:0,value:-200},{time_seconds:2,value:-200}]}]),scene=normalizeVisualDslV3(source).scenes[0],evaluated=evaluateVisualDslV3Scene(scene,2),target=canvas();
 renderVisualDslV3Scene(target.value,evaluated,{resources:new Map([[asset,{width:200,height:100}]]),spatialMetadata:new Map([[asset,spatial]])});assert(target.calls.some(call=>call[0]==='fillText'&&call[1]==='Sensing face'));assert(target.calls.some(call=>call[0]==='ellipse'));assert(target.calls.some(call=>call[0]==='moveTo'&&call[1]===65));assert.equal(evaluated.root.children[0].transform.x,40);
});

test('V3 annotation schema validates target, and export preflight checks metadata identity and blocks missing anchors',async()=>{
 const target={image_node_id:'subject',anchor_id:'face',metadata_fingerprint:visualAnchorMetadataFingerprint(spatial)};
 const source=doc([image('subject',0),annotation('label',target)]);assert.equal(validateVisualDslV3(source),true);normalizeVisualDslV3(source);
 const resources=new Map([[asset,{width:200,height:100,close(){}}]]),registry={async prepareAssetResources(){return{resources,dispose(){}};},async getAssetMetadata(){return{semantic_metadata:{spatial_metadata:spatial}};}};
 const prepared=await prepareVisualDslV3ExportAssets(source,registry);assert.equal(prepared.spatialMetadata.get(asset).anchors[0].id,'face');prepared.dispose();
 const missing=doc([image('subject',0),annotation('label',{image_node_id:'subject',anchor_id:'missing'})]);await assert.rejects(prepareVisualDslV3ExportAssets(missing,registry),/unknown image instance or anchor/);
 const wrongRevision=doc([image('subject',0),annotation('label',{...target,metadata_fingerprint:'fnv1a32-00000000'})]);await assert.rejects(prepareVisualDslV3ExportAssets(wrongRevision,registry),/spatial metadata fingerprint mismatch/);
 const reordered={anchors:[{review_status:'human_edited',y:.5,x:.25,label:'Sensing face',id:'face'}],coordinate_system:'normalized_source_image',schema_version:1};assert.equal(visualAnchorMetadataFingerprint(reordered),visualAnchorMetadataFingerprint(spatial));
});

test('single and series prompt builders expose only approved exact anchor IDs with the pinned schema',()=>{
 const candidate={asset_id:asset,title:'Sensor',primary_subject:'Proximity sensor',description:'Sensor',educational_usage:'Explain sensing',review_status:'reviewed',anchors:[{id:'face',label:'Sensing face',description:'Front sensing surface',review_status:'human_edited'}],spatial_fingerprint:visualAnchorMetadataFingerprint(spatial)};
 const catalog=JSON.parse(buildVisualAssetPromptCatalog([candidate]));assert.equal(catalog.assets[0].anchors[0].id,'face');
 for(const prompt of [buildVisualDslV3SinglePromptWithAssets({topic:'Sensor',audience:'students',includeAssetCatalog:true,assetCandidates:[candidate]}),buildVisualDslV3SeriesPromptWithAssets({topic:'Sensor',audience:'students',includeAssetCatalog:true,assetCandidates:[candidate]})]){assert(prompt.includes('Sensing face'));assert(prompt.includes('anchor_annotation'));assert(prompt.includes(candidate.spatial_fingerprint));assert(prompt.includes('Do not invent anchor IDs'));}
 const suggested={...candidate,anchors:[{...candidate.anchors[0],review_status:'ai_suggested'}]};assert.equal(JSON.parse(buildVisualAssetPromptCatalog([suggested])).assets[0].anchors,undefined);
});
