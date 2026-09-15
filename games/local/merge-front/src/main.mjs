import './style.css';
import { HEROES, WEAPONS, OFFERS, SYNERGY_NAMES } from './content.mjs';
import {
  createGame,
  recruit,
  moveItem,
  startBattle,
  tick,
  recycle,
  repair,
  surge,
  isAwake,
  itemName,
  getLinks,
  getProductionTime,
} from './engine.mjs';
import { drawBattle, drawPortrait } from './render.mjs';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const storageKey = 'merge-front:preferences:v1';
let saved = {};
try {
  const parsed = JSON.parse(localStorage.getItem(storageKey) || '{}');
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed;
  if (!saved.wins || typeof saved.wins !== 'object' || Array.isArray(saved.wins)) saved.wins = {};
} catch {
  /* Storage can be unavailable inside an embedded browser. */
}
let state = createGame(),
  selection = null,
  difficulty = 'normal',
  shopTab = 'hero',
  speed = 1;
let drag = null,
  suppressedCell = null,
  suppressClickUntil = 0,
  toastTimer = 0,
  lastFrame = 0,
  lastHud = 0,
  lastEvent = 0;
let audioContext,
  audioEnabled = saved.sound === true,
  restorePause = false,
  lastImpact = 0,
  lastImpactAt = 0;
const portraits = new Map();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const battleCanvas = $('#battle');
const battleContext = battleCanvas.getContext('2d');
const welcomeContext = $('#welcome-art').getContext('2d');

