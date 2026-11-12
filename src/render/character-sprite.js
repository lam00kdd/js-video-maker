export const CHARACTER_TYPES=Object.freeze(['rigged','sprite']);
export const SAMPLE_SPRITE_TEMPLATE_ID='lam_educator_sprite_v1';
const LOCAL_SPRITE_ASSET=/^\/assets\/character-sprites\/[a-z0-9/_-]+\.(?:png|webp|svg)$/;
const finite=(value,label,min,max)=>{const number=Number(value);if(!Number.isFinite(number)||number<min||number>max)throw new Error(`${label} must be finite and within [${min}, ${max}].`);return number;};

/** Old library records without a discriminator stay on the existing M1 rigged path. */
export function normalizeCharacterType(value){const type=value==null||value===''?'rigged':String(value);if(!CHARACTER_TYPES.includes(type))throw new Error('character_type must be "rigged" or "sprite".');return type;}

const samplePoses=Object.freeze([
  Object.freeze({pose_id:'idle',label:'Idle',asset_ref:'/assets/character-sprites/lam-educator/idle.svg',anchor_x:128,anchor_y:360,width:256,height:384}),
  Object.freeze({pose_id:'greet',label:'Greet',asset_ref:'/assets/character-sprites/lam-educator/greet.svg',anchor_x:128,anchor_y:360,width:256,height:384}),
  Object.freeze({pose_id:'point',label:'Point',asset_ref:'/assets/character-sprites/lam-educator/point.svg',anchor_x:128,anchor_y:360,width:256,height:384}),
  Object.freeze({pose_id:'explain',label:'Explain',asset_ref:'/assets/character-sprites/lam-educator/explain.svg',anchor_x:128,anchor_y:360,width:256,height:384})
]);

export function createSampleSpriteCharacterDefinition(){return{schema_version:1,template_id:SAMPLE_SPRITE_TEMPLATE_ID,canvas:{width:256,height:384},default_pose_id:'idle',transparent_background:true,poses:samplePoses.map(pose=>({...pose}))};}

export function normalizeSpriteCharacterDefinition(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('sprite_character must be an object.');
  if(Number(value.schema_version)!==1)throw new Error('sprite_character.schema_version is unsupported.');
  const template_id=String(value.template_id||'');if(template_id!==SAMPLE_SPRITE_TEMPLATE_ID)throw new Error('sprite_character.template_id is unsupported.');
  const canvas=value.canvas;if(!canvas||typeof canvas!=='object'||Array.isArray(canvas))throw new Error('sprite_character.canvas must be an object.');
  const width=finite(canvas.width,'sprite_character.canvas.width',1,4096),height=finite(canvas.height,'sprite_character.canvas.height',1,4096);
  if(!Array.isArray(value.poses)||value.poses.length<1||value.poses.length>128)throw new Error('sprite_character.poses must contain 1–128 poses.');
  const ids=new Set(),poses=value.poses.map((source,index)=>{const label=`sprite_character.poses[${index}]`;if(!source||typeof source!=='object'||Array.isArray(source))throw new Error(`${label} must be an object.`);const pose_id=String(source.pose_id||'');if(!/^[a-z][a-z0-9_-]{0,63}$/.test(pose_id)||ids.has(pose_id))throw new Error(`${label}.pose_id is invalid or duplicated.`);ids.add(pose_id);const poseWidth=finite(source.width,`${label}.width`,1,4096),poseHeight=finite(source.height,`${label}.height`,1,4096),anchor_x=finite(source.anchor_x,`${label}.anchor_x`,0,poseWidth),anchor_y=finite(source.anchor_y,`${label}.anchor_y`,0,poseHeight),asset_ref=String(source.asset_ref||'');if(!LOCAL_SPRITE_ASSET.test(asset_ref)||asset_ref.includes('..'))throw new Error(`${label}.asset_ref must reference a local sprite asset under /assets/character-sprites/.`);const poseLabel=String(source.label||'').trim();if(!poseLabel||poseLabel.length>80)throw new Error(`${label}.label must contain 1–80 characters.`);return{pose_id,label:poseLabel,asset_ref,anchor_x,anchor_y,width:poseWidth,height:poseHeight};});
  const default_pose_id=String(value.default_pose_id||'');if(!ids.has(default_pose_id))throw new Error('sprite_character.default_pose_id must reference an existing pose.');
  return{schema_version:1,template_id,canvas:{width,height},default_pose_id,transparent_background:value.transparent_background!==false,poses};
}

export function resolveSpritePose(definition,poseId=definition?.default_pose_id){const sprite=normalizeSpriteCharacterDefinition(definition),pose=sprite.poses.find(item=>item.pose_id===poseId);if(!pose)throw new Error(`Unknown sprite pose "${poseId}".`);return{...pose,canvas:{...sprite.canvas},transparent_background:sprite.transparent_background};}

/** Draws one fixed-pose image into a shared registration point; no rig transforms or M1 data are involved. */
export function drawSpritePose(ctx,image,pose,{x,y,scale=1}={}){if(!ctx?.drawImage||!image)throw new Error('Sprite canvas context and loaded image are required.');const centerX=finite(x,'sprite placement.x',-1e6,1e6),centerY=finite(y,'sprite placement.y',-1e6,1e6),uniformScale=finite(scale,'sprite placement.scale',.001,1000);const left=centerX-pose.anchor_x*uniformScale,top=centerY-pose.anchor_y*uniformScale,width=pose.width*uniformScale,height=pose.height*uniformScale;ctx.drawImage(image,left,top,width,height);return{left,top,width,height,anchor:{x:centerX,y:centerY}};}

export function resolveCharacterPreviewMode(character){const character_type=normalizeCharacterType(character?.character_type);return character_type==='sprite'?{character_type,pose:resolveSpritePose(character.sprite_character)}:{character_type};}
