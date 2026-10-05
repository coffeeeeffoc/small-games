import { levels, chapters } from './levels.js';
import { initialState, legalTargets, validatePlan, step, stateKey } from './engine.js';
import { solutions } from './solutions.js';
import { optimalRelaySolutions } from './optimal-solutions.js';
import { character, gamePortrait, scenery, sceneDefinitions } from './art.js';
import { openAppearanceSettings } from './role-appearance.js';
import { boardHeight, presentationLevel, actorScale, applyBoardLayout, boardExitEndpoint } from './board-layout.js';
import { setupDuelLobby } from './duel-ui.js';
import { setSound, unlockSound, playSound } from './sound.js';
import { relayLevelIds, movedOfficer, lastOfficer, relayTargets, relayError } from './relay.js';
import { readPuzzleLink, showPuzzleShare } from './share.js';
import { quickTrials, quickSolutions, quickOutcome } from './quick-trials.js';

import { setupGameShell, drawLevelPath } from './game-shell.js';

globalThis.__CLASSIC_CHASE_ROLES__ = true;
const $ = id => document.getElementById(id);
let duelLobby;
const svgNS = 'http://www.w3.org/2000/svg';
const storageKey = 'cops-robbers-v3';
const query = new URLSearchParams(location.search);
const sharedPuzzle = readPuzzleLink(location.href);
const copy = value => structuredClone(value);
const icons = {
  sound: '<path d="m4 9 5 0 5-4v14l-5-4H4Z"/><path d="M17 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>',
  muted: '<path d="m4 9 5 0 5-4v14l-5-4H4Z"/><path d="m18 9 5 6m0-6-5 6"/>',
  settings: '<path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 1c0 2-3 2-3 4m0 3v.2"/>',
  undo: '<path d="M8 5 3 10l5 5M3 10h11a6 6 0 0 1 0 12" transform="translate(1 -2)"/>',
  hint: '<path d="M8 16c0-4-3-4-3-8a7 7 0 0 1 14 0c0 4-3 4-3 8Z" transform="translate(0 2)"/><path d="M9 21h6M9 17h6"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
$('settings').innerHTML = icon('settings'); $('undo-icon').innerHTML = icon('undo'); $('hint-icon').innerHTML = icon('hint');

function validState(candidate, map) {
  const node = n => Number.isInteger(n) && n >= 0 && n < map.nodes.length;
  return candidate && Array.isArray(candidate.cops) && candidate.cops.length === map.cops.length && candidate.cops.every(node)
    && new Set(candidate.cops).size === candidate.cops.length && Array.isArray(candidate.robbers) && candidate.robbers.length === map.robbers.length
    && candidate.robbers.every(n => n === -1 || n === -2 || node(n) && !map.exits.includes(n) && !candidate.cops.includes(n)) && Number.isInteger(candidate.turn) && candidate.turn >= 0 && candidate.turn < 100000;
}
let saved = {};
try { const raw = JSON.parse(localStorage.getItem(storageKey) || '{}'); if (raw && typeof raw === 'object' && !Array.isArray(raw)) saved = raw; } catch { /* A damaged save starts a fresh patrol. */ }
if (!saved.settings) { try { saved.settings = JSON.parse(localStorage.getItem('cops-robbers-v2') || localStorage.getItem('cops-robbers-v1') || '{}')?.settings; } catch { /* Keep the old save intact. */ } }
const patrols = Object.fromEntries(['challenge:standard','challenge:relay','quick:standard'].filter(key=>saved.patrols?.[key]).map(key=>[key,saved.patrols[key]]));
if (saved.current) patrols[`${saved.current.mode === 'quick' ? 'quick' : 'challenge'}:${saved.current.rule === 'relay' ? 'relay' : 'standard'}`] = saved.current;
const completed = {};
const relayCompleted = {};
const quickCompleted = {};
for (const trial of quickTrials) {
  const record = saved.quickCompleted?.[trial.id];
  if (record && Number.isInteger(record.turns) && record.turns > 0 && record.turns <= trial.turnLimit && Number.isInteger(record.stars) && record.stars >= 1 && record.stars <= 3) quickCompleted[trial.id] = record;
}
for (const map of levels) {
  const record = saved.completed?.[map.id];
  if (record && Number.isInteger(record.turns) && record.turns > 0 && record.turns < 100000 && Number.isInteger(record.stars) && record.stars >= 1 && record.stars <= 3) completed[map.id] = record;
  const relayRecord = saved.relayCompleted?.[map.id];
  if (relayLevelIds.includes(map.id) && relayRecord && Number.isInteger(relayRecord.turns) && relayRecord.turns > 0 && relayRecord.turns < 100000 && Number.isInteger(relayRecord.stars) && relayRecord.stars >= 1 && relayRecord.stars <= 3) relayCompleted[map.id] = relayRecord;
}
let soundOn = typeof saved.settings?.sound === 'boolean' ? saved.settings.sound : true;
let teaching = typeof saved.settings?.teaching === 'boolean' ? saved.settings.teaching : !completed[1];
let reduced = query.get('motion') === 'reduce' || (typeof saved.settings?.reduced === 'boolean' ? saved.settings.reduced : matchMedia('(prefers-reduced-motion: reduce)').matches);
let level, sourceLevel, state, history = [], selected = 0, inspected = -1, hovered = -1, phase = 'planning';
let rule = 'standard';
let playMode = 'challenge';
const records = () => playMode === 'quick' ? quickCompleted : rule === 'relay' ? relayCompleted : completed;
const availableLevels = () => playMode === 'quick' ? quickTrials : rule === 'relay' ? levels.filter(map => relayLevelIds.includes(map.id)) : levels;
const targetsFor = actor => rule === 'relay' ? relayTargets(level, state, actor, lastOfficer(state, history)) : legalTargets(level, state, actor);
const parTurns = () => rule === 'relay' ? optimalRelaySolutions[level.id].length : level.par;
let runToken = 0, pending = null, hintWorker = null, hintTimer = null, chapterTab = 0, drag = null, suppressClickUntil = 0;
let hintBusy = false, hintTarget = null;
const outcome = current => playMode === 'quick' ? quickOutcome(level,current) : current.robbers.includes(-2) ? 'lost' : current.robbers.every(n => n === -1) ? 'won' : 'planning';
// Reuse the verified route so a map change cannot leave an impossible lesson.
let lessonState = initialState(levels[0]);
const lesson = solutions[1].map((plan, index) => {
  const before = lessonState, cop = Math.max(0, plan.findIndex((node, i) => node !== before.cops[i]));
  lessonState = step(levels[0], before, plan).state;
  return { key: stateKey(before), cop, node: plan[cop], text: [
    '先守右侧出口，突围队员就不能从这里逃走。',
    '另一侧也要有人守，别让突围队员绕路。',
    '先让队友接防，再调动守口的人。',
    '队友守住后路，现在向内收紧包围。',
    '留守也是一步，让突围队员进入包围圈。',
    '先封一侧，另一位队友准备合围。',
    '封住最后一条相邻退路，就能抓获。',
  ][index] || '守住退路，继续协作。' };
});
const quickLessons = Object.fromEntries(quickTrials.map(trial => {
  let cursor = initialState(trial);
  return [trial.id,quickSolutions[trial.id].map((plan,index,path) => { const item = {key:stateKey(cursor),remaining:path.length-index,cop:Math.max(0,movedOfficer(cursor,plan)),node:plan[Math.max(0,movedOfficer(cursor,plan))]}; cursor = step(trial,cursor,plan).state; return item; })];
}));
function lessonStep() { return playMode === 'quick' ? quickLessons[level.id].find(item=>item.key===stateKey(state) && item.remaining <= level.turnLimit-state.turn) : rule === 'standard' && teaching && level.id === 1 && phase === 'planning' ? lesson.find(item => item.key === stateKey(state)) : null; }
function turnInstruction(fallback) {
  const item = lessonStep();
  const overBudget = playMode === 'quick' && quickLessons[level.id].find(item=>item.key===stateKey(state) && item.remaining > level.turnLimit-state.turn);
  if (overBudget) return `这条收网路线还需 ${overBudget.remaining} 步，只剩 ${Math.max(0,level.turnLimit-state.turn)} 步。撤销刚才一步，重新安排包抄。`;
  if (playMode === 'quick') return item ? `选 ${item.cop+1} 号，点 ${item.node+1} 号路口。${level.id === 3 && state.robbers[0] === -1 ? '上巷收网，换下巷接力！' : level.id === 2 && state.turn === 0 ? '先堵住下方逃生路。' : '两侧分别向内收紧。'}` : `${level.tip} · 还剩 ${Math.max(0,level.turnLimit-state.turn)} 步。`;
  return item ? `教学 ${lesson.indexOf(item) + 1}/${lesson.length}：选 ${item.cop + 1} 号，点 ${item.node + 1} 号路口${item.node === state.cops[item.cop] ? '留守' : ''}。${item.text}` : fallback;
}

function persist() {
  try {
    const current = { levelId: level.id, mode: playMode, rule, state, history: history.slice(-100) };
    patrols[`${playMode}:${rule}`] = current;
    localStorage.setItem(storageKey, JSON.stringify({ version: 3, completed, relayCompleted, quickCompleted, current, patrols, settings: { sound: soundOn, reduced, teaching } }));
    $('save-indicator').textContent = '进度自动保存';
    $('save-indicator').classList.remove('save-error');
  } catch {
    $('save-indicator').textContent = '当前浏览器无法保存，退出后进度会丢失';
    $('save-indicator').classList.add('save-error');
  }
}
function syncSettings() {
  document.body.classList.toggle('reduced', reduced); setSound(soundOn);
  $('sound').innerHTML = icon(soundOn ? 'sound' : 'muted');
  $('sound').setAttribute('aria-pressed', String(soundOn)); $('sound').setAttribute('aria-label', soundOn ? '关闭音效' : '开启音效');
  $('sound-setting').checked = soundOn; $('motion-setting').checked = reduced;
  $('teaching-setting').checked = teaching;
}
function notify(message, tone = '') { $('instruction').textContent = message; $('instruction').className = `sr-only instruction ${tone}`; }
function stopHint() {
  hintWorker?.terminate(); hintWorker = null; clearTimeout(hintTimer); hintTimer = null; hintBusy = false;
}
function clearHint() { stopHint(); hintTarget = null; $('hint-layer')?.replaceChildren(); }
function focusPatrol(active) {
  cancelDrag();
  if (!active) {
    if (pending) { finishTurn(runToken); runToken++; }
    clearHint();
    updatePlanning();
    if (phase === 'planning') notify(turnInstruction('点亮起的相邻路口，继续包抄。'));
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  }
  document.body.classList.toggle('focus-play', active);
  $('focus-toggle').setAttribute('aria-label', '返回大厅');
  window.scrollTo(0, 0);
  document.dispatchEvent(new Event('game-displaychange'));
}
function updateChrome() {
  const alive = state.robbers.filter(n => n >= 0).length, escaped = state.robbers.filter(n => n === -2).length;
  Object.assign(document.body.dataset, { level: String(level.id), mode: playMode, rule, turn: String(state.turn), phase, remaining: String(alive), escaped: String(escaped) });
  $('relay-note').hidden = rule !== 'relay';
  const previous = lastOfficer(state, history);
  $('relay-note').textContent = previous < 0 ? '换防接力：两次实际移动必须换人；留守不会重置。' : `接力棒在 ${previous + 1} 号手中：下一次移动请换人，留守不会重置。`;
  $('turn-label').textContent = playMode === 'quick' ? `限 ${level.turnLimit} 步 · 已用 ${state.turn}` : `第 ${state.turn} 步`; $('remaining-label').textContent = escaped ? `逃脱 ${escaped} 人` : alive ? `待捕 ${alive}` : '全部抓获';
  $('remaining-label').classList.toggle('danger-text', escaped > 0);
  const labels = { planning: '轮到你了', police: '追逐队员移动', caught: '成功围捕', robbers: '突围队员逃跑', won: '任务完成', lost: playMode === 'quick' && !escaped ? '步数用完' : '出口失守' };
  $('phase-label').innerHTML = `<i></i>${labels[phase]}`;
  $('undo').disabled = !['planning', 'won', 'lost'].includes(phase) || !history.length;
  $('hint').disabled = phase !== 'planning' || hintBusy;
  $('hint').querySelector('span:last-child').textContent = hintBusy ? '想想…' : '提示';
  $('restart').disabled = false;
  $('selection-label').textContent = `${selected + 1} 号已选中`;
  [...$('squad').children].forEach((button, i) => {
    button.className = i === selected ? 'selected' : '';
    button.setAttribute('aria-pressed', String(i === selected)); button.disabled = phase !== 'planning';
  });
  const done = Object.keys(records()).length, total = availableLevels().length;
  $('completed-count').textContent = `${done} / ${total}`; $('progress-fill').style.width = `${done / total * 100}%`;
  const best = records()[level.id]?.turns;
  $('reference-turns').textContent = `三星 ≤ ${parTurns()} 步${best ? ` · 最佳 ${best} 步` : ` · ${level.cops.length} 人协作`}`;
}
function exitEndpoint(node, outside = false) {
  return boardExitEndpoint(level, node, outside);
}
function updateExits() {
  for (const node of level.exits) {
    const blocked = state.cops.includes(node), marker = $(`escape-${node}`);
    marker?.classList.toggle('guarded', blocked);
    $('exit-sign-layer')?.children[level.exits.indexOf(node)]?.classList.toggle('guarded', blocked);
    if (marker) marker.setAttribute('aria-label', `${node + 1}号逃生出口，${blocked ? '追逐队员守住' : '开放'}`);
  }
}
function drawBase() {
  applyBoardLayout($('board'), level);
  if (!document.body.classList.contains('duel-active')) document.body.dataset.boardHeight = String(level.height);
  const roads = level.edges.map(([a, b]) => `M${level.nodes[a].x} ${level.nodes[a].y}L${level.nodes[b].x} ${level.nodes[b].y}`).join('');
  const exits = level.exits.map(node => {
    const p = level.nodes[node], end = exitEndpoint(node), horizontal = end.y === p.y;
    const x = horizontal ? (end.x < p.x ? 40 : 560) : p.x, y = horizontal ? p.y - 38 : (end.y < p.y ? 30 : level.height - 30);
    return `<g id="escape-${node}" class="escape-gate" data-testid="exit-${node}" role="img" aria-label="${node + 1}号逃生出口"><path class="escape-road" d="M${p.x} ${p.y}L${end.x} ${end.y}"/><path class="escape-direction" d="M${p.x} ${p.y}L${end.x} ${end.y}" marker-end="url(#escape-arrow)"/><circle cx="${p.x}" cy="${p.y}" r="28" class="escape-ring"/><g class="escape-sign" transform="translate(${x} ${y})"><rect x="-29" y="-10" width="58" height="20" rx="5"/><text y="5">逃生口</text></g></g>`;
  }).join('');
  const nodes = level.nodes.map((p, i) => `<g><circle class="node-ground" cx="${p.x}" cy="${p.y}" r="26"/><circle id="target-${i}" class="node-target" cx="${p.x}" cy="${p.y}" r="31"/><g class="node-label" data-testid="node-${i}" data-node="${i}" role="button" tabindex="0" aria-label="${i + 1}号路口" transform="translate(${p.x} ${p.y + 26})"><circle class="node-hit" cy="-26" r="34" fill="transparent"/><rect x="-17" y="-12" width="34" height="24" rx="8"/><text y="7">${i + 1}</text></g></g>`).join('');
  $('board').innerHTML = `<title>${level.name}：${level.cops.length}名追逐队员，${level.robbers.length}名突围队员，${level.exits.length}个逃生出口</title><defs>${sceneDefinitions()}<marker id="cop-arrow" markerWidth="5" markerHeight="5" refX="4.4" refY="2.5" orient="auto"><path d="M0 0 5 2.5 0 5Z" fill="#177c91"/></marker><marker id="robber-arrow" markerWidth="5" markerHeight="5" refX="4.4" refY="2.5" orient="auto"><path d="M0 0 5 2.5 0 5Z" fill="#cb6c49"/></marker><marker id="escape-arrow" markerWidth="5" markerHeight="5" refX="4.4" refY="2.5" orient="auto"><path d="M0 0 5 2.5 0 5Z" fill="#c45836"/></marker></defs>${scenery(level, level.chapter)}<g aria-hidden="true"><path class="road-shadow" d="${roads}"/><path class="road-base" d="${roads}"/><path class="road-center" d="${roads}"/></g>${exits}<g id="preview-layer" aria-hidden="true"></g><g id="node-layer">${nodes}</g><g id="hint-layer" aria-hidden="true"></g><g id="actor-layer"></g><g id="label-layer"></g><g id="drag-layer" aria-hidden="true"></g><g id="exit-sign-layer" aria-hidden="true"></g>`;
  // Road-number controls stay above portraits on dense later maps.
  $('board').querySelectorAll('.node-label').forEach(label => $('label-layer').append(label));
  $('board').querySelectorAll('.escape-sign').forEach(sign => $('exit-sign-layer').append(sign));
  $('squad').innerHTML = state.cops.map((_, i) => `<button aria-label="选择${i + 1}号追逐队员" aria-pressed="false" data-cop="${i}"><svg class="squad-avatar" viewBox="0 0 100 100" aria-hidden="true">${gamePortrait('cop', 0, 0, 100)}</svg><span class="squad-number">${i + 1}</span></button>`).join('');
}
function updateActors(view = state, moving = '', catches = []) {
  const layer = $('actor-layer'), occupied = new Set(view.cops), scale = actorScale(level);
  for (const kind of ['cop', 'robber']) {
    const positions = kind === 'cop' ? view.cops : view.robbers;
    positions.forEach((node, i) => {
      const id = `${kind}-actor-${i}`;
      let actor = $(id);
      if (node < 0) { actor?.remove(); return; }
      if (!actor) {
        actor = document.createElementNS(svgNS, 'g'); actor.id = id;
        actor.setAttribute('role', 'button'); actor.setAttribute('tabindex', '0');
        actor.dataset[kind] = String(i); actor.dataset.testid = `${kind}-${i}`;
        layer.append(actor);
      }
      const same = positions.map((n, k) => n === node ? k : -1).filter(n => n >= 0);
      const offset = kind === 'robber' ? (same.indexOf(i) - (same.length - 1) / 2) * 14 : 0;
      const point = level.nodes[node], free = level.adj[node].filter(n => !occupied.has(n)).length;
      let mood = kind === 'cop' ? (phase === 'won' ? 'cheer' : phase === 'lost' ? 'nervous' : selected === i && phase === 'planning' ? 'selected' : 'guard') : free <= 1 ? 'nervous' : 'idle';
      if (moving === kind && actor.dataset.node !== String(node)) mood = 'run'; if (kind === 'robber' && catches.includes(i)) mood = 'caught';
      actor.dataset.node = String(node); actor.dataset.mood = mood;
      actor.setAttribute('aria-label', kind === 'cop' ? `${i + 1}号追逐队员，位于${node + 1}号路口` : `${i + 1}号突围队员，位于${node + 1}号路口，还有${free}条相邻退路`);
      if (kind === 'cop') actor.setAttribute('aria-pressed', String(selected === i));
      actor.setAttribute('class', `actor ${kind} ${mood === 'run' ? 'running' : mood}`);
      actor.style.transform = `translate(${point.x + offset}px, ${point.y + 12}px)`;
      actor.innerHTML = `<rect x="${-42 * scale}" y="${-110 * scale}" width="${84 * scale}" height="${116 * scale}" fill="transparent" pointer-events="all"/><ellipse cx="0" cy="-1" rx="29" ry="10" fill="#3f584c" opacity=".2"/><ellipse class="selection-ring" cx="0" cy="-1" rx="38" ry="16"/><g transform="scale(${scale})"><g class="figure">${character(kind, mood, i)}</g></g>${mood === 'caught' ? `<text class="capture-label" y="${-110 * scale - 12}">抓到啦！</text>` : ''}`;
      if (kind === 'robber' && same.length > 1 && same.at(-1) === i) actor.innerHTML += `<circle cx="26" cy="${-94 * scale}" r="12" fill="#c76649"/><text class="group-count" x="26" y="${-94 * scale + 5}">×${same.length}</text>`;
    });
  }
  // Paint lower characters last so crossing paths retain a natural depth order.
  // Reparenting an SVG actor cancels its CSS movement transition in Chromium.
  // Keep actors attached during movement, and only change depth order when settled.
  if (!moving) {
    const ordered = [...layer.children].sort((a, b) => level.nodes[+a.dataset.node].y - level.nodes[+b.dataset.node].y);
    ordered.forEach((actor, index) => {
      if (layer.children[index] !== actor) layer.insertBefore(actor, layer.children[index]);
    });
  }
}
function route(from, to, className, marker, offset = 0) {
  const a = level.nodes[from], b = level.nodes[to];
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
  if (!length) return '';
  const nx = -dy / length * offset, ny = dx / length * offset, trim = Math.min(30, length * .22);
  return `<path class="${className}" d="M${a.x + dx / length * trim + nx} ${a.y + dy / length * trim + ny}L${b.x - dx / length * trim + nx} ${b.y - dy / length * trim + ny}" marker-end="url(#${marker})"/>`;
}
function updatePlanning() {
  const reachable = phase === 'planning' ? targetsFor(selected) : [];
  const occupied = new Set([...state.cops, ...state.robbers]);
  level.nodes.forEach((_, i) => {
    let type = reachable.includes(i) && i !== state.cops[selected] ? 'reachable' : '';
    if (hovered === i && reachable.includes(i) && i !== state.cops[selected]) type = 'chosen';
    if (inspected >= 0 && state.robbers[inspected] >= 0 && level.adj[state.robbers[inspected]].includes(i)) type = state.cops.includes(i) ? 'blocked' : 'exit';
    $(`target-${i}`).setAttribute('class', `node-target ${type}`);
    const label = $('board').querySelector(`[data-testid="node-${i}"]`);
    label.classList.toggle('reachable', reachable.includes(i));
    label.classList.toggle('hinted', hintTarget?.node === i);
    label.querySelector('.node-hit').setAttribute('r', occupied.has(i) ? '0' : hintTarget?.node === i ? '32' : '34');
    label.setAttribute('aria-label', `${i + 1}号路口${level.exits.includes(i) ? '，逃生出口' : ''}${reachable.includes(i) ? '，点击立即移动' : ''}`);
  });
  let markup = '';
  if (phase === 'planning') {
    const plan = [...state.cops];
    if (reachable.includes(hovered)) { plan[selected] = hovered; markup += route(state.cops[selected], hovered, 'plan-path', 'cop-arrow', 5); }
    const preview = step(level, state, plan);
    preview.state.robbers.forEach((to, i) => {
      const from = state.robbers[i]; if (from < 0) return;
      if (to === -1) { const p = level.nodes[from]; markup += `<text class="route-tip" x="${p.x}" y="${p.y - 79}">能抓到</text>`; }
      else {
        const target = preview.robberMoves[i], p = level.nodes[target];
        if (target !== from) markup += route(from, target, 'robber-path', 'robber-arrow', -6);
        if (to === -2) markup += `<circle class="danger-pulse" cx="${p.x}" cy="${p.y}" r="34"/>`;
      }
    });
    const danger = preview.escaped.length;
    const previewing = reachable.includes(hovered) && hovered !== state.cops[selected];
    const context = previewing ? `走到 ${hovered + 1} 号后` : '若原地留守';
    const escapeNodes = [...new Set(preview.escaped.map(i => preview.robberMoves[i] + 1))].join('、');
    $('threat-label').textContent = danger ? `${context}：${escapeNodes} 号出口会失守！` : playMode === 'quick' ? `试炼 ${level.id}/3 · 还剩 ${level.turnLimit-state.turn} 步完成合围` : `${context}：橙线是突围队员下一步 · 先守出口`;
    $('threat-label').classList.toggle('urgent', danger > 0);
  }
  const item = lessonStep();
  if (item && inspected < 0 && !hintTarget) {
    const p = level.nodes[item.node];
    markup += `<circle class="lesson-ring" cx="${p.x}" cy="${p.y}" r="33"/><text class="lesson-tip" x="${p.x}" y="${p.y + 59}">${item.cop + 1} 号到这里</text>`;
  }
  $('preview-layer').innerHTML = markup; updateActors(); updateExits(); updateChrome();
}
function loadLevel(id, restore = null, nextRule = rule, nextMode = playMode) {
  document.body.dataset.lastGame = 'challenge';
  playMode = nextMode === 'quick' ? 'quick' : 'challenge';
  rule = nextRule === 'relay' ? 'relay' : 'standard';
  if (playMode === 'quick') rule = 'standard';
  $('solo-mode').value = playMode === 'quick' ? 'quick' : rule === 'relay' ? 'relay' : 'challenge';
  if (rule === 'relay' && !relayLevelIds.includes(id)) id = relayLevelIds[0];
  document.body.classList.remove('duel-active');
  $('duel-game').hidden = true;
  runToken++; pending = null; drag = null; clearHint();
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  const catalog = playMode === 'quick' ? quickTrials : levels;
  sourceLevel = catalog.find(item => item.id === id) || catalog[0];
  level = presentationLevel(sourceLevel);
  state = restore && validState(restore.state, level) ? copy(restore.state) : initialState(level);
  history = restore && Array.isArray(restore.history) ? restore.history.filter(s => validState(s, level)).slice(-100).map(copy) : [];
  if (rule === 'relay') state.relayLast = lastOfficer(state, history);
  selected = 0; inspected = -1; hovered = -1; phase = outcome(state);
  chapterTab = level.chapter;
  document.documentElement.style.setProperty('--ground', ['#e8ecd7', '#efe7d7', '#e2ecd8', '#deebe4', '#e7e8dc', '#dde9ed', '#e6deed'][level.chapter]);
  $('chapter-name').textContent = playMode === 'quick' ? `战术试炼 ${level.id} / 3 · 每图只需几步` : `${String(level.chapter + 1).padStart(2, '0')} / ${chapters[level.chapter].name}`;
  $('level-number').textContent = String(level.id).padStart(2, '0'); $('level-name').textContent = level.name;
  $('mission-name').textContent = level.name; $('mission-tip').textContent = level.tip;
  $('case-number').textContent = `CASE ${String(level.id).padStart(3, '0')}`;
  $('cop-count').textContent = level.cops.length; $('robber-count').textContent = level.robbers.length;
  $('board-caption').textContent = playMode === 'quick' ? `短场试炼 · ${level.turnLimit} 步内全部合围` : rule === 'relay' ? '换防接力 · 连续移动必须换队员' : `${chapters[level.chapter].name} · 守口、换防、两侧包抄`;
  const briefing = `${level.cops.length} 人协作：你动 1 人，${level.robbers.length} 名突围队员都会行动。先守出口，再换防包抄；点突围队员查看退路。`;
  drawBase(); notify(turnInstruction(state.turn === 0 ? briefing : '已选中 1 号追逐队员，点相邻路口立即走；突围队员随后行动。'));
  updatePlanning(); syncSettings(); persist(); focusPatrol(true);
  if (phase === 'won') { updateActors(); showWin(false); }
  if (phase === 'lost') showLoss(false);
}
function resizeBoard() {
  cancelDrag();
  if (!sourceLevel || document.body.classList.contains('duel-active') || level.height === boardHeight()) return;
  // A resize may finish the current animation; it never starts a new turn.
  if (pending) { finishTurn(runToken); runToken++; }
  const focused = document.activeElement;
  const focusSelector = focused?.matches('#board .actor') ? `#${focused.id}`
    : focused?.matches('#board .node-label') ? `#board [data-node="${focused.dataset.node}"]`
      : focused?.matches('#squad button') ? `#squad [data-cop="${focused.dataset.cop}"]` : null;
  level = presentationLevel(sourceLevel);
  drawBase(); updatePlanning();
  if (hintTarget) {
    const point = level.nodes[hintTarget.node];
    $('hint-layer').innerHTML = `<circle class="hint-circle" data-hint-node="${hintTarget.node}" cx="${point.x}" cy="${point.y + 26}" r="32"/>`;
  }
  if (focusSelector && !document.querySelector('dialog[open]')) document.querySelector(focusSelector)?.focus({ preventScroll: true });
}
function pickCop(index) {
  if (phase !== 'planning') return;
  clearHint();
  selected = index; inspected = -1; hovered = -1;
  playSound('select'); notify(turnInstruction(`${index + 1} 号就位！点相邻路口立即走，突围队员也会走一步。`)); updatePlanning();
}
function planTarget(node) {
  if (phase !== 'planning') return;
  if (selected < 0) { notify('先选一位追逐队员，再点想去的路口。'); return; }
  if (rule === 'relay' && selected === lastOfficer(state, history) && node !== state.cops[selected]) { playSound('error'); notify(`接力要换人：请先调动另一位队员，${selected + 1} 号这一步只能留守。`, 'alert'); return; }
  if (!targetsFor(selected).includes(node)) { playSound('error'); notify(state.robbers.includes(node) ? '这里有突围队员！去封住它相邻的退路。' : state.cops.includes(node) ? '队友正在守住这里，选择别的路口。' : '一步只能走一段路，选择相邻路口。', 'alert'); return; }
  const plan = [...state.cops]; plan[selected] = node; execute(plan);
}
function inspectRobber(index) {
  if (phase !== 'planning' || state.robbers[index] < 0) return;
  inspected = index; hovered = -1;
  const exits = level.adj[state.robbers[index]], blocked = exits.filter(node => state.cops.includes(node)).length;
  notify(`${index + 1} 号突围队员：已封 ${blocked}/${exits.length} 条退路。包抄时别让守出口的队友离岗。`); updatePlanning();
}
const pause = ms => new Promise(resolve => setTimeout(resolve, reduced ? 15 : ms));
async function execute(plan) {
  if (phase !== 'planning') return;
  const error = validatePlan(level, state, plan); if (error) { notify(error, 'alert'); return; }
  if (rule === 'relay') { const violation = relayError(state, plan, lastOfficer(state, history)); if (violation) { notify(violation, 'alert'); return; } }
  unlockSound(); clearHint(); const before = copy(state), result = step(level, state, plan), token = ++runToken;
  if (rule === 'relay') result.state.relayLast = movedOfficer(before, plan) < 0 ? lastOfficer(before, history) : movedOfficer(before, plan);
  history.push(before); state = result.state; inspected = -1; hovered = -1;
  pending = { before, result, token }; persist();
  $('preview-layer').replaceChildren(); level.nodes.forEach((_, i) => $(`target-${i}`).setAttribute('class', 'node-target'));
  phase = 'police'; notify(`${selected + 1} 号${before.cops[selected] === state.cops[selected] ? '留守一拍' : '移动'}，其他追逐队员守住原位。`); updateChrome();
  updateActors({ cops: state.cops, robbers: before.robbers }, 'cop'); playSound('step');
  await pause(350); if (token !== runToken) return;
  const firstCaught = result.caught.filter(i => result.afterPolice[i] < 0);
  if (firstCaught.length) {
    phase = 'caught'; updateChrome(); updateActors({ cops: state.cops, robbers: before.robbers }, '', firstCaught); playSound('capture');
    notify(`抓到 ${firstCaught.length} 名突围队员！${state.robbers.some(n => n !== -1) ? '还有突围队员在逃！' : '漂亮的围捕！'}`, 'success');
    await pause(580); if (token !== runToken) return;
  }
  if (result.afterPolice.some(n => n >= 0)) {
    phase = 'robbers'; updateChrome(); updateActors({ cops: state.cops, robbers: result.robberMoves }, 'robber');
    if (result.afterPolice.some((n, i) => n >= 0 && n !== result.robberMoves[i])) playSound('step');
    await pause(340); if (token !== runToken) return;
    if (result.escaped.length) {
      notify('出口失守！突围队员溜出了街区。', 'alert');
      for (const i of result.escaped) {
        const actor = $(`robber-actor-${i}`), end = exitEndpoint(result.robberMoves[i], true);
        if (actor) { actor.classList.add('escaping'); actor.style.transform = `translate(${end.x}px, ${end.y + 12}px)`; }
      }
      await pause(330); if (token !== runToken) return;
    }
  }
  finishTurn(token);
}
function finishTurn(token) {
  if (token !== runToken || !pending) return;
  const caught = pending.result.caught.length; pending = null;
  phase = outcome(state);
  if (phase === 'won') {
    recordWin(); updateActors(); updateChrome(); persist(); showWin(true);
  } else if (phase === 'lost') {
    updateActors(); updateChrome(); updateExits(); persist(); showLoss(true);
  } else {
    const repeats = history.filter(s => stateKey(s) === stateKey(state)).length;
    notify(turnInstruction(repeats >= 2 ? '别只跟着追，试着提前拦住出口。' : caught ? `抓获 ${caught} 名！还有突围队员在逃，继续拦截。` : rule === 'relay' ? '轮到你了。下一次移动请换一位队员，留守不会交棒。' : `轮到你了。${selected + 1} 号仍被选中，可连续点击前进。`), caught ? 'success' : '');
    updatePlanning(); persist();
  }
}
function recordWin() {
  if (outcome(state) !== 'won') return;
  if (playMode === 'challenge' && level.id === 1 && rule === 'standard') { teaching = false; $('teaching-setting').checked = false; }
  const stars = state.turn <= parTurns() ? 3 : state.turn <= parTurns() + 3 ? 2 : 1;
  const previous = records()[level.id];
  if (!previous || state.turn < previous.turns) records()[level.id] = { turns: state.turn, stars };
}
function showWin(sound = true) {
  if (outcome(state) !== 'won') return;
  recordWin(); updateChrome(); persist();
  const stars = state.turn <= parTurns() ? 3 : state.turn <= parTurns() + 3 ? 2 : 1;
  $('win-title').textContent = playMode === 'quick' ? `战术试炼 ${level.id} / 3，收网！` : rule === 'relay' ? '换防接力，收网成功！' : level.id === levels.length ? '挑战全部完成！辛苦啦。' : '漂亮！一网打尽。';
  $('win-stars').innerHTML = '★'.repeat(stars) + `<span class="empty">${'★'.repeat(3 - stars)}</span>`;
  $('win-stars').setAttribute('aria-label', `获得${stars}颗星`);
  $('win-details').textContent = `${level.robbers.length} 名突围队员全部完成拦截，用了 ${state.turn} 步。个人最佳 ${records()[level.id].turns} 步。${stars === 3 ? '已达成三星！下一关继续练配合。' : `再省 ${state.turn - parTurns()} 步就能获得三星，试着减少追赶和重复换防。`}`;
  if (playMode === 'quick') $('win-details').textContent = `${state.turn} 步完成 · 试炼最佳 ${records()[level.id].turns} 步。${level.lesson}`;
  $('replay').textContent = stars === 3 ? '重玩本关' : `重玩本关，挑战 ${parTurns()} 步三星`;
  $('next-level').innerHTML = `${playMode === 'quick' ? level.id === 3 ? '三图完成，进阶换防接力' : '下一张短场试炼' : level.id === availableLevels().at(-1).id ? '看看街区巡逻记录' : '下一个任务'} <span aria-hidden="true">→</span>`;
  $('win-art').innerHTML = `<svg viewBox="0 0 260 180"><ellipse cx="130" cy="158" rx="95" ry="12" fill="#dfe6d2"/><g transform="translate(78 156) scale(1.4)">${character('cop', 'cheer', 0)}</g><g transform="translate(176 161) scale(1.15)">${character('robber', 'caught', 0)}</g><g fill="#e3ad46"><path d="m124 29 4 8 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1Z"/><circle cx="31" cy="61" r="3"/><circle cx="220" cy="83" r="4"/></g><path d="m213 37 5 9m-10-5 13-2M42 106l-7 5" stroke="#dc8b69" stroke-width="3" stroke-linecap="round"/></svg>`;
  if (!$('win-dialog').open) $('win-dialog').showModal();
  if (sound) playSound('win');
}
function showLoss(sound = true) {
  $('loss-title').textContent = playMode === 'quick' && !state.robbers.includes(-2) ? '步数用完，换个顺序再试。' : '糟糕，让他溜了！';
  $('loss-dialog').querySelector('.eyebrow').textContent = playMode === 'quick' && !state.robbers.includes(-2) ? 'TRY ANOTHER ROUTE' : 'ESCAPED!';
  const escaped = state.robbers.filter(n => n === -2).length;
  const before = history.at(-1);
  let explanation = `${escaped} 名突围队员从出口逃走了。试试提前占住出口或它必经的路口。`;
  if (before && !validatePlan(level, before, state.cops)) {
    const result = step(level, before, state.cops);
    const escapes = result.escaped.map(i => `${i + 1} 号突围队员从 ${before.robbers[i] + 1} 号路口逃到 ${result.robberMoves[i] + 1} 号出口`);
    const leaving = before.cops.findIndex((node, i) => node !== state.cops[i] && result.escaped.some(robber => result.robberMoves[robber] === node));
    if (escapes.length) explanation = `第 ${state.turn} 步：${escapes.join('；')}。${leaving >= 0 ? `${leaving + 1} 号离开出口前，需要队友接防。` : '这一步没有封住它通往出口的路。'}撤销后先拦截，或点提示找一个安全落点。`;
  }
  $('loss-details').textContent = playMode === 'quick' ? `${state.robbers.includes(-2) ? '逃生路没封住。' : `${level.turnLimit} 步已用完，还未完成全部合围。`}${level.tip} 撤销后立即换一种顺序试试。` : explanation;
  $('loss-art').innerHTML = `<svg viewBox="0 0 260 170"><ellipse cx="122" cy="151" rx="102" ry="11" fill="#ead9c8"/><g transform="translate(74 150) scale(1.35)">${character('cop', 'nervous', 0)}</g><g transform="translate(185 144) scale(1.15)">${character('robber', 'cheer', 0)}</g><path d="M220 46h23m-7-6 7 6-7 6" fill="none" stroke="#c65c37" stroke-width="4" stroke-linecap="round"/></svg>`;
  $('undo-loss').disabled = !history.length;
  $('threat-label').textContent = playMode === 'quick' && !state.robbers.includes(-2) ? '试炼步数用完 · 撤销一步就能再试' : '出口失守 · 可以撤销这一步再试'; $('threat-label').classList.add('urgent');
  notify(playMode === 'quick' ? '试炼未完成。撤销后换个拦截顺序，马上再试。' : '突围队员逃走了，这次围捕失败。可以撤销或重新挑战。', 'alert');
  if (!$('loss-dialog').open) $('loss-dialog').showModal();
  if (sound) playSound('lose');
}
function undo() {
  if (!['planning', 'won', 'lost'].includes(phase)) return;
  if (!history.length) return;
  $('win-dialog').close(); $('loss-dialog').close(); clearHint(); runToken++;
  state = history.pop(); inspected = -1; hovered = -1; phase = 'planning';
  notify(turnInstruction('回到上一步。换一位追逐队员，试试提前拦截。')); updatePlanning(); persist(); playSound('undo');
}
let selectingMode = 'challenge', selectingRule = 'standard';
function renderLevelDialog() {
  const selectionRecords = selectingMode === 'quick' ? quickCompleted : selectingRule === 'relay' ? relayCompleted : completed;
  const small = selectingMode === 'quick' || selectingRule === 'relay';
  $('chapter-tabs').innerHTML = chapters.map((chapter, i) => `<button role="tab" aria-selected="${i === chapterTab}" aria-controls="level-grid" id="chapter-tab-${i}" data-chapter="${i}">${chapter.name}</button>`).join('');
  $('chapter-tabs').hidden = small;
  const chapterLevels = selectingMode === 'quick' ? quickTrials : selectingRule === 'relay' ? levels.filter(map => relayLevelIds.includes(map.id)) : levels.filter(map => map.chapter === chapterTab);
  const threeStars = chapterLevels.filter(map => selectionRecords[map.id]?.stars === 3).length;
  $('chapter-description').textContent = `${selectingMode === 'quick' ? '两步试炼' : selectingRule === 'relay' ? '换防接力' : chapters[chapterTab].name} · 三星 ${threeStars}/${chapterLevels.length}`;
  $('level-grid').setAttribute('role', small ? 'group' : 'tabpanel');
  if (small) $('level-grid').removeAttribute('aria-labelledby');
  else $('level-grid').setAttribute('aria-labelledby', `chapter-tab-${chapterTab}`);
  $('level-grid').innerHTML = chapterLevels.map((map, index) => {
    const row = Math.floor(index / 3), col = row % 2 ? 3 - index % 3 : index % 3 + 1;
    const par = selectingRule === 'relay' ? optimalRelaySolutions[map.id].length : map.par;
    return `<button style="grid-column:${col};grid-row:${row + 1}" class="${map.id === level.id ? 'current' : ''}" data-level="${map.id}" data-testid="level-button-${map.id}" data-completed="${!!selectionRecords[map.id]}" aria-label="第${map.id}关 ${map.name}${selectionRecords[map.id] ? `，已完成，${selectionRecords[map.id].stars}颗星，最佳${selectionRecords[map.id].turns}步` : ''}，三星${par}步以内"><span class="level-id">${map.id}</span><span class="level-title">${map.name}</span><span class="level-stars" aria-hidden="true">${'★'.repeat(selectionRecords[map.id]?.stars || 0)}${'☆'.repeat(3 - (selectionRecords[map.id]?.stars || 0))}</span></button>`;
  }).join('');
  drawLevelPath(chapterLevels.length);
}
function openLevels() {
  const mode = $('solo-mode').value;
  if (['escape', 'survival'].includes(mode)) { $('mode-dialog').showModal(); return; }
  focusPatrol(false);
  selectingMode = mode === 'quick' ? 'quick' : 'challenge'; selectingRule = mode === 'relay' ? 'relay' : 'standard';
  chapterTab = level.chapter; renderLevelDialog(); $('level-dialog').showModal();
}
function showHint() {
  if (phase !== 'planning') return;
  const hintKey = () => `${playMode}:${level.id}:${rule}:${stateKey(state)}:${playMode === 'quick' ? state.turn : ''}:${rule === 'relay' ? lastOfficer(state, history) : -1}`;
  const key = hintKey();
  clearHint(); hintBusy = true; updatePlanning(); notify('正在核对最短围捕路线…你也可以继续走。');
  try {
    hintWorker = new Worker(new URL('./hint-worker.js', import.meta.url), { type: 'module' });
    const finish = answer => {
      stopHint(); if (phase !== 'planning' || hintKey() !== key) return;
      const plan = answer.plan;
      if (answer.status === 'solved' && plan && validatePlan(level,state,plan) === null && (rule !== 'relay' || !relayError(state,plan,lastOfficer(state,history)))) {
        const moved = plan.findIndex((node, i) => node !== state.cops[i]), index = Math.max(0, moved), node = plan[index], p = level.nodes[node];
        selected = index; hovered = node; inspected = -1; hintTarget = {node}; updatePlanning();
        $('hint-layer').innerHTML = `<circle class="hint-circle" data-hint-node="${node}" cx="${p.x}" cy="${p.y + 26}" r="32"/>`;
        notify(`最短还需 ${answer.remaining} 步：${index + 1} 号追逐队员${moved < 0 ? '先留守一拍' : `到 ${node + 1} 号路口拦截`}。点高亮的 ${node + 1} 号数字${moved < 0 ? '留守' : '移动'}。`, 'success');
      } else if (answer.status === 'unsolvable') notify(playMode === 'quick' ? '剩余步数内无法全部围捕，请撤销或重开。' : '当前局面已无法全部围捕，请撤销或重开。');
      else if (answer.status === 'incomplete') notify('尚未确认最短路线，本次未给出提示。可以重试提示或撤销。');
      else notify('提示暂时不可用，请稍后重试。');
      updateChrome();
    };
    hintWorker.onmessage = event => { if (event.data.id === key) finish(event.data); };
    hintWorker.onerror = () => finish({status:'error'});
    hintTimer = setTimeout(() => finish({status:'incomplete',reason:'timeout'}), 12000);
    hintWorker.postMessage({ id: key, levelId: level.id, mode:playMode, rule, last: lastOfficer(state, history), state: copy(state) });
  } catch { stopHint(); notify('提示暂时不可用，请稍后重试。'); updateChrome(); }
}

$('board').addEventListener('click', event => {
  const cop = event.target.closest('[data-cop]'), robber = event.target.closest('[data-robber]'), node = event.target.closest('.node-label');
  if (cop && performance.now() < suppressClickUntil) return;
  if (cop) pickCop(+cop.dataset.cop); else if (robber) inspectRobber(+robber.dataset.robber); else if (node) planTarget(+node.dataset.node);
});
$('board').addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  if (event.target.closest('[role="button"]')) { event.preventDefault(); event.stopPropagation(); event.target.closest('[role="button"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); }
});
$('board').addEventListener('pointerover', event => {
  if (event.pointerType !== 'mouse' || phase !== 'planning' || drag) return;
  const node = event.target.closest('.node-label');
  const next = node ? +node.dataset.node : -1;
  if (hovered !== next) { hovered = next; updatePlanning(); }
});
$('board').addEventListener('pointerleave', () => { if (phase === 'planning' && !drag && hovered >= 0) { hovered = -1; updatePlanning(); } });
function svgPoint(event) {
  const point = new DOMPoint(event.clientX, event.clientY), matrix = $('board').getScreenCTM();
  return matrix ? point.matrixTransform(matrix.inverse()) : { x: 0, y: 0 };
}
function closestNode(point) {
  let closest = -1, distance = 58;
  level.nodes.forEach((p, i) => { const d = Math.hypot(point.x - p.x, point.y - p.y); if (d < distance) { distance = d; closest = i; } });
  return closest;
}
$('board').addEventListener('pointerdown', event => {
  const cop = event.target.closest('[data-cop]'); if (!cop || phase !== 'planning' || event.button !== 0 || drag) return;
  drag = { index: +cop.dataset.cop, id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  $('board').setPointerCapture(event.pointerId);
});
$('board').addEventListener('pointermove', event => {
  if (!drag || drag.id !== event.pointerId) return;
  if (drag.moved || Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 8) {
    if (!drag.moved) { drag.moved = true; pickCop(drag.index); }
    const point = svgPoint(event), from = level.nodes[state.cops[drag.index]];
    const target = closestNode(point);
    if (hovered !== target) { hovered = target; updatePlanning(); }
    $('drag-layer').innerHTML = `<path class="drag-line" d="M${from.x} ${from.y}L${point.x} ${point.y}"/>`;
  }
});
$('board').addEventListener('pointerup', event => {
  if (!drag || drag.id !== event.pointerId) return;
  const gesture = drag; drag = null; $('drag-layer').replaceChildren();
  if ($('board').hasPointerCapture(event.pointerId)) $('board').releasePointerCapture(event.pointerId);
  if (gesture.moved) {
    suppressClickUntil = performance.now() + 400;
    const closest = closestNode(svgPoint(event));
    hovered = -1;
    if (closest >= 0 && closest !== state.cops[gesture.index]) planTarget(closest); else notify('已取消拖动，没有走出这一步。');
    if (phase === 'planning') updatePlanning();
  } else { suppressClickUntil = performance.now() + 300; pickCop(gesture.index); }
});
function cancelDrag() {
  const gesture = drag; drag = null;
  if (gesture && $('board').hasPointerCapture(gesture.id)) $('board').releasePointerCapture(gesture.id);
  $('drag-layer')?.replaceChildren();
  if (gesture?.moved && phase === 'planning') { hovered = -1; updatePlanning(); }
}
$('board').addEventListener('pointercancel', cancelDrag); $('board').addEventListener('lostpointercapture', cancelDrag);
$('squad').addEventListener('click', event => { const button = event.target.closest('[data-cop]'); if (button) pickCop(+button.dataset.cop); });
$('focus-toggle').addEventListener('click', () => focusPatrol(!document.body.classList.contains('focus-play')));
$('resume-patrol').addEventListener('click', () => { if (document.body.dataset.lastGame !== 'duel' || !duelLobby?.resume()) focusPatrol(true); });
$('undo').addEventListener('click', undo); $('hint').addEventListener('click', showHint);
$('retry').addEventListener('click', () => loadLevel(level.id)); $('undo-loss').addEventListener('click', undo);
$('restart').addEventListener('click', () => { playSound('undo'); loadLevel(level.id); });
$('level-select').addEventListener('click', openLevels); $('mobile-level-select').addEventListener('click', openLevels);
$('chapter-tabs').addEventListener('click', event => { const button = event.target.closest('[data-chapter]'); if (button) { chapterTab = +button.dataset.chapter; renderLevelDialog(); $(`chapter-tab-${chapterTab}`).focus(); } });
$('chapter-tabs').addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); chapterTab = event.key === 'Home' ? 0 : event.key === 'End' ? chapters.length - 1 : (chapterTab + (event.key === 'ArrowRight' ? 1 : chapters.length - 1)) % chapters.length; renderLevelDialog(); $(`chapter-tab-${chapterTab}`).focus(); });
$('level-grid').addEventListener('click', event => { const button = event.target.closest('[data-level]'); if (button) { playSound('select'); const restore = savedPatrol(selectingMode, selectingRule); loadLevel(+button.dataset.level, restore?.levelId === +button.dataset.level ? restore : null, selectingRule, selectingMode); } });
$('next-level').addEventListener('click', () => { const next = availableLevels()[availableLevels().findIndex(map => map.id === level.id) + 1]; if (!next && playMode === 'quick') loadLevel(1,null,'relay','challenge'); else if (!next) { $('win-dialog').close(); $('solo-mode').value = playMode === 'quick' ? 'quick' : rule === 'relay' ? 'relay' : 'challenge'; openLevels(); } else loadLevel(next.id); });
$('replay').addEventListener('click', () => loadLevel(level.id));
$('help').addEventListener('click', () => $('help-dialog').showModal()); $('settings').addEventListener('click', () => $('settings-dialog').showModal());
$('sound').addEventListener('click', () => { soundOn = !soundOn; syncSettings(); unlockSound(); playSound('select'); persist(); });
$('sound-setting').addEventListener('change', event => { soundOn = event.target.checked; syncSettings(); unlockSound(); playSound('select'); persist(); });
$('motion-setting').addEventListener('change', event => { reduced = event.target.checked; syncSettings(); persist(); });
$('teaching-setting').addEventListener('change', event => { teaching = event.target.checked; notify(turnInstruction(teaching ? '教学已开启，选择第 1 关体验守口与换防。' : '教学已关闭。点突围队员可查看退路，提示可以帮你找安全落点。')); updatePlanning(); persist(); });
document.querySelectorAll('.dialog-close').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
  dialog.addEventListener('close', () => { if (phase === 'won') notify('任务已完成。选择下一关，或撤销再试一种走法。', 'success'); if (phase === 'lost') notify('突围队员已逃脱。撤销这一步，或重新挑战。', 'alert'); });
});
document.addEventListener('keydown', event => {
  if (!document.body.classList.contains('focus-play') || document.body.classList.contains('duel-active') || document.querySelector('dialog[open]') || event.repeat) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); }
  if (event.code === 'Space' && !event.target.closest('button, input, a, [role="button"]')) { event.preventDefault(); if (phase === 'planning') execute([...state.cops]); }
});
window.addEventListener('blur', cancelDrag);
window.addEventListener('resize', resizeBoard);
document.addEventListener('game-displaychange', resizeBoard);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelDrag(); if (pending) { const token = runToken; finishTurn(token); runToken++; } }
});
window.addEventListener('pagehide', persist);

