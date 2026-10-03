import { createGame, act, getRoom, getOptions, getIntent } from './engine.mjs';
import { LEVELS } from './levels.mjs';
import { renderScene, renderVignette, icon } from './art.mjs';

const $ = (selector) => document.querySelector(selector);
const saveKey = 'ink-is-everything:chapter:v1';
let state = createGame(),
  started = false,
  selected = 'crossing',
  history = [],
  saved = null;
let brushDrag = null,
  suppressClickUntil = 0;
let storageAvailable = true;
let muted = true,
  audio = null,
  toastTimer,
  lastFocus,
  actionLocked = false,
  lockTimer;
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const level = () => LEVELS[state.levelId];
const fighting = () => Boolean(getRoom(state).enemy?.hp > 0);
const options = () => getOptions(state);
const findOption = (type, target) =>
  options().find((item) => item.type === type && item.target === target);
const optionAttributes = (option) =>
  `data-action="${option.type}" ${option.target ? `data-target="${option.target}"` : ''} ${!option.enabled ? 'disabled' : ''} title="${esc(option.reason || option.description)}"`;

// Persist the player's commands, then replay through the reducer on load. Stored JSON
// never becomes trusted game state or rendered HTML, and old saves can be rejected.
try {
  muted = localStorage.getItem('ink-is-everything:muted') !== 'false';
  const candidate = JSON.parse(localStorage.getItem(saveKey) || 'null');
  if (
    candidate?.version === 1 &&
    LEVELS[candidate.levelId] &&
    Array.isArray(candidate.actions) &&
    candidate.actions.length <= 1000
  ) {
    let replay = createGame(candidate.levelId);
    for (const command of candidate.actions) {
      const result = act(replay, command);
      if (!result.ok || command.type === 'restart') throw new Error('Invalid saved action');
      replay = result.state;
    }
    if (replay.status === 'playing' && candidate.actions.length)
      saved = { state: replay, actions: candidate.actions };
  }
} catch {
  /* Storage can be disabled in an embedded or private browser. */
}

function persist() {
  try {
    if (state.status === 'playing')
      localStorage.setItem(
        saveKey,
        JSON.stringify({ version: 1, levelId: state.levelId, actions: history }),
      );
    else localStorage.removeItem(saveKey);
    storageAvailable = true;
  } catch {
    storageAvailable = false;
    /* Gameplay remains fully available without local storage. */
  }
}

function sound(type) {
  if (muted) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    const now = audio.currentTime;
    const oscillator = audio.createOscillator(),
      gain = audio.createGain();
    const pitches = {
      draw: 260,
      trace: 150,
      attack: 105,
      dry: 170,
      guard: 350,
      heal: 530,
      claim: 660,
      buy: 430,
      win: 780,
      hurt: 75,
      move: 210,
    };
    oscillator.type = ['attack', 'hurt'].includes(type) ? 'sawtooth' : 'triangle';
    oscillator.frequency.setValueAtTime(pitches[type] || 310, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      (pitches[type] || 310) * (type === 'win' ? 1.5 : 0.55),
      now + 0.16,
    );
    gain.gain.setValueAtTime(0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.24);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  } catch {
    /* Sound is optional. */
  }
}

function toast(message, error = false) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').className = `visible${error ? ' error' : ''}`;
  toastTimer = setTimeout(() => ($('#toast').className = ''), 4400);
}

