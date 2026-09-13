import * as THREE from 'three';
import { createWorld } from './world.js';
import { createGame, tick, interact, startOrder, restart, target, contextAction, ORDERS } from './game.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { drawMap } from './map.js';
import './style.css';

const $ = id => document.getElementById(id);
const canvas = $('world'), panel = $('panel'), overlay = $('overlay');
const SAVE_KEY = 'tangerine-express-v1';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') || {}; } catch { /* A fresh island if storage is unavailable. */ }
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
} catch {
  $('loading').innerHTML = '<span class="orange-mark">✳</span><b>小岛需要 3D 画面支持</b><span>请使用支持 WebGL 2 的浏览器，或启用硬件加速后重试。</span><button class="primary" onclick="location.reload()">重新载入 ↻</button>';
  throw new Error('WebGL 2 is unavailable');
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#c8e2e2');
scene.fog = new THREE.Fog('#c8e2e2', 75, 180);
const world = createWorld(scene);
const cameraObstacles = world.cameraColliders.map(c => new THREE.Box3(
  new THREE.Vector3(c.x - c.w / 2, 0, c.z - c.d / 2),
  new THREE.Vector3(c.x + c.w / 2, c.h, c.z + c.d / 2),
));
const cameraRay = new THREE.Ray(), cameraDirection = new THREE.Vector3(), cameraHit = new THREE.Vector3();
const s = createGame(saved);
const camera = new THREE.PerspectiveCamera(51, innerWidth / innerHeight, 0.1, 260);
const audio = createAudio();
let muted = saved.muted === true;
audio.mute(muted);
let mode = 'home', modal = '', selection = s.orderIndex, lastPhase = '', orbit = 0, pitch = 0, cameraAngle = 0;
let lastTime = performance.now(), uiClock = 0, cameraSnap = true, lostContext = false;
let lowFrameTime = 0, adaptiveDone = false;
const cameraPosition = new THREE.Vector3(), cameraLook = new THREE.Vector3(), projected = new THREE.Vector3();
const look = new THREE.Vector3();

const input = createInput({
  stick: $('stick'), knob: $('knob'), boost: $('boost'), brake: $('brake'), jump: $('jump'), canvas,
  onAction: doInteract, onPause: togglePause, onMap: showMap,
  onOrbit(dx, dy) { if (mode === 'play' && !modal) { orbit -= dx * .006; pitch = THREE.MathUtils.clamp(pitch + dy * .015, -2, 4); } },
});

function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ coins: s.coins, completed: s.completed, muted })); }
  catch { s.message = '此浏览器未开放存储，本次收益暂存到页面关闭前'; s.messageTime = 5; }
  $('saved-deliveries').textContent = String(s.completed).padStart(2, '0');
  $('saved-coins').textContent = s.coins;
}

function setModal(type, html) {
  input.reset();
  audio.engine(0);
  modal = type;
  overlay.hidden = false;
  panel.className = `paper-panel ${type === 'result' ? 'result-panel' : ''} ${type === 'map' ? 'map-panel' : ''}`;
  panel.innerHTML = html;
  panel.querySelector('button')?.focus({ preventScroll: true });
}
function closeModal() {
  overlay.hidden = true;
  modal = '';
  input.reset();
  audio.resume();
  lastTime = performance.now();
  canvas.focus({ preventScroll: true });
}

function showOrders() {
  audio.unlock(); audio.resume();
  selection = s.orderIndex;
  setModal('orders', `<button class="close-panel" aria-label="关闭订单" data-action="close">×</button>
    <div class="panel-eyebrow">THE ISLAND DISPATCH / 今日配送</div><h2 id="panel-title">一份小小的期待。</h2>
    <p class="panel-copy">从橘风集市出发。选一份订单，把新鲜送到岛民手里。</p>
    <div class="order-options">${ORDERS.map((o, i) => `<button class="order-option ${i === selection ? 'selected' : ''}" data-order="${i}" aria-pressed="${i === selection}"><span class="order-emoji">${['☕', '⚑', '❀'][i]}</span><div><b>${o.name}</b><small>${o.title} · 橘子 / 面包 / 牛奶</small></div><strong>+${o.reward}<small>橘子币 + 小费</small></strong></button>`).join('')}</div>
    <div class="panel-actions"><button class="primary" data-action="accept">接下这份期待 <span>↗</span></button></div>`);
}

