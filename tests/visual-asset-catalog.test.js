import test from 'node:test';
import assert from 'node:assert/strict';
import {createVisualAssetSemanticMetadata,searchVisualAssets,selectVisualAssetPromptCandidates,buildVisualAssetPromptCatalog,validateVisualAssetPromptCatalog,validateVisualAssetSemanticMetadata,suggestVisualAssetTitle} from '../src/render/visual-asset-catalog.js';
import {buildVisualDslV3SinglePromptWithAssets,buildVisualDslV3SeriesPromptWithAssets} from '../src/render/visual-dsl-v3-prompt.js';
import {loadPreferences} from '../src/preferences.js';

const sensorId='visual_'+'a'.repeat(64),cooktopId='visual_'+'b'.repeat(64),fishId='visual_'+'c'.repeat(64);
const asset=(asset_id,fields)=>({asset_id,display_name:`${fields.title}.png`,semantic_metadata:createVisualAssetSemanticMetadata(fields)});
const catalog=[
  asset(sensorId,{title:'Cảm biến tiệm cận điện cảm',primary_subject:'inductive proximity sensor',category:'thiết bị tự động hóa công nghiệp',description:'Cảm biến hình trụ có đầu cảm biến phía trước.',keywords_vi:['cảm biến tiệm cận','cảm biến điện cảm'],aliases_en:['inductive sensor','proximity sensor'],visual_type:'photo',viewpoint:'ba phần tư',educational_usage:'nhận diện hình dạng cảm biến',scientific_domain:'tự động hóa công nghiệp',review_status:'verified'}),
  asset(cooktopId,{title:'Cấu tạo bếp từ',primary_subject:'induction cooktop',category:'đồ gia dụng',description:'Sơ đồ mặt cắt bếp từ và cuộn dây.',keywords_vi:['bếp từ','cuộn dây cảm ứng'],aliases_en:['induction hob','induction cooktop'],visual_type:'technical_diagram',educational_usage:'giải thích cấu tạo bếp từ',scientific_domain:'điện từ học',review_status:'reviewed'}),
  asset(fishId,{title:'Cá minh họa',primary_subject:'fish',category:'động vật',description:'Minh họa một con cá.',keywords_vi:['cá'],aliases_en:['fish illustration'],review_status:'needs_review'})
];

test('semantic metadata is bounded, normalized, keeps candidate state and rejects invalid explicit review values',()=>{
  const suggestion=suggestVisualAssetTitle('industrial_sensor-cutout.final.png');assert.equal(suggestion,'industrial sensor cutout final');
  const m=createVisualAssetSemanticMetadata({title:'Cảm biến',keywords_vi:[' cảm biến ','cảm biến'],review_status:'needs_review'});assert.deepEqual(m.keywords_vi,['cảm biến']);assert.equal(m.review_status,'needs_review');
  assert.throws(()=>validateVisualAssetSemanticMetadata({review_status:'auto_verified'}),/review_status/);
  assert.throws(()=>validateVisualAssetSemanticMetadata({schema_version:9}),/schema_version/);
  assert.throws(()=>validateVisualAssetSemanticMetadata({title:'x'.repeat(161)}),/vượt giới hạn/);
});

test('local search ranks specific Vietnamese and English subjects above nearby unrelated categories',()=>{
  for(const query of ['cảm biến tiệm cận','cam bien tiem can','inductive sensor','CẢM BIẾN TIỆM CẬN ĐIỆN CẢM']){
    const result=searchVisualAssets(catalog,query,{limit:8,minScore:1});assert.equal(result.results[0]?.asset.asset_id,sensorId,query);assert(!result.results.some(item=>item.asset.asset_id===fishId),query);
  }
  assert.equal(searchVisualAssets(catalog,'bếp từ',{minScore:1}).results[0]?.asset.asset_id,cooktopId);
  assert.equal(searchVisualAssets(catalog,'thiết bị tự động hóa công nghiệp',{minScore:1}).results[0]?.asset.asset_id,sensorId);
  assert.deepEqual(searchVisualAssets(catalog,'không có chủ thể phù hợp').results,[]);
});

