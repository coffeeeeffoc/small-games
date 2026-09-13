import './style.css';
import { createGame, startGame, updateGame, action, aimTarget, terrainHeight } from './sim.js';
import { createInput } from './input.js';
import { createView } from './view.js';

const $ = id => document.getElementById(id);
const game = createGame();
let difficulty = 'normal', muted = false, best = 0, view, input, helpFromPause = false;
try { best = Number(localStorage.getItem('nullrange-cn-best')) || 0; muted = localStorage.getItem('nullrange-cn-muted') === 'true'; } catch { /* Play remains available when storage is blocked. */ }
$('best').textContent = String(best).padStart(6, '0');
let audio, engine, engineGain, master;
function unlockAudio() {
  try {
    if (!audio) {
      audio = new (window.AudioContext || window.webkitAudioContext)();
      master = audio.createGain(); master.gain.value = muted ? 0 : 0.32; master.connect(audio.destination);
      engine = audio.createOscillator(); engine.type = 'sawtooth'; engine.frequency.value = 42;
      const filter = audio.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 130;
      engineGain = audio.createGain(); engineGain.gain.value = 0;
      engine.connect(filter).connect(engineGain).connect(master); engine.start();
    }
    if (audio.state === 'suspended') audio.resume().catch(() => {});
  } catch { /* Audio is optional; flight and controls stay usable. */ }
}
function tone(frequency, duration, type = 'sine', volume = 0.1, end = frequency) {
  if (!audio || muted || audio.state !== 'running') return;
  const oscillator = audio.createOscillator(), gain = audio.createGain(), now = audio.currentTime;
  oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, now); oscillator.frequency.exponentialRampToValueAtTime(Math.max(15, end), now + duration);
  gain.gain.setValueAtTime(volume, now); gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.connect(gain).connect(master); oscillator.start(); oscillator.stop(now + duration);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}
const sounds = {
  shoot: () => tone(620, .09, 'sawtooth', .07, 150), hit: () => tone(900, .05, 'square', .05, 400),
  kill: () => { tone(115, .45, 'sawtooth', .3, 25); tone(250, .24, 'triangle', .2, 30); },
  damage: () => tone(75, .28, 'square', .22, 40), pickup: () => tone(530, .22, 'sine', .16, 1200),
  missile: () => tone(150, .4, 'sawtooth', .14, 600), scan: () => tone(1200, .85, 'sine', .13, 180),
  wave: () => tone(330, .3, 'sine', .08, 490), won: () => tone(440, .8, 'triangle', .2, 1320), lost: () => tone(240, 1, 'triangle', .25, 30),
};

function soundButton() { $('sound').classList.toggle('muted', muted); $('sound').setAttribute('aria-label', muted ? '开启声音' : '关闭声音'); $('sound').setAttribute('aria-pressed', String(!muted)); }
soundButton();
$('sound').onclick = () => { unlockAudio(); muted = !muted; if (master) master.gain.value = muted ? 0 : .32; soundButton(); try { localStorage.setItem('nullrange-cn-muted', String(muted)); } catch {} if (game.mode === 'running') blurControl(); };
document.querySelectorAll('[data-difficulty]').forEach(button => { button.onclick = () => {
  difficulty = button.dataset.difficulty;
  document.querySelectorAll('[data-difficulty]').forEach(b => { b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', String(b === button)); });
}; });
$('progress').innerHTML = '<i></i>'.repeat(12);
const ticks = [...$('progress').children];
const dialogs = ['pause-dialog', 'help-dialog', 'result-dialog'];
function closeDialogs() { dialogs.forEach(id => $(id).close()); }
function blurControl() { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); }
function deploy() {
  unlockAudio(); closeDialogs(); input.reset(); startGame(game, { difficulty });
  $('menu').hidden = true; $('hud').hidden = false; $('pause').hidden = false;
  document.body.classList.add('playing'); blurControl();
}
function pause() {
  if (game.mode === 'paused') { if (!$('help-dialog').open) resume(); return; }
  if (game.mode !== 'running') return;
  game.mode = 'paused'; input.reset(); if (engineGain) engineGain.gain.value = 0; $('pause-dialog').showModal();
}
function resume() { if (game.mode !== 'paused') return; closeDialogs(); input.reset(); game.mode = 'running'; unlockAudio(); blurControl(); }
function menu() {
  closeDialogs(); input.reset(); Object.assign(game, createGame());
  $('menu').hidden = false; $('hud').hidden = true; $('pause').hidden = true;
  document.body.classList.remove('playing', 'locked'); blurControl();
}
function changeView() { if (!view) return; const cockpit = view.toggleCamera(); $('view').querySelector('span').textContent = cockpit ? '座舱视角' : '追尾视角'; $('view').setAttribute('aria-label', cockpit ? '切换追尾视角' : '切换座舱视角'); blurControl(); }
function doAction(name) { unlockAudio(); action(game, name); blurControl(); }
$('deploy').onclick = deploy; $('restart').onclick = deploy;
$('pause').onclick = pause; $('resume').onclick = resume;
$('back-menu').onclick = menu; $('result-menu').onclick = menu;
$('view').onclick = changeView;
$('scan').onclick = () => doAction('scan'); $('missile').onclick = () => doAction('missile');
document.querySelector('.brand').onclick = event => { event.preventDefault(); if (game.mode === 'running') pause(); };
function openHelp(fromPause) { helpFromPause = fromPause; $('pause-dialog').close(); $('help-dialog').showModal(); }
$('help-open').onclick = () => openHelp(false); $('pause-help').onclick = () => openHelp(true);
function closeHelp() { $('help-dialog').close(); if (helpFromPause) $('pause-dialog').showModal(); }
$('help-close').onclick = closeHelp;
$('help-dialog').addEventListener('cancel', e => { e.preventDefault(); closeHelp(); });
$('pause-dialog').addEventListener('cancel', e => { e.preventDefault(); resume(); });
$('result-dialog').addEventListener('cancel', e => { e.preventDefault(); menu(); });
$('fullscreen').hidden = !document.fullscreenEnabled;
$('fullscreen').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else { await document.documentElement.requestFullscreen(); if (screen.orientation?.lock) await screen.orientation.lock('landscape').catch(() => {}); }
  } catch { game.notice = '当前浏览器不支持全屏，可横屏继续游戏'; game.noticeTime = 3; }
  blurControl();
};
document.addEventListener('fullscreenchange', () => { $('fullscreen').setAttribute('aria-label', document.fullscreenElement ? '退出全屏' : '进入全屏'); input?.reset(); });
addEventListener('blur', () => { if (game.mode === 'running') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && game.mode === 'running') pause(); });
addEventListener('resize', () => input?.reset());

