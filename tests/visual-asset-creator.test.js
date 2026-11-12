import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {buildVisualAssetCreationPrompt,createVisualAssetSlug} from '../src/render/visual-asset-creator-prompt.js';
import {VisualAssetError,VisualAssetRegistry,summarizeVisualAlphaPixels} from '../src/render/visual-asset-registry.js';
import {collectVisualAssetDependencies} from '../src/render/visual-asset-dependencies.js';
import {searchVisualAssets} from '../src/render/visual-asset-catalog.js';
import {FakeIndexedDB} from './support/fake-indexed-db.js';

class MemoryStore{constructor(){this.items=new Map();}async get(id){return this.items.has(id)?structuredClone(this.items.get(id)):null;}async list(){return[...this.items.values()].map(({blob,...item})=>structuredClone(item));}async putMany(records){for(const item of records){if(this.items.has(item.asset_id))continue;this.items.set(item.asset_id,structuredClone(item));}}async updateSemanticMetadata(id,semantic){const item=this.items.get(id);if(!item)throw new VisualAssetError('asset_missing','missing');this.items.set(id,{...item,semantic_metadata:structuredClone(semantic)});}async remove(id){this.items.delete(id);}}
class FailingStore extends MemoryStore{async putMany(){throw new VisualAssetError('transaction_failed','simulated transaction failure');}}
const pngBytes=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,48,0,0,0,32,8,6,0,0,0,0,0,0,0,0,0,0,0,0]);
const decoded=async()=>({width:48,height:32});
const png=(name='sensor-cutout.png',bytes=pngBytes)=>new File([bytes],name,{type:'image/png'});
const sidecar=(name='sensor-cutout.png',overrides={})=>({schema:'lam-visual-asset-semantic-sidecar/v1',image_file:name,image_requirements:{transparent_background:true},semantic_metadata:{schema_version:1,title:'Cảm biến tiệm cận điện cảm',primary_subject:'inductive proximity sensor',category:'industrial_equipment',description:'Minh họa một cảm biến tiệm cận dạng trụ.',keywords_vi:['cảm biến tiệm cận','cảm biến điện cảm'],aliases_en:['inductive proximity sensor','inductive sensor'],visual_type:'technical_diagram',viewpoint:'three_quarter',educational_usage:'Giúp nhận biết hình dáng cảm biến.',scientific_domain:'industrial automation',visible_components:['housing','sensing face','connector'],review_status:'needs_review'},...overrides});
const registry=(store=new MemoryStore(),inspectTransparency=async()=>({has_transparency:true,transparent_pixels:100,sampled_pixels:10000,transparent_ratio:.01}))=>new VisualAssetRegistry({store,decodeImage:decoded,inspectTransparency,cryptoImpl:webcrypto,now:()=> '2026-11-12T00:00:00.000Z'});

test('AI asset prompt is specific, bilingual, requests PNG and strict companion sidecar without invented technical identity',()=>{
  const prompt=buildVisualAssetCreationPrompt({subject:'Cảm biến tiệm cận điện cảm',category:'industrial_equipment',educational_usage:'Giới thiệu hình dáng cảm biến',style:'realistic_product',detail_level:'advanced',viewpoint:'ba phần tư',required_components:'thân, mặt cảm biến, đầu nối',transparent_background:true});
  assert(prompt.includes('recognizable external geometry'));assert(prompt.includes('real transparent alpha'));assert(prompt.includes('checkerboard'));assert(prompt.includes('sensor-cutout')===false);assert(prompt.includes('cam-bien-tiem-can-dien-cam.png'));assert(prompt.includes('cam-bien-tiem-can-dien-cam.asset.json'));assert(prompt.includes('aliases_en'));assert(prompt.includes('needs_review'));assert(prompt.includes('Do not add asset_id, SHA-256'));assert(prompt.includes('Do not state a manufacturer'));assert(prompt.length<10000);assert.equal(createVisualAssetSlug('Động cơ điện'), 'dong-co-dien');
});

test('asset prompt templates adapt for animals, plants, food, phenomena and optional empty details',()=>{
  assert(buildVisualAssetCreationPrompt({subject:'Cá rô phi',category:'animal'}).includes('species-appropriate anatomy'));
  assert(buildVisualAssetCreationPrompt({subject:'Cây lúa',category:'plant'}).includes('botanical structure'));
  assert(buildVisualAssetCreationPrompt({subject:'Bắp ngô',category:'food'}).includes('natural shape, texture'));
  assert(buildVisualAssetCreationPrompt({subject:'Từ trường',category:'other'}).includes('Do not expose hidden internal parts'));
  assert.throws(()=>buildVisualAssetCreationPrompt({subject:' '}),/Nhập tên chủ thể/);
  assert.throws(()=>buildVisualAssetCreationPrompt({subject:'x'.repeat(301)}),/vượt giới hạn/);
});

