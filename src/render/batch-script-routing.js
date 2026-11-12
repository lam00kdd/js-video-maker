const videoTargets=Object.freeze({landscape:Object.freeze(['landscape']),portrait:Object.freeze(['portrait']),both:Object.freeze(['landscape','portrait'])});

export function identifyBatchScript(data){
  const marked=data&&typeof data==='object'&&!Array.isArray(data)&&Object.hasOwn(data,'visual_dsl_version'),version=marked?data.visual_dsl_version:undefined;
  if(version===3)return'visualdslv3';
  if(version===1||version===2||!marked)return'legacy';
  throw new Error(`Không hỗ trợ visual_dsl_version ${String(version)}; batch chỉ nhận legacy v1/v2 hoặc Visual DSL v3.`);
}

export function sanitizeBatchFilenameBase(fileName){
  const source=String(fileName||'video').replace(/\.json$/i,'').trim();
  const invalid='<>:"/|?*'+String.fromCharCode(92);
  return [...source].map(char=>invalid.includes(char)?'-':char).join('').replace(/^\.+/,'').replace(/[. ]+$/,'').trim()||'video';
}

export function resolveBatchAspectTargets(parsed,requestedRatios){
  const requested=videoTargets[requestedRatios]||videoTargets.both;
  if(parsed.motionMode==='visualdslv3'){
    const available=videoTargets[parsed.visualDslV3.aspect_ratio==='16:9'?'landscape':parsed.visualDslV3.aspect_ratio==='9:16'?'portrait':'both'];
    return available.map(key=>key==='portrait'?['portrait',true,'9:16']:['landscape',false,'16:9']);
  }
  if(parsed.motionMode==='asset2d'&&requested.includes('portrait')&&!requested.includes('landscape'))throw new Error('Asset Animation 2D chỉ xuất 16:9; hãy chọn 16:9 hoặc cả hai.');
  const supported=parsed.motionMode==='asset2d'?requested.filter(key=>key==='landscape'):requested;
  return supported.map(key=>key==='portrait'?['portrait',true,'9:16']:['landscape',false,'16:9']);
}

export function planBatchOutputs(parsed,requestedRatios,extension,usedNames=new Set()){
  const targets=resolveBatchAspectTargets(parsed,requestedRatios);
  if(!targets.length)throw new Error('Kịch bản không có aspect ratio phù hợp để xuất.');
  const names=targets.map(([, ,ratio])=>`${sanitizeBatchFilenameBase(parsed.base)}-${ratio.replace(':','x')}.${extension}`);
  for(const name of names)if(usedNames.has(name.toLocaleLowerCase()))throw new Error(`Trùng tên đầu ra với một kịch bản khác trong thư mục: ${name}`);
  for(const name of names)usedNames.add(name.toLocaleLowerCase());
  return{targets,names};
}

export function selectBatchProjectAspect(project,aspect){
  if(!['landscape','portrait'].includes(aspect))throw new Error(`Aspect batch không hợp lệ: ${aspect}`);
  const value=project?.variants?.[aspect],scenes=Array.isArray(value)?value:value?.scenes;
  if(!Array.isArray(scenes)||!scenes.length)throw new Error(`Project không có scene đã staging cho biến thể ${aspect==='portrait'?'9:16':'16:9'}.`);
  const portrait=aspect==='portrait';
  return{...project,scenes,width:portrait?720:1920,height:portrait?1280:1080};
}
