import {levels,initial,directions} from './levels.mjs';
import {step,cell} from './rules.mjs';
const $ = s => document.querySelector(s);
const board = $('#board');
let levelIndex=0, state=initial(0), history=[], busy=false, epoch=0, drag=null, notice='';
let audio=null, master=null, muted=false, completed=[];
try { muted=localStorage.getItem('weather-command:muted')==='true'; completed=JSON.parse(localStorage.getItem('weather-command:completed')||'[]'); if(!Array.isArray(completed)) completed=[]; } catch {}
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const center = p => ({x:p.x*80+40,y:p.y*80+40});
const surfaceColor = s => s.snow ? '#dbe9e6' : s.h===0 ? '#c0b695' : s.h===1 ? '#62b5b0' : '#368f97';
const lift = s => s.h*4;
const dirName={up:'上',right:'右',down:'下',left:'左'};
function unlockAudio() {
  try {
    if(!audio) { audio=new (window.AudioContext||window.webkitAudioContext)(); master=audio.createGain(); master.gain.value=muted?0:.23;master.connect(audio.destination); }
    if(audio.state==='suspended') audio.resume().then(()=>document.body.dataset.audio=audio.state).catch(()=>{});
    document.body.dataset.audio=audio.state;
  } catch {document.body.dataset.audio='unavailable';}
}
function sound(type) {
  if(!audio || muted || audio.state!=='running') return;
  const now=audio.currentTime;
  const tone=(freq,delay=.0,duration=.18)=>{const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.setValueAtTime(freq,now+delay);g.gain.setValueAtTime(0,now+delay);g.gain.linearRampToValueAtTime(.6,now+delay+.01);g.gain.exponentialRampToValueAtTime(.001,now+delay+duration);o.connect(g);g.connect(master);o.start(now+delay);o.stop(now+delay+duration);};
  if(type==='win'){[523,659,784,1047].forEach((f,i)=>tone(f,i*.11,.32));return;}
  if(type==='sun'){tone(660);tone(880,.12);return;}
  if(type==='float'){tone(330);tone(440,.09);return;}
  const duration=type==='break'?.16:type==='snow'?.65:.45;
  const buffer=audio.createBuffer(1,Math.ceil(audio.sampleRate*duration),audio.sampleRate),data=buffer.getChannelData(0);
  for(let i=0;i<data.length;i++) data[i]=(Math.random()*2-1)*(1-i/data.length);
  const source=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();
  source.buffer=buffer;filter.type=type==='snow'?'highpass':'lowpass';filter.frequency.value=type==='break'?1100:type==='rain'?2400:type==='snow'?4200:600;gain.gain.value=type==='break'?.8:.35;
  source.connect(filter);filter.connect(gain);gain.connect(master);source.start();
}
function renderBoard(s) {
  const colors=surfaceColor(s),p=center(s);
  let canal='',walls='',waves='',ice='',dry='',objects='';
  for(let y=0;y<7;y++) for(let x=0;x<7;x++) {
    const t=cell(s,x,y),px=x*80,py=y*80;
    if(t==='#') {walls+=`<rect x="${px+2}" y="${py+3}" width="76" height="75" rx="7" fill="url(#tile)" stroke="#c4b99d"/><path d="M${px+10} ${py+6}h60" stroke="#fff9eb" opacity=".9"/>`;continue;}
    canal+=`<rect x="${px}" y="${py}" width="80" height="80"/>`;
    waves+=`<path d="M${px+9} ${py+23}q9 4 18 0t18 0m-20 32q9 4 18 0t17 0" stroke="#d8f0d9" stroke-width="2" fill="none"/>`;
    ice+=`<path d="M${px+5} ${py+5}l30 25-8 28m8-28 32 7M${px+45} ${py+66}l25-12" stroke="#a6c9cc" stroke-width="1.8" fill="none"/><circle cx="${px+14}" cy="${py+65}" r="2" fill="#fff"/>`;
    dry+=`<path d="M${px+13} ${py+35}l15-5 14 10 19-8M${px+35} ${py+37}l-4 15" stroke="#a99f81" stroke-width="1.2" fill="none"/>`;
    if(t==='D') objects+=`<g id="dock"><rect x="${px+5}" y="${py+5}" width="70" height="70" rx="13" fill="#d8b370" stroke="#ae8749" stroke-width="3"/><path d="M${px+12} ${py+24}h56m-56 17h56m-56 17h56" stroke="#b78f54"/><circle class="dock-glow" cx="${px+40}" cy="${py+40}" r="22" fill="#fff5be" opacity=".9"/><circle cx="${px+40}" cy="${py+40}" r="14" fill="none" stroke="#fff8df" stroke-width="7"/><path d="M${px+40} ${py+23}v8m0 18v8m-17-17h8m18 0h8" stroke="#ca5d42" stroke-width="7"/><text x="${px+40}" y="${py-6}" text-anchor="middle" fill="#685332" font-size="12" font-weight="bold">停靠</text></g>`;
    if(t==='W') {
      const vertical=cell(s,x-1,y)!=='#'||cell(s,x+1,y)!=='#';
      objects+=`<g id="gate-${x}-${y}" data-gate="true" transform="translate(${px+40} ${py+40}) rotate(${vertical?90:0})"><rect x="-35" y="-15" width="70" height="30" rx="3" fill="#a87b40" stroke="#684e32" stroke-width="3"/><path d="M-30-9H30M-30 8H30M-20-14v28M0-14v28M20-14v28" stroke="#dec082" stroke-width="3"/><path d="M-7-14l11 9-7 6 8 13" stroke="#6c4e2d" fill="none" stroke-width="2"/></g>`;
    }
    if(t==='B') objects+=`<g id="bridge"><path d="M${px+7} ${py+8}h66v16H${px+7}zm0 50h66v16H${px+7}z" fill="#b5ad8e" stroke="#7d806f" stroke-width="3"/><path d="M${px+15} ${py+30}h50m-50 20h50" stroke="${s.h===2?'#dc7856':'#f1dfb1'}" stroke-width="5" stroke-dasharray="7 5"/><text x="${px+40}" y="${py+19}" text-anchor="middle" font-size="11" fill="#3f5554">低桥</text></g>`;
  }
  board.innerHTML=`<defs><linearGradient id="tile" x2=".6" y2="1"><stop stop-color="#f2ecd9"/><stop offset="1" stop-color="#e2d8bd"/></linearGradient><clipPath id="canal-clip">${canal}</clipPath><marker id="arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" fill="#fff8d8"/></marker></defs>
  <rect width="560" height="560" fill="#c2b896"/><g id="surface" fill="${colors}">${canal}</g><g id="water-marks" class="water-line" opacity="${s.h&&!s.snow?.7:0}">${waves}</g><g id="ice-marks" opacity="${s.snow?1:0}">${ice}</g><g id="dry-marks" opacity="${!s.h&&!s.snow?1:0}">${dry}</g>${walls}${objects}
  <g transform="translate(23 30)" opacity=".65"><path d="M0 0h48M24-12v24m-5-19 5-6 5 6" stroke="#818771" fill="none"/><text x="57" y="5" fill="#737d69" font-size="11" letter-spacing="2">航道气象图</text></g>
  <g transform="translate(414 27)"><text x="0" y="10" fill="#758071" font-size="11">水位</text><rect x="31" y="0" width="70" height="12" rx="6" fill="#cbc7ac"/><rect id="water-level" x="31" y="0" width="${s.h*35}" height="12" rx="6" fill="#418f92"/><path d="M66 0v12" stroke="#fff8da"/></g>
  <g id="preview" pointer-events="none"></g>
  <g id="ship" transform="translate(${p.x} ${p.y})"><circle r="42" fill="transparent"/><ellipse cy="12" rx="30" ry="13" fill="#264d5535"/><g id="boat-lift" transform="translate(0 ${-lift(s)})"><g id="boat-face" class="ship-body"><path d="M-31-16Q10-25 34 0 10 25-31 16Q-37 0-31-16Z" fill="#b65035" stroke="#863e2c" stroke-width="2"/><path d="M-27-12Q9-19 27 0 9 19-27 12Z" fill="#df794e" stroke="#f4bc7d" stroke-width="2"/><rect x="-22" y="-12" width="28" height="24" rx="5" fill="#f6ead0" stroke="#9d6a44" stroke-width="2"/><rect x="-16" y="-8" width="15" height="16" rx="3" fill="#447d81"/><path d="M-14-6h11v5h-11Z" fill="#8dc4c3"/><path d="M13-6v12m-5-6h10" stroke="#fff0c4" stroke-width="2"/></g></g></g><g id="fx" clip-path="url(#canal-clip)" pointer-events="none"></g>`;
}
function syncUI() {
  board.dataset.x=state.x;board.dataset.y=state.y;board.dataset.h=state.h;board.dataset.snow=state.snow;board.dataset.remaining=state.remaining;board.dataset.status=state.status;board.dataset.busy=busy;board.dataset.level=levelIndex+1;
  $('#stage-number').textContent=`${String(levelIndex+1).padStart(2,'0')} / 05`;
  $('#stage-name').textContent=levels[levelIndex].name;
  $('#surface-label').textContent=`${['干涸','浅水','高水'][state.h]} · ${state.snow?'冰雪面':'普通面'}`;
  $('#motion-rule').textContent=state.snow?'冰雪长滑 · 到墙前停':state.h?'水上短推 · 最多三格':'先涨水，或铺雪';
  $('#remaining').textContent=state.remaining;
  $('#tokens').innerHTML=[0,1,2].map(i=>`<i class="${i>=state.remaining?'spent':''}"></i>`).join('');
  $('#forecast-label').textContent=busy?'天气执行中':'航行提示';
  $('#message').textContent=notice||state.message;
  document.querySelectorAll('[data-weather],[data-dir]').forEach(b=>b.disabled=busy||state.status!=='playing');
  $('#undo').disabled=!history.length;
  $('#mute').setAttribute('aria-pressed',String(muted));$('#mute').innerHTML=muted?'♩ <span>已静音</span>':'♫ <span>声音开</span>';
  const result=$('#result');result.hidden=busy||state.status==='playing';result.classList.toggle('lost',state.status==='lost');
  if(!result.hidden) {
    const won=state.status==='won';$('#result-stamp').textContent=won?'DELIVERY COMPLETE':'TRY ANOTHER FORECAST';
    $('#result-title').textContent=won?'补给，准时靠岸。':'风走远了，再试一次。';
    $('#result-copy').textContent=won?`用了 ${3-state.remaining} 次指令。${levelIndex===4?'五段航道已完成，也可以重走另一条路。':'每一场天气，都有它的用处。'}`:state.message;
    $('#result-action').textContent=won?(levelIndex===4?'再航一回 ↻':'下一航段 →'):'重新启航 ↻';
  }
  $('#level-nav').innerHTML=levels.map((l,i)=>`<button type="button" data-level="${i}" aria-label="第${i+1}关：${l.name}" aria-current="${i===levelIndex}" class="${completed.includes(i)?'done':''}">${String(i+1).padStart(2,'0')}</button>`).join('');
}
function clearPreview() {
  const node=$('#preview');if(node)node.innerHTML='';
  document.querySelectorAll('.previewing').forEach(b=>b.classList.remove('previewing'));
  $('#forecast-label').textContent=busy?'天气执行中':'航行提示';$('#message').textContent=notice||state.message;
}
function preview(action) {
  if(busy||state.status!=='playing')return;
  const r=step(state,action);
  $('#forecast-label').textContent='单步预演 · 松手执行';$('#message').textContent=r.valid?`预演：${r.reason}`:`不消耗指令：${r.reason}`;
  let markup='';
  if(r.valid&&r.path.length>1){const points=r.path.map(center);const end=points.at(-1);markup=`<polyline class="preview-path" points="${points.map(p=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="#fff8d8" stroke-width="6" marker-end="url(#arrow)"/><circle cx="${end.x}" cy="${end.y}" r="25" fill="#fff8d850" stroke="#fff8d8" stroke-width="3" stroke-dasharray="4 5"/>`;}
  else if(r.valid){const p=center(state);markup=`<g clip-path="url(#canal-clip)"><rect width="560" height="560" fill="${surfaceColor(r.state)}" opacity=".25"/></g><circle cx="${p.x}" cy="${p.y-lift(r.state)}" r="32" fill="none" stroke="#fff5cc" stroke-width="3" stroke-dasharray="4 5"/>`;}
  $('#preview').innerHTML=markup;
}
function tween(duration,fn,token) {
  duration=reduceMotion?Math.min(duration,90):duration;
  return new Promise(resolve=>{let elapsed=0,last=null;function frame(now){if(token!==epoch){resolve(false);return;}if(last!==null&&!document.hidden)elapsed+=Math.min(now-last,50);last=now;const t=Math.min(1,elapsed/duration);fn(t);if(t===1)resolve(true);else requestAnimationFrame(frame);}requestAnimationFrame(frame);});
}
function weatherFX(type) {
  if(type==='sun')return '<circle class="sun-ray" cx="100" cy="80" r="230" fill="#ffde81" opacity=".25"/>';
  return Array.from({length:32},(_,i)=>{const x=(i*103+17)%560,y=(i*67)%500,delay=-(i%8)*.12;return type==='rain'?`<path class="weather-drop" d="M${x} ${y}l-8 20" stroke="#d7faff" stroke-width="3" stroke-linecap="round" style="animation-delay:${delay}s"/>`:`<circle class="snow-drop" cx="${x}" cy="${y}" r="${2+i%3}" fill="#fffdf1" style="animation-delay:${delay}s"/>`;}).join('');
}
function colorMix(a,b,t){const rgb=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));return `rgb(${rgb(a).map((v,i)=>Math.round(v+(rgb(b)[i]-v)*t)).join(',')})`;}
async function submit(action) {
  unlockAudio();if(busy)return;
  clearPreview();const r=step(state,action);
  if(!r.valid){notice=r.reason;syncUI();return;}
  const before=state;history.push(before);state=r.state;notice='';busy=true;const token=++epoch;
  renderBoard(before);syncUI();
  if(action.type==='wind') {
    sound(before.snow?'snow':'wind');
    const start=center(before),end=center(state),distance=r.path.length-1,broken=new Set();
    $('#boat-face').setAttribute('transform',`rotate(${({right:0,up:-90,left:180,down:90})[action.dir]})`);
    await tween(Math.max(520,distance*220),t=>{
      const travel=(1-Math.pow(1-t,1.35))*distance;
      $('#ship')?.setAttribute('transform',`translate(${start.x+(end.x-start.x)*travel/distance} ${start.y+(end.y-start.y)*travel/distance})`);
      r.broken.forEach(b=>{const k=r.path.findIndex(p=>p.x===b.x&&p.y===b.y);if(travel>=k-.45&&!broken.has(k)) {broken.add(k);$(`#gate-${b.x}-${b.y}`)?.remove();sound('break');const p=center(b);$('#fx').innerHTML=Array.from({length:7},(_,i)=>`<g class="wake" style="transform-origin:${p.x}px ${p.y}px"><rect x="${p.x-32+i*10}" y="${p.y-18+i%3*14}" width="6" height="18" rx="2" fill="#d7a45e" transform="rotate(${i*33} ${p.x} ${p.y})"/></g>`).join('');}});
    },token);
  } else {
    $('#fx').innerHTML=weatherFX(action.type);sound(action.type);
    await tween(780,t=>{
      $('#surface')?.setAttribute('fill',colorMix(surfaceColor(before),surfaceColor(state),t));
      $('#water-marks')?.setAttribute('opacity',((before.h&&!before.snow?1:0)*(1-t)+(state.h&&!state.snow?1:0)*t)*.7);
      $('#ice-marks')?.setAttribute('opacity',(before.snow?1:0)*(1-t)+(state.snow?1:0)*t);
      $('#dry-marks')?.setAttribute('opacity',(!before.snow&&!before.h?1:0)*(1-t)+(!state.snow&&!state.h?1:0)*t);
      $('#water-level')?.setAttribute('width',(before.h+(state.h-before.h)*t)*35);
      $('#boat-lift')?.setAttribute('transform',`translate(0 ${-(lift(before)+(lift(state)-lift(before))*t)})`);
    },token);
    if(token===epoch&&action.type==='rain'&&before.h===0)sound('float');
  }
  if(token!==epoch)return;
  busy=false;renderBoard(state);
  if(state.status==='won'){sound('win');if(!completed.includes(levelIndex))completed.push(levelIndex);try{localStorage.setItem('weather-command:completed',JSON.stringify(completed));}catch{}}
  syncUI();
}
function reset(index=levelIndex) {
  epoch++;drag=null;busy=false;history=[];levelIndex=index;state=initial(index);notice='';renderBoard(state);syncUI();
}
function undo() {
  if(!history.length)return;epoch++;drag=null;busy=false;state=history.pop();notice='已撤销：天气、木栅和指令次数一并恢复。';renderBoard(state);syncUI();
}
for(const button of document.querySelectorAll('[data-weather]')) {
  const type=button.dataset.weather;
  if(type==='wind') {button.addEventListener('click',()=>{unlockAudio();notice='按住小船拖出风向，或点下方四个箭头。';syncUI();board.focus({preventScroll:true});});continue;}
  const show=()=>{preview({type});button.classList.add('previewing');};
  button.addEventListener('pointerdown',()=>{unlockAudio();show();});
  button.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse')show();});
  button.addEventListener('focus',show);
  button.addEventListener('pointerleave',clearPreview);button.addEventListener('pointercancel',clearPreview);button.addEventListener('blur',clearPreview);
  button.addEventListener('click',()=>submit({type}));
}
for(const button of document.querySelectorAll('[data-dir]')) {
  const action={type:'wind',dir:button.dataset.dir};
  button.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse')preview(action);});button.addEventListener('focus',()=>preview(action));button.addEventListener('pointerleave',clearPreview);button.addEventListener('blur',clearPreview);button.addEventListener('click',()=>submit(action));
}
board.addEventListener('pointerdown',e=>{
  if(busy||state.status!=='playing'||drag||!e.isPrimary||e.button!==0||!e.target.closest('#ship'))return;
  e.preventDefault();unlockAudio();drag={id:e.pointerId,x:e.clientX,y:e.clientY,dir:null};board.setPointerCapture(e.pointerId);
});
board.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.id)return;
  const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(Math.hypot(dx,dy)<12){drag.dir=null;clearPreview();return;}
  drag.dir=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');preview({type:'wind',dir:drag.dir});
});
board.addEventListener('pointerup',e=>{
  if(!drag||e.pointerId!==drag.id)return;
  const dir=drag.dir;drag=null;if(board.hasPointerCapture(e.pointerId))board.releasePointerCapture(e.pointerId);
  const rect=board.getBoundingClientRect();clearPreview();
  if(dir&&e.clientX>=rect.left&&e.clientX<=rect.right&&e.clientY>=rect.top&&e.clientY<=rect.bottom)submit({type:'wind',dir});
});
board.addEventListener('pointercancel',()=>{drag=null;clearPreview();});board.addEventListener('lostpointercapture',()=>{drag=null;clearPreview();});
board.addEventListener('keydown',e=>{const dir={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'}[e.key];if(dir){e.preventDefault();submit({type:'wind',dir});}if(e.key==='Escape'){drag=null;clearPreview();}});
$('#undo').addEventListener('click',undo);$('#restart').addEventListener('click',()=>reset());
$('#result-action').addEventListener('click',()=>reset(state.status==='won'?(levelIndex+1)%levels.length:levelIndex));
$('#level-nav').addEventListener('click',e=>{const b=e.target.closest('[data-level]');if(b)reset(Number(b.dataset.level));});
$('#mute').addEventListener('click',()=>{unlockAudio();muted=!muted;if(master)master.gain.value=muted?0:.23;try{localStorage.setItem('weather-command:muted',String(muted));}catch{}syncUI();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){drag=null;clearPreview();}});
renderBoard(state);syncUI();
