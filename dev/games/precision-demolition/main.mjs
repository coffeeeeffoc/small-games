import { WORLD, LEVELS } from './levels.mjs';
import { createGame, begin, pointer, setPaused, step, snapshot, jointAt, DT } from './simulation.mjs';
const $ = id => document.getElementById(id);
const canvas = $('scene'), ctx = canvas.getContext('2d'), site = $('site');
let game = createGame(0), activePointer = null, accumulator = 0, lastTime = 0, eventCursor = 0, uiPhase = '', audio;
let muted = false;
try { muted = localStorage.getItem('demolition-muted') === '1'; } catch {}
const frameTimes = [], updateTimes = [];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function unlockAudio() {
  if (muted) return;
  try {
    if (!audio) { const Context = window.AudioContext || window.webkitAudioContext; if (!Context) return; const ac = new Context(); const master = ac.createGain(); master.connect(ac.destination); master.gain.value = .25; audio = { ac, master }; }
    audio.ac.resume().catch(() => {});
  } catch {}
}
function sound(type, mass = 1) {
  if (muted || !audio || audio.ac.state !== 'running') return;
  const { ac, master } = audio, now = ac.currentTime, gain = ac.createGain(), osc = ac.createOscillator();
  osc.type = type === 'strike' ? 'triangle' : 'sine';
  const hz = type === 'strike' ? 570 : type === 'won' ? 660 : type === 'failure' ? 145 : Math.max(60, 180 - mass * 20);
  osc.frequency.setValueAtTime(hz, now); osc.frequency.exponentialRampToValueAtTime(Math.max(40, hz * .45), now + .12);
  gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(.6, now + .004); gain.gain.exponentialRampToValueAtTime(.0001, now + .17);
  osc.connect(gain); gain.connect(master); osc.start(now); osc.stop(now + .18);
  if (type !== 'won') {
    const buffer = ac.createBuffer(1, ac.sampleRate * .075, ac.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) * .12;
    const noise = ac.createBufferSource(); noise.buffer = buffer; noise.connect(master); noise.start();
  }
}
function stop(type = 'cancel') { pointer(game, type); activePointer = null; }
function load(index, play = false) {
  stop(); game = createGame(index); accumulator = 0; eventCursor = 0; uiPhase = '';
  $('chapter').textContent = game.level.label; $('title').textContent = game.level.title;
  document.querySelectorAll('[data-level]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.level === index)));
  $('joint-buttons').replaceChildren();
  for (const n of game.nodes.filter(n => n.target)) for (const e of n.edges) {
    const b = document.createElement('button'); b.className = 'joint'; b.dataset.id = e.id; b.dataset.arrow = e.push < 0 ? '凿 ←' : '凿 →'; b.dataset.hp = '3';
    b.style.left = `${e.x / 4}%`; b.style.top = `${e.y / 5.5}%`;
    b.setAttribute('aria-label', `${n.name}${e.id.endsWith('-L') ? '左' : '右'}接缝，最后一锤向${e.push < 0 ? '左' : '右'}推`);
    b.addEventListener('keydown', event => { if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) { event.preventDefault(); unlockAudio(); pointer(game, 'down', e.x, e.y); } });
    b.addEventListener('keyup', event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); stop('up'); } });
    b.addEventListener('blur', () => stop()); $('joint-buttons').append(b);
  }
  if (play) begin(game);
  sync();
}
function coords(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * WORLD.w / r.width, y: (e.clientY - r.top) * WORLD.h / r.height }; }
site.addEventListener('pointerdown', e => {
  if (game.phase !== 'playing' || game.pause || e.target.closest('.overlay') || activePointer !== null || !e.isPrimary) return;
  e.preventDefault(); unlockAudio(); activePointer = e.pointerId; site.setPointerCapture(e.pointerId);
  const p = coords(e); pointer(game, 'down', p.x, p.y);
});
site.addEventListener('pointermove', e => { if (activePointer !== e.pointerId) return; const p = coords(e); pointer(game, 'move', p.x, p.y); });
site.addEventListener('pointerup', e => { if (activePointer === e.pointerId) stop('up'); });
site.addEventListener('pointercancel', e => { if (activePointer === e.pointerId) stop(); });
site.addEventListener('lostpointercapture', () => { if (activePointer !== null) stop(); });
window.addEventListener('blur', () => stop());
document.addEventListener('visibilitychange', () => { if (document.hidden && game.phase === 'playing') { stop(); setPaused(game, true); sync(); } });
$('restart').onclick = () => { unlockAudio(); load(game.index, true); };
$('pause').onclick = () => { if (game.phase === 'playing') { stop(); setPaused(game, !game.pause); sync(); } };
$('sound').onclick = () => { muted = !muted; if (audio) audio.master.gain.value = muted ? 0 : .25; try { localStorage.setItem('demolition-muted', muted ? '1' : '0'); } catch {} if (!muted) unlockAudio(); sync(); };
document.querySelectorAll('[data-level]').forEach(b => b.onclick = () => load(+b.dataset.level));
$('primary').onclick = () => { unlockAudio(); if (game.pause) setPaused(game, false); else if (game.phase === 'ready') begin(game); else if (game.phase === 'won') load((game.index + 1) % LEVELS.length, true); else load(game.index, true); sync(); };
$('again').onclick = () => load(game.index, true);
function sync() {
  const seconds = Math.max(0, Math.ceil(60 - game.tick / 60));
  $('clock').textContent = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.ceil(seconds % 60).toString().padStart(2, '0')}`;
  const targets = game.nodes.filter(n => n.target), detached = targets.filter(n => !n.attached).length;
  $('count').textContent = `已拆 ${detached}/${targets.length}`;
  $('sound').textContent = muted ? '♪ 已静音' : '♪ 声音开'; $('sound').setAttribute('aria-pressed', String(muted));
  $('pause').textContent = game.pause ? '▶ 继续' : 'Ⅱ 暂停'; $('pause').disabled = game.phase !== 'playing';
  const selected = game.held && jointAt(game, game.held.x, game.held.y);
  for (const b of $('joint-buttons').children) {
    const n = game.nodes.find(n => n.edges.some(e => e.id === b.dataset.id)), e = n.edges.find(e => e.id === b.dataset.id);
    b.hidden = !n.attached || e.hp <= 0 || !game.byId[e.to].attached;
    b.disabled = game.phase !== 'playing' || game.pause || !!game.failure;
    b.dataset.hp = String(e.hp); b.classList.toggle('active', selected?.edge.id === e.id);
  }
  document.body.dataset.danger = String(!!game.failure || game.nodes.some(n => n.stress > 0));
  $('hint').textContent = game.failure || (game.tick >= 3600 ? '施工时间结束，正在验收落物…' : detached === targets.length ? '已经拆下，等落板稳定再验收…' : game.level.tip);
  const phase = game.pause ? 'paused' : game.phase;
  if (phase === uiPhase) return; uiPhase = phase;
  $('overlay').hidden = phase === 'playing'; $('guide').hidden = phase !== 'ready'; $('again').hidden = phase !== 'won';
  if (phase === 'ready') { $('card-eyebrow').textContent = game.level.label; $('card-title').textContent = game.level.title; $('card-body').textContent = game.level.lesson; $('primary').textContent = '开始施工'; }
  if (phase === 'paused') { $('card-eyebrow').textContent = '喘口气，现场已暂停'; $('card-title').textContent = '安全第一'; $('card-body').textContent = '时间与落物都已暂停。\n继续后重新按住接缝才会下锤。'; $('primary').textContent = '继续施工'; }
  if (phase === 'lost') { $('card-eyebrow').textContent = '现场复盘'; $('card-title').textContent = '这一锤，顺序不对'; $('card-body').textContent = `${game.failure}\n${game.level.tip}`; $('primary').textContent = '立即重试'; }
  if (phase === 'won') {
    const time = (game.tick / 60).toFixed(1); let best = time;
    try { const key = `demolition-best-${game.index}`; best = Math.min(Number(localStorage.getItem(key)) || Infinity, Number(time)).toFixed(1); localStorage.setItem(key, best); } catch {}
    $('card-eyebrow').textContent = '验收通过 / 保护完好'; $('card-title').textContent = '拆得漂亮，留得完整'; $('card-body').textContent = `用时 ${time} 秒 · 最好 ${best} 秒\n所有墙板已落稳，保护物完好。`; $('primary').textContent = game.index === 2 ? '再挑战第一关' : '下一处工地';
  }
}
function rect(x, y, w, h, fill, border) { ctx.fillStyle = fill; ctx.fillRect(x,y,w,h); if (border) { ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.strokeRect(x+.5,y+.5,w-1,h-1); } }
function text(t, x, y, size = 12, color = '#77624b', align = 'left') { ctx.fillStyle = color; ctx.font = `${size}px "Microsoft YaHei",sans-serif`; ctx.textAlign = align; ctx.fillText(t,x,y); }
function path(points, color, width = 1) { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); points.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.stroke(); }
function background() {
  rect(0,0,400,550,'#e8dcc4');
  const gradient = ctx.createLinearGradient(0,0,400,480); gradient.addColorStop(0,'#f2e9d6');gradient.addColorStop(1,'#e5d5b9');ctx.fillStyle=gradient;ctx.fillRect(12,24,376,498);
  for(let i=0;i<130;i++){const x=18+(i*113)%365,y=30+(i*89)%475;rect(x,y,1,1,'#b8a07b35');}
  rect(0,10,400,16,'#8f7352','#66513b');rect(0,12,400,3,'#b09572');
  for(let y=28;y<522;y+=28){rect(0,y,10,25,'#a96e4e','#936147');rect(390,y,10,25,'#a96e4e','#936147');}
  // Painted background window, visually separate from solid construction pieces.
  ctx.save();ctx.globalAlpha=.45;rect(22,330,64,103,'#b5c8c0','#c0b297');rect(28,336,52,91,'#cbded5');path([[54,336],[54,426]],'#f7f0dd',4);path([[28,373],[80,373]],'#f7f0dd',4);rect(20,429,70,6,'#b09b7d');ctx.restore();
  text('旧屋修缮计划',22,51,10,'#a48c6e');text('拆下旧墙 · 留住生活',22,67,9,'#b29b7d');
  rect(12,522,376,28,'#91a992','#627d6a');path([[14,526],[385,526]],'#d5dfc3',2);
  for(let x=20;x<385;x+=24)path([[x,545],[x+14,535]],'#829b82',1);
  text('落板区',200,542,11,'#eaf1d9','center');
  if(game.index===2){rect(350,50,34,87,'#d8be90','#bda67c');path([[359,100],[365,75],[373,100],[359,100]],'#fff2c8',2);path([[366,100],[366,119]],'#947557',2);text('隔壁',366,155,10,'#937550','center');}
}
function drawPlate(n) {
  const blue=n.protected, color=blue?'#52748a':n.id==='prop'||n.id==='stand'?'#c38b5a':'#f1e8d3';
  rect(n.x,n.y,n.w,n.h,color,blue?'#314f62':'#877354');
  rect(n.x+2,n.y+2,n.w-4,3,blue?'#7f9aaa':'#fff8e5');rect(n.x+2,n.y+n.h-7,n.w-4,5,blue?'#3f6074':'#b99f7d');
  ctx.save();ctx.beginPath();ctx.rect(n.x+1,n.y+1,n.w-2,n.h-2);ctx.clip();
  if(n.target){for(let k=-n.h;k<n.w;k+=17)path([[n.x+k,n.y+8],[n.x+k+10,n.y+18]],'#c5814d44',3);}
  for(let k=0;k<12;k++){const x=n.x+5+(k*19)%(n.w-10),y=n.y+7+(k*23)%(n.h-15);rect(x,y,2,1,blue?'#c4dad533':'#a9927350');}
  if(n.broken||n.stress>0)path([[n.x+n.w*.5,n.y],[n.x+n.w*.3,n.y+n.h*.3],[n.x+n.w*.7,n.y+n.h*.6],[n.x+n.w*.4,n.y+n.h]],'#a6422b',2.5);
  ctx.restore();
  if(blue){text('承',n.x+n.w/2,n.y+36,17,'#e5eadd','center');text('重',n.x+n.w/2,n.y+57,17,'#e5eadd','center');}
  else if(n.w>=58) {text(n.name.replace('上层','').replace('下层','').replace('花瓶上方墙板','上板'),n.x+n.w/2,n.y+n.h/2+5,11,'#927851','center');text(`${n.mass}t`,n.x+n.w/2,n.y+n.h-13,9,'#a48e70','center');}
}
function drawConnections() {
  for(const n of game.nodes) if(n.target&&n.attached) for(const e of n.edges) if(e.hp>0&&game.byId[e.to].attached){
    const p=game.byId[e.to];
    // Bolted support guides show actual graph links; these are not additional solid bodies.
    path([[Math.max(n.x+6,Math.min(n.x+n.w-6,e.x)),n.y+n.h],[e.x,e.y]],'#a38866',3);
    ctx.setLineDash([3,4]);path([[e.x,e.y+8],[Math.max(p.x+5,Math.min(p.x+p.w-5,e.x)),p.y]],'#9c8b6d88',1);ctx.setLineDash([]);
    if(e.hp<3)path([[e.x-8,e.y-17],[e.x-3,e.y-11],[e.x+4,e.y-16],[e.x+9,e.y-10]],'#893b21',1.5);
  }
  const p=game.byId.blue;
  if(p){rect(18,84,157,28,'#eee4d0','#c4b395');text(`左柱承重 ${p.load.toFixed(1)} / 5`,27,102,11,p.stress?'#b04026':'#527083');rect(27,106,138,2,'#d3c7b1');rect(27,106,Math.min(138,p.load/5*138),2,p.stress?'#b04026':'#628395');}
}
function drawObstacle(o) {
  if(o.kind==='vase'){
    ctx.save();ctx.beginPath();ctx.rect(o.x,o.y,o.w,o.h);ctx.clip();
    ctx.fillStyle=o.broken?'#b49b7e':'#94bda7';ctx.strokeStyle='#678d7d';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(o.x+8,o.y+1);ctx.lineTo(o.x+26,o.y+1);ctx.lineTo(o.x+24,o.y+13);ctx.bezierCurveTo(o.x+36,o.y+27,o.x+34,o.y+44,o.x+26,o.y+51);ctx.lineTo(o.x+8,o.y+51);ctx.bezierCurveTo(o.x,o.y+44,o.x-2,o.y+27,o.x+10,o.y+13);ctx.closePath();ctx.fill();ctx.stroke();
    rect(o.x+8,o.y+2,18,3,'#e0e8d3');path([[o.x+13,o.y+22],[o.x+22,o.y+29],[o.x+11,o.y+37],[o.x+22,o.y+44]],o.broken?'#9a532f':'#668f77',2);ctx.restore();
    text(o.broken?'碎了':'青瓷',o.x+o.w/2,o.y-10,10,o.broken?'#a04426':'#658779','center');
  }else{
    rect(o.x,o.y,o.w,o.h,o.broken?'#bf8c77':'#dab98e','#9b7856');
    for(let y=o.y+16;y<o.y+o.h;y+=25)path([[o.x+1,y],[o.x+o.w-1,y]],'#af8b64',1);
    if(o.broken)path([[o.x+6,o.y],[o.x+15,o.y+80],[o.x+4,o.y+160],[o.x+16,o.y+280]],'#9b3d2c',2);
    text('邻墙',o.x+o.w/2,o.y-12,10,'#976544','center');
  }
}
function effects() {
  for(const e of game.events.slice(-24)){
    const age=(game.tick-e.tick)/60;
    if(age<0||age>.6||e.x===undefined)continue;
    if(e.type==='strike'||e.type==='impact'){
      ctx.save();ctx.globalAlpha=(1-age/.6)*.6;
      for(let i=0;i<7;i++){const dx=(i-3)*15*age,dy=-35*age+80*age*age+i%2*4;rect(e.x+dx,e.y+dy,2+i%3,2+i%2,'#bc8e60');}
      ctx.restore();
    }
    if(e.type==='strike'&&age<.2){
      ctx.save();ctx.translate(e.x+7,e.y-11);ctx.rotate(reducedMotion?-.5:-.5+Math.sin(age/.2*Math.PI)*.7);rect(3,-34,6,43,'#b5844d','#765434');rect(-12,-39,34,13,'#7f8988','#444e4d');rect(-10,-37,12,2,'#c3ccbd');ctx.restore();
      ctx.strokeStyle='#e39c53';ctx.lineWidth=2;ctx.beginPath();ctx.arc(e.x,e.y,12+age*25,0,Math.PI*2);ctx.stroke();
    }
  }
}
function draw() {
  ctx.setTransform(2,0,0,2,0,0);background();drawConnections();
  game.nodes.filter(n=>n.id!=='ground').forEach(drawPlate);game.obstacles.forEach(drawObstacle);effects();
}
function frame(time) {
  const elapsed=lastTime?(time-lastTime)/1000:0;lastTime=time;
  if(elapsed&&game.phase==='playing'&&!game.pause){frameTimes.push(elapsed*1000);if(frameTimes.length>1200)frameTimes.shift();}
  const start=performance.now();
  accumulator = game.pause || game.phase!=='playing' ? 0 : Math.min(accumulator+elapsed,.1);
  while(accumulator>=DT){step(game);accumulator-=DT;}
  updateTimes.push(performance.now()-start);if(updateTimes.length>1200)updateTimes.shift();
  for(const event of game.events.slice(eventCursor)){if(['strike','impact','won','failure'].includes(event.type))sound(event.type,event.impulse/200||1);}eventCursor=game.events.length;
  sync();draw();requestAnimationFrame(frame);
}
window.demolition={snapshot:()=>snapshot(game),performance:()=>({frameTimes:[...frameTimes],updateTimes:[...updateTimes],audioState:audio?.ac.state||'not-started',muted})};
load(0);requestAnimationFrame(frame);
