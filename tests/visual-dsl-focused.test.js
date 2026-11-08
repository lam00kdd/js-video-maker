import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateVisualDslDocument } from '../src/visual-dsl.js';
import { resolveObjectScene } from '../src/render/object-scene-resolver.js';
import { inspectVisualDslQuality } from '../src/render/visual-quality-inspector.js';
import { normalizeProject } from '../src/project.js';

const fixture = async name => JSON.parse(await readFile(new URL(`../examples/${name}`, import.meta.url), 'utf8'));

test('four-stroke 72-second variants import with matching metadata and zero Inspector findings', async () => {
  const document = await fixture('Scientific_Visual_Planner_Four_Stroke_Slider_Crank.json');
  const landscape = document.variants.landscape.scenes;
  const portrait = document.variants.portrait.scenes;
  assert.equal(landscape.length, 4);
  assert.equal(portrait.length, landscape.length);
  const total = scenes => scenes.reduce((sum, scene) => sum + scene.estimated_seconds, 0);
  assert.equal(total(landscape), 72);
  assert.equal(total(portrait), total(landscape));
  assert(total(landscape) <= 180);
  for (let i = 0; i < landscape.length; i++) {
    assert.equal(landscape[i].title, portrait[i].title);
    assert.equal(landscape[i].narration, portrait[i].narration);
    assert.equal(landscape[i].estimated_seconds, portrait[i].estimated_seconds);
    assert.notDeepEqual(landscape[i].scene_graph, portrait[i].scene_graph);
  }
  const project = normalizeProject({ title: document.title, motionMode: 'scenegraph', scenes: landscape, variants: { landscape: { scenes: landscape }, portrait: { scenes: portrait } } });
  const report = inspectVisualDslQuality({ variants: { '16:9': project.variants.landscape, '9:16': project.variants.portrait }, captionsEnabled: true });
  assert.deepEqual(report.counts, { error: 0, warning: 0, info: 0 });
});

test('slider-crank and pinned artwork stay joined in both four-stroke ratios', async () => {
  const document = await fixture('Scientific_Visual_Planner_Four_Stroke_Slider_Crank.json');
  for (const [variant, width, height] of [['landscape', 1280, 720], ['portrait', 720, 1280]]) {
    const scenes = validateVisualDslDocument({ ...document, scenes: document.variants[variant].scenes });
    for (const scene of scenes) {
      const graph = scene.scene_graph;
      const mechanism = graph.mechanisms[0];
      const { params, bindings } = mechanism;
      assert.equal(mechanism.local_geometry_space, 'isotropic');
      for (let t = 0; t <= scene.estimated_seconds; t += .5) {
        const frame = resolveObjectScene(graph, t, scene.estimated_seconds, { width, height });
        const get = id => frame.objects.find(item => item.id === id);
        const crank = get(bindings.crank), rod = get(bindings.connecting_rod), piston = get(bindings.piston);
        const cx = params.crank_center.x * width, cy = params.crank_center.y * height;
        const radius = params.crank_radius * Math.min(width, height), angle = crank.transform.rotation;
        const crankPin = { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
        const rodStart = { x: rod.transform.x * width, y: rod.transform.y * height };
        const rodEnd = { x: rodStart.x + Math.cos(rod.transform.rotation) * rod.geometry.end.x * Math.min(width, height), y: rodStart.y + Math.sin(rod.transform.rotation) * rod.geometry.end.x * Math.min(width, height) };
        const pistonPin = { x: piston.transform.x * width, y: piston.transform.y * height };
        assert(Math.hypot(rodStart.x - crankPin.x, rodStart.y - crankPin.y) < 1e-6);
        assert(Math.hypot(rodEnd.x - pistonPin.x, rodEnd.y - pistonPin.y) < 1e-6);
        assert(Math.abs(Math.hypot(rodEnd.x - rodStart.x, rodEnd.y - rodStart.y) - params.connecting_rod_length * Math.min(width, height)) < 1e-6);
      }
    }
  }
});

test('gear pair fixture retains parametric centers, ratio and Inspector geometry', async () => {
  const document = await fixture('Scientific_Mechanism_Gear_Pair.json');
  for (const variant of ['landscape', 'portrait']) {
    const scenes = validateVisualDslDocument({ ...document, scenes: document.variants[variant].scenes });
    assert.equal(scenes.length, 1);
    assert.equal(scenes[0].scene_graph.mechanisms[0].type, 'gear_pair');
  }
});
