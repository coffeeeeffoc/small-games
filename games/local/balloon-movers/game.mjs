import { createGame, launch, step, center, anchor, ropePoints, LEVELS, STEP, SIZE } from './physics.mjs';
const $ = id => document.getElementById(id);
const canvas=$('scene'),ctx=canvas.getContext('2d');
let index=0, setup={...LEVELS[0].setup,left:0,right:0}, state=createGame(0,setup), held={left:false,right:false}, paused=false, last=0, accumulator=0, muted=false, audio, master, hiss, dragging=false, dragPoint=null, finished=false, oldBumps=0;
const keys=new Set(),pointers={left:new Set(),right:new Set()};
try {muted=localStorage.getItem('balloon-muted')==='1';} catch {}
function soundReady(){
  if(audio) {if(audio.state==='suspended')audio.resume().catch(()=>{});return;}
  try {
    audio=new (window.AudioContext||window.webkitAudioContext)();master=audio.createGain();master.gain.value=muted?0:.2;master.connect(audio.destination);
    const buf=audio.createBuffer(1,audio.sampleRate,audio.sampleRate),data=buf.getChannelData(0);for(let i=0;i<data.length;i++) data[i]=Math.random()*2-1;
    const source=audio.createBufferSource();source.buffer=buf;source.loop=true;const filter=audio.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1100;hiss=audio.createGain();hiss.gain.value=0;source.connect(filter).connect(hiss).connect(master);source.start();
    document.body.dataset.audio='ready';
  } catch {document.body.dataset.audio='unavailable';$('mute').textContent='声音不可用';}
}
function tone(freq=440,duration=.12,type='sine') {if(!audio)return;const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime;o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(.24,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g).connect(master);o.start();o.stop(t+duration);}
function clearInput(){held.left=held.right=false;keys.clear();pointers.left.clear();pointers.right.clear();updateValves();}
function updateValves(){for(const side of ['left','right']){$(side+'-valve').setAttribute('aria-pressed',String(held[side]));}if(hiss)hiss.gain.setTargetAtTime(!paused&&state.phase==='flying'&&(held.left||held.right)?.2:0,audio.currentTime,.04);}
function reset(next=index, preserve=true){clearInput();index=next;if(!preserve)setup={...LEVELS[index].setup};state=createGame(index,setup);paused=false;accumulator=0;finished=false;oldBumps=0;$('result').hidden=true;$('pause').textContent='暂停';document.body.classList.remove('paused');sync();}
function sync(){
  const flying=state.phase!=='ready';$('prepare').hidden=flying;$('flying').hidden=!flying;$('pause').disabled=state.phase!=='flying';
  $('task').textContent=`第${['一','二','三'][index]}单 · ${LEVELS[index].item}`;$('hint').textContent=LEVELS[index].hint;
  document.querySelectorAll('[data-level]').forEach(b=>b.setAttribute('aria-current',String(+b.dataset.level===index)));
  const remaining=4-setup.left-setup.right;$('remaining').textContent=remaining;$('launch').disabled=setup.left+setup.right===0;
  for(const side of ['left','right']){$(side+'-count').textContent=setup[side];document.querySelector(`[data-side="${side}"]`).disabled=remaining===0||setup[side]>=3;document.querySelector(`[data-remove="${side}"]`).disabled=setup[side]===0;const b=document.querySelector(`[data-rope="${side}"]`),long=setup[side==='left'?'longLeft':'longRight'];b.textContent=long?'长绳':'短绳';b.setAttribute('aria-pressed',String(long));}
  $('supply').disabled=remaining===0;$('mute').textContent=muted?'声音 关':'声音 开';$('mute').setAttribute('aria-pressed',String(muted));
}
function change(side,delta){if(state.phase!=='ready')return;soundReady();if(delta>0&&(setup.left+setup.right>=4||setup[side]>=3))return;setup[side]=Math.max(0,setup[side]+delta);reset();tone(side==='left'?380:510);}
for(const b of document.querySelectorAll('[data-side]'))b.onclick=()=>change(b.dataset.side,1);
for(const b of document.querySelectorAll('[data-remove]'))b.onclick=()=>change(b.dataset.remove,-1);
for(const b of document.querySelectorAll('[data-rope]'))b.onclick=()=>{const k=b.dataset.rope==='left'?'longLeft':'longRight';setup[k]=!setup[k];reset();tone(330);};
for(const b of document.querySelectorAll('[data-level]'))b.onclick=()=>reset(+b.dataset.level,false);
$('suggest').onclick=()=>{soundReady();reset(index,false);tone(510);};
$('clear').onclick=()=>{setup={...setup,left:0,right:0};reset();};
$('launch').onclick=()=>{soundReady();launch(state);clearInput();accumulator=0;sync();tone(620,.2);};
$('retry').onclick=$('again').onclick=()=>{soundReady();reset();};
$('next').onclick=()=>reset((index+1)%3,false);
$('pause').onclick=()=>{paused=!paused;clearInput();accumulator=0;document.body.classList.toggle('paused',paused);$('pause').textContent=paused?'继续':'暂停';};
$('mute').onclick=()=>{soundReady();muted=!muted;if(master)master.gain.setTargetAtTime(muted?0:.2,audio.currentTime,.02);try{localStorage.setItem('balloon-muted',muted?'1':'0');}catch{}sync();};
for(const side of ['left','right']){
 const button=$(side+'-valve');
 button.addEventListener('pointerdown',e=>{e.preventDefault();if(state.phase!=='flying'||paused)return;soundReady();button.setPointerCapture(e.pointerId);pointers[side].add(e.pointerId);held[side]=true;updateValves();});
 const release=e=>{pointers[side].delete(e.pointerId);held[side]=pointers[side].size>0||keys.has(side);updateValves();};
 button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
}
window.addEventListener('keydown',e=>{const side=e.code==='KeyA'?'left':e.code==='KeyD'?'right':null;if(!side||state.phase!=='flying'||paused)return;e.preventDefault();soundReady();keys.add(side);held[side]=true;updateValves();});
window.addEventListener('keyup',e=>{const side=e.code==='KeyA'?'left':e.code==='KeyD'?'right':null;if(side){keys.delete(side);held[side]=pointers[side].size>0;updateValves();}});
window.addEventListener('blur',clearInput);
document.addEventListener('visibilitychange',()=>{clearInput();last=0;accumulator=0;if(document.hidden&&state.phase==='flying'){paused=true;document.body.classList.add('paused');$('pause').textContent='继续';}});
function worldPoint(e){const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*SIZE.w/r.width,y:(e.clientY-r.top)*SIZE.h/r.height};}
function ring(side){const l=LEVELS[index];return {x:148+(side==='left'?-1:1)*(l.w/2-8),y:l.startY+l.anchorY};}
function drop(p){if(state.phase!=='ready')return;const side=Math.abs(p.x-ring('left').x)<Math.abs(p.x-ring('right').x)?'left':'right';if(Math.hypot(p.x-ring(side).x,p.y-ring(side).y)<75)change(side,1);}
canvas.addEventListener('pointerdown',e=>{if(state.phase==='ready'){e.preventDefault();drop(worldPoint(e));}});
$('supply').addEventListener('pointerdown',e=>{if(state.phase!=='ready')return;e.preventDefault();soundReady();dragging=true;dragPoint=worldPoint(e);$('supply').setPointerCapture(e.pointerId);document.body.classList.add('dragging');});
$('supply').addEventListener('pointermove',e=>{if(dragging)dragPoint=worldPoint(e);});
$('supply').addEventListener('pointerup',e=>{if(dragging)drop(worldPoint(e));dragging=false;dragPoint=null;document.body.classList.remove('dragging');});
$('supply').addEventListener('pointercancel',()=>{dragging=false;dragPoint=null;document.body.classList.remove('dragging');});
function rect(x,y,w,h,fill,r=0,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();}}
function line(points,color='#526358',width=2){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
function text(t,x,y,size=16,color='#153e3d',align='left'){ctx.font=`${size>22?'bold ':''}${size}px "Microsoft YaHei",sans-serif`;ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(t,x,y);}
function circle(x,y,r,color,stroke){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();}}
function drawFurniture(){
 const l=LEVELS[index],p=center(state),w=l.w,h=l.h;
 ctx.save();ctx.translate(p.x,p.y);ctx.rotate(state.furniture.angle);
 if(index===0){rect(-w/2,-h/2,w,h,'#bd7158',8,'#693e33');rect(-w/2+8,-h/2+5,w-16,h*.6,'#dd9574',7);rect(-w/2+12,2,w-24,16,'#e9ad85',5);line([[0,-h/2+5],[0,17]],'#9f624c',1.5);rect(-w/2,-h/2+15,13,h-15,'#cb8464',5);rect(w/2-13,-h/2+15,13,h-15,'#cb8464',5);}
 if(index===1){rect(-w/2,-h/2,w,h,'#b4c9ba',5,'#42685e');rect(-w/2+6,-h/2+5,w-12,h-10,'#d7e1c6',3);line([[-w/2+5,-21],[w/2-5,-21]],'#749487',2);rect(w/2-13,-45,4,17,'#506e61',2);rect(w/2-13,-7,4,26,'#506e61',2);rect(-13,-55,15,19,'#d9775e',2);text('鲜',-6,-42,10,'#fff7dc','center');}
 if(index===2){rect(-w/2,-h/2,w,h,'#263d3c',4,'#162d2c');rect(-w/2+8,-h/2+7,w-16,30,'#3b5350',3,'#172b29');rect(-w/2+7,2,w-14,21,'#f4e3bd',2);for(let x=-w/2+9;x<w/2-8;x+=7)line([[x,3],[x,22]],'#958e73',1);for(let x=-w/2+11,n=0;x<w/2-10;x+=7,n++)if(n%7!==2&&n%7!==6)rect(x,2,4,12,'#142d2c');text('BALLOON & SONS',0,-14,8,'#d1b680','center');rect(-w/2+10,29,18,6,'#54716b',2);rect(w/2-28,29,18,6,'#54716b',2);}
 for(const side of ['left','right']){const x=(side==='left'?-1:1)*(w/2-8),y=l.anchorY;circle(x,y,5,'#e5bd61','#6f6e46');if(state.phase==='ready'){circle(x,y,13,'#fff3d8');circle(x,y,7,side==='left'?'#d95e49':'#267d78');line([[x-3,y],[x+3,y]],'#fff8e2',2);line([[x,y-3],[x,y+3]],'#fff8e2',2);}}
 circle(l.com,4,3,'#edbc61');
 ctx.restore();
}
function draw(now){
 const ratio=Math.min(devicePixelRatio||1,2),r=canvas.getBoundingClientRect(),width=Math.round(r.width*ratio),height=Math.round(r.width*SIZE.h/SIZE.w*ratio);
 if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
 ctx.setTransform(canvas.width/SIZE.w,0,0,canvas.height/SIZE.h,0,0);
 ctx.clearRect(0,0,SIZE.w,SIZE.h);rect(0,0,760,620,'#ecdfc5');rect(377,0,383,620,'#c5ded7');
 for(let i=0;i<4;i++){rect(420+i*95,230-(i%2)*55,65,315+(i%2)*55,i%2?'#b1cbc1':'#a8c4ba',4);for(let y=260-(i%2)*55;y<470;y+=40)for(let x=434+i*95;x<480+i*95;x+=22)rect(x,y,10,17,'#d5e4d6',2);}
 ctx.globalAlpha=.6;for(const [x,y] of [[455,95],[650,60]]){circle(x,y,22,'#f3f4e6');circle(x+26,y-8,29,'#f3f4e6');circle(x+55,y,21,'#f3f4e6');rect(x,y,56,20,'#f3f4e6',8);}ctx.globalAlpha=1;
 rect(0,0,351,15,'#315e55');rect(0,15,351,11,'#598273');
 for(let y=56;y<510;y+=53){line([[0,y],[351,y]],'#d8c9ab',.8);for(let x=(y%2)*45;x<340;x+=110)line([[x,y],[x,y+53]],'#e3d4b7',.7);}
 rect(57,84,140,100,'#c29d71',3);rect(64,91,126,86,'#f6edda',2);text('轻 拿 慢 放',127,124,20,'#6c7765','center');text('好心情，送到家',127,155,12,'#9c8d70','center');
 rect(25,434,48,70,'#b99b6c',2);line([[26,463],[72,463]],'#9b784f',1);text('搬',49,480,18,'#f6e5b9','center');rect(257,463,59,42,'#ceb580',3);text('↑ ↑',286,489,18,'#8f7450','center');
 // The wall art matches the two physical frame rectangles; no hidden collision geometry.
 const [top,bottom]=state.level.opening;
 rect(350,0,28,top,'#b87361');rect(350,bottom,28,620-bottom,'#b87361');rect(346,top-10,37,10,'#285951',2);rect(341,bottom,49,13,'#285951',2);rect(354,0,7,top-10,'#d9947f');rect(354,bottom+13,7,607-bottom,'#d9947f');
 rect(0,507,340,113,'#b7ad90');for(let x=0;x<340;x+=56)line([[x,507],[x+34,620]],'#9f967d',1);line([[0,507],[340,507]],'#677b67',3);
 rect(412,505,334,105,'#d49c45',9);rect(412,505,334,34,'#efc55f',9,'#bf903b');rect(424,510,310,11,'#f8d983',6);for(let x=432;x<740;x+=28)line([[x,540],[x+14,540]],'#b4873c',2);
 text('轻轻落稳，就签收',579,578,17,'#826c37','center');text('接 货 垫',579,603,10,'#9d8248','center');
 const fanX=45,fanY=345;line([[fanX,fanY+24],[fanX,405]],'#446c60',7);rect(22,402,47,9,'#446c60',4);circle(fanX,fanY,31,'#749e8c','#315d52');ctx.save();ctx.translate(fanX,fanY);ctx.rotate(now/120);for(let i=0;i<3;i++){ctx.rotate(Math.PI*2/3);ctx.beginPath();ctx.ellipse(0,-13,7,17,.3,0,Math.PI*2);ctx.fillStyle='#b5c6a3';ctx.fill();}ctx.restore();circle(fanX,fanY,5,'#315d52');circle(fanX,fanY,27,'#00000000','#315d52');
 for(let i=0;i<4;i++){const x=82+(now/27+i*66)%242,y=335+i*10;ctx.globalAlpha=.35;line([[x,y],[x+20,y-2],[x+34,y]],'#458b7c',1.5);}ctx.globalAlpha=1;
 text('固定侧风 →',47,440,11,'#6b8471');
 for(const b of state.balloons){const points=ropePoints(state,b);line(points.map(p=>[p.x,p.y]),'#887c53',1.6);}
 drawFurniture();
 for(const b of state.balloons){const p=b.body.position,r=b.radius,color=b.side==='left'?'#df7159':'#369c91';circle(p.x,p.y,r,color,'#385e50');circle(p.x-r*.32,p.y-r*.32,r*.22,'#ffffff70');line([[p.x-2,p.y+r],[p.x+2,p.y+r]],'#385e50',3);if(held[b.side]&&state.phase==='flying'&&!paused){for(let i=0;i<3;i++){const shift=(now/25+i*7)%23;line([[p.x-r-3-shift,p.y+5+i*4],[p.x-r-9-shift,p.y+6+i*4]],color,1.5);}}}
 if(state.phase==='ready'){text('← 左绑环',96,state.level.startY+state.level.h/2+32,13,'#ab5543','center');text('右绑环 →',217,state.level.startY+state.level.h/2+32,13,'#267d78','center');if(!state.balloons.length){rect(91,state.level.startY-118,155,44,'#fff7e7',11);text('先给两端绑上气球',169,state.level.startY-91,14,'#5d7362','center');}}
 if(dragging&&dragPoint){circle(dragPoint.x,dragPoint.y,18,'#de735b');line([[dragPoint.x,dragPoint.y+18],[dragPoint.x,dragPoint.y+37]],'#887c53',2);}
 if(state.tick-state.lastBump<45){const p=center(state);text('轻擦一下！',p.x,p.y-state.level.h/2-35,14,'#c16743','center');}
 if(paused){rect(200,225,360,105,'#fff8e9ed',20);text('歇一口气',380,270,29,'#153e3d','center');text('点击「继续」，气阀已松开',380,302,14,'#768473','center');}
 if(state.phase==='won'){for(let i=0;i<24;i++){const x=435+(i*37)%260,y=70+(i*53+now/40)%210;ctx.save();ctx.translate(x,y);ctx.rotate(i+now/900);rect(-2,-4,5,9,['#dc7555','#e8bd59','#438d7a'][i%3]);ctx.restore();}}
}
function frame(now){
 if(last&&!paused&&!document.hidden&&state.phase==='flying'){accumulator+=Math.min(now-last,100);while(accumulator>=STEP){step(state,held);accumulator-=STEP;}}
 last=now;
 if(state.bumps!==oldBumps){tone(index===2?196:130,.14,'triangle');if(index===2)setTimeout(()=>tone(233,.2,'triangle'),30);oldBumps=state.bumps;}
 if((state.phase==='won'||state.phase==='lost')&&!finished){finished=true;clearInput();const won=state.phase==='won';$('result').hidden=false;$('result-kicker').textContent=won?'DELIVERED WITH CARE':'再试一次，换个办法';$('result-title').textContent=won?'稳稳送到了！':'这单有点难';$('result-text').textContent=won?`${LEVELS[index].item}已签收 · ${(state.tick/120).toFixed(1)} 秒 · 轻擦 ${state.bumps} 次`:state.reason;$('next').hidden=!won;$('next').textContent=index===2?'再搬一轮 ↻':'下一单 →';$('again').textContent=won?'再挑战一次':'调整后重来';$('pause').disabled=true;if(won){tone(523,.3);setTimeout(()=>tone(659,.3),120);setTimeout(()=>tone(784,.4),260);}else tone(140,.35,'triangle');}
 const time=state.tick/120;$('flight').textContent=state.phase==='ready'?'准备起飞':paused?'已暂停':state.phase==='won'?'已签收':state.phase==='lost'?'待重试':`${Math.floor(time/60).toString().padStart(2,'0')}:${Math.floor(time%60).toString().padStart(2,'0')} · 飞行中`;
 $('flight').dataset.phase=state.phase;$('flight').dataset.tick=state.tick;$('flight').dataset.level=index;
 $('bumps').textContent=state.bumps?`轻擦 ${state.bumps} 次`:'轻擦没关系';
 for(const side of ['left','right']){const balls=state.balloons.filter(b=>b.side===side);const gas=balls.length?balls.reduce((sum,b)=>sum+b.gas,0)/balls.length:0;$(side+'-gas').style.width=gas*100+'%';$(side+'-balls').textContent=balls.length+'只';}
 draw(now);requestAnimationFrame(frame);
}
sync();requestAnimationFrame(frame);