test('ambiguous technical matches are surfaced but withheld from automatic prompt selection; order and result count are stable',()=>{
  const variants=[asset(sensorId,{title:'Cảm biến tiệm cận điện cảm',primary_subject:'sensor',keywords_vi:['cảm biến'],aliases_en:['sensor'],review_status:'reviewed'}),asset(cooktopId,{title:'Cảm biến tiệm cận điện dung',primary_subject:'sensor',keywords_vi:['cảm biến'],aliases_en:['sensor'],review_status:'reviewed'})];
  const result=searchVisualAssets(variants,'cảm biến tiệm cận',{minScore:1});assert.equal(result.ambiguous,true);assert.deepEqual(selectVisualAssetPromptCandidates(result),[]);
  const broad=Array.from({length:1000},(_,index)=>asset(`visual_${index.toString(16).padStart(64,'0')}`,{title:`Motor ${index}`,primary_subject:`electric motor ${index}`,keywords_vi:['động cơ'],aliases_en:['motor'],category:'điện'}));const first=searchVisualAssets(broad,'electric motor',{limit:8,minScore:1}),second=searchVisualAssets(broad,'electric motor',{limit:8,minScore:1});assert.equal(first.results.length,8);assert.deepEqual(first.results.map(item=>item.asset.asset_id),second.results.map(item=>item.asset.asset_id));
});

test('prompt catalog exposes only exact registered IDs, omits storage and is bounded',()=>{
  const results=searchVisualAssets(catalog,{topic:'Nguyên lý cảm biến tiệm cận điện cảm',scientific_domain:'tự động hóa công nghiệp'},{minScore:1});const selected=selectVisualAssetPromptCandidates(results);assert.equal(selected[0].asset_id,sensorId);
  const serialized=buildVisualAssetPromptCatalog(selected);const parsed=JSON.parse(serialized);assert.equal(parsed.schema,'lam-visual-asset-prompt-catalog/v1');assert.deepEqual(parsed.assets.map(item=>item.asset_id),[sensorId]);assert(!serialized.includes('blob'));assert(!serialized.includes('C:\\'));assert(!serialized.includes('storage'));
  assert.equal(validateVisualAssetPromptCatalog(serialized),true);assert.throws(()=>validateVisualAssetPromptCatalog({schema:'lam-visual-asset-prompt-catalog/v1',assets:[{asset_id:'visual_'+'f'.repeat(64),title:'x',primary_subject:'x',description:'',aliases:[],review_status:'verified',local_path:'D:/private'}]}),/schema/);
  assert(JSON.parse(buildVisualAssetPromptCatalog(selected,{maxChars:256})).assets.length===0);
});

test('Visual DSL V3 choice and visual asset preference survive reload with backward-compatible defaults',()=>{
  const original=globalThis.localStorage;globalThis.localStorage={getItem:()=>JSON.stringify({promptMotionMode:'visualdslv3',batchMotionMode:'visualdslv3',promptUseVisualAssets:false})};
  try{const values=loadPreferences('test');assert.equal(values.promptMotionMode,'visualdslv3');assert.equal(values.batchMotionMode,'visualdslv3');assert.equal(values.promptUseVisualAssets,false);assert.equal(values.batchUseVisualAssets,true);}finally{if(original===undefined)delete globalThis.localStorage;else globalThis.localStorage=original;}
});

test('single and series V3 prompts use exact catalog IDs and state missing-asset and batch portability rules',()=>{
  const sensor=selectVisualAssetPromptCandidates(searchVisualAssets(catalog,'cảm biến tiệm cận điện cảm',{minScore:1}));
  const single=buildVisualDslV3SinglePromptWithAssets({topic:'Nguyên lý cảm biến tiệm cận điện cảm',audience:'Học sinh',assetCandidates:sensor,includeAssetCatalog:true});assert(single.includes(sensorId));assert(!single.includes(cooktopId));assert(single.includes('fabricated IDs'));assert(single.includes('Do not claim portability'));
  const series=buildVisualDslV3SeriesPromptWithAssets({topic:'Tự động hóa công nghiệp',audience:'Học sinh',episodeCount:3,assetCandidates:sensor,includeAssetCatalog:true});assert(series.includes(sensorId));assert(series.includes('Reuse one exact asset_id'));
  const noMatch=buildVisualDslV3SinglePromptWithAssets({topic:'Một chủ đề lạ',audience:'Học sinh',assetCandidates:[],includeAssetCatalog:true});assert(noMatch.includes('No suitable registered asset'));assert(!/visual_[a-f0-9]{64}/.test(noMatch.slice(noMatch.indexOf('VISUAL ASSET CATALOG'))));
});