function begin(index, retry = false) {
  audio.unlock(); audio.resume();
  if (retry) restart(s); else startOrder(s, index);
  mode = 'play';
  document.body.classList.add('playing');
  $('home').hidden = true; $('hud').hidden = false; $('pause').hidden = false;
  closeModal();
  orbit = pitch = 0;
  cameraAngle = s.angle;
  cameraSnap = true;
  lastPhase = '';
  updateHUD();
}

function returnHome() {
  closeModal();
  mode = 'home';
  Object.assign(s, { phase: 'ready', mode: 'ride', x: 0, z: 16, speed: 0, angle: 0, jumpY: 0, cargo: 0, result: null, events: [] });
  document.body.classList.remove('playing');
  $('home').hidden = false; $('hud').hidden = true; $('pause').hidden = true;
  cameraSnap = true;
  save();
}

function showHelp() {
  setModal('help', `<button class="close-panel" aria-label="关闭手册" data-action="close">×</button><div class="panel-eyebrow">A LITTLE FIELD GUIDE / 配送手册</div><h2 id="panel-title">第一次上岛？</h2>
    <div class="guide-rows"><div class="guide-row"><span>01</span><div><b>向前推摇杆，海风就来了</b><p>上下控制前进与倒车，左右始终控制车头转向，停下也能转头。按住加速更快，松手会慢慢停下；急弯前记得刹车。</p></div></div>
    <div class="guide-row"><span>02</span><div><b>取货，要亲自走一趟</b><p>跟随橘色光圈到集市，停稳后点「下车取货」。走到各摊位，拿齐橘子、面包与牛奶，再回入口上车。</p></div></div>
    <div class="guide-row"><span>03</span><div><b>慢一点，货物会谢谢你</b><p>碰撞、急速转弯和高速跳跃落地会损伤货物。3 分钟内送达，完整又准时，能拿到三星和更多小费。</p></div></div></div>
    <div class="keyboard-hint">电脑也能骑：WASD / 方向键驾驶 · Shift 加速 · 空格跳跃 · E 交互 · M 地图 · P 暂停<br>拖动空白画面环顾小镇。打开地图、暂停或切到后台时，订单倒计时会暂停。</div>
    <div class="panel-actions"><button class="primary" data-action="close">记住啦，出发 <span>↗</span></button></div>`);
}

function togglePause() {
  if (mode !== 'play' || s.phase === 'result') { if (modal && modal !== 'result') closeModal(); return; }
  if (modal) { closeModal(); return; }
  setModal('pause', `<div class="panel-eyebrow">TAKE A BREATHER / 小憩片刻</div><h2 id="panel-title">海风替你保管时间。</h2><p class="panel-copy">订单已暂停。喝口水，再把这份快乐送到。</p>
    <div class="panel-actions"><button class="primary" data-action="close">继续配送 <span>↗</span></button><button class="plain-button" data-action="retry">重送本单</button><button class="plain-button" data-action="home">返回小岛</button></div>`);
}

function showMap() {
  if (mode !== 'play' || s.phase === 'result') return;
  if (modal === 'map') { closeModal(); return; }
  if (modal) return;
  setModal('map', `<button class="close-panel" aria-label="关闭地图" data-action="close">×</button><div class="panel-eyebrow">TANGERINE ISLAND / 停下来，看看路</div><h2 id="panel-title">每条路都有好风景。</h2><canvas id="large-map" width="600" height="480" aria-label="小岛地图：显示当前位置、集市与配送点"></canvas><div class="map-legend"><span>● 当前目标</span><span>▲ 你在这里</span><span>绿块为绕行花坛 · 虚线仅指方向 · 外圈为海岸路</span></div>`);
  drawMap($('large-map'), s, world.colliders, true);
}