function paintHud() {
  $('#game-root').dataset.started = String(started);
  $('#game-root').dataset.status = state.status;
  $('#game-root').dataset.ink = String(state.ink);
  $('#ink-value').textContent = state.ink;
  $('#ink-fill').style.width = `${(state.ink / state.maxInk) * 100}%`;
  $('#ink-fill').style.background = state.ink < 15 ? '#bb886c' : '';
  $('.ink-track').setAttribute('aria-valuenow', state.ink);
  $('.ink-track').setAttribute('aria-valuemax', state.maxInk);
  $('#hearts').innerHTML = Array.from({ length: state.maxHp }, (_, i) =>
    icon('heart').replace('<svg', `<svg class="${i >= state.hp ? 'empty' : ''}"`),
  ).join('');
  $('#hearts').dataset.label = `生命 ${state.hp} / ${state.maxHp}`;
  $('#hearts').setAttribute('aria-label', `生命 ${state.hp} / ${state.maxHp}`);
  $('#seal-value').textContent = state.seals;
  $('#sound').setAttribute('aria-label', muted ? '开启声音' : '静音');
  $('#sound').setAttribute('aria-pressed', String(muted));
  $('#sound').innerHTML = icon(muted ? 'muted' : 'sound');
  $('#location-name').textContent = getRoom(state).name;
  $('#map-progress').textContent =
    `已绘 ${state.stats.roomsRevealed} / ${Object.keys(state.rooms).length}`;
  $('#turn-label').textContent = started
    ? `第 ${String(state.turn).padStart(2, '0')} 笔 · ${fighting() ? '交锋中' : '探索中'}`
    : '落笔之前';
  $('#objectives').innerHTML = [
    `找到两枚失落的钥印 ${state.seals}/2`,
    '抵达北方的古老拱门',
    '击败门后的守门者',
  ]
    .map(
      (text, i) =>
        `<li class="${[state.seals >= 2, state.gateUnlocked, state.status === 'won'][i] ? 'done' : ''}">${text}</li>`,
    )
    .join('');
}

function paintMap() {
  const rooms = Object.values(state.rooms),
    current = getRoom(state);
  $('#map-art').innerHTML = renderScene({
    rooms,
    links: level().links,
    currentRoomId: state.roomId,
    revealed: rooms.filter((room) => room.revealed).map((room) => room.id),
    cleared: rooms.filter((room) => room.cleared).map((room) => room.id),
    selectedRoomId: selected,
    combat: current.enemy?.hp > 0 ? { ...current.enemy, intent: getIntent(state) } : null,
    time: state.turn,
  });
  $('#map-nodes').innerHTML = rooms
    .map((room) => {
      const adjacent = current.exits.includes(room.id),
        known = room.revealed || adjacent || room.kind === 'boss';
      if (!known) return '';
      const reachable = adjacent && !fighting() && state.status === 'playing';
      const selectable = reachable || room.id === state.roomId;
      return `<button class="room-node ${reachable ? 'reachable' : ''} ${room.id === selected ? 'selected' : ''} ${room.id === state.roomId ? 'current' : ''}" data-room="${room.id}" aria-label="${esc(room.name)}${room.id === state.roomId ? '，当前所在，查看房间' : reachable ? '，可前往' : '，暂不可抵达'}" aria-pressed="${room.id === selected}" ${!selectable ? 'disabled' : ''}><span class="room-name">${room.id === state.roomId ? '· ' : ''}${esc(room.name)}</span>${adjacent && !room.revealed ? `<small>${room.reward?.seals ? '◆ 钥印' : room.kind === 'merchant' ? '墨水交易' : room.reward ? esc(room.rewardText) : room.kind === 'boss' ? '最终试炼' : '安全通路'}</small>` : ''}</button>`;
    })
    .join('');
  positionNodes();
}

function positionNodes() {
  const { width, height } = $('.map-viewport').getBoundingClientRect();
  const scale = Math.min(width / 1100, height / 660);
  const offsetX = (width - 1100 * scale) / 2,
    offsetY = (height - 660 * scale) / 2;
  document.querySelectorAll('.room-node').forEach((button) => {
    const room = state.rooms[button.dataset.room];
    button.style.left = `${offsetX + (100 + room.x * 9) * scale}px`;
    button.style.top = `${offsetY + (90 + room.y * 5) * scale}px`;
  });
}

const illustration = (name) => `<div class="encounter-illustration">${renderVignette(name)}</div>`;
const reward = (room) =>
  `<div class="reward-preview"><span>这 条 路 的 回 报</span>${esc(room.rewardText)}</div>`;

