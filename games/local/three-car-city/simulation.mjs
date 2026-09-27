export const NODES = { A:[90,160], B:[300,160], C:[510,160], D:[90,370], E:[300,370], F:[510,370] };
export const TYPES = {
  fire: { name:'火情', seconds:8, loss:2, color:'#c95540' },
  pet: { name:'寻宠', seconds:4, loss:1, color:'#397568' },
  traffic: { name:'清障', seconds:6, loss:1, color:'#c18b31', multiplier:3 },
  power: { name:'复电', seconds:10, loss:2, color:'#696495', multiplier:2 }
};
const task = (id,type,node,at,deadline,edges=[]) => ({id,type,node,at,due:at+deadline,edges});
export const LEVELS = [
  { name:'初次救援', subtitle:'分派救援，让同伴及时赶到', hint:'点车 → 点求助地点，马上出发！也可以直接把车拖过去。', limit:44, top:6, events:[
    task('pet-1','pet','B',0,14), task('fire-1','fire','F',0,20),
    task('pet-2','pet','A',12,14), task('fire-2','fire','D',18,20)
  ] },
  { name:'先把路通开', subtitle:'一辆清障，两辆赶路', hint:'1号在清障点。让它修路，2号救火，3号寻宠。', limit:48, top:6, events:[
    task('traffic-1','traffic','E',0,48,['EF']), task('fire-1','fire','F',0,22), task('pet-1','pet','B',0,14),
    task('pet-2','pet','A',18,14), task('fire-2','fire','D',20,19)
  ] },
  { name:'双危机', subtitle:'看见捷径，也看见同伴', hint:'1号清障；2号派去救火后，选它改走「协作捷径」。', limit:52, top:2, events:[
    task('traffic-1','traffic','E',0,46,['EF']), task('fire-1','fire','F',0,20), task('pet-1','pet','B',0,14),
    task('power-1','power','B',20,25,['AB','BC']), task('fire-2','fire','A',20,17), task('pet-2','pet','F',22,13)
  ] }
];
export function create(level=0) {
  if (!LEVELS[level]) throw new Error('关卡不存在');
  return { level, tick:0, time:0, loss:0, status:'playing', log:[],
    edges:[['A','B',4],['B','C',LEVELS[level].top],['D','E',4],['E','F',4],['A','D',4],['B','E',4],['C','F',4]],
    events:LEVELS[level].events.map(e=>({...e, state:e.at===0?'active':'future', assigned:null, penalized:false})),
    cars:['E','D','A'].map((node,id)=>({id:id+1,node,edge:null,route:[],target:null,service:0,working:false,travel:0,mode:'fast'})) };
}
export const edgeKey = (a,b) => [a,b].sort().join('');
export function multiplier(s,a,b) {
  return Math.max(1,...s.events.filter(e=>e.state==='active'&&e.edges.includes(edgeKey(a,b))).map(e=>TYPES[e.type].multiplier||1));
}
function base(s,a,b) { return s.edges.find(e=>e.includes(a)&&e.includes(b))?.[2] ?? Infinity; }
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
  if(!car||!event) return [];
  const from=car.edge?.to||car.node;
  const prefix=car.edge?(base(s,car.edge.from,car.edge.to)-car.edge.done)*multiplier(s,car.edge.from,car.edge.to):0;
  const choices=['fast','short'].map(mode=>{
    const path=shortest(s,from,event.node,mode==='short');
    const seconds=prefix+path.slice(1).reduce((v,n,i)=>v+base(s,path[i],n)*multiplier(s,path[i],n),0)+(TYPES[event.type]?.seconds||0);
    return {mode,path,seconds};
  }).filter(r=>r.path.length);
  return choices.filter((r,i)=>!i||r.path.join('')!==choices[0].path.join(''));
}
export function dispatch(s,id,target,mode='fast') {
  const car=s.cars.find(c=>c.id===id), event=s.events.find(e=>e.id===target);
  const destination=event||(Object.hasOwn(NODES,target)?{node:target}:null);
  if(s.status!=='playing'||!car||!destination||event&&event.state!=='active') return {ok:false,message:'这个地点当前不可派遣'};
  if(car.working) return {ok:false,message:`处理中，还需 ${Math.ceil(TYPES[s.events.find(e=>e.id===car.target).type].seconds-car.service)} 秒`};
  if(event?.assigned&&event.assigned!==id) return {ok:false,message:`已有${event.assigned}号车处理，请选择其他地点`};
  const route=routes(s,car,destination).find(r=>r.mode===mode);
  if(!route) return {ok:false,message:'这条路线不可用'};
  const old=s.events.find(e=>e.id===car.target); if(old) old.assigned=null;
  car.target=target;car.route=route.path.slice(1);car.service=0;car.mode=mode;if(event)event.assigned=id;
  car.working=!!event&&!car.edge&&!car.route.length&&car.node===event.node;
  if(!event&&!car.edge&&!car.route.length)car.target=null;
  s.log.push({at:s.time,kind:'dispatch',car:id,event:target,mode});
  return {ok:true,message:`${id}号车已派往 ${destination.node} 区${event?' · '+TYPES[event.type].name:'待命'}`};
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
    if(car.working&&event) {
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
        if(!car.route.length&&event&&event.state==='active'&&car.node===event.node) car.working=true;
        if(!car.route.length&&!event)car.target=null;
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
  if(!car.edge) return NODES[car.node];
  const a=NODES[car.edge.from],b=NODES[car.edge.to],f=Math.min(1,car.edge.done/base(s,car.edge.from,car.edge.to));
  return [a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];
}
export function runUntil(s,time) { while(s.time+1e-8<time&&s.status==='playing') step(s); return s; }
