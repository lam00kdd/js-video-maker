const mix=(a,b,t)=>a+(b-a)*t;
const distance=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y);
function midpoint(a,b){return{x:(a.x+b.x)/2,y:(a.y+b.y)/2};}
function pointLineDistance(point,a,b){const length=distance(a,b);if(length<1e-9)return distance(point,a);return Math.abs((b.y-a.y)*point.x-(b.x-a.x)*point.y+b.x*a.y-b.y*a.x)/length;}
function splitBezier(points){let row=points.map(p=>({...p})),left=[row[0]],right=[row.at(-1)];while(row.length>1){row=row.slice(1).map((point,index)=>midpoint(row[index],point));left.push(row[0]);right.unshift(row.at(-1));}return[left,right];}
function evaluate(points,t){let row=points.map(p=>({...p}));while(row.length>1)row=row.slice(1).map((point,index)=>({x:mix(row[index].x,point.x,t),y:mix(row[index].y,point.y,t)}));return row[0];}
function derivative(points,t){const degree=points.length-1,controls=points.slice(0,-1).map((p,index)=>({x:degree*(points[index+1].x-p.x),y:degree*(points[index+1].y-p.y)}));return controls.length===1?controls[0]:evaluate(controls,t);}
function flattenBezier(points,tolerance,out,depth=0,t0=0,t1=1){const chord=distance(points[0],points.at(-1)),flat=points.slice(1,-1).every(point=>pointLineDistance(point,points[0],points.at(-1))<=tolerance);if(depth>=14||(flat&&chord<=Math.max(1,tolerance*8))){out.push({t:t1,point:points.at(-1)});return;}const[left,right]=splitBezier(points),tm=(t0+t1)/2;flattenBezier(left,tolerance,out,depth+1,t0,tm);flattenBezier(right,tolerance,out,depth+1,tm,t1);}

export function pathSegments(commands,{width=1280,height=720,transform=null,tolerance=.35,connectSubpaths=false}={}){
 const map=point=>{const p={x:point.x*width,y:point.y*height};return transform?transform(p):p;};
 const segments=[];let current=null,start=null,lastSubpathEnd=null;
 const add=(kind,points,implicit=false)=>{const mapped=points.map(map),samples=[{t:0,point:mapped[0]}];if(kind==='line')samples.push({t:1,point:mapped[1]});else flattenBezier(mapped,tolerance,samples);let length=0;for(let i=1;i<samples.length;i++)length+=distance(samples[i-1].point,samples[i].point);if(length>1e-8)segments.push({kind,points:mapped,samples,length,implicit});};
 for(const command of commands||[]){if(command.op==='M'){const next=command.points[0];if(connectSubpaths&&current)add('line',[current,next],true);lastSubpathEnd=current;current=next;start=next;}else if(command.op==='L'&&current){const end=command.points[0];add('line',[current,end]);current=end;}else if(command.op==='Q'&&current){const[endControl,end]=command.points;add('quadratic',[current,endControl,end]);current=end;}else if(command.op==='C'&&current){const[c1,c2,end]=command.points;add('cubic',[current,c1,c2,end]);current=end;}else if(command.op==='Z'&&current&&start){add('line',[current,start]);current=start;}}
 return{segments,total:segments.reduce((sum,segment)=>sum+segment.length,0),lastSubpathEnd};
}

export function samplePathMetrics(metrics,progress){
 if(!metrics.segments.length)return null;const target=Math.max(0,Math.min(1,progress))*metrics.total;let remaining=target;
 for(const segment of metrics.segments){if(remaining<=segment.length||segment===metrics.segments.at(-1)){const local=Math.max(0,Math.min(1,remaining/segment.length));let low=0,high=segment.samples.length-1;while(low+1<high){const mid=(low+high)>>1;if(segment.samples[mid].t<local)low=mid;else high=mid;}const a=segment.samples[low],b=segment.samples[high],span=b.t-a.t,f=span>0?(local-a.t)/span:0,t=mix(a.t,b.t,f),point=evaluate(segment.points,t),tangent=derivative(segment.points,t);return{point,angle:Math.atan2(tangent.y,tangent.x),segment,t,progress:metrics.total?target/metrics.total:0};}remaining-=segment.length;}
 const last=metrics.segments.at(-1);return{point:last.points.at(-1),angle:0,segment:last,t:1,progress:1};
}

function partialBezier(points,t){let row=points.map(p=>({...p})),left=[row[0]];while(row.length>1){row=row.slice(1).map((point,index)=>({x:mix(row[index].x,point.x,t),y:mix(row[index].y,point.y,t)}));left.push(row[0]);}return left;}
export function tracePathProgress(ctx,commands,width,height,progress,tolerance=.35){
 const metrics=pathSegments(commands,{width,height,tolerance}),target=Math.max(0,Math.min(1,progress))*metrics.total;let remaining=target;
 for(const segment of metrics.segments){if(remaining<=0)break;const fraction=Math.min(1,remaining/segment.length),curve=partialBezier(segment.points,fraction);ctx.beginPath();ctx.moveTo(curve[0].x,curve[0].y);if(segment.kind==='line')ctx.lineTo(curve.at(-1).x,curve.at(-1).y);else if(segment.kind==='quadratic')ctx.quadraticCurveTo(curve[1].x,curve[1].y,curve[2].x,curve[2].y);else ctx.bezierCurveTo(curve[1].x,curve[1].y,curve[2].x,curve[2].y,curve[3].x,curve[3].y);ctx.stroke();remaining-=segment.length;}
}
