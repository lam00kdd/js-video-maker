import { ASSET2D_NARRATION_DELAY_SECONDS } from './scene-timing.js';

function syllableWeight(word) {
  const plain = String(word).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const nuclei = plain.match(/[aeiouy]+/gi)?.length || 0;
  return Math.max(0.7, nuclei || plain.replace(/[^\p{L}\p{N}]/gu, '').length * 0.22);
}

function pauseWeight(word) {
  if (/[.!?。！？…][”’"')\]]*$/u.test(word)) return 0.72;
  if (/[,;:，；：、][”’"')\]]*$/u.test(word)) return 0.32;
  return 0;
}

function splitWords(text, start, end) {
  const words = String(text).match(/\S+/gu) || [];
  if (!words.length || !(end > start)) return [];
  const weighted = words.map(text => ({ text, speech: syllableWeight(text), pause: pauseWeight(text) }));
  const total = weighted.reduce((sum, word) => sum + word.speech + word.pause, 0);
  let cursor = start;
  return weighted.map((word, index) => {
    const wordStart = cursor;
    cursor += (end - start) * word.speech / total;
    const wordEnd = index === weighted.length - 1 ? end : cursor;
    cursor += (end - start) * word.pause / total;
    return { text: word.text, start: wordStart, end: wordEnd };
  });
}

export function makeSubtitleCues(text, duration, audioDuration = 0) {
  duration = Math.max(Number(duration) || 0, Number(audioDuration) || 0);
  const parts = String(text || '').match(/[^.!?。！？]+[.!?。！？]?/gu)?.map(part => part.trim()).filter(Boolean) || [];
  if (!parts.length || !(duration > 0)) return [];
  const weights = parts.map(part => (part.match(/\S+/gu) || []).reduce((sum, word) => sum + syllableWeight(word) + pauseWeight(word), 0));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let cursor = 0;
  return parts.map((content, index) => {
    const start = cursor;
    cursor += duration * weights[index] / total;
    const end = index === parts.length - 1 ? duration : cursor;
    return { start, end, text: content, words: splitWords(content, start, end) };
  });
}

export function cueAt(text, duration, time) {
  const cue = makeSubtitleCues(text, duration).find(item => time >= item.start && time < item.end);
  if (!cue) return null;
  let wordIndex = 0;
  for (let index = 0; index < cue.words.length; index++) {
    if (time >= cue.words[index].start) wordIndex = index;
    else break;
  }
  return { ...cue, wordIndex };
}

function stamp(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, r = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(r).padStart(3, '0')}`;
}

export function projectToSrt(scenes) {
  let offset = 0, number = 1;
  const rows = [];
  for (const scene of scenes) {
    const duration = scene.audioDuration || scene.duration || 0, delay = scene.assetScene ? ASSET2D_NARRATION_DELAY_SECONDS : 0;
    for (const cue of makeSubtitleCues(scene.narration, duration)) rows.push(`${number++}\n${stamp(offset + delay + cue.start)} --> ${stamp(offset + delay + cue.end)}\n${cue.text}`);
    offset += Math.max(Number(scene.duration) || 0, delay + duration);
  }
  return rows.join('\n\n') + (rows.length ? '\n' : '');
}
