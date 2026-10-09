import './style.css';
import '../dev-mode.js';
import { rounds, cities } from './rounds.js';
import {
  scoreGuess,
  clamp,
  formatYear,
  MIN_YEAR,
  MAX_YEAR,
  validPoint,
  restoreJourney,
} from './game.js';
import {
  CHAPTERS,
  LEVELS,
  chapterById,
  levelById,
  isUnlocked,
  nextLevel,
  validateChapters,
} from './chapters.js';
import { historyApi, invitationUrl, parseInvite } from './api.js';

validateChapters(rounds);
const $ = (selector) => document.querySelector(selector);
const app = $('#app');
const esc = (text) =>
  String(text ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
const icons = {
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  back: '<path d="m14 5-7 7 7 7"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  book: '<path d="M12 5v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2Z"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  home: '<path d="m3 10 9-7 9 7v10h-6v-7H9v7H3Z"/>',
  pause:
    '<rect x="6" y="5" width="4" height="14" rx=".4" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx=".4" fill="currentColor" stroke="none"/>',
  duel: '<path d="m5 3 14 18M19 3 5 21M2 16l7 5m6 0 7-5M5 3l5 2M19 3l-5 2"/>',
  crown: '<path d="m3 6 4 4 5-6 5 6 4-4-2 13H5ZM7 22h10"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  settings:
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',
  share: '<path d="M12 16V3m-5 5 5-5 5 5M5 12H3v9h18v-9h-2"/>',
};
const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${icons[name] || icons.compass}</svg>`;
const art = (id) => rounds.find((round) => round.id === id)?.image || rounds[0].image;
const brand = `<span class="brand-mark">${icon('compass')}</span><span>此时<span class="brand-dot">·</span>此地</span>`;
const fmt = (number) => Number(number || 0).toLocaleString('zh-CN');
const stamps = ['初识山河', '行路之人', '识途旅人', '时空行者'];
const LIMIT = 25;
let saved = { best: 0, visited: [], sound: true, records: {}, mobileJourney: null };
try {
  const old = JSON.parse(localStorage.getItem('here-and-then.v1'));
  if (old && typeof old === 'object')
    saved = {
      ...old,
      best: clamp(Number(old.best) || 0, 0, 25000),
      sound: old.sound !== false,
      visited: Array.isArray(old.visited)
        ? old.visited.filter((id) => rounds.some((round) => round.id === id))
        : [],
      records: {},
    };
  for (const level of LEVELS) {
    const record = old?.records?.[level.id];
    if (record && Number.isInteger(record.best) && record.best >= 0 && record.best <= 15000)
      saved.records[level.id] = { best: record.best, complete: record.complete === true };
  }
} catch {
  /* Optional browser storage. */
}
let storageWarned = false;
function save() {
  try {
    localStorage.setItem('here-and-then.v1', JSON.stringify(saved));
  } catch {
    if (!storageWarned) {
      storageWarned = true;
      toast('当前浏览器不能保存，旅途仍可继续。');
    }
  }
}
let events = new AbortController(),
  generation = 0,
  viewer = null,
  guessMap = null,
  clock = null,
  audio = null;
let state = {
  screen: 'home',
  mode: 'practice',
  phase: 'idle',
  deck: [],
  index: 0,
  results: [],
  year: 1000,
  yearTouched: false,
  guess: null,
  view: 'scene',
  run: null,
};
let service = { status: 'unknown', me: null };
let devUnlock = false,
  searchComposing = false,
  sharePending = false;
const completed = () => LEVELS.filter((level) => saved.records[level.id]?.complete).length;
const growth = () => Object.values(saved.records).reduce((sum, record) => sum + record.best, 0);
const unlocked = (id) => devUnlock || isUnlocked(id, saved.records);
const on = (selector, name, handler) =>
  $(selector)?.addEventListener(name, handler, { signal: events.signal });
function bindAll(selector, handler) {
  document
    .querySelectorAll(selector)
    .forEach((element) =>
      element.addEventListener('click', () => handler(element), { signal: events.signal }),
    );
}
function toast(message) {
  let node = $('#toast');
  if (!node) {
    node = document.createElement('div');
    node.id = 'toast';
    node.setAttribute('role', 'status');
    document.body.append(node);
  }
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove('show'), 3500);
}
function chime() {
  if (!saved.sound) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume().catch(() => {});
    const oscillator = audio.createOscillator(),
      gain = audio.createGain();
    oscillator.frequency.value = 523;
    gain.gain.setValueAtTime(0.045, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.25);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.3);
  } catch {}
}
function cleanup() {
  generation++;
  clearInterval(clock);
  events.abort();
  events = new AbortController();
  viewer?.destroy();
  guessMap?.destroy();
  viewer = null;
  guessMap = null;
}
function remember() {
  if (state.mode !== 'practice' || !['guessing', 'revealed', 'paused'].includes(state.phase))
    return;
  saved.mobileJourney = {
    version: 2,
    level: state.level,
    deck: state.deck.map((round) => round.id),
    index: state.index,
    results: state.results,
    phase: state.phase,
    year: state.year,
    yearTouched: state.yearTouched,
    guess: state.guess,
    deadline: state.deadline,
    pausedRemaining: state.pausedRemaining,
    dev: state.dev === true,
  };
  save();
}
function restoreLocal() {
  const journey = saved.mobileJourney;
  if (
    journey?.version === 2 &&
    Array.isArray(journey.deck) &&
    journey.deck.length >= 1 &&
    journey.deck.length <= 5 &&
    ['guessing', 'revealed', 'paused'].includes(journey.phase) &&
    journey.deck.every((id) => rounds.some((round) => round.id === id)) &&
    Number.isInteger(journey.index) &&
    journey.index >= 0 &&
    journey.index < journey.deck.length &&
    Array.isArray(journey.results) &&
    journey.results.length === journey.index + (journey.phase === 'revealed' ? 1 : 0) &&
    journey.results.every(
      (result) => Number.isInteger(result.total) && result.total >= 0 && result.total <= 5000,
    ) &&
    Number.isFinite(journey.deadline) &&
    Number.isInteger(journey.year) &&
    journey.year !== 0 &&
    journey.year >= MIN_YEAR &&
    journey.year <= MAX_YEAR &&
    (journey.guess === null || validPoint(journey.guess)) &&
    (journey.phase !== 'paused' ||
      (Number.isFinite(journey.pausedRemaining) &&
        journey.pausedRemaining >= 0 &&
        journey.pausedRemaining <= LIMIT * 1000))
  )
    return { ...journey, deck: journey.deck.map((id) => rounds.find((round) => round.id === id)) };
  const legacy = restoreJourney(saved.journey, rounds);
  if (legacy)
    return {
      ...legacy,
      level: null,
      deadline: Date.now() + LIMIT * 1000,
      phase: legacy.phase === 'revealed' ? 'revealed' : 'paused',
      pausedRemaining: LIMIT * 1000,
      dev: false,
      results: legacy.results.map((result) => ({
        id: result.id,
        total: result.timedOut ? 0 : result.total,
        timedOut: result.timedOut,
      })),
    };
  return null;
}
function shell(title, content, { nav = '', back = null, eyebrow = '山河有迹 · 岁月无声' } = {}) {
  remember();
  cleanup();
  state.screen = title;
  state.phase = 'idle';
  document.body.className = 'paper-page';
  app.innerHTML = `<div class="mobile-shell"><header class="page-header">${back ? `<button class="icon-button" id="back" aria-label="返回">${icon('back')}</button><span class="page-header-title">${esc(title)}</span>` : `<button class="brand" id="brand-home">${brand}</button><span class="edition">旅行手记<br>No. ${String(saved.visited.length + 1).padStart(3, '0')}</span>`}${back ? `<button class="icon-button" data-nav="settings" aria-label="设置">${icon('settings')}</button>` : ''}</header><main class="page-content">${title === 'home' ? '' : `<p class="eyebrow">${esc(eyebrow)}</p>`}${content}</main>${nav ? navigation(nav) : ''}</div>`;
  on('#back', 'click', back);
  on('#brand-home', 'click', home);
  bindNavigation();
  window.scrollTo(0, 0);
}
function navigation(active) {
  return `<nav class="bottom-nav" aria-label="主导航">${[
    ['home', 'home', '首页'],
    ['chapters', 'compass', '探索'],
    ['challenge', 'duel', '挑战'],
    ['journal', 'book', '手记'],
  ]
    .map(
      ([id, symbol, label]) =>
        `<button data-nav="${id}" ${id === active ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span>${id === active ? '<i></i>' : ''}</button>`,
    )
    .join('')}</nav>`;
}
function bindNavigation() {
  bindAll('[data-nav]', (element) =>
    ({ home, chapters, challenge, journal, settings, help, leaderboard })[element.dataset.nav]?.(),
  );
}
function home() {
  const journey = restoreLocal();
  const target = nextLevel(saved.records);
  shell(
    'home',
    `<section class="home-intro"><p class="eyebrow"><span class="red-line"></span>一场关于时间与地点的游戏</p><h1>你能认出，<br>这是<em>何时何地？</em></h1><p class="intro-caption">一幅画，二十五秒。凭直觉，赴一场相遇。</p></section><figure class="hero-postcard"><img src="${art('kaifeng')}" alt="山水与街巷交织的历史想象画面" fetchpriority="high"><div class="image-shade"></div><span class="photo-tag">卷一 · 人间烟火</span><span class="postmark" aria-hidden="true">山河<br>来信</span><figcaption>某年，某地。<br><strong>故事等你落笔。</strong></figcaption></figure><button class="primary start-button" id="start">${journey ? '继续未完的旅途' : '开启旅途'}${icon('arrow')}</button><div class="start-footnote"><span>${journey ? `第 ${journey.index + 1} 幕 · 进度已留存` : '三幕一小关 · 从第一封来信开始'}</span><button class="text-button" data-nav="help">怎么玩${icon('arrow')}</button></div><section class="play-modes" aria-label="挑战入口"><button class="mode-card" id="friend-entry"><span class="mode-symbol">${icon('duel')}</span><span class="eyebrow">一封战书</span><h2>好友 PK</h2><p>同样五幕，谁更懂历史？</p><span class="card-link">向好友下战书 ${icon('arrow')}</span></button><button class="mode-card dark" id="daily-entry"><span class="mode-symbol">${icon('crown')}</span><span class="eyebrow">今日山河</span><h2>全站竞逐</h2><p>每日一局，把名字留在榜上。</p><span class="card-link">赴今日之约 ${icon('arrow')}</span></button></section><div class="home-progress"><span>${icon('book')}已行 ${completed()} / 9 关</span><button class="text-button" data-nav="chapters">继续探索 ${icon('arrow')}</button></div><p class="art-note">场景为 AI 历史想象复原，不作为史料。</p>`,
    { nav: 'home' },
  );
  on('#start', 'click', () => (journey ? resumeLocal(journey) : prepare(target.id)));
  on('#friend-entry', 'click', challenge);
  on('#daily-entry', 'click', () => competitionPrepare('daily'));
}
function chapters() {
  shell(
    '探索山河',
    `<h1 class="page-title">把世界，<br>读成一封封来信。</h1><p class="page-description">三卷旅途，九个小关。循着线索逐一启程。</p><div class="chapter-list">${CHAPTERS.map(
      (chapter, index) => {
        const count = chapter.levels.filter((level) => saved.records[level.id]?.complete).length;
        const open = unlocked(chapter.levels[0].id);
        return `<button class="chapter-card ${open ? '' : 'locked'}" data-chapter="${chapter.id}" ${open ? '' : 'disabled'}><img src="${art(chapter.cover)}" alt="历史场景想象画面" loading="lazy"><div class="chapter-shade"></div><span class="chapter-number">卷 ${chapter.number}</span><div><h2>${chapter.name}</h2><p>${chapter.subtitle}</p><span>${open ? `${count} / 3 关已完成` : '完成上一卷后启程'}</span></div><span class="chapter-arrow">${icon(open ? 'arrow' : 'lock')}</span></button>`;
      },
    ).join('')}</div><p class="art-note">每幕限时 25 秒 · 结算只显示评分</p>`,
    { nav: 'chapters', back: home },
  );
  bindAll('[data-chapter]', (button) => chapterDetail(button.dataset.chapter));
}
function chapterDetail(id) {
  const chapter = chapterById(id);
  if (!chapter) return chapters();
  shell(
    chapter.name,
    `<div class="chapter-heading"><span class="chapter-seal">${chapter.number}</span><h1 class="page-title">${chapter.name}</h1><p class="page-description">${chapter.subtitle}</p></div><div class="chapter-detail-art"><img src="${art(chapter.cover)}" alt="历史想象场景"><span>每一眼，都是一条线索。</span></div><div class="level-list">${chapter.levels
      .map((level, index) => {
        const open = unlocked(level.id),
          record = saved.records[level.id];
        return `<button class="level-card ${open ? '' : 'locked'}" data-level="${level.id}" ${open ? '' : 'disabled'}><span class="level-number">${String(index + 1).padStart(2, '0')}</span><span><strong>${level.name}</strong><small>${record?.complete ? `已完成 · 最佳 ${fmt(record.best)} 分` : open ? '三幕场景 · 25 秒 / 幕' : '完成上一小关后解锁'}</small></span>${icon(record?.complete ? 'check' : open ? 'arrow' : 'lock')}</button>`;
      })
      .join('')}</div>`,
    { nav: 'chapters', back: chapters },
  );
  bindAll('[data-level]', (button) => prepare(button.dataset.level));
}
function prepare(id) {
  const level = levelById(id);
  if (!level || !unlocked(id)) return chapters();
  const chapter = chapterById(level.chapter);
  shell(
    '启程之前',
    `<div class="prepare-compass">${icon('compass')}</div><p class="center eyebrow">卷${chapter.number} · 第 ${level.number} 关</p><h1 class="page-title center">${level.name}</h1><p class="page-description center">别急着认出答案。先看看，画里有什么。</p><div class="rule-ticket"><div><b>03</b><span>幕历史场景</span></div><div><b>25<span>秒</span></b><span>每幕答题时间</span></div><div><b>15,000</b><span>本关满分</span></div></div><ol class="preflight"><li><span>一</span><p><strong>观察场景</strong>拖动全景，寻找时代的痕迹。</p></li><li><span>二</span><p><strong>选地点与年代</strong>地图落点，拨动年份。</p></li><li><span>三</span><p><strong>交卷看评分</strong>时间到计零分，答案留在历史里。</p></li></ol><button class="primary full-width" id="begin-level">走进这一幕 ${icon('arrow')}</button><p class="art-note">本地练习 · 不计入全站榜${devUnlock ? ' · 开发试玩不保存成长' : ''}</p>`,
    { back: () => chapterDetail(level.chapter) },
  );
  on('#begin-level', 'click', () => startLocal(level));
}
function help() {
  shell(
    '玩法说明',
    `<h1 class="page-title">一眼入景，<br>一念千年。</h1><ol class="guide-list"><li><span>01</span><div><h2>先读画面</h2><p>单指转动全景，双指捏合缩放。建筑、衣着与交通工具，都是你的线索。</p></div></li><li><span>02</span><div><h2>再落坐标</h2><p>切到地图，点选地点。可以搜索中文城市，也能平移地图后标记中心。地图使用现代地理位置。</p></div></li><li><span>03</span><div><h2>拨回年代</h2><p>滑动时间轴，或输入年份。公元前通过左侧切换，没有公元 0 年。</p></div></li><li><span>04</span><div><h2>二十五秒，落笔</h2><p>每幕最高 5,000 分，依据地点与年代接近程度合计。超时整幕零分；结算只给评分，不公开答案与误差。</p></div></li></ol><div class="note-box"><h3>不同旅途，各有约定</h3><p>本地练习可以暂停，关闭或刷新页面会保留进度与剩余计时。好友 PK 同题同规则；竞技离开页面仍计时。</p><p>全站榜按每日正式首局成绩统计。周榜取本周最好的五天，成长和反复练习不增加榜分。</p></div><p class="art-note">AI 历史想象复原可能有细节偏差。具体年代是游戏设定，画面不作为史料。</p><button class="primary full-width" data-nav="chapters">我知道了，出发 ${icon('arrow')}</button>`,
    { back: home },
  );
}
function journal() {
  const points = growth(),
    rank = stamps[Math.min(3, Math.floor(completed() / 3))];
  shell(
    '我的旅行手记',
    `<div class="journal-heading"><span class="passport-mark">${icon('compass')}</span><p class="eyebrow">旅人身份 · 本机记录</p><h1 class="page-title">${rank}</h1><p class="page-description">走过的每一幕，都让直觉更敏锐。</p></div><div class="journal-stats"><div><strong>${completed()}<small> / 9</small></strong><span>已完成小关</span></div><div><strong>${fmt(points)}</strong><span>旅人成长分</span></div><div><strong>${saved.visited.length}</strong><span>已观察场景</span></div></div><div class="growth-line"><span style="width:${(completed() / 9) * 100}%"></span></div><p class="art-note">成长分取各小关最佳成绩之和 · 只记进步，不比刷题次数</p><div class="journal-records">${CHAPTERS.map((chapter) => `<article><span>${chapter.number}</span><div><h3>${chapter.name}</h3><p>${chapter.levels.filter((level) => saved.records[level.id]?.complete).length} / 3 关完成</p></div><b>${fmt(chapter.levels.reduce((sum, level) => sum + (saved.records[level.id]?.best || 0), 0))}</b></article>`).join('')}</div>${saved.best ? `<p class="legacy-record">往日五幕最佳 ${fmt(saved.best)} 分 · 旧足迹已保留</p>` : ''}<button class="primary full-width" data-nav="chapters">再收一封来信 ${icon('arrow')}</button><button class="text-button settings-link" data-nav="settings">${icon('settings')}设置与音效</button>`,
    { nav: 'journal', back: home },
  );
}
function settings() {
  shell(
    '旅途设置',
    `<h1 class="page-title">让旅途，<br>合你的心意。</h1><div class="nickname-setting"><label for="nickname">战书上的名字</label><div><input id="nickname" maxlength="20" value="${esc(saved.nickname || service.me?.player?.nickname || '时空旅人')}" autocomplete="nickname"><button class="secondary" id="save-nickname">落款</button></div><p id="nickname-status" role="status">用于好友战书与山河榜。</p></div><div class="settings-list"><button id="sound" aria-pressed="${saved.sound}"><span><strong>旅途音效</strong><small>落笔时的一点回响</small></span><span class="switch ${saved.sound ? 'on' : ''}"></span></button><div><span><strong>沉浸全屏</strong><small>让历史占满眼前</small></span><button class="secondary" data-game-fullscreen>全屏</button></div><button data-nav="help"><span><strong>玩法说明</strong><small>观察、落点与计分规则</small></span>${icon('arrow')}</button></div><div class="note-box"><h3>关于这本手记</h3><p>本地练习进度保存在当前浏览器。竞技成绩由挑战服务保存。画面是 AI 历史想象复原，仅用于游戏探索。</p></div>`,
    { back: journal },
  );
  on('#save-nickname', 'click', () =>
    busy('#save-nickname', async () => {
      const nickname = $('#nickname').value.trim();
      if (!nickname) return toast('请先写下你的旅人名字。');
      const token = generation;
      const result = await historyApi.profile(nickname);
      saved.nickname = result.player.nickname;
      save();
      if (service.me) service.me.player = result.player;
      if (token === generation)
        $('#nickname-status').textContent = '落款已保存，下次战书就用这个名字。';
    }),
  );
  on('#sound', 'click', () => {
    saved.sound = !saved.sound;
    save();
    settings();
    chime();
  });
}
async function checkService() {
  try {
    const me = await historyApi.me();
    service = { status: 'online', me };
    return me;
  } catch (error) {
    service = { status: 'offline', me: null };
    throw error;
  }
}
function challenge() {
  shell(
    '好友战书',
    `<p class="eyebrow spaced">同一段历史 · 两份直觉</p><h1 class="page-title">这一局，<br>你比朋友更懂吗？</h1><div class="duel-envelope"><span class="envelope-lines"></span><span class="wax-seal">战</span><p>给一位有好奇心的朋友</p><strong>五幕光景，等你来猜。</strong><span class="envelope-bottom">此时此地 · 凭直觉落笔</span></div><button class="primary full-width" id="create-duel">先挑战，再寄战书 ${icon('arrow')}</button><p class="art-note">同样五幕 · 每幕 25 秒 · 完成后生成专属邀请码</p>${saved.lastDuelRunId ? '<button class="secondary full-width" id="last-duel">查看最近一次战书</button>' : ''}<div class="invite-entry"><label for="invite-code">已收到朋友的战书？</label><div><input id="invite-code" placeholder="粘贴邀请码或战书链接" autocomplete="off" maxlength="1000"><button class="secondary" id="open-invite">赴约</button></div></div><div class="quiet-links"><button class="text-button" data-nav="leaderboard">${icon('crown')}去看全站榜</button><button class="text-button" data-nav="help">挑战规则 ${icon('arrow')}</button></div>`,
    { nav: 'challenge', back: home },
  );
  on('#create-duel', 'click', () => competitionPrepare('duel'));
  on('#last-duel', 'click', () =>
    busy('#last-duel', async () => {
      const token = generation;
      const data = await historyApi.run(saved.lastDuelRunId);
      if (token === generation) await acceptRun(data.run, null);
    }),
  );
  on('#open-invite', 'click', () => {
    const code = parseInvite($('#invite-code').value);
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(code)) return toast('请输入有效的战书邀请码。');
    invitation(code);
  });
}
function connectionNotice(error) {
  return `<div class="note-box service-notice"><h3>${error?.code === 'UNAVAILABLE' ? '挑战服务尚未连接' : '这次暂时无法启程'}</h3><p>${esc(error?.message || '可以先开启本地旅途，练练你的时空直觉。')}</p></div><button class="primary full-width" data-nav="chapters">先去本地探索 ${icon('arrow')}</button>`;
}
async function competitionPrepare(mode) {
  const daily = mode === 'daily';
  shell(
    daily ? '今日全站竞逐' : '准备下战书',
    `<span class="competition-emblem">${icon(daily ? 'crown' : 'duel')}</span><h1 class="page-title center">${daily ? '今日山河，<br>等你来认。' : '以五幕光景，<br>试一试直觉。'}</h1><p class="page-description center">${daily ? '五幕随机档案' : '五幕好友同题'} · 每幕 25 秒 · 答案不公开</p><div class="note-box"><h3>${daily ? '公平，只记一次' : '先留下你的成绩'}</h3><p>${daily ? '每日首场正式成绩计榜。周榜取最佳五天，成长分与关卡纪录独立保存。' : '完成这一局，生成 24 小时有效的战书。好友收到后作答同样的五幕，比分由服务端结算。'}</p><p>竞技离开页面仍然计时。准备好再出发。</p></div><div id="service-state" role="status"><p class="loading-line">正在连接挑战服务…</p></div><button class="text-button settings-link" data-nav="leaderboard">查看全站榜 ${icon('arrow')}</button>`,
    { back: daily ? home : challenge },
  );
  const token = generation;
  try {
    const me = await checkService();
    if (token !== generation) return;
    const active = me.activeRun;
    const eligible = !daily || me.player?.rankedEligible;
    $('#service-state').innerHTML = !eligible
      ? `<div class="note-box"><h3>正式榜等待账号接入</h3><p>当前为游客身份。可先与好友 PK；登录身份配置完成后即可参与每日计榜。</p></div><button class="primary full-width" id="guest-duel">先来一局好友 PK ${icon('arrow')}</button>`
      : `<button class="primary full-width" id="begin-competition">${active ? `继续未完成的${active.mode === 'daily' ? '每日挑战' : '好友挑战'}` : daily && me.daily?.played ? '查看今日成绩' : '我准备好了，开始'} ${icon('arrow')}</button><p class="art-note">${esc(me.player?.nickname || '时空旅人')} · 服务端计分</p>`;
    on('#guest-duel', 'click', () => competitionPrepare('duel'));
    on('#begin-competition', 'click', () =>
      busy('#begin-competition', async () => {
        const token = generation;
        const data = active
          ? await historyApi.run(active.id)
          : daily && me.daily?.played && me.daily.runId
            ? await historyApi.run(me.daily.runId)
            : await historyApi.start(mode);
        if (token === generation) await acceptRun(data.run);
      }),
    );
  } catch (error) {
    if (token === generation) {
      $('#service-state').innerHTML =
        connectionNotice(error) +
        '<button class="secondary full-width" id="service-retry">重新连接</button>';
      bindNavigation();
      on('#service-retry', 'click', () => competitionPrepare(mode));
    }
  }
}
async function invitation(code) {
  shell(
    '收到一封战书',
    `<div class="invite-loading" id="invitation-content"><div class="prepare-compass">${icon('duel')}</div><p class="loading-line">正在拆开战书…</p></div>`,
    { back: challenge, nav: 'challenge' },
  );
  const token = generation;
  try {
    const data = await historyApi.inspect(code);
    if (token !== generation) return;
    const invite = data.invite;
    $('#invitation-content').innerHTML =
      `<p class="eyebrow center">${esc(invite.host?.nickname || '一位旅人')} 向你发起挑战</p><h1 class="page-title center">你能超过<br>这一份直觉吗？</h1><div class="invitation-score"><span>对方已得</span><strong>${fmt(invite.host?.score)}</strong><small>/ 25,000 分</small></div><p class="page-description center">同样五幕 · 每幕 25 秒<br>只看分数，把答案留给自己。</p><button class="primary full-width" id="accept-invite">接下战书 ${icon('arrow')}</button><p class="art-note">${invite.expiresAt ? `有效至 ${new Date(invite.expiresAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '战书 24 小时有效'} · 开始后无法暂停计时</p>`;
    on('#accept-invite', 'click', () =>
      busy('#accept-invite', async () => {
        const token = generation;
        const result = await historyApi.join(code);
        if (token !== generation) return;
        await acceptRun(result.run, invite.host);
      }),
    );
  } catch (error) {
    if (token === generation) {
      $('#invitation-content').innerHTML =
        `<h1 class="page-title">这封战书<br>暂未打开。</h1>${connectionNotice(error)}<button class="secondary full-width" id="invite-retry">再试一次</button>`;
      bindNavigation();
      on('#invite-retry', 'click', () => invitation(code));
    }
  }
}
async function leaderboard(period = 'week') {
  shell(
    '山河榜',
    `<div class="leaderboard-title"><div><h1 class="page-title">山河有名。</h1><p class="page-description">以直觉相逢，让成绩说话。</p></div>${icon('crown')}</div><div class="tab-switch rank-tabs"><button id="rank-week" class="${period === 'week' ? 'active' : ''}">本周</button><button id="rank-day" class="${period === 'day' ? 'active' : ''}">今日</button></div><p class="rank-rule">${period === 'week' ? '本周最佳 5 天之和 · 每天只记正式首局' : '今日正式首局成绩 · 每日北京时间 00:00 换新'}</p><div id="rank-content" role="status"><p class="loading-line">正在翻开山河榜…</p></div><button class="primary full-width" id="rank-play">赴今日之约 ${icon('arrow')}</button><p class="art-note">同分并列 · 只展示真实服务端成绩<br>关卡最佳记录用于成长，反复练习不增加榜分。</p>`,
    { nav: 'challenge', back: challenge },
  );
  on('#rank-week', 'click', () => leaderboard('week'));
  on('#rank-day', 'click', () => leaderboard('day'));
  on('#rank-play', 'click', () => competitionPrepare('daily'));
  const token = generation;
  try {
    const data = await historyApi.leaderboard(period);
    if (token !== generation) return;
    if (period === 'day')
      $('.rank-rule').textContent =
        `今日正式首局成绩 · 每日 ${data.timeZone === 'Asia/Shanghai' ? '北京时间' : data.timeZone || '服务时区'} 00:00 换新`;
    $('#rank-content').innerHTML = data.entries?.length
      ? `<ol class="ranking">${data.entries.map((entry) => `<li class="${entry.rank <= 3 ? 'top-rank' : ''}"><span class="rank-position">${String(entry.rank).padStart(2, '0')}</span><span class="rank-avatar">${esc((entry.nickname || '旅').slice(0, 1))}</span><span class="rank-person"><strong>${esc(entry.nickname)}</strong><small>${period === 'week' ? `${entry.days} 天有效成绩` : '今日正式挑战'}</small></span><b>${fmt(entry.score)}</b></li>`).join('')}</ol>${data.self ? `<div class="self-rank"><span>我的排名 ${data.self.rank ? `#${data.self.rank}` : '尚未计榜'}</span><strong>${fmt(data.self.score)} 分</strong></div>` : ''}`
      : '<div class="empty-state">' +
        icon('book') +
        '<h2>第一行，留给旅人。</h2><p>这个榜期还没有正式成绩。</p></div>';
  } catch (error) {
    if (token === generation)
      $('#rank-content').innerHTML =
        `<div class="empty-state">${icon('compass')}<h2>山河榜尚未连接</h2><p>${esc(error.message)}</p></div>`;
  }
}
async function busy(selector, action) {
  const button = $(selector);
  if (button?.disabled) return;
  if (button) button.disabled = true;
  try {
    await action();
  } catch (error) {
    toast(error.message || '暂时无法完成，请稍后重试。');
  } finally {
    if (button?.isConnected) button.disabled = false;
  }
}
function startLocal(level) {
  state = {
    ...state,
    mode: 'practice',
    level: level.id,
    deck: level.scenes.map((id) => rounds.find((round) => round.id === id)),
    index: 0,
    results: [],
    phase: 'loading',
    guess: null,
    year: 1000,
    yearTouched: false,
    run: null,
    opponent: null,
    deadline: null,
    dev: devUnlock,
  };
  renderGame();
}
function resumeLocal(journey) {
  state = {
    ...state,
    ...journey,
    mode: 'practice',
    run: null,
    opponent: null,
    dev: journey.dev === true,
  };
  if (state.phase === 'paused') {
    state.deadline = Date.now() + state.pausedRemaining;
    state.phase = 'guessing';
  }
  if (state.phase === 'revealed') return roundResult();
  renderGame(true);
}
function runTime(run) {
  return typeof run.serverNow === 'number'
    ? run.serverNow
    : Date.parse(run.serverNow) || Date.now();
}
async function acceptRun(run, opponent = null) {
  if (!run) throw new Error('服务未返回本局信息，请重试。');
  state = {
    ...state,
    mode: run.mode,
    run,
    opponent: run.opponent || opponent,
    level: null,
    index: run.index,
    phase: run.phase,
    results: run.results || [],
    deck: [],
    year: 1000,
    yearTouched: false,
    guess: null,
    serverOffset: runTime(run) - Date.now(),
    dev: false,
  };
  if (run.phase === 'finished') return finish();
  if (run.phase === 'revealed') return roundResult();
  const expires = run.round?.expiresAt;
  state.deadline = typeof expires === 'number' ? expires : Date.parse(expires);
  await renderGame(true);
}
function currentRound() {
  return state.mode === 'practice' ? state.deck[state.index] : state.run.round;
}
function roundCount() {
  return state.mode === 'practice' ? state.deck.length : state.run.total || 5;
}
function sumScore() {
  return state.mode === 'practice'
    ? state.results.reduce((sum, result) => sum + result.total, 0)
    : state.run.score;
}
async function renderGame(restored = false) {
  cleanup();
  state.screen = 'game';
  state.phase = 'loading';
  state.view = 'scene';
  document.body.className = 'game-page';
  const token = generation;
  app.innerHTML = `<main class="game-shell"><header class="game-top"><button id="pause" class="icon-button" aria-label="${state.mode === 'practice' ? '暂停' : '离开本局'}">${icon(state.mode === 'practice' ? 'pause' : 'close')}</button><span id="round-label">${state.mode === 'practice' ? '探索' : state.mode === 'daily' ? '全站竞逐' : '好友 PK'}<b>第 ${state.index + 1} / ${roundCount()} 幕</b></span><span class="game-score">${fmt(sumScore())}<small>分</small></span></header><div class="timer-track"><span id="timer-progress"></span></div><section class="scene-panel"><div id="panorama" tabindex="0" aria-label="历史全景，拖动观察四周"></div><div class="scene-caption"><span>此刻，你身在何方？</span><p id="clue">${esc(currentRound()?.clue || '观察建筑、衣着和街景，寻找历史留下的线索。')}</p></div><div class="scene-controls"><button class="scene-control" id="scene-reset" aria-label="重置视角">${icon('compass')}</button><span>拖动环顾 · 双指缩放</span></div></section><section class="map-panel" aria-label="选择地点"><div class="map-search"><label class="search-field">${icon('search')}<input id="city-search" type="search" placeholder="搜索城市或古地名" autocomplete="off" role="combobox" aria-label="搜索城市" aria-autocomplete="list" aria-controls="search-results" aria-expanded="false"></label><div id="search-results" role="listbox" hidden></div></div><div id="guess-map"></div><div class="map-controls"><button id="map-plus" aria-label="放大地图">+</button><button id="map-minus" aria-label="缩小地图">−</button></div><button id="center-pin" class="center-pin">${icon('pin')}标记地图中心</button></section><section class="answer-dock"><div class="answer-top"><div class="tab-switch"><button id="scene-tab" class="active" aria-pressed="true">${icon('eye')}观察</button><button id="map-tab" aria-pressed="false">${icon('pin')}地图<span id="pin-dot"></span></button></div><span class="timer" id="timer" role="timer">${LIMIT}<small>秒</small></span></div><div id="location-status" class="location-status">${icon('pin')}<span>地图上标记你的猜测</span></div><div class="year-row"><label for="year-range">这是哪一年？</label><div class="year-input"><select id="era-select" aria-label="公元前后"><option value="ce">公元</option><option value="bce">公元前</option></select><input id="year-number" inputmode="numeric" type="number" min="1" max="${MAX_YEAR}" value="1000" aria-label="年份"><span>年</span></div></div><input id="year-range" type="range" min="${MIN_YEAR}" max="${MAX_YEAR}" step="1" value="1000" aria-label="选择年代"><div class="year-marks"><span>公元前 3000</span><span id="year-status">请选择年代</span><span>${MAX_YEAR}</span></div><button class="primary full-width" id="submit" disabled>先选一个地点 ${icon('arrow')}</button></section><div id="load-cover" class="load-cover"><span class="loading-compass">${icon('compass')}</span><h2>正在翻开历史的一页</h2><p>一场相遇，即将发生。</p></div></main>`;
  on('#pause', 'click', pause);
  on('#scene-tab', 'click', () => setView('scene'));
  on('#map-tab', 'click', () => setView('map'));
  on('#scene-reset', 'click', () => viewer?.reset());
  on('#map-plus', 'click', () => guessMap?.zoom(1));
  on('#map-minus', 'click', () => guessMap?.zoom(-1));
  on('#center-pin', 'click', () => guessMap?.center());
  on('#city-search', 'input', () => {
    if (!searchComposing) searchCities();
  });
  on('#city-search', 'compositionstart', () => {
    searchComposing = true;
  });
  on('#city-search', 'compositionend', () => {
    searchComposing = false;
    searchCities();
  });
  on('#city-search', 'keydown', searchKeydown);
  on('#year-range', 'input', (event) => setYear(Number(event.target.value)));
  const editYear = () => {
    const value = Number($('#year-number').value);
    if (
      !Number.isInteger(value) ||
      value < 1 ||
      value > ($('#era-select').value === 'bce' ? 3000 : MAX_YEAR)
    ) {
      $('#year-number').setAttribute('aria-invalid', 'true');
      state.yearTouched = false;
      updateSubmit();
      remember();
      return;
    }
    setYear($('#era-select').value === 'bce' ? -value : value);
  };
  on('#year-number', 'input', editYear);
  on('#era-select', 'change', () => {
    $('#year-number').max = $('#era-select').value === 'bce' ? 3000 : MAX_YEAR;
    editYear();
  });
  on('#submit', 'click', () => submit(false));
  on('#panorama', 'viewererror', () =>
    showLoadError('画面连接中断。计时与当前进度已保留。', () => renderGame(true)),
  );
  try {
    const [{ createViewer }, { createGuessMap }] = await Promise.all([
      import('./viewer.js'),
      import('./map.js'),
    ]);
    if (token !== generation) return;
    viewer = createViewer($('#panorama'));
    const map = await createGuessMap($('#guess-map'), (point) => {
      if (state.phase !== 'guessing') return;
      state.guess = point;
      updateLocation();
      remember();
    });
    if (token !== generation) {
      map.destroy();
      return;
    }
    guessMap = map;
    guessMap.reset('all');
    let round = currentRound();
    let image = round.image;
    if (state.mode !== 'practice' && import.meta.env.VITE_HISTORY_API_URL)
      image = new URL(image, new URL(import.meta.env.VITE_HISTORY_API_URL, location.href).origin)
        .href;
    await viewer.load({ ...round, image, view: round.view || { yaw: 180, pitch: 0, fov: 75 } });
    if (token !== generation) return;
    if (!restored && state.mode === 'practice') state.deadline = Date.now() + LIMIT * 1000;
    state.phase = 'guessing';
    $('#load-cover').hidden = true;
    setYear(state.year, state.yearTouched);
    if (state.guess) guessMap.goTo(state.guess);
    updateLocation();
    remember();
    tick();
    clock = setInterval(tick, 100);
    viewer.resize();
  } catch (error) {
    if (token === generation)
      showLoadError(error.message, () => renderGame(restored || Boolean(state.deadline)));
  }
}
function showLoadError(message, retry) {
  const cover = $('#load-cover');
  if (!cover) return;
  cover.hidden = false;
  cover.innerHTML = `${icon('compass')}<h2>这一页没能打开</h2><p>${esc(message)}</p><button class="primary" id="retry">重新载入</button><button class="secondary" id="load-home">返回首页</button>`;
  $('#retry').onclick = retry;
  $('#load-home').onclick = home;
}
function setView(view) {
  state.view = view;
  $('.game-shell')?.classList.toggle('show-map', view === 'map');
  for (const name of ['scene', 'map']) {
    $(`#${name}-tab`)?.classList.toggle('active', view === name);
    $(`#${name}-tab`)?.setAttribute('aria-pressed', String(view === name));
  }
  guessMap?.resize();
  viewer?.setActive(view === 'scene');
  viewer?.resize();
}
function updateLocation() {
  if (!$('#location-status')) return;
  $('#location-status').innerHTML =
    `${icon('pin')}<span>${state.guess ? esc(state.guess.name || '地图选点') : '地图上标记你的猜测'}</span>${state.guess ? '<b>已标记</b>' : ''}`;
  $('#pin-dot')?.classList.toggle('set', Boolean(state.guess));
  updateSubmit();
}
function closeSearch() {
  if ($('#search-results')) $('#search-results').hidden = true;
  $('#city-search')?.setAttribute('aria-expanded', 'false');
  $('#city-search')?.removeAttribute('aria-activedescendant');
}
function searchKeydown(event) {
  if (searchComposing || event.isComposing || event.keyCode === 229) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeSearch();
    return;
  }
  const list = $('#search-results');
  if (!list) return;
  if (list.hidden) {
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && $('#city-search').value.trim())
      searchCities();
    else return;
  }
  const choices = [...list.querySelectorAll('button')];
  if (!choices.length) return;
  let active = choices.findIndex((button) => button.getAttribute('aria-selected') === 'true');
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    active =
      event.key === 'ArrowDown'
        ? (active + 1) % choices.length
        : active < 0
          ? choices.length - 1
          : (active - 1 + choices.length) % choices.length;
    choices.forEach((button, index) =>
      button.setAttribute('aria-selected', String(index === active)),
    );
    $('#city-search').setAttribute('aria-activedescendant', choices[active].id);
    choices[active].scrollIntoView({ block: 'nearest' });
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    choices[active < 0 ? 0 : active].click();
  }
}
function searchCities() {
  const query = $('#city-search').value.trim(),
    target = $('#search-results');
  $('#city-search').removeAttribute('aria-activedescendant');
  if (!query || state.phase !== 'guessing') return closeSearch();
  const matches = cities.filter((city) => city.name.includes(query)).slice(0, 5);
  target.innerHTML = matches.length
    ? matches
        .map(
          (city, index) =>
            `<button id="search-city-${index}" role="option" aria-selected="false" tabindex="-1" data-city-index="${index}">${icon('pin')}<span>${esc(city.name)}</span>${icon('arrow')}</button>`,
        )
        .join('')
    : '<p>暂未收录，可直接在地图落点。</p>';
  target.hidden = false;
  $('#city-search').setAttribute('aria-expanded', 'true');
  target.querySelectorAll('button').forEach((button) => {
    button.onclick = () => {
      const city = matches[Number(button.dataset.cityIndex)];
      guessMap.goTo(city);
      $('#city-search').value = city.name;
      closeSearch();
      $('#city-search').blur();
    };
  });
}
function setYear(year, touched = true) {
  state.year = clamp(Math.round(year) || 1, MIN_YEAR, MAX_YEAR);
  state.yearTouched = touched;
  $('#year-range').value = state.year;
  $('#year-range').setAttribute('aria-valuetext', formatYear(state.year));
  $('#year-range').style.setProperty(
    '--progress',
    `${((state.year - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100}%`,
  );
  $('#era-select').value = state.year < 0 ? 'bce' : 'ce';
  $('#year-number').value = Math.abs(state.year);
  $('#year-number').max = state.year < 0 ? 3000 : MAX_YEAR;
  $('#year-number').removeAttribute('aria-invalid');
  $('#year-status').textContent = touched ? '年代已选' : '请选择年代';
  updateSubmit();
  remember();
}
function updateSubmit() {
  const button = $('#submit');
  if (!button) return;
  const ready = state.phase === 'guessing' && state.guess && state.yearTouched;
  button.disabled = !ready;
  button.innerHTML = `${ready ? '确认落笔' : !state.guess ? '先选一个地点' : '再选一个年代'} ${icon('arrow')}`;
}
function tick() {
  if (state.screen !== 'game' || state.phase !== 'guessing') return;
  const now = Date.now() + (state.mode === 'practice' ? 0 : state.serverOffset || 0);
  const seconds = Math.max(0, Math.ceil((state.deadline - now) / 1000));
  if ($('#timer')) {
    $('#timer').innerHTML = `${seconds}<small>秒</small>`;
    $('#timer').classList.toggle('urgent', seconds <= 5);
    $('#timer-progress').style.width = `${Math.min(100, (seconds / LIMIT) * 100)}%`;
  }
  if (seconds <= 0) submit(true);
}
async function submit(timedOut) {
  if (state.phase !== 'guessing' || (!timedOut && (!state.guess || !state.yearTouched))) return;
  const now = Date.now() + (state.mode === 'practice' ? 0 : state.serverOffset || 0);
  timedOut ||= now >= state.deadline;
  state.phase = 'submitting';
  clearInterval(clock);
  viewer?.setActive(false);
  closeSearch();
  updateSubmit();
  if (state.mode === 'practice') {
    const round = currentRound();
    const score = timedOut ? 0 : scoreGuess(round, state.guess, state.year).total;
    state.results.push({ id: round.id, total: score, timedOut });
    state.phase = 'revealed';
    if (!state.dev) {
      saved.visited = saved.visited.filter((id) => id !== round.id);
      saved.visited.push(round.id);
    }
    remember();
    chime();
    roundResult();
  } else {
    const token = generation;
    try {
      const data = await historyApi.answer(state.run.id, {
        roundId: state.run.round.id,
        year: state.yearTouched ? state.year : null,
        point: state.guess ? { lat: state.guess.lat, lng: state.guess.lng } : null,
        requestId:
          state.answerRequest ||
          (state.answerRequest =
            globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`),
      });
      if (token !== generation) return;
      state.answerRequest = null;
      await acceptRun(data.run);
    } catch (error) {
      if (token !== generation) return;
      state.phase = 'submit-error';
      showLoadError('成绩尚未确认。重新连接会保留服务器上的答题结果。', async () => {
        try {
          const data = await historyApi.run(state.run.id);
          state.answerRequest = null;
          await acceptRun(data.run);
        } catch (retryError) {
          toast(retryError.message);
        }
      });
    }
  }
}
function pause() {
  if (state.phase !== 'guessing') return;
  if (state.mode === 'practice') {
    state.pausedRemaining = Math.max(0, state.deadline - Date.now());
    state.phase = 'paused';
    remember();
  }
  clearInterval(clock);
  viewer?.setActive(false);
  const overlay = document.createElement('section');
  overlay.className = 'pause-overlay';
  overlay.innerHTML = `<div class="pause-card"><span class="eyebrow">${state.mode === 'practice' ? '把这一刻，暂存' : '竞技仍在计时'}</span><h1>${state.mode === 'practice' ? '歇一会，再启程。' : '这一幕还未落笔。'}</h1><p>${state.mode === 'practice' ? '剩余时间与猜测已为你留好。' : '离开后仍按原截止时间计分，超时为零分。'}</p><button id="resume" class="primary full-width">继续观察 ${icon('arrow')}</button><button id="pause-home" class="secondary full-width">保存并返回首页</button></div>`;
  app.append(overlay);
  $('#resume').onclick = () => {
    overlay.remove();
    if (state.mode === 'practice') {
      state.deadline = Date.now() + state.pausedRemaining;
      state.phase = 'guessing';
      remember();
    }
    viewer?.setActive(state.view === 'scene');
    tick();
    clock = setInterval(tick, 100);
  };
  $('#pause-home').onclick = home;
}
function roundResult() {
  const result = state.results[state.index],
    score = state.mode === 'practice' ? result.total : result.score,
    timedOut = result.timedOut;
  const last = state.index === roundCount() - 1;
  remember();
  shell(
    '这一幕的评分',
    `<div class="result-emblem">${icon(timedOut ? 'clock' : 'compass')}</div><p class="eyebrow center">第 ${state.index + 1} / ${roundCount()} 幕 · ${timedOut ? '时间已到' : '已落笔'}</p><h1 class="page-title center">${timedOut ? '下一幕，再从容一点。' : score >= 4000 ? '你的直觉，很有来处。' : score >= 2000 ? '历史的轮廓，渐渐清晰。' : '每一眼，都算新的发现。'}</h1><div class="result-score"><strong>${fmt(score)}</strong><span>本幕评分 / 5,000</span></div><p class="result-note">${timedOut ? '超时未交卷，本幕记为 0 分。' : '答案留在历史里。带着好奇，继续往前。'}</p><div class="score-journey">${Array.from({ length: roundCount() }, (_, index) => `<span class="${index <= state.index ? 'done' : ''}">${index <= state.index ? icon('check') : String(index + 1).padStart(2, '0')}</span>`).join('<i></i>')}</div><button class="primary full-width" id="next">${last ? '收下这份旅行手记' : '前往下一幕'} ${icon('arrow')}</button><p class="art-note">${state.mode === 'practice' ? '本地练习' : '服务端计分'} · 当前总分 ${fmt(sumScore())}</p>`,
    { back: home },
  );
  state.phase = 'revealed';
  on('#next', 'click', () =>
    busy('#next', async () => {
      if (state.mode === 'practice') {
        if (last) return finish();
        state.index++;
        state.guess = null;
        state.year = 1000;
        state.yearTouched = false;
        state.deadline = null;
        await renderGame();
      } else {
        const token = generation;
        const data = await historyApi.next(state.run.id, state.run.round.id);
        if (token === generation) await acceptRun(data.run);
      }
    }),
  );
}
function finish() {
  if (state.mode === 'duel' && !state.opponent) {
    saved.lastDuelRunId = state.run.id;
    save();
  }
  const score = sumScore(),
    total = roundCount(),
    mode = state.mode,
    level = levelById(state.level),
    opponent = state.opponent;
  if (mode === 'practice') {
    if (level && !state.dev) {
      const previous = saved.records[level.id];
      saved.records[level.id] = { best: Math.max(previous?.best || 0, score), complete: true };
    }
    saved.mobileJourney = null;
    saved.journey = null;
    state.phase = 'finished';
    save();
  }
  const next = level ? LEVELS[LEVELS.findIndex((item) => item.id === level.id) + 1] : null;
  shell(
    '旅途落款',
    `<p class="eyebrow center">${mode === 'practice' ? '本地旅途' : mode === 'daily' ? '今日全站竞逐' : '好友 PK'} · 已完成</p><div class="finish-stamp" aria-hidden="true">山河<br>已阅</div><h1 class="page-title center">${opponent ? (score > opponent.score ? '这一局，你更胜一筹。' : score === opponent.score ? '山河相逢，不分高下。' : '好对手，值得再赴一约。') : '把这一刻，<br>写进你的手记。'}</h1><div class="result-score"><strong>${fmt(score)}</strong><span>本局总分 / ${fmt(total * 5000)}</span></div>${opponent ? `<p class="opponent-score">${esc(opponent.nickname)} · ${fmt(opponent.score)} 分</p>` : ''}<div class="score-receipt">${state.results.map((result, index) => `<div><span>第 ${index + 1} 幕${result.timedOut ? ' · 超时' : ''}</span><b>${fmt(mode === 'practice' ? result.total : result.score)}</b></div>`).join('')}</div><div id="finish-actions">${mode === 'practice' ? `<button class="primary full-width" id="finish-next">${next ? '下一关，新的相遇' : '再赴一场旅途'} ${icon('arrow')}</button><button class="secondary full-width" id="again">再练一次</button>` : `<button class="primary full-width" id="share-result">${opponent || mode === 'daily' ? '另开一局，向好友下战书' : '寄出战书，邀友来战'} ${icon('share')}</button><button class="secondary full-width" data-nav="leaderboard">去看山河榜</button>`}</div><p class="art-note">${mode === 'practice' ? (state.dev ? '开发试玩 · 不保存成长与关卡纪录' : level ? `本关最佳 ${fmt(saved.records[level.id]?.best)} 分 · ${next ? '下一小关已解锁' : '九关旅途已完成'}` : '往日旅途已收录') : mode === 'daily' ? '每日正式首局记榜 · 只分享战绩，不公开答案' : '好友对局独立计分 · 不计全站榜'}</p><button class="text-button settings-link" data-nav="home">返回首页 ${icon('arrow')}</button>`,
    { back: home },
  );
  state.phase = 'finished';
  on('#finish-next', 'click', () => (next ? prepare(next.id) : chapters()));
  on('#again', 'click', () => (level ? startLocal(level) : chapters()));
  on('#share-result', 'click', () =>
    busy('#share-result', async () => {
      if (opponent || mode === 'daily') return competitionPrepare('duel');
      const token = generation;
      const data = await historyApi.invite(state.run.id);
      if (token === generation) sharePage(data.invite);
    }),
  );
}
function sharePage(invite) {
  const link = invitationUrl(invite.code);
  shell(
    '寄出一封战书',
    `<div class="prepare-compass">${icon('share')}</div><p class="eyebrow center">此时此地 · 好友 PK</p><h1 class="page-title center">我的直觉，<br>等你来超越。</h1><div class="invitation-score"><span>我已得分</span><strong>${fmt(invite.host?.score)}</strong><small>/ 25,000 分</small></div><button class="primary full-width" id="share-invite">分享给朋友 ${icon('share')}</button><button class="secondary full-width" id="copy-invite">复制战书链接</button><div class="share-ticket"><label for="share-link">专属战书链接</label><input readonly id="share-link" value="${esc(link)}"><p>五幕同题 · 24 小时有效 · 不含答案</p></div><p class="art-note" id="share-status" role="status">好友打开链接，即可接下这封战书。</p><section class="challenger-section"><div class="challenger-heading"><h2>战书回音</h2><button class="text-button" id="refresh-challengers">刷新 ${icon('arrow')}</button></div><div id="challenger-list">${challengersMarkup(invite)}</div></section>`,
    { back: challenge },
  );
  on('#copy-invite', 'click', () => busy('#copy-invite', () => copyLink(link)));
  on('#refresh-challengers', 'click', () =>
    busy('#refresh-challengers', async () => {
      const token = generation;
      const data = await historyApi.inspect(invite.code);
      if (token === generation) $('#challenger-list').innerHTML = challengersMarkup(data.invite);
    }),
  );
  on('#share-invite', 'click', () =>
    busy('#share-invite', async () => {
      if (sharePending) return;
      const token = generation;
      sharePending = true;
      try {
        if (navigator.share) {
          try {
            await navigator.share({
              title: '此时此地 · 一封好友战书',
              text: `五幕历史，我得了 ${fmt(invite.host?.score)} 分。你能认出何时何地吗？`,
              url: link,
            });
            return;
          } catch (error) {
            if (token !== generation) return;
            if (error.name === 'AbortError') return toast('战书已保留，随时可以再分享。');
          }
        }
        if (token === generation) await copyLink(link);
      } finally {
        sharePending = false;
      }
    }),
  );
}
function challengersMarkup(invite) {
  return invite.challengers?.length
    ? `<div class="challenger-list">${invite.challengers.map((challenger) => `<div><span><strong>${esc(challenger.nickname)}</strong><small>${challenger.score > invite.host.score ? '超越了你的直觉' : challenger.score === invite.host.score ? '与你并列' : '已赴这一场约'}</small></span><b>${fmt(challenger.score)}</b></div>`).join('')}</div>`
    : '<p class="challenger-empty">还没有好友完成挑战。寄出战书，等一份回音。</p>';
}
async function copyLink(link) {
  const token = generation;
  try {
    await navigator.clipboard.writeText(link);
    if (token !== generation) return;
    if ($('#share-status')) $('#share-status').textContent = '战书链接已复制，发给朋友就能开局。';
    toast('战书链接已复制。');
  } catch {
    if (token !== generation) return;
    $('#share-link')?.focus();
    $('#share-link')?.select();
    if ($('#share-status')) $('#share-status').textContent = '请长按选中的链接，复制后发给朋友。';
  }
}
window.addEventListener('resize', () => {
  if (state.screen === 'game') setView(state.view);
});
window.addEventListener('pagehide', remember);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.screen === 'game') tick();
});
window.SmallGamesDev?.registerActions([
  {
    id: 'history-unlock-practice',
    label: '解锁全部练习关卡（试玩）',
    run: () => {
      if (!window.SmallGamesDev.isEnabled()) return;
      devUnlock = true;
      chapters();
    },
  },
]);
window.SmallGamesDev?.registerSnapshot(() => ({
  screen: state.screen,
  mode: state.mode,
  phase: state.phase,
  chapter: state.level,
  index: state.index,
  completed: completed(),
  practiceUnlocked: devUnlock,
}));
const invite = new URLSearchParams(location.search).get('invite');
if (invite && /^[a-zA-Z0-9_-]{8,100}$/.test(invite)) invitation(invite);
else home();
