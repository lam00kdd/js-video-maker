import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto,randomUUID} from 'node:crypto';
import {VisualAssetError,VisualAssetRegistry,validateVisualImage,validateManifest,VISUAL_ASSET_LIMITS} from '../src/render/visual-asset-registry.js';
import {VisualAssetIndexedDbStore} from '../src/render/visual-asset-registry.js';
import {FakeIndexedDB} from './support/fake-indexed-db.js';

class MemoryStore{constructor(backing=new Map()){this.items=backing;}async get(id){return this.items.has(id)?structuredClone(this.items.get(id)):null;}async list(){return [...this.items.values()].map(({blob,...item})=>structuredClone(item));}async putMany(items){for(const item of items){const prior=this.items.get(item.asset_id);if(prior&&prior.sha256!==item.sha256)throw new VisualAssetError('id_conflict','conflict');}for(const item of items)if(!this.items.has(item.asset_id))this.items.set(item.asset_id,structuredClone(item));}async updateSemanticMetadata(id,semantic){const current=this.items.get(id);if(!current)throw new VisualAssetError('asset_missing','missing');this.items.set(id,{...current,semantic_metadata:structuredClone(semantic)});}async remove(id){this.items.delete(id);}}
const fixture=name=>readFile(new URL(`./fixtures/visual-assets/${name}`,import.meta.url));
const png=async()=>new Blob([await fixture('opaque-food-test.png')],{type:'image/png'});
const webp=async()=>new Blob([await fixture('webp-sensor-test.webp')],{type:'image/webp'});
const decode=async blob=>{if(blob.size<40)throw new Error('truncated');return blob.type==='image/webp'?{width:48,height:32}:{width:48,height:32};};
const file=(blob,name,type)=>new File([blob],name,{type});
const registry=store=>new VisualAssetRegistry({store,decodeImage:decode,cryptoImpl:webcrypto,now:()=> '2026-11-12T00:00:00.000Z'});

test('valid PNG and WebP signatures are decoded and hashed; malformed/signature and MIME errors fail',async()=>{
  const p=await validateVisualImage(await png(),{declaredMime:'image/png',decodeImage:decode}),w=await validateVisualImage(await webp(),{declaredMime:'image/webp',decodeImage:decode});assert.equal(p.width,48);assert.equal(p.height,32);assert.match(p.sha256,/^[a-f0-9]{64}$/);assert.equal(w.mime,'image/webp');
  await assert.rejects(()=>validateVisualImage(new Blob(['hello'],{type:'image/png'}),{declaredMime:'image/png',decodeImage:decode}),{code:'unsupported_format'});
  const pBlob=await png(),corrupt=await fixture('corrupted-image.png');await assert.rejects(()=>validateVisualImage(pBlob,{declaredMime:'image/webp',decodeImage:decode}),{code:'mime_mismatch'});
  await assert.rejects(()=>validateVisualImage(corrupt,{declaredMime:'image/png',decodeImage:decode}),{code:'decode_failed'});
  await assert.rejects(()=>validateVisualImage(pBlob,{declaredMime:'image/png',decodeImage:async()=>{throw Error('bad decode');}}),{code:'decode_failed'});
});

test('registry assigns content-stable IDs, persists metadata and bytes, deduplicates exact content and verifies stored assets',async()=>{
  const backing=new Map(),store=new MemoryStore(backing),assets=registry(store),created=await assets.registerAsset(file(await png(),'food.png','image/png'));
  assert.equal(created.asset_id,`visual_${created.sha256}`);assert.equal(created.duplicate,false);assert.equal((await assets.registerAsset(file(await png(),'copy.png','image/png'))).duplicate,true);
  const reopened=registry(new MemoryStore(backing));assert.equal((await reopened.getAssetMetadata(created.asset_id)).display_name,'food.png');assert.equal((await reopened.getAssetBytes(created.asset_id)).size,(await png()).size);assert.deepEqual(await reopened.verifyAsset(created.asset_id),{asset_id:created.asset_id,ok:true});
  assert.equal((await reopened.getAssetMetadata(created.asset_id)).semantic_metadata.title,'food');assert.equal((await reopened.getAssetMetadata(created.asset_id)).semantic_metadata.review_status,'needs_review');
});

