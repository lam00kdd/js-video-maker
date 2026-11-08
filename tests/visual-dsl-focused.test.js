import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { adaptVisualDslScene, validateVisualDslDocument } from '../src/visual-dsl.js';
import { resolveObjectScene } from '../src/render/object-scene-resolver.js';
import { inspectVisualDslQuality } from '../src/render/visual-quality-inspector.js';
import { loadProject, normalizeProject, saveProject } from '../src/project.js';
import { camFollowerLiftAtAngle } from '../src/render/cam-follower-profile.js';

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

test('synchronized four-stroke fixture keeps independent cam phases on absolute crank time', async () => {
  const document = await fixture('Scientific_Mechanism_Four_Stroke_Synchronized.json');
  const variants = {};
  for (const [name, ratio] of [['landscape', '16:9'], ['portrait', '9:16']]) {
    const scenes = document.variants[name].scenes;
    assert.equal(scenes.length, 4);
    assert.equal(scenes.reduce((sum, scene) => sum + scene.estimated_seconds, 0), 72);
    variants[ratio] = scenes.map((scene, index) => ({ ...scene, scene_graph: adaptVisualDslScene(scene, index, 2) }));
    for (let index = 0; index < scenes.length; index++) {
      const graph = variants[ratio][index].scene_graph;
      assert.equal(graph.synchronizations.length, 2);
      assert(graph.synchronizations.every(link => link.ratio === .5));
      assert.notEqual(graph.synchronizations[0].phase_offset, graph.synchronizations[1].phase_offset);
      const size = ratio === '9:16' ? { width: 720, height: 1280 } : { width: 1280, height: 720 };
      for (const time of [0, 4.5, 9, 13.5, 17.999]) {
        const resolved = resolveObjectScene(graph, time, 18, size);
        const crank = resolved.objects.find(object => object.id === 'crank').transform.rotation;
        for (const link of graph.synchronizations) {
          const mechanism = graph.mechanisms.find(item => item.id === link.dependent_id);
          const cam = resolved.objects.find(object => object.id === mechanism.bindings.cam);
          const expected = crank * link.ratio + link.phase_offset;
          assert(Math.abs(cam.transform.rotation - expected) < 1e-9, 'unwrapped angles must preserve complete revolutions as well as phase');
        }
        const intake = graph.mechanisms.find(item => item.id === 'intake-cam-drive');
        const exhaust = graph.mechanisms.find(item => item.id === 'exhaust-cam-drive');
        const intakeAngle = resolved.objects.find(object => object.id === intake.bindings.cam).transform.rotation;
        const exhaustAngle = resolved.objects.find(object => object.id === exhaust.bindings.cam).transform.rotation;
        assert.equal(camFollowerLiftAtAngle(intake.params, intakeAngle).lift > .0001, index === 0 && time > 0 && time < 17.99);
        assert.equal(camFollowerLiftAtAngle(exhaust.params, exhaustAngle).lift > .0001, index === 3 && time > 0 && time < 17.99);
      }
      const at = time => resolveObjectScene(graph, time, 18, size);
      const sought = at(11);
      at(2);
      assert.deepEqual(at(11), sought, 'seeking to the same absolute time must be deterministic');
      const timelineGraph = structuredClone(graph);
      const master = timelineGraph.mechanisms.find(item => item.id === 'engine-cycle');
      master.timeline = [
        { start_seconds: 0, duration_seconds: 4, mode: 'run', easing: 'linear' },
        { start_seconds: 4, duration_seconds: 3, mode: 'hold', easing: 'linear' },
        { start_seconds: 7, duration_seconds: 11, mode: 'run', easing: 'linear' }
      ];
      const firstHold = resolveObjectScene(timelineGraph, 4, 18, size).objects.find(object => object.id === 'intake-cam').transform.rotation;
      const endHold = resolveObjectScene(timelineGraph, 7, 18, size).objects.find(object => object.id === 'intake-cam').transform.rotation;
      assert.equal(firstHold, endHold);
      const resumed = resolveObjectScene(timelineGraph, 12, 18, size).objects.find(object => object.id === 'intake-cam').transform.rotation;
      resolveObjectScene(timelineGraph, 5, 18, size);
      assert.equal(resolveObjectScene(timelineGraph, 12, 18, size).objects.find(object => object.id === 'intake-cam').transform.rotation, resumed);
      const badCycle = structuredClone(graph);
      const cycleMaster = badCycle.mechanisms.find(item => item.id === 'engine-cycle');
      cycleMaster.timeline = [];
      cycleMaster.params.rotational_speed = 0;
      badCycle.synchronizations = [
        { master_id: 'engine-cycle', dependent_id: 'intake-cam-drive', ratio: .5, phase_offset: 0 },
        { master_id: 'intake-cam-drive', dependent_id: 'exhaust-cam-drive', ratio: 1, phase_offset: 0 },
        { master_id: 'exhaust-cam-drive', dependent_id: 'engine-cycle', ratio: 1, phase_offset: 0 }
      ];
      assert.throws(() => adaptVisualDslScene({ ...scenes[index], scene_graph: badCycle }, index, 2), /Vòng phụ thuộc/);
      for (const [mutate, error] of [
        [links => { links[0].master_id = 'missing-mechanism'; }, /master_id không tồn tại/],
        [links => { links[0].ratio = 0; }, /ratio không được bằng 0/],
        [links => { links[0].dependent_id = links[0].master_id; }, /không thể tự tham chiếu/],
        [links => { links.push({ master_id: 'exhaust-cam-drive', dependent_id: 'intake-cam-drive', ratio: 1, phase_offset: 0 }); }, /nhiều master mâu thuẫn/]
      ]) {
        const invalid = structuredClone(graph);
        mutate(invalid.synchronizations);
        assert.throws(() => adaptVisualDslScene({ ...scenes[index], scene_graph: invalid }, index, 2), error);
      }
      const badTimeline = structuredClone(graph);
      badTimeline.mechanisms.find(item => item.id === 'intake-cam-drive').timeline = [{ start_seconds: 0, duration_seconds: 18, mode: 'run' }];
      assert.throws(() => adaptVisualDslScene({ ...scenes[index], scene_graph: badTimeline }, index, 2), /dependent không được có rotational_speed hoặc timeline độc lập/);
    }
    const twoToOne = structuredClone(variants[ratio][0].scene_graph);
    twoToOne.synchronizations.find(link => link.dependent_id === 'intake-cam-drive').ratio = 2;
    const twiceSpeed = resolveObjectScene(twoToOne, 5, 18, ratio === '9:16' ? { width: 720, height: 1280 } : { width: 1280, height: 720 });
    assert.equal(twiceSpeed.objects.find(object => object.id === 'intake-cam').transform.rotation,
      twiceSpeed.objects.find(object => object.id === 'crank').transform.rotation * 2 + Math.PI / 4);
  }
  for (const [index, scene] of variants['16:9'].entries()) {
    assert.equal(scene.narration, variants['9:16'][index].narration);
    assert.equal(scene.estimated_seconds, variants['9:16'][index].estimated_seconds);
    assert.notDeepEqual(scene.scene_graph, variants['9:16'][index].scene_graph);
  }
  const normalizedProject = normalizeProject({ title: document.title, motionMode: 'scenegraph', scenes: variants['16:9'], variants: { landscape: { scenes: variants['16:9'] }, portrait: { scenes: variants['9:16'] } } });
  assert.deepEqual(normalizedProject.variants.landscape.map(scene => scene.objectScene.synchronizations), normalizedProject.variants.portrait.map(scene => scene.objectScene.synchronizations));
  const previousStorage = globalThis.localStorage;
  let persisted = '';
  try {
    globalThis.localStorage = { setItem(_key, value) { persisted = value; }, getItem() { return persisted; } };
    saveProject(normalizedProject, 'synchronized-engine-test');
    const reloaded = loadProject('synchronized-engine-test');
    assert.deepEqual(reloaded.variants.landscape.map(scene => scene.objectScene.synchronizations), normalizedProject.variants.landscape.map(scene => scene.objectScene.synchronizations));
    assert.deepEqual(reloaded.variants.portrait.map(scene => scene.objectScene.synchronizations), normalizedProject.variants.portrait.map(scene => scene.objectScene.synchronizations));
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
  const report = inspectVisualDslQuality({ variants, captionsEnabled: true });
  assert.deepEqual(report.counts, { error: 0, warning: 0, info: 0 }, JSON.stringify(report.issues));
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

test('cam-follower fixture imports and passes Inspector in landscape and portrait', async () => {
  const document = await fixture('Scientific_Mechanism_Cam_Follower.json');
  const landscape = document.variants.landscape.scenes;
  const portrait = document.variants.portrait.scenes;
  assert.equal(landscape.length, 6);
  assert.deepEqual(portrait.map(scene => [scene.id, scene.narration, scene.estimated_seconds]), landscape.map(scene => [scene.id, scene.narration, scene.estimated_seconds]));
  assert(landscape.reduce((sum, scene) => sum + scene.estimated_seconds, 0) <= 180);
  for (const [ratio, scenes] of [['16:9', landscape], ['9:16', portrait]]) {
    const imported = scenes.map(scene => validateVisualDslDocument({ ...document, scenes: [scene] })[0]);
    const quality = inspectVisualDslQuality({ variants: { [ratio]: imported }, captionsEnabled: true });
    assert.equal(quality.counts.error, 0, JSON.stringify(quality.issues));
    assert.equal(quality.counts.warning, 0, JSON.stringify(quality.issues));
    const project = normalizeProject({ title: document.title, motionMode: 'scenegraph', scenes: imported, variants: { landscape: { scenes: landscape }, portrait: { scenes: portrait } } });
    assert.equal(project.variants.landscape[0].objectScene.mechanisms[0].type, 'cam_follower');
    assert.notDeepEqual(project.variants.landscape[0].objectScene.objects[0].transform, project.variants.portrait[0].objectScene.objects[0].transform);
  }
});
