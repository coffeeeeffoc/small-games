import './style.css';
import { ARROWS, LEVELS } from './levels.ts';
import { advance, canSelect, createSimulation, dispatch, matchGroup, queueHead, snapshot, splitGroup, splitPlans, stars } from './simulation.ts';
import type { SplitPlan } from './simulation.ts';
import type { StationScene } from './scene.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
const KEY = 'homebound-station.progress.v2';
interface Progress { stars: number[]; sound: boolean; lowQuality: boolean }
function loadProgress(): Progress {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { stars: LEVELS.map((_, i) => Number.isInteger(raw?.stars?.[i]) && raw.stars[i] >= 0 && raw.stars[i] <= 3 ? raw.stars[i] : 0), sound: raw?.sound !== false, lowQuality: raw?.lowQuality === true };
  } catch { return { stars: [0, 0, 0], sound: true, lowQuality: false }; }
}
const progress = loadProgress();
let storageWarning = '';
function save() { try { localStorage.setItem(KEY, JSON.stringify(progress)); storageWarning = ''; } catch { storageWarning = '浏览器未允许本地保存，本次成绩仅在当前页面保留。'; } }
app.innerHTML = `<header class="topbar"><div class="brand"><span class="stamp">归</span><div><h1>归途站</h1><p id="level-title"></p></div></div><div class="stats"><span>剩余 <b id="remaining">0</b><em> 辆</em></span><div class="progress-track"><i id="progress"></i></div></div><button id="pause" class="square" aria-label="暂停"><svg viewBox="0 0 20 20" width="16" height="20" aria-hidden="true"><rect x="4" y="2" width="4" height="16" fill="currentColor"/><rect x="12" y="2" width="4" height="16" fill="currentColor"/></svg><span>暂停</span></button></header>
<main id="stage"><div class="stage-caption"><span id="station-status">清空车场 · 有序回家</span><span id="clock">00:00</span></div><div class="stage-tools"><span id="passenger-count"></span><button id="fullscreen" aria-label="切换全屏">⛶</button></div></main>
<footer class="console"><div class="guidance"><span class="guide-step" id="step">01</span><p id="hint"></p><button id="speed" aria-label="切换模拟速度">1×</button></div><div id="selection"></div><div class="console-foot"><span>有序出发 · 好好团圆</span><button id="sound">声音 开</button></div></footer>
<div id="notice" role="status" aria-live="polite"></div><dialog id="dialog" aria-labelledby="dialog-title"></dialog>`;
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const modal = el<HTMLDialogElement>('dialog');
let state = createSimulation(LEVELS[0]!); state.paused = true;
let selectedVehicle: string | undefined, selectedGroup: string | undefined;
let speed = 1, mode = 'menu', lastFrame = performance.now(), lastHud = 0, lastDelivered = 0, settled = false;
let audio: AudioContext | undefined, noticeTimer: ReturnType<typeof setTimeout> | undefined;
function beep(success = true) {
  if (!progress.sound) return;
  try {
    audio ??= new AudioContext(); void audio.resume();
    const osc = audio.createOscillator(), gain = audio.createGain(); osc.type = 'sine';
    osc.frequency.setValueAtTime(success ? 660 : 220, audio.currentTime); osc.frequency.exponentialRampToValueAtTime(success ? 880 : 180, audio.currentTime + 0.12);
    gain.gain.setValueAtTime(0.045, audio.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.22);
    osc.connect(gain).connect(audio.destination); osc.start(); osc.stop(audio.currentTime + 0.23);
  } catch { /* Sound is optional; dispatch remains playable when audio is unavailable. */ }
}
function notice(text: string, success = false) {
  el('notice').textContent = text; el('notice').classList.add('visible');
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => el('notice').classList.remove('visible'), 4500); beep(success);
}
let scene: StationScene | undefined;
function html(target: HTMLElement, content: string) { if (target.innerHTML !== content) target.innerHTML = content; }
function time(value: number) { return `${Math.floor(value / 60).toString().padStart(2, '0')}:${Math.floor(value % 60).toString().padStart(2, '0')}`; }
function open(content: string, nextMode: string) {
  mode = nextMode; state.paused = true; modal.innerHTML = content;
  if (!modal.open) modal.showModal();
}
function close() { modal.close(); mode = 'playing'; state.paused = false; lastFrame = performance.now(); }
async function start(index: number) {
  selectedVehicle = undefined; selectedGroup = undefined;
  state = createSimulation(LEVELS[index]!); speed = 1; settled = false; lastDelivered = 0;
  open('<p class="eyebrow">这一班，准备出发</p><h2 id="dialog-title">正在打开车站…</h2><p>即将进入车阵</p>', 'loading');
  try {
    scene ??= new (await import('./scene.ts')).StationScene(el('stage'), select);
    scene.reset(); scene.setQuality(progress.lowQuality);
  } catch {
    open('<h2 id="dialog-title">暂时无法打开车站</h2><p>请检查网络以及浏览器硬件加速，然后重试。</p><button class="primary wide" data-action="retry">重新打开</button><button class="quiet wide" data-action="menu">返回选关</button>', 'load-error');
    return;
  }
  el('notice').classList.remove('visible'); if (noticeTimer) clearTimeout(noticeTimer);
  close(); updateHud(); void scene.loadScenery();
}
function menu() {
  open(`<div class="ticket-top">HOMEBOUND STATION <span>出租车出库 · 路线解谜</span></div><p class="eyebrow">看似乱成一团，总有归途</p><h2 id="dialog-title" class="hero-title">归途<span>站</span></h2><p class="intro">看箭头，解开彼此挡路的出租车。<br>接上旅客，让整片车场有序清空。</p><div class="level-list">${LEVELS.map((l, i) => {
    const unlocked = i === 0 || progress.stars[i - 1]! > 0;
    return `<button data-level="${i}" ${unlocked ? '' : 'disabled'}><span class="level-number">0${l.id}</span><span><b>${l.title}</b><small>${unlocked ? l.subtitle : `完成第 ${i} 关后开放`}</small></span><em>${progress.stars[i] ? '★'.repeat(progress.stars[i]!) : unlocked ? '↗' : '锁定'}</em></button>`;
  }).join('')}</div><p class="fineprint">点击或滑动车辆 → 沿箭头出库 → 自动接客</p>`, 'menu');
}
function pause() {
  if (mode !== 'playing' || state.won) return;
  open(`<p class="eyebrow">调度员，请稍作休息</p><h2 id="dialog-title">已暂停</h2><p>车辆、乘客和计时都已暂停。</p><button class="primary wide" data-action="resume">继续接班</button><div class="two-actions"><button data-action="retry">重新开始</button><button data-action="menu">返回选关</button></div><button class="quiet wide" data-action="quality">画质：${progress.lowQuality ? '省电' : '精细'} · 点击切换</button><button class="quiet wide" data-action="sound">声音：${progress.sound ? '开' : '关'}</button>`, 'pause');
}
function select(kind: 'vehicle' | 'group' | 'bay', id: string) {
  if (mode !== 'playing' || state.paused || state.won) return;
  if (kind === 'vehicle') {
    selectedVehicle = id; selectedGroup = undefined;
    const result = dispatch(state, id); notice(result.reason, result.ok);
    if (result.ok) selectedVehicle = undefined;
  } else if (kind === 'group') { selectedGroup = id; selectedVehicle = undefined; beep(); }
  else {
    const head = queueHead(state, id);
    if (head && head.passengers.length > 4) { selectedGroup = head.id; selectedVehicle = undefined; }
    else notice(`${id} ${head ? `队首 ${head.passengers.length} 人` : '旅客已接完'}，点击车辆即可自动接客`);
  }
  updateHud();
}
function openSplit(groupId: string) {
  const g = state.groups.find(g => g.id === groupId)!, plans = splitPlans(state, groupId);
  if (!plans.length) { notice('还没有两辆能依次出库的车，请先解开阻挡'); return; }
  const plan = plans[0]!;
  open(`<p class="eyebrow">${g.id} · ${g.passengers.length} 位成年同行旅客</p><h2 id="dialog-title">分开坐，一起出发</h2><p>原组改为两个子组，人数保持不变。<br>依次上车即可，不必同时占用两个上车点。</p><div class="split-options">${plans.map((p, i) => `<label><input type="radio" name="split-plan" value="${i}" ${i === 0 ? 'checked' : ''}> ${p.counts.join(' + ')} 人</label>`).join('')}</div><div id="split-detail"></div><label class="consent"><input id="consent" type="checkbox"> 已同意分车</label><p class="fineprint">两辆车预留 120 秒；到期释放车辆预留，子组仍保留排队号。</p><button class="primary wide" id="confirm-split" disabled>确认安排</button><button class="quiet wide" data-action="cancel-split">再考虑一下</button>`, 'split');
  const detail = (p: SplitPlan) => html(el('split-detail'), p.vehicles.map((id, i) => {
    const v = state.vehicles.find(v => v.id === id)!;
    return `<div class="split-car"><span>${i === 0 ? '第一辆' : '第二辆'} · <b>${id}</b></span><strong>${p.counts[i]} / ${v.passengerCapacity}<small>名乘客</small></strong><small>${ARROWS[v.direction]} 沿箭头依次出库 · ${v.seatCount} 座，含司机</small></div>`;
  }).join(''));
  detail(plan);
  modal.querySelectorAll<HTMLInputElement>('[name="split-plan"]').forEach(input => input.onchange = () => detail(plans[Number(input.value)]!));
  el<HTMLInputElement>('consent').onchange = () => { el<HTMLButtonElement>('confirm-split').disabled = !el<HTMLInputElement>('consent').checked; };
  el('confirm-split').onclick = () => {
    const chosen = plans[Number(modal.querySelector<HTMLInputElement>('[name="split-plan"]:checked')!.value)]!;
    const consent = el<HTMLInputElement>('consent').checked;
    state.paused = false; const result = splitGroup(state, groupId, chosen, consent); state.paused = true;
    if (result.ok) { close(); selectedGroup = undefined; updateHud(); }
    notice(result.reason, result.ok);
  };
}
function updateHud() {
  app.dataset.level = String(state.config.id); app.dataset.status = state.won ? 'won' : state.paused ? 'paused' : 'playing';
  el('level-title').textContent = `0${state.config.id} / ${state.config.title}`;
  const remaining = state.vehicles.filter(v => v.state !== 'removed').length;
  el('remaining').textContent = String(remaining);
  el('passenger-count').textContent = `已接 ${state.delivered.size}/${state.target} 人`;
  el('progress').style.width = `${(state.vehicles.length - remaining) / state.vehicles.length * 100}%`;
  el('clock').textContent = time(state.time); el('speed').textContent = `${speed}×`; el('sound').textContent = `声音 ${progress.sound ? '开' : '关'}`;
  const free = state.bays.filter(b => b.state === 'free').length;
  el('station-status').textContent = `空闲上车位 ${free}/4 · 自动接客`;
  const v = state.vehicles.find(v => v.id === selectedVehicle), g = state.groups.find(g => g.id === selectedGroup);
  let hint = state.config.hint, step = '01', content = '';
  if (v && v.state === 'holding') {
    const check = matchGroup(state, v), blocked = canSelect(state, v);
    hint = blocked ?? (check.ok ? '前方已畅通，再点这辆车即可出发。' : check.reason); step = '02';
    content = `<div class="selected-card"><div class="car-icon">${ARROWS[v.direction]}</div><div><b>${v.id} · 可载 ${v.passengerCapacity} 人</b><small>${v.seatCount}座含司机 · ${blocked ? '前方有阻挡' : check.reason}</small></div><button id="cancel-selection" class="quiet">收起</button></div>`;
    const big = state.groups.find(g => splitPlans(state, g.id).length > 0);
    if (!blocked && !check.ok && big) content += `<button class="group-shortcut" data-inspect-group="${big.id}">安排 ${big.passengers.length} 人分乘 →</button>`;
  } else if (g) {
    const plans = splitPlans(state, g.id);
    hint = '分乘后两辆车各接自己的子组，原组不会重复接驳。';
    content = `<div class="group-summary"><b>${g.id} · ${g.passengers.length} 人</b><button id="cancel-selection" class="quiet">收起</button></div>${plans.length ? `<button id="split" class="wide">分乘 ${plans[0]!.counts.join('+')} 人<small>${plans[0]!.vehicles.join(' + ')} · 已有出库路线</small></button>` : '<p class="subtle">直接点车出库，车辆会自动接队首旅客。</p>'}`;
  } else {
    const waiting = state.groups.find(g => splitPlans(state, g.id).length > 0);
    const split = waiting && splitPlans(state, waiting.id)[0];
    content = split ? `<button class="group-shortcut" data-inspect-group="${waiting!.id}">队首 ${waiting!.passengers.length} 人 · 安排两辆车分乘 →</button>` :
      `<div class="idle-prompt"><span class="hand">↗</span><div><b>${state.delivered.size === state.target ? '旅客已接完，把剩下的车开走' : '找一辆箭头前方畅通的车'}</b><p>点击或滑动车辆 · 不用选择上车位</p></div></div>`;
  }
  el('hint').textContent = hint; el('step').textContent = step; html(el('selection'), content);
  const cancel = el('cancel-selection'); if (cancel) cancel.onclick = clearSelection;
  const split = el('split'); if (split) split.onclick = () => openSplit(selectedGroup!);
  el('selection').querySelectorAll<HTMLElement>('[data-inspect-group]').forEach(button => button.onclick = () => select('group', button.dataset.inspectGroup!));
}
function clearSelection() { selectedGroup = undefined; selectedVehicle = undefined; updateHud(); }
function finish() {
  settled = true; progress.stars[state.config.id - 1] = Math.max(progress.stars[state.config.id - 1]!, stars(state)); save(); beep();
  open(`<p class="eyebrow">本班接驳完成 · 辛苦了</p><div class="result-stars">${'★'.repeat(stars(state))}<span>${'☆'.repeat(3 - stars(state))}</span></div><h2 id="dialog-title">这一程，有你真好</h2><p>每一位旅客都已乘车驶离车站。</p><div class="result-stats"><div><b>${state.delivered.size} / ${state.target}</b><small>已接驳人数</small></div><div><b>${time(state.time)}</b><small>本班用时</small></div><div><b>${Math.round(state.maxWait)} 秒</b><small>最长上车等待</small></div></div><p class="fineprint">全部接驳后按最长等待评星；不要求满载，不放弃任何一组。<br>三星 ≤ ${state.config.stars[0]} 秒 · 二星 ≤ ${state.config.stars[1]} 秒</p>${storageWarning ? `<p>${storageWarning}</p>` : ''}<button class="primary wide" data-action="${state.config.id < LEVELS.length ? 'next' : 'menu'}">${state.config.id < LEVELS.length ? '下一班 · 继续接班 →' : '返回选关'}</button><div class="two-actions"><button data-action="retry">重新挑战</button><button data-action="menu">关卡手记</button></div>`, 'result');
}
modal.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button || button.disabled) return;
  if (button.dataset.level !== undefined) { start(Number(button.dataset.level)); beep(); return; }
  switch (button.dataset.action) {
    case 'resume': case 'cancel-split': close(); break;
    case 'retry': start(state.config.id - 1); break;
    case 'menu': menu(); break;
    case 'next': start(state.config.id); break;
    case 'quality': progress.lowQuality = !progress.lowQuality; scene?.setQuality(progress.lowQuality); save(); button.textContent = `画质：${progress.lowQuality ? '省电' : '精细'} · 点击切换`; break;
    case 'sound': progress.sound = !progress.sound; save(); button.textContent = `声音：${progress.sound ? '开' : '关'}`; break;
  }
});
modal.addEventListener('cancel', event => { event.preventDefault(); if (mode === 'pause' || mode === 'split') close(); });
el('pause').onclick = pause;
el('speed').onclick = () => { speed = speed === 1 ? 2 : 1; updateHud(); };
el('sound').onclick = () => { progress.sound = !progress.sound; save(); beep(); updateHud(); };