test('transparent sidecar import stages without writes, then atomically saves image and AI metadata with a computed immutable ID',async()=>{
  const store=new MemoryStore(),assets=registry(store),file=png(),plan=await assets.prepareAssetImport(file,sidecar(file.name),{sidecarFileName:'sensor-cutout.asset.json'});
  assert.equal(store.items.size,0);assert.equal(plan.transparency.has_transparency,true);assert.equal(plan.asset_id,`visual_${plan.sha256}`);assert.equal(plan.metadata.metadata_origin,'ai_generated');assert.equal(plan.metadata.review_status,'needs_review');
  const result=await plan.commit();assert.equal(result.duplicate,false);assert.equal(store.items.size,1);assert.equal((await assets.getAssetMetadata(result.asset_id)).sha256,plan.sha256);assert.equal((await assets.getAssetMetadata(result.asset_id)).semantic_metadata.user_edited,false);
  assert.equal(searchVisualAssets(await assets.listAssets(),'cảm biến tiệm cận',{minScore:1}).results[0].asset.asset_id,result.asset_id);
  await assert.rejects(()=>plan.commit(),{code:'import_plan_used'});
});

test('sidecar pairing, JSON schema, filename safety and invalid image fail before registry mutation',async()=>{
  const store=new MemoryStore(),assets=registry(store),file=png();
  await assert.rejects(()=>assets.prepareAssetImport(file,sidecar('other.png'),{sidecarFileName:'other.asset.json'}),{code:'sidecar_pair_mismatch'});
  await assert.rejects(()=>assets.prepareAssetImport(file,'{bad json',{sidecarFileName:'sensor-cutout.asset.json'}),{code:'sidecar_invalid'});
  await assert.rejects(()=>assets.prepareAssetImport(file,{...sidecar(file.name),local_path:'D:/private'},{sidecarFileName:'sensor-cutout.asset.json'}),{code:'sidecar_invalid'});
  await assert.rejects(()=>assets.prepareAssetImport(png('bad.png',new Uint8Array([1,2,3])),sidecar('bad.png'),{sidecarFileName:'bad.asset.json'}),{code:'unsupported_format'});
  assert.equal(store.items.size,0);
});

test('transparent assets require meaningful alpha; opaque workflows remain accepted when transparency is not requested',async()=>{
  const pixels=new Uint8Array(1000*4);for(let i=0;i<1000;i++)pixels[i*4+3]=255;assert.equal(summarizeVisualAlphaPixels(pixels).has_transparency,false);for(let i=0;i<10;i++)pixels[i*4+3]=0;assert.equal(summarizeVisualAlphaPixels(pixels).has_transparency,true);
  const opaqueRegistry=registry(new MemoryStore(),async()=>({has_transparency:false,transparent_pixels:0,sampled_pixels:10000,transparent_ratio:0})),file=png();await assert.rejects(()=>opaqueRegistry.prepareAssetImport(file,sidecar(file.name),{sidecarFileName:'sensor-cutout.asset.json'}),{code:'transparent_background_missing'});
  const opaqueSidecar=sidecar(file.name,{image_requirements:{transparent_background:false}}),plan=await opaqueRegistry.prepareAssetImport(file,opaqueSidecar,{sidecarFileName:'sensor-cutout.asset.json'});assert.equal(plan.transparency,null);assert.equal((await plan.commit()).duplicate,false);
});

test('duplicate image IDs never replace metadata silently; explicit preview confirmation changes only semantics',async()=>{
  const store=new MemoryStore(),assets=registry(store),file=png(),original=await assets.registerAsset(file);await assets.updateAssetSemanticMetadata(original.asset_id,{title:'Metadata người dùng',primary_subject:'local subject',review_status:'reviewed'});
  const bytesBefore=await assets.getAssetBytes(original.asset_id),plan=await assets.prepareAssetImport(file,sidecar(file.name),{sidecarFileName:'sensor-cutout.asset.json'});assert.equal(plan.duplicate,true);assert.equal(plan.existing_metadata.title,'Metadata người dùng');
  await assert.rejects(()=>plan.commit(),{code:'semantic_conflict'});assert.equal((await assets.getAssetMetadata(original.asset_id)).semantic_metadata.title,'Metadata người dùng');
  const result=await plan.commit({replaceExisting:true}),after=await assets.getAssetMetadata(original.asset_id);assert.equal(result.asset_id,original.asset_id);assert.equal(result.sha256,original.sha256);assert.equal(after.semantic_metadata.metadata_origin,'ai_generated');assert.equal(after.semantic_metadata.review_status,'needs_review');assert.equal((await assets.getAssetBytes(original.asset_id)).size,bytesBefore.size);
});

test('failed atomic transaction leaves no half-registered image and sidecar metadata',async()=>{
  const assets=registry(new FailingStore()),file=png(),plan=await assets.prepareAssetImport(file,sidecar(file.name),{sidecarFileName:'sensor-cutout.asset.json'});await assert.rejects(()=>plan.commit(),{code:'transaction_failed'});assert.equal((await assets.listAssets()).length,0);
});

