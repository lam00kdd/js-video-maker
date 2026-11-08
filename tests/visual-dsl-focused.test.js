import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { adaptVisualDslScene, validateVisualDslDocument } from '../src/visual-dsl.js';
import { resolveObjectScene } from '../src/render/object-scene-resolver.js';
import { renderObjectScene } from '../src/render/object-scene-renderer.js';
import { inspectVisualDslQuality } from '../src/render/visual-quality-inspector.js';
import { effectiveSceneDuration, loadProject, locateScene, normalizeProject, saveProject, totalDuration } from '../src/project.js';
import { camFollowerLiftAtAngle } from '../src/render/cam-follower-profile.js';
import { buildCamFollowerRuntimeDiagnostic, inspectorVariantSelection } from '../src/render/cam-follower-runtime-diagnostics.js';
import { exportFrameCount, exportFrameLocation, exportFrameTime } from '../src/render/export-frame-clock.js';
import { encodeOfflineFrames } from '../src/render/offline-frame-pipeline.js';

const fixture = async name => JSON.parse(await readFile(new URL(`../examples/${name}`, import.meta.url), 'utf8'));
function canvasContext(width=1280,height=720){
  const log=[],target={canvas:{width,height},fillStyle:'',strokeStyle:''};
  const context=new Proxy(target,{get(state,key){if(key in state)return state[key];return(...args)=>{if(['translate','rotate','scale','beginPath','moveTo','lineTo','arc','fill','stroke','fillText','bezierCurveTo','quadraticCurveTo','closePath'].includes(String(key)))log.push({method:String(key),args,value:state[key==='fill'?'fillStyle':'strokeStyle']});};},set(state,key,value){state[key]=value;return true;}});
  return{context,log};
}

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

test('narration shorter than configured scene duration does not truncate mechanism runtime', async () => {
  const fixtureDocument = await fixture('Scientific_Mechanism_Four_Stroke_Synchronized.json');
  for (const variant of ['landscape', 'portrait']) {
    const scenes = fixtureDocument.variants[variant].scenes.map((scene, index) => ({ ...scene, duration: scene.estimated_seconds, audioDuration: 15.425, objectScene: adaptVisualDslScene(scene, index, 2) }));
    assert.deepEqual(scenes.map(scene => effectiveSceneDuration(scene, scene.audioDuration)), [18, 18, 18, 18]);
    const project = normalizeProject({ motionMode: 'scenegraph', scenes, variants: { landscape: scenes, portrait: scenes } });
    assert.equal(totalDuration(project), 72);
    assert.deepEqual([0, 17.5, 17.999, 18, 35.999, 36, 53.999, 54, 71.999].map(time => locateScene(project, time).index), [0, 0, 0, 1, 1, 2, 2, 3, 3], `${variant} export scene boundaries`);
    assert.equal(exportFrameCount(totalDuration(project), 24), 1728);
    assert.equal(exportFrameLocation(project, Math.floor(17.5 * 24), 24, 72).index, 0, `${variant} at 17.5s stays in intake`);
    assert.deepEqual([432, 864, 1296].map(frame => exportFrameLocation(project, frame, 24, 72).index), [1, 2, 3], `${variant} frame-accurate 18-second cuts`);
    assert.deepEqual([431, 863, 1295].map(frame => exportFrameLocation(project, frame, 24, 72).index), [0, 1, 2], `${variant} preceding frames remain in the prior scene`);
    const lastFrame = exportFrameLocation(project, 1727, 24, 72);
    assert.equal(lastFrame.index, 3);
    assert.equal(lastFrame.time, exportFrameTime(1727, 24, 72));
    assert(lastFrame.time < 72 && lastFrame.time > 71.95, `${variant} exports the last valid frame before 72 seconds`);
    assert.deepEqual([18, 36, 54, 72].map(boundary => Math.round(boundary / 18 * 180)), [180, 360, 540, 720]);
    const longerNarration = { ...scenes[0], audioDuration: 20 };
    assert.equal(effectiveSceneDuration(longerNarration, longerNarration.audioDuration), 20);
    assert.equal(scenes.slice(1).reduce((sum, scene) => sum + effectiveSceneDuration(scene, scene.audioDuration), 0), 54);
  }
  assert.equal(effectiveSceneDuration({ duration: 18, audioDuration: 15.425 }, 15.425), 15.425, 'legacy scenes keep audio-synced timing');
});

