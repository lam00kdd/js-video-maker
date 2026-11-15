import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildAnchorQaFixtures, validateAnchorQaFixtureSet } from '../qa/anchor-fixtures/fixture-builder.js';

const id='visual_'+'a'.repeat(64),metadata={schema_version:1,coordinate_system:'normalized_source_image',anchors:[{id:'mat_cam_bien',label:'Mặt cảm biến',x:.25,y:.5,review_status:'human_edited'},{id:'anchor_1',label:'Dây cáp',x:.85,y:.4,review_status:'human_reviewed'}]};
test('QA generator creates validator-valid import fixtures, real-ID fingerprint targets and expected batch negatives',async()=>{
 const legacyFixture=JSON.parse(await readFile(new URL('../examples/Visual_DSL_v1_Cell.json',import.meta.url),'utf8'));
 const result=buildAnchorQaFixtures({assetId:id,spatialMetadata:metadata,legacyFixture});assert.equal(Object.keys(result.fixtures).length,5);assert.match(result.fingerprint,/^fnv1a32-[a-f0-9]{8}$/);
 const registry={async prepareAssetResources(){return{resources:new Map([[id,{width:400,height:200,close(){}}]]),dispose(){}};},async getAssetMetadata(){return{semantic_metadata:{spatial_metadata:metadata}};}};
 const statuses=await validateAnchorQaFixtureSet(result,registry);assert.equal(statuses.length,6);assert(statuses.some(item=>item.status==='EXPECTED_PREFLIGHT_REJECTION'));assert.deepEqual(Object.keys(result.batch).length,4);
 for(const fixture of Object.values(result.fixtures)){for(const scene of fixture.scenes)for(const node of scene.root.children){if(node.type==='image')assert.equal(node.geometry.asset_id,id);if(node.type==='anchor_annotation')assert.equal(node.geometry.target.metadata_fingerprint,result.fingerprint);}}
});
