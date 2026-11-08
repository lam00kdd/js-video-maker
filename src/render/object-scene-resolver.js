import { normalizeObjectScene } from './object-scene-schema.js';
import { pathSegments,samplePathMetrics } from './vector-path.js';
import { camFollowerLiftAtAngle } from './cam-follower-profile.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const mix=(a,b,t)=>a+(b-a)*t;
const ease=(name,t)=>{t=clamp(t,0,1);if(name==='linear')return t;if(name==='ease_in')return t*t;if(name==='ease_out')return 1-(1-t)*(1-t);if(name==='spring')return 1-Math.exp(-7*t)*Math.cos(10*t);return t*t*(3-2*t);};
const identity=[1,0,0,1,0,0];
function multiply(a,b){return[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
function inverse(m){const det=m[0]*m[3]-m[1]*m[2];if(Math.abs(det)<1e-10)throw new Error('Transform cha không thể nghịch đảo.');return[m[3]/det,-m[1]/det,-m[2]/det,m[0]/det,(m[2]*m[5]-m[3]*m[4])/det,(m[1]*m[4]-m[0]*m[5])/det];}
function apply(m,p){return{x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]};}
function transformMatrix(transform,width,height){const angle=transform.rotation||0,scale=transform.scale??1,c=Math.cos(angle)*scale,s=Math.sin(angle)*scale;return[c,s,-s,c,(transform.x||0)*width,(transform.y||0)*height];}
function bezierPoint(points,t){const row=points.map(p=>({...p}));let work=row;while(work.length>1)work=work.slice(1).map((p,index)=>({x:mix(work[index].x,p.x,t),y:mix(work[index].y,p.y,t)}));return work[0];}
function bezierTangent(points,t){const n=points.length-1,derivative=points.slice(0,-1).map((p,index)=>({x:n*(points[index+1].x-p.x),y:n*(points[index+1].y-p.y)}));return derivative.length===1?derivative[0]:bezierPoint(derivative,t);}
function baseState(object,time){
 const state={...object,transform:{...object.transform},properties:{...object.properties},style:{...object.style},reveal:object.actions.some(a=>a.type==='draw_on')?0:1,drawProgress:object.actions.some(a=>a.type==='draw_path')?0:1,highlight:null,energized:null};
 const first=type=>object.actions.find(action=>action.type===type),firstVisibility=object.actions.find(action=>action.type==='show'||action.type==='hide'),fade=first('fade'),move=first('move'),rotate=first('rotate'),scale=first('scale');
 if(firstVisibility?.type==='show')state.transform.opacity=0;if(fade?.params.from!=null)state.transform.opacity=fade.params.from;if(move?.params.from){state.transform.x=move.params.from.x;state.transform.y=move.params.from.y;}if(rotate?.params.from!=null)state.transform.rotation=rotate.params.from;if(scale?.params.from!=null)state.transform.scale=scale.params.from;
 for(const action of object.actions){const start=action.start_seconds,end=start+action.duration_seconds;if(time<start)continue;const progress=ease(action.easing,(time-start)/action.duration_seconds),params=action.params;
  if(action.type==='move'){const from=params.from||{x:state.transform.x,y:state.transform.y};state.transform.x=time>=end?params.to.x:mix(from.x,params.to.x,progress);state.transform.y=time>=end?params.to.y:mix(from.y,params.to.y,progress);}
  else if(action.type==='rotate')state.transform.rotation=time>=end?(params.to??state.transform.rotation):mix(params.from??state.transform.rotation,params.to,progress);
  else if(action.type==='scale')state.transform.scale=time>=end?(params.to??state.transform.scale):mix(params.from??state.transform.scale,params.to,progress);
  else if(action.type==='fade')state.transform.opacity=time>=end?params.to:mix(params.from??state.transform.opacity,params.to,progress);
  else if(action.type==='draw_on')state.reveal=time>=end?1:progress;
  else if(action.type==='draw_path')state.drawProgress=time>=end?1:clamp(progress,0,1);
  else if(action.type==='pulse'){const wave=(Math.sin((time-start)*params.frequency*2*Math.PI)+1)/2;state.transform.scale*=1+(params.to-1)*wave*progress;}
  else if(action.type==='show')state.transform.opacity=time>=end?1:progress;
  else if(action.type==='hide')state.transform.opacity=time>=end?0:1-progress;
  else if(action.type==='set_text'&&time>=start)state.properties.content=params.content;
  else if(action.type==='highlight'&&time<end){const envelope=Math.sin(progress*Math.PI),pulse=.35+.65*(.5+.5*Math.sin(progress*4*Math.PI));state.highlight={color:params.color,amount:envelope*pulse};}
  else if(action.type==='set_energized'){state.energized={state:params.state,on_color:params.on_color,off_color:params.off_color};if(object.type==='asset'){state.properties.energized_state=params.state;state.properties.on_color=params.on_color;state.properties.off_color=params.off_color;}else state.style.stroke=params.state==='on'?params.on_color:params.off_color;}
 }
 return state;
}
function loopProgress(action,time){const elapsed=Math.max(0,(time-action.start_seconds)/action.duration_seconds);if(action.loop==='repeat')return elapsed%1;if(action.loop==='ping_pong'){const cycle=elapsed%2;return cycle<=1?cycle:2-cycle;}return clamp(elapsed,0,1);}
function resolvedTree(objects,time,width,height,parentMatrix=identity,parentId=null,entries=new Map()){
 const result=objects.map(object=>{const state=baseState(object,time),world=multiply(parentMatrix,transformMatrix(state.transform,width,height));entries.set(state.id,{state,source:object,parentMatrix,world,parentId,root:parentId==null});if(state.children)state.children=resolvedTree(state.children,time,width,height,world,state.id,entries).objects;return state;});return{objects:result,entries};
}
function refreshWorldMatrices(objects,entries,width,height,parentMatrix=identity,parentId=null){for(const state of objects){const entry=entries.get(state.id),world=multiply(parentMatrix,transformMatrix(state.transform,width,height));if(entry){entry.parentMatrix=parentMatrix;entry.world=world;entry.parentId=parentId;}if(state.children)refreshWorldMatrices(state.children,entries,width,height,world,state.id);}}
export function resolveObjectScene(sceneGraph,time,duration=8,{width=1280,height=720}={}){
 const graph=normalizeObjectScene(sceneGraph,duration),t=clamp(Number(time)||0,0,duration),resolved=resolvedTree(graph.objects,t,width,height),entries=resolved.entries;
 for(const mechanism of graph.mechanisms||[]){const{params,timeline,bindings,local_geometry_space:localGeometrySpace='normalized'}=mechanism;let angle=params.initial_angle;for(const control of timeline){if(t<control.start_seconds)break;if(control.mode==='run')angle+=params.rotational_speed*Math.min(control.duration_seconds,Math.max(0,t-control.start_seconds));if(t<=control.start_seconds+control.duration_seconds)break;}if(!timeline.length)angle+=params.rotational_speed*t;
  if(mechanism.type==='gear_pair'){
   const unitScale=Math.min(width,height),driverCenter={x:params.driver_center.x*width,y:params.driver_center.y*height},distance=params.module*(params.driver_teeth+params.driven_teeth)*unitScale/2,drivenCenter={x:driverCenter.x+distance*Math.cos(params.center_angle),y:driverCenter.y+distance*Math.sin(params.center_angle)},driver=entries.get(bindings.driver)?.state,driven=entries.get(bindings.driven)?.state,drivenAngle=params.center_angle+Math.PI-Math.PI/params.driven_teeth-(params.driver_teeth/params.driven_teeth)*(angle-params.initial_angle);
   if(driver){driver.transform.x=driverCenter.x/width;driver.transform.y=driverCenter.y/height;driver.transform.rotation=angle;driver.parametric_space=localGeometrySpace;}
   if(driven){driven.transform.x=drivenCenter.x/width;driven.transform.y=drivenCenter.y/height;driven.transform.rotation=drivenAngle;driven.parametric_space=localGeometrySpace;}
   continue;
  }
  if(mechanism.type==='cam_follower'){
   const cam=entries.get(bindings.cam)?.state,follower=entries.get(bindings.follower)?.state,unit=Math.min(width,height),center={x:params.cam_center.x*width,y:params.cam_center.y*height},{lift}=camFollowerLiftAtAngle(params,angle);
   const ux=params.follower_axis.x*width,uy=params.follower_axis.y*height,length=Math.hypot(ux,uy),axis={x:ux/length,y:uy/length};if(cam){cam.transform.x=center.x/width;cam.transform.y=center.y/height;cam.transform.rotation=angle;cam.parametric_space='isotropic';}if(follower){const origin=follower.transform,base={x:origin.x*width,y:origin.y*height};follower.transform.x=(base.x+axis.x*lift*unit)/width;follower.transform.y=(base.y+axis.y*lift*unit)/height;follower.parametric_space='isotropic';follower.mechanism_lift=lift;follower.mechanism_axis=axis;}
   continue;
  }
  const ux=params.cylinder_axis.x*width,uy=params.cylinder_axis.y*height,axisLength=Math.hypot(ux,uy),u={x:ux/axisLength,y:uy/axisLength},unitScale=Math.min(width,height),radius=params.crank_radius*unitScale,rodLength=params.connecting_rod_length*unitScale,center={x:params.crank_center.x*width,y:params.crank_center.y*height},pin={x:center.x+radius*Math.cos(angle),y:center.y+radius*Math.sin(angle)},delta={x:pin.x-center.x,y:pin.y-center.y},projection=delta.x*u.x+delta.y*u.y,cross=delta.x*u.y-delta.y*u.x,root=Math.sqrt(Math.max(0,rodLength*rodLength-cross*cross)),sliderDistance=projection+root,piston={x:center.x+u.x*sliderDistance,y:center.y+u.y*sliderDistance},rodAngle=Math.atan2(piston.y-pin.y,piston.x-pin.x),crank=entries.get(bindings.crank)?.state,connectingRod=entries.get(bindings.connecting_rod)?.state,slider=entries.get(bindings.piston)?.state,localGeometryUnit=localGeometrySpace==='isotropic'?unitScale:width;if(crank){crank.transform.x=center.x/width;crank.transform.y=center.y/height;crank.transform.rotation=angle;crank.parametric_space=localGeometrySpace;}if(connectingRod){connectingRod.transform.x=pin.x/width;connectingRod.transform.y=pin.y/height;connectingRod.transform.rotation=rodAngle;connectingRod.geometry.start={x:0,y:0};connectingRod.geometry.end={x:rodLength/localGeometryUnit,y:0};connectingRod.parametric_space=localGeometrySpace;}if(slider){slider.transform.x=piston.x/width;slider.transform.y=piston.y/height;slider.transform.rotation=Math.atan2(u.y,u.x)+Math.PI/2;slider.parametric_space=localGeometrySpace;}}
 refreshWorldMatrices(resolved.objects,entries,width,height);for(const entry of entries.values())for(const action of entry.source.actions){if(action.type!=='follow_path'||t<action.start_seconds)continue;const path=entries.get(action.params.path_id);if(!path)continue;const progress=ease(action.easing,loopProgress(action,t)),matrix=path.world,metrics=pathSegments(path.state.geometry.commands,{width,height,transform:point=>apply(matrix,point),connectSubpaths:true});const sample=samplePathMetrics(metrics,progress);if(!sample)continue;const local=apply(inverse(entry.parentMatrix),sample.point);entry.state.transform.x=local.x/width;entry.state.transform.y=local.y/height;if(action.params.orient_to_path)entry.state.transform.rotation=sample.angle-Math.atan2(entry.parentMatrix[1],entry.parentMatrix[0]);}
 return{...graph,objects:resolved.objects};
}
