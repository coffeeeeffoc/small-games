import './dev-mode.js';
import { createDeveloperAPI } from './src/developer.mjs';
import { createLevel, createEndless, place, placeIssuedGroup, undo, hasPlacement, previewPlacement, finishEndless, continueLevel } from './src/engine.mjs';
import { SHAPE_BY_ID } from './src/shapes.mjs';
import { LEVELS, CHAPTERS, getLevel } from './src/levels.mjs';
import { readProgress, saveProgress, recordLevelResult, recordEndlessResult, isLevelUnlocked, totalStars, resumeState, saveCurrentGame } from './src/progress.mjs';
import { createAudio } from './src/audio.mjs';
import { createOnlineClient } from './src/client.mjs';

const app = document.querySelector('#game');
const toastNode = document.querySelector('#toast');
const palette = ['#ed806b', '#73bf94', '#f2cb58', '#91a9c0', '#acbc73'];
const storage = { getItem(key) { try { return localStorage.getItem(key); } catch { return null; } }, setItem(key, value) { try { localStorage.setItem(key, value); } catch { /* Continue in memory. */ } } };
let progress = readProgress(storage);
let state = null;
let screen = 'home', previousScreen = 'home', briefLevel = 1, briefPractice = false;
let selectedSlot = null, drag = null, inputLockedUntil = 0, animationTimer, toastTimer;
let onlineSession = null, onlineBusy = false, onlineError = '', pendingAction = null, pendingFinish = false;
let ranking = null, rankingBusy = false, rankingError = '';
let devPractice = false, recordedResult = null;
let developerReturnScreen = 'home', devShowSolution = false;
const devEnabled = () => globalThis.SmallGamesDev?.isEnabled() === true;
let lastTouchMenu = null;
let gameEpoch = 0;
const online = createOnlineClient();
const audio = createAudio(() => progress.settings);

