export const GUESTS = [
  {name:'甜点师', low:2, high:4, red:7, icon:'♧', active:'端着蛋糕', idle:'品尝甜点'},
  {name:'灵异主播', low:4, high:6, red:9, icon:'▣', active:'自拍中', idle:'镜头没开'},
  {name:'侦探', low:5, high:7, red:10, icon:'◈', active:'手电照明', idle:'观察镜框'}
];
export const GHOSTS = [
  {name:'镜框鬼', power:2, cooldown:14}, {name:'床单鬼', power:4, cooldown:18}, {name:'管道鬼', power:2, cooldown:20}
];
export const LEVELS = [
  {name:'第一夜 · 怪可爱的', tag:'把惊吓拍成好评', order:[0,1,2], initial:[0,1.8,3.2], periods:[24,24,20], offsets:[0,0,0], windows:[7,8,8], target:22, hint:'主播正在自拍。镜框鬼现在出场，比等8秒更上镜。'},
  {name:'第二夜 · 隔墙有鬼', tag:'甜点师住进了中间', order:[1,0,2], initial:[3.6,3.4,5.4], periods:[20,22,18], offsets:[10,9,4], windows:[7,7,8], target:25, hint:'甜点师搬到中层。管道会同时吓到上下邻居，先看预演。'},
  {name:'第三夜 · 午夜投诉', tag:'先把客人的箱子关上', order:[2,1,0], initial:[7.8,5.2,6.2], periods:[18,20,16], offsets:[9,8,0], windows:[6,7,8], target:28, hint:'甜点师在收拾行李！先按安抚铃，再点他的房间。'}
];
export const DT = 0.05;
export function createGame(level = 0) {
  if (!Number.isInteger(level) || !LEVELS[level]) throw new RangeError('Unknown night');
  return {level, t:0, status:'playing', reason:'', guests:LEVELS[level].initial.map(fear=>({fear,happy:0,packing:0})), ghosts:GHOSTS.map(()=>({ready:0,job:null})), bell:0, sequence:0, events:[], actions:[]};
}
export function activeAt(s, guest, time=s.t) {
  const l=LEVELS[s.level]; return ((time+l.offsets[guest]) % l.periods[guest]) < l.windows[guest];
}
export function nextChange(s, guest) {
  const l=LEVELS[s.level], phase=(s.t+l.offsets[guest])%l.periods[guest];
  return activeAt(s,guest) ? l.windows[guest]-phase : l.periods[guest]-phase;
}
export const comfortable = (s,i) => s.guests[i].fear >= GUESTS[i].low-1e-8 && s.guests[i].fear <= GUESTS[i].high+1e-8;
function emit(s, kind, detail={}) { s.events.push({id:++s.sequence,t:s.t,kind,...detail}); if(s.events.length>80) s.events.shift(); }
export function effects(s, ghost, target, time=s.t) {
  const order=LEVELS[s.level].order, floor=order.indexOf(target);
  return order.flatMap((id,index)=>{
    if(id!==target && (ghost!==2 || Math.abs(index-floor)!==1)) return [];
    let amount=id===target ? GHOSTS[ghost].power : 1;
    if(id===2 && ghost===1 && activeAt(s,id,time)) amount=1;
    if(id===2 && ghost===0 && !activeAt(s,id,time)) amount=3;
    if(id<2 && activeAt(s,id,time)) amount+=2;
    return [{guest:id,amount,active:activeAt(s,id,time),spill:id!==target}];
  });
}
function scare(s, ghost, target) {
  const hits=effects(s,ghost,target);
  for(const h of hits) s.guests[h.guest].fear+=h.amount;
  s.ghosts[ghost].job=null; s.ghosts[ghost].ready=s.t+GHOSTS[ghost].cooldown;
  emit(s,'scare',{ghost,target,hits});
}
export function command(s, kind, target, delay=0) {
  if(s.status!=='playing') return false;
  if(kind==='cancel') {
    if(!Number.isInteger(target) || !s.ghosts[target]?.job) return false;
    s.ghosts[target].job=null; emit(s,'cancel',{ghost:target});
  } else {
    if(!Number.isInteger(target)||!s.guests[target]||![0,4,8].includes(delay)) return false;
    if(kind==='bell') {
      if(s.bell>s.t+1e-8) return false;
      s.guests[target].fear=Math.max(0,s.guests[target].fear-3); s.bell=s.t+25;
      if(s.guests[target].fear<GUESTS[target].red) s.guests[target].packing=0;
      emit(s,'calm',{target});
    } else {
      if(!Number.isInteger(kind)||!s.ghosts[kind]||s.ghosts[kind].job||s.ghosts[kind].ready>s.t+1e-8) return false;
      if(delay===0) scare(s,kind,target);
      else {s.ghosts[kind].job={target,at:Math.round((s.t+delay)*20)/20,order:s.sequence+1}; emit(s,'schedule',{ghost:kind,target,delay});}
    }
  }
  s.actions.push({t:Number(s.t.toFixed(2)),kind,target,delay}); return true;
}
export function tick(s, seconds=DT) {
  // ponytail: 20 Hz is enough for a three-room hotel; event splitting if sub-frame effects are added.
  if(seconds<0 || !Number.isFinite(seconds)) throw new RangeError('Invalid elapsed time');
  const count=Math.round(seconds/DT);
  for(let n=0;n<count && s.status==='playing';n++) {
    s.t=Math.round((s.t+DT)*20)/20;
    for(const g of s.guests) g.fear=Math.max(0,g.fear-0.12*DT);
    const due=s.ghosts.map((g,i)=>({i,job:g.job})).filter(x=>x.job&&x.job.at<=s.t+1e-8).sort((a,b)=>a.job.at-b.job.at||a.job.order-b.job.order);
    for(const {i,job} of due) scare(s,i,job.target);
    for(let i=0;i<3;i++) {
      const g=s.guests[i];
      if(comfortable(s,i)) g.happy=Math.min(LEVELS[s.level].target,g.happy+DT);
      g.packing=g.fear>=GUESTS[i].red ? g.packing+DT : 0;
      if(g.packing>=5-1e-8) {s.status='lost';s.reason=`${GUESTS[i].name}被吓退房了`;emit(s,'checkout',{target:i});break;}
    }
    if(s.status==='playing'&&s.guests.every((g,i)=>g.happy>=LEVELS[s.level].target-1e-8&&comfortable(s,i))) {s.status='won';s.reason='三位客人都给了好评';emit(s,'win');}
    else if(s.status==='playing'&&s.t>=120) {s.status='lost';s.reason='天亮了，还有客人没尽兴';emit(s,'timeout');}
  }
  return s;
}
export function forecast(s, ghost, target, delay) {
  const copy=structuredClone(s);
  if(!command(copy,ghost,target,delay)) return null;
  if(delay) tick(copy,delay);
  return {fears:copy.guests.map(g=>g.fear),hits:ghost==='bell'?[]:effects(s,ghost,target,s.t+delay),safe:copy.guests.map((g,i)=>g.fear<GUESTS[i].red),time:s.t+delay};
}
