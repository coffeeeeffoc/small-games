export const NODES = { A:[90,160], B:[300,160], C:[510,160], D:[90,370], E:[300,370], F:[510,370] };
export const SITES = Object.fromEntries([
  ['fire','A',[150,108],'花开巷民居'], ['fire','D',[153,428],'梧桐里民居'], ['fire','F',[449,428],'河畔居民楼'],
  ['pet','B',[244,228],'云溪公园'], ['pet','A',[40,245],'花巷小院'], ['pet','F',[555,285],'河畔绿地'],
  ['power','B',[360,230],'城西配电站'], ['traffic','E',[360,395],'东街清障区']
].map(([type,node,site,label])=>[`${type}:${node}`,{type,node,site,label}]));
export function siteFor(event) {
  const node=Object.hasOwn(NODES,event.node)?event.node:'A', [x,y]=NODES[node];
  return SITES[`${event.type}:${node}`]||{type:event.type,node,site:[x+36,y+(y<300?-48:48)],label:`${node}区救援现场`};
}
export const TYPES = {
  fire: { name:'火情', seconds:8, loss:2, color:'#c95540' },
  pet: { name:'寻宠', seconds:4, loss:1, color:'#397568' },
  traffic: { name:'清障', seconds:6, loss:1, color:'#c18b31', multiplier:3 },
  power: { name:'复电', seconds:10, loss:2, color:'#696495', multiplier:2 }
};
const task = (id,type,node,at,deadline,edges=[]) => ({id,type,node,at,due:at+deadline,edges});
export const LEVELS = [
  { name:'初次救援', subtitle:'分派救援，让同伴及时赶到', hint:'点车 → 点求助地点，马上出发！也可以直接把车拖过去。', limit:44, top:6, events:[
    task('pet-1','pet','B',0,16), task('fire-1','fire','F',0,23),
    task('pet-2','pet','A',12,16), task('fire-2','fire','D',18,23)
  ] },
  { name:'先把路通开', subtitle:'一辆清障，两辆赶路', hint:'1号在清障点。让它修路，2号救火，3号寻宠。', limit:48, top:6, events:[
    task('traffic-1','traffic','E',0,48,['EF']), task('fire-1','fire','F',0,23), task('pet-1','pet','B',0,16),
    task('pet-2','pet','A',18,16), task('fire-2','fire','D',20,22)
  ] },
  { name:'双危机', subtitle:'看见捷径，也看见同伴', hint:'1号清障；2号派去救火后，选它改走「协作捷径」。', limit:52, top:2, events:[
    task('traffic-1','traffic','E',0,46,['EF']), task('fire-1','fire','F',0,22), task('pet-1','pet','B',0,16),
    task('power-1','power','B',20,27,['AB','BC']), task('fire-2','fire','A',20,20), task('pet-2','pet','F',22,15)
  ] }
];
export function create(level=0) {
  if (!LEVELS[level]) throw new Error('关卡不存在');
  return { level, tick:0, time:0, loss:0, status:'playing', log:[],
    edges:[['A','B',4],['B','C',LEVELS[level].top],['D','E',4],['E','F',4],['A','D',4],['B','E',4],['C','F',4]],
    events:LEVELS[level].events.map(e=>({...e, state:e.at===0?'active':'future', assigned:null, penalized:false})),
    cars:['E','D','A'].map((node,id)=>({id:id+1,node,edge:null,access:null,parked:null,route:[],target:null,service:0,working:false,travel:0,mode:'fast'})) };
}
export const edgeKey = (a,b) => [a,b].sort().join('');
export function multiplier(s,a,b) {
  return Math.max(1,...s.events.filter(e=>e.state==='active'&&e.edges.includes(edgeKey(a,b))).map(e=>TYPES[e.type].multiplier||1));
}
function base(s,a,b) { return s.edges.find(e=>e.includes(a)&&e.includes(b))?.[2] ?? Infinity; }
const duration = site => site.seconds ?? 1;
function entranceTime(site) {
  if(site.point) return site.roadSeconds;
  const [x,y]=NODES[site.node],horizontal=Math.abs(site.site[0]-x);
  return horizontal/(horizontal+Math.abs(site.site[1]-y));
}
function exitSeconds(s,car) {
  const site=car.access?.site||car.parked;
  if(!site) return 0;
  const progress=car.access?(car.access.direction==='in'?car.access.done:duration(site)-car.access.done):duration(site);
  return site.point?Math.min(progress,site.roadSeconds)*multiplier(s,...site.road)+Math.max(0,progress-site.roadSeconds):progress;
}
function parkingSite(s,car,point,mode) {
  const from=car.edge?.to||car.node, candidates=[];
  for(const [a,b,cost] of s.edges) {
    const start=NODES[a],end=NODES[b],dx=end[0]-start[0],dy=end[1]-start[1];
    const f=Math.max(0,Math.min(1,((point[0]-start[0])*dx+(point[1]-start[1])*dy)/(dx*dx+dy*dy)));
    const entry=[start[0]+dx*f,start[1]+dy*f],distance=Math.hypot(point[0]-entry[0],point[1]-entry[1]);
    for(const [node,fraction] of [[a,f],[b,1-f]]) {
      const path=shortest(s,from,node,mode==='short'),roadSeconds=cost*fraction;
      const seconds=roadSeconds+distance/100;
      const score=path.slice(1).reduce((v,n,i)=>v+base(s,path[i],n)*(mode==='short'?1:multiplier(s,path[i],n)),0)+roadSeconds*(mode==='short'?1:multiplier(s,a,b));
      candidates.push({node,point,site:point,entry,road:[a,b],roadSeconds,seconds,distance,score,label:'自由停靠点'});
    }
  }
  // Use the nearest road entrance, then choose the cheaper end of that road.
  return candidates.sort((a,b)=>a.distance-b.distance||a.score-b.score)[0];
}
export function shortest(s,from,to,normal=false) {
  const dist=Object.fromEntries(Object.keys(NODES).map(n=>[n,Infinity])), prev={}, pending=new Set(Object.keys(NODES));
  if (!pending.has(from)||!pending.has(to)) return [];
  dist[from]=0;
  while(pending.size) {
    const u=[...pending].sort((a,b)=>dist[a]-dist[b])[0];
    if (!Number.isFinite(dist[u])) break;
    pending.delete(u); if(u===to) break;
    for(const [a,b,cost] of s.edges) {
      const v=a===u?b:b===u?a:null;
      if(!v||!pending.has(v)) continue;
      const d=dist[u]+cost*(normal?1:multiplier(s,u,v));
      // Equal-cost ties keep the later route: D→E is shared by both departures on this map.
      if(d<=dist[v]) {dist[v]=d;prev[v]=u;}
    }
  }
  if(!Number.isFinite(dist[to])) return [];
  const out=[to]; while(out[0]!==from) out.unshift(prev[out[0]]); return out;
}
export function routes(s,car,event) {
  if(!car||!event||car.access&&!car.access.site.point) return [];
  const from=car.edge?.to||car.node;
  const prefix=car.edge?(base(s,car.edge.from,car.edge.to)-car.edge.done)*multiplier(s,car.edge.from,car.edge.to):0;
  const choices=['fast','short'].map(mode=>{
    const path=shortest(s,from,event.node,mode==='short');
    const seconds=prefix+exitSeconds(s,car)+path.slice(1).reduce((v,n,i)=>v+base(s,path[i],n)*multiplier(s,path[i],n),0)+(event.point?event.roadSeconds*multiplier(s,...event.road)+event.seconds-event.roadSeconds:event.type?1:0)+(TYPES[event.type]?.seconds||0);
    return {mode,path,seconds};
  }).filter(r=>r.path.length);
  return choices.filter((r,i)=>!i||r.path.join('')!==choices[0].path.join(''));
}
export function dispatch(s,id,target,mode='fast') {
  const car=s.cars.find(c=>c.id===id), event=s.events.find(e=>e.id===target);
  const coordinate=target!==null&&typeof target==='object';
  if(coordinate&&(!Array.isArray(target.point)||target.point.length!==2||!Number.isFinite(target.point[0])||!Number.isFinite(target.point[1])||target.point[0]<0||target.point[0]>600||target.point[1]<0||target.point[1]>540)) return {ok:false,message:'停靠坐标无效'};
  if(car?.access&&!car.access.site.point) return {ok:false,message:`${id}号车正在${car.access.direction==='in'?'驶入':'驶出'}现场，请稍候`};
  const destination=event||(coordinate&&car?parkingSite(s,car,[...target.point],mode):typeof target==='string'&&Object.hasOwn(NODES,target)?{node:target}:null);
  if(s.status!=='playing'||!car||!destination||event&&event.state!=='active') return {ok:false,message:'这个地点当前不可派遣'};
  if(car.working) return {ok:false,message:`现场处理中，已处理 ${Math.floor(car.service)} 秒，请选其他车辆`};
  if(event?.assigned&&event.assigned!==id) return {ok:false,message:`已有${event.assigned}号车处理，请选择其他地点`};
  const route=routes(s,car,destination).find(r=>r.mode===mode);
  if(!route) return {ok:false,message:'这条路线不可用'};
  const old=s.events.find(e=>e.id===car.target); if(old) old.assigned=null;
  car.target=coordinate?destination:target;car.route=route.path.slice(1);car.service=0;car.mode=mode;if(event)event.assigned=id;
  if(car.access) {if(car.access.direction==='in')car.access={direction:'out',site:car.access.site,done:duration(car.access.site)-car.access.done};}
  else if(car.parked) car.access={direction:'out',site:car.parked,done:0};
  else arrive(car,event);
  s.log.push({at:s.time,kind:'dispatch',car:id,event:coordinate?{point:[...destination.point]}:target,mode});
  return {ok:true,message:coordinate?`${id}号车正前往停靠点`:`${id}号车已派往 ${destination.node} 区${event?' · '+TYPES[event.type].name:'待命'}`};
}
function arrive(car,event) {
  if(car.edge||car.route.length) return;
  if(event?.state==='active'&&car.node===event.node) car.access={direction:'in',site:siteFor(event),done:0};
  else if(car.target?.point) {
    if(duration(car.target)===0) {car.parked=car.target;car.target=null;}
    else car.access={direction:'in',site:car.target,done:0};
  }
  else car.target=null;
}
function release(s,event) {
  const car=s.cars.find(c=>c.target===event.id);
  if(car) {car.target=null;car.route=[];car.working=false;car.service=0;}
  event.assigned=null;
}
function penalize(s,e) {
  if(e.penalized) return;
  e.penalized=true;s.loss+=TYPES[e.type].loss;
  s.log.push({at:s.time,kind:'miss',event:e.id});
  if(!e.edges.length) {e.state='missed';release(s,e);}
}
export function step(s) {
  if(s.status!=='playing') return;
  s.tick++;s.time=s.tick/10;
  const completed=[];
  for(const car of s.cars) {
    const event=s.events.find(e=>e.id===car.target);
    if(car.access) {
      car.travel+=.1;
      const access=car.access,site=access.site,total=duration(site);
      if(site.point) {
        const boundary=access.direction==='in'?site.roadSeconds:total-site.roadSeconds;
        const roadFirst=access.direction==='in',slow=multiplier(s,...site.road);
        const first=roadFirst?slow:1,second=roadFirst?1:slow;
        const timeToBoundary=Math.max(0,boundary-access.done)*first;
        access.done+=access.done<boundary?Math.min(.1,timeToBoundary)/first+Math.max(0,.1-timeToBoundary)/second:.1/second;
      } else access.done=Math.round((access.done+.1)*10)/10;
      if(access.done+1e-8>=total) {
        const {direction,site}=car.access;car.access=null;
        car.parked=direction==='in'?site:null;
        if(direction==='in') {car.working=!!event&&event.state==='active';if(site.point)car.target=null;}
        else arrive(car,event);
      }
      continue;
    }
    if(car.working&&car.parked&&event) {
      car.service=Math.round((car.service+.1)*10)/10;
      if(car.service>=TYPES[event.type].seconds) completed.push(event);
      continue;
    }
    if(!car.edge&&car.route.length) car.edge={from:car.node,to:car.route.shift(),done:0};
    if(car.edge) {
      car.travel+=.1;
      car.edge.done+=.1/multiplier(s,car.edge.from,car.edge.to);
      if(car.edge.done+1e-8>=base(s,car.edge.from,car.edge.to)) {
        car.node=car.edge.to;car.edge=null;
        arrive(car,event);
      }
    }
  }
  for(const e of completed) {e.state='done';e.finished=s.time;s.log.push({at:s.time,kind:'done',event:e.id});release(s,e);}
  for(const e of s.events) {
    if(e.state==='future'&&s.time>=e.at) e.state='active';
    if(e.state==='active'&&s.time>=e.due&&!e.penalized) penalize(s,e);
  }
  if(s.time>=LEVELS[s.level].limit) for(const e of s.events) if(e.state==='active') penalize(s,e);
  if(s.loss>=3) s.status='lost';
  else if(s.events.every(e=>e.state==='done'||e.state==='missed')||s.time>=LEVELS[s.level].limit) s.status='won';
}
export function position(s,car) {
  if(car.access) {
    const {site,done,direction}=car.access, a=NODES[site.node], b=site.site;
    if(site.point) {
      const progress=Math.max(0,Math.min(duration(site),direction==='in'?done:duration(site)-done));
      const onRoad=progress<site.roadSeconds,start=onRoad?a:site.entry,end=onRoad?site.entry:b;
      const length=onRoad?site.roadSeconds:duration(site)-site.roadSeconds;
      const f=length?(progress-(onRoad?0:site.roadSeconds))/length:1;
      return [start[0]+(end[0]-start[0])*f,start[1]+(end[1]-start[1])*f];
    }
    const horizontal=Math.abs(b[0]-a[0]),vertical=Math.abs(b[1]-a[1]);
    const distance=(horizontal+vertical)*(direction==='in'?done:1-done);
    return distance<=horizontal?[a[0]+Math.sign(b[0]-a[0])*distance,a[1]]:[b[0],a[1]+Math.sign(b[1]-a[1])*(distance-horizontal)];
  }
  if(car.parked) return car.parked.site;
  if(!car.edge) return NODES[car.node];
  const a=NODES[car.edge.from],b=NODES[car.edge.to],f=Math.min(1,car.edge.done/base(s,car.edge.from,car.edge.to));
  return [a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];
}
// Coordinates for the pending road route and its entrance/exit, including free parking.
export function routePoints(s,car,path=[car.edge?.to||car.node,...car.route]) {
  const points=[position(s,car)],access=car.access,parked=access?.site||car.parked;
  if(!car.target&&!car.edge&&!access||car.working)return points;
  const bend=site=>site.entry||[site.site[0],NODES[site.node][1]];
  if(access?.direction==='in') {
    const site=access.site;
    if(access.done<entranceTime(site))points.push(bend(site));
    points.push(site.site);return points;
  }
  if(parked) {
    const site=parked,progress=access?duration(site)-access.done:duration(site);
    if(progress>entranceTime(site))points.push(bend(site));
  }
  points.push(...path.map(n=>NODES[n]));
  const event=s.events.find(e=>e.id===car.target),site=car.target?.point?car.target:event?siteFor(event):null;
  if(site&&!car.working)points.push(bend(site),site.site);
  return points;
}
export function runUntil(s,time) { while(s.time+1e-8<time&&s.status==='playing') step(s); return s; }
