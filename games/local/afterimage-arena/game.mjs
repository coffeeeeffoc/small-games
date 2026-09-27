import { SIZE,CX,CY,TICKS,LEVELS,createRound,step,normalizeInput,hazards,sector,finishRecording,directionName } from './sim.mjs';
const $=id=>document.getElementById(id), canvas=$('arena'),ctx=canvas.getContext('2d');
const colors=['#60dddf','#f5c66d','#c598ff','#f4fff9'], symbols=['①','②','③','现在'];
let level=0,bank=[],replacement=null,gentle=true,round=1,state=createRound(),mode='intro',timer,acc=0,last=performance.now();
let stick=[0,0],fire=false,stickPointer=null,firePointer=null,keys=new Set(),beams=[],muted=false,audio,gain,lastSound=0,toastTimer;
try{muted=localStorage.getItem('afterimage-muted')==='1';}catch{}
function sound(type){
  if(muted)return;
  if(!audio){audio=new AudioContext();gain=audio.createGain();gain.gain.value=.15;gain.connect(audio.destination);}
  if(audio.state==='suspended')audio.resume();
  const now=audio.currentTime;
  if(type==='shot' && now-lastSound<.07)return;
  lastSound=now;
  const freq={shot:360,seal:610,core:860,hurt:90,rewind:240,win:1100,warn:180}[type]||400;
  const osc=audio.createOscillator(),env=audio.createGain();osc.type=type==='hurt'?'sawtooth':'sine';
  osc.frequency.setValueAtTime(freq,now);osc.frequency.exponentialRampToValueAtTime(type==='rewind'?60:freq*.65,now+.12);
  env.gain.setValueAtTime(type==='core'?.35:.16,now);env.gain.exponentialRampToValueAtTime(.001,now+.16);
  osc.connect(env);env.connect(gain);osc.start(now);osc.stop(now+.18);osc.onended=()=>{osc.disconnect();env.disconnect();};
}
function clearInput(){stick=[0,0];fire=false;keys.clear();stickPointer=null;firePointer=null;$('knob').style.transform='';$('fire').classList.remove('firing');}
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2000);}
function overlay(title,body,label,handler,extra=''){
  $('overlay').hidden=false;
  $('dialog').innerHTML=`<span class="eyebrow">AFTERIMAGE ARENA</span><h2>${title}</h2><p>${body}</p>${extra}<button class="primary" id="continue">${label}</button>`;
  $('continue').onclick=handler;
}
function startRound(){
  clearTimeout(timer);clearInput();beams=[];state=createRound(level,bank.filter(r=>r.id!==replacement),gentle);
  mode='playing';acc=0;last=performance.now();$('overlay').hidden=true;$('pause').textContent='暂停';renderRecords();updateHUD();
}
function showIntro(){
  mode='intro';
  overlay('与过去的自己并肩','先去左侧，移动躲开红环、按住开火。<br>20 秒后，过去的你会重演这些动作。<br>再去右侧，与自己的残影一起击穿核心。','开始第一段记录',()=>{
    gentle=$('difficulty').value==='gentle';sound('seal');startRound();
  },'<select id="difficulty" aria-label="容错难度"><option value="gentle">温和 · 2 秒预警 / 更长受击保护</option><option value="standard">标准 · 1.6 秒预警</option></select><span class="small">三关短局 · 约 3–5 分钟 · 双指即可操作</span>');
}
function pause(reason='动作与时间，停在这里'){
  if(mode!=='playing')return;
  mode='paused';clearInput();$('pause').textContent='继续';
  overlay('已暂停',reason,'继续这一轮',()=>{mode='playing';$('overlay').hidden=true;$('pause').textContent='暂停';last=performance.now();acc=0;});
}
function ended(){
  clearInput();
  if(state.status==='lost'){
    mode='lost';sound('hurt');
    const cause=state.events.find(e=>e.type==='hurt'&&e.id===3)?.cause;
    const detail=cause==='cross'?'红色轴线需要向侧面躲避。':cause==='outer'?'外环危险时，向中心靠近。':'内环危险时，向外侧移动。';
    overlay('这一次，差一点',`${(state.tick/60).toFixed(1)} 秒 · ${detail}<br>已保存的 ${bank.length} 段旧记录仍在。`,'重试当前轮',startRound);
  }else if(state.status==='won'){
    mode='won';sound('win');
    const lastLevel=level===2;
    overlay(lastLevel?'四个你，一次胜利':'这一刻，配合成立',lastLevel?'三个过去的你打开封印，<br>现在的你完成了最后一击。':`${LEVELS[level].name} · 第 ${round} 轮完成<br>${level===0?'下一关：录下左右两侧火力，从下方进攻。':'最后一关：再加北侧封印，留意十字预警。'}`,lastLevel?'再来一局':'进入下一关',()=>{
      level=lastLevel?0:level+1;bank=[];replacement=null;round=1;startRound();toast(LEVELS[level].subtitle);
    });
  }else{
    mode='rewind';sound('rewind');
    const previous=bank;bank=finishRecording(state,bank,replacement);
    const stored=bank!==previous;
    toast(stored?`已留下${replacement===null?'新的一段':symbols[replacement]}真实记录`:`旧记录已保留 · ${state.missing?'缺少'+state.missing+'侧火力':'继续提高核心命中'}`);
    replacement=null;round++;renderRecords();timer=setTimeout(startRound,650);
  }
}
function recordName(r){ if(r.label)return r.label;
  const counts={};for(const p of r.trace){const dir=directionName(Math.atan2(p[1]-CY,p[0]-CX));counts[dir]=(counts[dir]||0)+1;}
  return r.label=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0]||'移动';
}
function renderRecords(){
  $('records').innerHTML=Array.from({length:3},(_,id)=>{
    const r=bank.find(v=>v.id===id),enabled=id<LEVELS[level].seals.length;
    return `<div class="record ${replacement===id?'replacing':''}" id="record-${id}" style="--color:${enabled?colors[id]:'#35505a'}"><div class="record-head"><strong>${symbols[id]}</strong><span>${r?'过去的你':enabled?'等待记录':'后续解锁'}</span></div><small id="contribution-${id}">${r?recordName(r)+'侧 · 真实 20 秒':enabled?'本轮动作将在回溯后留下':'多一个你，多一份配合'}</small>${r?`<button data-replace="${id}">${replacement===id?'正在重录':'重录'+symbols[id]}</button>`:''}</div>`;
  }).join('');
  $('records').querySelectorAll('button').forEach(b=>b.onclick=()=>{
    if(mode==='intro'||mode==='won')return;
    replacement=Number(b.dataset.replace);startRound();toast(`重录${symbols[replacement]}：原版本保留到新段录完`);
  });
  $('cancel').hidden=replacement===null;
}
function updateHUD(){
  const spec=LEVELS[level];$('chapter').textContent=`0${level+1} / 03`;$('stage').textContent=spec.name;
  $('time').textContent=Math.max(0,(TICKS-state.tick)/60).toFixed(1);
  $('life').textContent=Array.from({length:4},(_,i)=>i<state.actors.at(-1).hp?'●':'○').join(' ');
  $('health').style.width=state.hp/spec.hp*100+'%';$('hp').textContent=state.hp+' / '+spec.hp;
  $('round').textContent=`第 ${round} 轮`;$('role').textContent=replacement===null?'现在':`重录 ${symbols[replacement]}`;
  const next=bank.length<spec.seals.length?spec.seals[bank.length]:null;
  $('objective').textContent=replacement!==null?`正在替换${symbols[replacement]}。录满 20 秒生效，失败保留原段。`:next!==null?`去${directionName(next)}侧按住开火，躲开预警。录满 20 秒后留下${symbols[bank.length]}。`:`去${directionName(spec.core)}侧白色射界开火；残影正在替你破盾。`;
  const h=hazards(state).find(h=>h.type==='cross')||hazards(state)[0];
  $('danger').textContent=h?`${h.type==='outer'?'外环危险 · 向内靠近':h.type==='inner'?'内环危险 · 向外移动':'十字射线 · 向侧面移开'}${h.active?'！':` · ${((h.start-state.tick)/60).toFixed(1)}秒后`}`:state.tick<240?'核心即将展开 · 先把火力留在封印上':state.missing?`还缺${state.missing}侧火力 · 封印需同时点亮`:'封印已开 · 从白色射界射入核心';
  $('danger').style.color=h?'#ffab9f':'#b2cbd0';
  for(const r of bank){
    const contributing=state.seals.some((t,i)=>t>state.tick && state.contributors[i]===r.id);
    $(`record-${r.id}`)?.classList.toggle('active',contributing);
    const el=$(`contribution-${r.id}`);if(el)el.textContent=replacement===r.id?'暂时撤下 · 新段完成后替换':contributing?'正在破盾 ●':recordName(r)+'侧 · 真实 20 秒';
  }
}
function circle(x,y,r,fill,stroke,width=1){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}}
function text(label,x,y,color='#9bb7c0',size=14){ctx.font=`${size}px "Microsoft YaHei",sans-serif`;ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,x,y);}
function ring(r1,r2,a,b,fill,stroke){ctx.beginPath();ctx.arc(CX,CY,r2,a,b);ctx.arc(CX,CY,r1,b,a,true);ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}}
function draw(){
  const s=state,l=LEVELS[level];ctx.clearRect(0,0,SIZE,SIZE);
  const bg=ctx.createRadialGradient(CX,CY,90,CX,CY,360);bg.addColorStop(0,'#18303b');bg.addColorStop(.6,'#10222d');bg.addColorStop(1,'#0a131e');circle(CX,CY,352,bg,'#26414c',2);
  for(let r=200;r<=320;r+=40)circle(CX,CY,r,null,'#263c461f');
  for(let i=0;i<80;i++){
    const a=i*Math.PI/40,ra=i%5===0?330:337;ctx.beginPath();ctx.moveTo(CX+Math.cos(a)*ra,CY+Math.sin(a)*ra);ctx.lineTo(CX+Math.cos(a)*343,CY+Math.sin(a)*343);ctx.strokeStyle=i%5===0?'#466470':'#263d4a';ctx.lineWidth=1;ctx.stroke();
  }
  const angles=[...l.seals,l.core],w=l.width*Math.PI/180;
  angles.forEach((a,i)=>{
    const core=i===l.seals.length,c=core?'#dcefe7':colors[i],lit=core?s.tick>=240&&s.seals.every(t=>t>s.tick):s.seals[i]>s.tick;
    ring(181,319,a-w,a+w,c+(lit?'17':'08'),c+'24');
    ring(110,128,a-w*.75,a+w*.75,c+(lit?'aa':'25'),c+'77');
    text(core?'核心':directionName(a)+'印',CX+Math.cos(a)*305,CY+Math.sin(a)*305,c,17);
    text(core?'◇':['○','△','□'][i],CX+Math.cos(a)*145,CY+Math.sin(a)*145,c,23);
  });
  for(const h of hazards(s)){
    const alpha=h.active?'46':'19';
    if(h.type==='cross'){
      ctx.save();ctx.beginPath();ctx.arc(CX,CY,321,0,Math.PI*2);ctx.clip();ctx.fillStyle='#ff7d71'+alpha;ctx.fillRect(CX-26,0,52,720);ctx.fillRect(0,CY-26,720,52);ctx.strokeStyle='#ff9989';ctx.lineWidth=h.active?3:1;ctx.strokeRect(CX-26,30,52,660);ctx.strokeRect(30,CY-26,660,52);ctx.restore();
    }else{
      ring(h.type==='outer'?245:181,h.type==='outer'?322:265,0,Math.PI*2,'#ff7969'+alpha,'#ff998977');
      const rr=h.type==='outer'?281:220;
      if(!h.active){ctx.setLineDash([8,9]);circle(CX,CY,rr,null,'#ffab9480',2);ctx.setLineDash([]);}
    }
  }
  circle(CX,CY,180,'#09151bcc','#4d707d',2);
  ctx.setLineDash([2,12]);circle(CX,CY,173,null,'#5c89984d');ctx.setLineDash([]);
  circle(CX,CY,103,'#101a25','#42616d',2);circle(CX,CY,91,'#0c1520','#587079',1);
  const pulse=s.tick/60,open=s.tick>=240&&s.seals.every(t=>t>s.tick),hit=s.tick-s.lastHit<8;
  ctx.save();ctx.translate(CX,CY);ctx.rotate(Math.sin(pulse*.5)*.06);
  for(let i=0;i<8;i++){
    ctx.save();ctx.rotate(i*Math.PI/4+(open?.14:0));ctx.beginPath();ctx.moveTo(20,-8);ctx.lineTo(50,-71);ctx.lineTo(82,-40);ctx.lineTo(74,18);ctx.lineTo(28,29);ctx.closePath();ctx.fillStyle=i%2?'#253e4c':'#334a57';ctx.fill();ctx.strokeStyle='#728a934d';ctx.lineWidth=1;ctx.stroke();ctx.restore();
  }ctx.restore();
  const glow=ctx.createRadialGradient(CX,CY,1,CX,CY,open?61:34);glow.addColorStop(0,hit?'#fffbe4':open?'#f8e5ba':'#79a2a9');glow.addColorStop(1,'#70cbb000');circle(CX,CY,open?61:34,glow);circle(CX,CY,open?22:12,open?'#ffefd2':'#7bafb8','#e8edda',2);
  text(s.tick<240?'正在展开':open?'核心暴露':'机械快门',CX,CY+69,open?'#ffe9ba':'#9aafb7',13);
  for(const beam of beams){
    const age=s.tick-beam.tick;if(age<0||age>7)continue;
    const a=Math.atan2(beam.y-CY,beam.x-CX),r=beam.kind==='core'?15:116;
    ctx.globalAlpha=1-age/8;ctx.strokeStyle=beam.kind==='core'?'#fff7d6':colors[beam.id];ctx.lineWidth=beam.kind==='core'?4:2;
    ctx.beginPath();ctx.moveTo(beam.x,beam.y);ctx.lineTo(CX+Math.cos(a)*r,CY+Math.sin(a)*r);ctx.stroke();
    circle(CX+Math.cos(a)*r,CY+Math.sin(a)*r,8-age*.7,beam.kind==='armor'?'#778d97':colors[beam.id]);ctx.globalAlpha=1;
  }
  for(const a of s.actors){
    const c=colors[a.id];ctx.strokeStyle=c+'65';ctx.lineWidth=a.id===3?3:2;ctx.beginPath();a.trail.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.stroke();
    ctx.save();ctx.translate(a.x,a.y);ctx.globalAlpha=a.hp<=0?.2:s.tick<a.hurtUntil&&s.tick%8<4?.4:1;
    if(a.id===0)circle(0,0,19,null,c,2);
    if(a.id===1){ctx.beginPath();ctx.moveTo(0,-23);ctx.lineTo(21,16);ctx.lineTo(-21,16);ctx.closePath();ctx.strokeStyle=c;ctx.lineWidth=2;ctx.stroke();}
    if(a.id===2){ctx.strokeStyle=c;ctx.lineWidth=2;ctx.strokeRect(-18,-18,36,36);}
    ctx.rotate(Math.atan2(CY-a.y,CX-a.x)+Math.PI/2);
    ctx.beginPath();ctx.moveTo(0,-18);ctx.lineTo(11,11);ctx.lineTo(0,6);ctx.lineTo(-11,11);ctx.closePath();ctx.fillStyle=a.id===3?c:c+'66';ctx.strokeStyle=c;ctx.lineWidth=2;ctx.fill();ctx.stroke();ctx.restore();
    text(symbols[a.id],a.x,a.y-32,c,a.id===3?13:19);
    if(a.hp<=0)text('×',a.x,a.y,c,25);
  }
  if(mode==='rewind'){circle(CX,CY,Math.max(30,340-(performance.now()%650)/650*300),null,'#b3f4e080',3);}
}
function sample(){
  const x=stick[0]+(keys.has('ArrowRight')||keys.has('KeyD')?1:0)-(keys.has('ArrowLeft')||keys.has('KeyA')?1:0);
  const y=stick[1]+(keys.has('ArrowDown')||keys.has('KeyS')?1:0)-(keys.has('ArrowUp')||keys.has('KeyW')?1:0);
  return normalizeInput(x,y,fire||keys.has('Space'));
}
function frame(now){
  const elapsed=now-last;last=now;
  if(mode==='playing'){
    if(elapsed>500)pause('画面暂时停顿，时间已保护性暂停。');
    else{
      acc+=elapsed;
      while(acc>=1000/60&&mode==='playing'){
        step(state,sample());acc-=1000/60;
        for(const e of state.events){
          if(e.type==='shot'){beams.push({...e,tick:state.tick});if(e.id===3)sound(e.kind==='core'?'core':e.kind==='seal'?'seal':'shot');}
          if(e.type==='hurt'&&e.id===3)sound('hurt');
        }
        beams=beams.filter(b=>state.tick-b.tick<=8);
        if(hazards(state).some(h=>h.warn===state.tick-1))sound('warn');
        if(state.status!=='playing')ended();
      }
    }
  }
  updateHUD();draw();requestAnimationFrame(frame);
}
function moveStick(e){
  if(e.pointerId!==stickPointer)return;
  const rect=$('joystick').getBoundingClientRect(),centerX=rect.left+rect.width/2,centerY=rect.top+(rect.width<100?46:51),radius=34;
  let x=(e.clientX-centerX)/radius,y=(e.clientY-centerY)/radius,n=Math.max(1,Math.hypot(x,y));stick=[x/n,y/n];
  $('knob').style.transform=`translate(${stick[0]*25}px,${stick[1]*25}px)`;
}
$('joystick').onpointerdown=e=>{if(mode!=='playing'||stickPointer!==null)return;e.preventDefault();sound('shot');stickPointer=e.pointerId;$('joystick').setPointerCapture(e.pointerId);moveStick(e);};
$('joystick').onpointermove=moveStick;
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('joystick').addEventListener(name,e=>{if(e.pointerId===stickPointer){stickPointer=null;stick=[0,0];$('knob').style.transform='';}});
$('fire').onpointerdown=e=>{if(mode!=='playing')return;e.preventDefault();sound('shot');firePointer=e.pointerId;fire=true;$('fire').setPointerCapture(e.pointerId);$('fire').classList.add('firing');};
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('fire').addEventListener(name,e=>{if(e.pointerId===firePointer){firePointer=null;fire=false;$('fire').classList.remove('firing');}});
window.addEventListener('keydown',e=>{
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD'].includes(e.code)){
    if(e.target.matches('button,select')&&mode!=='playing')return;
    e.preventDefault();if(mode==='playing'){keys.add(e.code);sound('shot');}
  }
  if(e.code==='Escape'){if(mode==='paused')$('continue').click();else pause();}
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{clearInput();pause('切换页面时，所有动作与记录已暂停。');});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();pause('回到页面后，点继续恢复。');}});
window.addEventListener('resize',clearInput);
$('pause').onclick=()=>{if(mode==='paused')$('continue').click();else pause();};
$('retry').onclick=()=>{if(mode==='intro'||mode==='won')return;startRound();toast('重试当前轮 · 旧记录已保留');};
$('cancel').onclick=()=>{replacement=null;startRound();toast('已恢复原记录');};
$('mute').onclick=()=>{muted=!muted;if(gain)gain.gain.value=muted?0:.15;try{localStorage.setItem('afterimage-muted',muted?'1':'0');}catch{}updateMute();if(!muted)sound('seal');};
function updateMute(){$('mute').textContent=muted?'声音 关':'声音 开';$('mute').setAttribute('aria-pressed',String(muted));}
// Read-only observations for browser acceptance. No state setter, injected tape, or auto-player.
window.__arena={snapshot:()=>({level,round,mode,replacement,gentle,tick:state.tick,hp:state.hp,damage:state.damage,status:state.status,bank:bank.map(r=>({id:r.id,length:r.inputs.length,checksum:r.inputs.reduce((n,v)=>((n*31+v[0]*3+v[1]*5+v[2])|0),0)})),actors:state.actors.map(({id,x,y,hp,shots})=>({id,x,y,hp,shots})),seals:[...state.seals],hazards:hazards(state),input:sample(),muted,audioState:audio?.state,view:{width:innerWidth,height:innerHeight}})};
renderRecords();updateMute();showIntro();requestAnimationFrame(frame);
