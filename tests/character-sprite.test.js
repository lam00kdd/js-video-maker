import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSampleSpriteCharacterDefinition, drawSpritePose, normalizeSpriteCharacterDefinition, resolveSpritePose } from '../src/render/character-sprite.js';

test('sample fixed poses resolve to local transparent artwork with a common registration point', async () => {
  const definition = normalizeSpriteCharacterDefinition(createSampleSpriteCharacterDefinition());
  assert.deepEqual(definition.poses.map(pose => pose.pose_id), ['idle', 'greet', 'point', 'explain']);
  assert(definition.poses.every(({ anchor_x, anchor_y, width, height }) => anchor_x === 128 && anchor_y === 360 && width === 256 && height === 384));
  assert.equal(definition.canvas.width, 256);
  assert.equal(definition.canvas.height, 384);
  assert.equal(definition.transparent_background, true);
  const source = await Promise.all(definition.poses.map(pose => readFile(new URL(`../${pose.asset_ref.slice(1)}`, import.meta.url), 'utf8')));
  assert(source.every(svg => /<svg\b[^>]*viewBox="0 0 256 384"/.test(svg)));
  assert(new Set(source).size === 4, 'each pose must resolve to its own authored local image');
  assert(source.every(svg => !/<rect\b[^>]*fill="(?:#fff(?:fff)?|white)"[^>]*width="(?:100%|256)"/.test(svg)));
});

test('pose rendering applies one uniform scale around the shared anchor', () => {
  const pose = resolveSpritePose(createSampleSpriteCharacterDefinition(), 'point');
  const draws = [];
  const result = drawSpritePose({ drawImage: (...args) => draws.push(args) }, { id: 'sprite-image' }, pose, { x: 300, y: 500, scale: 0.75 });
  assert.deepEqual(result, { left: 204, top: 230, width: 192, height: 288, anchor: { x: 300, y: 500 } });
  assert.equal(draws.length, 1);
  assert.equal(draws[0][1], 204);
  assert.equal(draws[0][2], 230);
  assert.equal(draws[0][3], 192);
  assert.equal(draws[0][4], 288);
  assert.throws(() => resolveSpritePose(createSampleSpriteCharacterDefinition(), 'walk'), /Unknown sprite pose/);
});
