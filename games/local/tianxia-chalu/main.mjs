import {
  FACTIONS,
  LEVELS,
  CITY_TYPES,
  GENERAL_TYPES,
  WEAPONS,
  createMatch,
  tick,
  switchRoute,
  setRoute,
  getLevel,
  getScore,
  getUnlockedLevels,
  applyResult,
  effectSources,
} from './src/core/index.mjs';
import {
  normalizeCareer,
  getRank,
  applyCareerResult,
  careerWinRate,
} from './src/core/progression.mjs';
import { createMapInput, createOrderQueue, activeRoutes } from './src/input/orders.mjs';
import { readSave, writeSave } from './storage.mjs';
import { RemoteMatch, RemotePlayer, normalizeServer } from './remote.mjs';
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
  queuedOrders = 0,
  tutorialStep = 0,
  tutorialSeen = new Set(),
  startedCards = [],
  adBusy = false,
  adEpoch = 0,
  backgrounded = false,
  matched = false,
  playerClient = null,
  queueTimer = null,
  queueBusy = false,
  queueRequest = null,
  queueEpoch = 0,
  exitConfirm = false,
  connectionLost = false,
  careerReward = null,
  resultSyncBusy = null;
const queueMemberships = new Map();
const debug =
  globalThis.SmallGamesDev?.enabled === true || globalThis.SmallGamesDev?.isEnabled?.() === true;
const audio = createAudio(() => save.settings);
const playerFaction = () => state?.playerFactionId ?? 0;
const canOrder = () =>
  ['battle', 'prepare'].includes(screen) && !starting && !exitConfirm && !connectionLost;