function showResult() {
  const r = s.result;
  if (!r) return;
  save();
  setModal('result', `<div class="panel-eyebrow">${r.delivered ? 'SIGNED WITH A SMILE / 已签收' : 'A FRESH START / 再来一次'}</div>
    <div class="result-stars">${r.delivered ? '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars) : '☁'}</div>
    <h2 id="panel-title">${r.delivered ? '快乐，已经送到。' : '这次，歇一歇再出发。'}</h2>
    <p class="panel-copy">${r.delivered ? `${ORDERS[s.orderIndex].name}说：「谢谢你，新鲜刚刚好！」` : r.reason}</p>
    <div class="receipt"><div><b>${Math.floor(r.elapsed / 60)}′${String(r.elapsed % 60).padStart(2, '0')}″</b><small>配送用时</small></div><div><b>${Math.round(s.integrity)}%</b><small>货物完整</small></div><div><b>${s.completed}</b><small>累计送达</small></div></div>
    <div class="result-reward"><b>+${r.reward}</b> 橘子币${r.delivered ? `<br><small>含 ${r.tip} 枚暖心小费 · 已存入你的口袋</small>` : ''}</div>
    <div class="panel-actions"><button class="primary" data-action="${r.delivered ? 'next' : 'retry'}">${r.delivered ? '下一份期待' : '重新配送'} <span>↗</span></button><button class="plain-button" data-action="home">回到小岛</button></div>`);
}

function doInteract() {
  if (mode !== 'play' || modal) return;
  audio.unlock();
  if (!interact(s)) {
    s.message = contextAction(s) === '刹车停稳' ? '先松开摇杆，停稳再交接' : '靠近橘色光圈，就可以交接啦'; s.messageTime = 2;
  }
  input.reset();
  updateHUD();
}

panel.addEventListener('click', event => {
  const choice = event.target.closest('[data-order]');
  if (choice) {
    selection = Number(choice.dataset.order);
    panel.querySelectorAll('[data-order]').forEach(el => { const selected = Number(el.dataset.order) === selection; el.classList.toggle('selected', selected); el.setAttribute('aria-pressed', selected); });
    audio.play('ui'); return;
  }
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  audio.unlock(); audio.resume(); audio.play('ui');
  if (action === 'close') closeModal();
  if (action === 'accept') begin(selection);
  if (action === 'retry') begin(s.orderIndex, true);
  if (action === 'next') begin(s.orderIndex + 1);
  if (action === 'home') returnHome();
});
panel.addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  const buttons = [...panel.querySelectorAll('button:not([disabled])')];
  if (e.shiftKey && document.activeElement === buttons[0]) { e.preventDefault(); buttons.at(-1)?.focus(); }
  if (!e.shiftKey && document.activeElement === buttons.at(-1)) { e.preventDefault(); buttons[0]?.focus(); }
});
$('start').onclick = showOrders;
$('help').onclick = showHelp;
$('pause').onclick = togglePause;
$('minimap-button').onclick = showMap;
$('interact').onclick = doInteract;
$('sound').onclick = () => { audio.unlock(); muted = !muted; audio.mute(muted); soundLabel(); save(); };
function soundLabel() { $('sound').textContent = muted ? '♪̸' : '♫'; $('sound').setAttribute('aria-label', muted ? '开启声音' : '关闭声音'); $('sound').setAttribute('aria-pressed', String(muted)); }
$('fullscreen').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) { await document.documentElement.requestFullscreen(); await screen.orientation?.lock?.('landscape').catch(() => {}); }
    else { s.message = '此浏览器可通过“添加到主屏幕”进入独立窗口'; s.messageTime = 5; if (mode === 'home') showHelp(); }
  } catch { s.message = '暂时无法全屏，横屏同样可以玩'; s.messageTime = 4; }
};
document.addEventListener('fullscreenchange', () => { $('fullscreen').setAttribute('aria-label', document.fullscreenElement ? '退出全屏' : '进入全屏'); resize(); });
canvas.tabIndex = -1;