function paintEncounter() {
  const panel = $('#encounter'),
    room = getRoom(state);
  if (!started) {
    panel.innerHTML = `<div class="encounter-kicker"><span>给 初 次 执 笔 的 你</span><span>✦</span></div><h2>故事，始于一滴。</h2>${illustration('map')}<p class="encounter-copy">你是一位迷失在旧书中的绘图师。用墨画出前路，找回两枚钥印，穿过最后的墨之门。</p><div class="reward-preview"><span>随 身 行 囊</span>72 滴墨水 · 5 点生命 · 一支旧笔</div><div class="context-actions"><button id="start-game" class="primary-button">${saved ? '继续上次旅程' : '开始落笔'} ${icon('arrow')}</button>${saved ? '<button id="fresh-game" class="secondary-button">从空白页开始</button>' : ''}<p class="context-footnote">点地图选路，或拖动旅人绘出相邻房间。<br>回合制，无倒计时。每一步都可以慢慢想。</p></div>`;
    return;
  }
  if (state.status !== 'playing') {
    panel.innerHTML = `<div class="encounter-kicker">这 一 页 的 终 章</div><h2>${state.status === 'won' ? '门后，还有世界。' : '下一笔，会更好。'}</h2>${illustration(state.status === 'won' ? 'map' : 'heal')}<p class="encounter-copy">${state.status === 'won' ? '你为这张空白的纸，写出了属于自己的归途。' : '失误也会留在纸上。记住敌人的意图，重新分配你的墨水。'}</p><div class="context-actions"><button id="show-result" class="primary-button">翻阅旅程手记</button><button data-action="restart" class="secondary-button">重新落笔</button></div>`;
    return;
  }
  if (fighting()) {
    const enemy = room.enemy,
      intent = getIntent(state);
    const buttons = ['attack', 'dry', 'guard', 'heal']
      .map((type) => {
        const option = findOption(type);
        return `<button ${optionAttributes(option)} class="${type === 'attack' ? 'ink-attack' : ''}">${option.label}<small>${type === 'attack' ? `${state.contracts.includes('fine-nib') ? 6 : 4} 伤害 · ${option.cost} 墨` : type === 'dry' ? `${1 + state.focus} 伤害 · 免费` : type === 'guard' ? '挡伤 → 专注' : `${option.cost} 墨 · 回生命`}</small></button>`;
      })
      .join('');
    panel.innerHTML = `<div class="encounter-kicker"><span>${room.kind === 'boss' ? '最 终 试 炼' : '遭 遇 墨 灵'}</span><span>交锋</span></div><h2>${esc(enemy.name)}</h2>${illustration('attack')}<div class="enemy-hp"><span>敌方生命</span><b>${enemy.hp} / ${enemy.maxHp}</b></div><div class="enemy-health"><i style="width:${(enemy.hp / enemy.maxHp) * 100}%"></i></div><div class="enemy-intent">下一步：${esc(intent.name)} · ${intent.damage ? `造成 ${intent.damage} 伤害` : '不会攻击'}<small>${esc(intent.tell)}</small></div><div class="combat-actions">${buttons}</div><p class="focus-badge">${state.focus ? `✦ 专注 ${state.focus}：下一次干笔造成 ${1 + state.focus} 伤害` : '成功防守 → 下次干笔伤害提升至 3'}</p><p class="quick-note">出手后敌人会执行上方意图。<br><b>蓄墨时进攻，攻击时防守。</b></p>`;
    return;
  }
  const target = selected && selected !== state.roomId ? state.rooms[selected] : null;
  if (target && room.exits.includes(target.id)) {
    const primary = findOption(target.revealed ? 'move' : 'draw', target.id),
      trace = findOption('trace', target.id);
    panel.innerHTML = `<div class="encounter-kicker"><span>${target.revealed ? '重 访 已 绘 之 地' : '未 知 的 下 一 页'}</span><span>${target.revealed ? '已绘' : '待绘'}</span></div><h2>${esc(target.name)}</h2>${illustration(target.kind === 'merchant' ? 'trade' : target.enemy ? 'attack' : target.kind === 'spring' ? 'heal' : 'map')}<p class="encounter-copy">${esc(target.hint)}</p>${reward(target)}<div class="context-actions"><button id="primary-action" class="primary-button" ${optionAttributes(primary)}>${target.revealed ? '沿旧路前往 · 免费' : `绘出这条路 · ${primary.cost} 墨`} ${icon('arrow')}</button>${trace ? `<button class="secondary-button" ${optionAttributes(trace)}>干笔摸索 · 0 墨</button><p class="context-footnote">${primary.reason ? `${esc(primary.reason)}<br>` : ''}摸索多用一回合，擦伤 1 生命（最低留 1）${target.enemy ? '；敌人生命 +2' : ''}。</p>` : ''}</div>`;
    return;
  }
  const claim = findOption('claim'),
    unlock = findOption('unlock'),
    buys = options().filter((option) => option.type === 'buy');
  const routes = room.exits
    .map((id) => `<button data-select="${id}">${esc(state.rooms[id].name)} →</button>`)
    .join('');
  panel.innerHTML = `<div class="encounter-kicker"><span>当 前 所 在</span><span>${room.claimed ? '已领取' : '已绘'}</span></div><h2>${esc(room.name)}</h2>${illustration(room.kind === 'merchant' ? 'trade' : room.kind === 'spring' ? 'heal' : 'map')}<p class="encounter-copy">${esc(room.description)}</p>${room.reward && !room.claimed ? reward(room) : ''}${buys.length ? buys.map((option) => `<button class="contract-option" ${optionAttributes(option)}><strong>${esc(option.label)}<span>${option.reason === '已签订' ? '✓ 已签订' : `${option.cost} 墨`}</span></strong><small>${esc(option.description)}</small></button>`).join('') : ''}${state.contracts.length && room.kind === 'merchant' ? `<p class="active-contracts">契约将持续生效至本次旅程结束。</p>` : ''}<div class="context-actions">${claim ? `<button id="primary-action" class="primary-button" ${optionAttributes(claim)}>${claim.enabled ? claim.label : claim.reason} · 免费</button><p class="context-footnote">${esc(claim.description)}</p>` : ''}${unlock ? `<button id="primary-action" class="primary-button" ${optionAttributes(unlock)}>${unlock.enabled ? unlock.label : unlock.reason} ${icon('key')}</button>` : ''}<p class="quick-note">${claim && !room.claimed ? '领取后选择下一条路，也可以稍后回来。' : '点选地图，或选择相邻的下一站：'}</p><div class="route-buttons">${routes}</div></div>`;
}

