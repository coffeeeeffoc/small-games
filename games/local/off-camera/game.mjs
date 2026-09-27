import { cases, actions, simulate, judge, mismatch } from './logic.mjs';
import { scene, icon } from './art.mjs';
const $ = s => document.querySelector(s);
let caseIndex=0, c=cases[0], order=[], mode='after', preview=null, ready=false, busy=false, won=false, finished=false, serial=0, drag=null, blockClickUntil=0;
const solved=new Set();
let muted=false, audio=null, master=null;
try { muted=localStorage.getItem('off-camera-muted')==='true'; } catch {}
function initAudio() {
  try {
    if (!audio) { audio=new (window.AudioContext || window.webkitAudioContext)(); master=audio.createGain();master.connect(audio.destination); }
    master.gain.value=muted ? 0 : .12;
    if (audio.state==='suspended') audio.resume().catch(()=>{});
  } catch {}
}
function sound(id) {
  if (!audio || muted) return;
  const osc=audio.createOscillator(), gain=audio.createGain(), now=audio.currentTime;
  osc.type=id==='cake' ? 'sawtooth' : 'triangle';
  osc.frequency.setValueAtTime(actions[id]?.sound || (id==='win' ? 660 : 130),now);
  osc.frequency.exponentialRampToValueAtTime(id==='win' ? 990 : 70,now+.16);
  gain.gain.setValueAtTime(.65,now);gain.gain.exponentialRampToValueAtTime(.001,now+.19);
  osc.connect(gain);gain.connect(master);osc.start();osc.stop(now+.2);
  osc.onended=()=>{osc.disconnect();gain.disconnect();};
}
function muteUI() { $('#mute').textContent=muted?'♪ 已静音':'♪ 声音开';$('#mute').setAttribute('aria-pressed',String(muted));$('#mute').setAttribute('aria-label',muted?'开启声音':'静音'); }
$('#mute').onclick=()=>{muted=!muted;initAudio();muteUI();try{localStorage.setItem('off-camera-muted',String(muted));}catch{}};
document.addEventListener('pointerdown',initAudio,{passive:true});
document.addEventListener('keydown',initAudio);
function feedback(status,title,description) {
  const el=$('#feedback');el.dataset.status=status;
  el.innerHTML=`<span class="status-icon">${status==='won'?'✓':status==='wrong'?'!':status==='playing'?'↻':'?'}</span><div><strong>${title}</strong><p>${description}</p></div>`;
}
function nav() {
  $('#cases').innerHTML=cases.map((item,i)=>`<button class="case-tab ${i===caseIndex?'active':''} ${solved.has(i)?'done':''}" data-case="${i}" aria-label="第${i+1}案 ${item.title}" aria-current="${i===caseIndex?'step':'false'}">${icon(['move','unmask','steal'][i])}<div><span>${solved.has(i)?'✓ 已还原':`档案 0${i+1}`}</span><strong>${['消失的椅子','奶油面具','偷错午餐'][i]}</strong></div></button>`).join('');
}
function controls() {
  $('#slots').innerHTML=order.map((id,i)=>`<div class="slot ${id?'filled':'empty'}" data-slot="${i}" aria-label="第${i+1}步">${id?`<span class="slot-order">0${i+1}</span><button data-card="${id}" data-from="${i}" aria-label="移除第${i+1}步 ${actions[id].label}">${icon(id)}<span class="action-name">${actions[id].label}</span></button>`:`<span>0${i+1}</span>`}</div>`).join('');
  $('#bank').innerHTML=c.cards.map(id=>`<button class="event-card ${order.includes(id)?'used':''}" data-card="${id}" aria-label="添加${actions[id].label}" ${order.includes(id)?'disabled':''}>${icon(id)}<span class="action-name">${actions[id].label}</span><small>${actions[id].hint}</small></button>`).join('');
  $('#replay').disabled=!order.every(Boolean)||busy;
}
function updateButtons() {
  document.body.classList.toggle('has-sequence',order.length>0&&order.every(Boolean));
  $('#confirm').disabled=busy||!ready;
  $('#confirm').textContent=finished?'再调查一次':won?(caseIndex===2?'查看结案':'下一件小案 →'):busy?'正在重演…':ready?'确认推断':'放齐动作，自动重演';
  $('#replay').disabled=!order.every(Boolean)||busy;
  $('#progress-text').textContent=`已还原 ${solved.size} / 3 · 不限重试`;
}
function paint(motion=null) {
  document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===mode);b.setAttribute('aria-pressed',String(b.dataset.mode===mode));});
  const guess=mode==='replay'||mode==='compare';
  $('#source-label').classList.toggle('guess',guess);
  $('#source-label').textContent=mode==='compare'?'物证对照':guess?'你的推演 · 并非实拍':`监控画面 · ${mode==='before'?'之前':'之后'}`;
  $('#timecode').textContent=`${c.time}:${mode==='before'?'00':'08'}`;
  if (mode==='compare' && preview) {
    const diff=mismatch(c,preview.state);
    $('#stage').innerHTML=`<div class="compare"><figure>${scene(c,c.target,{box:diff.box,highlight:diff.box})}<figcaption>监控里的证据</figcaption></figure><figure>${scene(c,preview.state,{box:diff.box,highlight:diff.box})}<figcaption>你的推演结果</figcaption></figure></div>`;
    $('#frame-caption').textContent='虚线框内，就是不吻合的地方';
  } else {
    const state=motion?motion.before:mode==='before'?c.initial:mode==='after'?c.target:preview?.state||c.initial;
    $('#stage').innerHTML=scene(c,state,{motion});
    $('#frame-caption').textContent=motion?actions[motion.action].label:mode==='before'?'进入盲区前':mode==='after'?'几秒以后，事情变了样':ready?'重演完成 · 现在可以确认':'排好事件，看看会发生什么';
  }
}
function reset() {
  serial++;busy=false;ready=false;won=false;finished=false;preview=null;order=Array(c.count).fill(null);mode='after';
  $('#play-progress i').style.width='0%';
  controls();paint();updateButtons();feedback('idle',c.subtitle,'点下方动作卡放入时间槽，也可以直接拖动。');
}
function loadCase(i) {
  caseIndex=i;c=cases[i];$('#case-number').textContent=`0${i+1}`;$('#case-title').textContent=c.title;$('#subtitle').textContent=c.subtitle;$('#rule').textContent=c.rule;nav();reset();
}
$('#cases').onclick=e=>{const b=e.target.closest('[data-case]');if(b)loadCase(Number(b.dataset.case));};
$('#reset').onclick=reset;
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;paint();});
function changed() {
  serial++;busy=false;ready=false;won=false;finished=false;preview=null;$('#play-progress i').style.width='0%';
  controls();updateButtons();
  if(order.every(Boolean)) replay();
  else {mode='after';paint();feedback('idle',`还差 ${order.filter(x=>!x).length} 个动作`,'点卡放入空槽；点已放入的卡可以取回。');}
}
function place(id, target, from=null) {
  if(from!==null) [order[from],order[target]]=[order[target],order[from]];
  else { if(order.includes(id))return;order[target]=id; }
  changed();
}
function activateCard(id, from=null) {
  if(from!==null){order[from]=null;changed();}
  else {const next=order.indexOf(null);if(next>=0)place(id,next);}
}
$('#controls').addEventListener('click',e=>{
  if(Date.now()<blockClickUntil&&e.detail!==0)return;

  const b=e.target.closest('[data-card]');if(!b||b.disabled)return;
  activateCard(b.dataset.card,b.dataset.from===undefined?null:Number(b.dataset.from));
});
function endDrag() {
  if(drag?.ghost)drag.ghost.remove();
  document.querySelectorAll('.drop-target').forEach(e=>e.classList.remove('drop-target'));
  if(drag && $('#controls').hasPointerCapture(drag.pointer))$('#controls').releasePointerCapture(drag.pointer);
  drag=null;document.body.classList.remove('dragging');
}
$('#controls').addEventListener('pointerdown',e=>{
  if(drag||e.button!==0||e.target.closest('[data-shift]'))return;
  const b=e.target.closest('[data-card]');if(!b||b.disabled)return;
  drag={id:b.dataset.card,from:b.dataset.from===undefined?null:Number(b.dataset.from),x:e.clientX,y:e.clientY,pointer:e.pointerId,source:b,ghost:null};
  $('#controls').setPointerCapture(e.pointerId);
});
$('#controls').addEventListener('pointermove',e=>{
  if(!drag||drag.pointer!==e.pointerId)return;
  if(!drag.ghost&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<8)return;
  e.preventDefault();
  if(!drag.ghost){drag.ghost=drag.source.cloneNode(true);drag.ghost.className='event-card drag-ghost';document.body.append(drag.ghost);document.body.classList.add('dragging');}
  drag.ghost.style.left=`${e.clientX-52}px`;drag.ghost.style.top=`${e.clientY-44}px`;
  document.querySelectorAll('.drop-target').forEach(e=>e.classList.remove('drop-target'));
  document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-slot]')?.classList.add('drop-target');
},{passive:false});
$('#controls').addEventListener('pointerup',e=>{
  if(!drag||drag.pointer!==e.pointerId)return;
  const info=drag,target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-slot]');
  const didMove=Boolean(info.ghost);endDrag();
  blockClickUntil=Date.now()+300;
  if(didMove){if(target)place(info.id,Number(target.dataset.slot),info.from);}
  else activateCard(info.id,info.from);
});
$('#controls').addEventListener('pointercancel',endDrag);
$('#controls').addEventListener('lostpointercapture',()=>{if(drag)endDrag();});
// Each edit invalidates the previous animation, including its future completion callback.
async function replay() {
  if(!order.every(Boolean))return;
  const token=++serial,result=simulate(c,order);
  busy=true;ready=false;mode='replay';preview={state:structuredClone(c.initial)};paint();updateButtons();
  feedback('playing','你的推演正在发生','只播放你排出的动作；监控证据不会随你的选择改变。');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(matchMedia('(max-width: 700px)').matches) $('.monitor').scrollIntoView({behavior:'auto',block:'start'});
  for(const [i,frame] of result.frames.entries()) {
    sound(frame.action);
    await new Promise(resolve=>{
      let start=null;
      function tick(now){
        if(token!==serial){resolve();return;}
        start??=now;
        const p=Math.min(1,(now-start)/(reduced?280:1050));
        if(mode==='replay')paint({...frame,p});
        $('#play-progress i').style.width=`${(i+p)/c.count*100}%`;
        if(p<1)requestAnimationFrame(tick);else resolve();
      }
      requestAnimationFrame(tick);
    });
    if(token!==serial)return;
    preview={state:frame.after};
  }
  if(token!==serial)return;
  preview=result;busy=false;ready=true;paint();updateButtons();
  feedback('ready',result.error?'有一步做不下去了':'这就是你排出的结果',result.error||'觉得它和监控之后的画面吻合吗？确认一次就好。');
}
$('#replay').onclick=()=>{won=false;replay();};
$('#confirm').onclick=()=>{
  if(finished){solved.clear();loadCase(0);return;}
  if(won){
    if(caseIndex<2){loadCase(caseIndex+1);return;}
    finished=true;feedback('won',`结案：已还原 ${solved.size} / 3 件小案`,solved.size===3?'椅子、奶油和午餐都有了交代。夜班继续。':'还可以点上方档案，补上尚未还原的小案。');updateButtons();return;
  }
  if(!ready||busy)return;
  const result=judge(c,order);preview=result;
  if(result.won){won=true;solved.add(caseIndex);mode='replay';feedback('won','证据吻合！',c.ending);sound('win');nav();}
  else {mode='compare';feedback('wrong',result.error||mismatch(c,result.state).text,'可以直接换序，或点“重新排”再试一次。');sound('wrong');}
  paint();updateButtons();
};
$('#zoom').onclick=()=>{ $('#zoom-title').textContent=mode==='compare'?'两份证据，放大对照':'放大观察';$('#zoom-scene').innerHTML=$('#stage').innerHTML;$('#zoom-dialog').showModal(); };
$('#close-zoom').onclick=()=>$('#zoom-dialog').close();
$('#zoom-dialog').addEventListener('click',e=>{if(e.target===$('#zoom-dialog'))$('#zoom-dialog').close();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag)endDrag();});
muteUI();loadCase(0);
