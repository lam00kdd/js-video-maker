const defaults={voiceId:'phuong_linh',voiceRate:1,exportFormat:'mp4',sceneExportTiming:'auto',stageZoom:100,activeTab:'scene',promptTopic:'',promptAudience:'6–12 tuổi',promptStyle:'Giải thích giáo dục',promptCustomStyle:'',promptAspectRatio:'',promptSubtitleSize:'medium',promptDuration:'auto',promptMotionMode:'',batchMotionMode:'',batchV3ScientificDetail:'detailed',promptUseVisualAssets:true,batchUseVisualAssets:true,outroMode:'landscape',autoVoiceAfterImport:false};
export function loadPreferences(key='lam-motion-studio.preferences.v1'){
 try{
  const saved=JSON.parse(localStorage.getItem(key)||'{}');
  const value={...defaults,...saved};
  value.voiceRate=['0.85','1','1.15'].includes(String(value.voiceRate))?Number(value.voiceRate):1;
  value.exportFormat=['mp4','webm'].includes(value.exportFormat)?value.exportFormat:'mp4';
  value.sceneExportTiming=['auto','max','min'].includes(value.sceneExportTiming)?value.sceneExportTiming:'auto';
  value.stageZoom=Math.max(70,Math.min(130,Number(value.stageZoom)||100));
  value.activeTab=['scene','layers','style','post','brand'].includes(value.activeTab)?value.activeTab:'scene';
  value.promptAspectRatio=['16:9','9:16','both'].includes(value.promptAspectRatio)?value.promptAspectRatio:'';
  value.promptSubtitleSize=['small','medium','large'].includes(value.promptSubtitleSize)?value.promptSubtitleSize:'medium';
  value.promptDuration=['auto','8','30','45','60','90','120','180'].includes(String(value.promptDuration))?String(value.promptDuration):'auto';
  value.promptMotionMode=['','visualdslv3','classic','scenegraph','canvas2d','asset2d'].includes(value.promptMotionMode)?value.promptMotionMode:'';
  value.batchMotionMode=['','visualdslv3','classic','scenegraph','canvas2d','asset2d'].includes(value.batchMotionMode)?value.batchMotionMode:'';
  value.promptUseVisualAssets=value.promptUseVisualAssets!==false;
  value.batchUseVisualAssets=value.batchUseVisualAssets!==false;
  value.batchV3ScientificDetail=['basic','detailed','advanced'].includes(value.batchV3ScientificDetail)?value.batchV3ScientificDetail:'detailed';
  value.outroMode=['landscape','portrait'].includes(value.outroMode)?value.outroMode:'landscape';
  value.autoVoiceAfterImport=value.autoVoiceAfterImport===true;
  return value;
 }catch{return{...defaults};}
}
export function savePreferences(value,key='lam-motion-studio.preferences.v1'){
 try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}
}
