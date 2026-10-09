import { LEVELS, UPGRADES, levelById } from './levels.mjs';
import { createGame, fire, update, recall, chooseUpgrade, checkpoint, restoreGame, drainEvents, FIELD } from './core.mjs';
import { createStorage } from './storage.mjs';
import { createRenderer, drawHero } from './render.mjs';

const $ = (id) => document.getElementById(id);
const canvas = $('arena'), renderer = createRenderer(canvas), storage = createStorage();
const listeners = new AbortController(), signal = listeners.signal;
let game = null, screen = 'home', aim = null, pointerId = null, lastTime = null, raf = 0, helpReturn = 'home', audio = null;
let finished = false, nextId = null, hudKey = '', soundAt = -Infinity;
const voices = new Set();
let selectedMode = storage.read().lastMode;
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
function stopSounds() {
  for (const voice of voices) { try { voice.stop(); } catch { /* Already ended. */ } }
  voices.clear(); soundAt = -Infinity;
}
function sound(type, event = {}) {
  if (!audio || audio.state !== 'running' || !storage.read().sound) return;
  const now = audio.currentTime;
  const impact = ['hit', 'break', 'bounce'].includes(type);
  if (voices.size >= 10 || (impact && now - soundAt < 0.055)) return;
  if (impact) soundAt = now;
  try {
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    // A short look-ahead keeps doublets on the simulation's beat even when two
    // launches arrive in one frame. Pause/mute cancels every scheduled voice.
    const start = type === 'launch' ? Math.max(now, now + 0.045 + event.at - game.flight) : now;
    const notes = [523.25, 587.33, 659.25, 783.99, 880];
    const note = notes[(game?.combo || 0) % notes.length];
    const frequency = type === 'launch' ? (event.accent ? 180 : event.index % 2 ? 410 : 240)
      : ({ hit: note, bounce: note / 2, break: note * 1.5, pickup: 1174.66, won: 1318.5, lost: 170, upgrade: 1046.5 })[type] || note;
    const duration = type === 'launch' ? 0.065 : type === 'won' || type === 'lost' ? 0.22 : 0.11;
    oscillator.type = type === 'break' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(type === 'launch' ? frequency * 0.4 : type === 'lost' ? 75 : frequency * 0.82, start + duration);
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.linearRampToValueAtTime(type === 'launch' && event.accent ? 0.055 : type === 'bounce' ? 0.012 : 0.025, start + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain); gain.connect(audio.destination); voices.add(oscillator);
    oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(start); oscillator.stop(start + duration + 0.01);
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
    const data = storage.read(), saved = storage.getResume(selectedMode), completed = Object.keys(data.completed).length;
    $('start').innerHTML = `${saved ? '继续' : '开始'}${selectedMode === 'endless' ? '无尽' : '关卡'}模式 <span>↗</span>`;
    $('home-progress').textContent = saved ? `${selectedMode === 'endless' ? '无限砖阵' : levelById(saved.levelId).title} · 第 ${saved.turn + 1} 轮待续` : `${completed} / ${LEVELS.length} 星域已点亮`;
    $('campaign-progress').textContent = `${completed} / ${LEVELS.length} 星域 · 逐关解锁`;
    $('endless-record').textContent = data.bestEndless ? `最高纪录 ${data.bestEndless}` : '无限砖阵 · 冲击纪录';
    $('endless-entry').textContent = data.runs.endless ? `继续第 ${data.runs.endless.turn + 1} 轮 ↗` : '开始挑战 ↗';
    $('levels-button').dataset.selected = String(selectedMode === 'campaign');
    $('endless-button').dataset.selected = String(selectedMode === 'endless');
  }
  if (name === 'levels') renderLevels();
  if (name === 'upgrade') renderUpgrades();
  settings(); notifyHost();
}
function renderLevels() {
  const data = storage.read(), saved = storage.getResume('campaign'); $('level-list').replaceChildren();
  $('levels-progress').textContent = `${Object.keys(data.completed).length} / ${LEVELS.length} 星域已点亮 · 逐关解锁`;
  $('campaign-continue').hidden = !saved;
  $('campaign-continue').textContent = saved ? `继续 · ${levelById(saved.levelId).title} · 第 ${saved.turn + 1} 轮 ↗` : '';
  LEVELS.forEach((level, index) => {
    const unlocked = storage.isUnlocked(level.id), result = data.completed[level.id], continuing = saved?.levelId === level.id, button = document.createElement('button');
    button.className = `level-card${continuing ? ' is-current' : ''}`; button.dataset.level = level.id; button.disabled = !unlocked; button.style.setProperty('--color', level.color);
    button.setAttribute('aria-label', `${index + 1}. ${level.title}${continuing ? '，继续关卡' : unlocked ? '，开始关卡' : '，未解锁'}`);
    button.innerHTML = `<span class="planet" aria-hidden="true"></span><strong>${level.title}</strong><small class="${result && !continuing ? 'stars' : ''}">${continuing ? `继续第 ${saved.turn + 1} 轮 →` : result ? '★'.repeat(result.stars) + '☆'.repeat(3 - result.stars) : unlocked ? '启程 →' : `通关${levelById(level.unlock).title}解锁`}</small>`;
    button.addEventListener('click', () => { unlockAudio(); if (continuing) continueRun('campaign'); else start(level.id); }, { signal }); $('level-list').append(button);
  });
}
function start(id, practice = false) {
  if (!practice && !storage.isUnlocked(id)) return;
  game = createGame(id, { seed: (Date.now() >>> 0) || 1, practice }); finished = false;
  if (!practice) selectedMode = game.level.endless ? 'endless' : 'campaign';
  renderer.reset(); storage.saveRun(game); hudKey = ''; show('playing'); syncHud();
}
function continueRun(mode = selectedMode) {
  selectedMode = mode;
  const saved = storage.getResume(mode);
  game = restoreGame(saved);
  if (!game) { start(mode === 'endless' ? 'endless' : storage.read().lastLevel); return; }
  storage.saveRun(game);
  finished = false; renderer.reset(); hudKey = ''; show(game.phase === 'upgrade' ? 'upgrade' : 'playing'); syncHud();
}
function syncHud() {
  if (!game) return;
  const key = `${game.phase}:${game.turn}:${game.score}:${game.count}:${game.waveIndex}`;
  if (key === hudKey) return; hudKey = key;
  $('level-name').textContent = game.level.endless ? '无尽模式' : `关卡模式 · ${game.level.title}`; $('score').textContent = game.score;
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
  nextId = won && !game.level.endless ? LEVELS[index + 1]?.id : null;
  $('result-title').textContent = won ? '星域已点亮' : '航行结束';
  $('result-kicker').textContent = `${game.level.endless ? '无尽模式' : `关卡模式 · ${game.level.title}`}${game.practice ? ' · 试玩，不记录成绩' : ''}`;
  $('result-detail').textContent = won ? nextId ? `下一站 · ${levelById(nextId).title}` : '六片星域已点亮，试试无尽模式吧' : game.level.endless && !game.practice ? `砖块越过了警戒线 · 最高纪录 ${storage.read().bestEndless}` : '砖块越过了警戒线 · 下次先拆底部砖块';
  $('result-emblem').textContent = won ? '✦' : '↗'; $('result-emblem').style.color = won ? '#73f5db' : '#ff8caa';
  $('result-score').textContent = game.score; $('result-turns').textContent = game.turn; $('result-combo').textContent = game.bestCombo;
  $('next').hidden = !nextId || game.practice; sound(won ? 'won' : 'lost'); vibrate(won ? 35 : 60); show('result');
}
function saveAndHome() { if (game) storage.saveRun(game); show('home'); }
function pause() {
  if (screen !== 'playing') return;
  cancelAim(); stopSounds(); try { void audio?.suspend().catch(() => {}); } catch { /* Optional. */ }
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
  if (screen === 'playing' && fire(game, target.x - game.launchX, target.y - FIELD.floor + FIELD.radius + 1)) syncHud();
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
  if (action === 'sound') { const enabled = !storage.read().sound; storage.setting('sound', enabled); if (enabled) unlockAudio(); else { stopSounds(); void audio?.suspend().catch(() => {}); } settings(); }
}, { signal });
const click = (id, handler) => $(id).addEventListener('click', handler, { signal });
click('start', () => { unlockAudio(); continueRun(); });
click('levels-button', () => { selectedMode = 'campaign'; show('levels'); });
click('campaign-continue', () => { unlockAudio(); continueRun('campaign'); });
click('endless-button', () => { unlockAudio(); continueRun('endless'); });
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
    for (const event of events) if (event.type === 'launch') sound('launch', event);
    const audible = ['pickup', 'break', 'hit', 'bounce'].map((type) => events.find((event) => event.type === type)).find(Boolean);
    if (audible) sound(audible.type, audible);
    if (events.some((event) => event.type === 'pickup')) vibrate(12);
    renderer.draw(game, aim, dt, time / 1000); syncHud();
    if (previous !== game.phase) processState();
  }
  raf = requestAnimationFrame(frame);
}
window.addEventListener('pagehide', (event) => {
  pause();
  if (!event.persisted) { cancelAnimationFrame(raf); stopSounds(); listeners.abort(); devCleanups.forEach((cleanup) => cleanup?.()); delete window.__orbit; void audio?.close().catch(() => {}); }
}, { signal });
show('home'); raf = requestAnimationFrame(frame);
