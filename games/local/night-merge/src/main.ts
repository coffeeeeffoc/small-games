import './style.css';
import {
  BUFFS,
  GUARDS,
  SUMMON_COST,
  createGame,
  moveUnit,
  sellUnit,
  summon,
  beginWave,
  chooseBuff,
  castSkill,
  revive,
  tick,
  type Location,
  type ActionResult,
  type Kind,
} from './game.ts';
import { guardIcon, drawBattle } from './art.ts';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const icon = (name: string) => {
  const paths: Record<string, string> = {
    moon: '<path d="M17 3a9 9 0 1 0 4 15A8 8 0 0 1 17 3Z"/>',
    coin: '<circle cx="12" cy="12" r="8"/><path d="m12 7 3 5-3 5-3-5Z"/>',
    gate: '<path d="M4 21V5h4v3h8V5h4v16M9 21v-7a3 3 0 0 1 6 0v7M2 21h20"/>',
    spark: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"/>',
    bell: '<path d="M6 9a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8ZM9 21h6M12 1v2"/>',
    sound: '<path d="M10 4 5 9H2v6h3l5 5ZM14 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    mute: '<path d="M10 4 5 9H2v6h3l5 5Zm5 5 6 6m0-6-6 6"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 0c0 3-3 2-3 6m0 2v1"/>',
    sell: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.spark}</svg>`;
};

type RecordEntry = {
  wave: number;
  won: boolean;
  seconds: number;
  merges: number;
  summons: number;
  level: number;
  revived: boolean;
  buffs: string[];
  date: string;
};
type Profile = {
  embers: number;
  talent: number;
  bestWave: number;
  wins: number;
  runs: number;
  firstDay: string;
  days: string[];
  records: RecordEntry[];
  muted: boolean;
};
const PROFILE_KEY = 'night-merge.profile.v1';
const METRICS_KEY = 'night-merge.metrics.v1';
const day = () => new Date().toLocaleDateString('sv-SE');
const natural = (v: unknown, max: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;
let storageFailed = false;
function loadProfile(): Profile {
  const fallback: Profile = {
    embers: 0,
    talent: 0,
    bestWave: 0,
    wins: 0,
    runs: 0,
    firstDay: day(),
    days: [],
    records: [],
    muted: false,
  };
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null');
    if (
      !raw ||
      !natural(raw.embers, 1e8) ||
      !natural(raw.talent, 5) ||
      !natural(raw.bestWave, 10) ||
      !natural(raw.wins, 1e7) ||
      !natural(raw.runs, 1e7)
    )
      return fallback;
    return {
      ...fallback,
      embers: raw.embers,
      talent: raw.talent,
      bestWave: raw.bestWave,
      wins: raw.wins,
      runs: raw.runs,
      muted: raw.muted === true,
      firstDay: /^\d{4}-\d{2}-\d{2}$/.test(raw.firstDay) ? raw.firstDay : day(),
      days: Array.isArray(raw.days)
        ? raw.days
            .filter((d: unknown) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
            .slice(-60)
        : [],
      records: Array.isArray(raw.records)
        ? raw.records
            .filter(
              (r: RecordEntry) =>
                r &&
                natural(r.wave, 10) &&
                natural(r.seconds, 86400) &&
                natural(r.merges, 10000) &&
                natural(r.summons, 10000) &&
                natural(r.level, 3) &&
                typeof r.won === 'boolean',
            )
            .slice(-20)
        : [],
    };
  } catch {
    storageFailed = true;
    return fallback;
  }
}
const profile = loadProfile();
let metrics: Record<string, unknown>[] = [];
try {
  const raw = JSON.parse(localStorage.getItem(METRICS_KEY) ?? '[]');
  if (Array.isArray(raw)) metrics = raw.filter((e) => e && typeof e.type === 'string').slice(-1000);
} catch {
  storageFailed = true;
}
function saveProfile() {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    storageFailed = true;
  }
}
let metricsDirty = false;
function track(event: Record<string, unknown>) {
  const detail = { ...event, at: Date.now() };
  metrics.push(detail);
  if (metrics.length > 1500) metrics.splice(0, metrics.length - 1500);
  metricsDirty = true;
  window.dispatchEvent(new CustomEvent('night-merge:telemetry', { detail }));
}
function flushMetrics() {
  if (!metricsDirty) return;
  try {
    localStorage.setItem(METRICS_KEY, JSON.stringify(metrics));
    metricsDirty = false;
  } catch {
    storageFailed = true;
  }
}
if (!profile.days.includes(day())) {
  const age = Math.round((Date.parse(day()) - Date.parse(profile.firstDay)) / 86400000);
  profile.days = [...profile.days, day()].slice(-60);
  track({ type: 'visit', day: day(), cohortDay: age, d1: age === 1, d3: age === 3 });
  saveProfile();
}

let state = createGame(profile.talent);
let selected: Location | null = null;
let panel: 'intro' | 'help' | 'pause' | 'buff' | 'result' | 'camp' | null = null;
let settled = false;
let audio: AudioContext | null = null;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
function sound(kind: 'tap' | 'merge' | 'bell' | 'loss') {
  if (profile.muted) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume().catch(() => {});
    const tones = {
      tap: [520],
      merge: [392, 523, 784],
      bell: [261, 392, 523, 784],
      loss: [220, 185, 146],
    }[kind];
    tones.forEach((frequency, i) => {
      const oscillator = audio!.createOscillator();
      const gain = audio!.createGain();
      const start = audio!.currentTime + i * 0.065;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.09, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, start + (kind === 'bell' ? 0.7 : 0.2));
      oscillator.connect(gain).connect(audio!.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.75);
    });
  } catch {
    /* Sound may be unavailable in an embedded browser; play remains available. */
  }
}

let noiseBuffer: AudioBuffer | null = null;
const lastCombatSound = new Map<string, number>();
function combatSound(kind: Kind | 'bell', impact: boolean, level: number, killed = false) {
  if (profile.muted || !audio || audio.state !== 'running' || document.hidden || panel) return;
  const key = `${kind}-${impact}`;
  const now = performance.now();
  if (now - (lastCombatSound.get(key) ?? -Infinity) < (impact ? 65 : 90)) return;
  lastCombatSound.set(key, now);
  const start = audio.currentTime;
  const weight = (0.7 + level * 0.13) * (killed ? 1.15 : 1);
  const tone = (
    from: number,
    to: number,
    length: number,
    volume: number,
    type: OscillatorType = 'triangle',
  ) => {
    const oscillator = audio!.createOscillator();
    const gain = audio!.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + length);
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.linearRampToValueAtTime(volume * weight, start + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, start + length);
    oscillator.connect(gain).connect(audio!.destination);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(start);
    oscillator.stop(start + length + 0.01);
  };
  const noise = (
    frequency: number,
    length: number,
    volume: number,
    type: BiquadFilterType = 'bandpass',
  ) => {
    if (!noiseBuffer || noiseBuffer.sampleRate !== audio!.sampleRate) {
      noiseBuffer = audio!.createBuffer(1, Math.ceil(audio!.sampleRate * 0.4), audio!.sampleRate);
      const samples = noiseBuffer.getChannelData(0);
      let seed = 717;
      for (let i = 0; i < samples.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        samples[i] = seed / 2147483648 - 1;
      }
    }
    const source = audio!.createBufferSource();
    const filter = audio!.createBiquadFilter();
    const gain = audio!.createGain();
    source.buffer = noiseBuffer;
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 0.7;
    gain.gain.setValueAtTime(volume * weight, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + length);
    source.connect(filter).connect(gain).connect(audio!.destination);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
    source.start(start);
    source.stop(start + length);
  };
  if (kind === 'archer') {
    noise(impact ? 1500 : 3400, impact ? 0.065 : 0.11, impact ? 0.16 : 0.09);
    tone(impact ? 310 : 1150, impact ? 100 : 380, 0.055, impact ? 0.055 : 0.018);
  } else if (kind === 'shield') {
    noise(impact ? 750 : 1100, 0.12, impact ? 0.2 : 0.07);
    tone(impact ? 145 : 200, 52, impact ? 0.18 : 0.09, impact ? 0.16 : 0.045, 'sine');
    if (impact) tone(860, 740, 0.1, 0.025);
  } else if (kind === 'mage' || kind === 'bell') {
    noise(impact ? 550 : 1300, impact ? 0.26 : 0.19, impact ? 0.28 : 0.11, 'lowpass');
    tone(impact ? 130 : 180, impact ? 38 : 370, impact ? 0.23 : 0.16, impact ? 0.1 : 0.045, 'sine');
  } else {
    tone(impact ? 2350 : 1100, impact ? 1500 : 1750, impact ? 0.21 : 0.14, 0.025, 'sine');
    noise(impact ? 4800 : 2800, impact ? 0.11 : 0.17, impact ? 0.12 : 0.055, 'highpass');
    if (impact) tone(1550, 650, 0.09, 0.035);
  }
}

$('#app').innerHTML = `
  <aside class="desktop-note left-note"><span class="eyebrow">THE LAST LIGHT</span><h2>夜很长。<br>总有人，<br>为你留灯。</h2><p>让相同的微光相遇，<br>成为守住长夜的力量。</p><div class="note-line"></div><span class="tiny">合成 · 布阵 · 守到天明</span></aside>
  <main class="game" aria-label="合成守夜人游戏">
    <header class="masthead"><div class="brand-mark">${icon('moon')}</div><div class="brand"><span class="eyebrow">NIGHT MERGE</span><h1>合成守夜人</h1></div><div class="header-actions"><button id="help" class="icon-button" aria-label="玩法说明">${icon('help')}</button><button id="mute" class="icon-button" aria-label="关闭声音">${icon('sound')}</button><button id="pause" class="icon-button" aria-label="暂停游戏">${icon('pause')}</button></div></header>
    <section class="resource-bar" aria-label="城门和资源"><div class="gate-resource">${icon('gate')}<div><div class="resource-label">城门耐久 <strong id="hp-text"></strong></div><div class="health-track"><i id="hp-fill"></i></div></div></div><div class="coin-resource">${icon('coin')}<strong id="gold"></strong><span>金币</span></div></section>
    <section class="battlefield" aria-label="自动防守战场"><canvas id="battle" role="img" aria-label="月夜森林战场，守卫自动阻挡怪物"></canvas><div class="wave-banner"><span class="watch-dot"></span><span id="wave-label">长夜将至</span><span id="clock">00:00</span></div><div id="battle-message" class="battle-message"></div><div id="boss-alert" class="boss-alert" hidden></div><div class="field-label"><span>城墙驻防</span><span>仅驻防守卫自动攻击</span></div><div class="field" aria-label="四个驻防位">${Array.from({ length: 4 }, (_, i) => `<button class="slot field-slot" data-area="field" data-slot="${i}" aria-label="驻防位 ${i + 1}"></button>`).join('')}</div></section>
    <div class="wave-track" aria-label="怪潮进度">${Array.from({ length: 10 }, (_, i) => `<i data-wave="${i + 1}" class="${i === 4 || i === 9 ? 'boss-mark' : ''}"><span>${i === 4 || i === 9 ? '◆' : i + 1}</span></i>`).join('')}</div>
    <section class="workshop" aria-label="合成棋盘"><div class="section-heading"><h2>守夜营地 <span>合成区</span></h2><span id="board-count">2 / 12</span></div><div id="selection-hint" class="selection-hint">拖动同类同级守卫合成；拖到城墙即可出战</div><div class="board" aria-label="三行四列合成棋盘">${Array.from({ length: 12 }, (_, i) => `<button class="slot board-slot" data-area="board" data-slot="${i}" aria-label="营地格位 ${i + 1}"></button>`).join('')}</div><div class="supply-row"><span><i class="supply-dot"></i><span id="supply-text"></span></span><span id="unlock-text">弓手 · 盾卫</span></div></section>
    <footer class="controls"><button id="sell" class="secondary-button sell-button" disabled>${icon('sell')}<span>遣散<span id="sell-price">选中守卫</span></span></button><button id="summon" class="primary-button">${icon('spark')}<span>召唤守卫<small>${SUMMON_COST} 金币 / 次</small></span><b>＋</b></button><button id="skill" class="secondary-button skill-button">${icon('bell')}<span>破晓钟<small id="skill-time">范围伤害</small></span></button></footer>
    <div class="underbar"><span id="buff-summary">愿每一束微光，都能等到天亮。</span><button id="camp">守夜手记 ${icon('arrow')}</button></div>
    <div id="toast" role="status" aria-live="polite"></div>
  </main>
  <aside class="desktop-note right-note"><span class="eyebrow">守夜法则 / FIELD NOTES</span><article><b>01</b><h3>让微光相遇</h3><p>同类、同级合成。<br>两名一阶，化作一名二阶。</p></article><article><b>02</b><h3>把强者送上城墙</h3><p>营地里的守卫不会攻击。<br>四个驻防位，每一位都重要。</p></article><article><b>03</b><h3>为未知留一格</h3><p>援军会不断到来。<br>合成、遣散，留住下一次可能。</p></article><span class="tiny">十波怪潮 · 两位领主 · 一夜黎明</span></aside>
  <dialog id="panel" aria-labelledby="panel-title"></dialog><div id="drag-ghost" aria-hidden="true"></div>`;

const dialog = $<HTMLDialogElement>('#panel');
const canvas = $<HTMLCanvasElement>('#battle');
const context = canvas.getContext('2d')!;
const slots = [...document.querySelectorAll<HTMLButtonElement>('.slot')];
const fieldSlots = slots.filter((slot) => slot.dataset.area === 'field');
const battlefield = $('.battlefield');
const ghost = $('#drag-ghost');
let toastTimer: ReturnType<typeof setTimeout>;
function toast(message: string) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2400);
}
const same = (a: Location | null, b: Location) => a?.area === b.area && a.index === b.index;
const slotLocation = (el: HTMLElement): Location => ({
  area: el.dataset.area as Location['area'],
  index: Number(el.dataset.slot),
});
function act(result: ActionResult) {
  if (result.message) toast(result.message);
  if (result.ok) sound('tap');
  renderUI();
  drainEvents();
}
function closePanel() {
  dialog.close();
  panel = null;
  state.paused = false;
  previousFrame = performance.now();
  renderUI();
}
function showPanel(mode: NonNullable<typeof panel>) {
  cancelDrag();
  selected = null;
  panel = mode;
  state.paused = true;
  const heading = (eyebrow: string, title: string, text: string) =>
    `<span class="eyebrow">${eyebrow}</span><h2 id="panel-title">${title}</h2><p class="panel-description">${text}</p>`;
  const closeButton = '<button class="primary-button wide" data-close>继续守夜</button>';
  if (mode === 'intro') {
    dialog.innerHTML = `<div class="intro-moon">${icon('moon')}<i></i></div>${heading('A LITTLE LIGHT AGAINST THE NIGHT', '合成守夜人', '灯还亮着，城就不会沉睡。')}<div class="intro-guards">${guardIcon('archer', 1)}<span>＋</span>${guardIcon('archer', 1)}<span>→</span>${guardIcon('archer', 2)}</div><div class="intro-steps"><span><b>合成</b>同类同级拖到一起</span><span><b>驻防</b>拖上城墙自动攻击</span><span><b>守夜</b>十波怪潮，等到天明</span></div><button id="start-night" class="primary-button wide">开始守夜 ${icon('arrow')}</button><p class="panel-footnote">约 4 分钟一局 · 随时暂停 · 也可点击两格操作</p>`;
  } else if (mode === 'help') {
    dialog.innerHTML = `${heading('守夜人备忘', '把微光，合成星火', '拖动操作，或先点守卫、再点目标格。')}<div class="help-list"><p><b>合成与出战</b>同类同级合成，最高三阶。不同守卫互换位置；拖回营地即可撤下。只有城墙上四位守卫攻击。</p><p><b>金币与空间</b>击败怪物、完成波次获得金币。每 14 秒送来援军，满格时保留，空出位置就能接收。选中守卫可遣散换金币。</p><p><b>守夜与祝福</b>第 5、10 波是领主，前一波结束三选一。第 3 波解锁炎法，第 6 波解锁冰法。破晓钟伤害并减速全场，冷却后可再次敲响。</p></div><div class="guard-guide">${(Object.keys(GUARDS) as Kind[]).map((k) => `<div>${guardIcon(k, 1)}<span><b>${GUARDS[k].name}</b><small>${GUARDS[k].role}</small></span></div>`).join('')}</div>${closeButton}<p class="panel-footnote">键盘：Tab 切换，Enter 选择 / 放置，Esc 取消 / 暂停</p>`;
  } else if (mode === 'pause') {
    dialog.innerHTML = `${heading('THE NIGHT CAN WAIT', '篝火还在，歇一会儿', '怪潮、援军和技能冷却均已暂停。')}<div class="pause-symbol">${icon('bell')}</div>${closeButton}<button class="text-button" data-action="restart">结束本局，重新布阵</button>`;
  } else if (mode === 'buff') {
    dialog.innerHTML = `${heading('CHOOSE YOUR BLESSING', '长夜赠礼 · 三选一', `第 ${state.wave + 1} 波领主将至。选一份祝福，持续到本局结束。`)}<div class="buff-choices">${state.choices.map((id) => `<button class="buff-choice" data-buff="${id}"><span class="buff-icon">${icon(id === 'renewal' ? 'gate' : id === 'thorns' ? 'moon' : 'spark')}</span><span><small>${BUFFS[id].tag}</small><b>${BUFFS[id].name}</b><em>${BUFFS[id].description}</em></span>${icon('arrow')}</button>`).join('')}</div><p class="panel-footnote">此刻时间静止。想好再选。</p>`;
  } else if (mode === 'result') {
    const won = state.phase === 'won';
    const reward = Math.max(2, state.wave * 2) + (won ? 10 : 0);
    dialog.innerHTML = `<div class="result-emblem">${icon(won ? 'spark' : 'moon')}</div>${heading(won ? 'DAWN HAS FOUND YOU' : 'THE LIGHT WILL RETURN', won ? '天亮了，守夜人。' : '今夜，灯火暂歇', won ? '你守住了最后一盏灯。城里的人醒来了。' : `倒在第 ${state.wave} 波。带上余烬，下一夜会更强。`)}<div class="result-stats"><div><strong>${state.wave}<small>/10</small></strong><span>抵达波次</span></div><div><strong>${state.merges}</strong><span>完成合成</span></div><div><strong>${formatTime(state.elapsed)}</strong><span>守夜时长</span></div></div><div class="reward-line">${icon('spark')} 本局余烬 +${reward} <span>用于永久加固城门</span></div>${!won && !state.revived ? '<button class="primary-button wide" data-action="revive">重燃灯火 · 本局免费复活一次</button><p class="panel-footnote">修复城门、震退怪潮，保留阵容与祝福</p>' : ''}<button class="${!won && !state.revived ? 'secondary-button' : 'primary-button'} wide" data-action="restart">收下余烬 · 再守一夜</button><button class="text-button" data-action="result-camp">收下余烬 · 回到手记</button>`;
  } else {
    dialog.innerHTML = `${heading('THE WATCHER’S JOURNAL', '守夜手记', '每一夜留下的余烬，都会成为下一夜的光。')}<div class="result-stats"><div><strong>${profile.bestWave}<small>/10</small></strong><span>最远波次</span></div><div><strong>${profile.wins}</strong><span>守到天明</span></div><div><strong>${profile.embers}</strong><span>持有余烬</span></div></div><div class="talent-card">${icon('gate')}<div><h3>不灭城墙 <span>${profile.talent} / 5</span></h3><p>每阶永久增加 10 点城门耐久，下一局生效。</p></div></div><button class="secondary-button wide" data-action="talent" ${profile.talent >= 5 || profile.embers < (profile.talent + 1) * 8 ? 'disabled' : ''}>${profile.talent >= 5 ? '城墙已完全加固' : `加固城墙 · ${(profile.talent + 1) * 8} 余烬`}</button><div class="journal-records">${
      profile.records
        .slice(-3)
        .reverse()
        .map(
          (r) =>
            `<div><span>${r.won ? '黎明已至' : `守至第 ${r.wave} 波`}</span><span>${formatTime(r.seconds)} · ${r.merges} 次合成</span></div>`,
        )
        .join('') || '<p>第一份战报，等待你来写下。</p>'
    }</div><button class="primary-button wide" data-close>${state.phase === 'won' || state.phase === 'lost' ? '开启下一夜' : '返回营地'}</button><button class="text-button" data-action="export">导出守夜战报</button><p class="panel-footnote">${storageFailed ? '浏览器存储不可用，本次记录仅保留到页面关闭。' : '战绩与天赋保存在当前浏览器。'}</p>`;
  }
  if (!dialog.open) dialog.showModal();
  renderUI();
}
function settleRun() {
  if (settled || state.wave === 0) return;
  settled = true;
  const won = state.phase === 'won';
  profile.embers += Math.max(2, state.wave * 2) + (won ? 10 : 0);
  profile.bestWave = Math.max(profile.bestWave, state.wave);
  profile.wins += Number(won);
  profile.runs++;
  profile.records.push({
    wave: state.wave,
    won,
    seconds: Math.floor(state.elapsed),
    merges: state.merges,
    summons: state.summons,
    level: state.highestLevel,
    revived: state.revived,
    buffs: [...state.buffs],
    date: day(),
  });
  profile.records = profile.records.slice(-20);
  track({
    type: 'run_settled',
    wave: state.wave,
    won,
    revived: state.revived,
    revivalSource: state.revived ? 'free' : null,
    adReviveSuccess: null,
    stats: state.stats,
  });
  saveProfile();
  flushMetrics();
}
function restart() {
  track({ type: 'restart', wave: state.wave });
  if (state.phase === 'won' || state.phase === 'lost') settleRun();
  state = createGame(profile.talent);
  settled = false;
  selected = null;
  closePanel();
  toast('新的一夜。先把守卫派上城墙，再敲响夜钟。');
}
dialog.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!button || button.disabled) return;
  sound('tap');
  if (button.id === 'start-night') {
    closePanel();
    toast('先合成两名弓手，或把他们拖上城墙。');
  } else if (button.hasAttribute('data-close')) {
    if (state.phase === 'won' || state.phase === 'lost') restart();
    else closePanel();
  } else if (button.dataset.buff) {
    state.paused = false;
    const result = chooseBuff(state, button.dataset.buff);
    if (result.ok) closePanel();
    else state.paused = true;
    act(result);
  } else if (button.dataset.action === 'restart') restart();
  else if (button.dataset.action === 'revive') {
    const result = revive(state);
    if (result.ok) closePanel();
    act(result);
  } else if (button.dataset.action === 'result-camp') {
    settleRun();
    showPanel('camp');
  } else if (
    button.dataset.action === 'talent' &&
    profile.talent < 5 &&
    profile.embers >= (profile.talent + 1) * 8
  ) {
    profile.embers -= (profile.talent + 1) * 8;
    profile.talent++;
    saveProfile();
    track({ type: 'talent_upgrade', level: profile.talent });
    showPanel('camp');
  } else if (button.dataset.action === 'export') {
    flushMetrics();
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ version: 1, profile, events: metrics }, null, 2)], {
        type: 'application/json',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `守夜战报-${day()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
});
dialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  if (
    panel === 'help' ||
    panel === 'pause' ||
    (panel === 'camp' && state.phase !== 'lost' && state.phase !== 'won')
  )
    closePanel();
});