const radar = $('radar').getContext('2d');
function updateRadar() {
  const c = radar, center = 104, radius = 93, range = game.scanTime > 0 ? 1000 : 650, p = game.player;
  c.clearRect(0, 0, 208, 208);
  c.fillStyle = '#081c20a8'; c.beginPath(); c.arc(center, center, radius, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#74ad9940'; c.lineWidth = 1;
  for (const r of [31, 62, 93]) { c.beginPath(); c.arc(center, center, r, 0, Math.PI * 2); c.stroke(); }
  c.beginPath(); c.moveTo(11, center); c.lineTo(197, center); c.moveTo(center, 11); c.lineTo(center, 197); c.stroke();
  const angle = game.time * .8;
  c.fillStyle = '#84d8ad15'; c.beginPath(); c.moveTo(center, center); c.arc(center, center, radius, angle, angle + .55); c.closePath(); c.fill();
  for (const e of [...game.enemies, ...game.pickups]) {
    const dx = e.x - p.x, dz = e.z - p.z, dist = Math.hypot(dx, dz);
    if (dist > range) continue;
    const x = (dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)) / range * radius;
    const y = (dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw)) / range * radius;
    c.fillStyle = e.hp !== undefined ? '#ff9271' : '#92ead3';
    c.fillRect(center + x - 3, center + y - 3, e.hp !== undefined ? 6 : 4, e.hp !== undefined ? 6 : 4);
  }
  c.fillStyle = '#dfddad'; c.beginPath(); c.moveTo(center, center - 7); c.lineTo(center - 4, center + 5); c.lineTo(center + 4, center + 5); c.fill();
}
function updateHud() {
  const p = game.player;
  $('speed').textContent = Math.round(p.speed).toString().padStart(3, '0');
  $('altitude').textContent = Math.round(p.y - terrainHeight(p.x, p.z)).toString().padStart(3, '0');
  $('heading').textContent = String(Math.round(((-p.yaw * 180 / Math.PI) % 360 + 360) % 360)).padStart(3, '0');
  $('score').textContent = String(game.score).padStart(6, '0'); $('kills').textContent = String(game.kills).padStart(2, '0');
  $('wave').textContent = `0${game.wave} / 03`; $('objective').textContent = `本波剩余 ${game.enemies.length} 架 · 扫描回收残骸`;
  $('shield').value = p.shield / 70 * 100; $('shield-text').textContent = Math.round(p.shield / 70 * 100);
  $('hull').value = p.hull; $('hull-text').textContent = Math.round(p.hull);
  $('boost-status').textContent = `${Math.round(p.energy)}%`;
  $('missile-status').textContent = game.missileCooldown > 0 ? `${game.missileCooldown.toFixed(1)}秒` : `× ${game.missiles}`;
  $('scan-status').textContent = game.scanCooldown > 0 ? `${Math.ceil(game.scanCooldown)}秒` : '就绪';
  $('missile').classList.toggle('cooldown', game.missileCooldown > 0 || game.missiles === 0);
  $('scan').classList.toggle('cooldown', game.scanCooldown > 0);
  $('radar-label').textContent = game.scanTime > 0 ? '扫描 / 磁吸回收' : '被动雷达';
  $('heat-label').textContent = game._overheated ? '武器过热 / 冷却中' : '脉冲激光 / 就绪';
  $('heat-bar').style.width = `${game.heat * 100}%`; $('fire').classList.toggle('overheated', game._overheated);
  $('notice').textContent = game.noticeTime > 0 ? game.notice : '';
  $('flight-tip').hidden = game.time > 12;
  ticks.forEach((tick, i) => tick.classList.toggle('done', i < game.kills));
  $('damage-flash').style.opacity = String(Math.max(0, .5 - game._damageAgo * 2));
  const target = aimTarget(game);
  document.body.classList.toggle('locked', !!target);
  const nearest = target || [...game.enemies].sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
  $('target').hidden = true; $('direction').hidden = true;
  if (nearest) {
    const screen = view.project(nearest);
    if (screen.visible) {
      $('target').hidden = false; $('target').style.left = `${screen.x}px`; $('target').style.top = `${screen.y}px`;
      $('target-label').textContent = target ? '辅助锁定' : '敌方信号';
      $('target-distance').textContent = `${Math.round(Math.hypot(nearest.x - p.x, nearest.y - p.y, nearest.z - p.z))}米`;
    } else {
      const relative = Math.atan2(-(nearest.x - p.x), -(nearest.z - p.z)) - p.yaw;
      $('direction').hidden = false;
      $('direction').style.left = `${innerWidth / 2 - Math.sin(relative) * Math.min(innerWidth * .36, 240)}px`;
      $('direction').style.top = `${innerHeight / 2 - Math.cos(relative) * Math.min(innerHeight * .19, 110)}px`;
      $('direction').querySelector('small').textContent = Math.cos(relative) < 0 ? '后方目标' : '目标';
    }
  }
  updateRadar();
}
function result() {
  input.reset();
  const won = game.mode === 'won';
  $('result-eyebrow').textContent = won ? '行动完成 / SECTOR CLEAR' : '信号中断 / SIGNAL LOST';
  $('result-title').textContent = won ? '空域，重归寂静。' : '回响尚未结束。';
  $('result-copy').textContent = won ? '三波敌机已清除。游隼，欢迎返航。' : '机体损毁。下次借助加速避弹，及时拉升避开山体。';
  $('result-score').textContent = game.score; $('result-kills').textContent = `${game.kills} / 12`;
  $('result-time').textContent = `${String(Math.floor(game.time / 60)).padStart(2, '0')}:${String(Math.floor(game.time % 60)).padStart(2, '0')}`;
  best = Math.max(best, game.score); $('best').textContent = String(best).padStart(6, '0');
  try { localStorage.setItem('nullrange-cn-best', String(best)); } catch {}
  $('result-dialog').showModal();
}

