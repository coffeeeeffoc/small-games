import {NODES,TYPES,LEVELS,create,step,dispatch,routes,position,multiplier,edgeKey} from './simulation.mjs';
const $=id=>document.getElementById(id), svg=$('map'), result=$('result');
let state, paused=true, started=false, selected=null, pendingTarget=null, drag=null, ignoreClick=false, last=0, bank=0, seen=0;
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
 const tree=(x,y,s=1)=>`<g transform="translate(${x} ${y}) scale(${s})"><ellipse cy="12" rx="15" ry="8" fill="#75936640"/><path d="M0 0V17" stroke="#7c674d" stroke-width="5"/><circle cy="-6" r="15" fill="#708c58"/><circle cx="-5" cy="-11" r="10" fill="#89a465"/><path d="M0-15V5M0-2L-8-9" stroke="#5a744b" stroke-width="2"/></g>`;
 const house=(x,y,w=60,h=42)=>`<g transform="translate(${x} ${y})"><rect x="4" y="5" width="${w}" height="${h}" rx="5" fill="#455b3330"/><rect width="${w}" height="${h}" rx="4" fill="#faf0cf"/><path d="M-4 4L${w/2}-12L${w+4} 4V17H-4Z" fill="#b9674b"/><path d="M0 7H${w}" stroke="#db9571" stroke-width="2"/><rect x="9" y="24" width="11" height="11" rx="1" fill="#e1ba62"/><rect x="${w-21}" y="24" width="11" height="11" rx="1" fill="#536f61"/></g>`;
 return `<defs><pattern id="grass" width="21" height="21" patternUnits="userSpaceOnUse"><circle cx="3" cy="8" r="1" fill="#8b9d6428"/></pattern><pattern id="stripe" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="14" fill="#e9bd6255"/></pattern><filter id="shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="4" stdDeviation="2" flood-color="#244b3f" flood-opacity=".23"/></filter></defs>
 <rect width="600" height="540" fill="url(#grass)"/>
 <rect x="129" y="201" width="125" height="121" rx="27" fill="#bacba4"/><rect x="344" y="201" width="125" height="121" rx="27" fill="#e4d9b5"/>
 <rect x="145" y="216" width="91" height="94" rx="20" fill="#c8d8b6" stroke="#eef0d7" stroke-width="3"/>
 <ellipse cx="187" cy="266" rx="25" ry="20" fill="#eeeace"/><ellipse cx="187" cy="264" rx="20" ry="14" fill="#94bcb8"/><ellipse cx="187" cy="262" rx="11" ry="8" fill="#b4d8d0"/>
 ${house(355,217,95,70)}${house(172,54,54,43)}${house(380,67,53,41)}${house(165,440,63,40)}${house(365,441,65,40)}
 ${[[32,73],[37,248],[28,463],[562,76],[565,266],[562,469],[237,234],[144,300],[462,310],[150,487],[449,491],[235,90],[348,65]].map(([x,y])=>tree(x,y,.8)).join('')}
 <text x="186" y="342" text-anchor="middle" fill="#788964" font-size="12" letter-spacing="4">街心花园</text><text x="409" y="342" text-anchor="middle" fill="#948267" font-size="12" letter-spacing="4">小城居民区</text>`;
}
function build(){
 svg.innerHTML=town()+`<g id="roads">${state.edges.map(([a,b])=>{const [x,y]=NODES[a],[xx,yy]=NODES[b],d=`M${x} ${y}L${xx} ${yy}`;return `<g><path class="road-rim" d="${d}"/><path class="road" id="road-${edgeKey(a,b)}" d="${d}"/><path class="road-center" d="${d}"/><path id="stripe-${edgeKey(a,b)}" d="${d}" stroke="url(#stripe)" stroke-width="26"/><text id="delay-${edgeKey(a,b)}" x="${(x+xx)/2}" y="${(y+yy)/2-22}" text-anchor="middle" font-size="13" fill="#9c6336" font-weight="bold"></text></g>`;}).join('')}</g>
 <g id="route-lines"></g><g id="districts">${Object.entries(NODES).map(([node,[x,y]])=>`<g class="district" data-node="${node}" role="button" tabindex="0" aria-label="${node}区路口" transform="translate(${x} ${y})"><circle r="45"/><text y="59" text-anchor="middle">${node}区</text></g>`).join('')}</g><g id="events">${state.events.map(e=>{const[x,y]=NODES[e.node];return `<g class="event" id="event-${e.id}" data-event="${e.id}" role="button" tabindex="0" aria-label="${TYPES[e.type].name} ${e.node}路口" transform="translate(${x} ${y-87})"><rect x="-55" y="-45" width="110" height="90" rx="16" fill="transparent"/><path d="M0 39V57" stroke="#7f927258" stroke-dasharray="3 4"/><rect class="event-bg" x="-55" y="-38" width="110" height="77" rx="19" fill="${TYPES[e.type].color}" stroke="#fff7dd" stroke-width="3" filter="url(#shadow)"/><g class="event-icon" transform="translate(-24 0) scale(.8)">${icon[e.type]}</g><text class="event-time" x="19" y="1" fill="#fff7e8" font-size="23" text-anchor="middle" font-weight="800"></text><text class="event-label" x="12" y="23" fill="#fff3db" font-size="11" text-anchor="middle">${TYPES[e.type].name}</text><rect x="-45" y="-30" width="90" height="61" rx="14" fill="none" stroke="#fff8d4" stroke-width="3" class="deadline-ring" pathLength="100"/><path class="service-fill" d="M-36 44H36" stroke="#3c8072" stroke-width="6" stroke-linecap="round" pathLength="100"/><text class="assigned" x="0" y="63" fill="#52694d" font-size="12" text-anchor="middle"></text></g>`;}).join('')}</g>
 <g id="cars">${state.cars.map(c=>`<g class="car" id="car-${c.id}" data-car="${c.id}" role="button" tabindex="0" aria-label="选择${c.id}号车"><circle class="car-ring" r="45"/><circle class="work-ring" r="34"/><g class="vehicle" filter="url(#shadow)"><rect x="-27" y="-19" width="54" height="38" rx="13" fill="${colors[c.id-1]}" stroke="#fff1d1" stroke-width="3"/><rect x="-24" y="-15" width="11" height="29" rx="4" fill="#264c4c"/><rect x="-6" y="-13" width="16" height="25" rx="3" fill="#faedca"/><text x="2" y="5" text-anchor="middle" font-size="18" fill="#234b48" font-weight="900">${c.id}</text><path d="M24-10V10" stroke="#ffdf81" stroke-width="3"/></g><text y="33" text-anchor="middle" font-size="12" fill="#315b50">${['●','▲','■'][c.id-1]}</text><path class="water" d="M-12-21Q-23-46-8-53" fill="none"/></g>`).join('')}</g>`;
 svg.insertAdjacentHTML('beforeend','<g id="drag-guide" style="display:none" pointer-events="none"><path id="drag-line" fill="none" stroke-width="5" stroke-dasharray="8 7"/><g id="drag-ghost"><circle r="28" fill="#fff6dd" stroke-width="4"/><text y="6" text-anchor="middle" font-size="20" font-weight="bold"></text></g></g>');
 $('fleet').innerHTML=state.cars.map(c=>`<button data-car="${c.id}" id="fleet-${c.id}" style="--car-color:${colors[c.id-1]}"><b>${['●','▲','■'][c.id-1]} ${c.id}号车</b><small></small></button>`).join('');
}
function message(text){$('hint').textContent=text;}
function pause(text){paused=true;bank=0;if(text)message(text);render();}
function select(id){
 if(state.status!=='playing')return false;
 unlock();const car=state.cars.find(c=>c.id===id);
 if(car.working){const event=state.events.find(e=>e.id===car.target);message(`${id}号车正在${TYPES[event.type].name}，还需${Math.ceil(TYPES[event.type].seconds-car.service)}秒 · 请选其他车`);return false;}
 selected=id;
 if(pendingTarget){order(pendingTarget);return false;}
 message(`已选 ${id}号车 → 点闪亮地点派遣，或拖过去`);tone();render();return true;
}
function order(target,mode='fast'){
 if(selected===null)return;
 const r=dispatch(state,selected,target,mode);
 if(r.ok){pendingTarget=null;if(!started){started=true;paused=false;bank=0;last=performance.now();}tone();}
 message(r.message+(r.ok&&paused?' · 已安排，点继续执行':''));render();
}
const atNode=node=>state.events.find(e=>e.node===node&&e.state==='active')?.id||node;
function destination(target){
 if(state.status!=='playing')return;
 const event=state.events.find(e=>e.id===target);
 if(event&&event.state!=='active'){message('这个事件已结束，请选其他地点');return;}
 if(state.cars.find(c=>c.id===selected)?.working)selected=null;
 if(selected!==null){order(target);return;}
 if(event?.assigned){select(event.assigned);return;}
 pendingTarget=target;message(`已选 ${event?event.node+'区'+TYPES[event.type].name:target+'区待命'} → 点一辆空闲车派过去`);render();
}
function pathD(car,path){const pts=path.map(n=>NODES[n]);if(car.edge)pts.unshift(position(state,car));return pts.map((p,i)=>`${i?'L':'M'}${p[0]} ${p[1]}`).join('');}
let routeSignature='';
function render(){
 if(state.status!=='playing'){paused=true;clearDrag();}
 const level=LEVELS[state.level];$('app').dataset.time=state.time.toFixed(1);$('app').dataset.status=state.status;$('app').dataset.paused=String(paused);
 $('app').classList.toggle('paused',paused);$('app').classList.toggle('running',!paused);
 $('time').textContent=`${String(Math.floor(state.time/60)).padStart(2,'0')}:${String(Math.floor(state.time%60)).padStart(2,'0')}`;
 $('loss').textContent=`失误 ${state.loss}/3`;$('progress').textContent=`${state.events.filter(e=>e.state==='done').length}/${state.events.length}`;
 $('phase').textContent=state.status==='playing'?(paused?(started?'已暂停 · 点继续执行':'派出第一辆车，即刻开始'):'救援进行中 · 随时调度'):'本次出勤结束';
 $('go').innerHTML=paused?(started?'继续 <span>→</span>':'开始 <span>→</span>'):'暂停 <span>Ⅱ</span>';
 $('cancel').hidden=selected===null&&pendingTarget===null;
 for(const [a,b] of state.edges){const m=multiplier(state,a,b),key=edgeKey(a,b);$(`road-${key}`).classList.toggle('slow',m>1);$(`stripe-${key}`).style.opacity=m>1?'1':'0';$(`delay-${key}`).textContent=m>1?`慢行 ×${m}`:key==='BC'&&state.level===2?'上街快线':'';}
 for(const e of state.events){
   const el=$(`event-${e.id}`),future=e.state==='future',done=e.state==='done',missed=e.state==='missed';
   const visible=e.state==='active'||future&&e.at-state.time<=10||done&&state.time-e.finished<2||missed&&state.time-e.due<3;
   el.style.display=visible?'':'none';el.dataset.state=e.state;el.setAttribute('tabindex',e.state==='active'?'0':'-1');el.setAttribute('aria-label',`${TYPES[e.type].name} ${e.node}路口${e.assigned?' 已派'+e.assigned+'号车':''}`);
   el.classList.toggle('future',future);el.classList.toggle('missed',missed);
   const available=e.state==='active'&&(!e.assigned||e.assigned===selected)&&!state.cars.find(c=>c.id===selected)?.working;
   el.classList.toggle('available',selected!==null&&available);el.classList.toggle('targeted',pendingTarget===e.id||drag?.target===e.id);
   el.setAttribute('aria-pressed',String(pendingTarget===e.id));
   const remain=Math.max(0,e.due-state.time);el.querySelector('.event-time').textContent=done?'✓':missed?'晚':future?`${Math.ceil(e.at-state.time)}″`:e.penalized?'!':`${Math.ceil(remain)}″`;
   el.querySelector('.event-label').textContent=future?'即将出现':done?'已完成':missed?'已逾期':e.penalized?'待修复':TYPES[e.type].name;
   el.querySelector('.event-icon').classList.toggle('pulse',!future&&!done&&(e.type==='fire'||remain<8));
   el.querySelector('.deadline-ring').setAttribute('stroke-dasharray',`${Math.max(0,Math.min(100,remain/(e.due-e.at)*100))} 100`);
   el.querySelector('.deadline-ring').style.opacity=done||future?'0':'.65';
   const car=state.cars.find(c=>c.target===e.id),fraction=car?.working?car.service/TYPES[e.type].seconds:0;
   el.querySelector('.service-fill').setAttribute('stroke-dasharray',`${fraction*100} 100`);el.querySelector('.service-fill').style.opacity=fraction?'1':'0';
   el.querySelector('.assigned').textContent=car?(car.working?`${car.id}号处理中`:`${car.id}号赶来`):'';
 }
 for(const c of state.cars){const el=$(`car-${c.id}`),p=position(state,c);el.setAttribute('transform',`translate(${p[0]} ${p[1]})`);if(c.edge){const a=NODES[c.edge.from],b=NODES[c.edge.to];el.querySelector('.vehicle').setAttribute('transform','rotate('+(Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI)+')');}el.dataset.node=c.node;el.dataset.moving=String(!!c.edge);el.dataset.working=String(c.working);el.classList.toggle('selected',selected===c.id);el.classList.toggle('working',c.working);el.querySelector('.water').style.display=c.working&&state.events.find(e=>e.id===c.target)?.type==='fire'?'':'none';}
 for(const c of state.cars){const event=state.events.find(e=>e.id===c.target),label=c.working?`处理中 · ${Math.ceil(TYPES[event.type].seconds-c.service)}秒`:c.target?`前往 ${event?.node||c.target}区`:`空闲 · ${c.node}区`;
   for(const el of [$(`car-${c.id}`),$(`fleet-${c.id}`)]){el.setAttribute('aria-label',`${c.id}号车 ${label}`);el.setAttribute('aria-pressed',String(selected===c.id));el.classList.toggle('selected',selected===c.id);el.classList.toggle('available',pendingTarget!==null&&!c.working);}
   $(`fleet-${c.id}`).querySelector('small').textContent=label;
 }
 for(const el of svg.querySelectorAll('.district')){const target=atNode(el.dataset.node);el.classList.toggle('available',selected!==null&&!state.cars.find(c=>c.id===selected)?.working);el.classList.toggle('targeted',pendingTarget===target||drag?.target===target);el.setAttribute('aria-pressed',String(pendingTarget===target));}
 const car=state.cars.find(c=>c.id===selected),event=state.events.find(e=>e.id===car?.target),choices=car&&event&&!car.working?routes(state,car,event):[];
 const signature=JSON.stringify(choices.map(r=>[r.mode,car.mode]));
 if(signature!==routeSignature){routeSignature=signature;$('routes').innerHTML=choices.length>1?choices.map(r=>`<button data-route="${r.mode}" class="${car.mode===r.mode?'chosen':''}">${r.mode==='fast'?'当前快路':'协作捷径'} · 约${Math.ceil(r.seconds)}秒</button>`).join(''):'';}
 for(const button of $('routes').children){const route=choices.find(r=>r.mode===button.dataset.route);button.textContent=`${route.mode==='fast'?'当前快路':'协作捷径'} · 约${Math.ceil(route.seconds)}秒`;}
 if(car&&event&&!car.working&&choices.length){const estimate=choices.find(r=>r.mode===car.mode)||choices[0],late=state.time+estimate.seconds>event.due;$('eta').textContent=`按当前路况预估：约 ${Math.ceil(estimate.seconds)} 秒完成${late?'（当前预估超时）':''}。维修完成后可能提前。`;$('eta').classList.toggle('risky',late);}
 else {$('eta').classList.remove('risky');$('eta').textContent=car?.working?'这辆车正在处理，其他车仍可继续派遣。':car?'点求助卡片或所在路口都行；点空路口可提前待命。':pendingTarget?'下方亮起的车都能派遣，也可以点地图上的车。':'先点车、先点求助地点，或拖车过去都行；选车不会暂停救援。';}
 $('route-lines').innerHTML=state.cars.filter(c=>c.target).map(c=>{const path=[c.edge?.to||c.node,...c.route];return `<path d="${pathD(c,path)}" class="route-path" stroke="${colors[c.id-1]}" opacity="${selected===c.id?'.95':'.45'}" style="stroke-width:${selected===c.id?7:3}"/>`;}).join('');
 if(choices.length>1)$('route-lines').innerHTML+=choices.filter(r=>r.mode!==car.mode).map(r=>`<path d="${pathD(car,r.path)}" class="route-path" data-route="${r.mode}" stroke="#717654" opacity=".45" style="stroke-width:4"/>`).join('');
 while(seen<state.log.length){const entry=state.log[seen++];if(entry.kind==='done'){tone('done');message(`${TYPES[state.events.find(e=>e.id===entry.event).type].name}处理完成 · 空闲车留在现场`);}if(entry.kind==='miss'){tone('miss');message('有事件逾期。调整分工，仍可继续救场。');}}
 if(state.status!=='playing'&&!result.open){paused=true;const won=state.status==='won';$('result-title').textContent=won?(state.loss?'守住了小城':'全城平安'):'这次没赶上';$('result-body').textContent=`处理 ${state.events.filter(e=>e.state==='done').length}/${state.events.length} 件事 · 失误 ${state.loss}/3 · 用时 ${state.time.toFixed(1)} 秒`;
 const miss=state.events.find(e=>e.penalized);$('result-detail').textContent=miss?`${TYPES[miss.type].name}在 ${miss.due} 秒截止；需要先赶到，再服务 ${TYPES[miss.type].seconds} 秒。重试会保留同样的事件与车位。`:'你的分工让城市重新动了起来。再试一次，看看能否少跑一段路。';$('next').hidden=!won;$('next').textContent=state.level<2?'下一关 →':'再巡一城 →';result.showModal();$('retry-result').focus();}
}
function start(level){clearDrag();if(result.open)result.close();state=create(level);paused=true;started=false;selected=null;pendingTarget=null;bank=0;seen=0;routeSignature='unset';build();$('chapter').textContent=`0${level+1} / ${LEVELS[level].name}`;$('subtitle').textContent=LEVELS[level].subtitle;document.querySelectorAll('[data-level]').forEach(b=>b.classList.toggle('active',Number(b.dataset.level)===level));message(LEVELS[level].hint);render();}
function clearDrag(){const was=drag;drag=null;if(was&&svg.hasPointerCapture(was.id))svg.releasePointerCapture(was.id);if($('drag-guide'))$('drag-guide').style.display='none';}
function cancel(text='已取消选择 · 原任务继续'){clearDrag();selected=null;pendingTarget=null;message(paused?'已取消选择 · 等待开始或继续':text);render();}
function hitTarget(x,y){
 for(const el of document.elementsFromPoint(x,y)){
   const event=el.closest('[data-event]');if(event&&state.events.some(e=>e.id===event.dataset.event&&e.state==='active'))return event.dataset.event;
   const node=el.closest('.district');if(node)return atNode(node.dataset.node);
 }
 return null;
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
 message(drag.target?`松手派往 ${event?event.node+'区 · '+TYPES[event.type].name:drag.target+'区待命'}`:'拖到求助卡片或路口，松手派遣');render();
});
svg.addEventListener('pointerup',e=>{
 if(drag?.id!==e.pointerId)return;
 const was=drag,target=hitTarget(e.clientX,e.clientY);clearDrag();ignoreClick=true;
 if(was.moved){ignoreClick=true;if(target)order(target);else cancel('未派遣 · 原任务继续');}
});
svg.addEventListener('pointercancel',e=>{if(drag?.id===e.pointerId)cancel('手势已取消 · 原任务继续');});
svg.addEventListener('lostpointercapture',e=>{if(drag?.id===e.pointerId)cancel('手势已取消 · 原任务继续');});
document.addEventListener('click',e=>{if(ignoreClick&&e.detail){ignoreClick=false;e.stopImmediatePropagation();}},true);
svg.addEventListener('click',e=>{
 const ev=e.target.closest('[data-event]'),node=e.target.closest('.district'),route=e.target.closest('[data-route]');
 if(ev)destination(ev.dataset.event);else if(node)destination(atNode(node.dataset.node));
 else if(route){const c=state.cars.find(c=>c.id===selected);if(c?.target)order(c.target,route.dataset.route);}
 else if(!e.target.closest('[data-car]'))cancel();
});
$('fleet').addEventListener('click',e=>{const car=e.target.closest('[data-car]');if(car&&e.detail===0)select(Number(car.dataset.car));});
svg.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const c=e.target.closest('[data-car]'),ev=e.target.closest('[data-event]'),node=e.target.closest('.district');if(c||ev||node){e.preventDefault();if(c)select(Number(c.dataset.car));else destination(ev?ev.dataset.event:atNode(node.dataset.node));}}});
$('routes').addEventListener('click',e=>{const b=e.target.closest('[data-route]'),c=state.cars.find(c=>c.id===selected);if(b&&c?.target)order(c.target,b.dataset.route);});
$('go').onclick=()=>{if(state.status!=='playing'||document.hidden)return;unlock();started=true;clearDrag();if(paused){paused=false;bank=0;last=performance.now();message('救援进行中 · 选车不暂停，可随时调度');}else pause('已暂停 · 可以安排任务，点继续执行');render();};
$('cancel').onclick=()=>cancel();$('restart').onclick=()=>start(state.level);$('retry-result').onclick=()=>start(state.level);$('next').onclick=()=>start((state.level+1)%LEVELS.length);
result.addEventListener('cancel',e=>e.preventDefault());
document.querySelectorAll('[data-level]').forEach(b=>b.onclick=()=>{unlock();start(Number(b.dataset.level));});
function soundUI(){$('sound').textContent=muted?'已静音':'声音开';$('sound').setAttribute('aria-pressed',String(muted));$('sound').setAttribute('aria-label',muted?'开启声音':'静音');}
$('sound').onclick=()=>{muted=!muted;unlock();save('city-muted',muted);soundUI();if(!muted)tone();};soundUI();
function motionUI(){document.body.classList.toggle('reduce-motion',reduced);$('motion').textContent=reduced?'简动效':'动效开';$('motion').setAttribute('aria-pressed',String(reduced));}
$('motion').onclick=()=>{reduced=!reduced;save('city-reduced',reduced);motionUI();};motionUI();
function backgroundPause(){started=true;clearDrag();selected=null;pendingTarget=null;pause('已切后台 · 回来后请点继续');sound?.suspend();last=performance.now();bank=0;}
document.addEventListener('visibilitychange',()=>{if(document.hidden)backgroundPause();last=performance.now();bank=0;});
document.addEventListener('freeze',backgroundPause);
window.addEventListener('pagehide',backgroundPause);
window.addEventListener('blur',backgroundPause);
window.addEventListener('resize',()=>{if(drag)cancel('画面尺寸变化 · 手势取消，原任务继续');});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.status==='playing')cancel();});
start(0);
function frame(now){const dt=Math.min(.2,(now-last)/1000);last=now;if(!paused&&state.status==='playing'){bank+=dt;while(bank>=.1){step(state);bank-=.1;}if(state.tick%10===0&&state.tick&&state.cars.some(c=>c.working)&&!reduced){if(frame.workTick!==state.tick){tone('work');frame.workTick=state.tick;}}render();}requestAnimationFrame(frame);}requestAnimationFrame(frame);