let pointer: {
  id: number;
  from: Location;
  x: number;
  y: number;
  dragging: boolean;
  source: HTMLElement;
} | null = null;
let ignoreClickUntil = 0;
function cancelDrag() {
  const old = pointer;
  pointer = null;
  if (old?.source.hasPointerCapture(old.id)) old.source.releasePointerCapture(old.id);
  ghost.classList.remove('visible');
  document
    .querySelectorAll('.dragging, .drop-target')
    .forEach((e) => e.classList.remove('dragging', 'drop-target'));
}
for (const slot of slots) {
  slot.addEventListener('pointerdown', (event) => {
    if (panel || state.paused || pointer || !event.isPrimary || event.button !== 0) return;
    const from = slotLocation(slot);
    if (!state[from.area][from.index]) return;
    pointer = {
      id: event.pointerId,
      from,
      x: event.clientX,
      y: event.clientY,
      dragging: false,
      source: slot,
    };
    slot.setPointerCapture(event.pointerId);
  });
  slot.addEventListener('pointermove', (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    if (!pointer.dragging && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 7) {
      const unit = state[pointer.from.area][pointer.from.index];
      if (!unit) {
        cancelDrag();
        return;
      }
      pointer.dragging = true;
      ghost.innerHTML = guardIcon(unit.kind, unit.level);
      ghost.classList.add('visible');
      slot.classList.add('dragging');
    }
    if (pointer.dragging) {
      ghost.style.transform = `translate(${event.clientX - 36}px, ${event.clientY - 44}px)`;
      document.querySelectorAll('.drop-target').forEach((e) => e.classList.remove('drop-target'));
      document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest('.slot, #sell')
        ?.classList.add('drop-target');
    }
  });
  slot.addEventListener('pointerup', (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const { from, dragging } = pointer;
    cancelDrag();
    if (!dragging) return;
    ignoreClickUntil = Date.now() + 300;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('.slot, #sell');
    if (target?.id === 'sell') {
      selected = null;
      act(sellUnit(state, from));
    } else if (target?.dataset.slot) {
      selected = null;
      act(moveUnit(state, from, slotLocation(target)));
    } else {
      selected = null;
      renderUI();
    }
  });
  slot.addEventListener('pointercancel', () => {
    cancelDrag();
    selected = null;
    renderUI();
  });
  slot.addEventListener('lostpointercapture', () => {
    if (pointer) {
      cancelDrag();
      renderUI();
    }
  });
  slot.addEventListener('click', () => {
    if (Date.now() < ignoreClickUntil || panel || state.paused) return;
    const to = slotLocation(slot);
    if (same(selected, to)) selected = null;
    else if (selected) {
      const from = selected;
      selected = null;
      act(moveUnit(state, from, to));
    } else if (state[to.area][to.index]) {
      selected = to;
      sound('tap');
    }
    renderUI();
  });
}
$('#summon').addEventListener('click', () => act(summon(state)));
$('#sell').addEventListener('click', () => {
  if (selected) {
    const from = selected;
    selected = null;
    act(sellUnit(state, from));
  }
});
$('#skill').addEventListener('click', () => {
  act(castSkill(state));
});
$('#pause').addEventListener('click', () => showPanel('pause'));
$('#help').addEventListener('click', () => showPanel('help'));
$('#camp').addEventListener('click', () => showPanel('camp'));
$('#mute').addEventListener('click', () => {
  profile.muted = !profile.muted;
  saveProfile();
  if (profile.muted) {
    void audio?.close();
    audio = null;
    lastCombatSound.clear();
  } else sound('tap');
  renderUI();
});
$('#battle-message').addEventListener('click', (event) => {
  if ((event.target as HTMLElement).closest('#begin-wave')) act(beginWave(state));
});
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || dialog.open) return;
  if (pointer || selected) {
    cancelDrag();
    selected = null;
    renderUI();
  } else showPanel('pause');
});
function pauseForBackground() {
  cancelDrag();
  selected = null;
  if (!panel && (state.phase === 'playing' || state.phase === 'intermission')) showPanel('pause');
  flushMetrics();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseForBackground();
  previousFrame = performance.now();
});
window.addEventListener('blur', pauseForBackground);
window.addEventListener('pagehide', () => {
  pauseForBackground();
  saveProfile();
  void audio?.close();
  audio = null;
});

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`;
}
let battleMessageKey = '';
function renderUI() {
  $('.game').dataset.phase = state.phase;
  $('.game').dataset.paused = String(state.paused);
  $('#hp-text').textContent = `${Math.ceil(state.hp)} / ${state.maxHp}`;
  $('#hp-fill').style.width = `${Math.max(0, state.hp / state.maxHp) * 100}%`;
  $('#hp-fill').classList.toggle('danger', state.hp / state.maxHp < 0.3);
  $('#gold').textContent = String(Math.floor(state.gold));
  $('#clock').textContent = formatTime(state.elapsed);
  $('#wave-label').textContent = state.wave
    ? `第 ${String(state.wave).padStart(2, '0')} / 10 波${state.wave === 5 || state.wave === 10 ? ' · 领主之夜' : ' · 雾林怪潮'}`
    : '第一夜 · 等候钟声';
  const count = state.board.filter(Boolean).length;
  $('#board-count').textContent = `${count} / 12`;
  $('#board-count').classList.toggle('full', count === 12);
  const unit = selected ? state[selected.area][selected.index] : null;
  if (selected && !unit) selected = null;
  $('#selection-hint').textContent = unit
    ? `${GUARDS[unit.kind].name} · ${unit.level} 阶：点同类合成，点空位移动，点其他守卫互换`
    : '拖动同类同级守卫合成；拖到城墙即可出战';
  const frozen =
    !!panel ||
    state.paused ||
    state.phase === 'won' ||
    state.phase === 'lost' ||
    state.phase === 'buff';
  slots.forEach((slot) => {
    const location = slotLocation(slot);
    const guard = state[location.area][location.index];
    const signature = guard ? `${guard.id}-${guard.kind}-${guard.level}` : '';
    if (slot.dataset.signature !== signature) {
      slot.dataset.signature = signature;
      slot.innerHTML = guard
        ? `${guardIcon(guard.kind, guard.level)}<span class="unit-name">${GUARDS[guard.kind].name}</span><span class="unit-level" aria-hidden="true">${'✦'.repeat(guard.level)}</span>`
        : `<span class="empty-mark">${location.area === 'field' ? '＋' : '·'}</span>${location.area === 'field' ? '<small>驻防</small>' : ''}`;
    }
    if (guard) slot.dataset.unit = String(guard.id);
    else delete slot.dataset.unit;
    slot.classList.toggle('occupied', !!guard);
    slot.classList.toggle('selected', same(selected, location));
    slot.classList.toggle(
      'mergeable',
      !!unit &&
        !!guard &&
        unit.id !== guard.id &&
        unit.kind === guard.kind &&
        unit.level === guard.level &&
        unit.level < 3,
    );
    slot.classList.toggle('tier-three', guard?.level === 3);
    slot.disabled = frozen;
    slot.setAttribute('aria-pressed', String(same(selected, location)));
    slot.setAttribute(
      'aria-label',
      `${location.area === 'field' ? '驻防' : '营地'} ${location.index + 1}，${guard ? `${GUARDS[guard.kind].name} ${guard.level} 阶` : '空位'}`,
    );
  });
  $('#supply-text').textContent =
    state.phase === 'ready'
      ? '开战后每 14 秒援军抵达'
      : state.pendingSupply
        ? '援军已抵达 · 空出一格即可接收'
        : `援军抵达 ${Math.max(0, Math.ceil(state.supplyTime))} 秒`;
  $('#unlock-text').textContent =
    state.wave >= 6 ? '全兵种已集结' : state.wave >= 3 ? '第 6 波解锁冰法' : '第 3 波解锁炎法';
  $<HTMLButtonElement>('#summon').disabled = frozen || state.gold < SUMMON_COST || count === 12;
  $<HTMLButtonElement>('#sell').disabled = frozen || !unit;
  $('#sell-price').textContent = unit ? `+${6 * 2 ** (unit.level - 1)} 金币` : '选中守卫';
  $<HTMLButtonElement>('#skill').disabled =
    frozen || state.phase !== 'playing' || state.skillCooldown > 0;
  $('#skill-time').textContent =
    state.skillCooldown > 0 ? `${Math.ceil(state.skillCooldown)} 秒` : '范围伤害';
  $('#mute').innerHTML = icon(profile.muted ? 'mute' : 'sound');
  $('#mute').setAttribute('aria-label', profile.muted ? '开启声音' : '关闭声音');
  $('#buff-summary').textContent = state.buffs.length
    ? state.buffs.map((id) => BUFFS[id].name).join(' · ')
    : '愿每一束微光，都能等到天亮。';
  const messageKey = `${state.phase}-${state.field.some(Boolean)}-${Math.ceil(state.intermissionTime)}`;
  if (messageKey !== battleMessageKey) {
    battleMessageKey = messageKey;
    $('#battle-message').innerHTML =
      state.phase === 'ready'
        ? `<span class="battle-instruction">先合成，再把守卫拖上城墙</span><button id="begin-wave" ${!state.field.some(Boolean) ? 'disabled' : ''}>${icon('bell')} 敲响夜钟 · 开始第 1 波</button>`
        : state.phase === 'intermission'
          ? `<span class="intermission-title">第 ${state.wave} 波已守住</span><span>整理阵容，${Math.ceil(state.intermissionTime)} 秒后怪潮再临</span>`
          : '';
  }
  const boss = state.enemies.find((e) => e.boss);
  $('#boss-alert').hidden = !boss;
  if (boss)
    $('#boss-alert').textContent =
      `${state.wave === 5 ? '枯木领主' : '永夜君王'} · ${Math.ceil(boss.hp)} / ${boss.maxHp}`;
  document.querySelectorAll<HTMLElement>('[data-wave]').forEach((e) => {
    e.classList.toggle('passed', Number(e.dataset.wave) < state.wave || state.phase === 'won');
    e.classList.toggle('active', Number(e.dataset.wave) === state.wave);
  });
}
function drainEvents() {
  const events = state.events.splice(0);
  for (const event of events) {
    const combat =
      event.type === 'attack_start' || event.type === 'attack_release' || event.type === 'hit';
    if (!combat) track({ ...event, elapsed: event.elapsed ?? event.at });
    // Discard old audio when a slow foreground frame resolves several attacks at once.
    if (combat && state.elapsed - Number(event.at) < 0.2) {
      if (event.type === 'attack_release' || event.type === 'hit')
        combatSound(
          event.kind as Kind | 'bell',
          event.type === 'hit',
          Number(event.level) || 1,
          !!event.killed,
        );
    }
    if (event.type === 'merge') {
      sound('merge');
      $('.workshop').classList.remove('merge-flash');
      void $('.workshop').offsetWidth;
      $('.workshop').classList.add('merge-flash');
    }
    if (event.type === 'skill') {
      sound('bell');
      kickAt = state.elapsed;
      kickStrength = 2.5;
    }
    if (event.type === 'gate_hit') {
      kickAt = state.elapsed;
      gateHitAt = state.elapsed;
      kickStrength = 3;
      if (state.elapsed - Number(event.at) < 0.2) combatSound('shield', true, 2);
    }
    if (event.type === 'block' && typeof event.slot === 'number') {
      blockAt[event.slot] = state.elapsed;
      if (state.elapsed - Number(event.at) < 0.2) combatSound('shield', true, 1);
    }
  }
}
let kickAt = -Infinity;
let gateHitAt = -Infinity;
let kickStrength = 0;
let visualState = state;
const blockAt = Array(4).fill(-Infinity);
function renderCombatActors() {
  if (visualState !== state) {
    visualState = state;
    kickAt = gateHitAt = -Infinity;
    blockAt.fill(-Infinity);
  }
  const reduce = reducedMotion.matches;
  for (let i = 0; i < fieldSlots.length; i++) {
    const slot = fieldSlots[i];
    const guard = state.field[i];
    const shot = guard && state.shots.find((s) => s.unitId === guard.id);
    let x = 0,
      y = 0,
      rotation = 0,
      stretch = 1,
      weapon = 0,
      glow = 0;
    slot.dataset.attack = shot
      ? shot.duration - shot.life < shot.windup
        ? 'windup'
        : 'flight'
      : 'idle';
    if (guard && !reduce) {
      y = Math.sin(state.elapsed * 2.4 + guard.id) * 0.8;
      if (shot) {
        const age = shot.duration - shot.life;
        const charging = age < shot.windup;
        const pull = charging ? Math.sin(((age / shot.windup) * Math.PI) / 2) : 0;
        const release = charging ? 0 : Math.exp(-(age - shot.windup) * 17);
        const direction = shot.tx > shot.x ? 1 : -1;
        if (guard.kind === 'archer') {
          x = direction * (-3 * pull + 5 * release);
          y += 2 * pull - 4 * release;
          rotation = direction * (-6 * pull + 8 * release);
          weapon = -13 * pull + 10 * release;
        } else if (guard.kind === 'shield') {
          x = direction * (-2 * pull + 7 * release);
          y += 4 * pull - 17 * release;
          rotation = direction * (4 * pull - 13 * release);
          weapon = 7 * pull - 16 * release;
          stretch = 1 - 0.08 * pull + 0.1 * release;
        } else {
          y += -3 * pull - 7 * release;
          rotation = direction * (-4 * pull + 7 * release);
          weapon = 15 * pull - 24 * release;
          stretch = 1 + 0.04 * pull + 0.06 * release;
        }
        glow = pull * 3 + release * 6;
      }
      const block = Math.max(0, 1 - (state.elapsed - blockAt[i]) / 0.2);
      y += Math.sin(block * Math.PI * 2) * block * 5;
      glow = Math.max(glow, block * 7);
    }
    const tint =
      guard?.kind === 'frost' ? '#9feaff' : guard?.kind === 'mage' ? '#ffad65' : '#ffe1a0';
    slot.style.setProperty(
      '--guard-motion',
      `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${rotation.toFixed(2)}deg) scaleY(${stretch.toFixed(3)})`,
    );
    slot.style.setProperty('--weapon-motion', `rotate(${weapon.toFixed(2)}deg)`);
    slot.style.setProperty(
      '--guard-glow',
      glow > 0.05 ? `drop-shadow(0 0 ${glow.toFixed(1)}px ${tint})` : 'none',
    );
  }
  const age = state.elapsed - kickAt;
  const kick = reduce ? 0 : Math.max(0, 1 - age / 0.25) * kickStrength;
  battlefield.style.transform =
    kick > 0
      ? `translate(${(Math.sin(age * 105) * kick).toFixed(2)}px, ${(Math.cos(age * 87) * kick * 0.6).toFixed(2)}px)`
      : '';
  battlefield.style.setProperty(
    '--gate-hit',
    String(Math.max(0, 1 - (state.elapsed - gateHitAt) / 0.3) * (reduce ? 0.1 : 0.45)),
  );
}
let previousFrame = performance.now();
let lastUI = 0;
let lastFlush = 0;
function frame(now: number) {
  const dt = Math.max(0, (now - previousFrame) / 1000);
  previousFrame = now;
  if (!document.hidden && !panel) tick(state, dt);
  drainEvents();
  if (state.phase === 'buff' && panel !== 'buff') showPanel('buff');
  if ((state.phase === 'won' || state.phase === 'lost') && panel !== 'result' && panel !== 'camp') {
    sound(state.phase === 'won' ? 'bell' : 'loss');
    if (state.phase === 'won' || state.revived) settleRun();
    showPanel('result');
  }
  if (now - lastUI > 80) {
    renderUI();
    lastUI = now;
  }
  if (now - lastFlush > 5000) {
    flushMetrics();
    lastFlush = now;
  }
  renderCombatActors();
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(devicePixelRatio || 1, 2);
  const width = Math.round(rect.width * ratio);
  const height = Math.round(rect.height * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  drawBattle(
    context,
    state,
    state.elapsed + (state.phase === 'ready' ? now / 1000 : 0),
    rect.width,
    rect.height,
    reducedMotion.matches,
  );
  requestAnimationFrame(frame);
}
renderUI();
showPanel('intro');
requestAnimationFrame(frame);
