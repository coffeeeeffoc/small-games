import { LEVELS, UPGRADES, levelById } from './levels.mjs';
import { createGame, fire, update, recall, chooseUpgrade, checkpoint, restoreGame, drainEvents, FIELD } from './core.mjs';
import { createStorage } from './storage.mjs';
import { createRenderer, drawHero } from './render.mjs';

const $ = (id) => document.getElementById(id);
const canvas = $('arena'), renderer = createRenderer(canvas), storage = createStorage();
const listeners = new AbortController(), signal = listeners.signal;
let game = null, screen = 'home', aim = null, pointerId = null, lastTime = null, raf = 0, helpReturn = 'home', audio = null;
let finished = false, nextId = null, hudKey = '', soundAt = 0;
// Touch activation also works in WebViews that suppress compatibility clicks after
// a captured Canvas drag. Ignore the subsequent native click to avoid double actions.
let lastTouchActivation = -Infinity;
document.addEventListener('pointerup', (event) => {
  if (event.pointerType !== 'touch' || !event.isPrimary) return;
  const button = event.target.closest('button');
  if (!button || button.disabled || button.hasAttribute('data-game-fullscreen')) return;
  event.preventDefault(); lastTouchActivation = performance.now(); button.click();
}, { signal });
document.addEventListener('click', (event) => {
  if (event.isTrusted && event.detail > 0 && !event.target.closest('[data-game-fullscreen]') && performance.now() - lastTouchActivation < 650) {
    event.preventDefault(); event.stopImmediatePropagation();
  }
}, { capture: true, signal });
function settings() {
  const data = storage.read();
  document.querySelectorAll('[data-action="sound"]').forEach((button) => {
    button.setAttribute('aria-pressed', String(data.sound)); button.setAttribute('aria-label', data.sound ? '关闭音效' : '开启音效');
    button.textContent = button.classList.contains('icon') ? (data.sound ? '♫' : '♪') : `音效${data.sound ? '开' : '关'}`;
  });
  $('haptics').textContent = `震动${data.haptics ? '开' : '关'}`; $('haptics').setAttribute('aria-pressed', String(data.haptics));
}
function unlockAudio() {
  if (!storage.read().sound) return;
  try { const Audio = window.AudioContext || window.webkitAudioContext; if (!audio && Audio) audio = new Audio(); if (audio?.state === 'suspended') void audio.resume().catch(() => {}); } catch { /* Sound is optional. */ }
}
function sound(type) {
  if (!audio || audio.state !== 'running' || !storage.read().sound) return;
  const now = audio.currentTime;
  if (type === 'hit' && now - soundAt < 0.045) return;
  soundAt = now;
  try {
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(({ fire: 240, hit: 690, break: 890, pickup: 1050, won: 1200, lost: 170, upgrade: 900 })[type] || 620, now);
    oscillator.frequency.exponentialRampToValueAtTime(type === 'lost' ? 80 : 440, now + 0.1);
    gain.gain.setValueAtTime(0.026, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(now); oscillator.stop(now + 0.12);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  } catch { /* Some WebViews have no audio output. */ }
}
function vibrate(ms) { if (storage.read().haptics) { try { navigator.vibrate?.(ms); } catch { /* Optional. */ } } }
function cancelAim() {
  aim = null;
  if (pointerId !== null) { try { canvas.releasePointerCapture(pointerId); } catch { /* Capture can already be lost. */ } }
  pointerId = null;
}
function notifyHost() {
  if (window.parent === window) return;
  try { const origin = new URL(document.referrer).origin; window.parent.postMessage({ type: 'small-games:display-state', gameId: 'ball-roguelite', screen: screen === 'home' || screen === 'levels' || (screen === 'help' && helpReturn === 'home') ? 'home' : 'playing' }, origin); } catch { /* Unrelated embeds need no host navigation. */ }
}
function show(name) {
  cancelAim(); screen = name; document.body.dataset.screen = name; lastTime = null;
  document.querySelectorAll('.screen').forEach((element) => { element.hidden = element.id !== name; });
  $(name).scrollTop = 0;
  if (name === 'home') {
    const data = storage.read();
    $('start').innerHTML = data.resume ? '继续航行 <span>↗</span>' : '开始弹射 <span>↗</span>';
    $('home-progress').textContent = `${Object.keys(data.completed).length} / ${LEVELS.length} 星域已点亮${data.bestEndless ? ` · 无尽最佳 ${data.bestEndless}` : ''}`;
  }
  if (name === 'levels') renderLevels();
  if (name === 'upgrade') renderUpgrades();
  settings(); notifyHost();
}
function renderLevels() {
  const data = storage.read(); $('level-list').replaceChildren();
  LEVELS.forEach((level, index) => {
    const unlocked = storage.isUnlocked(level.id), result = data.completed[level.id], button = document.createElement('button');
    button.className = 'level-card'; button.dataset.level = level.id; button.disabled = !unlocked; button.style.setProperty('--color', level.color);
    button.setAttribute('aria-label', `${index + 1}. ${level.title}${unlocked ? '，开始关卡' : '，未解锁'}`);
    button.innerHTML = `<span class="planet" aria-hidden="true"></span><strong>${level.title}</strong><small class="${result ? 'stars' : ''}">${result ? '★'.repeat(result.stars) + '☆'.repeat(3 - result.stars) : unlocked ? '启程 →' : `通关${levelById(level.unlock).title}解锁`}</small>`;
    button.addEventListener('click', () => { unlockAudio(); start(level.id); }, { signal }); $('level-list').append(button);
  });
}
function start(id, practice = false) {
  if (!practice && !storage.isUnlocked(id)) return;
  game = createGame(id, { seed: (Date.now() >>> 0) || 1, practice }); finished = false;
  renderer.reset(); storage.saveRun(game); hudKey = ''; show('playing'); syncHud();
}
function continueRun() {
  const saved = storage.read().resume;
  game = restoreGame(saved);
  if (!game) { start(storage.read().lastLevel); return; }
  finished = false; renderer.reset(); hudKey = ''; show(game.phase === 'upgrade' ? 'upgrade' : 'playing'); syncHud();
}
function syncHud() {
  if (!game) return;
  const key = `${game.phase}:${game.turn}:${game.score}:${game.count}:${game.waveIndex}`;
  if (key === hudKey) return; hudKey = key;
  $('level-name').textContent = game.level.title; $('score').textContent = game.score;
  $('wave-progress').textContent = game.level.endless ? `第 ${game.turn + 1} 轮` : `波次 ${game.waveIndex} / ${game.level.waves.length} · 第 ${game.turn + 1} 轮`;
  $('practice-tag').hidden = !game.practice; $('ball-count').textContent = game.count;
  $('recall').disabled = game.phase !== 'flight';
  $('shot-hint').textContent = game.phase === 'flight' ? '回收将结束本轮，并让砖块下降' : '按住场地瞄准 · 松手发射';
}
function renderUpgrades() {
  $('upgrade-list').replaceChildren();
  for (const id of game.cards) {
    const card = UPGRADES.find((item) => item.id === id), button = document.createElement('button');
    button.className = 'upgrade-card'; button.dataset.upgrade = id; button.style.setProperty('--color', card.color);
    button.innerHTML = `<span class="glyph" aria-hidden="true">${card.glyph}</span><span><strong>${card.title}</strong><small>${card.description}</small></span>`;
    button.addEventListener('click', () => {
      unlockAudio(); if (!chooseUpgrade(game, id)) return;
      sound('upgrade'); storage.saveRun(game); show('playing'); syncHud();
    }, { signal }); $('upgrade-list').append(button);
  }
  const owned = UPGRADES.filter((u) => game.upgrades[u.id]);
  $('build-summary').textContent = owned.length ? owned.map((u) => `${u.title} ×${game.upgrades[u.id]}`).join(' · ') : '你的第一份星光强化';
}
function finish() {
  if (finished) return; finished = true; storage.finish(game);
  const won = game.phase === 'won', index = LEVELS.findIndex((level) => level.id === game.levelId);
  nextId = won ? LEVELS[index + 1]?.id : null;
  $('result-title').textContent = won ? '星域已点亮' : '航行结束';
  $('result-kicker').textContent = game.practice ? '试玩 · 不记录成绩' : won ? game.level.title : game.level.endless ? '无尽星空，等你再来' : game.level.title;
  $('result-detail').textContent = won ? nextId ? `下一站 · ${levelById(nextId).title}` : '六片星域已点亮，试试无尽挑战吧' : '砖块越过了警戒线 · 下次先拆底部砖块';
  $('result-emblem').textContent = won ? '✦' : '↗'; $('result-emblem').style.color = won ? '#73f5db' : '#ff8caa';
  $('result-score').textContent = game.score; $('result-turns').textContent = game.turn; $('result-combo').textContent = game.bestCombo;
  $('next').hidden = !nextId || game.practice; sound(won ? 'won' : 'lost'); vibrate(won ? 35 : 60); show('result');
}
function saveAndHome() { if (game) storage.saveRun(game); show('home'); }
function pause() {
  if (screen !== 'playing') return;
  cancelAim(); soundAt = 0; try { void audio?.suspend().catch(() => {}); } catch { /* Optional. */ }
  show('paused');
}
function point(event) { const bounds = canvas.getBoundingClientRect(); return { x: (event.clientX - bounds.left) * 390 / bounds.width, y: (event.clientY - bounds.top) * 620 / bounds.height }; }
canvas.addEventListener('pointerdown', (event) => {
  if (screen !== 'playing' || game.phase !== 'aim' || pointerId !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
  event.preventDefault(); unlockAudio(); pointerId = event.pointerId; aim = point(event); canvas.setPointerCapture(pointerId);
}, { signal });
canvas.addEventListener('pointermove', (event) => { if (event.pointerId === pointerId) { event.preventDefault(); aim = point(event); } }, { signal });
canvas.addEventListener('pointerup', (event) => {
  if (event.pointerId !== pointerId) return;
  const target = point(event); cancelAim();
  if (screen === 'playing' && fire(game, target.x - game.launchX, target.y - FIELD.floor + FIELD.radius + 1)) { sound('fire'); syncHud(); }
}, { signal });
canvas.addEventListener('pointercancel', cancelAim, { signal });
canvas.addEventListener('lostpointercapture', cancelAim, { signal });
window.addEventListener('blur', pause, { signal });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); }, { signal });
window.addEventListener('resize', () => { cancelAim(); renderer.resize(); lastTime = null; }, { signal });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { if (screen === 'playing') pause(); else if (screen === 'paused') { unlockAudio(); show('playing'); } } }, { signal });
document.addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'home') saveAndHome();
  if (action === 'help') { helpReturn = screen; show('help'); }
  if (action === 'sound') { const enabled = !storage.read().sound; storage.setting('sound', enabled); if (enabled) unlockAudio(); else void audio?.suspend().catch(() => {}); settings(); }
}, { signal });
const click = (id, handler) => $(id).addEventListener('click', handler, { signal });
click('start', () => { unlockAudio(); continueRun(); });
click('levels-button', () => show('levels'));
click('endless-button', () => { unlockAudio(); start('endless'); });
click('pause', pause); click('resume', () => { unlockAudio(); show('playing'); });
click('back-home', saveAndHome); click('upgrade-home', saveAndHome);
click('pause-help', () => { helpReturn = 'paused'; show('help'); });
click('help-back', () => show(helpReturn));
click('haptics', () => { storage.setting('haptics', !storage.read().haptics); settings(); vibrate(20); });
click('recall', () => { cancelAim(); recall(game); syncHud(); processState(); });
click('retry', () => { unlockAudio(); start(game.levelId, game.practice); });
click('next', () => { if (nextId) { unlockAudio(); start(nextId); } });
function processState() {
  if (game.phase === 'upgrade') { storage.saveRun(game); show('upgrade'); }
  else if (['won', 'lost'].includes(game.phase)) finish();
  else if (game.phase === 'aim') storage.saveRun(game);
}
function snapshot() {
  return game ? { screen, phase: game.phase, levelId: game.levelId, turn: game.turn, score: game.score, count: game.count, damage: game.damage, seed: game.seed, nextId: game.nextId, cards: [...game.cards], shots: game.shots, waveIndex: game.waveIndex, practice: game.practice, launchX: game.launchX, upgrades: { ...game.upgrades }, balls: game.balls.map((ball) => ({ x: ball.x, y: ball.y })), bricks: game.bricks.filter((b) => b.hp > 0).map((b) => ({ ...b })), aiming: pointerId !== null } : { screen, phase: 'home', shots: 0 };
}
// Read-only browser inspection also supports the repository's actual-input smoke test.
canvas.getOrbitSnapshot = snapshot;
const devCleanups = [];
if (window.SmallGamesDev?.isEnabled()) {
  window.__orbit = { snapshot, startPractice: (id) => start(id, true) };
  devCleanups.push(window.SmallGamesDev.registerActions(LEVELS.map((level) => ({ id: `orbit-${level.id}`, label: `试玩：${level.title}`, run: () => start(level.id, true) }))));
  devCleanups.push(window.SmallGamesDev.registerSnapshot(snapshot));
}
$('storage-notice').textContent = storage.persistent ? '进度保存在当前浏览器。' : '浏览器存储不可用，本次会话仍可正常游玩，关闭页面后进度会丢失。';
function frame(time) {
  const dt = lastTime === null ? 0 : Math.min((time - lastTime) / 1000, 0.05); lastTime = time;
  if (screen === 'home') drawHero($('hero'), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : time / 1000);
  if (screen === 'playing' && game) {
    const previous = game.phase; update(game, dt);
    const events = drainEvents(game); renderer.consume(events);
    const audible = [...events].reverse().find((event) => ['hit', 'break', 'pickup'].includes(event.type));
    if (audible) sound(audible.type);
    if (events.some((event) => event.type === 'pickup')) vibrate(12);
    renderer.draw(game, aim, dt, time / 1000); syncHud();
    if (previous !== game.phase) processState();
  }
  raf = requestAnimationFrame(frame);
}
window.addEventListener('pagehide', (event) => {
  pause();
  if (!event.persisted) { cancelAnimationFrame(raf); listeners.abort(); devCleanups.forEach((cleanup) => cleanup?.()); delete window.__orbit; void audio?.close().catch(() => {}); }
}, { signal });
show('home'); raf = requestAnimationFrame(frame);