const isLiveScreen = () => ['battle', 'intel', 'reconnect'].includes(screen);
globalThis.Tianxia = {
  state: null,
  screen,
  selected: null,
  preview: null,
  range: null,
  ready: false,
  artReady: false,
  pointer,
  inputBlocked: false,
  cancelRoute: (sourceId, targetId) => {
    if (canOrder()) orders.push({ kind: 'cancel-route', sourceId, targetId });
  },
};
const bridge = globalThis.Tianxia;
const orders = createOrderQueue({
  read: () => ({ state, enabled: canOrder() }),
  send: sendOrder,
  changed: (count) => {
    queuedOrders = count;
  },
  completed: (intent) => {
    tutorialSeen.add(intent.kind === 'hold' ? 'hold' : 'route');
    updateTutorial();
  },
  failed: (error) => {
    toast(error.message);
    if (remote && error.code && !error.rejected && screen === 'battle')
      connectionFailure('连接中断，正在重新确认军令…');
  },
});
const mapInput = createMapInput({
  read: () => ({
    state,
    selected,
    scale: bridge.layout?.scale ?? 1,
    enabled: canOrder(),
  }),
  select: (id) => {
    selected = id;
    bridge.selected = id;
    if (state?.cities.find((c) => c.id === id)?.owner === playerFaction())
      tutorialSeen.add('select');
    updateHud();
    updateTutorial();
  },
  preview: (point) => {
    bridge.preview = point;
  },
  submit: (intent) => orders.push(intent),
  notify: toast,
});
function cancelInput() {
  mapInput.cancel();
  orders.cancel();
}

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
    try {
      provider?.dispose?.();
    } catch {
      /* Navigation remains available. */
    }
  }
  adBusy = false;
}
function show(next, html) {
  if (next !== screen) cancelUpgrade();
  exitConfirm = false;
  bridge.inputBlocked = connectionLost;
  cancelInput();
  screen = next;
  bridge.screen = next;
  bridge.state = state;
  bridge.selected = selected;
  bridge.range = range;
  lastFrame = 0;
  document.body.dataset.screen = next;
  $('game').innerHTML = html;
  const playing = ['battle', 'prepare', 'intel', 'reconnect', 'result'].includes(next);
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
function serviceOrigin() {
  const origin =
    save.settings.serverUrl || (location.pathname.startsWith('/play') ? location.origin : '');
  try {
    return origin ? normalizeServer(origin) : '';
  } catch {
    return '';
  }
}
function careerSource() {
  return remote || matched || save.settings.online ? 'online' : 'local';
}
function currentCareer(source = careerSource()) {
  return normalizeCareer(
    source === 'online' ? save.onlineProfile?.[serviceOrigin()]?.career : save.career,
  );
}
function rankCard(career, id, source = careerSource()) {
  const rank = getRank(career.xp),
    rate = careerWinRate(career, source === 'online' ? 'matched' : 'pve');
  return (
    '<button id="' +
    id +
    '" class="rank-summary"><span class="rank-seal" aria-hidden="true">令</span><span><strong>' +
    esc(rank.name) +
    '</strong><span class="xp-track"><i style="width:' +
    Math.round(rank.progress * 100) +
    '%"></i></span><small>' +
    (source === 'online' ? '在线军衔 · ' : '本机军衔 · ') +
    (rank.level === rank.maxLevel
      ? '已达最高军衔'
      : '经验 ' + rank.levelXp + ' / ' + rank.nextLevelXp) +
    '</small></span><span class="rank-win"><small>' +
    (source === 'online' ? '匹配胜率' : '人机胜率') +
    '</small><b>' +
    (rate === null ? '—' : Math.round(rate * 100) + '%') +
    '</b></span></button>'
  );
}
function storeProfile(client, profile) {
  if (!profile) return;
  save.onlineProfile ??= {};
  save.onlineProfile[client.origin] = profile;
  persist();
}
async function connectPlayer() {
  const origin = serviceOrigin();
  if (!origin) throw new Error('先在设置中填写对局服务地址，再寻找同服玩家');
  if (!playerClient || playerClient.origin !== origin)
    playerClient = new RemotePlayer(origin, save.onlineIdentity?.[origin]);
  const client = playerClient;
  const data = await client.connect();
  save.onlineIdentity ??= {};
  save.onlineIdentity[origin] = { playerId: data.playerId, token: data.token };
  storeProfile(client, data.profile);
  return client;
}
function records(
  mode = careerSource() === 'online' && save.onlineProfile?.[serviceOrigin()] ? 'online' : 'local',
) {
  const profile = save.onlineProfile?.[serviceOrigin()];
  const career = normalizeCareer(mode === 'online' ? profile?.career : save.career);
  const rank = getRank(career.xp);
  page(
    '战绩与军衔',
    rankCard(career, 'rank-detail', mode) +
      '<div class="tabs"><button id="records-local" class="' +
      (mode === 'local' ? 'active' : '') +
      '">本机征战</button>' +
      '<button id="records-online" class="' +
      (mode === 'online' ? 'active' : '') +
      '" ' +
      (!profile ? 'disabled' : '') +
      '>在线战绩</button></div>' +
      '<p class="footnote">' +
      (mode === 'online'
        ? '按此服务保存的战绩匹配；本机经验不影响在线匹配。'
        : '本机经验随当前浏览器保存；在线战绩独立记录。') +
      '</p>' +
      '<div class="career-stats">' +
      ['pve', 'matched']
        .map((key) => {
          const stats = career[key],
            rate = careerWinRate(career, key);
          return (
            '<article><h3>' +
            (key === 'pve' ? '人机征战' : '真人匹配') +
            '</h3><strong>' +
            (rate === null ? '—' : Math.round(rate * 100) + '%') +
            '</strong><p>' +
            stats.games +
            ' 场 · ' +
            stats.wins +
            ' 胜 · ' +
            stats.losses +
            ' 负 · ' +
            stats.draws +
            ' 平</p></article>'
          );
        })
        .join('') +
      '</div><p class="footnote">' +
      (rank.level === rank.maxLevel
        ? '已达最高军衔'
        : '再获 ' + (rank.nextLevelXp - rank.levelXp) + ' 经验晋升') +
      '</p>' +
      '<h3>近期战绩</h3><div class="career-history">' +
      (career.recent.length
        ? career.recent
            .map(
              (entry) =>
                '<article><b class="outcome-' +
                entry.outcome +
                '">' +
                { victory: '胜', defeat: '败', draw: '和' }[entry.outcome] +
                '</b><span>' +
                (entry.mode === 'matched' ? '真人匹配' : '人机征战') +
                '<small>' +
                time(entry.elapsed) +
                (entry.reason === 'abandoned' ? ' · 投降' : '') +
                '</small></span><strong>+' +
                entry.xp +
                ' 经验</strong></article>',
            )
            .join('')
        : '<p class="empty-state">出征后，战绩将在这里留下。</p>') +
      '</div>',
  );
  on('records-local', () => records('local'));
  on('records-online', () => records('online'));
  on('rank-detail', () => {
    toast('新卒 → 伍长 → 什长 → 百夫长 → 校尉 → 都尉 → 将军 → 统帅 → 传说；每阶五级');
  });
}
function membershipKey(client = playerClient) {
  return client?.token ? client.origin + '\0' + client.token : null;
}
function queueMembership(client = playerClient) {
  return queueMemberships.get(membershipKey(client)) ?? 'none';
}
function setQueueMembership(client, membership) {
  const key = membershipKey(client);
  if (key) queueMemberships.set(key, membership);
}
function acceptQueueStatus(client, data) {
  if (!['idle', 'waiting', 'matched'].includes(data?.status))
    throw new Error('匹配状态无法确认，请重试连接');
  setQueueMembership(
    client,
    data.status === 'waiting' ? 'waiting' : data.status === 'idle' ? 'none' : 'uncertain',
  );
}
async function matchmaking() {
  const origin = serviceOrigin();
  if (!origin) {
    page(
      '真人匹配',
      '<div class="matchmaking-page"><div class="match-seal">战</div><h3>与同服玩家争夺山河</h3><p>先连接对局服务，再按军衔与胜率寻找对手。</p>' +
        button('match-settings', '设置服务地址', true) +
        '</div>',
    );
    on('match-settings', settings);
    return;
  }
  const epoch = ++queueEpoch;
  clearTimeout(queueTimer);
  show(
    'matchmaking',
    '<section class="screen"><header class="page-heading">' +
      button('cancel-match', '返回') +
      '<h2>真人匹配</h2><span></span></header><div class="matchmaking-page"><div class="match-seal searching">战</div>' +
      '<h3 id="match-title">正在连接军营</h3><p id="match-status" role="status">读取军衔与胜率…</p>' +
      rankCard(currentCareer('online'), 'matching-rank', 'online') +
      '<p class="footnote">优先匹配实力相近的真人玩家。等待越久，范围逐步扩大；无人时不会以人机替代。</p>' +
      button('match-cancel', '取消匹配') +
      '</div></section>',
  );
  $('cancel-match').onclick = cancelMatchmaking;
  $('match-cancel').onclick = cancelMatchmaking;
  try {
    const client = await connectPlayer();
    if (epoch !== queueEpoch || screen !== 'matchmaking') return;
    $('matching-rank').outerHTML = rankCard(
      normalizeCareer(client.profile.career),
      'matching-rank',
      'online',
    );
    const previousMembership = queueMembership(client);
    setQueueMembership(client, 'uncertain');
    queueRequest = client.queue('join').catch((error) => {
      // A completed rejection cannot have created a new membership. Preserve any older uncertainty.
      if (error.rejected && previousMembership === 'none') setQueueMembership(client, 'none');
      throw error;
    });
    const data = await queueRequest;
    acceptQueueStatus(client, data);
    if (epoch !== queueEpoch || screen !== 'matchmaking') return;
    if (acceptMatchmaking(data, client)) return;
    $('match-title').textContent = '寻找实力相近的对手';
    queueTimer = setTimeout(() => pollMatchmaking(client, epoch), 1200);
  } catch (error) {
    if (epoch !== queueEpoch || screen !== 'matchmaking') return;
    $('match-title').textContent = '暂时无法匹配';
    $('match-status').textContent = error.message;
    $('match-cancel').textContent = '重试连接';
    $('match-cancel').onclick = () => matchmaking();
    if (error.status === 401) {
      const recovery = document.createElement('div');
      recovery.className = 'identity-recovery';
      recovery.innerHTML =
        '<p>在线身份凭证已失效。可重新建立在线档案；旧在线战绩不会迁移，本机进度与其他服务档案会保留。</p>' +
        button('reset-online-profile', '重新建立在线档案');
      $('match-status').after(recovery);
      on('reset-online-profile', () => {
        delete save.onlineIdentity?.[origin];
        delete save.onlineProfile?.[origin];
        playerClient = null;
        persist();
        void matchmaking();
      });
    }
  } finally {
    queueRequest = null;
  }
}
function acceptMatchmaking(data, client) {
  if (data.status !== 'matched') return false;
  clearTimeout(queueTimer);
  queueEpoch++;
  generation++;
  const match = new RemoteMatch(client.origin);
  state = match.join(data).state;
  setQueueMembership(client, 'none');
  remote = match;
  matched = true;
  practice = false;
  settled = false;
  careerReward = null;
  connectionLost = false;
  reward = null;
  selected = range = null;
  runId = match.id;
  seed = state.seed;
  lastEvent = 0;
  startedCards = [];
  bridge.setView?.('reset');
  audio.unlock();
  battle();
  toast('对手已就位，你是' + FACTIONS[playerFaction()].name);
  return true;
}
async function pollMatchmaking(client, epoch) {
  if (queueBusy || epoch !== queueEpoch || screen !== 'matchmaking') return;
  queueBusy = true;
  try {
    queueRequest = client.queue();
    const data = await queueRequest;
    acceptQueueStatus(client, data);
    if (epoch !== queueEpoch || screen !== 'matchmaking') return;
    if (acceptMatchmaking(data, client)) return;
    $('match-status').textContent =
      data.status === 'waiting'
        ? '已等待 ' + Math.floor(data.waitedSeconds ?? 0) + ' 秒 · 寻找同服真人玩家'
        : '排队已结束，请重新匹配';
    if (data.status !== 'waiting') {
      queueEpoch++;
      $('match-cancel').textContent = '重新匹配';
      $('match-cancel').onclick = () => matchmaking();
      return;
    }
  } catch (error) {
    if (epoch !== queueEpoch || screen !== 'matchmaking') return;
    $('match-status').textContent = '连接波动，正在重试…';
  } finally {
    queueBusy = false;
    queueRequest = null;
    if (epoch === queueEpoch && screen === 'matchmaking')
      queueTimer = setTimeout(() => pollMatchmaking(client, epoch), 1200);
  }
}
async function cancelMatchmaking() {
  if (screen !== 'matchmaking') return;
  queueEpoch++;
  clearTimeout(queueTimer);
  $('match-status').textContent = '正在取消匹配…';
  $('match-cancel').disabled = $('cancel-match').disabled = true;
  const client = playerClient;
  try {
    const pendingResult = await queueRequest?.catch(() => null);
    if (pendingResult) {
      acceptQueueStatus(client, pendingResult);
      if (acceptMatchmaking(pendingResult, client)) return;
    }
    if (client?.token && queueMembership(client) !== 'none') {
      const data = await client.queue('cancel');
      acceptQueueStatus(client, data);
      if (acceptMatchmaking(data, client)) return;
      if (data.status !== 'idle') throw new Error('仍在队列中，请再次取消');
    }
    home();
  } catch (error) {
    $('match-status').textContent = '取消尚未确认：' + error.message;
    $('match-cancel').disabled = $('cancel-match').disabled = false;
  }
}
function home() {
  generation++;
  commandBusy = false;
  starting = false;
  backgrounded = document.hidden;
  void remote?.close();
  remote = null;
  state = null;
  selected = null;
  range = null;
  audio.pause();
  matched = false;
  connectionLost = false;
  clearTimeout(queueTimer);
  queueEpoch++;
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
      rankCard(currentCareer(), 'career-home') +
      button('start', save.completed.length ? '继续征战' : '启程征战', true) +
      button('matchmaking', '真人匹配') +
      '<div class="home-links">' +
      button('levels', '山河图') +
      button('records', '战绩') +
      button('armory', '军备') +
      '</div><div class="quiet-links">' +
      button('codex', '图鉴') +
      button('help', '玩法') +
      button('settings', '设置') +
      '</div></div></section>',
  );
  on('start', () => prepare(next.id));
  on('levels', () => levels(next.chapter));
  on('codex', () => codex());
  on('armory', () => armory());
  on('records', () => records());
  on('career-home', () => records());
  on('matchmaking', () => matchmaking());
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
  commandBusy = false;
  starting = false;
  void remote?.close();
  remote = null;
  practice = trial;
  matched = false;
  connectionLost = false;
  careerReward = null;
  bridge.setView?.('reset');
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
      '</p><div id="board" role="img" aria-label="可触控的出征沙盘，点击或拖拽派兵，双击己城屯兵"></div><footer class="battle-bottom"><p id="city-info">各方驻军与留守均为 0 · 可先下军令</p><div id="keyboard-targets" class="sr-only"></div><div class="prepare-loadout">' +
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
  const preparedGeneration = generation;
  await mapInput.flush();
  await orders.idle();
  if (generation !== preparedGeneration || screen !== 'prepare' || starting) return;
  starting = true;
  const token = generation;
  const commands = state.junctions
    .filter((j) => j.owner === playerFaction())
    .flatMap((j) => activeRoutes(j).map((index) => ({ id: j.id, index })));
  const validCards = practice ? [] : equippedCards(save.armory).map((c) => ({ ...c }));
  if (JSON.stringify(validCards) !== JSON.stringify(loadout)) {
    loadout = validCards;
    state = createMatch({
      levelId: state.levelId,
      seed,
      difficulty: save.settings.difficulty,
      loadout: loadout.map(({ kind, tier }) => ({ kind, tier })),
    });
    for (const c of commands) {
      setRoute(state, playerFaction(), c.id, c.index, true);
      state.junctions.find((j) => j.id === c.id).lastSwitchTime = -1;
    }
  }
  const prepared = state;
  $('begin-battle').disabled = true;
  audio.unlock();
  startedCards = [];
  try {
    if (save.settings.online && !practice) {
      const player = await connectPlayer();
      if (token !== generation) return;
      const client = new RemoteMatch(save.settings.serverUrl || location.origin);
      remote = client;
      state = (
        await client.start(prepared.levelId, save.settings.difficulty, {
          seed,
          playerToken: player.token,
          loadout: loadout.map(({ kind, tier }) => ({ kind, tier })),
        })
      ).state;
      if (token !== generation || remote !== client) return;
      for (const c of commands) {
        state = (await client.route(c.id, c.index, true)).state;
        await new Promise((resolve) => setTimeout(resolve, 220));
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
    battle();
    if (backgrounded || document.hidden) audio.pause();
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
function viewControls() {
  return (
    '<div class="map-controls" aria-label="地图视角">' +
    '<div class="view-modes"><button id="view-map" aria-label="地图总览">地图</button><button id="view-city" aria-label="城池细节">城池</button></div>' +
    '<button id="zoom-in" aria-label="放大地图">+</button><button id="zoom-out" aria-label="缩小地图">−</button></div>'
  );
}
function bindViewControls() {
  for (const [id, action] of [
    ['view-map', 'map'],
    ['view-city', 'city'],
    ['zoom-in', 'in'],
    ['zoom-out', 'out'],
  ])
    on(id, () => {
      mapInput.cancel();
      bridge.setView?.(action);
      updateHud();
    });
}
function battle() {
  const l = getLevel(state.levelId);
  bridge.preview = null;
  show(
    'battle',
    '<section class="battle-screen"><header class="battle-top">' +
      button('battle-back', '‹ 返回') +
      '<div class="battle-title"><small>' +
      (matched ? '真人匹配' : practice ? '开发试玩' : '第 ' + l.order + ' 战') +
      '</small><h2>' +
      esc(l.name) +
      '</h2></div><strong id="clock">' +
      time(state.duration - state.time) +
      '</strong></header><div id="factions" class="factions"></div>' +
      '<div id="strength" class="strength-bar" aria-label="各方总兵力对比"></div>' +
      '<div id="board" role="img" aria-label="城池与行军路线，点击或拖拽己城到邻城增加目标，点击箭头叉号撤线"></div>' +
      viewControls() +
      '<p id="battle-message" class="battle-message" role="status"></p><div id="tutorial" class="tutorial" hidden><p id="tutorial-copy"></p>' +
      button('skip-tutorial', '跳过') +
      '</div><footer class="battle-bottom"><div class="selection"><div><strong id="city-info">轻点己城，下达军令</strong><p id="route-name">拖拽连线 · 点 × 撤线</p></div>' +
      button('intel', '军情') +
      '</div><div id="keyboard-targets" class="sr-only"></div></footer><div id="connection-status" class="connection-status" hidden role="status"></div></section>',
  );
  on('battle-back', confirmExit);
  on('intel', openIntel);
  bindViewControls();
  on('skip-tutorial', () => {
    save.tutorials[state.levelId] = true;
    persist();
    updateTutorial();
  });
  if (!backgrounded) audio.resume();
  updateHud();
  updateTutorial();
}
function pointer(phase, p, id) {
  mapInput.pointer(phase, p, id);
}
function issue(index) {
  const j = state?.junctions.find((j) => j.cityId === selected);
  if (!j || j.owner !== playerFaction()) return;
  const sourceId = selected;
  mapInput.cancel();
  selected = bridge.selected = null;
  orders.push(
    index === -1
      ? { kind: 'hold', sourceId }
      : { kind: 'route', sourceId, targetId: j.exits[index] },
  );
  updateHud();
}
async function sendOrder({ sourceId, junctionId, index, enabled }) {
  const token = generation,
    client = remote;
  commandBusy = true;
  try {
    if (client) {
      const snapshot = await client.route(junctionId, index, enabled);
      if (token !== generation || client !== remote) return;
      state = snapshot.state;
    } else {
      const result =
        index < 0
          ? switchRoute(state, playerFaction(), junctionId, index)
          : setRoute(state, playerFaction(), junctionId, index, enabled ?? true);
      if (!result.ok) return result;
      if (screen === 'prepare')
        state.junctions.find((j) => j.id === junctionId).lastSwitchTime = -1;
    }
    tutorialSeen.add(index === -1 ? 'hold' : 'route');
    if (sourceId !== state.spawns[playerFaction()]) tutorialSeen.add('relay');
    if (screen === 'prepare') audio.event(index === -1 ? 'hold' : 'switch');
    bridge.state = state;
    updateHud();
    updateTutorial();
    return { ok: true };
  } finally {
    if (token === generation) commandBusy = false;
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
  const scores = getScore(state);
  if ($('strength')) {
    const total = scores.reduce((sum, entry) => sum + entry.troops, 0);
    $('strength').innerHTML = scores
      .map(
        (entry) =>
          '<i title="' +
          FACTIONS[entry.factionId].name +
          ' ' +
          entry.troops +
          '兵" style="background:' +
          FACTIONS[entry.factionId].color +
          ';flex:' +
          (total ? Math.max(0.01, entry.troops / total) : 1) +
          '"></i>',
      )
      .join('');
    $('strength').setAttribute(
      'aria-label',
      scores.map((entry) => FACTIONS[entry.factionId].name + entry.troops + '兵').join('，'),
    );
  }
  for (const mode of ['map', 'city'])
    $('view-' + mode)?.setAttribute('aria-pressed', String(bridge.view?.mode === mode));
  if ($('factions'))
    $('factions').innerHTML = scores
      .map(
        (r) =>
          '<span class="faction" style="--faction:' +
          FACTIONS[r.factionId].color +
          '"><b>' +
          FACTIONS[r.factionId].shortName +
          '</b> ' +
          (r.factionId === playerFaction() ? '我方 ' : '') +
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
      ? city.owner === playerFaction()
        ? activeRoutes(j).length === 0
          ? '正在屯兵，停止新派兵'
          : '派往 ' +
            activeRoutes(j)
              .map((index) => state.cities.find((c) => c.id === j.exits[index]).name)
              .join('、')
        : '非己方城池，可观察城防与兵器'
      : commandBusy || queuedOrders
        ? '军令传达中 · 可继续指挥其他城池'
        : '拖拽连线 · 点 × 撤线 · 双击屯兵';
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
  if (keys && keys.dataset.selected !== (selected ?? '')) {
    keys.dataset.selected = selected ?? '';
    keys.innerHTML =
      city?.owner === playerFaction()
        ? '<button data-target="-1">此城屯兵</button>' +
          j.exits
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
    '快速双击己方城池，停止这座城的新派兵。',
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
  if (matched) {
    $('tutorial').hidden = true;
    return;
  }
  const order = getLevel(state.levelId).order;
  if (order > 4 || save.tutorials[state.levelId]) {
    $('tutorial').hidden = true;
    return;
  }
  if (order === 1)
    tutorialStep = tutorialSeen.has('route') ? 2 : tutorialSeen.has('select') ? 1 : 0;
  if (order === 2) {
    if (tutorialSeen.has('hold')) tutorialStep = Math.max(tutorialStep, 1);
    if (
      tutorialStep === 1 &&
      state.cities.some((c) => c.owner === playerFaction() && c.troops >= 12)
    )
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
    mark('city:' + c.type, c.owner === playerFaction());
    if (c.weapon) mark('weapon:' + c.weapon.kind, c.owner === playerFaction());
    if (c.generalKind) mark('general:' + c.generalKind, false);
  });
  state.generals.forEach((g) => mark('general:' + g.kind, g.owner === playerFaction()));
  if (changed) persist();
}
function closeExitConfirm() {
  exitConfirm = false;
  bridge.inputBlocked = connectionLost;
  $('exit-confirm')?.remove();
  $('battle-back')?.focus();
}
function confirmExit() {
  if (!state || state.status !== 'playing' || exitConfirm) return;
  mapInput.cancel();
  exitConfirm = true;
  bridge.inputBlocked = true;
  const dialog = document.createElement('div');
  dialog.id = 'exit-confirm';
  dialog.className = 'confirm-scrim';
  dialog.innerHTML =
    '<section class="confirm-card" role="dialog" aria-modal="true" aria-labelledby="exit-title"><h2 id="exit-title">投降并退出？</h2>' +
    '<p>退出将判为失败，不获得经验。战斗仍在继续。</p><p id="exit-error" role="status"></p><div class="button-stack">' +
    button('keep-battling', '继续战斗', true) +
    button('surrender', '投降并退出') +
    '</div></section>';
  $('game').appendChild(dialog);
  on('keep-battling', closeExitConfirm);
  on('surrender', surrender);
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const actions = [...dialog.querySelectorAll('button:not(:disabled)')];
    if (!actions.length) return;
    if (event.shiftKey && document.activeElement === actions[0]) {
      event.preventDefault();
      actions.at(-1).focus();
    }
    if (!event.shiftKey && document.activeElement === actions.at(-1)) {
      event.preventDefault();
      actions[0].focus();
    }
  });
  $('keep-battling').focus();
}
async function surrender() {
  if (!exitConfirm || !state) return;
  $('surrender').disabled = true;
  const client = remote,
    token = generation;
  try {
    if (client) {
      state = (await client.action('abandon')).state;
      if (client !== remote || token !== generation) return;
      if (playerClient)
        await client
          .result()
          .then((data) => storeProfile(playerClient, data.profile))
          .catch(() => {});
    } else if (!practice) {
      save.career = applyCareerResult(save.career, {
        id: runId,
        mode: 'pve',
        outcome: 'defeat',
        reason: 'abandoned',
        elapsed: state.time,
      }).career;
      persist();
    }
    home();
  } catch (error) {
    if (client !== remote || token !== generation || !$('exit-error')) return;
    $('exit-error').textContent = '退出尚未确认，请重试：' + error.message;
    $('surrender').disabled = false;
  }
}
function connectionFailure(message) {
  if (!remote || !isLiveScreen()) return;
  connectionLost = true;
  bridge.inputBlocked = true;
  cancelInput();
  const status = $('connection-status');
  if (status) {
    status.hidden = false;
    status.textContent = message;
  }
}
async function resume() {
  if (!state) return;
  const client = remote,
    token = generation;
  try {
    if (client) {
      state = (await client.poll()).state;
      if (client !== remote || token !== generation) return;
      if (state.status === 'playing' && client.pending)
        state = (
          await client.route(
            client.pending.junctionId,
            client.pending.routeIndex,
            client.pending.enabled,
          )
        ).state;
      if (client !== remote || token !== generation) return;
    }
    connectionLost = false;
    bridge.inputBlocked = false;
    if (state.status === 'finished') finish();
    else battle();
  } catch (error) {
    connectionFailure(error.message);
    toast(error.message);
  }
}
async function openIntel() {
  if (!state) return;
  audio.pause();
  tutorialSeen.add('intel');
  const sources = effectSources(state);
  show(
    'intel',
    '<section class="screen document">' +
      header('本场军情') +
      '<div class="page-body"><p class="footnote">' +
      '战斗仍在继续' +
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
    '<div class="help-list"><h3>改道与屯兵</h3><p>点己城选中，再点相邻城派兵；也可直接从己城拖向邻城。下令后自动取消选中，可立即操作其他城池。慢速再次点同城或点空白取消选中；快速双击己城屯兵，仅停止该城的新派兵，入城补给和已出发部队不受影响。重新派兵即可解除屯兵。每城可同时向多个相邻城持续派兵，新目标不会覆盖已有路线；点击路线上的浅色×只撤销该条路线。兵越多，每波人数越多、波次间隔越短；每波人数有小幅随机变化。不能操控敌方城池；道路交叉处不相连，请点连线其他位置。</p><h3>从0兵开始</h3><p>各方驻军和默认留守为0，归属不会因空城自动消失。城池满员停止产兵，援军在城外驻扎，仍可能被攻击。</p><h3>抓住地利</h3><p>兵营产兵快，关隘难攻；驿道快、山路慢。武器各有冷却。点将台稳定占领20秒招募将领，被围攻暂停，易主清零。</p><h3>局部军令</h3><p>「军情」展示各方加成，点来源查看圆形范围。同类取最大值，来源失守、将领退场或部队离圈会失去持续效果。</p><h3>观察与退出</h3><p>双指或滚轮缩放，拖动空白平移；「地图」看全局，「城池」看士兵和局部战力。返回时需确认投降，确认期间战斗继续。</p><h3>军衔与匹配</h3><p>人机获胜20经验、失败8经验；真人匹配获胜100经验、失败35经验、平局50经验，投降不发经验。经验达标晋升军衔，战绩记录胜率。真人匹配不使用军备卡，无人时持续等待，可随时取消。</p><h3>胜负与军备</h3><p>无城、无兵、无将才会被消灭。限时先看存活，再看城数和兵力。结束免费得卡，广告仅将这张卡保证升一级；不观看也能继续征战。</p>' +
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
      '" placeholder="https://example.com"></label><p class="footnote">征战为人机对战，可离线游玩。真人匹配使用此地址寻找同服玩家，按等级与胜率匹配。</p><button class="primary" type="submit">保存设置</button></form>',
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
      if (!matched) {
        applyResult(save, result);
        reward = drawCard(save.armory, result, runId);
      }
      if (!remote) {
        careerReward = applyCareerResult(save.career, {
          id: runId,
          mode: 'pve',
          outcome: result.outcome,
          reason: result.reason,
          elapsed: result.elapsed,
        });
        save.career = careerReward.career;
      }
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
    rank =
      result.rankings.find((r) => r.factionId === playerFaction())?.rank ?? result.rankings.length,
    receipt = save.armory.receipts[runId];
  reward = receipt?.card ?? reward;
  show(
    'result',
    '<section class="screen result"><div class="result-heading"><p class="eyebrow">' +
      (practice
        ? '开发试玩 · 不计进度'
        : matched
          ? '真人匹配 · 战报'
          : '第 ' + getLevel(state.levelId).order + ' 战 · 战报') +
      '</p><div class="result-seal">' +
      ({ victory: '捷', defeat: '憾', draw: '和' }[result.outcome] ?? '终') +
      '</div><h2>' +
      ({ victory: '山河入掌', defeat: '整军再来', draw: '旗鼓相当' }[result.outcome] ??
        '征战结束') +
      '</h2><p>' +
      (explanation ??
        '第 ' +
          rank +
          ' 名 · ' +
          time(result.elapsed) +
          (matched ? '' : ' · 夺城 ' + state.stats.captured)) +
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
            (r.factionId === playerFaction() ? ' · 你' : '') +
            '</span><span>' +
            r.cities +
            '城 / ' +
            r.troops +
            '兵' +
            (!r.alive ? ' · 覆灭' : '') +
            '</span></div>',
        )
        .join('') +
      '</div><p id="experience-gain" class="experience-gain">' +
      (practice
        ? '开发试玩不获取经验'
        : careerReward
          ? '+' +
            careerReward.gained +
            ' 经验 · ' +
            careerReward.rank.name +
            (careerReward.promoted ? ' · 晋升！' : '')
          : '正在确认军衔经验…') +
      '</p>' +
      (reward
        ? '<div id="earned-card">' +
          cardHTML(reward) +
          '</div><p class="footnote">已免费入库 · 本排名四档概率 ' +
          PROBABILITIES[rewardBand(rank, result.rankings.length)].join('/') +
          '%</p>'
        : '<p class="footnote">' +
          (practice
            ? '开发试玩不发卡，也不推进关卡。'
            : matched
              ? '真人匹配不使用军备卡，按战果获得经验。'
              : '主动退出或失效对局不发卡。') +
          '</p>') +
      (provider && reward && reward.tier < 3 && !receipt.upgraded && !practice
        ? button(
            'upgrade-card',
            '观看广告，替换为' + TIERS[reward.tier + 1] + '「' + CARD_NAMES[reward.kind] + '」',
          )
        : '') +
      '<div class="result-actions">' +
      (result.outcome === 'victory' && next && !practice && !matched
        ? button('next', '下一战', true)
        : '') +
      button('again', matched ? '再匹配一局' : '重试此布阵', result.outcome !== 'victory') +
      button('result-home', '返回主页') +
      '</div><p id="result-sync" class="footnote"></p><button id="retry-result" hidden>重新确认结算</button></section>',
  );
  on('next', () => prepare(next.id));
  on('again', () => {
    if (matched) {
      void remote?.close();
      remote = null;
      state = null;
      void matchmaking();
    } else prepare(state.levelId, practice, seed);
  });
  on('result-home', home);
  on('upgrade-card', upgrade);
  on('retry-result', () => syncRemoteResult(remote));
  if (remote) void syncRemoteResult(remote);
}
async function syncRemoteResult(client) {
  if (!client || resultSyncBusy === client) return;
  resultSyncBusy = client;
  if ($('retry-result')) $('retry-result').disabled = true;
  try {
    const data = await client.result();
    if (data.profile && playerClient?.origin === client.origin)
      storeProfile(playerClient, data.profile);
    if (screen !== 'result' || client !== remote) return;
    const paid = data.profile?.career?.settledIds?.includes(client.id);
    if (paid) {
      const rank = getRank(data.profile.career.xp);
      $('experience-gain').textContent =
        '+' + (data.experienceGained ?? 0) + ' 经验 · ' + rank.name;
    } else $('experience-gain').textContent = '经验结算待确认';
    $('result-sync').textContent = data.persisted
      ? '服务端战报已保存'
      : '服务端战报尚未保存，请重新确认结算';
    $('retry-result').hidden = Boolean(data.persisted && paid);
  } catch {
    if (screen === 'result' && client === remote) {
      $('experience-gain').textContent = '经验结算待确认';
      $('result-sync').textContent = '服务端保存尚未确认';
      $('retry-result').hidden = false;
    }
  } finally {
    if (resultSyncBusy === client) resultSyncBusy = null;
    if (screen === 'result' && client === remote && $('retry-result'))
      $('retry-result').disabled = false;
  }
}

async function upgrade() {
  if (adBusy || screen !== 'result' || !reward || reward.tier >= 3) return;
  adBusy = true;
  const id = runId,
    token = ++adEpoch,
    armory = save.armory;
  $('upgrade-card').disabled = true;
  let result;
  try {
    result = (await provider?.show({
      opportunityId: 'tianxia-chalu:rank-card-' + id,
      kind: 'rewarded',
    })) ?? { status: 'unavailable' };
  } catch {
    result = { status: 'failed' };
  }
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
      sound =
        event.previousOwner === playerFaction()
          ? 'lost'
          : event.factionId === playerFaction()
            ? 'capture'
            : null;
    if (['switch', 'hold'].includes(event.type) && event.factionId !== playerFaction())
      sound = null;
    if (sound && !['finished', 'battle'].includes(sound)) audio.event(sound);
    if ($('battle-message') && ['capture', 'general', 'elimination'].includes(event.type))
      $('battle-message').textContent =
        event.type === 'capture'
          ? (event.factionId === playerFaction() ? '夺下' : '易主：') +
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
    if (connectionLost && state.status === 'playing' && client.pending) {
      state = (
        await client.route(
          client.pending.junctionId,
          client.pending.routeIndex,
          client.pending.enabled,
        )
      ).state;
      if (client !== remote) return;
      bridge.state = state;
    }
    connectionLost = false;
    bridge.inputBlocked = exitConfirm;
    if ($('connection-status')) $('connection-status').hidden = true;
    if (isLiveScreen()) {
      events();
      if (state.status === 'finished') finish();
    }
  } catch {
    if (client === remote && isLiveScreen())
      connectionFailure('连接中断，正在重连；服务端战斗仍在继续。');
  } finally {
    pollBusy = false;
  }
}
function frame(now) {
  if (
    isLiveScreen() &&
    state?.status === 'playing' &&
    (remote || (!backgrounded && !document.hidden))
  ) {
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
    mode: matched ? 'matched' : remote ? 'server' : 'local',
    playerFactionId: playerFaction(),
    career: currentCareer(),
    careerSource: careerSource(),
    localCareer: currentCareer('local'),
    onlineCareer: save.onlineProfile?.[serviceOrigin()] ? currentCareer('online') : null,
    queueMembership: queueMembership(),
    view: bridge.view,
    routePoints: bridge.routePoints,
    inputBlocked: bridge.inputBlocked,
    exitConfirm,
    connectionLost,
    levelId: state?.levelId,
    time: state?.time,
    seed: state?.seed,
    revision,
    ready: bridge.ready,
    artReady: bridge.artReady,
    selected,
    preview: !!bridge.preview,
    queuedOrders,
    commandBusy,
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
  cancelInput();
  syncBoard();
});
document.addEventListener('visibilitychange', () => {
  cancelInput();
  lastFrame = 0;
  backgrounded = document.hidden;
  if (document.hidden) audio.pause();
  else if (isLiveScreen()) {
    audio.resume();
    if (remote) void poll();
  }
});
window.addEventListener('blur', () => {
  backgrounded = true;
  cancelInput();
  lastFrame = 0;
  audio.pause();
});
window.addEventListener('focus', () => {
  backgrounded = document.hidden;
  lastFrame = 0;
  if (isLiveScreen()) {
    audio.resume();
    if (remote) void poll();
  }
});
window.addEventListener('pagehide', () => {
  cancelInput();
  cancelUpgrade();
  backgrounded = true;
  lastFrame = 0;
  audio.dispose();
  publishing.dispose();
});
window.addEventListener('pageshow', (event) => {
  backgrounded = document.hidden;
  if (event.persisted) publishing = newPublishing();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && screen === 'battle') {
    if (exitConfirm) closeExitConfirm();
    else confirmExit();
  }
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
