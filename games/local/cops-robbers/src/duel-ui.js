import { getDuelLevel } from './duel-levels.js';
import { initialDuel, legalDuelTargets, stepDuel, chooseDuelAction } from './duel.js';
import { character, scenery } from './art.js';
import { playSound, unlockSound } from './sound.js';

export function setupDuelLobby({ startChallenge, returnLobby, stopChallenge }) {
  const $ = id => document.getElementById(id), label = side => side === 'pursuer' ? '追逐队' : '突围队';
  let level, state, role = 'pursuer', selected = 0, timer, serial = 0, firstSide;
  const saveKey = 'cops-robbers-duel-v1'; let saved = {};
  try { const data = JSON.parse(localStorage.getItem(saveKey) || '{}'); if (data && typeof data === 'object' && !Array.isArray(data)) saved = data; } catch { /* A damaged local preference never blocks play. */ }
  const wins = Object.fromEntries(Object.entries(saved.wins || {}).filter(([key, value]) => /^(escape|survival):(pursuer|runner):([1-9][0-9]?|100)$/.test(key) && value === true));
  for (const [id, allowed] of [['solo-mode', ['challenge','escape','survival']], ['solo-role',['pursuer','runner']], ['solo-initiative',['first','second','random']]]) if (allowed.includes(saved[id])) $(id).value = saved[id];
  function persistOptions() {
    try { localStorage.setItem(saveKey, JSON.stringify({ wins, 'solo-mode': $('solo-mode').value, 'solo-role': $('solo-role').value, 'solo-initiative': $('solo-initiative').value, level: Number($('solo-level').value) })); }
    catch { $('friend-note').textContent = '当前浏览器无法保存本地进度；本次仍可继续玩。'; }
  }
  function renderOptions() {
    const current = $('solo-level').value || String(Number.isInteger(saved.level) && saved.level >= 1 && saved.level <= 100 ? saved.level : 1);
    $('solo-level').innerHTML = Array.from({ length: 100 }, (_, i) => `<option value="${i + 1}">${wins[`${$('solo-mode').value}:${$('solo-role').value}:${i + 1}`] ? '✓ ' : ''}第 ${i + 1} 关 · 难度 ${1 + Math.floor(i / 20)}</option>`).join('');
    $('solo-level').value = current;
  }
  renderOptions();
  function updateMode() {
    const challenge = $('solo-mode').value === 'challenge';
    for (const id of ['solo-role-row', 'solo-initiative-row', 'solo-level-row']) $(id).hidden = challenge;
    $('mode-description').textContent = challenge ? '固定对手 · 追逐队先手 · 100 关已验证有解，试着找出最佳路线。' : '双方可选，胜负取决于走位与应对。后段街区更大、岔路更多，电脑也会更难缠。';
    $('start-mode').textContent = challenge ? '开始围堵挑战' : '开始人机对抗';
  }
  function stop() { clearTimeout(timer); serial++; }
  function render() {
    if (!state) return;
    if (state.winner === role && !wins[`${level.mode}:${role}:${level.id}`]) { wins[`${level.mode}:${role}:${level.id}`] = true; persistOptions(); renderOptions(); }
    const myTurn = state.side === role && !state.winner, positions = role === 'pursuer' ? state.cops : state.robbers;
    if (positions[selected] < 0) selected = Math.max(0, positions.findIndex(node => node >= 0));
    const targets = myTurn ? legalDuelTargets(level, state, selected) : [];
    $('duel-title').textContent = `${level.name} · 我是${label(role)}`;
    $('duel-status').textContent = state.winner ? `${label(state.winner)}获胜 · ${state.winner === role ? '挑战成功' : '再试一种走法'}` : `${label(state.side)}行动${myTurn ? ' · 轮到你' : ' · 电脑思考中'}`;
    $('duel-round').textContent = `${Math.floor(state.turn / 2)} / ${level.roundLimit} 回合`;
    $('duel-rules').textContent = `${label(firstSide)}先手 · ${level.mode === 'escape' ? '突围队到任一出口即胜；追逐队走到对手位置完成拦截。' : `无出口；突围队坚持 ${level.roundLimit} 回合即胜，追逐队需在限步内拦截。`}`;
    $('duel-note').textContent = state.winner ? '本局已结束。可重新挑战、下一关或返回大厅。' : myTurn ? '先选队员，再点亮起的相邻路口。点脚下数字可以留守。' : '电脑行动中；可随时重新挑战或返回大厅。';
    $('duel-wait').disabled = !myTurn;
    $('duel-next').disabled = level.id === 100;
    document.body.dataset.duelTurn = state.turn; document.body.dataset.duelSide = state.side; document.body.dataset.duelWinner = state.winner || ''; document.body.dataset.duelRole = role;
    const roads = level.edges.map(([a, b]) => `M${level.nodes[a].x} ${level.nodes[a].y}L${level.nodes[b].x} ${level.nodes[b].y}`).join('');
    const nodes = level.nodes.map((point, index) => `<g role="button" tabindex="0" data-target="${index}" aria-label="${index + 1} 号路口${targets.includes(index) ? '，可移动' : ''}" transform="translate(${point.x} ${point.y})"><circle r="36" fill="transparent"/><circle r="${targets.includes(index) ? 24 : 17}" fill="${level.exits.includes(index) ? '#ffdaa7' : '#fffcf0'}" stroke="${targets.includes(index) ? '#1258c2' : '#c4c8ae'}" stroke-width="3"/><text y="30" text-anchor="middle" font-size="17" font-weight="bold" fill="#2c4844">${index + 1}</text>${level.exits.includes(index) ? '<text y="-27" text-anchor="middle" fill="#9d4b0a" font-size="17">出口</text>' : ''}</g>`).join('');
    const actors = ['pursuer', 'runner'].flatMap(side => (side === 'pursuer' ? state.cops : state.robbers).map((node, index) => node < 0 ? '' : `<g role="button" tabindex="0" data-side="${side}" data-actor="${index}" aria-label="${label(side)} ${index + 1} 号，${node + 1} 号路口" transform="translate(${level.nodes[node].x} ${level.nodes[node].y + 13})"><rect x="-30" y="-69" width="60" height="77" fill="transparent"/>${side === role && selected === index ? '<ellipse cy="1" rx="29" ry="12" fill="#83bbef" opacity=".6"/>' : ''}<g transform="scale(.64)">${character(side === 'pursuer' ? 'cop' : 'robber', side === role && selected === index ? 'selected' : 'idle', index)}</g></g>`)).join('');
    $('duel-board').innerHTML = `${scenery(level, Math.min(4, level.difficulty - 1))}<path d="${roads}" fill="none" stroke="#faf6e4" stroke-width="22" stroke-linecap="round"/><path d="${roads}" fill="none" stroke="#d9d2ae" stroke-width="2" stroke-dasharray="5 7"/>${nodes}${actors}`;
    $('duel-squad').innerHTML = positions.map((node, index) => `<button data-select="${index}" class="secondary-action" aria-pressed="${index === selected}" ${node < 0 || !myTurn ? 'disabled' : ''}>${label(role)} ${index + 1}${node < 0 ? ' 已拦截' : ''}</button>`).join('');
  }
  function scheduleAI() {
    if (!state || state.winner || state.side === role || !document.body.classList.contains('duel-active')) return;
    const token = serial;
    timer = setTimeout(() => {
      if (token !== serial || document.hidden) return;
      const action = chooseDuelAction(level, state);
      if (action) { state = stepDuel(level, state, action); playSound(state.winner ? state.winner === role ? 'win' : 'lose' : 'step'); render(); }
    }, 320);
  }
  function start(id = Number($('solo-level').value), retry = false) {
    stop(); stopChallenge?.(); level = getDuelLevel($('solo-mode').value, id); if (!level) return;
    role = $('solo-role').value;
    if (!retry) firstSide = $('solo-initiative').value === 'random' ? (Math.random() < .5 ? 'pursuer' : 'runner') : $('solo-initiative').value === 'first' ? role : role === 'pursuer' ? 'runner' : 'pursuer';
    state = initialDuel(level, firstSide); selected = 0;
    $('solo-level').value = String(id); persistOptions(); $('duel-game').hidden = false;
    document.body.classList.add('duel-active', 'focus-play'); $('focus-toggle').textContent = '返回大厅';
    unlockSound(); render(); window.scrollTo(0, 0); scheduleAI();
  }
  function move(target) {
    if (!state || state.winner || state.side !== role) return;
    if (!legalDuelTargets(level, state, selected).includes(target)) { $('duel-note').textContent = '一步只能走到亮起的相邻路口。'; playSound('error'); return; }
    state = stepDuel(level, state, { type: 'move', side: role, actor: selected, target });
    playSound(state.winner ? state.winner === role ? 'win' : 'lose' : 'step'); render(); scheduleAI();
  }
  $('friend-duel').addEventListener('click', () => { const entry = document.querySelector('[data-competition-launch]'); if (entry) entry.click(); else $('friend-note').textContent = '当前是单机预览。好友房间请从游戏大厅的联机入口进入。'; });
  $('solo-mode').addEventListener('change', () => { updateMode(); renderOptions(); persistOptions(); });
  for (const id of ['solo-role','solo-initiative','solo-level']) $(id).addEventListener('change', () => { renderOptions(); persistOptions(); });
  $('start-mode').addEventListener('click', () => { stop(); if ($('solo-mode').value === 'challenge') startChallenge(); else start(); });
  $('duel-back').addEventListener('click', () => { stop(); document.body.classList.remove('duel-active'); $('duel-game').hidden = true; returnLobby(); });
  $('focus-toggle').addEventListener('click', () => { if (document.body.classList.contains('duel-active')) $('duel-back').click(); });
  $('duel-retry').addEventListener('click', () => start(level.id, true));
  $('duel-next').addEventListener('click', () => { if (level.id < 100) start(level.id + 1); });
  $('duel-wait').addEventListener('click', () => move((role === 'pursuer' ? state.cops : state.robbers)[selected]));
  $('duel-squad').addEventListener('click', event => { const button = event.target.closest('[data-select]'); if (button) { selected = Number(button.dataset.select); render(); } });
  $('duel-board').addEventListener('click', event => {
    const actor = event.target.closest('[data-actor]'), target = event.target.closest('[data-target]');
    if (actor?.dataset.side === role) { selected = Number(actor.dataset.actor); render(); }
    else if (actor && state.side === role) move((actor.dataset.side === 'pursuer' ? state.cops : state.robbers)[Number(actor.dataset.actor)]);
    else if (target) move(Number(target.dataset.target));
  });
  $('duel-board').addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key) && event.target.closest('[role="button"]')) { event.preventDefault(); event.target.closest('[role="button"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
  document.addEventListener('visibilitychange', () => { stop(); if (!document.hidden) scheduleAI(); });
  updateMode();
}