function paintCards() {
  const attack = findOption('attack'),
    heal = findOption('heal');
  const data = [
    {
      number: '01',
      name: '绘出前路',
      en: 'REVEAL THE UNKNOWN',
      type: 'map',
      text: '让未知显形，寻找藏在<br>留白深处的馈赠。',
      cost: `${state.contracts.includes('wayfinder') ? 4 : 6} 墨 / 新区域`,
      disabled: started && (fighting() || state.status !== 'playing'),
    },
    {
      number: '02',
      name: '以墨为刃',
      en: 'MAKE YOUR MARK',
      type: 'attack',
      text: '一笔击退墨灵。<br>读懂意图，再落笔。',
      cost: '5 墨 / 次攻击',
      disabled: started && !attack?.enabled,
    },
    {
      number: '03',
      name: '缝合伤口',
      en: 'MEND THE WOUNDS',
      type: 'heal',
      text: '用未写完的故事，<br>换一次继续前行。',
      cost: `8 墨 / +${state.contracts.includes('binding') ? 3 : 2} 生命`,
      disabled: started && !heal?.enabled,
    },
    {
      number: '04',
      name: '签下契约',
      en: 'A PRICE IN INK',
      type: 'trade',
      text: '以墨交换更强的力量。<br>每一份契约，都有代价。',
      cost: '10–12 墨 / 份契约',
      disabled: started && (fighting() || state.status !== 'playing'),
    },
  ];
  $('#action-cards').innerHTML = data
    .map(
      (card) =>
        `<button class="action-card" data-card="${card.type}" ${card.disabled ? 'disabled' : ''} aria-label="${card.name}，${card.cost}"><div><header><span class="action-num">${card.number}</span><div><h3>${card.name}</h3><span class="action-en">${card.en}</span></div></header><p>${card.text}</p><span class="cost">${icon('ink')}${card.cost}</span></div><div class="card-art">${renderVignette(card.type)}</div></button>`,
    )
    .join('');
}

