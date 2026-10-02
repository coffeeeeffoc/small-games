import {GUESTS,GHOSTS,LEVELS,DT,createGame,activeAt,nextChange,comfortable,command,tick,forecast} from './rules.js';
const $=q=>document.querySelector(q);
let level=0, state=createGame(), selected=0, delay=0, running=false, paused=false, muted=false, audio=null, seen=0, last=0, accumulator=0, previewTarget=null, previewCache='', previewAt=-1;
const reactions=new Map();
const palettes=[['#edd19a','#c6975c','#fae7b8'],['#a66061','#693d45','#bb807b'],['#658572','#35574c','#a4b59a']];
function ghostArt(id) {
 if(id==='bell')return '<svg viewBox="0 0 70 80" aria-hidden="true"><path d="M12 60Q12 29 35 29Q58 29 58 60Z" fill="#e7b659" stroke="#624e2b" stroke-width="3"/><path d="M7 61H63V68H7Z" fill="#b27d32" stroke="#624e2b" stroke-width="3"/><circle cx="35" cy="25" r="6" fill="#edcc7b"/><path d="M22 49Q22 38 28 37" fill="none" stroke="#fff1b8" stroke-width="4"/></svg>';
 return `<svg viewBox="0 0 70 80" aria-hidden="true">${id===0?'<rect x="7" y="5" width="56" height="67" rx="6" fill="#a17842" stroke="#4c4231" stroke-width="3"/><rect x="13" y="11" width="44" height="55" rx="22" fill="#375749"/>':''}<path d="M14 65Q8 51 14 32Q17 15 35 15Q54 14 58 36L63 62L52 59L46 70L35 63L24 71Z" fill="#f2ecd5" stroke="#5c6759" stroke-width="2"/><ellipse cx="27" cy="36" rx="4" ry="7" fill="#283f36"/><ellipse cx="44" cy="36" rx="4" ry="7" fill="#283f36"/><path d="M29 50Q36 58 43 48" fill="none" stroke="#283f36" stroke-width="3"/>${id===0?'<path d="M24 60L34 56L43 62L34 65Z" fill="#aa5050"/>':id===1?'<path d="M17 74L29 72M44 73L55 74" stroke="#c98c73" stroke-width="8" stroke-linecap="round"/>':'<path d="M12 24Q15 4 34 4Q55 5 58 24Z" fill="#d8ac51" stroke="#6e6039" stroke-width="3"/><path d="M7 25H63M35 5V21" stroke="#8d793f" stroke-width="4"/><circle cx="9" cy="54" r="8" fill="#dce9dc"/><circle cx="61" cy="57" r="7" fill="#dce9dc"/>'}</svg>`;
}
function guestArt(id,mood) {
 const mouth=mood==='panic'?'<ellipse cx="222" cy="99" rx="9" ry="10" fill="#7e463c"/>':mood==='happy'?'<path d="M211 96Q222 116 233 96Z" fill="#813f37"/><path d="M215 100H228" stroke="#fff5d4" stroke-width="3"/>':'<path d="M215 103Q222 99 228 103" fill="none" stroke="#814e3e" stroke-width="3"/>';
 const face=`<ellipse cx="223" cy="83" rx="29" ry="31" fill="#efbc91" stroke="#5b4b3b" stroke-width="2.5"/><ellipse cx="210" cy="82" rx="6" ry="8" fill="#fff5dc"/><ellipse cx="234" cy="82" rx="6" ry="8" fill="#fff5dc"/><circle cx="211" cy="83" r="3" fill="#394339"/><circle cx="233" cy="83" r="3" fill="#394339"/><path d="M220 87L217 93L225 92" fill="none" stroke="#c67f66" stroke-width="2"/>${mouth}<circle cx="200" cy="95" r="6" fill="#d78474" opacity=".5"/><circle cx="244" cy="95" r="6" fill="#d78474" opacity=".5"/>`;
 if(id===0)return `<g class="guest-body"><ellipse cx="227" cy="163" rx="49" ry="8" fill="#3c342955"/><path d="M204 136L201 158L182 160M237 137L248 157L263 157" fill="none" stroke="#413e35" stroke-width="12" stroke-linecap="round"/><path d="M190 112Q219 100 249 112L251 146Q219 155 188 144Z" fill="#fff0cd" stroke="#68533c" stroke-width="3"/>${face}<path d="M195 64L191 42Q173 28 192 18Q200 12 208 23Q213 5 231 13Q244 14 242 27Q263 17 270 35Q274 46 251 51L251 64Z" fill="#fff2d6" stroke="#9a865f" stroke-width="3"/><path d="M194 53L252 49" stroke="#c7b694" stroke-width="6"/><path d="M207 94Q222 84 237 94Q228 102 222 95Q216 103 207 94" fill="#4a4034"/><path d="M209 111L220 117L231 110L223 129Z" fill="#a95848"/><g class="hand"><path d="M244 121Q276 146 292 110" fill="none" stroke="#fff0cd" stroke-width="13"/><ellipse cx="302" cy="106" rx="38" ry="5" fill="#57473c"/><path d="M277 103V87H323V104Z" fill="#fff1d4" stroke="#b97961" stroke-width="2"/><path d="M277 89Q285 102 292 89Q303 102 310 89Q317 97 323 89" fill="#d16e68"/><circle cx="288" cy="85" r="5" fill="#a74845"/><circle cx="305" cy="82" r="5" fill="#a74845"/><circle cx="318" cy="85" r="5" fill="#a74845"/></g><path d="M191 120L176 138" stroke="#fff0cd" stroke-width="13" stroke-linecap="round"/><g class="crumbs" fill="#f8eed2"><circle cx="294" cy="54" r="5"/><circle cx="328" cy="70" r="6"/><circle cx="270" cy="72" r="4"/></g></g>`;
 if(id===1)return `<g class="guest-body"><ellipse cx="226" cy="164" rx="50" ry="7" fill="#3c293455"/><path d="M208 137L197 156L184 157M234 135L247 158L258 156" fill="none" stroke="#edbe9b" stroke-width="11" stroke-linecap="round"/><path d="M181 160H201M244 161H263" stroke="#f4d4b0" stroke-width="8" stroke-linecap="round"/><path d="M197 107Q221 98 246 111L255 144Q226 154 187 142Z" fill="#d9a4a0" stroke="#683b49" stroke-width="3"/><path d="M194 113L173 127L187 137" fill="none" stroke="#d9a4a0" stroke-width="13" stroke-linecap="round"/><path d="M190 88Q168 62 192 51Q183 27 208 30Q227 18 242 37Q274 30 263 58Q281 83 254 107L244 64Z" fill="#4a3436" stroke="#342f29" stroke-width="3"/>${face}<path d="M194 68Q210 38 227 53Q239 46 254 67L245 54Q221 38 196 54Z" fill="#4a3436"/><path d="M191 48L181 31L200 35L202 48L217 36L218 56Z" fill="#c98597" stroke="#773e59" stroke-width="2"/><g class="hand"><path d="M246 117L270 127L291 82" fill="none" stroke="#edbe9b" stroke-width="11" stroke-linecap="round"/><rect x="280" y="56" width="26" height="43" rx="5" fill="#354842" stroke="#efd0ad" stroke-width="3"/><circle cx="290" cy="65" r="3" fill="#b8c8ac"/></g><path d="M203 119L235 126M201 133L240 139" stroke="#f5d1b1" stroke-width="4" stroke-dasharray="4 7"/></g><rect class="camera-flash" width="600" height="180" fill="#fff3d6"/>`;
 return `<g class="guest-body"><ellipse cx="226" cy="163" rx="49" ry="7" fill="#273b3255"/><path d="M206 137L199 158L183 159M235 137L245 158L263 159" fill="none" stroke="#35483b" stroke-width="12" stroke-linecap="round"/><path d="M197 109L244 108L254 148L187 148Z" fill="#aa9972" stroke="#484b37" stroke-width="3"/><path d="M209 109L224 145L238 109M226 130V149" stroke="#776f4e" stroke-width="3"/>${face}<path d="M191 62Q188 32 220 31Q250 26 258 61Z" fill="#95805b" stroke="#534a36" stroke-width="3"/><path d="M183 64Q223 50 265 64L270 71Q226 62 183 72Z" fill="#ad9671" stroke="#534a36" stroke-width="3"/><path d="M217 33L211 59M239 36L240 59" stroke="#6e6249" stroke-width="3"/><g class="hand"><path d="M244 117L284 109" stroke="#aa9972" stroke-width="14" stroke-linecap="round"/><path d="M287 97L382 53L393 130L289 111Z" class="light-cone" fill="#f6e9a4"/><path d="M266 100H295V117H266Z" fill="#41574c" stroke="#263c31" stroke-width="3"/><ellipse cx="297" cy="108" rx="6" ry="10" fill="#e4d482"/></g><path d="M192 120L170 113" stroke="#aa9972" stroke-width="12" stroke-linecap="round"/><path d="M152 96L182 102L178 132L146 125Z" fill="#d7c699" stroke="#665d41" stroke-width="2"/><path d="M157 104L175 108M155 112L173 116" stroke="#8e825f" stroke-width="2"/></g>`;
}
function scene(id,mood) {
 const [wall,trim,accent]=palettes[id];
 const wallpaper=Array.from({length:14},(_,i)=>`<path d="M${i*45+6} 0V155" stroke="${trim}" stroke-width="1" opacity=".3"/><path d="M${i*45} 36l5 7l-5 7l-5-7ZM${i*45+23} 100l4 6l-4 6l-4-6Z" fill="${accent}" opacity=".17"/>`).join('');
 const furniture=id===0?'<path d="M53 94H140V101H53ZM62 101V155M130 101V155" stroke="#7f6244" stroke-width="8" fill="#a37a4a"/><path d="M53 97Q70 109 86 101Q107 113 140 99L140 119L52 117Z" fill="#f9e4b7"/><path d="M73 93V73H114V93Z" fill="#f6e8c5" stroke="#b48860" stroke-width="2"/><path d="M73 75H114" stroke="#c8836b" stroke-width="6"/><circle cx="94" cy="70" r="5" fill="#b6574f"/><rect x="395" y="45" width="101" height="107" rx="5" fill="#ab875b" stroke="#886844" stroke-width="4"/><path d="M399 79H493M399 116H493" stroke="#e5bf81" stroke-width="5"/><g fill="#fff0c3"><path d="M409 76V63H430V76ZM448 113V95H478V113ZM412 146V132H438V146Z"/><ellipse cx="469" cy="72" rx="12" ry="5"/></g>':id===1?'<path d="M358 139V92Q425 60 505 93V148Z" fill="#623f44" stroke="#50333a" stroke-width="5"/><path d="M350 125Q429 111 522 124V156H350Z" fill="#d59a97" stroke="#703e4a" stroke-width="3"/><path d="M365 106Q389 93 416 106L420 129L365 124ZM439 105L484 105L498 128L439 124Z" fill="#efd0b4"/><path d="M399 128L490 128L503 157H385Z" fill="#974e5d"/><path d="M65 147L98 101L125 149M98 100V60" fill="none" stroke="#403a36" stroke-width="5"/><ellipse cx="97" cy="59" rx="25" ry="34" fill="none" stroke="#f5d9ab" stroke-width="8"/><ellipse cx="97" cy="59" rx="17" ry="26" fill="none" stroke="#bd986f" stroke-width="2"/><path d="M18 0Q44 51 23 95L15 122V0M148 0Q126 50 151 104L167 124V0" fill="#733d49"/><path d="M18 90L39 85M144 86L166 95" stroke="#d5ae6b" stroke-width="7"/>':'<path d="M44 57H144V124H44Z" fill="#a08d66" stroke="#3c5141" stroke-width="5"/><path d="M53 68L90 62L99 104L57 112ZM108 66L133 69L130 94L104 90Z" fill="#d4c498"/><path d="M64 79L123 83L87 110" stroke="#9c5d4b" stroke-width="2" fill="none"/><path d="M358 91H510V101H358ZM370 101V158M494 101V158" stroke="#3b4e39" stroke-width="9" fill="#718360"/><path d="M394 86L397 67L427 65L433 87Z" fill="#adad84"/><path d="M450 91V45H481V91Z" fill="#d1bc83" stroke="#5b6847" stroke-width="3"/><path d="M445 45L466 25L488 45Z" fill="#386154"/><path d="M466 69V77" stroke="#75866a" stroke-width="2"/>';
 return `<svg class="scene" viewBox="0 0 600 180" preserveAspectRatio="none" aria-hidden="true"><rect width="600" height="180" fill="${wall}"/>${wallpaper}<path d="M0 153H600V180H0Z" fill="${trim}"/><path d="M0 154H600M0 160H600" stroke="#3b352b" stroke-width="2" opacity=".5"/><path d="M50 160L39 180M150 160L147 180M450 160L465 180M550 160L573 180" stroke="#564732" stroke-width="2" opacity=".3"/>${furniture}<path d="M330 0V37" stroke="#6b5b3e" stroke-width="2"/><ellipse class="lamp-glow" cx="330" cy="51" rx="35" ry="27" fill="#fff0b0"/><path d="M319 35L309 53H351L340 35Z" fill="#f4dd9a" stroke="#987b4c" stroke-width="2"/><ellipse cx="330" cy="54" rx="9" ry="4" fill="#fff4c7"/><path d="M550 -10V58Q550 77 566 77H577V190" class="pipe-line"/><path d="M547 -10V60Q547 80 565 80H574V190" class="pipe-shine"/><path d="M539 35H560M566 116H587" stroke="#5e5b40" stroke-width="7"/><rect x="355" y="21" width="41" height="53" rx="8" fill="#5a6b50" stroke="#bc9155" stroke-width="6"/><path d="M365 54Q375 39 386 56M373 37h4" stroke="#b4c098" stroke-width="3" fill="none"/>${guestArt(id,mood)}<path d="M0 5H600" stroke="#fff0bb" stroke-width="5" opacity=".16"/></svg>`;
}
function buildHotel() {
 $('#hotel').innerHTML=LEVELS[level].order.map((id,f)=>`<section class="room ${['chef','streamer','detective'][id]}" data-guest="${id}"><div class="art"></div><button class="room-target" aria-label="安排到${GUESTS[id].name}房间" data-room="${id}"></button><div class="room-label"><span class="floor">${3-f}F</span>${GUESTS[id].name}</div><div class="state-badge"></div><div class="mood-meter" aria-label="恐惧程度"><div class="comfort-band" style="left:${GUESTS[id].low/12*100}%;width:${(GUESTS[id].high-GUESTS[id].low)/12*100}%"></div><div class="fear-needle"></div><div class="mood-word"><span class="mood-text"></span><span class="hearts"></span></div></div><div class="reaction"></div><div class="packing"></div><div class="preview"></div><div class="jobs"></div></section>`).join('');
 $('#staff').innerHTML=[...GHOSTS,{name:'安抚铃'}].map((g,i)=>`<button class="employee" data-ghost="${i===3?'bell':i}" aria-label="${g.name}" aria-pressed="false">${ghostArt(i===3?'bell':i)}<div><strong>${g.name}</strong><small></small></div></button>`).join('');
}
function sound(kind) {
 if(muted)return;
 try {
   audio ||= new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume().catch(()=>{});
   const notes=kind==='bell'?[660,880]:kind==='win'?[440,550,660,880]:kind==='lose'?[200,160,100]:kind===0?[180,260]:kind===1?[110,75]:[90,150,90];
   notes.forEach((hz,i)=>{const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime+i*.095;o.type=kind===2?'triangle':'sine';o.frequency.setValueAtTime(hz,t);o.frequency.exponentialRampToValueAtTime(hz*.65,t+.15);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.10,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+.25);o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+.28);});
 }catch{/* Audio-less browsers still retain every visual cue. */}
}
function consumeEvents() {
 for(const e of state.events.filter(e=>e.id>seen)) {
   seen=e.id;
   if(e.kind==='scare') {
     sound(e.ghost);
     for(const h of e.hits) {
       const id=h.guest, g=state.guests[id];
       const text=g.fear>=GUESTS[id].red?'行李！现在就走！':id===0?(h.active?'啊！我的蛋糕！':'咦，奶油会飘？'):id===1?(h.active?'拍到了！这条要火！':'镜头没开……白吓了'):e.ghost===1&&h.active?'只是床单，我看穿了':'这幅画……刚动了！';
       reactions.set(id,{until:state.t+2.3,text,ghost:e.ghost,flash:id===1&&h.active,spill:h.spill});
       const r=$(`[data-guest="${id}"]`);r?.querySelector('.apparition')?.remove();
       const a=document.createElement('div');a.className='apparition';a.innerHTML=ghostArt(e.ghost);a.dataset.until=String(e.t+2);r?.append(a);
     }
     $('#tip').textContent=e.ghost===2?'咚——铜管把声音传给相邻的房间。':'看客人的动作，也看看他们笑没笑。';
   }
   if(e.kind==='calm'){sound('bell');reactions.set(e.target,{until:state.t+2,text:'呼……再住一晚。',calm:true});$('#tip').textContent='安抚生效。铃需要休息25秒。';}
   if(e.kind==='cancel')$('#tip').textContent='及时撤回：这次不会出场，也不消耗休息时间。';
 }
}
function render() {
 document.querySelectorAll('.apparition').forEach(a=>{if(Number(a.dataset.until)<=state.t)a.remove();});
 $('#night-name').textContent=LEVELS[level].name;
 const min=(22*60+Math.floor(state.t*4))%(24*60);$('#clock').textContent=`☽ ${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`;
 $('#night-left').textContent=`${Math.ceil(120-state.t)}秒`;
 for(let id=0;id<3;id++) {
   const r=$(`[data-guest="${id}"]`),g=state.guests[id],spec=GUESTS[id],act=activeAt(state,id),mood=g.fear>=spec.red?'panic':comfortable(state,id)?'happy':g.fear>spec.high?'nervous':'bored';
   const react=reactions.get(id);const hot=react&&react.until>state.t;
   const key=`${act}-${mood}-${hot?react.until:''}`;
   if(r.dataset.art!==key){r.dataset.art=key;r.querySelector('.art').innerHTML=scene(id,mood);}
   r.classList.toggle('active',act);r.classList.toggle('jump',!!hot&&!react.calm);r.classList.toggle('calmed',!!hot&&!!react.calm);r.classList.toggle('flash',!!hot&&!!react.flash);
   r.querySelector('.pipe-line').classList.toggle('pipe-active',!!hot&&react.ghost===2);
   const change=nextChange(state,id);
   r.querySelector('.state-badge').textContent=`${act?spec.active:spec.idle}${change<=8?' · '+Math.ceil(change)+'秒':''}`;
   r.querySelector('.fear-needle').style.left=`${Math.min(97,g.fear/12*100)}%`;
   r.querySelector('.mood-text').textContent={panic:'要退房！',happy:'刚刚好',nervous:'有点过了',bored:'没被吓到'}[mood];
   r.querySelector('.mood-meter').setAttribute('aria-label',`${spec.name}恐惧${g.fear.toFixed(1)}，合适${spec.low}至${spec.high}，满意累计${g.happy.toFixed(1)}秒，目标${LEVELS[level].target}秒`);
   r.querySelector('.hearts').textContent=Array.from({length:3},(_,i)=>g.happy/LEVELS[level].target>=(i+1)/3-1e-8?'♥':'♡').join('');
   r.querySelector('.reaction').textContent=hot?react.text:'';
   r.querySelector('.packing').textContent=g.fear>=spec.red?`▣ 收拾行李 ${Math.ceil(5-g.packing)}秒`:'';
   const jobs=r.querySelector('.jobs'), assigned=state.ghosts.map((a,i)=>({i,job:a.job})).filter(a=>a.job?.target===id), jobKey=assigned.map(a=>`${a.i}:${a.job.at}`).join(',');
   if(jobs.dataset.key!==jobKey){jobs.dataset.key=jobKey;jobs.innerHTML=assigned.map((a,j)=>`<button class="pending" style="right:${8+j*16}%" data-cancel="${a.i}" aria-label="撤回${GHOSTS[a.i].name}">${ghostArt(a.i)}<span></span></button>`).join('');}
   for(const a of assigned)jobs.querySelector(`[data-cancel="${a.i}"] span`).textContent=`${Math.ceil(a.job.at-state.t)}秒 · 撤回`;
 }
 for(const b of document.querySelectorAll('[data-ghost]')) {
   const id=b.dataset.ghost==='bell'?'bell':Number(b.dataset.ghost),g=id==='bell'?null:state.ghosts[id],rest=Math.max(0,(g?g.ready:state.bell)-state.t);
   b.classList.toggle('selected',selected===id);b.setAttribute('aria-pressed',String(selected===id));b.classList.toggle('resting',rest>0);b.classList.toggle('assigned',!!g?.job);
   b.querySelector('small').textContent=g?.job?'已安排 · 点撤回':rest>0?`休息 ${Math.ceil(rest)}秒`:id==='bell'?'降温 · 救场':id===0?'轻轻敲镜框':id===1?'一下吓个够':'上下层也听见';
 }
 $('#selection-text').textContent=selected==='bell'?'安抚铃 → 点房间救场':`${GHOSTS[selected].name} → ${delay?delay+'秒后':'立即'}出场`;
 if(previewTarget!==null&&(state.t-previewAt>=.2||previewCache!==`${selected}-${delay}-${state.actions.length}-${previewTarget}`))drawPreview(previewTarget);
}
function clearPreview(){previewTarget=null;document.querySelectorAll('.preview').forEach(p=>{p.textContent='';p.classList.remove('danger')});document.querySelectorAll('.aim').forEach(p=>p.classList.remove('aim'));}
function drawPreview(id) {
 previewTarget=id;previewAt=state.t;previewCache=`${selected}-${delay}-${state.actions.length}-${id}`;
 document.querySelectorAll('.preview').forEach(p=>p.textContent='');document.querySelectorAll('.aim').forEach(r=>r.classList.remove('aim'));
 $(`[data-guest="${id}"]`)?.classList.add('aim');
 const f=forecast(state,selected,id,selected==='bell'?0:delay);if(!f)return;
 const ids=selected==='bell'?[id]:f.hits.map(h=>h.guest);
 for(const i of ids){const p=$(`[data-guest="${i}"] .preview`),fear=f.fears[i];p.textContent=`${i!==id?'↳ 串房 ':''}${fear.toFixed(1)} · ${fear>=GUESTS[i].red?'会收拾行李':fear>=GUESTS[i].low&&fear<=GUESTS[i].high?'刚刚好':'偏'+(fear<GUESTS[i].low?'轻':'重')}`;p.classList.toggle('danger',fear>=GUESTS[i].red);}
}
function place(id) {
 if(!running||paused)return;
 if(command(state,selected,id,selected==='bell'?0:delay)){consumeEvents();clearPreview();render();}
 else $('#tip').textContent='这位员工正在忙。可以换鬼，或点已安排的鬼撤回。';
}
function showPicker(){running=false;paused=false;document.body.classList.remove('paused');$('#overlay').hidden=false;$('#dialog-title').textContent='今晚，吓得刚刚好。';$('#dialog-text').innerHTML='看准客人的动作，安排鬼员工出场。<br>笑着受惊是好评，吓到收拾行李就救场。';$('#night-picker').hidden=false;$('#night-hint').hidden=false;$('#start').hidden=false;$('#continue').hidden=true;$('#choose-night').hidden=true;pick(level);}
function pick(i){level=i;state=createGame(i);seen=0;reactions.clear();buildHotel();render();$('#night-hint').textContent=LEVELS[i].hint;$('#start').textContent=`开始第${['一','二','三'][i]}夜`;document.querySelectorAll('[data-level]').forEach(b=>{b.classList.toggle('selected',+b.dataset.level===i);b.setAttribute('aria-pressed',String(+b.dataset.level===i));});}
function start(){state=createGame(level);seen=0;reactions.clear();selected=level===2?'bell':0;delay=0;setDelay(0);paused=false;running=true;accumulator=0;last=performance.now();document.body.classList.remove('paused');$('#overlay').hidden=true;$('#tip').textContent=LEVELS[level].hint;buildHotel();render();sound('bell');$('#pause').focus();}
function setDelay(d){delay=d;document.querySelectorAll('[data-delay]').forEach(b=>{b.classList.toggle('selected',+b.dataset.delay===d);b.setAttribute('aria-pressed',String(+b.dataset.delay===d));});clearPreview();}
function pause(reason='歇一口气。'){if(!running||paused)return;paused=true;endDrag({clientX:0,clientY:0},true);clearPreview();document.body.classList.add('paused');audio?.suspend().catch(()=>{});$('#overlay').hidden=false;$('#dialog-title').textContent=reason;$('#dialog-text').textContent='夜钟、引信和客人都已暂停。准备好后，亲自按下继续。';$('#night-picker').hidden=true;$('#night-hint').hidden=true;$('#start').hidden=true;$('#continue').hidden=false;$('#choose-night').hidden=true;$('#dialog-foot').textContent='暂停不会消耗夜班时间';$('#continue').focus();}
function finish(){running=false;clearPreview();sound(state.status==='won'?'win':'lose');$('#overlay').hidden=false;$('#dialog-title').textContent=state.status==='won'?'今晚，五星惊吓。':'哎呀，夜班翻车了。';$('#dialog-text').textContent=state.status==='won'?`${state.t.toFixed(1)}秒，三位客人笑着受惊，舍不得退房。`:state.reason+'。换个时机，再试一次。';$('#night-picker').hidden=true;$('#night-hint').hidden=true;$('#start').hidden=false;$('#start').textContent='同一夜重试';$('#continue').hidden=true;$('#choose-night').hidden=false;$('#dialog-foot').textContent=state.guests.map((g,i)=>`${GUESTS[i].name} ${g.happy.toFixed(1)}/${LEVELS[level].target}秒`).join(' · ');$('#start').focus();}
$('#night-picker').innerHTML=LEVELS.map((l,i)=>`<button class="night-key" data-level="${i}" aria-pressed="false">第${['一','二','三'][i]}夜<br>${l.tag}</button>`).join('');
$('#night-picker').addEventListener('click',e=>{const b=e.target.closest('[data-level]');if(b)pick(+b.dataset.level)});
$('#start').addEventListener('click',start);$('#choose-night').addEventListener('click',showPicker);
$('#continue').addEventListener('click',()=>{paused=false;document.body.classList.remove('paused');$('#overlay').hidden=true;last=performance.now();accumulator=0;if(!muted)audio?.resume().catch(()=>{});$('#pause').focus();});
$('#pause').addEventListener('click',()=>pause());$('#restart').addEventListener('click',start);
$('#mute').addEventListener('click',()=>{muted=!muted;$('#mute').textContent=muted?'♪̸':'♫';$('#mute').setAttribute('aria-label',muted?'开启声音':'静音');$('#mute').setAttribute('aria-pressed',String(muted));if(muted)audio?.suspend().catch(()=>{});else if(!paused)sound('bell');});
document.querySelectorAll('[data-delay]').forEach(b=>b.addEventListener('click',()=>{setDelay(+b.dataset.delay);render();}));
$('#hotel').addEventListener('click',e=>{const c=e.target.closest('[data-cancel]');if(c){if(running&&!paused&&command(state,'cancel',+c.dataset.cancel)){consumeEvents();render();}return;}const b=e.target.closest('[data-room]');if(b)place(+b.dataset.room);});
$('#hotel').addEventListener('pointerover',e=>{const b=e.target.closest('[data-room]');if(b&&running&&!paused)drawPreview(+b.dataset.room)});$('#hotel').addEventListener('pointerleave',clearPreview);
$('#hotel').addEventListener('focusin',e=>{if(e.target.dataset.room&&running)drawPreview(+e.target.dataset.room)});
let dragging=null,ignoreClick=false;
$('#staff').addEventListener('click',e=>{if(ignoreClick){ignoreClick=false;return;}const b=e.target.closest('[data-ghost]');if(!b)return;selected=b.dataset.ghost==='bell'?'bell':+b.dataset.ghost;const g=selected==='bell'?null:state.ghosts[selected];if(running&&!paused&&g?.job){command(state,'cancel',selected);consumeEvents();}clearPreview();render();});
$('#staff').addEventListener('pointerdown',e=>{const b=e.target.closest('[data-ghost]');if(!b||!running||paused||e.button>0)return;dragging={id:b.dataset.ghost==='bell'?'bell':+b.dataset.ghost,x:e.clientX,y:e.clientY,pointer:e.pointerId,moved:false,b};b.setPointerCapture(e.pointerId);});
$('#staff').addEventListener('pointermove',e=>{if(!dragging||e.pointerId!==dragging.pointer)return;if(Math.hypot(e.clientX-dragging.x,e.clientY-dragging.y)>8)dragging.moved=true;if(!dragging.moved)return;e.preventDefault();selected=dragging.id;$('#drag-ghost').innerHTML=ghostArt(selected);$('#drag-ghost').style.display='block';$('#drag-ghost').style.transform=`translate(${e.clientX-33}px,${e.clientY-38}px)`;const b=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-guest]');if(b)drawPreview(+b.dataset.guest);else clearPreview();});
function endDrag(e,cancel=false){if(!dragging)return;const d=dragging;dragging=null;$('#drag-ghost').style.display='none';if(d.b.hasPointerCapture(d.pointer))d.b.releasePointerCapture(d.pointer);if(d.moved){e.preventDefault?.();ignoreClick=!cancel&&e.pointerType!=='touch';const b=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-guest]');if(!cancel&&b)place(+b.dataset.guest);else clearPreview();}render();}
$('#staff').addEventListener('pointerup',e=>endDrag(e));$('#staff').addEventListener('pointercancel',e=>endDrag(e,true));
// Native touch drags can suppress the following compatibility click; activate taps on pointerup once.
document.addEventListener('click',e=>{if(e.pointerType==='touch'){e.preventDefault();e.stopImmediatePropagation();}},true);
document.addEventListener('pointerup',e=>{if(e.pointerType==='touch'&&!e.defaultPrevented)e.target.closest('button')?.click();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause('夜班暂离，已停钟。');});window.addEventListener('blur',()=>pause('夜班暂离，已停钟。'));
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if($('#overlay').hidden)pause();return;}if(!$('#overlay').hidden&&e.key==='Tab'){const focus=[...$('#overlay').querySelectorAll('button')].filter(b=>b.offsetParent!==null);if(e.shiftKey&&document.activeElement===focus[0]){e.preventDefault();focus.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===focus.at(-1)){e.preventDefault();focus[0].focus();}}});
function frame(now){const elapsed=last?Math.min(.25,(now-last)/1000):0;last=now;if(running&&!paused){accumulator+=elapsed;while(accumulator>=DT&&state.status==='playing'){tick(state);accumulator-=DT;}consumeEvents();render();if(state.status!=='playing')finish();}requestAnimationFrame(frame);}
// Read-only evidence surface. Tests operate the same visible buttons as players.
window.ghostShiftSnapshot=()=>({...structuredClone(state),paused,muted,selected,delay,audioState:audio?.state||'not-started'});
showPicker();requestAnimationFrame(frame);
