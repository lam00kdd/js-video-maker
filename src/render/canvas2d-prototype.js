import { renderCanvas2DPrototype } from './scene-renderer.js';

const scenes = {
  entrance: {
    id: 'prototype-entrance', title: 'Cùng bắt đầu khám phá', duration: 8, theme: 'sunrise',
    environment: 'toy_workshop', showOrb: false, narration: '',
    illustrations: [
      { type: 'person', action: 'wave', position: 'lower-left', scale: 1.12, color: '#edb85c', label: 'Linh' },
      { type: 'toy_robot', action: 'wave', position: 'lower-right', scale: 1.05, color: '#5ebdcb', label: 'ROBOT' },
      { type: 'toy_blocks', action: 'none', position: 'lower-center', scale: .76, color: '#e78b75', label: '' }
    ],
    animation: { actors: [
      { illustration_index: 0, start_seconds: 0, duration_seconds: 2.4, easing: 'spring', from: { x: -.14, y: .76, scale: .78, rotation: -.12, opacity: 0 }, to: { x: .32, y: .68, scale: 1.04, rotation: 0, opacity: 1 }, path: [{x:-.14,y:.76},{x:-.08,y:.36},{x:.16,y:.40},{x:.32,y:.68}] },
      { illustration_index: 1, start_seconds: .35, duration_seconds: 2.6, easing: 'ease_out', from: { x: 1.15, y: .67, scale: .82, rotation: .22, opacity: 0 }, to: { x: .72, y: .67, scale: 1, rotation: 0, opacity: 1 }, path: [{x:1.15,y:.67},{x:1.02,y:.33},{x:.83,y:.34},{x:.72,y:.67}] }
    ] }
  },
  chart: {
    id: 'prototype-chart', title: 'Theo dõi xu hướng', duration: 8, theme: 'ocean',
    environment: 'quality_room', showOrb: false, narration: '',
    illustrations: [
      { type: 'quality_chart', action: 'none', position: 'right', scale: 1.15, color: '#55b99a', label: 'QUALITY' },
      { type: 'person', action: 'point', position: 'lower-left', scale: 1.05, color: '#e5a957', label: '' },
      { type: 'control_plan', action: 'none', position: 'upper-right', scale: .60, color: '#70bdd0', label: 'PLAN' }
    ],
    animation: { actors: [
      { illustration_index: 0, start_seconds: .35, duration_seconds: 1.7, easing: 'ease_out', from: { x: 1.18, y: .62, scale: .62, rotation: .18, opacity: 0 }, to: { x: .77, y: .62, scale: 1.02, rotation: 0, opacity: 1 }, path: [{x:1.18,y:.62},{x:1.05,y:.26},{x:.82,y:.30},{x:.77,y:.62}] },
      { illustration_index: 1, start_seconds: 1.0, duration_seconds: 1.8, easing: 'ease_in_out', from: { x: -.12, y: .74, scale: .86, rotation: -.08, opacity: 0 }, to: { x: .27, y: .70, scale: 1, rotation: 0, opacity: 1 } },
      { illustration_index: 2, start_seconds: 2.5, duration_seconds: .8, easing: 'spring', loop: 'ping_pong', from: { x: .80, y: .28, scale: .60, rotation: -.04, opacity: .75 }, to: { x: .80, y: .25, scale: .68, rotation: .04, opacity: 1 } }
    ] }
  },
  orbit: {
    id: 'prototype-orbit', title: 'Một quỹ đạo mới', duration: 8, theme: 'nebula',
    environment: 'space', showOrb: false, narration: '',
    illustrations: [
      { type: 'planet', action: 'none', position: 'center', scale: 1.05, color: '#63bad3', label: '' },
      { type: 'moon', action: 'none', position: 'upper-right', scale: .52, color: '#edc575', label: '' },
      { type: 'rocket', action: 'fly', position: 'left', scale: .63, color: '#e98c72', label: '' }
    ],
    animation: { actors: [
      { illustration_index: 1, start_seconds: 0, duration_seconds: 5.6, easing: 'linear', loop: 'ping_pong', from: { x: .23, y: .39, scale: .45, rotation: 0, opacity: 1 }, to: { x: .77, y: .62, scale: .62, rotation: 6.28, opacity: 1 }, path: [{x:.23,y:.39},{x:.43,y:.04},{x:.77,y:.18},{x:.77,y:.62}] },
      { illustration_index: 2, start_seconds: .4, duration_seconds: 4.2, easing: 'ease_in_out', from: { x: -.10, y: .74, scale: .50, rotation: -.35, opacity: 0 }, to: { x: .45, y: .46, scale: .68, rotation: .15, opacity: 1 }, path: [{x:-.10,y:.74},{x:.12,y:.52},{x:.22,y:.82},{x:.45,y:.46}] }
    ] }
  }
};

const canvas = document.querySelector('#stage');
const playButton = document.querySelector('#play');
const seek = document.querySelector('#seek');
const timeLabel = document.querySelector('#time');
const example = document.querySelector('#example');
const duration = 8;
let time = 0;
let playing = false;
let lastFrameTime = 0;

function formatTime(value) {
  const seconds = Math.max(0, value);
  return `00:${String(Math.floor(seconds)).padStart(2, '0')}.${String(Math.floor((seconds % 1) * 100)).padStart(2, '0')}`;
}

function render() {
  renderCanvas2DPrototype(canvas, scenes[example.value], time, { captionsEnabled: false });
  seek.value = String(time);
  timeLabel.textContent = `${formatTime(time)} / ${formatTime(duration)}`;
}

function frame(now) {
  if (playing) {
    if (lastFrameTime) time += Math.min(.05, (now - lastFrameTime) / 1000);
    if (time >= duration) time %= duration;
    lastFrameTime = now;
  } else lastFrameTime = 0;
  render();
  requestAnimationFrame(frame);
}

playButton.addEventListener('click', () => {
  playing = !playing;
  playButton.textContent = playing ? 'Ⅱ Dừng' : '▶ Phát';
  if (!playing) lastFrameTime = 0;
});
seek.addEventListener('input', () => { time = Number(seek.value); render(); });
example.addEventListener('change', () => { time = 0; render(); });
render();
requestAnimationFrame(frame);