function render() {
  paintHud();
  paintMap();
  paintEncounter();
  paintCards();
}

function paintEffects(events) {
  const svg = $('#map-art > svg');
  if (!svg) return;
  const room = getRoom(state),
    x = 100 + room.x * 9,
    y = 90 + room.y * 5;
  const attack = events.find((event) => event.type === 'attack');
  const healing = events.find((event) => event.type === 'heal');
  const blocking = events.some((event) => event.type === 'block');
  if (!attack && !healing && !blocking) return;
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.setAttribute('class', 'scene-effect');
  if (attack)
    group.innerHTML = `<path class="ink-slash" d="M${x - 42} ${y - 21}Q${x - 16} ${y - 48} ${x + 25} ${y - 20}" fill="none" stroke="#1b211a" stroke-width="${attack.method === 'attack' ? 9 : 3}" stroke-linecap="round" pathLength="1"/><text class="floating-feedback" x="${x + 15}" y="${y - 62}" fill="#923e2c">−${attack.damage}</text>`;
  else if (healing)
    group.innerHTML = `<circle class="heal-ring" cx="${x - 30}" cy="${y - 10}" r="33" fill="none" stroke="#5b7849" stroke-width="3"/><text class="floating-feedback" x="${x - 30}" y="${y - 62}" fill="#4d6b36">+${healing.amount}</text>`;
  else
    group.innerHTML = `<path class="heal-ring" d="m${x - 47} ${y - 57} 24 9-4 33-20 17-20-17-4-33Z" fill="#a9b19577" stroke="#4d6440" stroke-width="3"/><text class="floating-feedback" x="${x - 45}" y="${y - 70}" fill="#4d6b36">挡下</text>`;
  svg.append(group);
  setTimeout(() => group.remove(), 850);
}

function perform(command) {
  if ($('#modal').open || actionLocked) return;
  if (!started) {
    start();
    return;
  }
  if (command.type === 'restart') {
    restart();
    return;
  }
  const oldHp = state.hp,
    result = act(state, command);
  if (!result.ok) {
    toast(result.message, true);
    return;
  }
  state = result.state;
  history.push({ type: command.type, ...(command.target ? { target: command.target } : {}) });
  selected = null;
  actionLocked = true;
  clearTimeout(lockTimer);
  lockTimer = setTimeout(() => {
    actionLocked = false;
  }, 180);
  render();
  persist();
  paintEffects(result.events);
  toast(result.message, state.hp < oldHp);
  sound(state.hp < oldHp ? 'hurt' : command.type);
  if (['draw', 'trace'].includes(command.type)) {
    $('.map-panel').classList.remove('reveal-effect');
    requestAnimationFrame(() => $('.map-panel').classList.add('reveal-effect'));
  }
  if (state.hp < oldHp) {
    $('#hearts').classList.remove('shake');
    requestAnimationFrame(() => $('#hearts').classList.add('shake'));
  }
  if (state.status !== 'playing') {
    sound(state.status === 'won' ? 'win' : 'hurt');
    showResult();
  }
}