test('decoded render resources have explicit disposal; deletion requires a reference check',async()=>{
  const store=new MemoryStore(),closed={value:0},assets=new VisualAssetRegistry({store,decodeImage:decode,decodeResource:async()=>({width:48,height:32,close(){closed.value++;}}),cryptoImpl:webcrypto});const entry=await assets.registerAsset(file(await png(),'resource.png','image/png'));
  const prepared=await assets.prepareAssetResources([entry.asset_id,entry.asset_id]);assert.equal(prepared.resources.size,1);prepared.dispose();prepared.dispose();assert.equal(closed.value,1);
  await assert.rejects(()=>assets.removeAsset(entry.asset_id),{code:'reference_check_required'});await assert.rejects(()=>assets.removeAsset(entry.asset_id,{isReferenced:async()=>true}),{code:'asset_in_use'});assert.equal(await assets.removeAsset(entry.asset_id,{isReferenced:async()=>false}),true);
});

test('dedicated IndexedDB registry reopens with the same metadata and Blob bytes',async()=>{
  const indexedDB=new FakeIndexedDB(),dbName='visual-assets-test-'+randomUUID(),firstStore=new VisualAssetIndexedDbStore({indexedDB,dbName}),first=registry(firstStore);
  const created=await first.registerAsset(file(await png(),'persistent.png','image/png'));await first.updateAssetSemanticMetadata(created.asset_id,{title:'Persisted semantic title',primary_subject:'persisted subject',review_status:'verified'});await firstStore.close();const secondStore=new VisualAssetIndexedDbStore({indexedDB,dbName}),second=registry(secondStore);
  assert.equal((await second.getAssetMetadata(created.asset_id)).sha256,created.sha256);assert.equal((await second.getAssetBytes(created.asset_id)).size,(await png()).size);assert.equal((await second.getAssetMetadata(created.asset_id)).semantic_metadata.primary_subject,'persisted subject');await secondStore.close();
});

test('semantic metadata edits persist without changing immutable asset identity or image bytes',async()=>{
  const backing=new Map(),store=new MemoryStore(backing),assets=registry(store),created=await assets.registerAsset(file(await png(),'inductive_sensor_cutout.png','image/png')),bytesBefore=new Uint8Array(await assets.getAssetBytes(created.asset_id).then(blob=>blob.arrayBuffer()));
  const saved=await assets.updateAssetSemanticMetadata(created.asset_id,{title:'Cảm biến tiệm cận điện cảm',primary_subject:'inductive proximity sensor',category:'Thiết bị tự động hóa công nghiệp',description:'Cảm biến hình trụ nhìn ở góc ba phần tư.',keywords_vi:['cảm biến tiệm cận','cảm biến điện cảm'],aliases_en:['inductive sensor','proximity sensor'],visual_type:'photo',viewpoint:'ba phần tư',educational_usage:'Nhận diện hình dạng cảm biến.',scientific_domain:'Tự động hóa công nghiệp',visible_components:['thân trụ','đầu cảm biến'],review_status:'verified'});
  const reopened=registry(new MemoryStore(backing)),roundTrip=await reopened.getAssetMetadata(created.asset_id),bytesAfter=new Uint8Array(await reopened.getAssetBytes(created.asset_id).then(blob=>blob.arrayBuffer()));
  assert.equal(saved.asset_id,created.asset_id);assert.equal(roundTrip.asset_id,created.asset_id);assert.equal(roundTrip.sha256,created.sha256);assert.deepEqual(bytesAfter,bytesBefore);assert.equal(roundTrip.semantic_metadata.primary_subject,'inductive proximity sensor');assert.equal(roundTrip.semantic_metadata.review_status,'verified');
  await assert.rejects(()=>assets.updateAssetSemanticMetadata(created.asset_id,{title:'x'.repeat(161)}),{code:'metadata_invalid'});
});