const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const pad = (value) => String(value).padStart(2, '0');
const fmt = (value) => Number(value || 0).toLocaleString('zh-CN');
const endlessName = (game = state) => game?.variant === 'refill' ? '立即补位' : '三选二';
const localBest = (game = state) => game?.variant === 'refill' ? progress.refillBest : progress.practiceBest;
const color = (value) => typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value) ? value : (progress.settings.highContrast ? ['#d86d41','#0e8b7d','#b98b14','#768bc5','#728f45'] : palette)[Math.abs(Number(value || 1) - 1) % palette.length];
function icon(name) {
  const paths = {
    settings:'<path d="m9 3-1 3-3 1v4l3 1 1 3h4l1-3 3-1V7l-3-1-1-3Z" transform="translate(1 2)"/><circle cx="12" cy="11" r="2.5"/>',
    levels:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    endless:'<path d="M12 12c-3-7-10-7-10 0s7 7 10 0 10-7 10 0-7 7-10 0Z"/>',
    play:'<path d="m7 4 13 8-13 8Z" fill="currentColor" stroke="none"/>',
    refill:'<path d="M20 9a8 8 0 0 0-14-4L3 8m0-5v5h5M4 15a8 8 0 0 0 14 4l3-3m0 5v-5h-5"/>',
    back:'<path d="m14 5-7 7 7 7"/>', pause:'<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>',
    help:'<circle cx="12" cy="12" r="9"/><path d="M9.4 9a2.7 2.7 0 1 1 4.2 2.2c-1 .6-1.6 1.1-1.6 2.3M12 17h.01"/>',
    undo:'<path d="M8 5 3 10l5 5M3 10h11a6 6 0 0 1 0 12"/>', home:'<path d="m3 10 9-7 9 7v11H3ZM9 21v-8h6v8"/>',
    trophy:'<path d="M7 3h10v6a5 5 0 0 1-10 0ZM7 5H3v3a4 4 0 0 0 5 4m9-7h4v3a4 4 0 0 1-5 4M12 14v6m-4 1h8"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.help}</svg>`;
}
function star(fill = '#e8be55', className = '') { return `<svg viewBox="0 0 24 24" aria-hidden="true" class="${className}"><path d="m12 2.4 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L2.9 9l6.3-.9Z" fill="${fill}"/></svg>`; }
function stars(count, large = false) { return `<span class="${large ? 'result-stars' : 'stars'}" aria-label="${count} 星">${[1,2,3].map((index) => star(index <= count ? '#e8be55' : '#d9dfce')).join('')}</span>`; }
function block(x, y, size, fill, extra = '') {
  const radius = Math.max(3, size * .14);
  return `<g ${extra}><rect x="${x}" y="${y+1.5}" width="${size}" height="${size}" rx="${radius}" fill="${fill}" stroke="#314c383d" stroke-width="1"/><rect x="${x+1}" y="${y}" width="${size-2}" height="${size-2}" rx="${radius}" fill="${fill}"/><rect x="${x+1}" y="${y}" width="${size-2}" height="${size-2}" rx="${radius}" fill="url(#block-light)"/><rect x="${x+2.5}" y="${y+2}" width="${size-5}" height="${size-6}" rx="${Math.max(2,radius-1)}" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width=".8"/><path d="M${x+radius} ${y+size-2}h${size-radius*2}" stroke="#314c38" stroke-opacity=".18" stroke-width="2" stroke-linecap="round"/></g>`;
}
function paintDefinitions() {
  return '<svg class="paint-definitions" aria-hidden="true" width="0" height="0"><defs><linearGradient id="block-light" x2=".2" y2="1"><stop stop-color="#fff" stop-opacity=".36"/><stop offset=".45" stop-color="#fff" stop-opacity=".03"/><stop offset="1" stop-color="#34412b" stop-opacity=".12"/></linearGradient><linearGradient id="wood-rim" x2=".12" y2="1"><stop stop-color="#fff1d4"/><stop offset=".5" stop-color="#e6cfaa"/><stop offset="1" stop-color="#c8ad84"/></linearGradient><pattern id="surface-grain" width="5" height="7" patternUnits="userSpaceOnUse"><circle cx="1" cy="2" r=".45" fill="#765d3c" opacity=".035"/><circle cx="4" cy="5" r=".5" fill="#fff" opacity=".07"/></pattern></defs></svg>';
}
function mini(candidate, cell = 24) {
  const shape = SHAPE_BY_ID[candidate?.shapeId];
  if (!shape) return '';
  const pitch = cell + 3;
  return `<svg viewBox="0 0 ${shape.width*pitch} ${shape.height*pitch}" aria-hidden="true">${shape.cells.map(([x,y]) => block(x*pitch+1,y*pitch+1,cell,color(candidate.color)) + (candidate.stars?.some?.(([sx,sy])=>sx === x && sy === y) ? `<path d="m${x*pitch+cell/2} ${y*pitch+5} 2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3 4-1Z" fill="#fff"/>` : '')).join('')}</svg>`;
}
function hero() {
  return '<div class="hero" aria-hidden="true"><img src="./native/assets/art/hero.png" alt="" width="640" height="480" fetchpriority="high"></div>';
}
function header(title, back = 'home', right = '') {
  const label = back === 'resume' ? '继续游戏' : back === 'home' ? '返回首页' : '返回';
  return `<header class="screen-header"><button class="icon-button" data-action="${back}" aria-label="${label}">${icon('back')}</button><h2>${title}</h2>${right || '<span class="header-spacer"></span>'}</header>`;
}
function toast(message) { clearTimeout(toastTimer); toastNode.textContent = message; toastNode.hidden = false; toastTimer = setTimeout(() => { toastNode.hidden = true; }, 2600); }
function persist() {
  if (state && !onlineSession && !devPractice && (state.status === 'playing' || state.mode === 'level' && state.status === 'lost')) progress=saveCurrentGame(progress, state);
  saveProgress(storage, progress);
}
function saveOnline() {
  storage.setItem('three-choose-two-online-v1', JSON.stringify(onlineSession && onlineSession.status !== 'finished' ? { id: onlineSession.id, seq: onlineSession.seq, pending:pendingAction || [], finish:pendingFinish } : null));
}
function currentLevel() { return state?.config || getLevel(state?.levelId || briefLevel); }
function playableResume() { try { return resumeState(progress); } catch { return null; } }
function onlineRecovery() {
  try { const value = JSON.parse(storage.getItem('three-choose-two-online-v1') || 'null'); return typeof value?.id === 'string' && value.id ? value : null; }
  catch { return null; }
}
function canResumeOnline() {
  return onlineSession ? onlineSession.status !== 'finished' && !pendingFinish && state?.status === 'playing' : !!onlineRecovery() && !onlineRecovery().finish;
}
function isolateTrial() {
  if (devPractice) return;
  persist();
  if (onlineSession) saveOnline();
  gameEpoch++;clearTimeout(animationTimer);cancelDrag();selectedSlot=null;inputLockedUntil=0;
  onlineSession=null;pendingAction=null;pendingFinish=false;onlineError='';devPractice=true;
}
function startTrial(id) {
  if (!devEnabled() || !getLevel(id)) throw new RangeError('请选择有效试玩关卡');
  isolateTrial();devPractice=true;beginLevel(id);
}
function exitLocalGame() {
  if (!state || onlineSession) return;
  gameEpoch++;clearTimeout(animationTimer);cancelDrag();
  if (!devPractice) { progress={...progress,currentGame:null};saveProgress(storage,progress); }
  state=null;devPractice=false;selectedSlot=null;inputLockedUntil=0;recordedResult=null;show('home');
}
function updateTheme() {
  document.body.classList.toggle('high-contrast', !!progress.settings.highContrast);
  document.body.classList.toggle('reduced-flash', !!progress.settings.reducedFlash);
}
function show(next, options = {}) {
  cancelDrag();
  previousScreen = screen;
  screen = next;
  if (next !== 'playing') audio.syncMusic(false);
  else { audio.unlock(); audio.syncMusic(true); }
  render(options);
  window.scrollTo(0, 0);
  requestAnimationFrame(()=>{ if(screen === next)window.scrollTo(0,0); });
}
function render() {
  updateTheme();
  app.dataset.screen = screen;
  app.dataset.ready = 'true';
  app.dataset.mode = onlineSession ? 'online' : state?.mode || '';
  app.dataset.variant = state?.variant || 'classic';
  app.dataset.placements = String(state?.stats?.placements || 0);
  app.dataset.group = String(state?.group || 0);
  app.dataset.lines = String(state?.stats?.lines || 0);
  app.dataset.score = String(state?.score || 0);
  app.dataset.status = state?.status || '';
  const screens = { home: renderHome, levels: renderLevels, brief: renderBrief, playing: renderPlaying, pause: renderPause, settings: renderSettings, help: renderHelp, result: renderResult, endless: renderEndless, leaderboard: renderLeaderboard, 'dev-levels': () => renderLevels(true), 'dev-tools': renderDeveloperTools };
  app.innerHTML = paintDefinitions() + (screens[screen] || renderHome)();
  try { if (window.parent !== window) window.parent.postMessage({ type:'small-games:display-state', gameId:'three-choose-two', screen:screen === 'home' ? 'home' : 'playing' }, location.origin); } catch { /* Standalone is fully playable. */ }
}
function renderHome() {
  const saved = playableResume(), resumeOnline = canResumeOnline(), recovery = onlineRecovery();
  const id = saved?.levelId || Math.min(progress.unlocked || 1, LEVELS.length), level = getLevel(id);
  const title = resumeOnline ? '三选二在线 · '+(onlineSession ? '第 '+state.group+' 组' : '已保存的对局') : saved?.mode === 'endless' ? endlessName(saved)+' · '+fmt(saved.score)+' 分' : '第 '+pad(id)+' 关 · '+escape(level.title);
  const startLabel = resumeOnline ? '继续在线对局' : saved ? '继续游戏' : progress.unlocked > 1 ? '继续闯关' : '开始闯关';
  return `<section class="home"><div class="home-topline"><span class="home-stars" aria-label="已收集 ${totalStars(progress)} 颗星">${star()}${totalStars(progress)}</span><div class="home-top-tools">${devEnabled() ? '<button class="dev-chip" data-action="dev-tools">开发</button>' : ''}<button class="home-settings icon-button" data-action="settings" aria-label="设置">${icon('settings')}</button></div></div><div class="home-intro"><h1 aria-label="三块选两块"><img src="./native/assets/art/logo.png" alt="三块选两块" width="768" height="512" fetchpriority="high"></h1></div>${hero()}<div class="home-progress"><strong>${title}</strong></div><button class="primary home-start" data-action="start">${icon('play')}${startLabel}</button><div class="home-modes"><button class="home-mode-card" data-action="levels">${icon('levels')}<strong>选关</strong></button><button class="home-mode-card endless-card" data-action="endless">${icon('endless')}<strong>无尽挑战</strong></button></div>${!resumeOnline && recovery ? '<button class="online-recovery" data-action="online-resume">在线成绩待确认 · 查看对局 →</button>' : ''}<nav class="home-nav" aria-label="游戏菜单"><button data-action="leaderboard">${icon('trophy')}<span>排行榜</span></button><button data-action="help">${icon('help')}<span>玩法帮助</span></button></nav></section>`;
}
function renderLevels(developer = false) {
  developer = devEnabled();
  const chapters = CHAPTERS.map(chapter => chapter.title);
  return `${header('选关')}<p class="level-progress">已通关 ${Object.keys(progress.records).length} / ${LEVELS.length} · 已收集 ${totalStars(progress)} 颗星</p>${developer ? '<div class="dev-level-banner"><div><strong>开发模式 · 全关可试玩</strong><p>独立试玩，不计入真实进度与纪录</p></div><button data-action="dev-tools">调试工具</button></div>' : ''}${[0,1,2].map(chapter => `<section class="chapter"><h3>${chapters[chapter]}</h3><div class="level-grid">${LEVELS.slice(chapter*10,chapter*10+10).map(level => {
    const id = Number(level.id), unlocked = developer || isLevelUnlocked(progress,id), record = progress.records[id];
    return `<button class="level-button ${!unlocked ? 'locked' : id === progress.unlocked ? 'current' : ''}" data-level="${id}" ${unlocked ? '' : 'disabled'} aria-label="第${id}关 ${escape(level.title)}${!unlocked ? ' 尚未解锁' : developer ? ' 开发试玩' : record ? ' '+record.stars+'星' : ''}"><strong>${pad(id)}</strong>${developer ? '<small>试玩</small>' : record ? stars(record.stars) : !unlocked ? '<svg class="lock-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="2"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg>' : '<small>挑战</small>'}</button>`;
  }).join('')}</div></section>`).join('')}<p class="level-end-note">每次好选择，都会成为下一步的余地。</p>`;
}
function goalLines(config) {
  const goal = config.goal || {};
  return [`清除 ${goal.lines} 条线`, goal.multi ? `完成 ${goal.multi} 次多线消除` : '', goal.cross ? `完成 ${goal.cross} 次交叉消除` : '', goal.stars ? `收集 ${goal.stars} 颗星标` : ''].filter(Boolean);
}
function renderBrief() {
  const config = getLevel(briefLevel);
  return `${header('第 '+pad(briefLevel)+' 关','levels')}<div class="brief-art">${mini(config.candidates[0][0],35)}</div><p class="brief-kicker">${escape(CHAPTERS.find(chapter=>chapter.id === config.chapter)?.title || '初识积木')}</p><h1 class="brief-title">${escape(config.title)}</h1><div class="brief-target"><strong>${goalLines(config)[0]}</strong><p>${goalLines(config).slice(1).map(escape).join('<br>')}${goalLines(config).length > 1 ? '<br>' : ''}最多 ${config.maxGroups} 组积木${config.discardBudget !== undefined ? '<br>舍弃积木不超过 '+config.discardBudget+' 格' : ''}</p></div><p class="brief-note">三块里放下两块，剩下的一块自动丢弃。<br>填满一整行或一整列，就能消除。</p>${briefPractice ? '<p class="dev-note">开发试玩 · 本局不计入成长</p>' : ''}<div class="button-stack bottom-space"><button class="primary" data-action="begin">开始这一关 <span aria-hidden="true">→</span></button><button class="quiet-button" data-action="help">查看玩法</button></div>`;
}
function renderBoard() {
  const cells = Array.from({length:64}, (_, index) => {
    const x = 22+index%8*40, y=22+Math.floor(index/8)*40, filled=state.board[index];
    return `<g data-cell="${index}" data-cell-col="${index%8}" data-cell-row="${Math.floor(index/8)}" data-filled="${filled ? 'true' : 'false'}">${filled ? block(x,y,38,color(filled),'class="board-cell occupied"') : `<rect class="board-cell" x="${x}" y="${y}" width="38" height="38" rx="5" fill="#294c3e" stroke="#17372b" stroke-width=".8"/>`}${state.starBoard?.[index] ? `<path d="m${x+18} ${y+8} 3 6 6 1-5 4 1 7-5-3-6 3 1-7-4-4 6-1Z" fill="#fff"/>` : ''}</g>`;
  }).join('');
  return `<div class="board-shell" data-board><svg id="board" viewBox="0 0 360 360" role="grid" tabindex="0" aria-label="8行8列积木棋盘，拖动下方积木，或先点选积木再点落点"><rect x="1" y="1" width="358" height="358" rx="20" fill="url(#wood-rim)" stroke="#ffefd2" stroke-width="2"/><rect x="6" y="6" width="348" height="348" rx="16" fill="none" stroke="#fff8df" stroke-width="1.5"/><rect x="17" y="17" width="328" height="328" rx="9" fill="#dfcfaa" stroke="#aa916f" stroke-width="2"/>${cells}<rect x="1" y="1" width="358" height="358" rx="20" fill="url(#surface-grain)" pointer-events="none"/><g id="preview-lines" pointer-events="none"></g><g id="board-ghost" class="board-ghost"></g><g id="clear-layer" pointer-events="none"></g></svg><div id="clear-text"></div></div>`;
}
function renderPlaying() {
  const level = state.mode === 'level';
  const config = level ? currentLevel() : null;
  const groupLimit=level ? config.maxGroups+(state.continued ? config.continuationGroups ?? 2 : 0) : null;
  const stats = state.stats;
  const goal = config?.goal || {};
  const extra = [goal.multi ? `多线 ${stats.multiClears}/${goal.multi}` : '', goal.cross ? `交叉 ${stats.crossClears}/${goal.cross}` : '', goal.stars ? `星标 ${stats.stars}/${goal.stars}` : '', config?.discardBudget !== undefined ? `已弃 ${stats.discardedCells}/${config.discardBudget} 格` : ''].filter(Boolean);
  let note = state.variant === 'refill' ? '放一块，原位补一块' : state.placedInGroup === 1 ? '再放 1 块，剩下的自动丢弃' : '放下两块，剩下的自动丢弃';
  if (state.waitingNextGroup) note='已完成本组，联网确认后获取下一组';
  if (state.levelId <= 3 && stats.placements === 0) note = ['','拖动积木，填满一行或一列','每组三块，放完两块后自动舍弃一块','先用小块清线，给大块留出位置'][state.levelId];
  return `${header(devPractice ? '试玩 · 第 '+pad(state.levelId)+' 关' : level ? '第 '+pad(state.levelId)+' 关' : onlineSession ? onlineSession.eligible ? '无尽排位' : '在线试用 · 不入榜' : endlessName(),'home',`<button class="icon-button" data-action="pause" aria-label="暂停">${icon('pause')}</button>`)}<div class="metrics"><div><p class="metric-label">${level ? '清线' : '当前积分'}</p><p class="metric-main">${level ? stats.lines+' <small>/ '+goal.lines+'</small>' : fmt(state.score)}</p>${level ? `<div class="progress-track"><i style="width:${Math.min(100,stats.lines/goal.lines*100)}%"></i></div>` : `<p class="sr-only">${onlineSession ? '服务端校验计分' : '本地最高 '+fmt(localBest())}</p>`}</div><div class="metric-group"><p class="metric-label">${state.variant === 'refill' ? '已放积木' : '当前组数'}</p><p class="metric-main">${state.variant === 'refill' ? state.stats.placements : state.group}${level ? ' <small>/ '+groupLimit+'</small>' : ''}</p>${state.combo > 1 ? '<p class="page-subtitle">连续消除 '+state.combo+' 次</p>' : ''}</div></div>${extra.length ? `<div class="extra-goals">${extra.map(item=>`<span>${item}</span>`).join('')}</div>` : ''}${renderBoard()}<p class="group-note" role="status" aria-live="polite">${onlineSession && onlineBusy ? '正在确认落子…' : note}</p><div class="tray" aria-label="三块候选积木">${state.candidates.map((candidate,slot) => {
    const used = state.used.includes(slot), available = !used && hasPlacement(state,slot), shape = SHAPE_BY_ID[candidate.shapeId];
    return `<button class="candidate ${used ? 'used' : !available ? 'unavailable' : ''} ${selectedSlot === slot ? 'selected' : ''}" style="--piece-cols:${shape.width};--piece-rows:${shape.height}" data-slot="${slot}" data-slot-index="${slot}" data-shape="${escape(candidate.shapeId)}" data-width="${shape.width}" data-height="${shape.height}" data-used="${used}" aria-label="候选${slot+1} ${escape(shape.name)} ${used ? '已放下' : !available ? '当前不可放' : '按住拖动，或点击选中'}" ${used ? 'disabled' : ''}>${mini(candidate)}<span>${used ? '已放下' : !available ? '当前不可放' : selectedSlot === slot ? '点棋盘选择落点' : ''}</span></button>`;
  }).join('')}</div>${onlineError ? `<div class="network-banner" role="status">${escape(onlineError)}<br><button data-action="online-retry">重新连接</button><button data-action="pause">稍后继续</button></div>` : ''}<footer class="play-footer">${level ? `<button data-action="undo" aria-label="撤销上一步，剩余${state.undoRemaining}次" ${state.canUndo && state.undoRemaining > 0 && !isLocked() ? '' : 'disabled'}>${icon('undo')}撤销 · ${state.undoRemaining}</button>` : '<span></span>'}<button data-action="help" aria-label="玩法提示">${icon('help')}提示</button></footer>`;
}
function settingsRows() {
  return `<div class="settings-list">${[['sound','音效'],['music','音乐'],['vibration','振动'],['highContrast','高对比色'],['reducedFlash','消除闪光']].map(([key,label])=> {
    const enabled = key === 'reducedFlash' ? !progress.settings[key] : !!progress.settings[key];
    return `<button class="setting" data-setting="${key}" role="switch" aria-checked="${enabled}" aria-label="${label}"><span>${label}${key === 'reducedFlash' ? '<small>开启时，消除会出现亮光</small>' : ''}</span><span class="setting-value" aria-hidden="true">${enabled ? '开' : '关'}<i class="switch"></i></span></button>`;
  }).join('')}</div>`;
}
function renderPause() {
  return `<section class="pause">${header('暂停','resume')}<h1 class="pause-title">慢慢想，不着急。</h1><p class="pause-copy">${state.mode === 'level' ? '第 '+pad(state.levelId)+' 关' : onlineSession ? '在线对局' : endlessName()} · ${devPractice ? '独立试玩，不计入成长' : '当前棋盘已保存'}${onlineSession ? '<br>保留未确认落子，联网后继续同步' : ''}</p>${settingsRows()}<div class="button-stack"><button class="primary" data-action="resume">继续游戏</button>${state.mode === 'level' ? '<button class="secondary" data-action="retry">重新开始</button>' : '<button class="secondary" data-action="end-run">结束本局</button>'}<button class="secondary" data-action="home">返回首页${devPractice ? '' : ' · 保留本局'}</button>${!onlineSession ? '<button class="quiet-button exit-button" data-action="exit-level">'+(devPractice ? '退出试玩' : state.mode === 'level' ? '退出关卡 · 放弃本局' : '退出练习 · 放弃本局')+'</button>' : ''}${devEnabled() ? '<button class="quiet-button dev-tool-link" data-action="dev-tools">开发调试工具</button>' : ''}</div><div class="fullscreen-wrap"><button data-game-fullscreen>全屏</button></div></section>`;
}
function renderDeveloperTools() {
  if (!devEnabled()) return renderHome();
  const level = state?.mode === 'level', solution = level ? currentLevel().solution || [] : [];
  return `${header('开发试玩', 'dev-back')}<h1 class="page-title">关卡与调试工具</h1><p class="page-subtitle">独立试玩，不改真实进度、纪录或排行榜。</p><section class="dev-status">${level ? `<strong>${devPractice ? '当前试玩' : '当前关卡'} · 第 ${pad(state.levelId)} 关</strong><p>已放 ${state.stats.placements} 块 · 第 ${state.group} 组 · 撤销 ${state.undoRemaining} 次</p>${!devPractice ? '<p>修改参数或棋盘时，将自动转入独立试玩。</p>' : ''}` : '<strong>先选一关，开始独立试玩</strong><p>在线对局与离线无尽的棋盘保持正常规则。</p>'}</section><div class="button-stack dev-actions"><button class="primary" data-action="dev-levels">选择任意关卡</button><button class="secondary" data-action="dev-solution" ${level ? '' : 'disabled'}>查看参考落点</button><button class="secondary" data-action="dev-refill-undo" ${level ? '' : 'disabled'}>补充撤销 · 9 次</button><button class="secondary" data-action="dev-restart" ${level ? '' : 'disabled'}>重置当前试玩</button><button class="secondary" data-action="dev-clear-board" ${level ? '' : 'disabled'}>清空试玩棋盘</button></div>${devShowSolution && level ? `<section class="dev-solution"><h3>从初始棋盘开始的参考解</h3><ol>${solution.map(move => `<li>候选 ${move.slot+1} → 第 ${move.y+1} 行，第 ${move.x+1} 列</li>`).join('')}</ol><p>落点为积木左上角。中途改变布局后，可重置再对照。</p></section>` : ''}<p class="dev-api-note">完整试玩权限已开放。参数与后续扩展可通过 ThreeChooseTwoDev 使用。</p><button class="quiet-button" data-action="dev-back">${developerReturnScreen === 'playing' || developerReturnScreen === 'pause' ? '返回游戏' : '返回'}</button>`;
}
function renderSettings() { return `${header('设置')}<h1 class="pause-title">找到舒服的节奏。</h1><p class="pause-copy">声音与振动分别控制，随时可调整。</p>${settingsRows()}<div class="button-stack"><button class="secondary" data-action="help">玩法与计分</button><button class="primary" data-action="home">返回首页</button></div><div class="fullscreen-wrap"><button data-game-fullscreen>全屏</button></div>`; }
function renderHelp() {
  return `${header('玩法提示','back')}<h1 class="page-title">小积木，大有余地。</h1><div class="help-section"><h3>先放，再舍弃</h3><p>每组有三块。放下一块后，先消除，再放第二块。剩下的一块自动丢弃，三个槽位一直固定。积木不能旋转。</p></div><div class="help-section"><h3>立即补位 · 随放随补</h3><p>放下一块并完成消除后，原槽马上补入一块；另外两块保留。三块都无处可放时结束。两种无尽分别保存本地最高分，立即补位暂不参与在线排位。</p></div><div class="help-section"><h3>填满，就能消除</h3><p>一整行或一整列填满即可消除。行列同时判定，交叉处只清除一次，但一行一列算两条线。消除后积木不下落。</p></div><div class="help-section"><h3>给下一块留出余地</h3><p>弱化的积木标着“当前不可放”。先清线，它也许就有了位置。只要还有一块能放，就可以继续。全部剩余积木都无处可放时失败。</p></div><div class="help-section"><h3>无尽，争取多消</h3><p>只消除才得分：单线基础 100 分，两线同消 300 分。连续两步消除会有连击奖励，最多计五步；跨组保持，未消除的落子会重置。</p></div><div class="help-section"><h3>关卡与全站榜</h3><p>通关获得至少一星，少用组数可获得更多星。关卡可撤销，续局完成只获一星。无尽不支持撤销或续局。全站榜只收录可信平台登录且经服务端校验的单局最高分；离线练习及 H5 匿名试用不入榜。</p></div><button class="primary bottom-space" data-action="back">明白了</button>`;
}
function failureText() { return ({ 'no-placement':'剩下的积木都没有合适的位置了。', 'groups-exhausted':'组数用完了，距离目标还差一点。', 'discard-budget':'舍弃的格数超出了本关预算。' })[state.reason] || '这一局先到这里，下次试试另一种选择。'; }
function resultArt(won = true) {
  return `<div class="result-art" aria-hidden="true"><svg viewBox="0 0 260 227"><ellipse cx="130" cy="202" rx="88" ry="13" fill="#dce2d3" opacity=".65"/>${block(70,116,55,won ? '#57b7a4' : '#b7c5a5')}${block(130,116,55,'#e8be55')}${block(130,56,55,'#eb8968')}<path d="m46 84 4 9 10 2-7 6 1 10-8-5-9 5 2-10-7-6 10-2Z" fill="#e8be55"/><path d="m204 126 3 6 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1Z" fill="#57b7a4"/><path d="m69 36 5-11m121 24 9-7m-160 127-10-2" stroke="#eb8968" stroke-width="3" stroke-linecap="round"/></svg></div>`;
}
function renderResult() {
  if (state.mode !== 'level') return renderEndlessResult();
  const config = currentLevel(), won=state.status === 'won';
  const groupLimit=config.maxGroups+(state.continued ? config.continuationGroups ?? 2 : 0);
  return `<section class="result"><p class="eyebrow">${devPractice ? '开发试玩' : won ? '关卡完成' : '再试一种选择'}</p>${resultArt(won)}<h1>${won ? '好选择，漂亮！' : state.reason === 'no-placement' ? '给下一步，多留一点。' : '还差一点点。'}</h1><p class="result-subtitle">第 ${pad(state.levelId)} 关 · ${escape(config.title)}${won ? state.continued ? '<br>续局完成' : '' : '<br>'+failureText()}</p>${won ? stars(state.stars || 1,true) : ''}<div class="result-statistics"><div><small>使用组数</small><strong>${state.group} / ${groupLimit}</strong></div><div><small>消除线数</small><strong>${state.stats.lines} / ${config.goal.lines}</strong></div></div>${!won && state.reason === 'groups-exhausted' && !state.continued ? '<p class="result-status">'+(devPractice ? '开发试玩可通过调试参数增加组数。' : rewardAvailable() ? '自愿观看激励广告，可保持棋盘增加 2 组。' : '激励广告尚未接入，可免费重开。')+'</p>' : ''}<div class="button-stack">${won && state.levelId < LEVELS.length ? '<button class="primary" data-action="next">下一关 <span aria-hidden="true">→</span></button>' : '<button class="primary" data-action="retry">再玩一次</button>'}${!won && state.canUndo && state.undoRemaining > 0 ? '<button class="secondary" data-action="undo">撤销上一步 · '+state.undoRemaining+'</button>' : won ? '<button class="secondary" data-action="retry">再玩一次</button>' : ''}${!won && state.reason === 'groups-exhausted' && !state.continued && !devPractice && rewardAvailable() ? '<button class="secondary" data-action="continue">看广告 · 增加 2 组</button>' : ''}<button class="quiet-button" data-action="home">返回首页</button></div></section>`;
}
function renderEndlessResult() {
  const settlement = onlineSession?.settlement;
  let status = onlineSession ? onlineBusy ? '成绩校验中…' : pendingAction?.length || pendingFinish ? '等待联网确认 · 当前成绩尚未结算' : settlement?.status === 'verified' ? `成绩已校验 · ${settlement.rank ? '全站第 '+settlement.rank+' 名' : '暂无名次'}` : settlement?.status === 'pending-review' ? '成绩待复核，暂未计入公开榜。' : settlement?.reason || onlineSession.rankingReason || '匿名在线试用 · 成绩不参与全站排名' : endlessName()+' · 本地纪录，不参与全站排名';
  if (onlineError) status = onlineError;
  const best = onlineSession ? settlement?.isPersonalBest : recordedResult?.isPersonalBest;
  return `<section class="result endless"><p class="eyebrow">${onlineSession ? '无尽挑战结束' : endlessName()+' · 挑战结束'}</p><p class="result-score">${fmt(state.score)}</p><h1>${best ? '你的新纪录！' : '每一步，都算数。'}</h1>${resultArt()}<div class="result-statistics"><div><small>总清线数</small><strong>${state.stats.lines}</strong></div><div><small>最高单步消线</small><strong>${state.stats.maxLines}</strong></div><div><small>最大连续消除</small><strong>${state.stats.maxCombo}</strong></div><div><small>${state.variant === 'refill' ? '已放积木' : '已完成组数'}</small><strong>${state.variant === 'refill' ? state.stats.placements : state.completedGroups}</strong></div></div><p class="result-status ${onlineError ? 'error' : ''}" role="status">${escape(status)}</p>${onlineError ? '<button class="quiet-button" data-action="online-retry">重新连接并校验</button>' : ''}<div class="button-stack"><button class="primary" data-action="again" ${onlineSession && (onlineBusy || pendingAction?.length || pendingFinish) ? 'disabled' : ''}>${onlineSession && (onlineBusy || pendingAction?.length || pendingFinish) ? '等待成绩确认…' : '再来一局'}</button>${state.variant === 'refill' ? '<button class="secondary" data-action="endless">切换玩法</button>' : '<button class="secondary" data-action="leaderboard">查看排行榜</button>'}<button class="quiet-button" data-action="share">分享成绩</button><button class="quiet-button" data-action="home">返回首页</button></div></section>`;
}
function renderEndless() {
  const hasSavedOnline = !!storage.getItem('three-choose-two-online-v1')?.match(/"id"/);
  return `${header('无尽挑战')}<section class="mode-card classic-mode"><h1>三选二</h1><p>放下两块，舍弃一块</p><div class="mode-illustration" aria-hidden="true">${mini({shapeId:'l3-nw',color:1})}${mini({shapeId:'square2',color:2})}<span class="discard-example">${mini({shapeId:'v2',color:3})}</span></div><span class="mode-best">本地最高 ${fmt(progress.practiceBest)}</span><button class="primary" data-action="practice">${icon('play')}开始练习</button><button class="mode-online" data-action="online-start" ${onlineBusy ? 'disabled' : ''}>${onlineBusy ? '正在连接…' : hasSavedOnline ? '恢复在线对局' : '在线挑战'}<span aria-hidden="true"> ›</span></button>${onlineError ? '<p class="mode-error" role="status">'+escape(onlineError)+'</p>' : ''}</section><section class="mode-card refill-mode"><h2>立即补位</h2><p>放一块，补一块</p><div class="mode-illustration" aria-hidden="true">${mini({shapeId:'l3-nw',color:1})}${icon('refill')}${mini({shapeId:'square2',color:3})}</div><span class="mode-best">本地最高 ${fmt(progress.refillBest)}</span><button class="primary" data-action="refill">${icon('play')}开始挑战</button></section><p class="mode-footnote">两种玩法分别记录本地最高分</p>`;
}
function renderLeaderboard() {
  const stateMarkup = rankingBusy ? '<h3>正在连接排行榜…</h3><p>只显示经校验的真实玩家成绩。</p>' : rankingError ? '<h3>排行榜暂时没连上</h3><p>'+escape(rankingError)+'</p><button class="primary" data-action="board-retry">重试连接</button>' : '<h3>第一份好成绩，等你留下。</h3><p>当前规则还没有已校验的上榜成绩。完成一局在线排位后上榜。</p><button class="primary" data-action="endless">开始无尽挑战</button>';
  const entries = ranking?.top || [];
  const renderRow = entry => `<div class="ranking-row"><span class="rank">${entry.rank}</span><span class="avatar" aria-hidden="true">${escape((entry.name || '玩家').slice(0,1))}</span><span class="ranking-player">${escape(entry.name || '玩家')}<small>${escape(({wechat:'微信',bilibili:'B站',h5:'H5'})[entry.platform] || entry.platform)}</small></span><strong class="ranking-score">${fmt(entry.score)}</strong></div>`;
  return `${header('全站排行榜')}<h1 class="page-title">好选择，值得记住。</h1><p class="page-subtitle">每人保留经校验的最高单局 · 同分并列</p><div class="ranking-meta"><span>规则 v1 · 真实成绩</span><span>${ranking?.updatedAt ? '更新 '+new Date(ranking.updatedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}) : ''}</span></div>${!entries.length ? `<div class="board-status">${icon('trophy').replace('<svg','<svg class="status-icon"')}${stateMarkup}</div>` : `<div class="ranking-list">${entries.map(renderRow).join('')}</div>`}${ranking?.me ? '<div class="personal-rank">我的名次 <strong>'+ranking.me.rank+'</strong> · 最高 '+fmt(ranking.me.score)+' 分</div>'+(ranking.around?.length ? '<h3 class="page-subtitle">我附近的玩家</h3><div class="ranking-list">'+ranking.around.map(renderRow).join('')+'</div>' : '') : !rankingBusy && !rankingError ? '<p class="personal-rank">'+escape(ranking?.reason || '完成一局经校验的在线挑战后上榜。H5 匿名试用不参与排名。')+'</p>' : ''}<button class="quiet-button bottom-space" data-action="home">返回首页</button>`;
}

function isLocked() { return Date.now() < inputLockedUntil || !!state?.waitingNextGroup || !!pendingFinish; }
function cancelDrag() {
  if (drag) {
    try { drag.node.releasePointerCapture(drag.pointerId); } catch { /* Capture may already be gone. */ }
    drag.node.classList.remove('dragging');
  }
  drag = null;
  document.querySelector('#board-ghost')?.replaceChildren();
  document.querySelector('#preview-lines')?.replaceChildren();
}
function dragPosition(event) {
  const rect = document.querySelector('#board').getBoundingClientRect();
  const pitch = rect.width*40/360, inset=rect.width*20/360;
  const shape = SHAPE_BY_ID[state.candidates[drag.slot].shapeId];
  const left = event.clientX-shape.width*pitch/2;
  const top = event.pointerType === 'touch' ? event.clientY-shape.height*pitch-46 : event.clientY-shape.height*pitch/2;
  return { x:Math.round((left-rect.left-inset)/pitch), y:Math.round((top-rect.top-inset)/pitch) };
}
function drawPreview(slot, x, y) {
  const preview = previewPlacement(state, slot, x, y);
  const shape = SHAPE_BY_ID[state.candidates[slot].shapeId];
  const ghost = document.querySelector('#board-ghost'), lines=document.querySelector('#preview-lines');
  if (!ghost || !lines) return preview;
  ghost.innerHTML = shape.cells.map(([dx,dy])=>`<rect x="${22+(x+dx)*40}" y="${22+(y+dy)*40}" width="36" height="36" rx="5" fill="${preview.valid ? color(state.candidates[slot].color) : '#bd5d50'}" fill-opacity="${preview.valid ? '.7' : '.28'}" stroke="${preview.valid ? '#183c34' : '#bd5d50'}" stroke-width="${preview.valid ? '1.7' : '2.2'}" ${preview.valid ? '' : 'stroke-dasharray="5 3"'}/>`).join('');
  if (!preview.valid) ghost.innerHTML += `<path d="M${30+x*40} ${30+y*40}l16 16m0-16-16 16" stroke="#a24d43" stroke-width="3" stroke-linecap="round"/>`;
  lines.innerHTML = preview.rows.map(row=>`<rect x="20" y="${20+row*40}" width="320" height="40" rx="6" fill="#e8be55" fill-opacity=".27" stroke="#b99b45" stroke-width="1.4"/>`).join('')+preview.cols.map(col=>`<rect x="${20+col*40}" y="20" width="40" height="320" rx="6" fill="#e8be55" fill-opacity=".27" stroke="#b99b45" stroke-width="1.4"/>`).join('');
  return preview;
}
app.addEventListener('pointerdown', event => {
  if (screen !== 'playing' || isLocked() || state.status !== 'playing') return;
  const node = event.target.closest('[data-slot]');
  if (!node || node.disabled || drag || !event.isPrimary || event.button > 0) return;
  event.preventDefault(); audio.unlock();
  const slot=Number(node.dataset.slot);
  if (state.used.includes(slot)) return;
  selectedSlot = slot;
  drag = { pointerId:event.pointerId, slot, node, startX:event.clientX, startY:event.clientY, moved:false, x:null, y:null };
  node.classList.add('dragging');
  try { node.setPointerCapture(event.pointerId); } catch { /* Window listeners retain the gesture. */ }
});
window.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.pointerId || screen !== 'playing') return;
  event.preventDefault();
  drag.moved ||= Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY) > 6;
  const {x,y}=dragPosition(event); drag.x=x;drag.y=y;
  drawPreview(drag.slot,x,y);
}, { passive:false });
window.addEventListener('pointerup', event => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const gesture = drag;
  const {x,y}=dragPosition(event);
  cancelDrag();
  if (!gesture.moved) { render(); return; }
  selectedSlot = null;
  doPlace(gesture.slot,x,y);
});
window.addEventListener('pointercancel', event => { if (drag?.pointerId === event.pointerId) { cancelDrag(); selectedSlot = null; if (screen === 'playing') render(); } });
function handleMenu(event) {
  const target=event.target.closest('button');
  if (target?.disabled) return;
  const setting = event.target.closest('[data-setting]');
  if (setting) {
    const key=setting.dataset.setting;
    progress.settings[key]=!progress.settings[key];
    persist(); audio.unlock(); audio.play('tap'); render(); return;
  }
  const levelNode=event.target.closest('[data-level]');
  if (levelNode && !levelNode.disabled) {
    const id=Number(levelNode.dataset.level);
    if (!devEnabled() && !isLevelUnlocked(progress,id)) return;
    persist();briefPractice=devEnabled();briefLevel=id;show('brief');return;
  }
  const action=event.target.closest('[data-action]')?.dataset.action;
  if (action) { audio.unlock(); void dispatch(action); return; }
  if (screen === 'playing' && selectedSlot !== null && !isLocked() && event.target.closest('#board')) {
    const rect=document.querySelector('#board').getBoundingClientRect(), pitch=rect.width*40/360, inset=rect.width*20/360;
    const x=Math.floor((event.clientX-rect.left-inset)/pitch),y=Math.floor((event.clientY-rect.top-inset)/pitch);
    const slot=selectedSlot;selectedSlot=null;doPlace(slot,x,y);
  }
}
// Dispatch touch menus directly on release. Pointer dragging can suppress the
// browser's synthetic click; deduplication also prevents a second activation.
app.addEventListener('pointerup',event=>{
  if (event.pointerType !== 'touch' || drag) return;
  const node=event.target.closest('[data-action],[data-setting],[data-level]');
  if (node?.disabled) return;
  if (!node && !(screen === 'playing' && selectedSlot !== null && event.target.closest('#board'))) {lastTouchMenu=null;return;}
  event.preventDefault();
  lastTouchMenu={time:Date.now()};
  handleMenu(event);
});
app.addEventListener('click',event=>{
  if (lastTouchMenu && Date.now()-lastTouchMenu.time < 700 && (event.pointerType === 'touch' || event.sourceCapabilities?.firesTouchEvents)) {
    event.preventDefault();event.stopPropagation();return;
  }
  handleMenu(event);
});
function flash(before) {
  const event=state.lastEvent;
  if (!event || screen !== 'playing') return;
  const layer=document.querySelector('#clear-layer');
  if (event.clearedCells?.length && layer) {
    layer.innerHTML=progress.settings.reducedFlash ? '' : event.clearedCells.map(index=>block(22+index%8*40,22+Math.floor(index/8)*40,36,color(before.board[index] || before.candidates[event.slot]?.color),'class="clear-cell"')).join('');
    const text=document.querySelector('#clear-text');
    text.className='clear-text';text.textContent=event.lines > 1 ? event.rows.length && event.cols.length ? '交叉消除！ +'+event.scoreDelta : event.lines+' 线同消！ +'+event.scoreDelta : '+'+event.scoreDelta;
  }
  if (event.discarded) {
    const node=document.querySelector(`[data-slot="${event.discarded.slot}"]`);
    if (node) { node.innerHTML=mini(event.discarded)+'<span>自动舍弃</span>';node.classList.add('discarding'); }
  }
}
function doPlace(slot,x,y) {
  if (screen !== 'playing' || isLocked() || !state || state.status !== 'playing') return;
  const preview=previewPlacement(state,slot,x,y);
  if (!preview.valid) { audio.play('invalid');audio.vibrate('invalid');toast('这里放不下，换个位置试试。');render();return; }
  const before=state;
  inputLockedUntil=Date.now()+270;
  if (onlineSession) {
    const queued=pendingAction || [];
    queued.push({ seq:onlineSession.seq+queued.length+1,group:state.group,slot,x,y });
    pendingAction=queued;
    state=optimisticPlace(state,slot,x,y);
    saveOnline();
    void flushOnline();
  } else { state=place(state,slot,x,y);persist(); }
  audio.play(state.lastEvent?.lines ? 'clear' : 'place',state.lastEvent?.lines);audio.vibrate(state.lastEvent?.lines ? 'clear' : 'place');
  render();flash(before);
  clearTimeout(animationTimer);
  const placedState=state, epoch=gameEpoch;
  animationTimer=setTimeout(()=>{
    if (state !== placedState || gameEpoch !== epoch) return;
    inputLockedUntil=0;
    if (state.status !== 'playing' && !onlineSession) finishLocal();
    else if (state.status !== 'playing' && onlineSession && screen === 'playing') show('result');
    else if (screen === 'playing') render();
  },280);
}
function optimisticPlace(previous,slot,x,y) {
  return placeIssuedGroup(previous,slot,x,y);
}
async function flushOnline() {
  if (onlineBusy || !onlineSession) return;
  const activeSessionId=onlineSession.id;
  onlineBusy=true;onlineError='';
  try {
    while (pendingAction?.length) {
      const action=pendingAction[0];
      const response=await online.place({ ...onlineSession,seq:action.seq-1,state:{group:action.group} },action.slot,action.x,action.y);
      if (onlineSession?.id !== activeSessionId) return;
      onlineSession=response;pendingAction.shift();
      if (!pendingAction.length) { pendingAction=null;state=response.state; }
      saveOnline();
    }
    if (pendingFinish || onlineSession.status === 'finished' || state.status !== 'playing') {
      if (onlineSession.status !== 'finished') {
        const response=await online.finish(onlineSession);
        if (onlineSession?.id !== activeSessionId) return;
        onlineSession=response;
      }
      state=onlineSession.state;pendingFinish=false;saveOnline();
      if (screen === 'playing' || screen === 'result') show('result');
    }
  } catch (error) {
    if (onlineSession?.id !== activeSessionId) return;
    onlineError=error.message || '网络暂时不可用。请重新连接。';
    if (['ILLEGAL_ACTION','SEQUENCE_CONFLICT','ACTION_CONFLICT','GROUP_CONFLICT'].includes(error.code)) {
      try {
        const response=await online.restore(activeSessionId);
        if (onlineSession?.id !== activeSessionId) return;
        onlineSession=response;pendingAction=null;state=onlineSession.state;saveOnline();onlineError='局面已从服务端恢复，请继续。';
      } catch { /* Keep the ordered pending action for retry. */ }
    }
  } finally {
    onlineBusy=false;
    if (screen === 'playing' || screen === 'result') render();
  }
}
function finishLocal() {
  if (!state || state.status === 'playing') return;
  if (!devPractice) {
    if (state.mode === 'level' && state.status === 'won') progress=recordLevelResult(progress,state);
    else if (state.mode === 'endless') {
      const isPersonalBest=state.score > localBest();
      progress=recordEndlessResult(progress,state);
      recordedResult={ isPersonalBest };
    }
    progress=state.mode === 'level' && state.status === 'lost' ? saveCurrentGame(progress,state) : { ...progress,currentGame:null };
    saveProgress(storage,progress);
  }
  audio.play(state.status === 'won' ? 'win' : 'tap');
  if (screen === 'playing' || screen === 'pause') show('result');
}
function beginLevel(id) {
  if (onlineSession) saveOnline();
  clearTimeout(animationTimer);
  gameEpoch++;
  onlineSession=null;pendingAction=null;pendingFinish=false;onlineError='';
  state=createLevel(id);selectedSlot=null;recordedResult=null;inputLockedUntil=0;
  persist();show('playing');
}
function beginPractice(variant = 'classic') {
  persist();clearTimeout(animationTimer);
  gameEpoch++;
  onlineSession=null;pendingAction=null;pendingFinish=false;onlineError='';devPractice=false;
  state=createEndless(crypto.getRandomValues(new Uint32Array(1))[0],{ranked:false,variant});
  selectedSlot=null;recordedResult=null;inputLockedUntil=0;persist();show('playing');
}
async function beginOnline() {
  if (onlineBusy) return;
  persist();clearTimeout(animationTimer);
  const epoch=++gameEpoch;
  onlineBusy=true;onlineError='';render();
  try {
    let saved;
    try { saved=JSON.parse(storage.getItem('three-choose-two-online-v1') || 'null'); } catch { /* Invalid recovery is ignored. */ }
    const response=saved?.id ? await online.restore(saved.id) : await online.create();
    if (gameEpoch !== epoch || screen !== 'endless' && screen !== 'result') return;
    onlineSession=response;
    state=onlineSession.state;devPractice=false;pendingFinish=!!saved?.finish;pendingAction=null;
    if (saved?.id === onlineSession.id && onlineSession.status !== 'finished' && Array.isArray(saved.pending)) {
      const remaining=saved.pending.filter(action=>action.seq > onlineSession.seq);
      for (const action of remaining) {
        if (action.seq !== onlineSession.seq+(pendingAction?.length || 0)+1 || !previewPlacement(state,action.slot,action.x,action.y).valid || action.group !== state.group) break;
        pendingAction ||= [];pendingAction.push(action);state=optimisticPlace(state,action.slot,action.x,action.y);
      }
    }
    saveOnline();selectedSlot=null;inputLockedUntil=0;
    show(onlineSession.status === 'finished' || pendingFinish ? 'result' : 'playing');
  } catch(error) { if (gameEpoch === epoch)onlineError=error.message || '在线服务暂不可用，离线练习可以继续。'; }
  finally { onlineBusy=false;render();if(gameEpoch === epoch && (pendingAction?.length || pendingFinish))void flushOnline(); }
}
async function openLeaderboard() {
  rankingBusy=true;rankingError='';show('leaderboard');
  try { ranking=await online.board(); } catch(error) { ranking=null;rankingError=error.message || '服务尚未连接，请稍后重试。'; }
  finally { rankingBusy=false;if(screen === 'leaderboard')render(); }
}
function rewardAvailable() { return typeof globalThis.__THREE_CHOOSE_TWO_HOST__?.rewardedAd === 'function'; }
async function rewardContinue() {
  if (devPractice || !rewardAvailable() || isLocked()) return;
  const original=state;
  inputLockedUntil=Infinity;
  try {
    const receipt=await globalThis.__THREE_CHOOSE_TWO_HOST__.rewardedAd({ gameId:'three-choose-two',levelId:state.levelId,placement:'level-continue' });
    if (state !== original || !receipt?.rewarded || !receipt?.rewardId) { toast('广告未完成，本局未消耗续局次数。');return; }
    if (!devPractice) storage.setItem('three-choose-two-pending-reward-v1',JSON.stringify({state:original,rewardId:receipt.rewardId}));
    state=continueLevel(state,receipt.rewardId);persist();
    if (!devPractice) storage.setItem('three-choose-two-pending-reward-v1','null');
    show('playing');
  } catch { toast('广告暂不可用，可以免费重开。'); }
  finally { inputLockedUntil=0;render(); }
}
async function shareScore() {
  const url=new URL(location.href);url.search='';url.hash='';
  const rank=onlineSession?.settlement?.status === 'verified' ? onlineSession.settlement.rank : null;
  const text=`三块选两块：${onlineSession?.settlement?.status === 'verified' ? '在线挑战' : endlessName()} ${fmt(state.score)} 分，最高一次消除 ${state.stats.maxLines} 条线${rank ? '，全站第 '+rank+' 名' : ''}。${state.variant === 'refill' ? '放一块，补一块，给下一步留出空间。' : '这三块，你舍哪一块？'}`;
  try { if(navigator.share) await navigator.share({title:'三块选两块',text,url:url.href});else {await navigator.clipboard.writeText(text+' '+url.href);toast('成绩与游戏链接已复制。');} }
  catch(error) { if(error.name !== 'AbortError') toast('无法直接分享，可复制地址栏中的游戏链接。'); }
}
async function dispatch(action) {
  if (action.startsWith('dev-')) {
    if (!devEnabled() || !developer) return;
    try {
      switch (action) {
        case 'dev-tools': persist();if(screen !== 'dev-tools')developerReturnScreen=screen;devShowSolution=false;show('dev-tools');break;
        case 'dev-back': show(developerReturnScreen);break;
        case 'dev-levels': persist();show('levels');break;
        case 'dev-solution': devShowSolution=true;show('dev-tools');break;
        case 'dev-refill-undo': developer.refillUndo();toast('试玩撤销已补充到 9 次。');break;
        case 'dev-restart': developer.restart();break;
        case 'dev-clear-board': developer.clearBoard();toast('试玩棋盘已清空。');break;
      }
    } catch (error) { toast(error.message); }
    return;
  }
  switch(action) {
    case 'start': {
      if (canResumeOnline()) {
        if (onlineSession) { devPractice=false;briefPractice=false;selectedSlot=null;inputLockedUntil=0;show('playing');if(pendingAction?.length)void flushOnline(); }
        else { show('endless');await beginOnline(); }
        break;
      }
      const saved=playableResume();gameEpoch++;clearTimeout(animationTimer);devPractice=false;briefPractice=false;onlineSession=null;pendingAction=null;pendingFinish=false;onlineError='';selectedSlot=null;inputLockedUntil=0;
      if (saved) { state=saved;show(saved.status === 'playing' ? 'playing' : 'result'); }
      else { state=null;briefLevel=Math.min(progress.unlocked || 1,LEVELS.length);show('brief'); }
      break;
    }
    case 'begin':
      if(briefPractice && devEnabled())startTrial(briefLevel);
      else if(isLevelUnlocked(progress,briefLevel)) {devPractice=false;beginLevel(briefLevel);}
      break;
    case 'levels': show('levels');break;
    case 'settings': persist();show('settings');break;
    case 'home': if(screen === 'endless' && onlineBusy)gameEpoch++;persist();if(onlineSession)saveOnline();show('home');break;
    case 'exit-level': exitLocalGame();break;
    case 'online-resume': if(onlineSession) {show(pendingFinish || state.status !== 'playing' ? 'result' : 'playing');void flushOnline();}else {show('endless');await beginOnline();}break;
    case 'pause': case 'leave-game': if(state) {persist();show('pause');}break;
    case 'resume': if(state)show(state.status === 'playing' ? 'playing' : 'result');break;
    case 'help': persist();show('help');break;
    case 'back': show(previousScreen === 'help' ? 'home' : previousScreen);break;
    case 'retry': if (state.mode === 'level')beginLevel(state.levelId);else beginPractice(state.variant);break;
    case 'undo': if(!isLocked() && state.mode === 'level') {
      const next=undo(state);if(next !== state) {state=next;audio.play('undo');persist();show('playing');}
    }break;
    case 'next': if(state.status === 'won' && state.levelId < LEVELS.length) {
      briefPractice=devPractice;briefLevel=state.levelId+1;show('brief');
    }break;
    case 'endless': onlineError='';show('endless');break;
    case 'practice': beginPractice();break;
    case 'refill': beginPractice('refill');break;
    case 'online-start': await beginOnline();break;
    case 'online-retry':
      if (onlineSession) {await flushOnline();if(screen === 'playing' || screen === 'result')render();}
      else await beginOnline();break;
    case 'end-run': case 'end':
      if(onlineSession) {pendingFinish=true;saveOnline();show('result');await flushOnline();}
      else {state=finishEndless(state);finishLocal();if(screen !== 'result')show('result');}break;
    case 'continue': await rewardContinue();break;
    case 'again': if(onlineSession) {onlineSession=null;saveOnline();await beginOnline();}else beginPractice(state.variant);break;
    case 'leaderboard': case 'board-retry': persist();await openLeaderboard();break;
    case 'share': await shareScore();break;
  }
}
window.addEventListener('blur',()=>{cancelDrag();selectedSlot=null;if(screen === 'playing'){persist();show('pause');}audio.stop();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelDrag();selectedSlot=null;if(screen === 'playing'){persist();show('pause');}audio.stop();}});
window.addEventListener('pagehide',()=>{cancelDrag();persist();audio.stop();});
window.addEventListener('resize',()=>{cancelDrag();});
window.getThreeChooseTwoSnapshot=()=>state ? structuredClone({state,screen,devPractice,online:onlineSession ? {id:onlineSession.id,seq:onlineSession.seq,status:onlineSession.status,eligible:onlineSession.eligible} : null}) : {state:null,screen,devPractice};
const developer = devEnabled() ? createDeveloperAPI({
  isEnabled: devEnabled, getSnapshot: window.getThreeChooseTwoSnapshot, getState: () => state,
  isolate: isolateTrial, beginLevel: startTrial, restart: () => beginLevel(state.levelId),
  update: next => { clearTimeout(animationTimer);cancelDrag();state=next;selectedSlot=null;inputLockedUntil=0;show(screen === 'dev-tools' ? 'dev-tools' : state.status === 'playing' ? 'playing' : 'result'); },
  openLevels: () => {persist();show('levels');},
  openSolution: () => {persist();if(screen !== 'dev-tools')developerReturnScreen=screen;devShowSolution=true;show('dev-tools');},
  registerActions: actions => globalThis.SmallGamesDev.registerActions(actions),
}) : null;
if (developer) {
  window.ThreeChooseTwoDev = developer;
  globalThis.SmallGamesDev.registerActions([{ id:'three-choose-two-tools',label:'关卡与开发调试工具',run:()=>dispatch('dev-tools') }]);
  globalThis.SmallGamesDev.registerSnapshot(()=>({screen,level:state?.levelId,group:state?.group,score:state?.score,placements:state?.stats?.placements,practice:devPractice,permissions:Object.keys(developer.permissions)}));
}
// Confirmed rewards survive a process restart between receipt and state write.
try {
  const pending=JSON.parse(storage.getItem('three-choose-two-pending-reward-v1') || 'null');
  if (pending?.state && typeof pending.rewardId === 'string') {
    const alreadyApplied=progress.currentGame?.continueRewardId === pending.rewardId;
    if (!alreadyApplied) {
      const continued=continueLevel(pending.state,pending.rewardId);
      if (continued !== pending.state) {
        const candidateProgress=saveCurrentGame(progress,continued);
        if (resumeState(candidateProgress)) {progress=candidateProgress;saveProgress(storage,progress);}
      }
    }
    storage.setItem('three-choose-two-pending-reward-v1','null');
  }
} catch { /* A malformed receipt cannot block offline play. */ }
show('home');