function start(fresh = false) {
  if (saved && !fresh) {
    state = saved.state;
    history = saved.actions;
    selected = null;
  } else {
    state = createGame();
    history = [];
    selected = 'crossing';
  }
  saved = null;
  started = true;
  actionLocked = false;
  render();
  persist();
  sound('draw');
  toast('先选择一条相邻路线。绘路花墨，摸索耗血；每一步都由你决定。');
}

function chooseRoom(id) {
  if ($('#modal').open) return;
  if (!started) {
    start();
  }
  if (id === state.roomId) {
    selected = null;
    paintMap();
    paintEncounter();
    paintCards();
    return;
  }
  if (fighting()) {
    toast('先解决眼前的墨灵，再继续前行。');
    return;
  }
  if (!getRoom(state).exits.includes(id)) return;
  selected = id;
  paintMap();
  paintEncounter();
  paintCards();
  sound('move');
}

// Drawing is an alternative to selecting a destination and pressing its button.
// A stroke must start on the traveler and finish on a legal adjacent room.
const nodeLayer = $('#map-nodes');
function endStroke(event, cancelled = false) {
  if (!brushDrag || (event && brushDrag.pointerId !== event.pointerId)) return;
  const stroke = brushDrag;
  const target =
    event && document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-room]');
  brushDrag = null;
  $('#brush-trail').setAttribute('points', '');
  document.querySelectorAll('.drag-target').forEach((node) => node.classList.remove('drag-target'));
  if (nodeLayer.hasPointerCapture(stroke.pointerId))
    nodeLayer.releasePointerCapture(stroke.pointerId);
  // Pointer capture targets the layer, so a tap needs its own room selection.
  if (!stroke.moved) {
    if (!cancelled) chooseRoom(state.roomId);
    return;
  }
  suppressClickUntil = performance.now() + 350;
  if (cancelled || !target) return;
  const id = target.dataset.room;
  if (!getRoom(state).exits.includes(id)) {
    toast('把笔迹连到一个相邻的房间。');
    return;
  }
  const type = state.rooms[id].revealed ? 'move' : 'draw';
  perform({ type, target: id });
}
nodeLayer.addEventListener('pointerdown', (event) => {
  if (
    !started ||
    fighting() ||
    state.status !== 'playing' ||
    $('#modal').open ||
    event.button !== 0 ||
    brushDrag
  )
    return;
  const node = event.target.closest('[data-room]');
  if (node?.dataset.room !== state.roomId) return;
  const rect = $('.map-viewport').getBoundingClientRect();
  brushDrag = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    rect,
    moved: false,
    points: [[event.clientX - rect.left, event.clientY - rect.top]],
  };
  $('#map-drag-layer').setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
  nodeLayer.setPointerCapture(event.pointerId);
});
nodeLayer.addEventListener(
  'pointermove',
  (event) => {
    if (!brushDrag || brushDrag.pointerId !== event.pointerId) return;
    if (
      !brushDrag.moved &&
      Math.hypot(event.clientX - brushDrag.x, event.clientY - brushDrag.y) < 9
    )
      return;
    event.preventDefault();
    brushDrag.moved = true;
    brushDrag.points.push([
      event.clientX - brushDrag.rect.left,
      event.clientY - brushDrag.rect.top,
    ]);
    $('#brush-trail').setAttribute(
      'points',
      brushDrag.points.map((point) => point.join(',')).join(' '),
    );
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-room]');
    document
      .querySelectorAll('.drag-target')
      .forEach((node) => node.classList.remove('drag-target'));
    if (target && getRoom(state).exits.includes(target.dataset.room))
      target.classList.add('drag-target');
  },
  { passive: false },
);
nodeLayer.addEventListener('pointerup', (event) => endStroke(event));
nodeLayer.addEventListener('pointercancel', (event) => endStroke(event, true));
nodeLayer.addEventListener('lostpointercapture', (event) => endStroke(event, true));

