import { locateScene } from '../project.js';

export function exportFrameCount(duration, fps) {
  const seconds = Number(duration), rate = Number(fps);
  if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(rate) || rate <= 0) throw new Error('Export duration and frame rate must be positive finite numbers.');
  return Math.ceil(seconds * rate);
}

export function exportFrameTime(frameIndex, fps, duration) {
  const frame = Number(frameIndex), rate = Number(fps), seconds = Number(duration);
  if (!Number.isInteger(frame) || frame < 0 || !Number.isFinite(rate) || rate <= 0 || !Number.isFinite(seconds) || seconds <= 0) throw new Error('Export frame index, rate, or duration is invalid.');
  return Math.min(frame / rate, Math.max(0, seconds - 1e-5));
}

export function exportFrameLocation(project, frameIndex, fps, duration) {
  const time = exportFrameTime(frameIndex, fps, duration);
  const scene = locateScene(project, Math.min(time, Math.max(0, duration - 1e-5)));
  return { ...scene, time };
}
