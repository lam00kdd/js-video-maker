import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { normalizeHumanRig } from '../src/render/human-rig.js';
import { normalizeCharacterAppearanceManifests } from '../src/render/character-assets.js';

const root=new URL('../examples/character-image-backed-demo/',import.meta.url);
const recordPath=new URL('character-library-record.json',root);
const record=JSON.parse(await readFile(recordPath,'utf8'));
const hex=bytes=>createHash('sha256').update(bytes).digest('hex');
const stable=value=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);
const rig=normalizeHumanRig(record.rig,'cp2_fixture.rig');
const uniqueAssets=new Map();
for(const asset of record.assets){
 const bytes=await readFile(new URL(asset.filename,root)),checksum=hex(bytes);
 if(checksum!==asset.sha256||asset.id!==`libsha256_${checksum}`)throw new Error(`Asset checksum changed: ${asset.filename}`);
 uniqueAssets.set(asset.id,{...asset,bytes});
}
const manifest=normalizeCharacterAppearanceManifests([record.manifest],{assets:[...uniqueAssets.keys()].map(id=>({id}))})[0];
const manifestChecksum=hex(Buffer.from(stable(manifest)));
const contentAssets=manifest.parts.filter(part=>part.type==='image').map(part=>({asset_id:part.asset_id,sha256:uniqueAssets.get(part.asset_id).sha256})).sort((a,b)=>a.asset_id.localeCompare(b.asset_id));
const contentChecksum=hex(Buffer.from(stable({character_id:record.character_id,version:record.version,manifest,rig,assets:contentAssets})));
Object.assign(record,{rig,manifest,assets:[...uniqueAssets.values()].map(({bytes,...asset})=>asset),manifest_checksum:manifestChecksum,content_checksum:contentChecksum});
await writeFile(recordPath,JSON.stringify(record,null,2)+'\n');

const actions=[
 {id:'idle',motion:'idle',start_seconds:0,duration_seconds:12,loop_mode:'repeat',parameters:{intensity:.45,cycle_seconds:4}},
 {id:'breathe',motion:'breathe',start_seconds:0,duration_seconds:12,loop_mode:'repeat',parameters:{intensity:.32,cycle_seconds:3}},
 {id:'blink',motion:'blink',start_seconds:0,duration_seconds:12,loop_mode:'repeat',parameters:{seed:2408,interval_min_seconds:2,interval_max_seconds:3,blink_duration_seconds:.16}},
];
function graph({portrait=false}={}){
 const transform=portrait?{x:.5,y:.54,scale:1.22,rotation:0,opacity:1}:{x:.32,y:.62,scale:.9,rotation:0,opacity:1};
 return{version:2,coordinate_space:'normalized',objects:[{id:'floor',type:'line',transform:{x:0,y:0,scale:1,rotation:0,opacity:1},geometry:{start:{x:.06,y:.96},end:{x:.94,y:.96}},style:{stroke:'#607b90',fill:'none',stroke_width:.003,line_cap:'round'}}],character_instances:[{instance_id:'teacher_demo',character_id:record.character_id,character_version:record.version,character_version_checksum:contentChecksum,transform,motion_style:'natural',actions}]};
}
const narration='Giáo viên hoạt hình được ghép từ các PNG có nền trong suốt. Đầu, thân, hông, cánh tay và chân bám theo các khớp của Human Rig M1; idle, breathe và blink lấy thời gian tuyệt đối từ M2.';
const landscape={title:'Image-backed teacher · landscape',estimated_seconds:12,narration,background:'#edf3f6',scene_graph:graph()};
const portrait={title:'Image-backed teacher · portrait',estimated_seconds:12,narration,background:'#edf3f6',scene_graph:graph({portrait:true})};
const fixture={visual_dsl_version:2,motion_mode:'scenegraph',title:'Scientific Human Image-Backed Demo',aspect_ratio:'both',scenes:[landscape],variants:{landscape:{scenes:[landscape]},portrait:{scenes:[portrait]}}};
await writeFile(new URL('../Scientific_Human_Image_Backed_Demo.json',root),JSON.stringify(fixture,null,2)+'\n');
console.log(JSON.stringify({character_id:record.character_id,version:record.version,content_checksum:contentChecksum,manifest_checksum:manifestChecksum,assets:uniqueAssets.size,parts:manifest.parts.length,project:new URL('../Scientific_Human_Image_Backed_Demo.json',root).pathname},null,2));