syncSettings();
const current = saved.current;
const sharedPatrol = sharedPuzzle && ['challenge','quick'].includes(sharedPuzzle.mode);
loadLevel(sharedPatrol ? sharedPuzzle.level : current?.levelId || 1, sharedPatrol ? null : current, sharedPatrol ? sharedPuzzle.rule : current?.rule, sharedPatrol ? sharedPuzzle.mode : current?.mode || 'challenge');
// A direct link selects once; subsequent reloads resume the player's current patrol.
if (query.has('level')) {
  const cleanUrl = new URL(location.href); cleanUrl.searchParams.delete('level');
  window.history.replaceState(null, '', cleanUrl);
}

const savedPatrol = (mode,rule) => { const snapshot = patrols[`${mode}:${rule}`], map = (mode === 'quick' ? quickTrials : levels).find(item=>item.id===snapshot?.levelId); return map && validState(snapshot.state,map) && snapshot.state.robbers.some(node=>node>=0) && !snapshot.state.robbers.includes(-2) && (mode !== 'quick' || snapshot.state.turn < map.turnLimit) ? snapshot : null; };
duelLobby = setupDuelLobby({ selectLevels: openLevels, sharedPuzzle, savedPatrol, stopChallenge: () => { if (pending) finishTurn(runToken); runToken++; pending = null; clearHint(); document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close()); }, startChallenge: (options = {}) => { const targetMode = options.mode || 'challenge', targetRule = options.rule || 'standard', saved = savedPatrol(targetMode,targetRule), resume = !options.fresh && (targetMode !== playMode || targetRule !== rule || targetMode === 'quick' || targetRule === 'relay') && (!options.id || options.id === saved?.levelId) ? saved : null; loadLevel(options.id || resume?.levelId || level.id,resume,targetRule,targetMode); }, returnLobby: () => focusPatrol(false) });
$('share-challenge').addEventListener('click', () => {
  if (document.body.dataset.lastGame === 'duel' && duelLobby.sharePuzzle()) return;
  showPuzzleShare({ mode: playMode, level: level.id, rule }, `围捕小队 · ${playMode === 'quick' ? '快速战术试炼' : rule === 'relay' ? '换防接力' : '围堵挑战'} · 第 ${level.id} 关`);
});
$('appearance-settings').addEventListener('click', () => openAppearanceSettings(() => { drawBase(); updatePlanning(); }));
setupGameShell({ openLevels });
if (!query.has('level')) { document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close()); focusPatrol(false); }
