const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const easingFunctions = Object.freeze({
  linear: t => t,
  ease_in: t => t * t,
  ease_out: t => 1 - (1 - t) * (1 - t),
  ease_in_out: t => t * t * (3 - 2 * t),
  spring: t => {
    const bounded = clamp(t, 0, 1);
    return 1 - Math.exp(-7 * bounded) * Math.cos(10 * bounded);
  }
});

const lerp = (from, to, t) => from + (to - from) * t;

function bezierPoint(points, t) {
  const u = 1 - t;
  return {
    x: u ** 3 * points[0].x + 3 * u ** 2 * t * points[1].x + 3 * u * t ** 2 * points[2].x + t ** 3 * points[3].x,
    y: u ** 3 * points[0].y + 3 * u ** 2 * t * points[1].y + 3 * u * t ** 2 * points[2].y + t ** 3 * points[3].y
  };
}

/** Resolve one declarative actor animation into a Canvas pose at an absolute scene time. */
export function poseAt(animation, sceneTime) {
  const start = Number(animation?.start_seconds) || 0;
  const duration = Math.max(.001, Number(animation?.duration_seconds) || 1);
  const elapsed = Math.max(0, sceneTime - start);
  let rawProgress = clamp(elapsed / duration, 0, 1);
  if (animation?.loop === 'repeat') rawProgress = (elapsed % duration) / duration;
  if (animation?.loop === 'ping_pong') {
    const cycle = (elapsed % (duration * 2)) / duration;
    rawProgress = cycle <= 1 ? cycle : 2 - cycle;
  }
  const easing = easingFunctions[animation?.easing] || easingFunctions.ease_in_out;
  const progress = easing(rawProgress);
  const from = animation?.from || {};
  const to = animation?.to || {};
  const pose = {
    x: lerp(Number(from.x) || 0, Number(to.x) || 0, progress),
    y: lerp(Number(from.y) || 0, Number(to.y) || 0, progress),
    scale: lerp(Number(from.scale ?? 1), Number(to.scale ?? 1), progress),
    rotation: lerp(Number(from.rotation) || 0, Number(to.rotation) || 0, progress),
    opacity: lerp(Number(from.opacity ?? 1), Number(to.opacity ?? 1), progress)
  };

  if (Array.isArray(animation?.path) && animation.path.length === 4) {
    const point = bezierPoint(animation.path, progress);
    pose.x = point.x;
    pose.y = point.y;
  }
  return pose;
}

export function easingNames() {
  return Object.keys(easingFunctions);
}