try {
  view = createView($('world'));
  input = createInput({ joystick: $('joystick'), stick: $('stick'), fire: $('fire'), boost: $('boost'), onAction: doAction, onPause: pause, onView: changeView, isPlaying: () => game.mode === 'running' });
  $('deploy').disabled = false; $('deploy').firstElementChild.textContent = '即刻出击';
  let previous = performance.now(), elapsed = 0, hudClock = 0, lastMode = game.mode;
  function frame(now) {
    const dt = Math.min(.05, Math.max(0, (now - previous) / 1000)); previous = now;
    if (!document.hidden) {
      if (game.mode !== 'paused') elapsed += dt;
      updateGame(game, input.state, dt);
      for (const event of new Set(game.events)) sounds[event]?.();
      if (engineGain) { engineGain.gain.setTargetAtTime(game.mode === 'running' ? .09 : 0, audio.currentTime, .15); engine.frequency.setTargetAtTime(35 + game.player.speed * .29, audio.currentTime, .1); }
      view.render(game, dt, elapsed); hudClock += dt;
      if (game.mode !== 'menu' && hudClock > .06) { updateHud(); hudClock = 0; }
      if (game.mode !== lastMode && ['won', 'lost'].includes(game.mode)) result();
      lastMode = game.mode;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  $('world').addEventListener('webglcontextlost', event => { event.preventDefault(); pause(); $('error').textContent = '图形连接中断。请刷新页面重新起飞。'; $('error').hidden = false; });
  // Development-only readout supports repeatable interaction checks without a production cheat API.
  if (import.meta.env.DEV) window.__flight = { game, input, stats: () => view.getStats() };
} catch (error) {
  console.error(error); $('error').hidden = false; $('deploy').firstElementChild.textContent = '引擎启动失败';
}
