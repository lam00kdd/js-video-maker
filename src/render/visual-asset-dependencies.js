export function collectVisualAssetDependencies(assetId,sources=[]){
  const references=[],errors=[];let visitedNodes=0,complete=true;
  for(const source of sources){const seen=new WeakSet(),stack=[{value:source.value,path:source.source||'app-managed record'}];while(stack.length){const current=stack.pop(),value=current.value;if(!value||typeof value!=='object')continue;if(seen.has(value))continue;seen.add(value);visitedNodes++;if(visitedNodes>250_000){complete=false;errors.push('dependency_scan_budget_exceeded');break;}if(value.asset_id===assetId)references.push({source:source.source||'app-managed record',path:`${current.path}.asset_id`,kind:current.path.endsWith('.geometry')?'visual_dsl_v3_image':'asset_reference'});for(const[key,child]of Object.entries(value))if(child&&typeof child==='object')stack.push({value:child,path:`${current.path}.${key}`});}}
  return{asset_id:assetId,references,complete,errors,scanned_records:sources.length};
}