test('portable package export/import works in an isolated registry and rejects tampering and unsafe paths atomically',async()=>{
  const source=registry(new MemoryStore());const first=await source.registerAsset(file(await png(),'subject.png','image/png'));const pack=await source.exportAssetPackage();
  assert.equal(validateManifest(pack.manifest),true);assert.equal(pack.manifest.assets[0].path,`assets/${first.sha256}.png`);
  const targetStore=new MemoryStore(),target=registry(targetStore),result=await target.importAssetPackage(pack.manifest,path=>pack.assets.get(path));assert.equal(result.imported,1);assert.equal((await target.getAssetMetadata(first.asset_id)).sha256,first.sha256);
  const tampered=new Map(pack.assets),tamperedBytes=new Uint8Array(await tampered.get(pack.manifest.assets[0].path).arrayBuffer());tamperedBytes[tamperedBytes.length-1]^=1;tampered.set(pack.manifest.assets[0].path,new Blob([tamperedBytes],{type:'image/png'}));await assert.rejects(()=>registry(new MemoryStore()).importAssetPackage(pack.manifest,path=>tampered.get(path)),{code:'package_hash_mismatch'});
  const unsafe={...pack.manifest,assets:pack.manifest.assets.map(item=>({...item,path:'../outside.png'}))};assert.throws(()=>validateManifest(unsafe),{code:'manifest_path_invalid'});
  const missingStore=new MemoryStore();await assert.rejects(()=>registry(missingStore).importAssetPackage(pack.manifest,async()=>null),{code:'package_missing_file'});assert.equal(missingStore.items.size,0);
});

test('portable semantic metadata round trips and package conflicts keep the receiving user record unchanged',async()=>{
  const source=registry(new MemoryStore()),created=await source.registerAsset(file(await png(),'sensor.png','image/png'));await source.updateAssetSemanticMetadata(created.asset_id,{title:'Cảm biến tiệm cận điện cảm',primary_subject:'inductive proximity sensor',category:'industrial automation',keywords_vi:['cảm biến tiệm cận'],aliases_en:['inductive sensor'],review_status:'verified'});const pack=await source.exportAssetPackage();assert.equal(validateManifest(pack.manifest),true);assert.equal(pack.manifest.assets[0].semantic_metadata.primary_subject,'inductive proximity sensor');
  const target=registry(new MemoryStore()),result=await target.importAssetPackage(pack.manifest,path=>pack.assets.get(path));assert.equal(result.imported,1);assert.equal((await target.getAssetMetadata(created.asset_id)).semantic_metadata.review_status,'verified');
  const local=await target.updateAssetSemanticMetadata(created.asset_id,{title:'Người dùng đã sửa',primary_subject:'local reviewed subject',review_status:'reviewed'}),retry=await target.importAssetPackage(pack.manifest,path=>pack.assets.get(path));assert.equal(retry.skipped_existing,1);assert.equal((await target.getAssetMetadata(created.asset_id)).semantic_metadata.primary_subject,'local reviewed subject');assert.equal((await target.getAssetMetadata(created.asset_id)).sha256,created.sha256);assert.equal(local.asset_id,created.asset_id);
  const legacy=structuredClone(pack.manifest);delete legacy.assets[0].semantic_metadata;assert.equal(validateManifest(legacy),true);
});

test('a later bad entry in a multi-asset package leaves the registry unchanged',async()=>{
  const source=registry(new MemoryStore());await source.registerAsset(file(await png(),'food.png','image/png'));await source.registerAsset(file(new Blob([await fixture('transparent-subject-test.png')],{type:'image/png'}),'transparent.png','image/png'));const pack=await source.exportAssetPackage(),broken=new Map(pack.assets),last=pack.manifest.assets.at(-1);broken.set(last.path,new Blob(['wrong bytes'],{type:last.mime_type}));const target=new MemoryStore();
  await assert.rejects(()=>registry(target).importAssetPackage(pack.manifest,path=>broken.get(path)),{code:'unsupported_format'});assert.equal(target.items.size,0);
});

test('byte and decoded-pixel budgets are enforced before registration',async()=>{
  const tiny=await png(),oversized=new Blob([new Uint8Array(VISUAL_ASSET_LIMITS.file_bytes+1)]);await assert.rejects(()=>validateVisualImage(oversized,{decodeImage:decode}),{code:'file_too_large'});
  await assert.rejects(()=>validateVisualImage(tiny,{declaredMime:'image/png',decodeImage:async()=>({width:8192,height:8192})}),{code:'dimensions_exceeded'});
  const headerBytes=new Uint8Array(await tiny.arrayBuffer());headerBytes.set([0,0,0x23,0x28],16);let decoded=false;await assert.rejects(()=>validateVisualImage(new Blob([headerBytes],{type:'image/png'}),{declaredMime:'image/png',decodeImage:async()=>{decoded=true;return{width:9000,height:32};}}),{code:'dimensions_exceeded'});assert.equal(decoded,false,'header budget must reject before image decoding');
});