function activateCard(type) {
  if (!started) {
    start();
    return;
  }
  if (type === 'attack' || type === 'heal') {
    perform({ type });
    return;
  }
  if (type === 'map') {
    if (selected) {
      const option = findOption(state.rooms[selected].revealed ? 'move' : 'draw', selected);
      if (option) {
        perform({ type: option.type, target: selected });
        return;
      }
    }
    toast('选择地图上带虚线标记的相邻房间，再绘出这条路。');
    $('.room-node.reachable')?.focus();
  }
  if (type === 'trade') {
    if (state.roomId === 'market') {
      selected = null;
      paintEncounter();
    } else if (getRoom(state).exits.includes('market')) chooseRoom('market');
    else toast('契约师在地图南侧。沿断句长廊或留白石桥前往。');
  }
}

function openModal(content) {
  lastFocus = document.activeElement;
  $('#modal-content').innerHTML = content;
  if (!$('#modal').open) $('#modal').showModal();
  $('#modal-close').focus();
}
function closeModal() {
  $('#modal').close();
}
$('#modal').addEventListener('close', () => {
  if (lastFocus?.isConnected) lastFocus.focus();
});
$('#modal-close').onclick = closeModal;
$('#modal').addEventListener('click', (event) => {
  if (event.target === $('#modal')) {
    const rect = $('#modal').getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      closeModal();
  }
});

function showHelp() {
  openModal(
    `<span class="modal-kicker">A TRAVELER’S FIELD GUIDE</span><h2 id="modal-title">每一滴，都有去处。</h2><p>收集两枚钥印，在终页门廊开启墨之门，然后击败守门者。<br>这是回合制游戏：你不行动，敌人也不会行动。</p><ul class="help-list"><li><b>① 绘路：</b>选相邻房间，花 6 墨安全进入。免费摸索用 2 回合并擦伤 1 生命（最低留 1），遇敌时敌人生命 +2。</li><li><b>② 交锋：</b>墨弹 5 墨造成 4 伤害；干笔免费。每次行动后，敌人执行预告的意图。成功防守完全挡伤，并让下一次干笔造成 3 伤害。</li><li><b>③ 疗伤：</b>花 8 墨恢复 2 生命。战斗中治疗也会触发敌人行动；洗笔泉则提供一次免费恢复。</li><li><b>④ 签约：</b>在无名契约师处花墨购买永久能力。支路藏有补给，清理房间后记得点“收下馈赠”。</li><li><b>操作：</b>点击选路，或按住旅人拖到相邻房间直接绘路；1 绘路，2 墨弹，3 治疗，4 契约；A 干笔、D 防守，Esc 暂停。触屏直接点击按钮。进度保存在此浏览器。</li></ul><button class="primary-button" data-close>带上这页手记</button>`,
  );
}
function pause() {
  if ($('#modal').open) {
    closeModal();
    return;
  }
  openModal(
    `<span class="modal-kicker">A MOMENT BETWEEN THE LINES</span><h2 id="modal-title">让墨，歇一会儿。</h2><p>纸上的世界正在等你。<br>${!started ? '落笔之前，先让心静下来。' : state.status !== 'playing' ? '这一页已经结束，新的故事等你落笔。' : storageAvailable ? '当前旅程已自动保存在此浏览器。' : '浏览器未能保存进度，请保持此页面打开。'}</p><button class="primary-button" data-close>继续旅程</button><button class="secondary-button" id="modal-sound">${muted ? '开启声音' : '关闭声音'}</button><button class="secondary-button" id="pause-restart">重新落笔</button>`,
  );
}
function restart() {
  if (!saved && (!started || state.turn === 0 || state.status !== 'playing')) {
    closeModal();
    start(true);
    return;
  }
  openModal(
    `<span class="modal-kicker">A NEW BLANK PAGE</span><h2 id="modal-title">重写这一页？</h2><p>本次旅程将被新的空白页替代。<br>你会带着 72 墨水和完整生命重新出发。</p><button id="confirm-restart" class="primary-button">重新落笔</button><button class="secondary-button" data-close>保留当前旅程</button>`,
  );
}
function showResult() {
  const summary = state.summary,
    won = state.status === 'won';
  const spent = summary.spent;
  openModal(
    `<span class="modal-kicker">THE END OF CHAPTER ONE</span><span class="stamp">${won ? '此页已成' : '未完待续'}</span><h2 id="modal-title">${won ? '你写出了，下一页。' : '墨尽之前，再想一步。'}</h2><p>${won ? `墨之门在你身后合拢。你的故事被记作「${esc(summary.title)}」。` : '不是每一笔都要进攻。观察敌人的预告，在危险的回合防守，也可以留些墨给疗伤。'}</p><div class="result-stats"><div><strong>${summary.turns}</strong><span>行动回合</span></div><div><strong>${summary.explored}/${summary.totalRooms}</strong><span>探索房间</span></div><div><strong>${summary.inkRemaining}</strong><span>剩余墨水</span></div></div><p class="allocation-label">你把墨，花在了哪里</p><div class="allocation">${Object.values(
      spent,
    )
      .map((value) => `<i style="flex:${value || 0.01}"></i>`)
      .join(
        '',
      )}</div><div class="allocation-label">探索 ${spent.explore} · 战斗 ${spent.attack} · 治疗 ${spent.heal} · 交易 ${spent.trade}</div><p>${won ? `${esc(summary.efficiency)}。下一次，试着把墨交给另一条路。` : '干笔与防守不消耗墨水，墨水见底也能继续。'}</p><button id="result-restart" class="primary-button">再写一种结局 ${icon('arrow')}</button><button class="secondary-button" data-close>留在这张地图</button>`,
  );
}