test('known V3 and local-project references block deletion; external JSON is explicitly outside the scan',()=>{
  const id='visual_'+'f'.repeat(64),sources=[{source:'Open project',value:{visualDslV3:{scenes:[{root:{id:'root',type:'group',children:[{type:'image',geometry:{asset_id:id}}]}}]}}},{source:'Saved project',value:{manifest:{asset_id:id}}}];const scan=collectVisualAssetDependencies(id,sources);assert.equal(scan.complete,true);assert.equal(scan.references.length,2);assert(scan.references.some(item=>item.kind==='visual_dsl_v3_image'));assert(scan.references.some(item=>item.kind==='asset_reference'));
});

test('Asset Manager exposes safe delete, creator prompt, paired import and existing-sidecar actions',async()=>{
  const source=await readFile(new URL('../src/render/visual-asset-manager.js',import.meta.url),'utf8');for(const label of ['Xóa ảnh','Tạo prompt ảnh AI','Nhập ảnh + metadata','Nhập JSON metadata','Xác nhận thay metadata'])assert(source.includes(label),label);
});

test('IndexedDB removal deletes one general-asset record and leaves unrelated records intact',async()=>{
  const indexedDB=new FakeIndexedDB(),store=new (await import('../src/render/visual-asset-registry.js')).VisualAssetIndexedDbStore({indexedDB,dbName:'creator-delete-test'}),assets=registry(store),one=await assets.registerAsset(png('one.png')),two=await assets.registerAsset(png('two.png',Uint8Array.from([...pngBytes,2])));assert.equal(await assets.removeAsset(one.asset_id,{isReferenced:async()=>false}),true);assert.equal(await assets.getAssetMetadata(one.asset_id),null);assert.equal((await assets.getAssetMetadata(two.asset_id)).asset_id,two.asset_id);await store.close();
});

test('safe removal requires a dependency callback and preserves an asset when storage deletion fails',async()=>{
  const assets=registry(),item=await assets.registerAsset(png('keep.png'));
  await assert.rejects(()=>assets.removeAsset(item.asset_id),{code:'reference_check_required'});
  await assert.rejects(()=>assets.removeAsset(item.asset_id,{isReferenced:async()=>true}),{code:'asset_in_use'});
  assert(await assets.getAssetMetadata(item.asset_id));
  const brokenStore=new MemoryStore();brokenStore.remove=async()=>{throw new Error('storage unavailable');};
  const broken=registry(brokenStore),saved=await broken.registerAsset(png('storage-failure.png'));
  await assert.rejects(()=>broken.removeAsset(saved.asset_id,{isReferenced:async()=>false}),/storage unavailable/);
  assert(await broken.getAssetMetadata(saved.asset_id));
});

test('portable package v1 retains semantic metadata and imports without replacing an existing record',async()=>{
  const source=registry(),item=await source.registerAsset(png('portable.png'));
  await source.updateAssetSemanticMetadata(item.asset_id,{title:'Thiết bị minh họa',primary_subject:'thiết bị',description:'Mô tả đã rà soát',keywords_vi:['thiết bị'],category:'industrial_automation',category_id:'industrial_automation',subcategory_id:'sensors',subcategory_label:'Cảm biến',taxonomy_version:1,related_domains:['electrical_electronics'],classification_status:'classified',review_status:'reviewed'});
  const pack=await source.exportAssetPackage(),target=registry(),result=await target.importAssetPackage(pack.manifest,path=>pack.assets.get(path));
  assert.equal(result.imported,1);assert.equal((await target.getAssetMetadata(item.asset_id)).semantic_metadata.title,'Thiết bị minh họa');assert.equal((await target.getAssetMetadata(item.asset_id)).semantic_metadata.subcategory_id,'sensors');
  const before=await target.getAssetMetadata(item.asset_id),again=await target.importAssetPackage(pack.manifest,path=>pack.assets.get(path));
  assert.equal(again.skipped_existing,1);assert.equal((await target.getAssetMetadata(item.asset_id)).semantic_metadata.title,before.semantic_metadata.title);
});

test('taxonomy edits persist while immutable asset ID, SHA-256 and image bytes remain unchanged',async()=>{
  const assets=registry(),item=await assets.registerAsset(png('taxonomy.png')),bytesBefore=new Uint8Array(await(await assets.getAssetBytes(item.asset_id)).arrayBuffer());const updated=await assets.updateAssetSemanticMetadata(item.asset_id,{title:'Cảm biến tiệm cận',primary_subject:'inductive proximity sensor',category:'industrial_automation',category_id:'industrial_automation',subcategory_id:'sensors',subcategory_label:'Cảm biến',taxonomy_version:1,related_domains:['electrical_electronics','physics_phenomena'],classification_status:'classified',review_status:'reviewed'});const metadata=await assets.getAssetMetadata(item.asset_id),bytesAfter=new Uint8Array(await(await assets.getAssetBytes(item.asset_id)).arrayBuffer());assert.equal(updated.asset_id,item.asset_id);assert.equal(metadata.sha256,item.sha256);assert.deepEqual(bytesAfter,bytesBefore);assert.equal(metadata.semantic_metadata.subcategory_id,'sensors');assert.equal(metadata.semantic_metadata.metadata_origin,'user_edited');
});
