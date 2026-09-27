import {NODES,TYPES,LEVELS,SITES,siteFor,create,step,dispatch,routes,routePoints,position,multiplier,edgeKey} from './simulation.mjs';
const $=id=>document.getElementById(id), svg=$('map'), result=$('result');
let state, paused=true, started=false, selected=null, pendingTarget=null, parkingCursor=null, drag=null, ignoreClick=false, last=0, bank=0, seen=0;
let sound, master, muted=false, reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
try {muted=localStorage.getItem('city-muted')==='true';reduced ||= localStorage.getItem('city-reduced')==='true';} catch {}
const colors=['#c35c43','#367d86','#dfb94a'];
const save=(key,v)=>{try{localStorage.setItem(key,String(v));}catch{}};
function unlock(){try{sound ||= new (window.AudioContext||window.webkitAudioContext)();if(!master){master=sound.createGain();master.connect(sound.destination);}master.gain.value=muted?0:.12;if(sound.state==='suspended'&&!document.hidden)sound.resume();}catch{}}
function tone(kind='click'){
  if(!sound||muted||sound.state!=='running')return;
  const notes=kind==='done'?[523,659,784]:kind==='miss'?[170,130]:kind==='work'?[380]:[480];
  notes.forEach((f,i)=>{const osc=sound.createOscillator(),gain=sound.createGain(),t=sound.currentTime+i*.09;osc.type='sine';osc.frequency.value=f;gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(kind==='work'?.07:.3,t+.01);gain.gain.exponentialRampToValueAtTime(.001,t+.14);osc.connect(gain);gain.connect(master);osc.start(t);osc.stop(t+.16);osc.onended=()=>{osc.disconnect();gain.disconnect();};});
}
const icon={
 fire:'<path fill="#d76240" d="M0-19C8-9 4-5 11-10C26 10 9 23-3 20C-20 16-20 4-11-7C-13 7 1 2 0-19Z"/><path fill="#ffd26d" d="M1-1C14 11 5 20-2 17C-9 13-6 7 1-1Z"/>',
 pet:'<path fill="#fbf5df" d="M-15-6L-16-20L-5-11Q0-14 5-11L16-20L15-5C26 18-26 18-15-6Z"/><circle cx="-6" cy="1" r="2" fill="#345e52"/><circle cx="6" cy="1" r="2" fill="#345e52"/><path d="M-2 6L0 8L2 6" stroke="#b75c43" fill="none"/>',
 traffic:'<path d="M-9 15L-2-18H4L14 15Z" fill="#eead52"/><path d="M-5-3H8M-8 8H11" stroke="#fff2d2" stroke-width="5"/><path d="M-16 18H20" stroke="#694f35" stroke-width="5" stroke-linecap="round"/>',
 power:'<path d="M4-22L-15 4H-2L-5 23L17-6H3Z" fill="#fbdb78"/>'
};
function town(){
 const tree=(x,y,s=1)=>`<g transform="translate(${x} ${y}) scale(${s})"><ellipse cy="9" rx="14" ry="8" fill="#34564e25"/><path d="M0-3V15" stroke="#8c7252" stroke-width="4"/><circle cy="-7" r="14" fill="#47715c"/><circle cx="-5" cy="-13" r="10" fill="#668a63"/><circle cx="5" cy="-16" r="6" fill="#87a873"/><path d="M0-13V3M0-2L-6-8" stroke="#365944" stroke-width="1.5"/></g>`;
 const house=(x,y,w=70,h=45,color='#b76146')=>`<g transform="translate(${x} ${y})"><rect x="5" y="8" width="${w}" height="${h}" rx="3" fill="#2e544d25"/><rect y="8" width="${w}" height="${h-8}" rx="3" fill="#f7eacb" stroke="#d1c3a7"/><path d="M-5 9L${w/2}-7L${w+5} 9V25H-5Z" fill="${color}"/><path d="M-3 13H${w+3}M-3 18H${w+3}M0 23H${w}" stroke="#f0b184" stroke-width="1" opacity=".55"/><path d="M${w/2}-5V22" stroke="#883f3433" stroke-width="3"/><rect x="8" y="30" width="13" height="11" rx="1" fill="#446e68"/><path d="M14.5 30V41M8 35.5H21" stroke="#f9e8c2"/><rect x="${w-21}" y="30" width="13" height="11" fill="#446e68"/><path d="M${w-14.5} 30V41M${w-21} 35.5H${w-8}" stroke="#f9e8c2"/><rect x="${w/2-6}" y="29" width="12" height="${h-29}" fill="#907653"/><rect x="${w-18}" y="-3" width="8" height="13" fill="#d9c4a3"/></g>`;
 const label=(x,y,text)=>`<text class="place-label" x="${x}" y="${y}" text-anchor="middle">${text}</text>`;
 const flowers=(x,y)=>`<g transform="translate(${x} ${y})"><rect x="-12" y="-4" width="24" height="8" rx="4" fill="#748d58"/>${[-8,0,8].map((xx,i)=>`<circle cx="${xx}" r="3" fill="${i===1?'#e8bf62':'#d98e75'}"/>`).join('')}</g>`;
 const bench=(x,y)=>`<g transform="translate(${x} ${y})"><path d="M-9 1V8M9 1V8" stroke="#657568" stroke-width="3"/><path d="M-13-4H13M-13 1H13" stroke="#ab8657" stroke-width="4"/></g>`;
 return `<defs><pattern id="grass" width="19" height="19" patternUnits="userSpaceOnUse"><path d="M3 8l2-3 2 3M13 16l2-2" stroke="#70966c" opacity=".16" fill="none"/></pattern><pattern id="paving" width="14" height="10" patternUnits="userSpaceOnUse"><rect width="14" height="10" fill="#e8dfc9"/><path d="M0 0H14V10M7 0V5H0" fill="none" stroke="#d9d1bc" stroke-width=".6"/></pattern><pattern id="stripe" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="14" fill="#e9bd6255"/></pattern><filter id="shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="3" stdDeviation="1.5" flood-color="#244b3f" flood-opacity=".22"/></filter></defs>
 <rect width="600" height="540" fill="#b9caa4"/><rect width="600" height="540" fill="url(#grass)"/>
 <path d="M576 0Q547 45 572 99T580 212T578 379T584 540H600V0Z" fill="#8bbabb"/><path d="M578 0Q549 45 574 99T582 212T580 379T586 540" fill="none" stroke="#e4e7c9" stroke-width="6"/>
 <g stroke="#f3ecd8" stroke-width="5" fill="url(#paving)"><rect x="121" y="45" width="144" height="87" rx="8"/><rect x="340" y="43" width="125" height="87" rx="8"/><rect x="122" y="411" width="136" height="96" rx="8"/><rect x="338" y="409" width="137" height="99" rx="8"/><rect x="18" y="204" width="44" height="100" rx="8"/><rect x="537" y="216" width="37" height="112" rx="8"/></g>
 ${Object.values(SITES).map(({node,site:[x,y]})=>`<path d="M${NODES[node][0]} ${NODES[node][1]}H${x}V${y}" stroke="#f2ecd9" stroke-width="27" fill="none"/><path d="M${NODES[node][0]} ${NODES[node][1]}H${x}V${y}" stroke="#d6ceb7" stroke-width="21" fill="none"/>`).join('')}
 <path d="M300 370V473" stroke="#f2ecd9" stroke-width="27" fill="none"/><path d="M300 370V473" stroke="#d6ceb7" stroke-width="21" fill="none"/>
 <g fill="none" stroke="#8ba078" stroke-width="5" stroke-linecap="round"><path d="M126 50V123H135M166 127H260V92M346 48V122H458M127 451V502H151M170 505H253V426M342 412V438M342 478V504H472V460"/></g>
 <g stroke="#f8ecd2" stroke-width="2" fill="none"><path d="M127 51V122M168 128H258M128 451V500M174 505H249M347 505H470" stroke-dasharray="2 4"/></g>
 <g fill="#79926f"><rect x="193" y="113" width="32" height="5" rx="2"/><rect x="357" y="439" width="29" height="5" rx="2"/></g>
 <g fill="#f6e4b7" stroke="#d9bd83"><circle cx="235" cy="110" r="7"/><circle cx="430" cy="480" r="7"/></g>
 <g stroke="#b99763" stroke-width="3"><path d="M225 109v7M245 109v7M420 479v7M440 479v7"/></g>
 <g fill="none" stroke="#607d76" stroke-width="1.5"><circle cx="404" cy="110" r="4"/><circle cx="418" cy="110" r="4"/><path d="M404 110l6-9 8 9h-14l7-6M410 101h-4M418 110l-2-11h4"/></g>
 <g fill="#f5d293" stroke="#456f71" stroke-width="3"><circle cx="272" cy="257" r="2.5" stroke="none"/><path d="M272 262v7m-3 3 3-3 3 3"/><circle cx="432" cy="340" r="2.5" stroke="none"/><path d="M432 345v7m-3 3 3-3 3 3"/></g>
 ${house(173,58,73,48)}${house(359,54,86,53,'#8b9b81')}${house(176,448,60,46)}${house(351,450,67,47)}${house(18,209,37,29)}
 ${label(196,126,'花开巷 · 01')}${label(402,125,'社区卫生站')}${label(199,503,'梧桐里 · 02')}${label(408,503,'河畔居民楼')}
 <path d="M390 90H411M400.5 80V100" stroke="#f4eedc" stroke-width="5"/>
 <rect x="124" y="196" width="137" height="137" rx="17" fill="#739c73" stroke="#edf0d9" stroke-width="5"/>
 <path d="M244 160V225Q251 250 224 276T172 313M133 225Q195 211 225 251M134 289Q174 275 211 297L249 319" fill="none" stroke="#dedbbd" stroke-width="11"/>
 <path d="M149 241Q161 225 182 240T199 272Q182 290 159 273T149 241" fill="#82b2ae" stroke="#e0ddbd" stroke-width="5"/><path d="M152 249Q170 242 182 252M166 266Q179 261 188 268" stroke="#b4d2c2" stroke-width="2" fill="none"/>
 <path d="M175 236L183 270" stroke="#a58058" stroke-width="12"/><path d="M171 235L179 271M179 233L187 269" stroke="#e5c693" stroke-width="2"/>
 ${bench(224,304)}${bench(144,308)}${flowers(212,213)}${flowers(145,221)}${flowers(247,288)}${tree(211,266,.68)}${label(193,329,'云溪公园')}
 <rect x="338" y="201" width="128" height="126" rx="6" fill="url(#paving)" stroke="#8e9b89" stroke-width="3"/>
 <path d="M360 160V242" stroke="#ded8c3" stroke-width="25"/><path d="M339 212V322H466V204H381" fill="none" stroke="#7c8f81" stroke-width="5" stroke-dasharray="2 5"/>
 <rect x="383" y="218" width="60" height="59" rx="3" fill="#5e7772"/><rect x="388" y="223" width="49" height="40" rx="3" fill="#a8b3a0"/><path d="M394 227V256M403 227V256M412 227V256M421 227V256M430 227V256" stroke="#72877b" stroke-width="3"/><path d="M394 215V207H435V215M403 207V201M425 207V201" fill="none" stroke="#556860" stroke-width="3"/>
 <path d="M414 231L403 247H413L409 258L426 240H415Z" fill="#f5d16b"/>
 <rect x="351" y="284" width="48" height="20" rx="3" fill="#f5e5b8"/><text x="375" y="298" text-anchor="middle" font-size="10" fill="#796342">⚡ 高压</text>${label(404,320,'城西配电站')}
 <rect x="328" y="386" width="71" height="29" rx="5" fill="#d7c7a3" stroke="#f2e5bf" stroke-width="3"/>
 <g id="road-debris" transform="translate(373 394)"><path d="M-20 4L19-6M-7-8L0 2L-8 11M7-9L11-4" stroke="#8c7253" stroke-width="5" stroke-linecap="round"/><circle cx="18" cy="-5" r="10" fill="#668762"/></g>
 ${[332,396].map(x=>`<path d="M${x-4} 405L${x} 393L${x+4} 405Z" fill="#d98643" stroke="#fff2d3" stroke-width="1.5"/>`).join('')}
 <g transform="translate(271 467)"><rect width="57" height="39" rx="3" fill="#f4e3c1"/><rect x="-3" y="-4" width="63" height="14" rx="3" fill="#b95e45"/><text x="28" y="6" text-anchor="middle" fill="#fff2d3" font-size="9">小城救援站</text><path d="M9 18H24V37H9ZM33 18H48V37H33Z" fill="#738d7d"/></g>
 ${[[24,65],[52,104],[258,77],[328,73],[486,80],[547,95],[17,183],[276,205],[276,318],[480,233],[479,309],[545,241],[32,324],[37,454],[91,481],[252,443],[486,477],[548,465]].map(([x,y])=>tree(x,y,.72)).join('')}
 ${[[143,68],[251,302],[348,430],[435,477],[219,424],[543,315],[47,287]].map(([x,y])=>flowers(x,y)).join('')}
 <g stroke="#768572" stroke-width="2" fill="#f6df9c">${[[65,137],[325,137],[485,137],[65,394],[279,394],[488,394]].map(([x,y])=>`<path d="M${x} ${y}v-18h6"/><circle cx="${x+6}" cy="${y-18}" r="3"/>`).join('')}</g>`;
}
const fireOffset=e=>e.node==='A'?[35,-18]:e.node==='D'?[34,21]:[-35,23];
function build(){
 $('assigned-events').replaceChildren();$('assigned-jobs').open=false;
 document.querySelectorAll('.assignment-flight').forEach(el=>el.remove());
 svg.innerHTML=town()+`<g id="roads">${state.edges.map(([a,b])=>{const [x,y]=NODES[a],[xx,yy]=NODES[b],d=`M${x} ${y}L${xx} ${yy}`;return `<g><path class="road-rim" d="${d}"/><path class="road" id="road-${edgeKey(a,b)}" d="${d}"/><path class="road-center" d="${d}"/><path id="stripe-${edgeKey(a,b)}" d="${d}" stroke="url(#stripe)" stroke-width="26"/><text id="delay-${edgeKey(a,b)}" x="${(x+xx)/2}" y="${(y+yy)/2-22}" text-anchor="middle" font-size="13" fill="#9c6336" font-weight="bold"></text></g>`;}).join('')}</g>
 <g pointer-events="none" stroke="#ede9d5" stroke-width="3">${Object.values(NODES).map(([x,y])=>[[-24,-11],[-24,-5],[-24,1],[-24,7]].map(([dx,dy])=>`<path d="M${x+dx} ${y+dy}h11"/>`).join('')).join('')}</g><g id="route-lines"></g><g id="parking-marks" pointer-events="none"></g><g id="events">${state.events.map(e=>{const {site:[x,y],label}=siteFor(e);return `<g id="site-${e.id}" class="site-marker" data-event="${e.id}" role="button" tabindex="0" aria-label="${label} ${TYPES[e.type].name}" transform="translate(${x} ${y})"><circle class="site-hit" r="34"/><circle class="site-ring" r="27" fill="none" stroke="${TYPES[e.type].color}" stroke-width="2" stroke-dasharray="4 4"/><g class="scene-activity" transform="translate(${e.type==='fire'?fireOffset(e).join(' '):'13 -28'}) scale(.65)">${icon[e.type]}</g><g class="rescuer" transform="translate(-20 -15)"><circle cy="-5" r="4" fill="#efca8c"/><path d="M0 0V9M-4 3H5M0 9L-4 14M0 9L4 14" stroke="#d89945" stroke-width="4"/></g></g>`;}).join('')}</g>
 <g id="cars">${state.cars.map(c=>`<g class="car" id="car-${c.id}" data-car="${c.id}" role="button" tabindex="0" aria-label="选择${c.id}号车"><circle class="car-ring" r="45"/><circle class="work-ring" r="34"/><g class="vehicle" transform="scale(.78)" filter="url(#shadow)"><rect x="-27" y="-19" width="54" height="38" rx="13" fill="${colors[c.id-1]}" stroke="#fff1d1" stroke-width="3"/><rect x="-24" y="-15" width="11" height="29" rx="4" fill="#264c4c"/><rect x="-6" y="-13" width="16" height="25" rx="3" fill="#faedca"/><text x="2" y="5" text-anchor="middle" font-size="18" fill="#234b48" font-weight="900">${c.id}</text><path d="M24-10V10" stroke="#ffdf81" stroke-width="3"/></g><text y="33" text-anchor="middle" font-size="12" fill="#315b50">${['●','▲','■'][c.id-1]}</text><path class="water" d="M-12-21Q-23-46-8-53" fill="none"/></g>`).join('')}</g>`;
 svg.insertAdjacentHTML('beforeend','<g id="drag-guide" style="display:none" pointer-events="none"><path id="drag-line" fill="none" stroke-width="5" stroke-dasharray="8 7"/><g id="drag-ghost"><circle r="28" fill="#fff6dd" stroke-width="4"/><text y="6" text-anchor="middle" font-size="20" font-weight="bold"></text></g></g>');
 $('incidents').innerHTML=state.events.map(e=>`<button class="event" id="event-${e.id}" data-event="${e.id}" style="--event-color:${TYPES[e.type].color}" hidden><span class="event-heading"><b>${TYPES[e.type].name}</b><span class="event-time"></span></span><span class="event-label">${siteFor(e).label}</span><span class="event-status assigned"></span><span class="event-risk"></span><progress class="service-fill" max="1" value="0" aria-label="处理进度"></progress></button>`).join('');
 $('fleet').innerHTML=state.cars.map(c=>`<button data-car="${c.id}" id="fleet-${c.id}" style="--car-color:${colors[c.id-1]}"><b>${['●','▲','■'][c.id-1]} ${c.id}号车</b><small></small></button>`).join('');
 $('dispatch-cars').innerHTML=state.cars.map(c=>`<button data-dispatch-car="${c.id}" style="--car-color:${colors[c.id-1]}"><b>${['●','▲','■'][c.id-1]} ${c.id}号车</b><small></small></button>`).join('');
}
const idle=car=>!car.target&&!car.edge&&!car.access&&!car.working;
function openDispatch(id){
 const event=state.events.find(e=>e.id===id);
 if(state.status!=='playing'||event?.state!=='active')return;
 clearDrag();selected=null;parkingCursor=null;pendingTarget=id;
 if(!event.assigned)$('assigned-jobs').open=false;
 message(`已定位 ${siteFor(event).label} · ${event.assigned?`${event.assigned}号车正在执行任务`:'在卡片旁选一辆空闲车出发'}`);tone();render();
}
function renderDispatch(){
 const picker=$('dispatch-picker'),links=$('dispatch-links'),event=state.events.find(e=>e.id===pendingTarget);
 const active=event?.state==='active'&&state.status==='playing',assigned=state.cars.find(c=>c.id===event?.assigned);
 picker.hidden=!active||!!assigned;links.toggleAttribute('hidden',!active);
 if(!active){links.innerHTML='';return;}
 const available=assigned?[assigned]:state.cars.filter(idle),cardElement=$(`event-${event.id}`),card=cardElement.getBoundingClientRect();
 if(!assigned){
   $('dispatch-title').textContent=`${siteFor(event).label} · ${TYPES[event.type].name}`;
   const note=available.length?'选一辆空闲车，立即出发':'暂无空闲车辆 · 车辆空闲后会出现在这里';
   if($('dispatch-note').textContent!==note)$('dispatch-note').textContent=note;
   for(const button of $('dispatch-cars').children){
     const car=available.find(c=>c.id===Number(button.dataset.dispatchCar));
     button.hidden=button.disabled=!car;
     if(car){const status=`约${Math.ceil(routes(state,car,event)[0].seconds-TYPES[event.type].seconds)}秒到场`;button.querySelector('small').textContent=status;button.setAttribute('aria-label',`${car.id}号车，${status}，${siteFor(event).label}`);}
   }
   const width=picker.offsetWidth;
   picker.style.left=`${Math.max(8,Math.min(innerWidth-width-8,card.left+card.width/2-width/2))}px`;
   picker.style.top=`${Math.max(8,Math.min(innerHeight-picker.offsetHeight-8,card.bottom+8))}px`;
 }
 links.setAttribute('viewBox',`0 0 ${links.clientWidth} ${links.clientHeight}`);
 const screen=point=>new DOMPoint(...point).matrixTransform(svg.getScreenCTM());
 const site=screen(siteFor(event).site);
 links.innerHTML=`<path class="incident-link" d="M${card.left+card.width/2} ${card.top}L${site.x} ${site.y}"/><circle class="incident-end" cx="${site.x}" cy="${site.y}" r="19"/>`+available.map(car=>{
   const button=(assigned?cardElement.querySelector('.assigned'):$('dispatch-cars').querySelector(`[data-dispatch-car="${car.id}"]`)).getBoundingClientRect(),p=screen(position(state,car)),x=button.left+button.width/2,y=button.top;
   return `<g data-car-link="${car.id}" stroke="${colors[car.id-1]}"><path class="dispatch-link-under" d="M${x} ${y}L${p.x} ${p.y}"/><path d="M${x} ${y}L${p.x} ${p.y}"/><circle cx="${p.x}" cy="${p.y}" r="20"/></g>`;
 }).join('');
}
function message(text){$('hint').textContent=text;}
function pause(text){paused=true;bank=0;if(text)message(text);render();}
function select(id){
 if(state.status!=='playing')return false;
 unlock();const car=state.cars.find(c=>c.id===id);
 if(state.events.some(e=>e.id===pendingTarget)&&!idle(car)){message('这辆车正在执行任务，请选卡片旁的空闲车辆');return false;}
 if(car.working){const event=state.events.find(e=>e.id===car.target);message(`${id}号车正在${TYPES[event.type].name}，已处理${Math.floor(car.service)}秒 · 请选其他车`);return false;}
 selected=id;parkingCursor=null;
 if(pendingTarget){order(pendingTarget);return false;}
 message(`已选 ${id}号车 → 点现场救援，或点地图任意位置停靠`);tone();render();return true;
}
function order(target,mode='fast'){
 if(selected===null)return;
 const r=dispatch(state,selected,target,mode);
 if(r.ok){pendingTarget=null;if(!started){started=true;paused=false;bank=0;last=performance.now();}tone();}
 message(r.message+(r.ok&&paused?' · 已安排，点继续执行':''));render();
}
function destination(target){
 if(state.status!=='playing')return;
 const event=state.events.find(e=>e.id===target);
 if(event&&event.state!=='active'){message('这个事件已结束，请选其他地点');return;}
 if(state.cars.find(c=>c.id===selected)?.working)selected=null;
 if(selected!==null){order(target);return;}
 if(event?.assigned){select(event.assigned);return;}
 pendingTarget=target;message(`已选 ${event?siteFor(event).label+' · '+TYPES[event.type].name:'停靠位置'} → 点一辆空闲车派过去`);render();
}
function pathD(car,path){return routePoints(state,car,path).map((p,i)=>`${i?'L':'M'}${p[0]} ${p[1]}`).join('');}
let routeSignature='';
function render(){
 const transfers=[];
 const focusedEvent=state.events.find(e=>e.id===document.activeElement?.dataset.event),expiredSelection=state.events.some(e=>e.id===pendingTarget&&e.state!=='active');
 const restoreFocus=focusedEvent&&focusedEvent.state!=='active'||expiredSelection&&$('dispatch-picker').contains(document.activeElement);
 if(state.status!=='playing'){paused=true;clearDrag();}
 if(state.events.some(e=>e.id===pendingTarget&&(e.state!=='active'||state.status!=='playing')))pendingTarget=null;
 $('road-debris').style.display=state.events.some(e=>e.type==='traffic'&&e.state==='active')?'':'none';
 $('app').dataset.time=state.time.toFixed(1);$('app').dataset.status=state.status;$('app').dataset.paused=String(paused);
 $('app').classList.toggle('paused',paused);$('app').classList.toggle('running',!paused);
 $('time').textContent=`${String(Math.floor(state.time/60)).padStart(2,'0')}:${String(Math.floor(state.time%60)).padStart(2,'0')}`;
 $('loss').textContent=`延误 ${state.loss}/3`;$('progress').textContent=`${state.events.filter(e=>e.state==='done').length}/${state.events.length}`;
 $('phase').textContent=state.status==='playing'?(paused?(started?'已暂停 · 点继续执行':'派出第一辆车，即刻开始'):'救援进行中 · 随时调度'):'本次出勤结束';
 $('go').innerHTML=paused?(started?'继续 <span>→</span>':'开始 <span>→</span>'):'暂停 <span>Ⅱ</span>';
 $('cancel').hidden=selected===null&&pendingTarget===null;
 for(const [a,b] of state.edges){const m=multiplier(state,a,b),key=edgeKey(a,b);$(`road-${key}`).classList.toggle('slow',m>1);$(`stripe-${key}`).style.opacity=m>1?'1':'0';$(`delay-${key}`).textContent=m>1?`慢行 ×${m}`:key==='BC'&&state.level===2?'上街快线':'';}
 for(const e of state.events){
   const el=$(`event-${e.id}`),pin=$(`site-${e.id}`),done=e.state==='done',missed=e.state==='missed',active=e.state==='active';
   const parent=active&&e.assigned?$('assigned-events'):$('incidents');
   if(el.parentElement!==parent){
     const from=el.getBoundingClientRect();
     if(active&&e.assigned&&from.width&&!reduced)transfers.push({copy:el.cloneNode(true),from});
     parent.append(el);
   }
   el.hidden=!active;pin.style.display=active?'':'none';el.dataset.state=e.state;
   el.disabled=!active;pin.setAttribute('tabindex',active?'0':'-1');
   const car=state.cars.find(c=>c.target===e.id),working=!!car?.working;
   const elapsed=Math.floor(working?car.service:state.time-e.at);
   const timer=done?'已完成':missed?'救援延误':`${working?'已处理':'已等待'} ${String(elapsed).padStart(2,'0')}秒`;
   el.querySelector('.event-time').textContent=timer;
   el.setAttribute('aria-label',`${siteFor(e).label} ${TYPES[e.type].name} ${timer}${e.assigned?' · 已派'+e.assigned+'号车':''}`);
   const status=car?(working?`${car.id}号车 · 现场处理中`:car.access?.direction==='in'?`${car.id}号车 · 驶入现场`:`${car.id}号车 · 正在赶来`):done?'现场已恢复':missed?'未能及时完成':'等待派车';
   el.querySelector('.assigned').textContent=status;
   el.querySelector('.event-risk').textContent=done?'救援完成':missed?`延误增加 ${TYPES[e.type].loss} 格`:e.penalized?'已恶化 · 仍需修复':`接报${e.due-e.at}秒未完成将${e.type==='fire'?'蔓延':e.type==='pet'?'走失':e.type==='traffic'?'拥堵加剧':'扩大停电'}`;
   el.querySelector('.service-fill').value=working?car.service/TYPES[e.type].seconds:done?1:0;
   el.classList.toggle('urgent',active&&(e.penalized||state.time-e.at>(e.due-e.at)*.65));
   pin.classList.toggle('working',working);pin.classList.toggle('pulse',active&&e.type==='fire');
   for(const item of [el,pin]){item.classList.toggle('available',selected!==null&&active&&(!e.assigned||e.assigned===selected));item.classList.toggle('targeted',pendingTarget===e.id||drag?.target===e.id);item.setAttribute('aria-pressed',String(pendingTarget===e.id));}
 }
 const assignedCount=state.events.filter(e=>e.state==='active'&&e.assigned).length;
 $('assigned-count').textContent=assignedCount;$('assigned-jobs').hidden=!assignedCount;
 if(!assignedCount)$('assigned-jobs').open=false;
 for(const {copy,from} of transfers){
   const to=$('assigned-jobs').querySelector('summary').getBoundingClientRect();
   copy.removeAttribute('id');copy.removeAttribute('data-event');copy.setAttribute('aria-hidden','true');copy.tabIndex=-1;copy.classList.add('assignment-flight');
   Object.assign(copy.style,{left:`${from.left}px`,top:`${from.top}px`,width:`${from.width}px`,height:`${from.height}px`});document.body.append(copy);
   const animation=copy.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${to.left+to.width/2-from.left-from.width/2}px,${to.top+to.height/2-from.top-from.height/2}px) scale(.25)`,opacity:0}],{duration:360,easing:'ease-in-out'});
   animation.finished.catch(()=>{}).finally(()=>copy.remove());
 }
 for(const c of state.cars){const el=$(`car-${c.id}`),p=position(state,c);const old=el.transform.baseVal[0]?.matrix;if(old&&(Math.abs(p[0]-old.e)+Math.abs(p[1]-old.f)>.01))el.querySelector('.vehicle').setAttribute('transform',`rotate(${Math.atan2(p[1]-old.f,p[0]-old.e)*180/Math.PI}) scale(.78)`);el.setAttribute('transform',`translate(${p[0]} ${p[1]})`);el.dataset.node=c.node;el.dataset.moving=String(!!c.edge||!!c.access);el.dataset.working=String(c.working);el.classList.toggle('selected',selected===c.id);el.classList.toggle('working',c.working);const fire=state.events.find(e=>e.id===c.target&&e.type==='fire');el.querySelector('.water').style.display=c.working&&fire?'':'none';if(fire){const [dx,dy]=fireOffset(fire);el.querySelector('.water').setAttribute('d',`M0 0Q${dx/2} ${dy-22} ${dx} ${dy}`);}}
 for(const c of state.cars){const event=state.events.find(e=>e.id===c.target),label=c.working?`已处理 ${Math.floor(c.service)}秒`:c.target?`前往 ${event?siteFor(event).label:c.target?.point?'自选停靠点':c.target+'区'}`:`待命 · ${c.parked?.label||c.node+'区'}`;
   for(const el of [$(`car-${c.id}`),$(`fleet-${c.id}`)]){el.setAttribute('aria-label',`${c.id}号车 ${label}`);el.setAttribute('aria-pressed',String(selected===c.id));el.classList.toggle('selected',selected===c.id);el.classList.toggle('available',pendingTarget!==null&&idle(c));}
   $(`fleet-${c.id}`).querySelector('small').textContent=label;
 }
 const marks=state.cars.filter(c=>c.target?.point).map(c=>({point:c.target.point,color:colors[c.id-1]}));
 if(pendingTarget?.point||parkingCursor)marks.push({point:pendingTarget?.point||parkingCursor,color:'#346858'});
 $('parking-marks').innerHTML=marks.map(({point:[x,y],color})=>`<g class="parking-mark" transform="translate(${x} ${y})" stroke="${color}"><path d="M-8 0H8M0-8V8" stroke-width="3"/><path d="M0-4V-28H17V-12H0" fill="#fff5d8" stroke-width="2"/><text x="8" y="-16" stroke="none" fill="${color}" text-anchor="middle" font-size="11" font-weight="bold">P</text></g>`).join('');
 svg.classList.toggle('choosing-parking',selected!==null&&!state.cars.find(c=>c.id===selected)?.working);
 const car=state.cars.find(c=>c.id===selected),event=state.events.find(e=>e.id===car?.target),choices=car&&event&&!car.working?routes(state,car,event):[];
 const signature=JSON.stringify(choices.map(r=>[r.mode,car.mode]));
 if(signature!==routeSignature){routeSignature=signature;$('routes').innerHTML=choices.length>1?choices.map(r=>`<button data-route="${r.mode}" class="${car.mode===r.mode?'chosen':''}">${r.mode==='fast'?'当前快路':'协作捷径'} · 约${Math.ceil(r.seconds)}秒</button>`).join(''):'';}
 for(const button of $('routes').children){const route=choices.find(r=>r.mode===button.dataset.route);button.textContent=`${route.mode==='fast'?'当前快路':'协作捷径'} · 约${Math.ceil(route.seconds)}秒`;}
 if(car&&event&&!car.working&&choices.length){const estimate=choices.find(r=>r.mode===car.mode)||choices[0],late=state.time+estimate.seconds>event.due;$('eta').textContent=`按当前路况预估：约 ${Math.ceil(estimate.seconds)} 秒完成${late?'（当前预估超时）':''}。维修完成后可能提前。`;$('eta').classList.toggle('risky',late);}
 else {$('eta').classList.remove('risky');$('eta').textContent=car?.working?'这辆车正在处理，其他车仍可继续派遣。':car?'点地图现场救援；点击任意位置即可停靠。':pendingTarget?'卡片旁选空闲车，连线对应车辆当前位置。':'点求助卡片，再选旁边的空闲车；也可以直接拖车过去。';}
 $('route-lines').innerHTML=state.cars.filter(c=>c.target&&!c.working).map(c=>`<path d="${pathD(c)}" class="route-path" stroke="${colors[c.id-1]}" opacity="${selected===c.id?'.95':'.45'}" style="stroke-width:${selected===c.id?7:3}"/>`).join('');
 if(choices.length>1)$('route-lines').innerHTML+=choices.filter(r=>r.mode!==car.mode).map(r=>`<path d="${pathD(car,r.path)}" class="route-path" data-route="${r.mode}" stroke="#717654" opacity=".45" style="stroke-width:4"/>`).join('');
 while(seen<state.log.length){const entry=state.log[seen++];if(entry.kind==='done'){tone('done');message(`${TYPES[state.events.find(e=>e.id===entry.event).type].name}处理完成 · 空闲车留在现场`);}if(entry.kind==='miss'){tone('miss');message('有求助因延误而恶化。调整分工，仍可继续救场。');}}
 if(state.status!=='playing'&&!result.open){paused=true;const won=state.status==='won';$('result-title').textContent=won?(state.loss?'守住了小城':'全城平安'):'这次没赶上';$('result-body').textContent=`处理 ${state.events.filter(e=>e.state==='done').length}/${state.events.length} 件事 · 延误 ${state.loss}/3 · 用时 ${state.time.toFixed(1)} 秒`;
 const miss=state.events.find(e=>e.penalized);$('result-detail').textContent=miss?`${TYPES[miss.type].name}在接报后 ${miss.due-miss.at} 秒恶化；需要先赶到，再服务 ${TYPES[miss.type].seconds} 秒。重试会保留同样的事件与车位。`:'你的分工让城市重新动了起来。再试一次，看看能否少跑一段路。';$('next').hidden=!won;$('next').textContent=state.level<2?'下一关 →':'再巡一城 →';result.showModal();$('retry-result').focus();}
 renderDispatch();
 if(restoreFocus&&state.status==='playing')($('incidents').querySelector('.event:not([hidden])')||(!$('assigned-jobs').hidden&&$('assigned-jobs').querySelector('summary'))||$('go')).focus({preventScroll:true});
}
function start(level){clearDrag();if(result.open)result.close();state=create(level);paused=true;started=false;selected=null;pendingTarget=null;parkingCursor=null;bank=0;seen=0;routeSignature='unset';build();$('chapter').textContent=`0${level+1} / ${LEVELS[level].name}`;$('subtitle').textContent=LEVELS[level].subtitle;document.querySelectorAll('[data-level]').forEach(b=>b.classList.toggle('active',Number(b.dataset.level)===level));message('点求助卡片定位现场，再选旁边的空闲车出发');render();}
function clearDrag(){const was=drag;drag=null;if(was&&svg.hasPointerCapture(was.id))svg.releasePointerCapture(was.id);if($('drag-guide'))$('drag-guide').style.display='none';}
function cancel(text='已取消选择 · 原任务继续'){clearDrag();selected=null;pendingTarget=null;parkingCursor=null;message(paused?'已取消选择 · 等待开始或继续':text);render();}
function mapPoint(x,y){
 const p=new DOMPoint(x,y).matrixTransform(svg.getScreenCTM().inverse());
 return p.x>=0&&p.x<=600&&p.y>=0&&p.y<=540?{point:[Math.round(p.x*10)/10,Math.round(p.y*10)/10]}:null;
}
function hitTarget(x,y){
 for(const el of document.elementsFromPoint(x,y)){
   const event=el.closest('[data-event]');if(event&&state.events.some(e=>e.id===event.dataset.event&&e.state==='active'))return event.dataset.event;

 }
 return document.elementFromPoint(x,y)?.closest('#map')?mapPoint(x,y):null;
}
document.addEventListener('pointerdown',e=>{
 ignoreClick=false;
 const el=e.target.closest('[data-car]');if(!el||drag||!e.isPrimary||e.button!==0)return;
 e.preventDefault();if(!select(Number(el.dataset.car)))return;
 drag={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false,target:null};svg.setPointerCapture(e.pointerId);
});
svg.addEventListener('pointermove',e=>{
 if(drag?.id!==e.pointerId)return;
 if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>8)drag.moved=true;
 if(!drag.moved)return;
 const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse()),car=state.cars.find(c=>c.id===selected),from=position(state,car);
 drag.target=hitTarget(e.clientX,e.clientY);
 $('drag-guide').style.display='';$('drag-line').setAttribute('d',`M${from[0]} ${from[1]}L${p.x} ${p.y}`);$('drag-line').setAttribute('stroke',colors[car.id-1]);
 $('drag-ghost').setAttribute('transform',`translate(${p.x} ${p.y})`);$('drag-ghost').querySelector('circle').setAttribute('stroke',colors[car.id-1]);$('drag-ghost').querySelector('text').textContent=car.id;
 const event=state.events.find(ev=>ev.id===drag.target);
 message(drag.target?`松手派往 ${event?siteFor(event).label+' · '+TYPES[event.type].name:'所选位置停靠'}`:'拖到现场救援，或地图任意位置停靠');render();
});
svg.addEventListener('pointerup',e=>{
 if(drag?.id!==e.pointerId)return;
 const was=drag,target=hitTarget(e.clientX,e.clientY);clearDrag();ignoreClick=true;
 if(was.moved){ignoreClick=true;if(target)order(target);else cancel('未派遣 · 原任务继续');}
});
svg.addEventListener('pointercancel',e=>{if(drag?.id===e.pointerId)cancel('手势已取消 · 原任务继续');});
svg.addEventListener('lostpointercapture',e=>{if(drag?.id===e.pointerId)cancel('手势已取消 · 原任务继续');});
document.addEventListener('click',e=>{if(ignoreClick&&e.detail){ignoreClick=false;e.stopImmediatePropagation();}},true);
$('dispatch-board').addEventListener('click',e=>{const ev=e.target.closest('[data-event]');if(ev){openDispatch(ev.dataset.event);if(e.detail===0&&!$('dispatch-picker').hidden)($('dispatch-cars').querySelector('button:not([hidden]):not(:disabled)')||$('close-dispatch')).focus({preventScroll:true});}});
$('assigned-jobs').addEventListener('toggle',()=>{if(!$('assigned-jobs').open&&state.events.some(e=>e.id===pendingTarget&&e.assigned))cancel();else renderDispatch();});
$('dispatch-cars').addEventListener('click',e=>{
 const button=e.target.closest('[data-dispatch-car]'),event=state.events.find(ev=>ev.id===pendingTarget),car=state.cars.find(c=>c.id===Number(button?.dataset.dispatchCar));
 if(!car||!idle(car)||event?.state!=='active'||event.assigned){render();return;}
 unlock();selected=car.id;order(event.id);$('assigned-jobs').querySelector('summary').focus({preventScroll:true});
});
$('close-dispatch').onclick=()=>{const target=pendingTarget;cancel();$(`event-${target}`)?.focus({preventScroll:true});};
window.addEventListener('scroll',renderDispatch,true);
svg.addEventListener('click',e=>{
 const ev=e.target.closest('[data-event]'),route=e.target.closest('[data-route]');
 if(ev)destination(ev.dataset.event);
 else if(route){const c=state.cars.find(c=>c.id===selected);if(c?.target)order(c.target,route.dataset.route);}
 else if(!e.target.closest('[data-car]')){const target=mapPoint(e.clientX,e.clientY);if(target){parkingCursor=null;destination(target);}}
});
$('fleet').addEventListener('click',e=>{const car=e.target.closest('[data-car]');if(car&&e.detail===0)select(Number(car.dataset.car));});
svg.addEventListener('keydown',e=>{
 if(e.target===svg&&e.key.startsWith('Arrow')){
   e.preventDefault();parkingCursor ||= position(state,state.cars.find(c=>c.id===selected)||state.cars[0]).slice();
   const axis=e.key==='ArrowLeft'||e.key==='ArrowRight'?0:1,direction=e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:1;
   parkingCursor[axis]=Math.max(0,Math.min(axis?540:600,parkingCursor[axis]+direction*(e.shiftKey?30:10)));render();return;
 }
 if(e.key==='Enter'||e.key===' '){
   const car=e.target.closest('[data-car]'),event=e.target.closest('[data-event]');
   if(car||event||e.target===svg&&parkingCursor){e.preventDefault();if(car)select(Number(car.dataset.car));else if(event)destination(event.dataset.event);else{const point=parkingCursor;parkingCursor=null;destination({point});}}
 }
});
$('routes').addEventListener('click',e=>{const b=e.target.closest('[data-route]'),c=state.cars.find(c=>c.id===selected);if(b&&c?.target)order(c.target,b.dataset.route);});
$('go').onclick=()=>{if(state.status!=='playing'||document.hidden)return;unlock();started=true;clearDrag();if(paused){paused=false;bank=0;last=performance.now();message('救援进行中 · 选车不暂停，可随时调度');}else pause('已暂停 · 可以安排任务，点继续执行');render();};
$('cancel').onclick=()=>cancel();$('restart').onclick=()=>start(state.level);$('retry-result').onclick=()=>start(state.level);$('next').onclick=()=>start((state.level+1)%LEVELS.length);
result.addEventListener('cancel',e=>e.preventDefault());
document.querySelectorAll('[data-level]').forEach(b=>b.onclick=()=>{unlock();start(Number(b.dataset.level));});
function soundUI(){$('sound').textContent=muted?'已静音':'声音开';$('sound').setAttribute('aria-pressed',String(muted));$('sound').setAttribute('aria-label',muted?'开启声音':'静音');}
$('sound').onclick=()=>{muted=!muted;unlock();save('city-muted',muted);soundUI();if(!muted)tone();};soundUI();
function motionUI(){document.body.classList.toggle('reduce-motion',reduced);$('motion').textContent=reduced?'简动效':'动效开';$('motion').setAttribute('aria-pressed',String(reduced));}
$('motion').onclick=()=>{reduced=!reduced;save('city-reduced',reduced);motionUI();};motionUI();
function backgroundPause(){started=true;clearDrag();selected=null;pendingTarget=null;parkingCursor=null;pause('已切后台 · 回来后请点继续');sound?.suspend();last=performance.now();bank=0;}
document.addEventListener('visibilitychange',()=>{if(document.hidden)backgroundPause();last=performance.now();bank=0;});
document.addEventListener('freeze',backgroundPause);
window.addEventListener('pagehide',backgroundPause);
window.addEventListener('blur',backgroundPause);
window.addEventListener('resize',()=>{if(drag)cancel('画面尺寸变化 · 手势取消，原任务继续');renderDispatch();});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.status==='playing'){const target=pendingTarget;cancel();$(`event-${target}`)?.focus({preventScroll:true});}});
start(0);
function frame(now){const dt=Math.min(.2,(now-last)/1000);last=now;if(!paused&&state.status==='playing'){bank+=dt;while(bank>=.1){step(state);bank-=.1;}if(state.tick%10===0&&state.tick&&state.cars.some(c=>c.working)&&!reduced){if(frame.workTick!==state.tick){tone('work');frame.workTick=state.tick;}}render();}requestAnimationFrame(frame);}requestAnimationFrame(frame);