function suspend() {
  input.reset(); audio.suspend();
  if (mode === 'play' && !modal && s.phase !== 'result') togglePause();
}
window.addEventListener('blur', suspend);
document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); });
window.addEventListener('pagehide', save);
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault(); lostContext = true; suspend();
  setModal('context', '<h2 id="panel-title">画面正在休息</h2><p class="panel-copy">3D 画面暂时中断，订单已经暂停。请重新载入小岛，已完成的收益会保留。</p><button class="primary" onclick="location.reload()">重新载入 ↻</button>');
});

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  input.reset(); cameraSnap = true;
  if (matchMedia('(orientation: portrait) and (max-width: 700px)').matches) suspend();
}
window.addEventListener('resize', resize);


function updateHUD() {
  const t = target(s), order = ORDERS[s.orderIndex], dist = Math.hypot(t.x - s.x, t.z - s.z);
  $('order-number').textContent = `NO. ${String(s.completed + 1).padStart(3, '0')}`;
  const seconds = Math.ceil(s.timeLeft);
  $('timer').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  $('timer').classList.toggle('urgent', seconds <= 30);
  $('objective').textContent = s.phase === 'pickup' ? '先去橘风集市' : s.phase === 'collect' ? s.cargo === 3 ? '装齐了，回小摩托上' : `逛逛集市 · ${s.cargo} / 3` : `送往${order.name}`;
  $('objective-detail').textContent = s.phase === 'pickup' ? '靠近光圈，停稳后下车取货' : s.phase === 'collect' ? s.cargo === 3 ? '回到集市入口，准备把新鲜送到' : '走到摊位旁，点按拾取货物' : '照顾好货物，沿路把快乐送到';
  const stage = ['pickup', 'collect', 'deliver'].indexOf(s.phase);
  document.querySelectorAll('[data-step]').forEach((el, i) => { el.classList.toggle('active', i === stage); el.classList.toggle('done', i < stage); });
  $('cargo-label').textContent = s.cargo ? `货物 ${s.cargo}/3 · 完整 ${Math.round(s.integrity)}%` : '空箱出发，满载而归';
  $('integrity').style.width = `${s.integrity}%`;
  $('integrity').style.background = s.integrity < 45 ? '#da7744' : '#76986a';
  $('energy').style.width = `${s.energy}%`;
  $('speed').textContent = String(Math.round(Math.abs(s.speed) * 3.6)).padStart(2, '0');
  $('ride-mode').textContent = s.mode === 'walk' ? '集市散步 · 挑点新鲜的' : s.boosting ? '海风加速中 · 过弯要轻' : '小摩托 · 慢慢来也很快';
  $('steer-label').innerHTML = `${s.mode === 'walk' ? '滑动行走' : '滑动驾驶'} <span>W A S D</span>`;
  $('boost').disabled = s.mode === 'walk';
  $('coins').textContent = s.coins;
  $('nav-distance').textContent = `${Math.round(dist)} m`;
  $('nav-name').textContent = t.name;
  const bearing = Math.atan2(t.x - s.x, -(t.z - s.z)) - cameraAngle;
  $('nav-arrow').style.transform = `rotate(${bearing}rad)`;
  $('pin-name').textContent = t.name;
  $('pin-distance').textContent = `${Math.round(dist)} m`;
  const action = contextAction(s);
  $('interact').hidden = !action || s.phase === 'result';
  if (action) $('interact').innerHTML = `${action} <span>E</span>`;
  $('toast').textContent = s.message;
  $('toast').classList.toggle('visible', s.messageTime > 0 && !modal);
  drawMap($('minimap'), s, world.colliders);
}