function savePreferences() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(saved));
  } catch {
    /* The current game remains playable without storage. */
  }
}
function notify(message) {
  if (!message) return;
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2900);
}
function unlockAudio() {
  if (!audioEnabled) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') void audioContext.resume().catch(() => {});
  } catch {
    audioEnabled = false;
    updateSound();
  }
}
function sound(type = 'click') {
  if (!audioEnabled || !audioContext || audioContext.state !== 'running') return;
  const notes = {
    click: [470],
    hit: [150],
    recruit: [430, 570],
    merge: [390, 520, 780],
    ultimate: [170, 340, 680],
    wave: [260, 330],
    won: [390, 520, 650, 780],
    lost: [330, 260, 190],
    produce: [580],
  }[type] || [420];
  notes.forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator(),
      gain = audioContext.createGain();
    const start = audioContext.currentTime + index * 0.075;
    oscillator.type = ['ultimate', 'lost'].includes(type) ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.85, start + 0.16);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(
      ['produce', 'hit'].includes(type) ? 0.016 : 0.045,
      start + 0.012,
    );
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.24);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  });
}
function updateSound() {
  $('#sound-button').setAttribute('aria-pressed', String(audioEnabled));
  $('#sound-button').setAttribute('aria-label', audioEnabled ? '关闭声音' : '开启声音');
  $('#sound-button').textContent = audioEnabled ? '♫' : '♪';
}
function showDialog(dialog) {
  cancelDrag();
  if (!dialog.open) dialog.showModal();
  document.body.classList.add('modal-open');
}
function closeDialog(dialog) {
  dialog.close();
  if (!$('dialog[open]')) document.body.classList.remove('modal-open');
}
function chooseMode(mode) {
  $$('dialog[open]').forEach(closeDialog);
  state = createGame(mode, difficulty);
  selection = null;
  lastEvent = 0;
  lastImpact = 0;
  speed = 1;
  lastFrame = 0;
  $('#speed-button').textContent = '1×';
  $('#speed-button').setAttribute('aria-label', '切换速度，当前1倍');
  shopTab = 'hero';
  renderShop();
  refresh();
  unlockAudio();
  sound();
}
function home() {
  state.paused = true;
  $$('dialog[open]').forEach(closeDialog);
  showDialog($('#welcome'));
}
function pause() {
  cancelDrag();
  if ($('dialog[open]') || ['won', 'lost'].includes(state.phase)) return;
  state.paused = true;
  showDialog($('#pause-dialog'));
  refreshHud();
}
function resume() {
  state.paused = false;
  lastFrame = 0;
  closeDialog($('#pause-dialog'));
  refreshHud();
  unlockAudio();
}
function openGuide() {
  if ($('#welcome').open || $('#result').open) return;
  restorePause = state.paused;
  state.paused = true;
  showDialog($('#guide'));
}
function closeGuide() {
  closeDialog($('#guide'));
  state.paused = restorePause;
  lastFrame = 0;
}
function runAction(action) {
  unlockAudio();
  const result = action();
  notify(result.message);
  if (result.ok) sound('click');
  refresh();
  return result;
}
function locOf(element) {
  return { zone: element.dataset.zone, index: Number(element.dataset.index) };
}
function sameLoc(a, b) {
  return Boolean(a && b && a.zone === b.zone && a.index === b.index);
}
function itemAt(loc) {
  return loc ? state[loc.zone]?.[loc.index] : null;
}
function cellAt(loc) {
  return $(`[data-zone="${loc.zone}"][data-index="${loc.index}"]`);
}
function tapCell(element) {
  if (
    (element === suppressedCell && performance.now() < suppressClickUntil) ||
    state.paused ||
    ['won', 'lost'].includes(state.phase)
  )
    return;
  const loc = locOf(element);
  if (selection && !sameLoc(selection, loc)) {
    const result = runAction(() => moveItem(state, selection, loc));
    if (result.ok) selection = loc;
  } else selection = sameLoc(selection, loc) ? null : itemAt(loc) ? loc : null;
  renderCells();
  renderSelection();
}
function cancelDrag() {
  if (drag) {
    drag.element.classList.remove('dragging');
    try {
      if (drag.element.hasPointerCapture(drag.pointerId))
        drag.element.releasePointerCapture(drag.pointerId);
    } catch {
      /* A cancelled pointer may already be released. */
    }
  }
  drag = null;
  $('#drag-ghost').style.display = 'none';
  $$('.drop-target').forEach((element) => element.classList.remove('drop-target'));
}
function onPointerDown(event) {
  const element = event.currentTarget;
  if (
    !event.isPrimary ||
    event.button !== 0 ||
    drag ||
    state.paused ||
    !itemAt(locOf(element)) ||
    ['won', 'lost'].includes(state.phase)
  )
    return;
  drag = {
    element,
    from: locOf(element),
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    moved: false,
  };
  element.setPointerCapture(event.pointerId);
}
function onPointerMove(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 7) return;
  event.preventDefault();
  if (!drag.moved) {
    drag.moved = true;
    drag.element.classList.add('dragging');
    const ghost = $('#drag-ghost');
    ghost.replaceChildren();
    const canvas = document.createElement('canvas');
    canvas.width = 80;
    canvas.height = 80;
    drawPortrait(canvas.getContext('2d'), itemAt(drag.from), state.time, {
      size: 80,
      selected: true,
    });
    ghost.append(canvas, document.createTextNode(itemName(itemAt(drag.from))));
    ghost.style.display = 'block';
  }
  $('#drag-ghost').style.left = `${event.clientX}px`;
  $('#drag-ghost').style.top = `${event.clientY}px`;
  $$('.drop-target').forEach((element) => element.classList.remove('drop-target'));
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.cell');
  if (target && target !== drag.element) target.classList.add('drop-target');
}
function onPointerUp(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const current = drag;
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.cell');
  cancelDrag();
  if (!current.moved) return;
  suppressClickUntil = performance.now() + 350;
  suppressedCell = current.element;
  if (target) {
    const to = locOf(target);
    const result = runAction(() => moveItem(state, current.from, to));
    selection = result.ok ? to : current.from;
    renderCells();
    renderSelection();
  }
}
function makeCells(zone, count) {
  const container = $(`#${zone}`);
  for (let index = 0; index < count; index++) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cell empty';
    button.dataset.zone = zone;
    button.dataset.index = String(index);
    button.addEventListener('click', () => tapCell(button));
    button.addEventListener('pointerdown', onPointerDown);
    button.addEventListener('pointermove', onPointerMove);
    button.addEventListener('pointerup', onPointerUp);
    button.addEventListener('pointercancel', () => {
      suppressClickUntil = performance.now() + 350;
      suppressedCell = button;
      cancelDrag();
    });
    container.append(button);
  }
}
function renderCells() {
  const links = getLinks(state);
  for (const zone of ['board', 'reserve']) {
    state[zone].forEach((item, index) => {
      const button = cellAt({ zone, index });
      const linked =
        zone === 'board' &&
        links.some((link) => link.heroIndex === index || link.weaponIndex === index);
      const signature = JSON.stringify([
        item?.id,
        item?.key,
        item?.parts,
        item?.level,
        item?.weapon,
        linked,
      ]);
      const selected = sameLoc(selection, { zone, index });
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('occupied', Boolean(item));
      button.classList.toggle('empty', !item);
      button.setAttribute(
        'aria-label',
        `${zone === 'board' ? '部署台' : '候补席'}第${index + 1}格，${itemName(item)}${item && isAwake(item) ? `，${item.level}星` : ''}${item?.weapon || linked ? '，神机联动' : ''}`,
      );
      if (button.dataset.signature !== signature) {
        const oldCanvas = button.querySelector('canvas');
        if (oldCanvas) portraits.delete(oldCanvas);
        button.dataset.signature = signature;
        button.replaceChildren();
        if (!item) {
          const number = document.createElement('span');
          number.className = 'cell-index';
          number.textContent = String(index + 1).padStart(2, '0');
          button.append(number);
        } else {
          const canvas = document.createElement('canvas');
          canvas.width = 160;
          canvas.height = 160;
          canvas.setAttribute('aria-hidden', 'true');
          portraits.set(canvas, { zone, index });
          button.append(canvas);
          const label = document.createElement('span');
          label.className = 'cell-label';
          label.textContent = itemName(item);
          button.append(label);
          if (isAwake(item)) {
            const stars = document.createElement('span');
            stars.className = 'cell-level';
            stars.textContent = '★'.repeat(item.level);
            button.append(stars);
          }
          if (linked || item.weapon) {
            const badge = document.createElement('span');
            badge.className = 'cell-link';
            badge.textContent = '联';
            button.append(badge);
          }
          const bar = document.createElement('span');
          bar.className = 'production-bar';
          button.append(bar);
        }
      }
    });
  }
  $('#reserve-count').textContent = `${state.reserve.filter(Boolean).length} / 6`;
}
function renderSelection() {
  const item = itemAt(selection);
  $('#recycle').disabled = !item || state.paused || ['won', 'lost'].includes(state.phase);
  if (!item) {
    $('#selected-name').textContent = state.mode === 'defense' ? '先唤醒哪吒' : '装配生产配方';
    $('#selected-description').textContent =
      state.mode === 'defense'
        ? '将候补席的「吒」拖到布阵台的「哪」上。名字齐了，神将才会醒来。'
        : '完整姓名才会生产。相邻或装备专属机关，等待更久，合体出阵。';
    $('#selected-link').textContent = '哪吒 ＋ 离火铳 → 莲焰机甲';
    return;
  }
  const definition = item.kind === 'hero' ? HEROES[item.key] : WEAPONS[item.key];
  $('#selected-name').textContent = itemName(item);
  $('#selected-description').textContent = isAwake(item)
    ? definition.description
    : `还缺「${HEROES[item.key].parts.filter((part) => !item.parts.includes(part)).join('」「')}」。名字补齐前保持沉睡，不能作战或生产。`;
  const linked =
    selection.zone === 'board' &&
    getLinks(state).some((link) => link.heroIndex === selection.index);
  const cycle = getProductionTime(item, linked);
  $('#selected-link').textContent =
    state.mode === 'attack' && Number.isFinite(cycle)
      ? `生产周期 ${cycle.toFixed(1)} 秒${linked || item.weapon ? ' · 合体出阵' : ' · 每轮一位'}`
      : item.kind === 'hero'
        ? `${HEROES[item.key].name} ＋ ${WEAPONS[HEROES[item.key].synergy].name} → ${SYNERGY_NAMES[item.key]}`
        : `${Object.values(HEROES).find((hero) => hero.synergy === item.key).name}的专属联动机关`;
  $('#recycle').textContent = `回收 +${Math.floor((item.value || 0) * 0.6)} 灵石 ↗`;
}
function addPortrait(container, item) {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 160;
  canvas.setAttribute('aria-hidden', 'true');
  container.append(canvas);
  portraits.set(canvas, { item });
}
function renderShop() {
  for (const canvas of $('#shop').querySelectorAll('canvas')) portraits.delete(canvas);
  $('#shop').replaceChildren();
  $$('[data-tab]').forEach((button) =>
    button.setAttribute('aria-selected', String(button.dataset.tab === shopTab)),
  );
  const definitions = shopTab === 'hero' ? HEROES : WEAPONS;
  for (const [key, definition] of Object.entries(definitions)) {
    const group = document.createElement('div');
    group.className = `offer-group ${shopTab === 'weapon' ? 'weapon-offer' : ''}`;
    const heading = document.createElement('div');
    heading.className = 'offer-heading';
    addPortrait(heading, {
      kind: shopTab,
      key,
      parts: definition.parts || [],
      level: 1,
      anim: 'idle',
      animTime: 1,
    });
    const title = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = definition.name;
    const small = document.createElement('small');
    small.textContent = definition.role || '专属联动机关';
    title.append(strong, small);
    heading.append(title);
    const badge = document.createElement('span');
    badge.textContent = shopTab === 'hero' ? `${definition.parts.length}字觉醒` : '天工造物';
    heading.append(badge);
    group.append(heading);
    if (shopTab === 'weapon') {
      const description = document.createElement('p');
      description.className = 'offer-description';
      description.textContent = definition.description;
      group.append(description);
    }
    const parts = document.createElement('div');
    parts.className = 'offer-parts';
    OFFERS.filter((offer) => offer.kind === shopTab && offer.key === key).forEach((offer) => {
      const button = document.createElement('button');
      button.className = 'offer-button';
      button.dataset.offer = offer.id;
      button.setAttribute('aria-label', `征兵 ${offer.name}，${offer.cost} 灵石`);
      const name = document.createElement('span');
      name.className = 'hanzi';
      name.textContent = offer.kind === 'weapon' ? '购入机关' : offer.name;
      const price = document.createElement('span');
      price.className = 'price';
      price.textContent = offer.cost;
      button.append(name, price);
      button.addEventListener('click', () => runAction(() => recruit(state, offer.id)));
      parts.append(button);
    });
    group.append(parts);
    $('#shop').append(group);
  }
  $('#shop-tip').textContent =
    shopTab === 'hero'
      ? '同一武将的残字叠在一起即可唤醒。两个同星完整武将，可合成更高星。'
      : '专属机关拖到神将身上合体，或在布阵台上下左右相邻联动；生产更慢，出阵更强。';
}
function renderGuide() {
  for (const [key, hero] of Object.entries(HEROES)) {
    const row = document.createElement('div');
    row.className = 'guide-roster-card';
    addPortrait(row, {
      kind: 'hero',
      key,
      parts: hero.parts,
      level: 2,
      weapon: hero.synergy,
      anim: 'idle',
      animTime: 1,
    });
    const text = document.createElement('div');
    const name = document.createElement('h3');
    name.textContent = `${hero.parts.join(' ＋ ')} → ${hero.name}`;
    const detail = document.createElement('p');
    detail.textContent = `${hero.role} · ${hero.skill}。${WEAPONS[hero.synergy].name} → ${SYNERGY_NAMES[key]}。${hero.description}`;
    text.append(name, detail);
    row.append(text);
    $('#guide-roster').append(row);
  }
}
function refreshHud() {
  const attacking = state.mode === 'attack';
  $('#game').dataset.phase = state.phase;
  $('#game').dataset.mode = state.mode;
  $('#mode-label').textContent = attacking ? '神机远征' : '云关守御';
  $('#phase-label').textContent = state.paused
    ? '暂时休整'
    : state.phase === 'setup'
      ? '准备布阵'
      : state.phase === 'running'
        ? state.intermission > 0
          ? '波间补给'
          : '交战中'
        : state.phase === 'won'
          ? '战局胜利'
          : '战局结束';
  $('#battle-eyebrow').textContent = attacking
    ? 'BREAK THE ENEMY CRYSTAL'
    : 'DEFEND THE CLOUD GATE';
  $('#battle-title').textContent = attacking ? '远征 · 向敌方灵晶进军' : '云关 · 守住这束光';
  $('#wave-caption').textContent = attacking ? '敌军强度' : '来袭波次';
  $('#wave').replaceChildren(
    document.createTextNode(String(Math.max(1, state.wave)).padStart(2, '0') + ' '),
  );
  const total = document.createElement('em');
  total.textContent = attacking ? '阶' : '/ 08';
  $('#wave').append(total);
  $('#coins').textContent = Math.floor(state.coins);
  $('#kills').textContent = state.kills;
  $('#core-hp').textContent = `${Math.ceil((state.coreHp / state.coreMax) * 100)}%`;
  $('#core-fill').style.width = `${(state.coreHp / state.coreMax) * 100}%`;
  $('#enemy-label').textContent = attacking ? '敌方灵晶' : '裂隙来敌';
  $('#enemy-hp').textContent = attacking
    ? `${Math.ceil((state.enemyCoreHp / state.enemyCoreMax) * 100)}%`
    : state.phase === 'setup'
      ? '待命'
      : `${state.units.filter((unit) => unit.side === 'enemy' && unit.hp > 0).length} 敌军`;
  $('#enemy-fill').style.width = attacking
    ? `${(state.enemyCoreHp / state.enemyCoreMax) * 100}%`
    : `${state.phase === 'setup' ? 0 : (state.wave / state.maxWaves) * 100}%`;
  $('#battle-clock').textContent =
    `${String(Math.floor(state.time / 60)).padStart(2, '0')}:${String(Math.floor(state.time % 60)).padStart(2, '0')}`;
  $('#board-title').textContent = attacking ? '神机生产线' : '布阵台';
  $('#board-subtitle').textContent = attacking ? '装配配方，循环出阵' : '前排迎敌，后排输出';
  $('#board-direction').textContent = attacking ? '合体产能 −33% · 战力提升' : '迎敌方向 →';
  $('#launch').disabled = state.phase !== 'setup' || state.paused;
  $('#launch').textContent =
    state.phase === 'setup'
      ? attacking
        ? '开动生产 ↗'
        : '鸣鼓迎敌 ↗'
      : attacking
        ? '生产线运转中'
        : '自动迎战中';
  $('#stage-banner').textContent =
    state.phase === 'setup'
      ? isAwake(state.board[4])
        ? '调整三路阵容，准备好后开启战局'
        : '把「吒」拖到「哪」上，唤醒第一位神将'
      : state.intermission > 0
        ? `补给已送达 · ${Math.ceil(state.intermission)} 秒后迎接下一波`
        : attacking
          ? `配方循环生产 · ${state.units.filter((unit) => unit.side === 'ally' && unit.hp > 0).length} 位友军正在推进`
          : state.wave >= 8
            ? '最终攻势 · 守住核心，迎战裂隙首领'
            : '可以继续征兵、合成、调阵 · 注意三路来敌';
  $('#wave-track').replaceChildren(
    ...Array.from({ length: 8 }, (_, index) => {
      const segment = document.createElement('i');
      segment.className =
        index + 1 < state.wave ? 'active' : index + 1 === state.wave ? 'current' : '';
      return segment;
    }),
  );
  $('#surge').disabled = state.phase !== 'running' || state.paused || state.cooldowns.surge > 0;
  $('#surge-info').textContent =
    state.cooldowns.surge > 0
      ? `${Math.ceil(state.cooldowns.surge)} 秒后再次就绪`
      : '攻速与生产 +55%，6 秒 · 冷却 36 秒';
  $('#repair').disabled =
    state.phase !== 'running' || state.paused || state.coreHp >= state.coreMax || state.coins < 45;
  $('#repair-info').textContent = '45 灵石 · 恢复 280 核心生命';
  $$('[data-offer]').forEach((button) => {
    button.disabled = state.paused || ['won', 'lost'].includes(state.phase);
    button.classList.toggle(
      'unaffordable',
      state.coins < OFFERS.find((offer) => offer.id === button.dataset.offer).cost,
    );
  });
  $$('[data-zone="board"] .production-bar').forEach((bar) => {
    const item = state.board[Number(bar.parentElement.dataset.index)];
    bar.style.width = attacking || item?.recovery > 0 ? `${(item?.progress || 0) * 100}%` : '0%';
    bar.parentElement.querySelector('.cell-label').textContent =
      item?.recovery > 0 ? `休整 ${Math.ceil(item.recovery)} 秒` : itemName(item);
  });
  for (const event of state.events) {
    if (event.id <= lastEvent) continue;
    lastEvent = event.id;
    if (['merge', 'ultimate', 'wave', 'won', 'lost'].includes(event.type)) sound(event.type);
    if (['wave', 'reward', 'ultimate'].includes(event.type)) notify(event.text);
  }
  if (['won', 'lost'].includes(state.phase) && !$('#result').open && !$('#welcome').open)
    showResult();
}
function refresh() {
  renderCells();
  renderSelection();
  refreshHud();
}
function showResult() {
  const won = state.phase === 'won';
  cancelDrag();
  selection = null;
  $('#result').classList.toggle('result-lost', !won);
  $('#result-seal').textContent = won ? '胜' : '憾';
  $('#result-eyebrow').textContent = won ? '战阵告捷 · 云上留名' : '重整旗鼓 · 再战云关';
  $('#result-title').textContent = won
    ? state.mode === 'attack'
      ? '敌晶破，远征捷'
      : '八阵过，云关安'
    : '灵晶熄灭，战意未歇';
  $('#result-description').textContent = won
    ? '每一个名字，都在这一阵里找到了自己的位置。'
    : '试着补齐三路、优先唤醒完整神将，再为主力装配专属机关。';
  $('#result-stats').replaceChildren();
  for (const [value, label] of [
    [state.kills, '击退敌军'],
    [Math.floor(state.time) + 's', '战局用时'],
    [Math.max(0, Math.ceil((state.coreHp / state.coreMax) * 100)) + '%', '灵晶剩余'],
  ]) {
    const part = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = value;
    const small = document.createElement('small');
    small.textContent = label;
    part.append(strong, small);
    $('#result-stats').append(part);
  }
  if (won) {
    const key = `${state.mode}:${state.difficulty}`;
    saved.wins ||= {};
    saved.wins[key] = (Number(saved.wins[key]) || 0) + 1;
    savePreferences();
  }
  showDialog($('#result'));
  sound(won ? 'won' : 'lost');
}
function draw(time) {
  const ratio = Math.min(devicePixelRatio || 1, 2);
  const width = Math.round(battleCanvas.clientWidth * ratio),
    height = Math.round(battleCanvas.clientHeight * ratio);
  if (battleCanvas.width !== width || battleCanvas.height !== height) {
    battleCanvas.width = width;
    battleCanvas.height = height;
  }
  drawBattle(battleContext, state, time, { width, height });
  const links = getLinks(state);
  for (const [canvas, source] of portraits) {
    if (!canvas.isConnected) {
      portraits.delete(canvas);
      continue;
    }
    const dialog = canvas.closest('dialog');
    if (dialog && !dialog.open) continue;
    let item = source.item || state[source.zone][source.index];
    const link =
      source.zone === 'board' && links.find((candidate) => candidate.heroIndex === source.index);
    if (link && item) item = { ...item, weapon: link.key };
    const context = canvas.getContext('2d');
    drawPortrait(context, item, time, {
      size: 160,
      selected: source.zone && sameLoc(selection, source),
    });
  }
  if ($('#welcome').open) {
    welcomeContext.clearRect(0, 0, 640, 280);
    const gradient = welcomeContext.createLinearGradient(0, 0, 640, 280);
    gradient.addColorStop(0, '#e6ebdb');
    gradient.addColorStop(1, '#cbdcc2');
    welcomeContext.fillStyle = gradient;
    welcomeContext.fillRect(0, 0, 640, 280);
    welcomeContext.strokeStyle = '#8aa28328';
    welcomeContext.lineWidth = 1;
    for (let r = 80; r < 410; r += 42) {
      welcomeContext.beginPath();
      welcomeContext.ellipse(280, 257, r, r * 0.4, 0, 0, Math.PI * 2);
      welcomeContext.stroke();
    }
    const entries = Object.entries(HEROES);
    entries.forEach(([key, hero], index) => {
      welcomeContext.save();
      welcomeContext.translate(85 + index * 150, index === 1 ? 54 : 79);
      drawPortrait(
        welcomeContext,
        {
          kind: 'hero',
          key,
          parts: hero.parts,
          level: 2,
          weapon: hero.synergy,
          anim: 'idle',
          animTime: time,
        },
        time + index,
        { size: index === 1 ? 174 : 150 },
      );
      welcomeContext.restore();
    });
  }
}
function frame(now) {
  const elapsed = lastFrame ? Math.max(0, (now - lastFrame) / 1000) : 0;
  lastFrame = now;
  if (!document.hidden) {
    tick(state, elapsed * speed);
    const impact = state.effects.findLast((effect) => effect.type === 'hit');
    if (impact && impact.id > lastImpact && now - lastImpactAt > 150 && !state.paused) {
      sound('hit');
      lastImpact = impact.id;
      lastImpactAt = now;
    }
    const time = reducedMotion
      ? state.time
      : state.phase === 'setup' || $('#welcome').open
        ? now / 1000
        : state.time;
    draw(time);
    if (now - lastHud > 150) {
      lastHud = now;
      refreshHud();
    }
  }
  requestAnimationFrame(frame);
}