el('fullscreen').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else notice('此浏览器暂不提供全屏接口；可添加到主屏幕游玩');
  } catch { notice('浏览器未允许全屏，请在独立页面再次尝试'); }
};
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.open) { if (selectedGroup || selectedVehicle) clearSelection(); else pause(); } });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); lastFrame = performance.now(); });
window.addEventListener('pagehide', () => { state.paused = true; });
window.addEventListener('pageshow', event => { if (event.persisted && mode === 'playing') { state.paused = false; pause(); } lastFrame = performance.now(); });
// Read-only, detached snapshots support reproducible browser acceptance without a test-only dispatch API.
Object.assign(window, { homeboundSnapshot: () => structuredClone(snapshot(state)), homeboundVisualSnapshot: () => scene?.inspect() });
let frameId = 0;
function frame(now: number) {
  const elapsed = (now - lastFrame) / 1000; lastFrame = now;
  if (mode === 'playing') advance(state, elapsed * speed);
  if (state.delivered.size > lastDelivered) { lastDelivered = state.delivered.size; beep(); }
  if (state.won && !settled) finish();
  if (mode === 'playing') scene?.render(state, selectedVehicle, selectedGroup);
  if (now - lastHud >= 150) { updateHud(); lastHud = now; }
  frameId = requestAnimationFrame(frame);
}
updateHud(); menu(); frameId = requestAnimationFrame(frame);
if (import.meta.hot) import.meta.hot.dispose(() => { cancelAnimationFrame(frameId); if (noticeTimer) clearTimeout(noticeTimer); scene?.dispose(); void audio?.close(); });
