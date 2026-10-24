import {
  FACTIONS,
  LEVELS,
  CITY_TYPES,
  GENERAL_TYPES,
  WEAPONS,
  createMatch,
  tick,
  switchRoute,
  getLevel,
  getScore,
  getUnlockedLevels,
  applyResult,
  effectSources,
} from './src/core/index.mjs';
import { readSave, writeSave } from './storage.mjs';
import { RemoteMatch, normalizeServer } from './remote.mjs';
import { createAudio } from './audio.mjs';
import {
  TIERS,
  CARD_NAMES,
  PROBABILITIES,
  rewardBand,
  cardDescription,
  currentCards,
  equippedCards,
  equipCard,
  consumeCards,
  drawCard,
  upgradeCard,
} from './rewards.mjs';
import { createH5Publishing } from './publishing.js';
const $ = (id) => document.getElementById(id),
  esc = (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
const button = (id, text, primary = false) =>
  '<button id="' +
  id +
  '" class="' +
  (primary ? 'primary' : 'secondary') +
  '">' +
  text +
  '</button>';
const time = (seconds) =>
  Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
let save = readSave(),
  state = null,
  screen = 'home',
  practice = false,
  remote = null,
  revision = 0,
  runId = '',
  generation = 0,
  seed = 0,
  loadout = [],
  settled = false,
  reward = null,
  chapter = 1,
  selected = null,
  range = null;
let lastFrame = 0,
  lastUI = 0,
  lastPoll = 0,
  lastEvent = 0,
  pollBusy = false,
  commandBusy = false,
  starting = false,
  noticeTimer,
  gesture = null,
  tutorialStep = 0,
  tutorialSeen = new Set(),
  startedCards = [],
  adBusy = false,
  adEpoch = 0,
  backgrounded = false;
const debug =
  globalThis.SmallGamesDev?.enabled === true || globalThis.SmallGamesDev?.isEnabled?.() === true;
const audio = createAudio(() => save.settings);
const pauseIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
globalThis.Tianxia = {
  state: null,
  screen,
  selected: null,
  preview: null,
  range: null,
  ready: false,
  artReady: false,
  pointer,
};
const bridge = globalThis.Tianxia;
const config = globalThis.SmallGamesPublishingConfig;
const hostAds = globalThis.SmallGamesRewardAds;
const provider =
  config?.adMode === 'host' && config.provider?.show
    ? config.provider
    : hostAds?.available !== false && hostAds?.offer
      ? {
          show: ({ opportunityId }) => hostAds.offer({ id: opportunityId }),
          dispose: () => hostAds.cancel?.(),
        }
      : undefined;
const newPublishing = () =>
  createH5Publishing({
    gameId: 'tianxia-chalu',
    title: '夺城令',
    adMode: provider ? 'host' : 'off',
    provider,
    pause: () => {
      audio.pause();
      return () => {};
    },
  });
let publishing = newPublishing();
setTimeout(() => {
  if (!bridge.ready || !bridge.artReady) bridge.error = '沙盘暂未载入，请重试。';
}, 20000);
function toast(message) {
  clearTimeout(noticeTimer);
  $('notice').textContent = message;
  $('notice').hidden = false;
  noticeTimer = setTimeout(() => ($('notice').hidden = true), 3800);
}
function persist() {
  const ok = writeSave(save);
  if (!ok) toast('存档暂时不可用，进度仅在本次页面保留');
  return ok;
}
function on(id, fn) {
  $(id)?.addEventListener('click', fn);
}
function header(title, back = home) {
  return (
    '<header class="page-heading">' +
    button('back', '返回') +
    '<h2>' +
    title +
    '</h2><span></span></header>'
  );
}
function cancelUpgrade() {
  adEpoch++;
  if (adBusy) {
    try { provider?.dispose?.(); } catch { /* Navigation remains available. */ }
  }
  adBusy = false;
}
function show(next, html) {
  if (next !== screen) cancelUpgrade();
  gesture = null;
  bridge.preview = null;
  screen = next;
  bridge.screen = next;
  bridge.state = state;
  bridge.selected = selected;
  bridge.range = range;
  lastFrame = 0;
  document.body.dataset.screen = next;
  $('game').innerHTML = html;
  const playing = ['battle', 'prepare', 'intel', 'pause', 'result'].includes(next);
  try {
    if (parent !== window)
      parent.postMessage(
        {
          type: 'small-games:display-state',
          gameId: 'tianxia-chalu',
          screen: playing ? 'playing' : 'home',
        },
        location.origin,
      );
  } catch {}
  syncBoard();
  requestAnimationFrame(syncBoard);
}
function syncBoard() {
  const board = $('board'),
    canvas = $('GameDiv');
  if (!canvas) return;
  const visible = !!board && ['prepare', 'battle'].includes(screen);
  canvas.style.visibility = visible ? 'visible' : 'hidden';
  canvas.style.pointerEvents = visible ? 'auto' : 'none';
  if (visible)
    Object.assign(canvas.style, {
      position: 'fixed',
      left: '0px',
      top: '0px',
      width: innerWidth + 'px',
      height: innerHeight + 'px',
      margin: '0',
    });
}
function page(title, body, back = home) {
  show(
    'document',
    '<section class="screen document">' +
      header(title) +
      '<div class="page-body">' +
      body +
      '</div></section>',
  );
  on('back', back);
}
function nextLevel() {
  const unlocked = getUnlockedLevels(save);
  return (
    LEVELS.find((l) => unlocked.includes(l.id) && !save.completed.includes(l.id)) ??
    LEVELS.find((l) => l.id === unlocked.at(-1)) ??
    LEVELS[0]
  );
}
function home() {
  generation++;
  starting = false;
  backgrounded = document.hidden;
  void remote?.close();
  remote = null;
  state = null;
  selected = null;
  range = null;
  audio.pause();
  const next = nextLevel();
  show(
    'home',
    '<section class="screen home"><div class="home-title"><p class="eyebrow">百 战 山 河</p><h1>夺城令</h1><p class="home-tagline">一指改军令，寸土定山河。</p></div><div class="home-actions"><p class="chapter-note">第 ' +
      next.chapter +
      ' 章 · ' +
      esc(next.chapterName) +
      '　' +
      save.completed.length +
      '/100</p>' +
      button('start', save.completed.length ? '继续征战' : '启程征战', true) +
      '<div class="home-links">' +
      button('levels', '山河图') +
      button('codex', '图鉴') +
      button('armory', '军备') +
      '</div><div class="quiet-links">' +
      button('help', '玩法') +
      button('settings', '设置') +
      '</div></div></section>',
  );
  on('start', () => prepare(next.id));
  on('levels', () => levels(next.chapter));
  on('codex', () => codex());
  on('armory', () => armory());
  on('help', () => help());
  on('settings', settings);
}
function levels(ch = chapter) {
  chapter = Math.max(1, Math.min(10, ch));
  const maps = LEVELS.filter((l) => l.chapter === chapter),
    unlocked = getUnlockedLevels(save);
  show(
    'levels',
    '<section class="screen"><div class="page-heading">' +
      button('back', '返回') +
      '<h2>百战山河</h2><span>' +
      save.completed.length +
      '/100</span></div><div class="chapter-picker">' +
      button('prev-chapter', '上一章') +
      '<div><small>第 ' +
      chapter +
      ' 章</small><h3>' +
      esc(maps[0].chapterName) +
      '</h3></div>' +
      button('next-chapter', '下一章') +
      '</div><div class="level-grid">' +
      maps
        .map(
          (l) =>
            '<button class="level-tile ' +
            (save.completed.includes(l.id) ? 'complete' : '') +
            '" data-level="' +
            l.id +
            '" ' +
            (unlocked.includes(l.id) ? '' : 'disabled') +
            '><span class="level-number">' +
            String(l.order).padStart(2, '0') +
            '</span><strong>' +
            esc(l.name) +
            '</strong><small>' +
            ('★'.repeat(save.stars[l.id] ?? 0) ||
              (unlocked.includes(l.id) ? l.factions.length + '方争夺' : '完成前一关解锁')) +
            '</small></button>',
        )
        .join('') +
      '</div><p class="footnote">每次新出征随机布阵 · 重试保留布局</p></section>',
  );
  on('back', home);
  on('prev-chapter', () => levels(chapter - 1));
  on('next-chapter', () => levels(chapter + 1));
  $('prev-chapter').disabled = chapter === 1;
  $('next-chapter').disabled = chapter === 10;
  document
    .querySelectorAll('[data-level]')
    .forEach((b) => b.addEventListener('click', () => prepare(b.dataset.level)));
}
function newSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}
function prepare(id, trial = false, sameSeed) {
  generation++;
  starting = false;
  void remote?.close();
  remote = null;
  practice = trial;
  seed = sameSeed ?? newSeed();
  selected = null;
  range = null;
  settled = false;
  reward = null;
  if (!trial && !getUnlockedLevels(save).includes(id)) {
    toast('先完成前一关');
    return levels(getLevel(id).chapter);
  }
  loadout = trial ? [] : equippedCards(save.armory).map((c) => ({ ...c }));
  state = createMatch({
    levelId: id,
    seed,
    difficulty: save.settings.difficulty,
    loadout: loadout.map(({ kind, tier }) => ({ kind, tier })),
  });
  tutorialStep = 0;
  tutorialSeen = new Set();
  lastEvent = 0;
  const l = getLevel(id);
  show(
    'prepare',
    '<section class="battle-screen prepare-screen"><header class="battle-top">' +
      button('back', '返回') +
      '<div><small>第 ' +
      l.order +
      ' 战 · ' +
      l.chapterName +
      '</small><h2>' +
      esc(l.name) +
      '</h2></div>' +
      button('shuffle', '重新布阵') +
      '</header><p class="prepare-tip">' +
      esc(l.objective) +
      '</p><div id="board" role="img" aria-label="可触控的出征沙盘"></div><footer class="battle-bottom"><p id="city-info">各方驻军与留守均为 0 · 可先下军令</p><div class="order-buttons">' +
      button('hold', '屯兵') +
      button('cycle', '换方向') +
      '</div><div class="prepare-loadout">' +
      (loadout.length
        ? loadout.map((c) => esc(CARD_NAMES[c.kind]) + ' · ' + TIERS[c.tier]).join(' / ')
        : '未装备军备卡') +
      '</div>' +
      button('begin-battle', '出征', true) +
      '<p class="footnote" id="engine-loading">正在准备沙盘…</p></footer></section>',
  );
  on('back', () => {
    generation++;
    starting = false;
    void remote?.close();
    remote = null;
    state = null;
    levels(l.chapter);
  });
  on('shuffle', () => prepare(id, trial));
  on('begin-battle', begin);
  bindOrders();
  updateHud();
}
async function begin() {
  if (starting || screen !== 'prepare') return;
  if (!bridge.ready || !bridge.artReady) {
    if (bridge.error) {
      location.reload();
      return;
    }
    toast('沙盘仍在加载，请稍候');
    return;
  }
  starting = true;
  const token = generation;
  const commands = state.junctions
    .filter((j) => j.owner === 0 && j.routeIndex >= 0)
    .map((j) => ({ id: j.id, index: j.routeIndex }));
  const validCards = practice ? [] : equippedCards(save.armory).map((c) => ({ ...c }));
  if (JSON.stringify(validCards) !== JSON.stringify(loadout)) {
    loadout = validCards;
    state = createMatch({
      levelId: state.levelId,
      seed,
      difficulty: save.settings.difficulty,
      loadout: loadout.map(({ kind, tier }) => ({ kind, tier })),
    });
    for (const c of commands) switchRoute(state, 0, c.id, c.index);
  }
  const prepared = state;
  $('begin-battle').disabled = true;
  audio.unlock();
  startedCards = [];
  try {
    if (save.settings.online && !practice) {
      const client = new RemoteMatch(save.settings.serverUrl || location.origin);
      remote = client;
      state = (
        await client.start(prepared.levelId, save.settings.difficulty, {
          seed,
          loadout: loadout.map(({ kind, tier }) => ({ kind, tier })),
        })
      ).state;
      if (token !== generation || remote !== client) return;
      for (const c of commands) {
        state = (await client.route(c.id, c.index)).state;
      }
      if (token !== generation || remote !== client) return;
      runId = client.id;
    } else {
      state = prepared;
      runId = crypto.randomUUID();
    }
    if (!practice) {
      startedCards = loadout.filter((c) => c.duration === 'single');
      consumeCards(
        save.armory,
        loadout.map((c) => c.id),
      );
      persist();
    }
    discover();
    if (backgrounded || document.hidden) {
      screen = 'battle';
      void pause('已在后台暂停。');
    } else battle();
  } catch (error) {
    if (token === generation) {
      void remote?.close();
      remote = null;
      state = prepared;
      toast(error.message || '连接失败，请检查设置');
      $('begin-battle').disabled = false;
    }
  } finally {
    if (token === generation) starting = false;
  }
}
function bindOrders() {
  on('hold', () => issue(-1));
  on('cycle', () => issue());
}
function battle() {
  const l = getLevel(state.levelId);
  bridge.preview = null;
  show(
    'battle',
    '<section class="battle-screen"><header class="battle-top"><div><small>第 ' +
      l.order +
      ' 战 · ' +
      (practice ? '开发试玩' : remote ? '服务端对局' : '百战山河') +
      '</small><h2>' +
      esc(l.name) +
      '</h2></div><strong id="clock">' +
      time(state.duration - state.time) +
      '</strong><button id="pause" class="icon-button" aria-label="暂停">' +
      pauseIcon +
      '</button></header><div id="factions" class="factions"></div><div id="board" role="img" aria-label="城池与行军路线，点击己城再点相邻城下令"></div><p id="battle-message" class="battle-message" role="status"></p><div id="tutorial" class="tutorial" hidden><p id="tutorial-copy"></p>' +
      button('skip-tutorial', '跳过') +
      '</div><footer class="battle-bottom"><div class="selection"><div><strong id="city-info">轻点己城，下达军令</strong><p id="route-name">也可从己城拖向相邻城池</p></div>' +
      button('intel', '军情') +
      '</div><div class="order-buttons">' +
      button('hold', '屯兵') +
      button('cycle', '换方向') +
      '</div><div id="keyboard-targets" class="sr-only"></div></footer></section>',
  );
  on('pause', () => pause());
  on('intel', () => openIntel());
  on('skip-tutorial', () => {
    save.tutorials[state.levelId] = true;
    persist();
    updateTutorial();
  });
  bindOrders();
  audio.resume();
  updateHud();
  updateTutorial();
}
function nearest(p) {
  return state?.cities
    .map((c) => ({ c, d: Math.hypot(c.x - p.x, c.y - p.y) }))
    .sort((a, b) => a.d - b.d)
    .find((x) => x.d <= Math.max(29, 22 / (bridge.layout?.scale ?? 1)))?.c;
}
function arrowAt(p) {
  return state?.cities.find((c) => {
    if (c.owner !== 0) return false;
    const j = state.junctions.find((j) => j.cityId === c.id),
      target = state.cities.find((t) => t.id === j.exits[j.routeIndex]);
    if (!target) return false;
    const length = Math.hypot(target.x - c.x, target.y - c.y);
    return (
      Math.hypot(
        p.x - c.x - ((target.x - c.x) / length) * 48,
        p.y - c.y - ((target.y - c.y) / length) * 48,
      ) < 20
    );
  });
}
function pointer(phase, p, id) {
  if (!['battle', 'prepare'].includes(screen) || starting || commandBusy) return;
  if (phase === 'cancel') {
    gesture = null;
    bridge.preview = null;
    return;
  }
  if (phase === 'down') {
    if (gesture) {
      gesture = null;
      bridge.preview = null;
      return;
    }
    const arrow = arrowAt(p),
      c = nearest(p) ?? arrow;
    gesture = { id, start: p, city: c?.id, moved: false, from: selected, arrow: !!arrow };
    const old = state.cities.find((c) => c.id === selected),
      oldJunction = state.junctions.find((j) => j.cityId === selected);
    if (
      c?.owner === 0 &&
      !(old?.owner === 0 && c.id !== old.id && oldJunction.exits.includes(c.id))
    ) {
      selected = c.id;
      bridge.selected = selected;
      tutorialSeen.add('select');
    }
    return;
  }
  if (!gesture || gesture.id !== id) return;
  if (phase === 'move') {
    gesture.moved ||= Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) > 7;
    if (gesture.city && state.cities.find((c) => c.id === gesture.city)?.owner === 0)
      bridge.preview = p;
    return;
  }
  if (phase === 'up') {
    const down = gesture;
    gesture = null;
    bridge.preview = null;
    const target = nearest(p),
      source = state.cities.find((c) => c.id === selected);
    if (down.arrow && !down.moved && arrowAt(p)?.id === down.city) {
      void issue();
      return;
    }
    if (!target) {
      selected = null;
      bridge.selected = null;
      updateHud();
      return;
    }
    if (down.moved) {
      if (down.city !== source?.id || source?.owner !== 0) return;
      const j = state.junctions.find((j) => j.cityId === source.id),
        index = j.exits.indexOf(target.id);
      if (index >= 0) void issue(index);
    } else if (source?.owner === 0 && target.id !== source.id) {
      const j = state.junctions.find((j) => j.cityId === source.id),
        index = j.exits.indexOf(target.id);
      if (index >= 0) void issue(index);
      else {
        selected = target.id;
        bridge.selected = selected;
      }
    } else if (target.owner === 0 && down.from === target.id) {
      void issue();
    } else {
      selected = target.id;
      bridge.selected = selected;
    }
    updateHud();
    updateTutorial();
  }
}
async function issue(index) {
  const source = state?.cities.find((c) => c.id === selected),
    j = state?.junctions.find((j) => j.cityId === selected);
  if (!j || source.owner !== 0 || commandBusy || !['battle', 'prepare'].includes(screen)) return;
  commandBusy = true;
  const token = generation;
  try {
    let ok = true;
    if (remote) {
      const client = remote;
      const snapshot = await client.route(j.id, index);
      if (token !== generation || client !== remote) return;
      state = snapshot.state;
    } else {
      const result = switchRoute(state, 0, j.id, index);
      ok = result.ok;
      if (screen === 'prepare' && ok) j.lastSwitchTime = -1;
      if (!ok && result.reason !== 'cooldown') toast('军令未生效：' + result.reason);
    }
    if (ok) {
      const current = state.junctions.find((x) => x.id === j.id);
      tutorialSeen.add(current.routeIndex === -1 ? 'hold' : 'route');
      if (source.id !== state.spawns[0]) tutorialSeen.add('relay');
      if (screen === 'prepare') audio.event(current.routeIndex === -1 ? 'hold' : 'switch');
    }
    bridge.state = state;
    updateHud();
    updateTutorial();
  } catch (error) {
    if (token === generation) {
      toast(error.message);
      if (screen === 'battle') void pause('连接中断，继续时重连并确认军令。');
    }
  } finally {
    commandBusy = false;
  }
}
function updateHud() {
  if (range?.id && state) {
    const live = effectSources(state).find((s) => s.id === range.id);
    range = live
      ? {
          id: live.id,
          ...live.position,
          radius: live.scope === 'initial-reinforcement' ? 0 : live.radius,
          factionId: live.factionId,
        }
      : null;
  }
  bridge.state = state;
  bridge.selected = selected;
  bridge.range = range;
  if (!state) return;
  if ($('clock')) $('clock').textContent = time(state.duration - state.time);
  if ($('factions'))
    $('factions').innerHTML = getScore(state)
      .map(
        (r) =>
          '<span class="faction" style="--faction:' +
          FACTIONS[r.factionId].color +
          '"><b>' +
          FACTIONS[r.factionId].shortName +
          '</b> ' +
          r.cities +
          '城 <small>' +
          r.troops +
          '兵</small></span>',
      )
      .join('');
  const city = state.cities.find((c) => c.id === selected),
    j = state.junctions.find((j) => j.cityId === selected);
  if ($('city-info'))
    $('city-info').textContent = city
      ? city.name +
        ' · ' +
        CITY_TYPES[city.type].name +
        ' · ' +
        city.troops +
        '/' +
        city.capacity +
        '兵'
      : screen === 'prepare'
        ? '各方驻军与留守均为0 · 可先下军令'
        : '轻点己城，下达军令';
  if ($('route-name'))
    $('route-name').textContent = city
      ? city.owner === 0
        ? j.routeIndex === -1
          ? '正在屯兵，停止新派兵'
          : '行军 → ' + state.cities.find((c) => c.id === j.exits[j.routeIndex]).name
        : '非己方城池，可观察城防与兵器'
      : '也可从己城拖向相邻城池';
  for (const id of ['hold', 'cycle'])
    if ($(id)) $(id).disabled = !city || city.owner !== 0 || commandBusy;
  if ($('engine-loading'))
    $('engine-loading').textContent =
      bridge.ready && bridge.artReady
        ? '沙盘就绪 · 点击出征开始产兵'
        : (bridge.error ?? '正在准备沙盘…');
  if ($('begin-battle')) {
    $('begin-battle').disabled = starting || (!bridge.error && (!bridge.ready || !bridge.artReady));
    $('begin-battle').textContent =
      bridge.error && (!bridge.ready || !bridge.artReady) ? '重新载入沙盘' : '出征';
  }
  const keys = $('keyboard-targets');
  if (keys && keys.dataset.selected !== selected) {
    keys.dataset.selected = selected ?? '';
    keys.innerHTML =
      city?.owner === 0
        ? j.exits
            .map(
              (id, i) =>
                '<button data-target="' +
                i +
                '">派兵前往' +
                esc(state.cities.find((c) => c.id === id).name) +
                '</button>',
            )
            .join('')
        : '';
    keys
      .querySelectorAll('button')
      .forEach((b) => b.addEventListener('click', () => issue(Number(b.dataset.target))));
  }
}
const tutorials = [
  [
    '轻点带赤色军旗的己方城池。',
    '轻点相邻城池，或从己城拖过去，开始行军。',
    '占领后新城默认屯兵，再下军令接通补给。',
  ],
  [
    '选中己城，点击「屯兵」，停止新派兵。',
    '屯兵积累到12兵，已经出发的部队仍按原路行军。',
    '兵力足够后，改道出征。',
  ],
  [
    '先向邻城派兵，占领一座前线城。',
    '选中新占领的城池，让它继续向前送兵。',
    '后城不断补给，前线集中兵力。',
  ],
  [
    '打开「军情」，查看本场各阵营的局部增益。',
    '选择一个增益来源，回到战场查看作用范围。',
    '单位离开范围后，持续加成随即消失。',
  ],
];
function updateTutorial() {
  if (!$('tutorial') || !state) return;
  const order = getLevel(state.levelId).order;
  if (order > 4 || save.tutorials[state.levelId]) {
    $('tutorial').hidden = true;
    return;
  }
  if (order === 1)
    tutorialStep = tutorialSeen.has('route') ? 2 : tutorialSeen.has('select') ? 1 : 0;
  if (order === 2) {
    if (tutorialSeen.has('hold')) tutorialStep = Math.max(tutorialStep, 1);
    if (tutorialStep === 1 && state.cities.some((c) => c.owner === 0 && c.troops >= 12))
      tutorialStep = 2;
  }
  if (order === 3) tutorialStep = state.stats.captured > 0 ? 1 : 0;
  if (order === 4) tutorialStep = tutorialSeen.has('intel') ? 1 : 0;
  const complete =
    (order === 1 && state.stats.captured > 0) ||
    (order === 2 && tutorialStep === 2 && tutorialSeen.has('route')) ||
    (order === 3 && tutorialSeen.has('relay')) ||
    (order === 4 && tutorialSeen.has('range'));
  if (complete) {
    save.tutorials[state.levelId] = true;
    persist();
    $('tutorial').hidden = true;
    toast('军令已掌握，继续夺城吧');
    return;
  }
  $('tutorial').hidden = false;
  $('tutorial-copy').textContent = tutorials[order - 1][tutorialStep];
}
function discover() {
  if (practice || !state) return;
  const entries = save.codex;
  let changed = false;
  const mark = (key, mastered) => {
    const value = Math.max(entries[key] ?? 0, mastered ? 2 : 1);
    if (entries[key] !== value) {
      entries[key] = value;
      changed = true;
    }
  };
  state.cities.forEach((c) => {
    mark('city:' + c.type, c.owner === 0);
    if (c.weapon) mark('weapon:' + c.weapon.kind, c.owner === 0);
    if (c.generalKind) mark('general:' + c.generalKind, false);
  });
  state.generals.forEach((g) => mark('general:' + g.kind, g.owner === 0));
  if (changed) persist();
}
async function stopRemote() {
  if (!remote) return true;
  const client = remote;
  try {
    const snapshot = await client.action('pause');
    if (remote !== client) return false;
    state = snapshot.state;
    bridge.state = state;
    return snapshot.paused;
  } catch {
    return false;
  }
}
async function pause(reason = '') {
  if (!state || !['battle', 'prepare'].includes(screen)) return;
  if (screen === 'prepare') return home();
  audio.pause();
  show(
    'pause',
    '<section class="screen pause-page"><p class="eyebrow">暂 歇 战 鼓</p><h2>鸣金暂歇</h2><p id="pause-note">' +
      (remote ? '正在确认服务端暂停…' : '兵马已停，军令犹在。') +
      '</p><div class="button-stack">' +
      button('resume', '继续征战', true) +
      button('retry', '重试相同布阵') +
      button('battle-help', '玩法与教学') +
      button('leave', '返回主页') +
      '</div><div class="quiet-links">' +
      button('sound-toggle', save.settings.sound ? '音效：开' : '音效：关') +
      button('music-toggle', save.settings.music ? '氛围：开' : '氛围：关') +
      '</div><button data-game-fullscreen>全屏</button></section>',
  );
  on('resume', resume);
  on('retry', () => prepare(state.levelId, practice, seed));
  on('leave', home);
  on('battle-help', () => help(() => pausePage(), true));
  on('sound-toggle', () => {
    save.settings.sound = !save.settings.sound;
    persist();
    $('sound-toggle').textContent = save.settings.sound ? '音效：开' : '音效：关';
  });
  on('music-toggle', () => {
    save.settings.music = !save.settings.music;
    persist();
    $('music-toggle').textContent = save.settings.music ? '氛围：开' : '氛围：关';
  });
  $('resume').disabled = !!remote;
  const token = generation;
  const paused = await stopRemote();
  if (token === generation && screen === 'pause') {
    $('resume').disabled = false;
    $('pause-note').textContent =
      (remote
        ? paused
          ? '服务端已暂停。'
          : '尚未确认服务端暂停，请重连；不会假称时间冻结。'
        : '兵马已停，军令犹在。') + (reason ? ' ' + reason : '');
  }
}
function pausePage() {
  screen = 'battle';
  void pause();
}
async function resume() {
  if (!state) return;
  const client = remote;
  const token = generation;
  if ($('resume')) $('resume').disabled = true;
  try {
    if (client) {
      state = (await client.poll()).state;
      if (token !== generation || client !== remote) return;
      if (state.status === 'finished') {
        finish();
        return;
      }
      try {
        state = (await client.action('resume')).state;
      } catch (error) {
        if (error.code !== 'match-finished') throw error;
        state = (await client.poll()).state;
      }
      if (token !== generation || client !== remote) return;
      if (state.status === 'playing' && client.pending)
        state = (await client.route(client.pending.junctionId, client.pending.routeIndex)).state;
      if (token !== generation || client !== remote) return;
    }
    if (state.status === 'finished') finish();
    else if (backgrounded || document.hidden) {
      screen = 'battle';
      void pause('已在后台暂停。');
    } else battle();
  } catch (error) {
    toast(error.message);
    if ($('resume')) $('resume').disabled = false;
  }
}
async function openIntel() {
  if (!state) return;
  audio.pause();
  tutorialSeen.add('intel');
  show(
    'intel',
    '<section class="screen document">' +
      header('本场军情') +
      '<p class="page-body">正在确认暂停…</p></section>',
  );
  on('back', resume);
  $('back').disabled = !!remote;
  const token = generation,
    paused = await stopRemote();
  if (token !== generation || screen !== 'intel') return;
  const sources = effectSources(state);
  show(
    'intel',
    '<section class="screen document">' +
      header('本场军情') +
      '<div class="page-body"><p class="footnote">' +
      (!remote || paused ? '对局已暂停' : '服务端暂停未确认，信息可能继续变化') +
      ' · 点选来源查看范围</p><div class="intel-list">' +
      sources
        .map(
          (s, i) =>
            '<button data-source="' +
            i +
            '" class="intel-card" style="--faction:' +
            FACTIONS[s.factionId].color +
            '"><span class="flag">' +
            FACTIONS[s.factionId].shortName +
            '</span><div><strong>' +
            esc(CARD_NAMES[s.kind] ?? s.kind) +
            '</strong><p>' +
            esc(state.cities.find((c) => c.id === s.cityId)?.name ?? '随军将领') +
            ' · ' +
            (s.sourceType === 'general'
              ? '将领光环'
              : s.sourceType === 'card'
                ? '军备卡'
                : '基础军令') +
            '</p><small>' +
            (s.kind === 'troops'
              ? s.value + '兵 · 开局一次'
              : Math.round(s.value * 100) + '% · 半径 ' + s.radius + '步 · 来源存活时有效') +
            '</small></div></button>',
        )
        .join('') +
      '</div><p class="footnote">仅影响范围内友军。同类取最大值，不重复累乘。</p></div></section>',
  );
  on('back', resume);
  document.querySelectorAll('[data-source]').forEach((b) =>
    b.addEventListener('click', () => {
      const s = sources[Number(b.dataset.source)];
      range = {
        id: s.id,
        ...s.position,
        radius: s.scope === 'initial-reinforcement' ? 0 : s.radius,
        factionId: s.factionId,
      };
      selected = s.cityId;
      tutorialSeen.add('range');
      void resume();
    }),
  );
}
function art(index) {
  return (
    '<span class="atlas-art" style="--col:' +
    (index % 4) +
    ';--row:' +
    Math.floor(index / 4) +
    '" aria-hidden="true"></span>'
  );
}
function codex(tab = 'city') {
  const books = { city: CITY_TYPES, general: GENERAL_TYPES, weapon: WEAPONS },
    tips = {
      city: '占领此类城池可掌握',
      general: '在点将台招募可掌握',
      weapon: '夺下带此兵器的城池可掌握',
    };
  const indices =
    tab === 'city'
      ? { town: 0, barracks: 1, pass: 2, muster: 3 }
      : tab === 'weapon'
        ? { crossbow: 4, catapult: 5, cannon: 6 }
        : { warrior: 7, commander: 7, guardian: 8, ranger: 9, arbalist: 10, medic: 11 };
  page(
    '山河图鉴',
    '<nav class="tabs">' +
      [
        ['city', '城池'],
        ['general', '将领'],
        ['weapon', '兵器'],
      ]
        .map(
          ([key, name]) =>
            '<button data-tab="' +
            key +
            '" class="' +
            (tab === key ? 'active' : '') +
            '">' +
            name +
            '</button>',
        )
        .join('') +
      '</nav><div class="codex-list">' +
      Object.entries(books[tab])
        .map(([key, spec]) => {
          const known = save.codex[tab + ':' + key] ?? 0;
          const detail =
            tab === 'city'
              ? '产兵 ' +
                spec.production +
                '/秒 · 容量' +
                spec.capacity +
                ' · 初始城防' +
                spec.fortification
              : tab === 'general'
                ? '攻击' +
                  spec.attack +
                  ' · 间隔' +
                  spec.interval +
                  '秒 · 防御' +
                  Math.round(spec.defense * 100) +
                  '% · 生命' +
                  spec.health +
                  '。85步内' +
                  CARD_NAMES[spec.aura] +
                  ' +' +
                  Math.round(spec.bonus * 100) +
                  '%'
                : '伤害' +
                  spec.damage +
                  ' · 冷却' +
                  spec.interval +
                  '秒 · 范围' +
                  spec.range +
                  '步' +
                  (spec.splash ? ' · 范围伤害' : ' · 单体攻击');
          return (
            '<article class="codex-card ' +
            (known ? '' : 'unknown') +
            '">' +
            art(indices[key]) +
            '<div><small>' +
            ['尚未发现', '已发现', '已掌握'][known] +
            '</small><h3>' +
            (known ? spec.name : '未识' + { city: '城池', general: '将领', weapon: '兵器' }[tab]) +
            '</h3><p>' +
            (known ? detail : tips[tab]) +
            '</p></div></article>'
          );
        })
        .join('') +
      '</div>',
  );
  document
    .querySelectorAll('[data-tab]')
    .forEach((b) => b.addEventListener('click', () => codex(b.dataset.tab)));
}
function cardHTML(c) {
  return (
    '<div class="reward-card tier-' +
    c.tier +
    '"><span class="card-tier">' +
    TIERS[c.tier] +
    ' · ' +
    (c.duration === 'daily' ? '今日军令' : '一次性战术') +
    '</span><div class="card-emblem">' +
    {
      troops: '援',
      production: '募',
      attack: '刃',
      rate: '疾',
      defense: '甲',
      health: '养',
      speed: '驿',
      general: '将',
      weapon: '弩',
      territory: '城',
    }[c.kind] +
    '</div><h3>' +
    CARD_NAMES[c.kind] +
    '</h3><p>' +
    cardDescription(c) +
    '</p></div>'
  );
}
function armory(back = home) {
  const cards = currentCards(save.armory);
  page(
    '军备库',
    '<p class="footnote">日卡、一次性卡各装备一张。日卡于北京时间次日零时到期；一次性卡在开战时消耗。</p><div class="armory-list">' +
      (cards.length
        ? cards
            .map(
              (c) =>
                '<article>' +
                cardHTML(c) +
                '<button data-equip="' +
                esc(c.id) +
                '" class="' +
                (save.armory.equipped.includes(c.id) ? 'primary' : 'secondary') +
                '">' +
                (save.armory.equipped.includes(c.id) ? '已装备 · 卸下' : '装备') +
                '</button></article>',
            )
            .join('')
        : '<div class="empty-state"><span>令</span><h3>军备待集</h3><p>完成一场正式对局，即可免费获得一张奖励卡。</p></div>') +
      '</div>',
    back,
  );
  document.querySelectorAll('[data-equip]').forEach((b) =>
    b.addEventListener('click', () => {
      equipCard(save.armory, b.dataset.equip);
      persist();
      armory(back);
    }),
  );
}
function help(back = home, inBattle = false) {
  page(
    '军令手册',
    '<div class="help-list"><h3>改道与屯兵</h3><p>点己城，再点相邻城池；也可直接拖动。再次点选中的己城或点「换方向」轮换军令。「屯兵」停止新派兵，已出发的部队继续行军。点击空白取消选城。所有道路均可双向通行，交叉处不相连。</p><h3>从0兵开始</h3><p>各方驻军和默认留守为0，归属不会因空城自动消失。城池满员停止产兵，援军在城外驻扎，仍可能被攻击。</p><h3>抓住地利</h3><p>兵营产兵快，关隘难攻；驿道快、山路慢。武器各有冷却。点将台稳定占领20秒招募将领，被围攻暂停，易主清零。</p><h3>局部军令</h3><p>「军情」展示各方加成，点来源查看圆形范围。同类取最大值，来源失守、将领退场或部队离圈会失去持续效果。</p><h3>胜负与军备</h3><p>无城、无兵、无将才会被消灭。限时先看存活，再看城数和兵力。结束免费得卡，广告仅将这张卡保证升一级；不观看也能继续征战。</p>' +
      button('replay-tutorial', '重看前四关教学') +
      '</div>',
    back,
  );
  on('replay-tutorial', () => {
    save.tutorials = {};
    persist();
    toast('前四关教学已重置');
    if (inBattle) back();
  });
}
function settings() {
  page(
    '军中设置',
    '<form id="settings-form"><label class="setting">音效<input type="checkbox" id="sound" ' +
      (save.settings.sound ? 'checked' : '') +
      '></label><label class="setting">氛围音乐<input type="checkbox" id="music" ' +
      (save.settings.music ? 'checked' : '') +
      '></label><label class="setting">AI 反应<select id="difficulty"><option value="easy">从容</option><option value="normal">正常</option><option value="hard">敏锐</option></select></label><p class="footnote">难度只影响判断和反应，各方遵守相同规则。</p><label class="setting">服务端对局<input type="checkbox" id="online" ' +
      (save.settings.online ? 'checked' : '') +
      '></label><label class="field">配套服务地址<input id="server-url" type="url" value="' +
      esc(save.settings.serverUrl) +
      '" placeholder="https://example.com"></label><p class="footnote">两种模式均与AI交战；关闭服务端模式可离线游玩。</p><button class="primary" type="submit">保存设置</button></form><button data-game-fullscreen>全屏</button>',
  );
  $('difficulty').value = save.settings.difficulty;
  $('settings-form').addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      const online = $('online').checked;
      save.settings = {
        sound: $('sound').checked,
        music: $('music').checked,
        difficulty: $('difficulty').value,
        online,
        serverUrl: $('server-url').value.trim()
          ? normalizeServer($('server-url').value.trim())
          : online
            ? location.origin
            : '',
      };
      persist();
      home();
    } catch (error) {
      toast(error.message);
    }
  });
}
function markPractice() {
  if (practice) return;
  practice = true;
  for (const c of startedCards)
    if (!save.armory.cards.some((x) => x.id === c.id)) save.armory.cards.push(c);
  startedCards = [];
  persist();
}
function finish() {
  if (!state?.result) return;
  const result = state.result;
  if (!settled) {
    settled = true;
    audio.event(result.outcome);
    if (!practice) {
      applyResult(save, result);
      reward = drawCard(save.armory, result, runId);
      discover();
      persist();
    }
  }
  const explanation =
    result.reason === 'expired'
      ? '离线过久，对局已结束。重新出征即可再战。'
      : result.reason === 'abandoned'
        ? '本场已主动退出，不计入奖励。'
        : null;
  const next = LEVELS.find((l) => l.order === getLevel(state.levelId).order + 1),
    rank = result.rankings.find((r) => r.factionId === 0)?.rank ?? result.rankings.length,
    receipt = save.armory.receipts[runId];
  reward = receipt?.card ?? reward;
  show(
    'result',
    '<section class="screen result"><div class="result-heading"><p class="eyebrow">' +
      (practice ? '开发试玩 · 不计进度' : '第 ' + getLevel(state.levelId).order + ' 战 · 战报') +
      '</p><div class="result-seal">' +
      ({ victory: '捷', defeat: '憾', draw: '和' }[result.outcome] ?? '终') +
      '</div><h2>' +
      ({ victory: '山河入掌', defeat: '整军再来', draw: '旗鼓相当' }[result.outcome] ??
        '征战结束') +
      '</h2><p>' +
      (explanation ??
        '第 ' + rank + ' 名 · ' + time(result.elapsed) + ' · 夺城 ' + state.stats.captured) +
      '</p></div><div class="rank-list">' +
      result.rankings
        .map(
          (r) =>
            '<div><b>' +
            r.rank +
            '</b><span style="color:' +
            FACTIONS[r.factionId].color +
            '">' +
            FACTIONS[r.factionId].name +
            (r.factionId === 0 ? ' · 你' : '') +
            '</span><span>' +
            r.cities +
            '城 / ' +
            r.troops +
            '兵' +
            (!r.alive ? ' · 覆灭' : '') +
            '</span></div>',
        )
        .join('') +
      '</div>' +
      (reward
        ? '<div id="earned-card">' +
          cardHTML(reward) +
          '</div><p class="footnote">已免费入库 · 本排名四档概率 ' +
          PROBABILITIES[rewardBand(rank, result.rankings.length)].join('/') +
          '%</p>'
        : '<p class="footnote">' +
          (practice ? '开发试玩不发卡，也不推进关卡。' : '主动退出或失效对局不发卡。') +
          '</p>') +
      (provider && reward && reward.tier < 3 && !receipt.upgraded && !practice
        ? button(
            'upgrade-card',
            '观看广告，替换为' + TIERS[reward.tier + 1] + '「' + CARD_NAMES[reward.kind] + '」',
          )
        : '') +
      '<div class="result-actions">' +
      (result.outcome === 'victory' && next && !practice ? button('next', '下一战', true) : '') +
      button('again', '重试此布阵', result.outcome !== 'victory') +
      button('result-home', '返回主页') +
      '</div><p id="result-sync" class="footnote"></p></section>',
  );
  on('next', () => prepare(next.id));
  on('again', () => prepare(state.levelId, practice, seed));
  on('result-home', home);
  on('upgrade-card', upgrade);
  if (remote) {
    const client = remote;
    void client
      .result()
      .then((data) => {
        if (screen === 'result' && client === remote)
          $('result-sync').textContent = data.persisted
            ? '服务端战报已保存'
            : '本次战报未写入服务端';
      })
      .catch(() => {
        if (screen === 'result' && client === remote)
          $('result-sync').textContent = '服务端保存尚未确认';
      });
  }
}
async function upgrade() {
  if (adBusy || screen !== 'result' || !reward || reward.tier >= 3) return;
  adBusy = true;
  const id = runId, token = ++adEpoch, armory = save.armory;
  $('upgrade-card').disabled = true;
  let result;
  try {
    result = await provider?.show({ opportunityId: 'tianxia-chalu:rank-card-' + id, kind: 'rewarded' }) ?? { status: 'unavailable' };
  } catch { result = { status: 'failed' }; }
  if (token !== adEpoch || screen !== 'result' || runId !== id || save.armory !== armory) return;
  const changed = upgradeCard(armory, id, result.status);
  if (changed) persist();
  adBusy = false;
  if (screen === 'result' && runId === id) {
    finish();
    toast(
      changed
        ? '已替换为更高一级奖励卡'
        : result.status === 'dismissed'
          ? '已保留原奖励卡'
          : '当前未能完成观看，原奖励卡已保留',
    );
  }
}
function events() {
  for (const event of state.events) {
    if (event.id <= lastEvent) continue;
    lastEvent = event.id;
    let sound = event.type;
    if (event.type === 'capture')
      sound = event.previousOwner === 0 ? 'lost' : event.factionId === 0 ? 'capture' : null;
    if (['switch', 'hold'].includes(event.type) && event.factionId !== 0) sound = null;
    if (sound && !['finished', 'battle'].includes(sound)) audio.event(sound);
    if ($('battle-message') && ['capture', 'general', 'elimination'].includes(event.type))
      $('battle-message').textContent =
        event.type === 'capture'
          ? (event.factionId === 0 ? '夺下' : '易主：') +
            (state.cities.find((c) => c.id === event.cityId)?.name ?? '城池')
          : event.type === 'general'
            ? '将星出阵，留意光环范围'
            : FACTIONS[event.factionId].name + '阵营覆灭';
  }
}
async function poll() {
  if (!remote || pollBusy) return;
  pollBusy = true;
  const client = remote;
  try {
    const snapshot = await client.poll();
    if (client !== remote) return;
    state = snapshot.state;
    bridge.state = state;
    revision = snapshot.revision;
    if (screen === 'battle') {
      events();
      if (state.status === 'finished') finish();
    }
  } catch {
    if (client === remote && screen === 'battle') void pause('连接中断，请继续重连。');
  } finally {
    pollBusy = false;
  }
}
function frame(now) {
  if (screen === 'battle' && state?.status === 'playing') {
    if (remote) {
      if (now - lastPoll > 350) {
        lastPoll = now;
        void poll();
      }
    } else {
      if (lastFrame) tick(state, Math.min((now - lastFrame) / 1000, 0.25));
      events();
      if (state.status === 'finished') finish();
    }
    audio.frame(now, state);
    lastFrame = now;
  } else lastFrame = 0;
  if (now - lastUI > 100) {
    lastUI = now;
    if (['battle', 'prepare'].includes(screen)) {
      updateHud();
      updateTutorial();
      if (screen === 'battle') discover();
    }
  }
  requestAnimationFrame(frame);
}
function snapshot() {
  const layout = bridge.layout;
  return {
    screen,
    practice,
    status: state?.status,
    spawns: state?.spawns,
    roads: state?.roads,
    duration: state?.duration,
    stats: state?.stats,
    mode: remote ? 'server' : 'local',
    levelId: state?.levelId,
    time: state?.time,
    seed: state?.seed,
    revision,
    ready: bridge.ready,
    artReady: bridge.artReady,
    selected,
    preview: !!bridge.preview,
    range,
    rankings: state ? getScore(state) : [],
    result: state?.result,
    cities: state?.cities.map((c) => ({
      ...c,
      client:
        bridge.cityPoints?.[c.id] ??
        (layout
          ? {
              x: layout.left + (layout.rotated ? c.y : c.x) * layout.scale,
              y: layout.top + (layout.rotated ? 390 - c.x : c.y) * layout.scale,
            }
          : null),
    })),
    junctions: state?.junctions,
    packets: state?.packets,
    generals: state?.generals,
    audio: audio.snapshot(),
  };
}
globalThis.tianxiaSnapshot = () => structuredClone(snapshot());
window.addEventListener('resize', () => {
  gesture = null;
  bridge.preview = null;
  syncBoard();
});
document.addEventListener('visibilitychange', () => {
  gesture = null;
  bridge.preview = null;
  lastFrame = 0;
  backgrounded = document.hidden;
  if (document.hidden) {
    if (screen === 'battle') void pause();
    audio.pause();
  }
});
window.addEventListener('blur', () => {
  backgrounded = true;
  gesture = null;
  bridge.preview = null;
  if (screen === 'battle') void pause();
});
window.addEventListener('focus', () => {
  backgrounded = document.hidden;
});
window.addEventListener('pagehide', () => {
  cancelUpgrade();
  backgrounded = true;
  if (screen === 'battle') void pause();
  audio.dispose();
  publishing.dispose();
});
window.addEventListener('pageshow', (event) => {
  backgrounded = document.hidden;
  if (event.persisted) publishing = newPublishing();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && screen === 'battle') void pause();
});
if (location.pathname.startsWith('/play') && !save.settings.serverUrl) {
  save.settings.serverUrl = location.origin;
  save.settings.online = true;
}
if (debug) {
  globalThis.SmallGamesDev.registerSnapshot(snapshot);
  globalThis.SmallGamesDev.registerActions([
    ...LEVELS.map((l) => ({
      id: 'level-' + l.order,
      label: '试玩 ' + l.order + ' ' + l.name,
      run: () => prepare(l.id, true),
    })),
    {
      id: 'trial-level',
      label: '试玩四方逐鹿（不计进度）',
      run: () => prepare('four-kingdoms', true),
    },
    {
      id: 'finish',
      label: '快速结算（不计进度）',
      run: () => {
        if (state && !remote && screen === 'battle') {
          markPractice();
          tick(state, state.duration);
          finish();
        }
      },
    },
    {
      id: 'win',
      label: '测试胜利（不计进度）',
      run: () => {
        if (state && !remote && screen === 'battle') {
          markPractice();
          for (const c of state.cities) c.owner = 0;
          for (const j of state.junctions) j.owner = 0;
          state.packets = [];
          state.generals = [];
          tick(state, 0.1);
          finish();
        }
      },
    },
  ]);
}
home();
requestAnimationFrame(frame);