function toggleSound() {
  muted = !muted;
  try {
    localStorage.setItem('ink-is-everything:muted', String(muted));
  } catch {}
  paintHud();
  sound('claim');
  if ($('#modal-sound')) $('#modal-sound').textContent = muted ? '开启声音' : '关闭声音';
}
$('#sound').onclick = toggleSound;
$('#help').onclick = showHelp;
$('#pause').onclick = pause;
$('#restart').onclick = restart;
$('.wordmark').onclick = (event) => {
  event.preventDefault();
  showHelp();
};
document.addEventListener('click', (event) => {
  if (event.detail !== 0 && performance.now() < suppressClickUntil) return;
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.id === 'start-game') start();
  else if (button.id === 'fresh-game') restart();
  else if (button.id === 'show-result') showResult();
  else if (button.id === 'confirm-restart' || button.id === 'result-restart') {
    closeModal();
    start(true);
  } else if (button.id === 'pause-restart') restart();
  else if (button.id === 'modal-sound') toggleSound();
  else if (button.hasAttribute('data-close')) closeModal();
  else if (button.dataset.room || button.dataset.select)
    chooseRoom(button.dataset.room || button.dataset.select);
  else if (button.dataset.action)
    perform({
      type: button.dataset.action,
      ...(button.dataset.target ? { target: button.dataset.target } : {}),
    });
  else if (button.dataset.card) activateCard(button.dataset.card);
});
document.addEventListener('keydown', (event) => {
  if (
    event.repeat ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)
  )
    return;
  if (event.key === 'Escape') {
    if (!$('#modal').open) {
      event.preventDefault();
      pause();
    }
    return;
  }
  if ($('#modal').open) return;
  const key = event.key.toLowerCase();
  const card = { 1: 'map', 2: 'attack', 3: 'heal', 4: 'trade' }[key];
  if (card) {
    event.preventDefault();
    if (!$(`[data-card="${card}"]`)?.disabled) activateCard(card);
  } else if (started && ['a', 'd'].includes(key)) {
    event.preventDefault();
    perform({ type: key === 'a' ? 'dry' : 'guard' });
  }
});
new ResizeObserver(positionNodes).observe($('.map-viewport'));
document
  .querySelectorAll('[data-icon]')
  .forEach((element) => (element.innerHTML = icon(element.dataset.icon)));
render();