test('offline frame export awaits backpressure and presents every fixed timestamp', async () => {
  for (const ratio of ['16:9', '9:16']) {
    const frameCount = exportFrameCount(72, 24), drawn = [], added = [], progress = [];
    let activeAdds = 0, maxActiveAdds = 0;
    const result = await encodeOfflineFrames({
      frameCount, fps: 24, duration: 72,
      drawFrame: (time, index) => drawn.push([index, time]),
      addFrame: async (time, duration, index) => { activeAdds++; maxActiveAdds = Math.max(maxActiveAdds, activeAdds); await Promise.resolve(); added.push([index, time, duration]); activeAdds--; },
      onProgress: value => progress.push(value),
    });
    assert.equal(result.cancelled, false, ratio);
    assert.equal(result.renderRequested, 1728, ratio);
    assert.equal(result.canvasPresented, 1728, ratio);
    assert.equal(drawn.length, 1728, ratio);
    assert.equal(added.length, 1728, ratio);
    assert.equal(progress.length, 1728, ratio);
    assert.equal(maxActiveAdds, 1, `${ratio} propagates encoder backpressure without queuing frames`);
    for (const index of [0, 419, 420, 431, 432, 863, 864, 1295, 1296, 1727]) {
      assert.equal(drawn[index][0], index, ratio);
      assert.equal(drawn[index][1], index / 24, ratio);
      assert.equal(added[index][1], index / 24, ratio);
      assert.equal(added[index][2], 1 / 24, ratio);
    }
    assert.equal(added.at(-1)[1] + added.at(-1)[2], 72, `${ratio} final sample closes exactly at 72s`);
  }
  const cancelled = await encodeOfflineFrames({ frameCount: 20, fps: 24, drawFrame() {}, addFrame: async () => {}, isCancelled: () => true });
  assert.deepEqual(cancelled, { cancelled: true, renderRequested: 0, canvasPresented: 0 });
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
  const brandedReport = inspectVisualDslQuality({ variants, captionsEnabled: true, brand: { logoDataUrl: 'data:image/png;base64,AA==', logoNaturalWidth: 160, logoNaturalHeight: 80, logoPosition: 'top-right', logoSize: 14, logoOpacity: 1 } });
  assert.deepEqual(brandedReport.counts, { error: 0, warning: 0, info: 0 }, JSON.stringify(brandedReport.issues));
});

