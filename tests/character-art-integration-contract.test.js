import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('./fixtures/character-art-integration.manifest.json', import.meta.url), 'utf8'));
const required = ['head','torso','pelvis','left_upper_arm','left_lower_arm','left_hand','right_upper_arm','right_lower_arm','right_hand','left_upper_leg','left_lower_leg','left_foot','right_upper_leg','right_lower_leg','right_foot'];
const semanticJoint = {
  head:'head', torso:'torso', pelvis:'pelvis', upper_arm:'{side}_upper_arm', lower_arm:'{side}_forearm', hand:'{side}_hand',
  upper_leg:'{side}_thigh', lower_leg:'{side}_shin', foot:'{side}_foot'
};

assert.equal(manifest.schema_version, 'character-art-manifest/0.1');
assert.equal(manifest.fixture_only, true);
assert.match(manifest.quality_status, /not_production_art/);
assert.equal(manifest.compatibility.rig_semantics, 'm1-human-rig');
assert.equal(manifest.source.import_mode, 'normalized_native_vector_primitives');
assert.equal(manifest.source.renderer_status, 'supported_subset_only');
assert.equal(manifest.alternative_sources.find(item => item.format === 'layered_png')?.renderer_status, 'deferred_no_character_image_part_renderer');

const ids = new Set();
const roles = new Set();
for (const asset of manifest.assets) {
  assert(!ids.has(asset.id), `duplicate asset id ${asset.id}`); ids.add(asset.id);
  assert(Number.isInteger(asset.z_index), `${asset.id} needs integer z_index`);
  assert(asset.source_dimensions_px.width > 0 && asset.source_dimensions_px.height > 0, `${asset.id} source dimensions`);
  assert(asset.pivot_px.x >= 0 && asset.pivot_px.x <= manifest.source.canvas_dimensions_px.width, `${asset.id} pivot x`);
  assert(asset.pivot_px.y >= 0 && asset.pivot_px.y <= manifest.source.canvas_dimensions_px.height, `${asset.id} pivot y`);
  assert(manifest.compatibility.required_joints.includes(asset.joint_id), `${asset.id} joint semantic`);
  for (const value of Object.values(asset.runtime_binding.offset)) assert(Number.isFinite(value), `${asset.id} normalized offset`);
  for (const key of ['width','height','rotation']) assert(Number.isFinite(asset.runtime_binding[key]), `${asset.id} runtime ${key}`);
  assert(!('pivot_px' in asset.runtime_binding), `${asset.id} must not leak source pixels into runtime binding`);
  const side = asset.side;
  const expected = semanticJoint[asset.role];
  if (expected) assert.equal(asset.joint_id, expected.replace('{side}', side || ''), `${asset.id} semantic binding`);
  if (!asset.optional) roles.add(asset.id);
}
for (const id of required) assert(roles.has(id), `missing required asset slot ${id}`);
for (const feature of manifest.assets.filter(asset => asset.features?.includes('facial'))) assert.equal(feature.joint_id, 'head');

console.log('Character art integration manifest contract passed.');
