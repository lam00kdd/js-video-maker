const EASINGS = new Set(['linear', 'ease_in', 'ease_out', 'ease_in_out', 'spring']);
const finite = (value, fallback, min, max, label, sceneNumber) => {
  const number = value == null ? fallback : Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${label} trong hoạt ảnh cảnh ${sceneNumber} không hợp lệ.`);
  }
  return number;
};

function normalizePose(value, label, sceneNumber) {
  const pose = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    x: finite(pose.x, 0, -.5, 1.5, `${label}.x`, sceneNumber),
    y: finite(pose.y, 0, -.5, 1.5, `${label}.y`, sceneNumber),
    scale: finite(pose.scale, 1, .1, 3, `${label}.scale`, sceneNumber),
    rotation: finite(pose.rotation, 0, -6.3, 6.3, `${label}.rotation`, sceneNumber),
    opacity: finite(pose.opacity, 1, 0, 1, `${label}.opacity`, sceneNumber)
  };
}

export function normalizeAnimation(value, illustrationCount, sceneIndex = 0) {
  const sceneNumber = sceneIndex + 1;
  if (value == null) return { version: 1, actors: [] };
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`Hoạt ảnh cảnh ${sceneNumber} không hợp lệ.`);
  const source = Array.isArray(value.actors) ? value.actors : [];
  if (source.length > 14) throw new Error(`Cảnh ${sceneNumber} vượt quá 14 đạo cụ hoạt ảnh.`);
  const actors = source.map((actor, index) => {
    if (!actor || typeof actor !== 'object' || Array.isArray(actor)) throw new Error(`Đạo cụ hoạt ảnh ${index + 1} ở cảnh ${sceneNumber} không hợp lệ.`);
    const illustrationIndex = Number(actor.illustration_index);
    if (!Number.isInteger(illustrationIndex) || illustrationIndex < 0 || illustrationIndex >= illustrationCount) {
      throw new Error(`Hoạt ảnh cảnh ${sceneNumber} tham chiếu illustration_index không tồn tại.`);
    }
    let path;
    if (actor.path != null) {
      if (!Array.isArray(actor.path) || actor.path.length !== 4) throw new Error(`Đường Bézier cảnh ${sceneNumber} cần đúng 4 điểm.`);
      path = actor.path.map((point, pointIndex) => ({
        x: finite(point?.x, 0, -.5, 1.5, `path[${pointIndex}].x`, sceneNumber),
        y: finite(point?.y, 0, -.5, 1.5, `path[${pointIndex}].y`, sceneNumber)
      }));
    }
    return {
      illustration_index: illustrationIndex,
      start_seconds: finite(actor.start_seconds, 0, 0, 300, 'start_seconds', sceneNumber),
      duration_seconds: finite(actor.duration_seconds, 1, .05, 300, 'duration_seconds', sceneNumber),
      easing: EASINGS.has(actor.easing) ? actor.easing : 'ease_in_out',
      loop: ['repeat', 'ping_pong'].includes(actor.loop) ? actor.loop : 'none',
      from: normalizePose(actor.from, `actors[${index}].from`, sceneNumber),
      to: normalizePose(actor.to, `actors[${index}].to`, sceneNumber),
      ...(path ? { path } : {})
    };
  });
  // Allow multiple sequential tracks for one illustration, but reject
  // overlapping tracks because they would compete to set the same pose.
  const tracksByIllustration = new Map();
  for (const actor of actors) {
    const tracks = tracksByIllustration.get(actor.illustration_index) || [];
    tracks.push(actor);
    tracksByIllustration.set(actor.illustration_index, tracks);
  }
  for (const tracks of tracksByIllustration.values()) {
    tracks.sort((a, b) => a.start_seconds - b.start_seconds);
    for (let index = 1; index < tracks.length; index++) {
      const previous = tracks[index - 1];
      if (previous.loop !== 'none' || tracks[index].start_seconds < previous.start_seconds + previous.duration_seconds - 1e-6) {
        throw new Error(`Các track của cùng một đạo cụ không được chồng lấp ở cảnh ${sceneNumber}.`);
      }
    }
  }
  return { version: 1, actors };
}
