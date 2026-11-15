import { exportFrameTime } from './export-frame-clock.js';

export async function encodeOfflineFrames({ frameCount, fps, duration = frameCount / fps, drawFrame, addFrame, isCancelled = () => false, onProgress = () => {} }) {
  let renderRequested = 0, canvasPresented = 0;
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    if (isCancelled()) return { cancelled: true, renderRequested, canvasPresented };
    const timestamp = exportFrameTime(frameIndex, fps, duration);
    const frameDuration = Math.min(1 / fps, duration - timestamp);
    drawFrame(timestamp, frameIndex);
    renderRequested++;
    await addFrame(timestamp, frameDuration, frameIndex);
    canvasPresented++;
    onProgress({ frameIndex, timestamp, renderRequested, canvasPresented });
  }
  return { cancelled: false, renderRequested, canvasPresented };
}
