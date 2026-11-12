import { normalizeVisualDslV3 } from '../visual-dsl-v3.js';
import { normalizeProject } from '../project.js';

let fallbackId=0;const makeId=()=>globalThis.crypto?.randomUUID?.()||`v3-scene-${++fallbackId}`;
function adaptScenes(scenes,variant,document){return scenes.map(scene=>({id:makeId(),title:scene.title,duration:scene.duration_seconds,narration:scene.narration,subtitleSize:['small','medium','large'].includes(document.subtitles?.size)?document.subtitles.size:'medium',voice:{voiceId:document.voice?.voice_id||'phuong_linh',rate:Number(document.voice?.rate)||1,autoGenerate:document.voice?.auto_generate!==false},visualDslV3Ref:{sceneId:scene.id,variant},layers:[{id:`v3-${scene.id}`,type:'2d',name:'Visual DSL v3',visible:true}]}));}

/** Validate and stage a complete immutable v3 document as a native Video Studio project. */
export function createVisualDslV3Project(input,{baseProject,sourceFileName='',portrait=null,normalized=false}={}){
  // Batch preflight normalizes once, then stages that same immutable document for
  // each requested aspect without repeating schema validation or interpretation.
  const visualDslV3=normalized?input:normalizeVisualDslV3(input),hasVariants=visualDslV3.aspect_ratio==='both';
  const portraitSelected=portrait??visualDslV3.aspect_ratio==='9:16';
  const variant=hasVariants?(portraitSelected?'portrait':'landscape'):'root';
  const scenes=adaptScenes(hasVariants?visualDslV3.variants[variant].scenes:visualDslV3.scenes,variant,visualDslV3);
  const variants=hasVariants?{landscape:{scenes:adaptScenes(visualDslV3.variants.landscape.scenes,'landscape',visualDslV3)},portrait:{scenes:adaptScenes(visualDslV3.variants.portrait.scenes,'portrait',visualDslV3)}}:null;
  const prior=baseProject||{};
  const brand={...(prior.brand||{}),outroEnabled:visualDslV3.outro?.enabled??prior.brand?.outroEnabled,outroDuration:visualDslV3.outro?.duration_seconds??prior.brand?.outroDuration};
  const candidate=normalizeProject({...prior,title:visualDslV3.title,motionMode:'visualdslv3',visualDslV3,sourceFileName,width:portraitSelected?720:1920,height:portraitSelected?1280:1080,scenes,variants,captionsEnabled:visualDslV3.subtitles?.enabled!==false,karaokeCaptions:visualDslV3.subtitles?.karaoke!==false,youtube:visualDslV3.metadata?.youtube||prior.youtube,socialPost:visualDslV3.metadata?.social_post||prior.socialPost,brand});
  return{project:candidate,visualDslV3,hasVariants,aspect:visualDslV3.aspect_ratio,importedPortrait:portraitSelected,sceneCount:scenes.length};
}

export function resolveVisualDslV3ProjectScene(project,scene){const ref=scene?.visualDslV3Ref;if(!ref)return null;const scenes=ref.variant==='root'?project.visualDslV3?.scenes:project.visualDslV3?.variants?.[ref.variant]?.scenes;return scenes?.find(item=>item.id===ref.sceneId)||null;}