test('engine fixture preserves 720-degree linkage geometry, valve phases and measured cam contact', async () => {
  const document = await fixture('Scientific_Mechanism_Four_Stroke_Synchronized.json');
  const normalized = {};
  for (const [variant, width, height, ratio] of [['landscape', 1280, 720, '16:9'], ['portrait', 720, 1280, '9:16']]) {
    const scenes = document.variants[variant].scenes.map((scene, index) => ({ ...scene, scene_graph: adaptVisualDslScene(scene, index, 2) }));
    normalized[variant] = scenes;
    const size = { width, height };
    const cycleAngles = [0, 90, 180, 270, 360, 450, 540, 630, 720];
    for (const cycleAngle of cycleAngles) {
      const sceneIndex = cycleAngle === 720 ? 3 : Math.floor(cycleAngle / 180);
      const localTime = (cycleAngle - sceneIndex * 180) / 10;
      const graph = scenes[sceneIndex].scene_graph;
      const resolved = resolveObjectScene(graph, localTime, 18, size);
      const byId = id => resolved.objects.find(object => object.id === id);
      const crank = byId('crank'), rod = byId('connecting-rod'), piston = byId('piston-rod-unit');
      const mechanism = graph.mechanisms.find(item => item.id === 'engine-cycle');
      const unit = Math.min(width, height), cx = mechanism.params.crank_center.x * width, cy = mechanism.params.crank_center.y * height;
      const pin = { x: cx + mechanism.params.crank_radius * unit * Math.cos(crank.transform.rotation), y: cy + mechanism.params.crank_radius * unit * Math.sin(crank.transform.rotation) };
      const rodStart = { x: rod.transform.x * width, y: rod.transform.y * height };
      const rodEnd = { x: rodStart.x + rod.geometry.end.x * unit * Math.cos(rod.transform.rotation), y: rodStart.y + rod.geometry.end.x * unit * Math.sin(rod.transform.rotation) };
      const pistonPin = { x: piston.transform.x * width, y: piston.transform.y * height };
      assert(Math.abs(crank.transform.rotation * 180 / Math.PI - (cycleAngle - 90)) < 1e-8, `crank angle at cycle ${cycleAngle}°`);
      assert(Math.abs(Math.hypot(pin.x - cx, pin.y - cy) - mechanism.params.crank_radius * unit) < 1e-8, 'crank pin stays on its prescribed orbit');
      assert(Math.hypot(rodStart.x - pin.x, rodStart.y - pin.y) < 1e-6, 'rod small end stays on crank pin');
      assert(Math.hypot(rodEnd.x - pistonPin.x, rodEnd.y - pistonPin.y) < 1e-6, 'rod big end stays on piston pin');
      assert(Math.abs(Math.hypot(rodEnd.x - rodStart.x, rodEnd.y - rodStart.y) - mechanism.params.connecting_rod_length * unit) < 1e-6, 'rod length remains rigid');
      assert(Math.abs(piston.transform.x - mechanism.params.crank_center.x) < 1e-9, 'piston remains on the cylinder axis');

      const { context, log } = canvasContext(width, height);
      const rendered = renderObjectScene(context, graph, localTime, 18);
      const renderedRod = rendered.objects.find(object => object.id === 'connecting-rod');
      assert.deepEqual(renderedRod.transform, rod.transform, 'canvas renderer receives the resolver rod pose');
      assert(log.some(item => item.method === 'translate' && Math.abs(item.args[0] - rodStart.x) < 1e-6 && Math.abs(item.args[1] - rodStart.y) < 1e-6), 'canvas receives the resolved rod joint origin');
      assert(log.some(item => item.method === 'lineTo' && Math.abs(item.args[0] - rod.geometry.end.x * unit) < 1e-6 && Math.abs(item.args[1]) < 1e-6), 'canvas receives the rigid rod endpoint geometry');

      for (const [id, activeStart, activeEnd] of [['intake-cam-drive', 0, 180], ['exhaust-cam-drive', 540, 720]]) {
        const camMechanism = graph.mechanisms.find(item => item.id === id);
        const link = graph.synchronizations.find(item => item.dependent_id === id);
        const cam = byId(camMechanism.bindings.cam), follower = byId(camMechanism.bindings.follower);
        assert.equal(link.ratio, .5);
        assert(Math.abs(cam.transform.rotation - crank.transform.rotation * .5 - link.phase_offset) < 1e-9, 'cam preserves its independent crank phase');
        const lift = camFollowerLiftAtAngle(camMechanism.params, cam.transform.rotation).lift;
        assert.equal(follower.mechanism_lift, lift);
        if (cycleAngle > activeStart && cycleAngle < activeEnd) assert(lift > 0, `${id} opens only inside its idealized stroke`);
        else assert.equal(lift, 0, `${id} is seated outside its idealized stroke`);
      }
    }
    const transitionSamples = [1, 45, 90, 135, 179, 181, 225, 270, 315, 359, 361, 405, 450, 495, 539, 541, 585, 630, 675, 719];
    for (const cycleAngle of transitionSamples) {
      const sceneIndex = Math.floor(cycleAngle / 180), localTime = (cycleAngle - sceneIndex * 180) / 10;
      const graph = scenes[sceneIndex].scene_graph, resolved = resolveObjectScene(graph, localTime, 18, size);
      for (const [id, start, end] of [['intake-cam-drive', 0, 180], ['exhaust-cam-drive', 540, 720]]) {
        const mechanism = graph.mechanisms.find(item => item.id === id), follower = resolved.objects.find(object => object.id === mechanism.bindings.follower);
        assert(follower.mechanism_lift >= 0 && follower.mechanism_lift <= mechanism.params.max_lift);
        if (cycleAngle > start && cycleAngle < end) assert(follower.mechanism_lift > 0, `${id} has continuous finite lift inside its stroke at ${cycleAngle}°`);
        else assert.equal(follower.mechanism_lift, 0, `${id} is closed outside its stroke at ${cycleAngle}°`);
      }
    }
    for (const [sceneIndex, scene] of scenes.entries()) {
      const graph = scene.scene_graph;
      for (const id of ['intake-cam-drive', 'exhaust-cam-drive']) {
        const mechanism = graph.mechanisms.find(item => item.id === id);
        const cam = graph.objects.find(object => object.id === mechanism.bindings.cam);
        const follower = graph.objects.find(object => object.id === mechanism.bindings.follower);
        assert.equal(mechanism.params.max_lift, .006);
        assert(follower.children.some(object => object.id === `${follower.id}-face`), 'follower has a finite contact face');
      }
    }
  }
  const project = normalizeProject({ title: document.title, motionMode: 'scenegraph', scenes: normalized.landscape, variants: { landscape: { scenes: normalized.landscape }, portrait: { scenes: normalized.portrait } } });
  const selection = inspectorVariantSelection(project);
  for (const [variant, width, height] of [['16:9', 1280, 720], ['9:16', 720, 1280]]) {
    for (const [sceneIndex, timeSeconds, expectedLift] of [[0, 9, .006], [3, 9, .006]]) {
      const diagnostic = buildCamFollowerRuntimeDiagnostic({ project, variant, sceneIndex, timeSeconds, width, height, inspectorSelection: selection });
      assert.equal(diagnostic.mechanisms.length, 2);
      for (const item of diagnostic.mechanisms) {
        assert(item.cam.outlineGeometry?.points?.length >= 96, `${item.id} outline is resolved`);
        assert(item.follower.faceGeometry, `${item.id} follower face is resolved`);
        assert(Math.abs(item.follower.residualPx) < .01, `${item.id} transformed face residual is measured`);

      }
      const active = diagnostic.mechanisms.find(item => item.profile.lift > 0);
      assert(Math.abs(active.profile.lift - expectedLift) < 1e-9);
    }
  }
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
