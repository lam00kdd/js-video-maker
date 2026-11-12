import { evaluateVisualDslV3Scene } from '../visual-dsl-v3.js';
import { renderVisualDslV3Scene } from './visual-dsl-v3-renderer.js';

export function resolveVisualDslV3Scene(document,variant,sceneId){const scenes=variant==='root'?document?.scenes:document?.variants?.[variant]?.scenes,scene=scenes?.find(item=>item.id===sceneId);if(!scene)throw new Error(`Visual DSL v3 scene not found for ${variant}/${sceneId}.`);return scene;}

/** Shared stateless render-at-time boundary for Video Studio preview and MP4 frames. */
export function renderVisualDslV3Frame(canvas,document,variant,sceneId,sceneTimeSeconds,options={}){const scene=resolveVisualDslV3Scene(document,variant,sceneId),evaluated=evaluateVisualDslV3Scene(scene,sceneTimeSeconds),render=renderVisualDslV3Scene(canvas,evaluated,{symbols:document.symbols||{},resources:options.resources||new Map(),missingAssetPolicy:options.missingAssetPolicy||'error',createCanvas:options.createCanvas||null});return{scene,evaluated,render};}