function frame(now) {
  const rawDelta = (now - lastTime) / 1000, dt = Math.min(rawDelta, .05);
  lastTime = now;
  const running = mode === 'play' && !modal && !document.hidden && !lostContext;
  if (running) tick(s, input.read(), rawDelta, world.colliders); else input.reset();
  for (const e of s.events.splice(0)) {
    audio.play(e.type);
    if (['pickup', 'delivery', 'crash'].includes(e.type)) world.burst(e.x, e.z, e.type === 'crash' ? '#d89772' : '#f5c455');
    if (e.type === 'crash') { canvas.classList.remove('toast-shake'); void canvas.offsetWidth; canvas.classList.add('toast-shake'); }
    if (e.type === 'delivery') navigator.vibrate?.([30, 30, 60]);
  }
  if (s.phase === 'result' && lastPhase !== 'result') showResult();
  lastPhase = s.phase;
  audio.engine(running && s.mode === 'ride' ? s.speed : 0, s.boosting);
  world.update(s, dt, now / 1000);
  if (mode === 'home') {
    cameraPosition.set(8 + Math.sin(now / 16000) * 1.4, 5.5, 25);
    cameraLook.set(-3.8, 1.2, 11);
    camera.fov = 48;
  } else {
    const deltaAngle = Math.atan2(Math.sin(s.angle - cameraAngle), Math.cos(s.angle - cameraAngle));
    cameraAngle += deltaAngle * Math.min(1, dt * 5);
    if (Math.abs(s.speed) > 1) orbit *= Math.exp(-dt * .55);
    const a = cameraAngle + orbit, distance = s.mode === 'walk' ? 7.7 : 9.4 + Math.abs(s.speed) * .14;
    cameraPosition.set(s.x - Math.sin(a) * distance, (s.mode === 'walk' ? 6 : 5.6) + pitch + s.jumpY * .35, s.z + Math.cos(a) * distance);
    cameraLook.set(s.x + Math.sin(cameraAngle) * 2, 1.25 + s.jumpY * .5, s.z - Math.cos(cameraAngle) * 2);
    camera.fov += ((s.boosting ? 64 : 53) - camera.fov) * Math.min(1, dt * 3);
  }
  if (cameraSnap) { camera.position.copy(cameraPosition); look.copy(cameraLook); cameraSnap = false; }
  else { camera.position.lerp(cameraPosition, 1 - Math.exp(-dt * 5)); look.lerp(cameraLook, 1 - Math.exp(-dt * 9)); }
  if (mode === 'play') {
    let distance = look.distanceTo(camera.position);
    cameraDirection.copy(camera.position).sub(look).normalize();
    cameraRay.set(look, cameraDirection);
    for (const box of cameraObstacles) {
      if (cameraRay.intersectBox(box, cameraHit)) distance = Math.min(distance, Math.max(.6, look.distanceTo(cameraHit) - .45));
    }
    camera.position.copy(look).addScaledVector(cameraDirection, distance);
  }
  camera.lookAt(look); camera.updateProjectionMatrix();
  const t = target(s);
  world.marker.position.set(t.x, .04, t.z); world.marker.visible = mode === 'play' && s.phase !== 'result';
  projected.set(t.x, 3.7, t.z).project(camera);
  const inView = projected.z < 1 && projected.z > -1 && Math.abs(projected.x) < .82 && Math.abs(projected.y) < .78;
  $('destination-pin').hidden = !inView || s.phase === 'result';
  if (inView) { $('destination-pin').style.left = `${(projected.x * .5 + .5) * innerWidth}px`; $('destination-pin').style.top = `${(-projected.y * .5 + .5) * innerHeight}px`; }
  uiClock += rawDelta;
  if (uiClock > .1 && mode === 'play') { updateHUD(); uiClock = 0; }
  // ponytail: one DPR reduction for sustained slow frames; add device quality tiers only after profiling real phones.
  if (!adaptiveDone && running) {
    lowFrameTime = rawDelta > .031 ? lowFrameTime + dt : Math.max(0, lowFrameTime - dt);
    if (lowFrameTime > 4) { renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight, false); adaptiveDone = true; }
  }
  if (!lostContext && !document.hidden) renderer.render(scene, camera);
}

resize(); soundLabel(); save();
$('loading').hidden = true; $('home').hidden = false;
renderer.setAnimationLoop(frame);
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('./sw.js').catch(() => {});

// Read-only diagnostics for repeatable browser checks. No test controls ship in gameplay.
window.__tangerine = { snapshot: () => ({ ...s, items: [...s.items], events: [], modal, appMode: mode, target: target(s), action: contextAction(s), renderer: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, pixelRatio: renderer.getPixelRatio() } }) };
