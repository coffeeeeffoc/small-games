import { LEVELS, RULES, initial, clone, actor, near, step, transferError } from './rules.js';
const $ = selector => document.querySelector(selector);
const board = $('#board'), actors = $('#actors'), preview = $('#preview');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let state = initial(0), history = [], selected = null, busy = false, generation = 0, drag = null;
let audioContext, volume, toneCount = 0, muted = false;
const oscillators = new Set();
try { muted = localStorage.getItem('rule-thief-muted') === 'true'; } catch {}
const svg = body => `<svg class="sprite" viewBox="0 0 80 80" aria-hidden="true">${body}</svg>`;
const sprites = {
  player: svg('<ellipse cx="40" cy="70" rx="24" ry="5" fill="#544931" opacity=".16"/><path d="M20 57Q17 38 27 30L26 22Q32 21 35 10Q44 13 49 19L58 23L53 32Q64 43 59 61Q60 72 39 72Q17 72 20 57Z" fill="#f8f0d9" stroke="#30362e" stroke-width="2.7"/><path d="M26 33Q40 27 54 33L54 45Q39 50 24 43Z" fill="#30352e"/><circle cx="34" cy="38" r="2.4" fill="#fff6de"/><circle cx="47" cy="38" r="2.4" fill="#fff6de"/><path d="M22 51L13 47L9 54L20 56M54 49L67 56L61 59" fill="none" stroke="#30352e" stroke-width="3"/><path d="M29 60Q40 65 51 60" fill="none" stroke="#c7bfa7" stroke-width="2"/>'),
  stone: svg('<ellipse cx="40" cy="70" rx="27" ry="5" fill="#544931" opacity=".16"/><path d="M19 20Q39 10 61 21L66 59Q61 72 39 72Q17 71 14 59Z" fill="#929485" stroke="#3b4238" stroke-width="2.8"/><path d="M23 25Q39 16 56 26L60 56Q56 64 40 65Q24 65 20 56Z" fill="#b7b7a4" stroke="#656d5c" stroke-width="2"/><path d="M27 34Q40 22 52 35L51 52Q41 63 31 52L29 41Q39 32 45 42L42 50L37 47" fill="none" stroke="#6d7664" stroke-width="3"/><path d="M18 52L23 50M55 19L55 25" stroke="#e0d8bd" stroke-width="2"/>'),
  sentry: svg('<ellipse cx="40" cy="70" rx="26" ry="5" fill="#544931" opacity=".16"/><path d="M40 8L47 18L59 14L60 27L72 32L65 43L71 54L58 59L56 71L43 66L32 74L26 62L13 62L15 49L6 41L17 32L15 19L29 20Z" fill="#bd8b3d" stroke="#604f2d" stroke-width="2.7"/><circle cx="40" cy="41" r="23" fill="#d1a250" stroke="#896a35" stroke-width="2"/><path d="M21 34Q40 40 58 33L55 49Q40 58 25 48Z" fill="#39392a"/><circle cx="32" cy="43" r="3" fill="#f1d08c"/><circle cx="47" cy="43" r="3" fill="#f1d08c"/>')
};
const exitDrawing = '<svg viewBox="0 0 80 80" aria-hidden="true"><path d="M17 72V33a23 23 0 0 1 46 0v39Z" fill="#aaa588" stroke="#454b3c" stroke-width="3"/><path d="M27 72V33a13 13 0 0 1 26 0v39" fill="#354b40"/><path d="M56 21V3L71 7L56 12" fill="#ab493c" stroke="#754331" stroke-width="2"/><path d="M15 46H27M53 46H65M18 29L29 33M50 24L60 17" stroke="#565d47" stroke-width="2"/><path d="M32 62L47 62M42 57L47 62L42 67" fill="none" stroke="#ede4c4" stroke-width="2"/></svg>';
function audioReady() {
  if (muted) return;
  try {
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    if (!volume) { volume = audioContext.createGain(); volume.gain.value = .075; volume.connect(audioContext.destination); }
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  } catch { /* Audio support is optional; all feedback also has visible motion/text. */ }
}
function quietAudio() { for (const o of oscillators) { try { o.stop(); } catch {} } oscillators.clear(); }
function sound(kind) {
  audioReady(); if (muted || !audioContext || !volume) return;
  const notes = { move: [220], transfer: [410, 620], undo: [300, 210], lost: [160, 110], won: [392, 494, 587, 784] }[kind] || [210];
  notes.forEach((frequency, i) => {
    const t = audioContext.currentTime + i * .065, o = audioContext.createOscillator(), g = audioContext.createGain();
    o.type = kind === 'lost' ? 'triangle' : 'sine'; o.frequency.value = frequency;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.8, t + .007); g.gain.exponentialRampToValueAtTime(.001, t + .14);
    o.connect(g); g.connect(volume); oscillators.add(o); o.onended = () => { oscillators.delete(o); o.disconnect(); g.disconnect(); };
    o.start(t); o.stop(t + .15); toneCount++;
  });
}
function say(text) { $('#message').textContent = text; }
function paint(view = state) {
  for (const e of view.entities) {
    let button = actors.querySelector(`[data-entity="${e.id}"]`);
    if (!button) { button = document.createElement('button'); button.className = 'actor'; button.dataset.entity = e.id; actors.append(button); }
    button.style.transform = `translate(${e.x * 100}%,${e.y * 100}%)`;
    const owned = Object.entries(view.owners).filter(([, id]) => id === e.id).map(([rule]) => rule);
    button.className = `actor ${e.kind}${view.owners.phase === e.id ? ' phase' : ''}${selected && !transferError(state, selected, e.id) ? ' reachable' : ''}${selected && state.owners[selected] === e.id ? ' source' : ''}`;
    button.innerHTML = `${sprites[e.kind]}<span class="actor-name">${e.name}</span><span class="direction">${['↑', '→', '↓', '←'][e.dir]}</span><span class="badges">${owned.map(r => `<span class="badge">${RULES[r].icon}</span>`).join('')}</span>`;
    button.setAttribute('aria-label', `${e.name}，第${e.x}列第${e.y}行，朝${['上', '右', '下', '左'][e.dir]}，${owned.map(r => RULES[r].name).join('、') || '无规则'}`);
    button.dataset.x = e.x; button.dataset.y = e.y;
  }
  for (const button of document.querySelectorAll('[data-rule]')) {
    const rule = button.dataset.rule;
    button.querySelector('.owner').textContent = `在${actor(view, view.owners[rule]).name}身上`;
    button.classList.toggle('selected', selected === rule);
    button.setAttribute('aria-pressed', String(selected === rule));
    button.setAttribute('aria-label', `${RULES[rule].name}，在${actor(view, view.owners[rule]).name}身上。${RULES[rule].description}`);
  }
  $('#counter').textContent = `第 ${view.turn} 拍`;
  board.dataset.status = state.status; board.dataset.turn = state.turn; board.dataset.busy = String(busy);
  $('#undo').disabled = history.length === 0;
  document.querySelectorAll('[data-dir],#wait').forEach(b => b.disabled = busy || state.status !== 'playing');
}
function showOutcome() {
  $('#notice').className = `notice ${state.status}`;
  $('#next').hidden = state.status !== 'won';
  $('#next').textContent = state.level < 2 ? '下一幕 →' : '三幕已通关 · 再玩一次 ↻';
  if (state.status === 'won') { $('#result-title').textContent = state.level < 2 ? '这一幕，规则归你。' : '三幕收工，盗律成功。'; say(`${state.turn} 拍抵达出口。也可以撤销，试试别的解法。`); }
  else if (state.status === 'lost') { $('#result-title').textContent = '被哨兵撞见了。'; say('时间停在这一拍。撤销可以把所有人和规则一起带回去。'); }
  else $('#result-title').textContent = selected ? `正在揭取：${RULES[selected].name}` : '小规则，换个世界。';
}
function ghost(action = { type: 'wait' }, label = '等一拍后的位置') {
  preview.replaceChildren();
  if (busy || state.status !== 'playing') { $('#preview-label').textContent = busy ? '主动动作 → 直行 → 北漂' : '可撤销回到任意上一拍'; return; }
  const result = step(state, action, true);
  if (!result.ok) { $('#preview-label').textContent = result.reason; return; }
  const color = result.state.status === 'lost' ? '#ad493b' : '#25625a';
  let drawing = '';
  for (const e of state.entities) {
    const points = [[e.x * 100 + 50, e.y * 100 + 50]];
    for (const frame of result.frames) {
      const next = actor(frame.state, e.id), point = [next.x * 100 + 50, next.y * 100 + 50];
      if (point.toString() !== points.at(-1).toString()) points.push(point);
    }
    if (points.length < 2) continue;
    const end = points.at(-1);
    drawing += `<polyline points="${points.map(p => p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="3" stroke-dasharray="7 5"/><rect x="${end[0] - 25}" y="${end[1] - 25}" width="50" height="50" rx="13" fill="#f6edd5" fill-opacity=".45" stroke="${color}" stroke-width="2.5" stroke-dasharray="6 4"/><text x="${end[0]}" y="${end[1] + 5}" font-size="15" fill="${color}" text-anchor="middle">${e.name === '小贼' ? '你' : e.name.slice(-1)}</text>`;
  }
  if (result.state.status === 'lost') {
    const p = actor(result.state, 'p');
    drawing += `<circle cx="${p.x * 100 + 50}" cy="${p.y * 100 + 50}" r="43" fill="none" stroke="${color}" stroke-width="3" stroke-dasharray="5 5"/>`;
  }
  preview.innerHTML = drawing;
  $('#preview-label').textContent = result.state.status === 'lost' ? '这一拍会撞上哨兵 · 先转移规则' : `虚影：${label}`;
}
function selectRule(rule) {
  if (busy || state.status !== 'playing') return;
  selected = rule; paint(); showOutcome(); preview.replaceChildren();
  const owner = actor(state, state.owners[rule]);
  say(`${RULES[rule].description} ${near(state, owner.id) ? '点身边的虚线目标贴上。' : '先走到原主身边。'}`);
  $('#preview-label').textContent = '按住目标预览这一拍，松开转移；Esc 取消';
}
function transferEffect(before, action) {
  const a = actor(before, before.owners[action.rule]), b = actor(before, action.target), x = a.x * 100 + 50, y = a.y * 100 + 50, tx = b.x * 100 + 50, ty = b.y * 100 + 50;
  const mx = (x + tx) / 2, my = Math.min(y, ty) - 45;
  $('#transfer-fx').innerHTML = `<path d="M${x},${y} Q${mx},${my} ${tx},${ty}" fill="none" stroke="#ad493b" stroke-width="4" stroke-dasharray="8 4"/><g><rect x="${x - 17}" y="${y - 17}" width="34" height="34" rx="5" fill="#f9edd1" stroke="#ad493b" stroke-width="2"/><text x="${x}" y="${y + 7}" text-anchor="middle" font-size="25" fill="#25625a">${RULES[action.rule].icon}</text></g>`;
  const token = $('#transfer-fx g');
  token.animate([{ transform: 'translate(0px,0px)' }, { transform: `translate(${(tx - x) / 2}px,${(ty - y) / 2 - 35}px)` }, { transform: `translate(${tx - x}px,${ty - y}px)` }], { duration: reducedMotion.matches ? 1 : 280, fill: 'forwards' });
}
async function execute(action) {
  if (busy) return;
  audioReady();
  const result = step(state, action, true);
  if (!result.ok) { say(result.reason); board.classList.remove('bump'); void board.offsetWidth; board.classList.add('bump'); return; }
  const before = clone(state); history.push(before); state = result.state; selected = null; busy = true;
  const token = ++generation;
  preview.replaceChildren(); paint(before); ghost();
  if (action.type === 'transfer') { transferEffect(before, action); sound('transfer'); say(`${actor(before, before.owners[action.rule]).name}失去${RULES[action.rule].name}，${actor(before, action.target).name}接走了它。`); }
  else sound(state.status === 'lost' ? 'lost' : 'move');
  for (const frame of result.frames) {
    if (token !== generation) return;
    paint(frame.state);
    await new Promise(resolve => setTimeout(resolve, reducedMotion.matches ? 1 : 135));
  }
  if (token !== generation) return;
  busy = false; $('#transfer-fx').replaceChildren(); paint(); showOutcome(); ghost();
  if (state.status === 'won') sound('won');
  else if (state.status === 'lost' && action.type === 'transfer') sound('lost');
}
function cancelMotion() {
  generation++; busy = false; selected = null; drag = null;
  $('#drag-sticker').style.display = 'none'; $('#transfer-fx').replaceChildren(); quietAudio();
  document.getAnimations().forEach(animation => animation.cancel());
}
function restorePaint() {
  board.classList.add('instant'); paint(); void board.offsetWidth; board.classList.remove('instant'); showOutcome(); ghost();
}
function undo() {
  if (!history.length) return;
  cancelMotion(); state = history.pop(); restorePaint(); sound('undo'); say('已撤回一整拍：位置、朝向和规则都回来了。');
}
function loadLevel(level) {
  cancelMotion(); state = initial(level); history = [];
  $('#terrain').innerHTML = LEVELS[level].map.flatMap((row, y) => [...row].map((tile, x) => `<div class="tile ${tile === '#' ? x === 0 || y === 0 || x === 5 || y === 5 ? 'edge' : 'wall' : tile === 'E' ? 'exit' : ''}" aria-hidden="true">${tile === 'E' ? exitDrawing : ''}</div>`)).join('');
  actors.replaceChildren();
  document.querySelectorAll('[data-level]').forEach(b => { if (Number(b.dataset.level) === level) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
  $('#level-subtitle').textContent = LEVELS[level].subtitle;
  restorePaint(); say(LEVELS[level].hint);
}
const targetAt = (x, y) => document.elementFromPoint(x, y)?.closest('[data-entity]')?.dataset.entity;
for (const b of document.querySelectorAll('[data-rule]')) {
  b.addEventListener('pointerdown', event => {
    if (event.button !== 0 || busy || state.status !== 'playing') return;
    audioReady(); selectRule(b.dataset.rule);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, rule: b.dataset.rule, moved: false };
    b.setPointerCapture(event.pointerId);
  });
  b.addEventListener('click', event => { if (event.detail === 0) selectRule(b.dataset.rule); });
}
document.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.id) return;
  drag.moved ||= Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 8;
  if (!drag.moved) return;
  const sticker = $('#drag-sticker'); sticker.textContent = `${RULES[drag.rule].icon} ${RULES[drag.rule].name}`;
  Object.assign(sticker.style, { display: 'block', left: `${event.clientX}px`, top: `${event.clientY - 24}px` });
  const target = targetAt(event.clientX, event.clientY);
  if (target) ghost({ type: 'transfer', rule: drag.rule, target }, '转移后的完整一拍');
});
document.addEventListener('pointerup', event => {
  if (!drag || event.pointerId !== drag.id) return;
  const active = drag; drag = null; $('#drag-sticker').style.display = 'none';
  if (active.moved) { const target = targetAt(event.clientX, event.clientY); if (target) execute({ type: 'transfer', rule: active.rule, target }); else ghost(); }
});
document.addEventListener('pointercancel', () => { drag = null; selected = null; $('#drag-sticker').style.display = 'none'; paint(); ghost(); });
actors.addEventListener('pointerdown', event => { const id = event.target.closest('[data-entity]')?.dataset.entity; if (selected && id) ghost({ type: 'transfer', rule: selected, target: id }, '转移后的完整一拍'); });
actors.addEventListener('pointerover', event => { const id = event.target.closest('[data-entity]')?.dataset.entity; if (selected && id && !drag) ghost({ type: 'transfer', rule: selected, target: id }, '转移后的完整一拍'); });
actors.addEventListener('click', event => {
  const id = event.target.closest('[data-entity]')?.dataset.entity;
  if (!id || busy) return;
  if (selected) execute({ type: 'transfer', rule: selected, target: id });
  else { const e = actor(state, id); say(`${e.name}朝${['上', '右', '下', '左'][e.dir]}。${e.kind === 'sentry' ? '碰到哨兵会失败；偷走直行就能让它停下。' : '先点上方规则，再点身边目标。'}`); }
});
for (const b of document.querySelectorAll('[data-dir],#wait')) {
  const action = b.id === 'wait' ? { type: 'wait' } : { type: 'move', dir: Number(b.dataset.dir) };
  b.addEventListener('pointerenter', () => ghost(action, '这个动作后的完整一拍'));
  b.addEventListener('pointerdown', () => ghost(action, '这个动作后的完整一拍'));
  b.addEventListener('focus', () => ghost(action, '这个动作后的完整一拍'));
  b.addEventListener('pointerleave', () => { if (!selected) ghost(); });
  b.addEventListener('click', () => execute(action));
}
$('#undo').addEventListener('click', undo);
$('#retry').addEventListener('click', () => { audioReady(); loadLevel(state.level); });
$('#next').addEventListener('click', () => loadLevel((state.level + 1) % 3));
document.querySelectorAll('[data-level]').forEach(b => b.addEventListener('click', () => loadLevel(Number(b.dataset.level))));
function updateMute() { $('#sound').textContent = muted ? '♩ 已静音' : '♫ 声音开'; $('#sound').setAttribute('aria-pressed', String(muted)); if (volume) volume.gain.value = muted ? 0 : .075; }
$('#sound').addEventListener('click', () => { muted = !muted; if (muted) quietAudio(); else { audioReady(); sound('move'); } updateMute(); try { localStorage.setItem('rule-thief-muted', String(muted)); } catch {} });
document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
  const key = event.key.toLowerCase(), directions = { arrowup: 0, w: 0, arrowright: 1, d: 1, arrowdown: 2, s: 2, arrowleft: 3, a: 3 };
  if (key in directions) { event.preventDefault(); execute({ type: 'move', dir: directions[key] }); }
  else if (key === 'z') { event.preventDefault(); undo(); }
  else if (key === ' ' && document.activeElement.tagName !== 'BUTTON') { event.preventDefault(); execute({ type: 'wait' }); }
  else if (key === 'escape') { selected = null; drag = null; $('#drag-sticker').style.display = 'none'; paint(); ghost(); say(LEVELS[state.level].hint); }
});
window.addEventListener('blur', () => { quietAudio(); drag = null; $('#drag-sticker').style.display = 'none'; });
document.addEventListener('visibilitychange', () => { if (document.hidden) quietAudio(); });
// Read-only inspection for browser acceptance; no state mutation or automatic playing API.
window.__ruleThief = Object.freeze({ inspect: () => ({ state: clone(state), history: history.length, busy, selected, audio: { state: audioContext?.state ?? 'uninitialized', muted, toneCount, gain: volume?.gain.value ?? 0 } }) });
updateMute(); loadLevel(0);
