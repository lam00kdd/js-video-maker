import { normalizeSpriteProductionDefinition } from './character-sprite-workflow.js';
import { diagnoseSpriteClip, normalizeSpriteClip } from './sprite-clips.js';

const availableSet=value=>value instanceof Set?value:new Set(value||[]);

export function validateSpriteForPublishing(spriteValue,{availableAssetIds=[]}={}){
  const sprite=normalizeSpriteProductionDefinition(spriteValue),available=availableSet(availableAssetIds),blocking_errors=[],warnings=[],excluded_poses=[],excluded_clips=[];
  const master=sprite.master;
  if(master.status!=='approved')blocking_errors.push('Master Character is not approved.');
  if(!Number.isInteger(master.revision)||master.revision<1)blocking_errors.push('Master revision is invalid.');
  if(!master.asset_id)blocking_errors.push('Master Character image is missing.');
  else if(!available.has(master.asset_id))blocking_errors.push('Master Character image is missing or failed integrity checks.');
  const usable_poses=[];
  for(const pose of sprite.poses){
    const reason=!pose.asset_id?'Pose image is missing.':!available.has(pose.asset_id)?'Pose image is missing or failed integrity checks.':pose.review_status!=='approved'?'Pose is not approved.':pose.source_master_revision!==master.revision?'Pose is stale for the current Master revision.':null;
    if(reason){excluded_poses.push({pose_id:pose.pose_id,label:pose.label,reason});continue;}
    usable_poses.push({pose_id:pose.pose_id,label:pose.label,asset_id:pose.asset_id,source_master_revision:pose.source_master_revision,width:pose.width,height:pose.height,anchor:structuredClone(pose.anchor),alignment:structuredClone(pose.alignment),transparency:pose.transparency});
  }
  if(!usable_poses.length)blocking_errors.push('At least one approved, current, valid pose is required.');
  const default_pose=sprite.poses.find(pose=>pose.pose_id===sprite.default_pose_id);
  if(!default_pose||!usable_poses.some(pose=>pose.pose_id===sprite.default_pose_id))blocking_errors.push('The default pose must be included as an approved, current, valid pose.');
  if(excluded_poses.length)warnings.push(`${excluded_poses.length} unavailable, rejected, or stale pose(s) will be excluded.`);
  const publishable_clips=[];
  for(const source of sprite.clips||[]){
    let clip;try{clip=normalizeSpriteClip(source);}catch(error){excluded_clips.push({clip_id:String(source?.clip_id||'unknown'),reason:`Invalid clip metadata: ${error.message}`});continue;}
    const diagnostics=diagnoseSpriteClip(clip,sprite,{invalidAssetIds:clip.frames.filter(frame=>frame.asset_id&&!available.has(frame.asset_id)).map(frame=>frame.asset_id)}),errors=diagnostics.filter(item=>item.severity==='error');
    if(clip.approval_status!=='approved')errors.push({message:'Clip is not Approved.'});
    if(clip.validation_status!=='valid')errors.push({message:'Clip validation status is not valid.'});
    if(clip.frames.length!==clip.frame_count||clip.frames.some(frame=>!frame.asset_id))errors.push({message:`Expected ${clip.frame_count} imported frames; found ${clip.frames.filter(frame=>frame.asset_id).length}.`});
    if(errors.length){excluded_clips.push({clip_id:clip.clip_id,label:clip.label,reason:[...new Set(errors.map(item=>item.message))].join(' ')});continue;}
    publishable_clips.push({clip_id:clip.clip_id,label:clip.label,character_id:clip.character_id,source_master_revision:clip.source_master_revision,source_pose_id:clip.source_pose_id,source_pose_asset_id:clip.source_pose_asset_id,frame_count:clip.frame_count,fps:clip.fps,loop:clip.loop,hold_last_frame:clip.hold_last_frame,frames:clip.frames.map(frame=>({frame_index:frame.frame_index,asset_id:frame.asset_id,width:frame.width,height:frame.height,anchor:structuredClone(frame.anchor),alignment:structuredClone(frame.alignment),transparency:frame.transparency,...(frame.duration_seconds==null?{}:{duration_seconds:frame.duration_seconds})}))});
  }
  if(excluded_clips.length)warnings.push(`${excluded_clips.length} invalid or unapproved clip(s) are excluded. Explicit confirmation is required to publish without them.`);
  const asset_refs=[...new Set([master.asset_id,...usable_poses.map(pose=>pose.asset_id),...publishable_clips.flatMap(clip=>clip.frames.map(frame=>frame.asset_id))].filter(Boolean))].sort();
  return{valid:blocking_errors.length===0,blocking_errors,warnings,excluded_poses,excluded_clips,requires_clip_exclusion_confirmation:excluded_clips.length>0,master_revision:master.revision,default_pose_id:sprite.default_pose_id,poses:usable_poses,clips:publishable_clips,asset_refs};
}

export function createSpritePublishedSnapshot({character_id,version,published_at,display_name,description='',role='custom',sprite,validation}){
  if(!validation?.valid)throw new Error('Cannot create a Sprite version with blocking validation errors.');
  return{schema_version:1,character_id,character_type:'sprite',version,published_at,display_name:String(display_name||'').slice(0,120),description:String(description||'').slice(0,2000),role:String(role||'custom'),master:{revision:validation.master_revision,asset_id:sprite.master.asset_id,width:sprite.master.width,height:sprite.master.height,identity_snapshot:structuredClone(sprite.master.identity_snapshot||sprite.identity)},default_pose_id:validation.default_pose_id,poses:structuredClone(validation.poses),clips:structuredClone(validation.clips),asset_refs:[...validation.asset_refs],validation:{status:'validated',blocking_errors:[],warnings:[...validation.warnings],excluded_poses:structuredClone(validation.excluded_poses),excluded_clips:structuredClone(validation.excluded_clips)}};
}

export function resolvePublishedSpriteVersion(versionRecord){if(!versionRecord||versionRecord.character_type!=='sprite'||versionRecord.sprite_snapshot?.schema_version!==1)return{status:'invalid_version',diagnostics:[{severity:'error',code:'invalid_sprite_snapshot',message:'Published Sprite snapshot is missing or has an unsupported schema.'}]};return{status:'resolved',character_id:versionRecord.character_id,version:versionRecord.version,character_type:'sprite',content_checksum:versionRecord.content_checksum,snapshot:structuredClone(versionRecord.sprite_snapshot),assets:versionRecord.assets,diagnostics:versionRecord.diagnostics||[]};}
