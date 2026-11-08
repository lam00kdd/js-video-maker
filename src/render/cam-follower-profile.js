const TAU=Math.PI*2;
const mod1=value=>((value%1)+1)%1;

export function camFollowerLiftAtAngle(params,angle){
 const profile=params.profile,phase=mod1(mod1(angle/TAU)+profile.phase_offset),riseEnd=profile.rise,highEnd=riseEnd+profile.high_dwell,returnEnd=highEnd+profile.return;
 if(phase<riseEnd){const u=phase/riseEnd;return{phase,lift:params.max_lift*(1-Math.cos(Math.PI*u))/2,derivative:params.max_lift*Math.PI/(2*riseEnd*TAU)*Math.sin(Math.PI*u)};}
 if(phase<highEnd)return{phase,lift:params.max_lift,derivative:0};
 if(phase<returnEnd){const u=(phase-highEnd)/profile.return;return{phase,lift:params.max_lift*(1+Math.cos(Math.PI*u))/2,derivative:-params.max_lift*Math.PI/(2*profile.return*TAU)*Math.sin(Math.PI*u)};}
 return{phase,lift:0,derivative:0};
}

// Envelope of the prescribed translating flat face. derivative is d(lift)/d(cam angle).
export function buildFlatFollowerCamOutline(params,axisAngle,samples=96){
 const points=[];
 for(let i=0;i<samples;i++){
  const angle=TAU*i/samples,{lift,derivative}=camFollowerLiftAtAngle(params,angle),distance=params.base_radius+lift,normalAngle=axisAngle-angle,c=Math.cos(normalAngle),s=Math.sin(normalAngle);
  points.push({x:distance*c+derivative*s,y:distance*s-derivative*c});
 }
 return points;
}

export function flatFollowerSupport(points,normalAngle){
 const nx=Math.cos(normalAngle),ny=Math.sin(normalAngle);
 return Math.max(...points.map(point=>point.x*nx+point.y*ny));
}