makeCells('board', 12);
makeCells('reserve', 6);
renderShop();
renderGuide();
updateSound();
refresh();
$('#start-defense').addEventListener('click', () => chooseMode('defense'));
$('#start-attack').addEventListener('click', () => chooseMode('attack'));
$$('[data-difficulty]').forEach((button) =>
  button.addEventListener('click', () => {
    difficulty = button.dataset.difficulty;
    $$('[data-difficulty]').forEach((option) =>
      option.classList.toggle('active', option === button),
    );
  }),
);
$$('[data-tab]').forEach((button) =>
  button.addEventListener('click', () => {
    shopTab = button.dataset.tab;
    renderShop();
    refreshHud();
  }),
);
$('#launch').addEventListener('click', () => runAction(() => startBattle(state)));
$('#recycle').addEventListener('click', () => {
  if (selection) {
    runAction(() => recycle(state, selection));
    selection = null;
    renderSelection();
  }
});
$('#surge').addEventListener('click', () => runAction(() => surge(state)));
$('#repair').addEventListener('click', () => runAction(() => repair(state)));
$('#speed-button').addEventListener('click', () => {
  speed = speed === 1 ? 2 : 1;
  $('#speed-button').textContent = `${speed}×`;
  $('#speed-button').setAttribute('aria-label', `切换速度，当前${speed}倍`);
});
$('#sound-button').addEventListener('click', () => {
  audioEnabled = !audioEnabled;
  saved.sound = audioEnabled;
  savePreferences();
  updateSound();
  unlockAudio();
  sound();
});
$('#pause-button').addEventListener('click', pause);
$('#resume').addEventListener('click', resume);
$('#restart').addEventListener('click', () => chooseMode(state.mode));
$('#retry').addEventListener('click', () => chooseMode(state.mode));
$('#return-home').addEventListener('click', home);
$('#mode-button').addEventListener('click', home);
$('#result-home').addEventListener('click', home);
$('#guide-button').addEventListener('click', openGuide);
$('#help-footer').addEventListener('click', openGuide);
$('#close-guide').addEventListener('click', closeGuide);
$$('dialog').forEach((dialog) =>
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    if (dialog.id === 'guide') closeGuide();
    else if (dialog.id === 'pause-dialog') resume();
  }),
);
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('dialog[open]')) {
    event.preventDefault();
    pause();
  }
});
window.addEventListener('blur', () => {
  cancelDrag();
  if (state.phase === 'running') pause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelDrag();
    if (state.phase === 'running') pause();
  }
  lastFrame = 0;
});
window.addEventListener('pagehide', () => {
  state.paused = true;
  cancelDrag();
  void audioContext?.suspend();
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted && !['won', 'lost'].includes(state.phase) && !$('#welcome').open) {
    state.paused = true;
    showDialog($('#pause-dialog'));
  }
  lastFrame = 0;
});
document.addEventListener('pointerup', unlockAudio, { passive: true });
const winCount = Object.values(saved.wins || {}).reduce(
  (sum, count) => sum + (Number(count) || 0),
  0,
);
$('#record').textContent = winCount ? `云上留名 · 已赢得 ${winCount} 场战局` : '新的传说，等你书写';
// A read-only snapshot lets browser regression observe real inputs without changing game state.
window.__mergeFront = Object.freeze({ getState: () => structuredClone(state) });
showDialog($('#welcome'));
requestAnimationFrame(frame);
