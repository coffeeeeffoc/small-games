import './client.js';
import styles from './street.css?inline';
import { scoreText, gapText, playerName } from './format.js';
import { getRoleAppearance } from '../../games/local/cops-robbers-realtime/src/role-appearance.js';

const roleNames = { pursuer: '警察', runner: '小偷', random: '随机先行' };
const spriteUrl = new URL('./src/assets/characters.png', document.baseURI).href;
const cityUrl = new URL('./src/assets/home-city.png', document.baseURI).href;
const icons = {
  back: '<path d="m14 5-7 7 7 7"/>',
  arrow: '<path d="m9 5 7 7-7 7"/>',
  home: '<path d="m3 11 9-8 9 8M5 10v11h5v-7h4v7h5V10"/>',
  friends:
    '<circle cx="8" cy="7" r="3"/><circle cx="17" cy="8" r="3"/><path d="M2 21v-3a6 6 0 0 1 12 0v3M16 15a5 5 0 0 1 6 5"/>',
  trophy:
    '<path d="M7 3h10v7a5 5 0 0 1-10 0ZM7 5H3v3a4 4 0 0 0 4 4M17 5h4v3a4 4 0 0 1-4 4M12 15v6M8 21h8"/>',
  link: '<path d="m9 15 6-6M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',
  check: '<path d="m5 12 4 4L20 5"/>',
  play: '<path d="m8 4 12 8-12 8Z"/>',
  shield: '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Z"/><path d="m8 12 3 3 5-6"/>',
  star: '<path d="m12 2 3 7 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1Z"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5M19 12a7 7 0 0 0-12-5M5 12a7 7 0 0 0 12 5"/>',
  pen: '<path d="m15 3 6 6-11 11-7 1 1-7ZM12 6l6 6"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.star}</svg>`;

// This game uses routes instead of the shared modal. Room state and scoring still
// come exclusively from the competition client, including retries and recovery.
export function mountStreetCompetition(game, createRenderer) {
  if (document.querySelector('[data-competition-launch]')) return;
  globalThis.__CLASSIC_CHASE_ROLES__ = true;
  globalThis.__installCompetition();
  const client = globalThis.__competition;
  const renderer = createRenderer({
    createImage: () => new Image(),
    assetBase: new URL('./', location.href).href,
  });
  const style = document.createElement('style');
  style.textContent = styles;
  document.head.append(style);
  const launch = document.createElement('button');
  launch.dataset.competitionLaunch = '';
  launch.className = 'street-pk-launch';
  launch.textContent = '好友 PK · 全站榜';
  launch.hidden = !!document.querySelector('[data-competition-entry]');
  const surface = document.createElement('div');
  surface.className = 'street-competition';
  surface.dataset.streetCompetition = '';
  surface.hidden = true;
  surface.open = false;
  surface.setAttribute('aria-label', '街区追捕 · 好友 PK');
  surface.style.setProperty('--sp-sprites', `url("${spriteUrl}")`);
  surface.style.setProperty('--sp-city', `url("${cityUrl}")`);
  surface.innerHTML = `<div class="sp-shell">
    <header class="sp-header"><button class="sp-back" data-page-back aria-label="返回">${icon('back')}</button><div><h1 data-page-title>好友 PK</h1><p data-page-subtitle>叫上好友，一起追逐！</p></div><button class="sp-help" data-rules aria-label="查看玩法">?</button></header>
    <p class="sp-status" role="status" aria-live="polite" data-status>邀请一位好友，一起玩一局。</p>
    <main class="sp-pages">
      <section class="sp-page" data-page="lobby" data-lobby>
        <div class="sp-vs-hero"><span class="sp-figure" data-figure="pursuer"></span><strong class="sp-vs">VS</strong><span class="sp-figure" data-figure="runner"></span><i class="sp-spark sp-spark-one">✦</i><i class="sp-spark sp-spark-two">✦</i></div>
        <div class="sp-entry-grid"><button class="sp-entry sp-entry-blue" data-go="create">${icon('home')}<strong>创建房间</strong><small>邀请好友一起玩</small><span class="sp-entry-arrow">${icon('arrow')}</span></button><button class="sp-entry sp-entry-coral" data-go="join">${icon('friends')}<strong>加入房间</strong><small>好友正在等你</small><span class="sp-entry-arrow">${icon('arrow')}</span></button></div>
        <div class="sp-profile-card"><span class="sp-portrait" data-avatar></span><div><strong data-profile-name>街区新伙伴</strong><small>用你的昵称和好友见面</small></div><button data-profile aria-label="设置昵称">${icon('pen')}</button></div>
        <button class="sp-wide-link" data-board>${icon('trophy')}<span><strong>全站榜</strong><small>看看谁是街区追捕高手</small></span>${icon('arrow')}</button>
        <p class="sp-note">游客身份保存在当前浏览器，昵称可以重名。</p>
      </section>
      <section class="sp-page" data-page="create" hidden>
        <h2 class="sp-section-heading">选择你的阵营</h2><div class="sp-choice-roles"><button data-match-role="pursuer" aria-pressed="true"><span class="sp-figure" data-figure="pursuer"></span><strong>我是警察</strong><small>协作包围，抓住小偷！</small><i>${icon('check')}</i></button><button data-match-role="runner" aria-pressed="false"><span class="sp-figure" data-figure="runner"></span><strong>我是小偷</strong><small>灵活躲避，坚持到最后！</small><i>${icon('check')}</i></button></div>
        <h2 class="sp-section-heading">选择对战模式</h2><div class="sp-mode-grid" data-match-modes></div>
        <h2 class="sp-section-heading">谁先行动？</h2><div class="sp-segments" data-match-initiative><button data-initiative="pursuer" aria-pressed="false">警察先行</button><button data-initiative="runner" aria-pressed="false">小偷先行</button><button data-initiative="random" aria-pressed="true">随机</button></div>
        <div class="sp-info-pills"><span>${icon('friends')}<strong>2 人 PK</strong><small>各自操控一方</small></span><span>${icon('shield')}<strong>2 秒先行</strong><small>随后同时行动</small></span></div>
        <button class="sp-primary" data-create>${icon('play')}创建房间</button><p class="sp-note">地图从对应模式的 100 关中抽取。</p>
      </section>
      <section class="sp-page" data-page="join" hidden>
        <div class="sp-vs-hero sp-vs-hero-small"><span class="sp-figure" data-figure="pursuer"></span><strong class="sp-vs">VS</strong><span class="sp-figure" data-figure="runner"></span></div>
        <form class="sp-card sp-join-form" data-join-form><label for="street-room-code">输入好友的房间码</label><input id="street-room-code" data-code minlength="12" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="12 位房间码" required><small>让好友把房间码或邀请链接发给你</small><button class="sp-primary" data-join type="submit">加入房间 ${icon('arrow')}</button></form>
      </section>
      <section class="sp-page" data-page="room" data-room hidden>
        <div class="sp-vs-hero sp-room-hero"><span class="sp-figure" data-figure="pursuer"></span><strong class="sp-vs">VS</strong><span class="sp-figure" data-figure="runner"></span></div>
        <div class="sp-room-code-card"><small>房间码 · 分享给好友</small><button data-share aria-label="查看邀请和复制房间码"><strong data-room-code></strong>${icon('link')}</button></div>
        <div class="sp-players" data-players></div>
        <p class="sp-room-hint" data-room-hint></p>
        <div class="sp-room-settings" data-role-options><h2 class="sp-section-heading">我的阵营</h2><div class="sp-segments"><button data-role="pursuer">警察</button><button data-role="runner">小偷</button></div><h2 class="sp-section-heading">谁先行动？</h2><div class="sp-segments" data-room-initiative><button data-room-lead="pursuer">警察先行</button><button data-room-lead="runner">小偷先行</button><button data-room-lead="random">随机</button></div><small data-initiative-note></small></div>
        <button class="sp-invite-link" data-invite>${icon('link')}邀请好友，一起来玩</button><button class="sp-primary" data-ready>准备好了 ${icon('play')}</button><button class="sp-primary" data-rematch hidden>${icon('refresh')}再来一局</button><button class="sp-secondary" data-result hidden>查看对战结果</button><button class="sp-text-button" data-close>离开房间，回到首页</button>
      </section>
      <section class="sp-page sp-play-page" data-page="play" hidden><div class="sp-play-info"><strong data-play-role></strong><span>点击角色，再点道路移动</span></div><canvas data-play aria-label="好友挑战操作区"></canvas><div class="sp-play-actions"><button data-rules>玩法说明</button><button data-invite>邀请信息</button><button data-close>离开对局</button></div></section>
      <section class="sp-page" data-page="board" hidden><div class="sp-board-intro">${icon('trophy')}<h2>街区高手榜</h2><p data-board-summary>正在读取全站成绩…</p></div><div data-board-content></div><button class="sp-secondary" data-refresh-board>${icon('refresh')}刷新榜单</button></section>
      <section class="sp-page" data-page="nickname" hidden><div class="sp-name-hero"><span class="sp-portrait" data-name-avatar></span><i>✦</i><i>✦</i></div><form class="sp-card sp-name-form" data-name-form><label for="street-nickname">你的昵称</label><div class="sp-name-input"><input id="street-nickname" name="name" maxlength="32" autocomplete="off" spellcheck="false" required aria-label="你的昵称">${icon('pen')}</div><small>2–16 个中英文字、数字、空格或 · _ -</small><p class="sp-form-message" role="status" data-name-message></p><button class="sp-primary" type="submit" data-save-name>${icon('check')}保存昵称</button></form><p class="sp-note">成绩会跟随你的账号，修改昵称后仍然保留。</p><div class="sp-player-id"><small>我的玩家 ID</small><code data-player-id></code></div></section>
      <section class="sp-page" data-page="rules" hidden><div class="sp-rules-hero">${icon('shield')}<h2>街区追捕，开局指南</h2><p>选中角色，点击道路，开始追逐！</p></div><div class="sp-card" data-rules-content></div><button class="sp-primary" data-page-return>知道啦，返回 ${icon('arrow')}</button></section>
      <section class="sp-page" data-page="results" hidden><div class="sp-result-hero"><span class="sp-figure" data-figure="pursuer"></span><span class="sp-result-trophy">${icon('trophy')}</span><span class="sp-figure" data-figure="runner"></span><h2 data-result-title>这局打得漂亮！</h2><p>好友对战 · 本局积分已确认</p></div><div class="sp-results" data-results></div><button class="sp-primary" data-result-rematch>${icon('refresh')}再来一局</button><button class="sp-secondary" data-board>${icon('trophy')}查看全站榜</button><button class="sp-text-button" data-close>${icon('home')}回到首页</button></section>
      <section class="sp-page" data-page="invite" hidden><div class="sp-invite-hero">${icon('friends')}<h2>叫上好友，一起追逐！</h2><p>一人当警察，一人当小偷</p></div><div class="sp-card sp-invite-card"><small>你的房间码</small><strong data-invite-code></strong><button class="sp-primary" data-copy-code>${icon('link')}复制房间码</button><small>或把邀请链接发给好友</small><input data-invite-url readonly aria-label="邀请链接"><button class="sp-secondary" data-copy-link>${icon('link')}复制邀请链接</button><p class="sp-form-message" role="status" data-invite-message></p></div><button class="sp-text-button" data-page-return>返回房间 ${icon('arrow')}</button></section>
    </main>
    <nav class="sp-bottom-nav" aria-label="好友对战导航"><button data-home>${icon('home')}首页</button><button data-go="lobby" aria-pressed="true">${icon('friends')}好友 PK</button><button data-board>${icon('trophy')}全站榜</button></nav>
  </div>`;
  document.body.append(launch, surface);
  const select = (query) => surface.querySelector(query);
  const all = (query) => [...surface.querySelectorAll(query)];
  const status = select('[data-status]');
  const canvas = select('canvas');
  const ctx = canvas.getContext('2d');
  let room = null,
    profile = null,
    modes = [],
    metadata = null;
  let poll = null,
    frame = 0,
    lastPoll = 0,
    busy = false,
    exiting = false,
    pending = null,
    resultShown = null;
  let current = 'lobby',
    trail = [],
    returnFocus = null;
  let viewSource = null,
    viewState = null,
    viewTurned = false;
  let sessionGeneration = 0,
    busyGeneration = 0;
  let historyDepth = 0,
    historySession = null;
  const preferences = { mode: 'classic', role: 'pursuer', initiative: 'random' };
  const pageTitles = {
    lobby: ['好友 PK', '叫上好友，一起来一场街区追逐！'],
    create: ['创建房间', '选好阵营，等好友一起出发'],
    join: ['加入房间', '好友在等你，快来集合！'],
    room: ['等好友就位', '邀请好友，准备好就出发'],
    play: ['好友追逐中', ''],
    board: ['全站榜', '每一局，都离高手更近一点'],
    nickname: ['设置昵称', '取个有趣的名字，让好友认出你'],
    rules: ['这局怎么玩', ''],
    results: ['对战结果', ''],
    invite: ['邀请好友', '把房间码分享给你的伙伴'],
  };

  function node(tag, value, className = '') {
    const element = document.createElement(tag);
    element.textContent = value;
    if (className) element.className = className;
    return element;
  }
  function feedback(value) {
    status.textContent = value instanceof Error ? value.message : String(value);
    status.toggleAttribute('data-error', value instanceof Error);
  }
  const isCurrent = (generation) => surface.open && generation === sessionGeneration;
  const detachedKey = `competition-detached-rooms:${game}`;
  function detachedRooms() {
    try {
      return JSON.parse(localStorage.getItem(detachedKey) || '[]').filter((code) =>
        /^[A-F0-9]{12}$/.test(code),
      );
    } catch {
      return [];
    }
  }
  function rememberDetached(code) {
    try {
      localStorage.setItem(detachedKey, JSON.stringify([...new Set([...detachedRooms(), code])]));
    } catch {}
  }
  function forgetDetached(code) {
    try {
      localStorage.setItem(
        detachedKey,
        JSON.stringify(detachedRooms().filter((item) => item !== code)),
      );
    } catch {}
  }
  async function leaveDetached(value) {
    if (!value?.code || !['waiting', 'playing'].includes(value.status)) return;
    // A reopened session may already have recovered this exact room.
    if (surface.open && room?.code === value.code) return;
    rememberDetached(value.code);
    try {
      await client.request(`/rooms/${value.code}/leave`, { body: '{}' });
      forgetDetached(value.code);
    } catch {
      /* Retry on the next entry without replacing a new room. */
    }
  }
  async function receiveRoom(value, generation) {
    if (!isCurrent(generation)) {
      await leaveDetached(value);
      return;
    }
    accept(value, generation);
  }
  function portrait(role = 'pursuer') {
    const element = node('span', '', 'sp-portrait');
    decoratePortrait(element, role);
    return element;
  }
  function decoratePortrait(element, role = 'pursuer') {
    const appearance = getRoleAppearance(role);
    element.style.removeProperty('background-image');
    element.dataset.portraitRole = role;
    element.dataset.preset = String(Number(appearance.preset) || 0);
    if (appearance.avatar) {
      element.style.backgroundImage = `url("${appearance.avatar}")`;
      element.dataset.custom = '';
    } else element.removeAttribute('data-custom');
  }
  function updateProfile(value) {
    profile = value;
    select('[data-profile-name]').textContent = value.name;
    select('[data-player-id]').textContent = value.playerId;
    decoratePortrait(select('[data-avatar]'));
    decoratePortrait(select('[data-name-avatar]'));
    for (const figure of all('[data-figure]')) {
      figure.style.backgroundPositionX = `${getRoleAppearance(figure.dataset.figure).preset * 50}%`;
    }
  }
  function navigate(page, { remember = true, animate = true, syncHistory = true } = {}) {
    if (!select(`[data-page="${page}"]`)) return;
    const changed = current !== page;
    if (remember && changed) trail.push(current);
    current = page;
    if (surface.open && syncHistory && historySession) {
      if (remember && changed) {
        historyDepth++;
        history.pushState(
          {
            ...history.state,
            streetPage: page,
            streetSession: historySession,
            streetDepth: historyDepth,
          },
          '',
          location.href,
        );
      } else
        history.replaceState(
          {
            ...history.state,
            streetPage: page,
            streetSession: historySession,
            streetDepth: historyDepth,
          },
          '',
          location.href,
        );
    }
    for (const section of all('[data-page]')) section.hidden = section.dataset.page !== page;
    surface.dataset.page = page;
    surface.toggleAttribute('data-playing', page === 'play');
    select('[data-page-title]').textContent =
      page === 'room' && room?.players.length === 2 ? '好友已就位' : pageTitles[page][0];
    select('[data-page-subtitle]').textContent = pageTitles[page][1];
    select('.sp-bottom-nav').hidden = !['lobby', 'board'].includes(page);
    for (const button of all('.sp-bottom-nav button'))
      button.setAttribute(
        'aria-pressed',
        String(
          page === 'board' ? button.hasAttribute('data-board') : button.dataset.go === 'lobby',
        ),
      );
    const target = select(`[data-page="${page}"]`);
    target.scrollTop = 0;
    if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches)
      target.animate(
        [
          { opacity: 0, transform: 'translateX(26px)' },
          { opacity: 1, transform: 'translateX(0)' },
        ],
        { duration: 230, easing: 'cubic-bezier(.2,.7,.2,1)' },
      );
  }
  function back() {
    if (['room', 'play'].includes(current)) {
      void close();
      return;
    }
    if (historyDepth > 0) history.back();
    else if (trail.length) navigate(trail.pop(), { remember: false });
    else void close();
  }
  async function run(task) {
    const generation = sessionGeneration;
    if ((busy && busyGeneration === generation) || exiting || !surface.open) return;
    busy = true;
    busyGeneration = generation;
    surface.setAttribute('aria-busy', 'true');
    try {
      await task(generation);
    } catch (error) {
      if (isCurrent(generation)) {
        if (error.code && error.code !== 'SERVICE_UNAVAILABLE') pending = null;
        feedback(error);
      }
    } finally {
      if (busyGeneration === generation) {
        busy = false;
        surface.removeAttribute('aria-busy');
      }
    }
  }
  function renderModes() {
    const target = select('[data-match-modes]');
    target.replaceChildren();
    if (!modes.length) {
      target.append(node('p', '对战服务暂未连接，请返回后重试。', 'sp-empty'));
      select('[data-create]').disabled = true;
      return;
    }
    select('[data-create]').disabled = false;
    if (!modes.some((mode) => mode.id === preferences.mode)) preferences.mode = modes[0].id;
    for (const mode of modes) {
      const button = node('button', '', 'sp-mode-card');
      button.dataset.matchMode = mode.id;
      button.setAttribute('aria-pressed', String(mode.id === preferences.mode));
      const symbol = node('span', mode.id === 'escape' ? '↗' : '★', 'sp-mode-symbol');
      button.append(
        symbol,
        node(
          'strong',
          mode.id === 'classic' ? '经典围捕' : mode.id === 'escape' ? '出口竞速' : mode.title,
        ),
        node('small', mode.id === 'escape' ? '抢先到达出口，突破包围' : '合作追捕，守住整条街区'),
      );
      button.onclick = () => {
        preferences.mode = mode.id;
        for (const item of target.children)
          item.setAttribute('aria-pressed', String(item === button));
      };
      target.append(button);
    }
  }
  function renderPlayers() {
    const target = select('[data-players]');
    target.replaceChildren();
    for (let seat = 0; seat < 2; seat++) {
      const player = room.players[seat];
      const card = node('div', '', 'sp-player');
      if (player) {
        card.dataset.role = player.role || (seat === 0 ? 'pursuer' : 'runner');
        card.toggleAttribute('data-ready', !!player.ready);
        const copy = node('div', '', 'sp-player-copy');
        copy.append(
          node('strong', playerName(player, room.players) + (seat === room.you ? ' · 你' : '')),
          node(
            'small',
            `${roleNames[player.role] || '好友'} · ${room.status === 'waiting' ? (player.ready ? '已准备 ✓' : '等待准备') : room.status === 'finished' ? '对局结束' : '对局中断'}`,
          ),
        );
        card.append(portrait(player.role), copy);
      } else {
        card.dataset.empty = '';
        card.append(
          node('span', '＋', 'sp-wait-avatar'),
          node('div', '等一位好友\n分享邀请给 TA', 'sp-player-copy'),
        );
      }
      target.append(card);
    }
  }
  function accept(value, generation = sessionGeneration) {
    if (!isCurrent(generation)) return;
    const oldStatus = room?.status;
    if (room?.code !== value.code) pending = null;
    room = value;
    const playing = room.status === 'playing';
    const ended = ['finished', 'abandoned', 'expired'].includes(room.status);
    select('[data-room-code]').textContent = room.code;
    select('[data-room-hint]').textContent = ended
      ? room.status === 'finished'
        ? '本局已结束，再来一局继续较量！'
        : '这局暂告一段落，可以重新邀请好友。'
      : `${modes.find((mode) => mode.id === room.mode)?.title || '好友对战'} · 双方准备后自动开始`;
    select('[data-role-options]').hidden = room.status !== 'waiting' || !room.roles;
    select('[data-initiative-note]').textContent =
      room.you === 0
        ? '由你设置先行阵营，修改后双方重新准备。'
        : '由房主设置先行阵营，先行方有 2 秒行动时间。';
    for (const button of all('[data-room-lead]')) {
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.roomLead === (room.initiative || 'random')),
      );
      button.disabled = room.you !== 0;
    }
    for (const button of all('button[data-role]')) {
      const selected = button.dataset.role === room.players[room.you]?.role;
      button.setAttribute('aria-pressed', String(selected));
      button.disabled = selected;
    }
    select('[data-ready]').hidden = room.status !== 'waiting';
    select('[data-ready]').disabled = !!room.players[room.you]?.ready;
    select('[data-ready]').textContent = room.players[room.you]?.ready
      ? '已准备，等好友 ✓'
      : '准备好了！ ▸';
    select('[data-rematch]').hidden = !ended;
    select('[data-result]').hidden = room.status !== 'finished';
    select('[data-invite]').hidden = ended;
    select('[data-play-role]').textContent =
      `你是${roleNames[room.players[room.you]?.role] || '街区伙伴'}`;
    renderPlayers();
    const states = {
      waiting:
        room.players.length === 2 ? '好友已就位，双方准备就能开始' : '房间已创建，邀请好友来集合',
      playing: '追逐进行中',
      finished: '对战结束，本局积分已确认',
      abandoned: '玩家已退出，可以再来一局',
      expired: '房间已过期，可以重新邀请好友',
    };
    feedback(
      states[room.status] +
        (playing
          ? ` · 剩余 ${Math.max(0, Math.ceil((room.deadline - room.serverNow) / 1000))} 秒`
          : ''),
    );
    if (
      playing &&
      (oldStatus !== 'playing' || ['lobby', 'create', 'join', 'room', 'results'].includes(current))
    ) {
      trail = [];
      navigate('play', { remember: false });
    } else if (!playing && ['lobby', 'create', 'join', 'play'].includes(current)) {
      trail = [];
      navigate('room', { remember: false });
    }
    if (room.status === 'finished' && resultShown !== room.code) {
      resultShown = room.code;
      showResults();
    }
    try {
      localStorage.setItem(`competition-room:${game}`, room.code);
    } catch {}
  }
  async function refresh() {
    const generation = sessionGeneration;
    if (
      !room ||
      (busy && busyGeneration === generation) ||
      exiting ||
      !surface.open ||
      Date.now() - lastPoll < (room.pollMs || 1200)
    )
      return;
    lastPoll = Date.now();
    try {
      accept(await client.request(`/rooms/${room.code}`), generation);
    } catch (error) {
      if (isCurrent(generation)) feedback(error);
    }
  }
  function showResults() {
    if (!room) return;
    const target = select('[data-results]');
    target.replaceChildren();
    const me = room.players[room.you];
    const ownResult = room.results?.find((entry) => entry.playerId === me.id);
    const opponent = room.results?.find((entry) => entry.playerId !== me.id);
    select('[data-result-title]').textContent =
      ownResult?.result.eligible &&
      ownResult.result.score > (opponent?.result.score ?? ownResult.result.score)
        ? '这局赢得漂亮！'
        : ownResult?.result.eligible &&
            ownResult.result.score < (opponent?.result.score ?? ownResult.result.score)
          ? '差一点，再来一局！'
          : '这局打得漂亮！';
    for (const entry of room.results || []) {
      const player = room.players.find((item) => item.id === entry.playerId) || {
        playerId: entry.playerId,
      };
      const card = node('section', '', 'sp-result-card');
      const head = node('div', '', 'sp-result-player');
      head.append(
        portrait(player.role),
        node('h3', `${entry.playerId === me.id ? '你 · ' : ''}${playerName(player, room.players)}`),
      );
      const record = entry.after.me;
      card.append(
        head,
        node(
          'strong',
          entry.result.eligible
            ? `${scoreText(game, entry.result.score, entry.result.secondary)} · 本局`
            : '本局无有效成绩',
          'sp-result-score',
        ),
        node(
          'p',
          record
            ? `总积分 ${scoreText(game, record.score, record.secondary)} · 全站第 ${record.rank} 名`
            : '完成有效对战，就能登上全站榜',
        ),
        node('small', gapText(game, entry.after)),
      );
      if (entry.reason) card.append(node('p', entry.reason));
      target.append(card);
    }
    navigate('results');
  }
  async function showBoard(generation = sessionGeneration, { remember = true } = {}) {
    navigate('board', { remember });
    select('[data-board-summary]').textContent = '正在读取全站成绩…';
    const board = await client.request(`/boards/${game}`);
    if (!isCurrent(generation)) return;
    select('[data-board-summary]').textContent =
      `${board.eligiblePlayers} 位玩家 · 好友对战累计积分`;
    const target = select('[data-board-content]');
    target.replaceChildren();
    if (board.top.length) {
      const podium = node('div', '', 'sp-podium');
      for (const index of [1, 0, 2]) {
        const row = board.top[index];
        if (!row) continue;
        const card = node('div', '', 'sp-podium-place');
        card.dataset.rank = String(row.rank);
        card.append(
          portrait(index === 1 ? 'runner' : 'pursuer'),
          node('span', String(row.rank), 'sp-podium-number'),
          node('strong', playerName(row, board.top)),
          node('small', scoreText(game, row.score, row.secondary)),
        );
        podium.append(card);
      }
      target.append(podium);
    }
    const list = node('ol', '', 'sp-rank-list');
    for (const row of board.top.slice(3)) {
      const item = node('li', '', 'sp-rank-row');
      item.toggleAttribute('data-self', row.playerId === board.me?.playerId);
      item.append(
        node('span', String(row.rank), 'sp-rank-number'),
        portrait(row.rank % 2 ? 'runner' : 'pursuer'),
        node('strong', playerName(row, board.top)),
        node('span', scoreText(game, row.score, row.secondary)),
      );
      list.append(item);
    }
    if (!board.top.length)
      list.append(node('li', '全站榜还空着，邀请好友完成一局，留下你的名字！', 'sp-empty'));
    const own = node('section', '', 'sp-my-record');
    const ownCopy = node('div', '', 'sp-my-record-copy');
    ownCopy.append(
      node(
        'strong',
        `${profile?.name || '我'} · ${board.me ? '第 ' + board.me.rank + ' 名' : '尚未上榜'}`,
      ),
      node(
        'span',
        board.me ? scoreText(game, board.me.score, board.me.secondary) : '等你完成第一局',
      ),
      node('small', gapText(game, board)),
    );
    own.append(portrait(), ownCopy);
    target.append(list, own, node('p', '好友对战累计积分，练习成绩不计入全站榜。', 'sp-note'));
  }
  async function showProfile(generation = sessionGeneration) {
    navigate('nickname');
    select('[data-save-name]').disabled = false;
    if (!profile) {
      const value = await client.request('/me');
      if (!isCurrent(generation)) return;
      updateProfile(value);
    }
    select('[name="name"]').value = profile.name;
    select('[data-name-message]').textContent = '';
  }
  async function showRules(generation = sessionGeneration) {
    navigate('rules');
    const target = select('[data-rules-content]');
    target.replaceChildren(node('p', '正在读取玩法说明…'));
    const rules =
      room?.state?.rules ||
      metadata?.description ||
      (await client.request(`/boards/${game}`)).description ||
      '双方准备后开始，点击角色，再点击道路移动。';
    if (!isCurrent(generation)) return;
    const list = node('ol', '', 'sp-rule-list');
    for (const part of rules
      .split(/[；。]+/)
      .map((part) => part.trim())
      .filter(Boolean))
      list.append(node('li', `${part}。`));
    target.replaceChildren(
      list,
      node(
        'p',
        room?.status === 'playing'
          ? '查看说明时对局仍在计时，返回即可继续行动。'
          : '警察和小偷独立操作，比赛积分由服务端确认。',
        'sp-note',
      ),
    );
  }
  function showInvite() {
    if (!room) return;
    const url = new URL(location.href);
    url.searchParams.set('pk', room.code);
    select('[data-invite-code]').textContent = room.code;
    select('[data-invite-url]').value = url.href;
    select('[data-invite-message]').textContent = '';
    navigate('invite');
  }
  async function copyInvite(link, generation = sessionGeneration) {
    const value = link ? select('[data-invite-url]').value : room.code;
    try {
      await navigator.clipboard.writeText(value);
      if (!isCurrent(generation)) return;
      select('[data-invite-message]').textContent = link
        ? '邀请链接已复制，发给好友吧！'
        : '房间码已复制，发给好友吧！';
    } catch {
      if (!isCurrent(generation)) return;
      select('[data-invite-message]').textContent = '可以长按选择上方内容，再复制给好友。';
    }
  }
  function renderedView(state, width, height) {
    const nodes = state?.map?.nodes || [];
    const extentX = nodes.length
      ? Math.max(...nodes.map((point) => point.x)) - Math.min(...nodes.map((point) => point.x))
      : 0;
    const extentY = nodes.length
      ? Math.max(...nodes.map((point) => point.y)) - Math.min(...nodes.map((point) => point.y))
      : 0;
    const turned = width < height && extentX > extentY;
    if (viewSource === state && viewTurned === turned) return { state: viewState, turned };
    viewSource = state;
    viewTurned = turned;
    if (!turned) viewState = state;
    else {
      // Rotate the map coordinates, not the Canvas. Faces, numbers and exit
      // labels therefore stay upright, and the server snapshot stays untouched.
      const point = (value) => (value ? { ...value, x: -value.y, y: value.x } : value);
      const actor = (value) => ({
        ...point(value),
        ...(value.routePoints ? { routePoints: value.routePoints.map(point) } : {}),
        ...(value.destination ? { destination: point(value.destination) } : {}),
        ...(value.gap
          ? { gap: { ...value.gap, from: point(value.gap.from), to: point(value.gap.to) } }
          : {}),
      });
      viewState = {
        ...state,
        map: { ...state.map, nodes: nodes.map(point) },
        cops: state.cops.map(actor),
        robbers: state.robbers.map(actor),
        exits: state.exits.map(point),
      };
    }
    surface.dataset.mapProjection = turned ? 'quarter-turn' : 'normal';
    return { state: viewState, turned };
  }
  function draw() {
    if (!surface.open) return;
    if (current === 'play' && room?.state) {
      const width = canvas.clientWidth,
        height = canvas.clientHeight;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      if (
        canvas.width !== Math.floor(width * ratio) ||
        canvas.height !== Math.floor(height * ratio)
      ) {
        canvas.width = Math.floor(width * ratio);
        canvas.height = Math.floor(height * ratio);
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      renderer.draw(ctx, width, height, renderedView(room.state, width, height).state);
    }
    frame = requestAnimationFrame(draw);
  }
  async function open(entry) {
    if (exiting) return;
    let generation = sessionGeneration;
    const opening = !surface.open;
    if (!surface.open) {
      sessionGeneration++;
      generation = sessionGeneration;
      returnFocus = document.activeElement;
      window.dispatchEvent(new CustomEvent('competition-visibility', { detail: { open: true } }));
      surface.open = true;
      surface.setAttribute('open', '');
      surface.hidden = false;
      historySession = `street-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      historyDepth = 1;
      history.pushState(
        {
          ...history.state,
          streetPage: 'lobby',
          streetSession: historySession,
          streetDepth: historyDepth,
        },
        '',
        location.href,
      );
      trail = [];
      navigate('lobby', { remember: false });
      draw();
      poll = setInterval(refresh, 250);
      await run(async (generation) => {
        const me = await client.request('/me');
        if (!isCurrent(generation)) return;
        updateProfile(me);
        const board = await client.request(`/boards/${game}`);
        if (!isCurrent(generation)) return;
        metadata = board;
        modes = metadata.modes || [];
        renderModes();
        for (const code of detachedRooms()) {
          if (!isCurrent(generation)) return;
          await leaveDetached({ code, status: 'waiting' });
        }
        if (!isCurrent(generation)) return;
        const invite = new URL(location.href).searchParams.get('pk');
        let saved;
        try {
          saved = localStorage.getItem(`competition-room:${game}`);
        } catch {}
        if (invite && /^[A-F0-9]{12}$/.test(invite)) {
          select('[data-code]').value = invite;
          navigate('join');
          feedback('邀请已就位，点击加入房间吧！');
        } else if (saved) accept(await client.request(`/rooms/${saved}`), generation);
      });
    }
    if (entry === 'board' && isCurrent(generation))
      await run((generation) => showBoard(generation, { remember: !opening }));
  }
  async function close({ restoreHistory = true } = {}) {
    if (exiting || !surface.open) return;
    exiting = true;
    launch.disabled = true;
    surface.open = false;
    sessionGeneration++;
    surface.hidden = true;
    surface.removeAttribute('open');
    const depth = historyDepth;
    historyDepth = 0;
    historySession = null;
    clearInterval(poll);
    cancelAnimationFrame(frame);
    if (restoreHistory && depth > 0) {
      // Restore the source route before it resumes: resuming a paused solo game
      // may itself add its pause page to the browser history.
      await new Promise((resolve) => {
        const done = () => {
          clearTimeout(timeout);
          window.removeEventListener('popstate', done);
          resolve();
        };
        const timeout = setTimeout(done, 500);
        window.addEventListener('popstate', done, { once: true });
        history.go(-depth);
      });
    }
    window.dispatchEvent(new CustomEvent('competition-visibility', { detail: { open: false } }));
    if (returnFocus?.isConnected && !returnFocus.closest('[hidden]')) returnFocus.focus();
    try {
      if (room && ['waiting', 'playing'].includes(room.status))
        await client.request(`/rooms/${room.code}/leave`, { body: '{}' });
      room = null;
      pending = null;
      resultShown = null;
      try {
        localStorage.removeItem(`competition-room:${game}`);
      } catch {}
      feedback('邀请一位好友，一起玩一局。');
    } catch {
      // Keep the room code so a network failure can be recovered on reopening.
      launch.title = '退出尚未得到确认，重新进入可以恢复房间。';
    } finally {
      exiting = false;
      launch.disabled = false;
    }
  }
  async function rematch(generation = sessionGeneration) {
    const result = await client.request(`/rooms/${room.code}/rematch`, { body: '{}' });
    if (!isCurrent(generation)) {
      await leaveDetached({ code: result.rematch, status: 'waiting' });
      return;
    }
    resultShown = null;
    trail = [];
    navigate('room', { remember: false });
    await receiveRoom(
      await client.request('/rooms/join', { body: JSON.stringify({ code: result.rematch }) }),
      generation,
    );
  }
  launch.onclick = () => void open();
  globalThis.__openStreetCompetition = open;
  globalThis.__openCompetition = open;
  window.addEventListener(
    'competition-navigation',
    (event) => void open(event.detail?.page || event.detail?.entry),
  );
  all('[data-go]').forEach((button) => {
    button.onclick = () => navigate(button.dataset.go);
  });
  all('[data-home], [data-close]').forEach((button) => {
    button.onclick = () => void close();
  });
  select('[data-page-back]').onclick = back;
  all('[data-page-return]').forEach((button) => {
    button.onclick = back;
  });
  all('[data-board]').forEach((button) => {
    button.onclick = () => void run(showBoard);
  });
  select('[data-refresh-board]').onclick = () => void run(showBoard);
  select('[data-profile]').onclick = () => void run(showProfile);
  all('[data-rules]').forEach((button) => {
    button.onclick = () => void run(showRules);
  });
  all('[data-invite], [data-share]').forEach((button) => {
    button.onclick = showInvite;
  });
  select('[data-copy-code]').onclick = () =>
    void run((generation) => copyInvite(false, generation));
  select('[data-copy-link]').onclick = () => void run((generation) => copyInvite(true, generation));
  all('[data-match-role]').forEach((button) => {
    button.onclick = () => {
      preferences.role = button.dataset.matchRole;
      all('[data-match-role]').forEach((item) =>
        item.setAttribute('aria-pressed', String(item === button)),
      );
    };
  });
  all('[data-initiative]').forEach((button) => {
    button.onclick = () => {
      preferences.initiative = button.dataset.initiative;
      all('[data-initiative]').forEach((item) =>
        item.setAttribute('aria-pressed', String(item === button)),
      );
    };
  });
  select('[data-create]').onclick = () =>
    void run(async (generation) => {
      await receiveRoom(
        await client.request('/rooms', { body: JSON.stringify({ game, ...preferences }) }),
        generation,
      );
    });
  select('[data-join-form]').onsubmit = (event) => {
    event.preventDefault();
    void run(async (generation) => {
      await receiveRoom(
        await client.request('/rooms/join', {
          body: JSON.stringify({ code: select('[data-code]').value.trim().toUpperCase(), game }),
        }),
        generation,
      );
    });
  };
  select('[data-code]').addEventListener('input', (event) => {
    event.target.value = event.target.value.replace(/[^a-fA-F0-9]/g, '').toUpperCase();
  });
  all('button[data-role]').forEach((button) => {
    button.onclick = () =>
      void run(async (generation) =>
        accept(
          await client.request(`/rooms/${room.code}/role`, {
            body: JSON.stringify({ role: button.dataset.role }),
          }),
          generation,
        ),
      );
  });
  all('[data-room-lead]').forEach((button) => {
    button.onclick = () =>
      void run(async (generation) =>
        accept(
          await client.request(`/rooms/${room.code}/initiative`, {
            body: JSON.stringify({ initiative: button.dataset.roomLead }),
          }),
          generation,
        ),
      );
  });
  select('[data-ready]').onclick = () =>
    void run(async (generation) =>
      accept(await client.request(`/rooms/${room.code}/ready`, { body: '{}' }), generation),
    );
  select('[data-rematch]').onclick = () => void run(rematch);
  select('[data-result-rematch]').onclick = () => void run(rematch);
  select('[data-result]').onclick = showResults;
  select('[data-name-form]').onsubmit = (event) => {
    event.preventDefault();
    void run(async (generation) => {
      const save = select('[data-save-name]');
      save.disabled = true;
      select('[data-name-message]').textContent = '正在保存昵称…';
      try {
        const value = await client.request('/me', {
          body: JSON.stringify({ name: select('[name="name"]').value }),
        });
        if (!isCurrent(generation)) return;
        updateProfile(value);
        if (room) accept(await client.request(`/rooms/${room.code}`), generation);
        if (!isCurrent(generation)) return;
        back();
        feedback('昵称保存好啦，好友会看到你的新名字！');
      } catch (error) {
        if (isCurrent(generation)) select('[data-name-message]').textContent = error.message;
      } finally {
        if (isCurrent(generation)) save.disabled = false;
      }
    });
  };
  canvas.addEventListener('pointerup', (event) => {
    if (!room || room.status !== 'playing' || current !== 'play') return;
    const rect = canvas.getBoundingClientRect();
    const view = renderedView(room.state, canvas.clientWidth, canvas.clientHeight);
    const tapped = renderer.tap(event.clientX - rect.left, event.clientY - rect.top, view.state);
    const command =
      view.turned && tapped?.type === 'move' ? { ...tapped, x: tapped.y, y: -tapped.x } : tapped;
    if (!command) return;
    void run(async (generation) => {
      pending ??= { seq: room.seq + 1, action: command };
      const next = await client.request(`/rooms/${room.code}/actions`, {
        body: JSON.stringify(pending),
      });
      if (!isCurrent(generation)) return;
      pending = null;
      accept(next, generation);
    });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && surface.open) {
      event.preventDefault();
      back();
    }
  });
  window.addEventListener('popstate', (event) => {
    if (!surface.open) return;
    if (event.state?.streetSession !== historySession) {
      void close({ restoreHistory: false });
      return;
    }
    historyDepth = event.state.streetDepth || 1;
    trail.length = Math.max(0, historyDepth - 1);
    let page = event.state.streetPage || 'lobby';
    if (room && ['room', 'play'].includes(current) && page === 'lobby') {
      void close();
      return;
    }
    if (room?.status === 'playing' && page === 'room') page = 'play';
    else if (room && room.status !== 'playing' && page === 'play') page = 'room';
    navigate(page, { remember: false, syncHistory: false });
  });
  document.addEventListener('chase-appearancechange', () => {
    if (profile) updateProfile(profile);
    if (room && surface.open) renderPlayers();
  });
  if (new URL(location.href).searchParams.has('pk')) void open();
}
