import { levels } from './levels.js';
import { initialState, legalTargets, step } from './engine.js';
import { relayLevelIds, relayTargets, movedOfficer, lastOfficer } from './relay.js';
import { quickTrials, quickOutcome } from './quick-trials.js';
import { createRenderer } from './competition-renderer.js';

const KEY = 'cops-robbers-v3';
const copy = value => JSON.parse(JSON.stringify(value));
const modes = { standard: { label: '标准巡逻', list: levels, records: 'completed' }, relay: { label: '接力巡逻', list: levels.filter(item => relayLevelIds.includes(item.id)), records: 'relayCompleted' }, quick: { label: '快速练习', list: quickTrials, records: 'quickCompleted' } };
const inside = (p, hit) => p.x >= hit.x && p.y >= hit.y && p.x <= hit.x + hit.w && p.y <= hit.y + hit.h;

/** Full local Canvas campaign. sdk is the normalized host port, never a WebView. */
export function startNativeCopsGame(sdk, config = {}, startNativeCompetition) {
  for (const name of ['createCanvas', 'getSystemInfoSync', 'onTouchStart', 'offTouchStart', 'onTouchEnd', 'offTouchEnd', 'onTouchCancel', 'offTouchCancel', 'onHide', 'offHide', 'onShow', 'offShow']) {
    if (typeof sdk?.[name] !== 'function') throw new Error(`围捕小队宿主缺少 ${name}`);
  }
  const canvas = sdk.createCanvas(), ctx = canvas.getContext('2d');
  let child;
  let save = {}, storageOK = true;
  try { const raw = sdk.getStorageSync(KEY); save = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {}; } catch { storageOK = false; }
  if (!save || typeof save !== 'object' || Array.isArray(save)) save = {};
  for (const value of Object.values(modes)) {
    const records = save[value.records];
    save[value.records] = Object.fromEntries(value.list.filter(level => Number.isInteger(records?.[level.id]?.turns) && records[level.id].turns > 0 && records[level.id].turns < 100000 && [1, 2, 3].includes(records[level.id].stars)).map(level => [level.id, records[level.id]]));
  }
  save.settings = save.settings && typeof save.settings === 'object' ? save.settings : {};
  save.patrols = save.patrols && typeof save.patrols === 'object' ? save.patrols : {};
  if (save.current && !save.patrols[`${save.current.mode || 'challenge'}:${save.current.rule || 'standard'}`]) save.patrols[`${save.current.mode || 'challenge'}:${save.current.rule || 'standard'}`] = save.current;
  let mode = 'standard', level = levels[0], board = initialState(level), history = [], selected = 0;
  let active = false;
  let page = 'home', helpReturn = 'home', pageIndex = 0, hits = [], note = '', pressed = null, stopped = false;
  let width = 390, height = 844, top = 20, bottom = 20, lastTap = 0;
  const channel = sdk.channelEntry; let channelMessage = '';
  const runChannel = action => { if (action.available === false) { channelMessage = '宿主暂不支持此入口'; draw(); return; } channelMessage = ''; Promise.resolve().then(() => action.run()).catch(error => { channelMessage = error.message; }).finally(draw); };
  const subscriptions = [];
  const subscribe = (on, off, fn) => { if (typeof sdk[on] === 'function' && typeof sdk[off] === 'function') { sdk[on](fn); subscriptions.push(() => sdk[off](fn)); } };
  const key = () => `${mode === 'quick' ? 'quick' : 'challenge'}:${mode === 'relay' ? 'relay' : 'standard'}`;
  const records = () => save[modes[mode].records];
  const list = () => modes[mode].list;
  const unlocked = index => index === 0 || Boolean(records()[list()[index - 1]?.id]);
  const valid = (state, map) => state && Array.isArray(state.cops) && state.cops.length === map.cops.length && new Set(state.cops).size === state.cops.length && state.cops.every(n => Number.isInteger(n) && n >= 0 && n < map.nodes.length) && Array.isArray(state.robbers) && state.robbers.length === map.robbers.length && state.robbers.every(n => Number.isInteger(n) && n >= -2 && n < map.nodes.length && !state.cops.includes(n)) && Number.isInteger(state.turn) && state.turn >= 0 && state.turn < 100000;
  const outcome = () => mode === 'quick' ? quickOutcome(level, board) : board.robbers.includes(-2) ? 'lost' : board.robbers.every(n => n === -1) ? 'won' : board.turn >= 200 ? 'lost' : 'planning';
  const persist = () => {
    const current = { mode: mode === 'quick' ? 'quick' : 'challenge', rule: mode === 'relay' ? 'relay' : 'standard', levelId: level.id, state: copy(board), history: copy(history.slice(-100)) };
    save.version = 3; if (active) { save.current = current; save.patrols[key()] = current; }
    try { sdk.setStorageSync(KEY, JSON.stringify(save)); storageOK = true; } catch { storageOK = false; }
  };
  const snapshot = () => {
    const current = save.patrols[key()];
    const map = list().find(item => item.id === current?.levelId);
    return map && unlocked(list().indexOf(map)) && valid(current.state, map) && current.state.robbers.some(n => n >= 0) && !current.state.robbers.includes(-2) && current.state.turn < (map.turnLimit || 200) ? current : null;
  };
  const load = (id, resume = null) => {
    level = list().find(item => item.id === id) || list()[0];
    board = resume && valid(resume.state, level) ? copy(resume.state) : initialState(level);
    history = resume && Array.isArray(resume.history) ? resume.history.filter(state => valid(state, level)).slice(-100).map(copy) : [];
    if (mode === 'relay') board.relayLast = lastOfficer(board, history);
    active = true; selected = 0; page = 'play'; note = ''; pressed = null; persist(); draw();
  };
  const feedback = () => { if (save.settings.nativeHaptics !== false) { try { sdk.vibrateShort?.({ type: 'light' }); } catch { /* optional feedback */ } } };
  const move = target => {
    if (page !== 'play' || outcome() !== 'planning') return;
    const targets = mode === 'relay' ? relayTargets(level, board, selected, board.relayLast ?? -1) : legalTargets(level, board, selected);
    if (!targets.includes(target)) { note = mode === 'relay' ? '接力要换人，只能点相邻路口' : '只能点相邻的空路口'; draw(); return; }
    const plan = [...board.cops]; plan[selected] = target;
    const before = copy(board), actor = movedOfficer(board, plan);
    board = step(level, board, plan).state;
    if (mode === 'relay') board.relayLast = actor < 0 ? before.relayLast ?? -1 : actor;
    history.push(before); history = history.slice(-100); note = ''; feedback();
    if (outcome() === 'won') {
      const stars = board.turn <= level.par ? 3 : board.turn <= level.par + 3 ? 2 : 1;
      if (!records()[level.id] || board.turn < records()[level.id].turns) records()[level.id] = { turns: board.turn, stars };
    }
    if (outcome() !== 'planning') page = 'result';
    persist(); draw();
  };
  function resize() {
    pressed = null;
    const info = sdk.getSystemInfoSync(), ratio = Math.max(1, Math.min(3, info.pixelRatio || 1));
    width = info.windowWidth || info.screenWidth || 390; height = info.windowHeight || info.screenHeight || 844;
    top = Math.max(12, info.safeArea?.top || 0);
    try { const capsule = sdk.getMenuButtonBoundingClientRect?.(); if (capsule?.bottom) top = Math.max(top, capsule.bottom + 8); } catch { /* optional capsule */ }
    bottom = Math.max(12, height - (info.safeArea?.bottom || height));
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); draw();
  }
  function draw() {
    if (stopped) return;
    hits = []; ctx.fillStyle = '#f5f0e5'; ctx.fillRect(0, 0, width, height); ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    const text = (label, x, y, size = 16, color = '#263e43') => { ctx.fillStyle = color; ctx.font = `${size}px sans-serif`; ctx.fillText(label, x, y); };
    const button = (label, y, action, enabled = true, x = 24, w = width - 48) => {
      ctx.fillStyle = enabled ? '#1258c2' : '#aab8b2'; ctx.fillRect(x, y, w, 46); text(label, x + w / 2, y + 23, 16, '#fff');
      if (enabled) hits.push({ id: label, x, y, w, h: 46, action });
    };
    const title = label => text(label, width / 2, top + 28, 24);
    if (page === 'home') {
      title('围捕小队'); text(modes[mode].label, width / 2, top + 70);
      const base = top + 100, resume = snapshot();
      button(resume ? '继续巡逻' : '开始巡逻', base, () => { const current = snapshot(); const next = list().find((_, i) => unlocked(i) && !records()[list()[i].id]) || list()[0]; load(current?.levelId || next.id, current); });
      button('选择关卡', base + 58, () => { page = 'levels'; pageIndex = 0; });
      button('切换：标准 / 接力 / 快练', base + 116, () => { active = false; mode = ['standard', 'relay', 'quick'][(['standard', 'relay', 'quick'].indexOf(mode) + 1) % 3]; });
      button('学习 / 帮助 / 设置', base + 174, () => { helpReturn = 'home'; page = 'help'; });
      const competitionReady = Boolean(config.apiUrl && /^https:\/\//.test(config.apiUrl));
      if (competitionReady && startNativeCompetition) button('好友挑战', base + 232, () => { dispose(); const leave = () => { child?.stop?.(); child = startNativeCopsGame({ ...sdk, createCanvas: () => canvas }, config, startNativeCompetition); }; child = startNativeCompetition(sdk, { ...config, canvas, onExit: leave }, createRenderer); });
      text(storageOK ? `已完成 ${Object.keys(records()).length} / ${list().length} 关` : '宿主存储不可用，本次仍可游玩', width / 2, height - bottom - 24, 13);
    } else if (page === 'levels') {
      title(`${modes[mode].label} · 选关`);
      const rows = Math.max(1, Math.min(6, Math.floor((height - top - bottom - 210) / 54))), start = pageIndex * rows;
      list().slice(start, start + rows).forEach((map, i) => { const record = records()[map.id]; button(`${map.id} ${map.name} ${record ? '★'.repeat(record.stars) : unlocked(start + i) ? '' : '· 未解锁'}`, top + 65 + i * 54, () => load(map.id), unlocked(start + i)); });
      const y = height - bottom - 112;
      button('上一页', y, () => pageIndex--, pageIndex > 0, 24, (width - 58) / 2);
      button('下一页', y, () => pageIndex++, start + rows < list().length, width / 2 + 5, (width - 58) / 2);
      button('返回主页', y + 56, () => page = 'home');
    } else if (page === 'help') {
      title('学习与设置');
      ['点蓝色队员，再点相邻空路口。', '每步移动一人，电脑随后行动。', '堵住全部退路完成拦截。', '橙色出口必须优先守住。', '接力：连续移动必须换人。', '快练：在限制步数内收网。'].forEach((line, i) => text(line, width / 2, top + 76 + i * 30, Math.min(16, width / 23)));
      button(`触感反馈：${save.settings.nativeHaptics === false ? '关' : '开'}`, height - bottom - 164, () => { save.settings.nativeHaptics = save.settings.nativeHaptics === false; persist(); }, true, 24, channel ? (width - 58) / 2 : width - 48);
      if (channel) button('B站入口', height - bottom - 164, () => page = 'channel', true, width / 2 + 5, (width - 58) / 2);
      text('本入口无音频素材，声音播放不可用', width / 2, height - bottom - 104, 12);
      button('返回', height - bottom - 56, () => page = helpReturn);
    } else if (page === 'channel' && channel) {
      const snapshot = channel.getSnapshot(); title('B站入口'); text(`收藏签 ${snapshot.count || 0} 枚`, width / 2, top + 78);
      channel.menuActions.forEach((action, i) => button(action.label, top + 108 + i * 58, () => runChannel(action)));
      const lines = Array.from(channelMessage || snapshot.message || '').reduce((rows, char, i) => { (rows[Math.floor(i / Math.max(12, Math.floor((width - 48) / 14)))] ||= []).push(char); return rows; }, []);
      lines.forEach((line, i) => text(line.join(''), width / 2, top + 246 + i * 22, 14));
      button('返回帮助', height - bottom - 56, () => page = 'help');
    } else if (page === 'pause' || page === 'result') {
      const won = outcome() === 'won'; title(page === 'pause' ? '巡逻已暂停' : won ? '拦截成功' : '突围成功');
      text(`${level.name} · ${board.turn} 步`, width / 2, top + 74);
      const y = top + 108;
      if (page === 'pause') button('继续', y, () => page = 'play');
      else { const next = list()[list().findIndex(item => item.id === level.id) + 1]; button(won && next ? '下一关' : '重试', y, () => load(won && next ? next.id : level.id)); }
      button('重试本关', y + 58, () => load(level.id));
      button('学习 / 帮助', y + 116, () => { helpReturn = page; page = 'help'; });
      button('返回主页', y + 174, () => { persist(); page = 'home'; });
    } else {
      title(level.name); text(`${board.turn} 步${mode === 'quick' ? ` / ${level.turnLimit}` : ''}`, width / 2, top + 63, 14);
      const size = Math.max(100, Math.min(width - 32, height - top - bottom - 240)), left = (width - size) / 2, boardTop = top + 86;
      const point = n => ({ x: left + level.nodes[n].x / 600 * size, y: boardTop + level.nodes[n].y / 600 * size });
      ctx.fillStyle = '#e3e8d2'; ctx.fillRect(left, boardTop, size, size); ctx.lineWidth = Math.max(8, size * .03); ctx.strokeStyle = '#fff8eb';
      for (const [a, b] of level.edges) { const p = point(a), q = point(b); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
      const targets = mode === 'relay' ? relayTargets(level, board, selected, board.relayLast ?? -1) : legalTargets(level, board, selected);
      const circle = (p, r, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); };
      level.nodes.forEach((_, n) => { const p = point(n); circle(p, targets.includes(n) ? 12 : 9, level.exits.includes(n) ? '#ec9a43' : targets.includes(n) ? '#8dbded' : '#fff'); text(n + 1, p.x, p.y, 11); hits.push({ id: `node${n}`, x: p.x - 22, y: p.y - 22, w: 44, h: 44, action: () => move(n) }); });
      board.robbers.forEach((n, i) => { if (n < 0) return; const p = point(n); circle(p, 16, '#d65b19'); text(`突${i + 1}`, p.x, p.y, 12, '#fff'); });
      board.cops.forEach((n, i) => { const p = point(n); if (i === selected) circle(p, 23, '#fff'); circle(p, 17, '#1258c2'); text(i + 1, p.x, p.y, 14, '#fff'); hits.push({ id: `cop${i}`, x: p.x - 22, y: p.y - 22, w: 44, h: 44, action: () => { selected = i; note = ''; } }); });
      const y = height - bottom - 112; text(note || `已选 ${selected + 1} 号 · 点相邻路口`, width / 2, y - 22, 13);
      button('留守一步', y, () => move(board.cops[selected]), true, 24, (width - 58) / 2);
      button('撤销', y, () => { board = history.pop(); page = 'play'; note = ''; persist(); }, history.length > 0, width / 2 + 5, (width - 58) / 2);
      button('暂停', y + 56, () => page = 'pause');
      // Pause bars are geometry, never a font approximation.
      ctx.fillStyle = '#fff'; ctx.fillRect(40, y + 69, 5, 20); ctx.fillRect(49, y + 69, 5, 20);
    }
  }
  const point = touch => ({ x: touch.clientX ?? touch.x, y: touch.clientY ?? touch.y });
  const find = p => hits.filter(hit => inside(p, hit)).sort((a, b) => Math.hypot(p.x - a.x - a.w / 2, p.y - a.y - a.h / 2) - Math.hypot(p.x - b.x - b.w / 2, p.y - b.y - b.h / 2) || (b.id.startsWith('cop') ? 1 : 0) - (a.id.startsWith('cop') ? 1 : 0))[0];
  const cancel = () => { pressed = null; };
  subscribe('onTouchStart', 'offTouchStart', event => { const touches = event.touches || []; if (touches.length !== 1 || pressed) { cancel(); return; } const touch = touches[0], p = point(touch), hit = find(p); pressed = hit ? { hit, id: touch.identifier, page, x: p.x, y: p.y } : null; });
  subscribe('onTouchMove', 'offTouchMove', event => { const touches = event.touches || []; if (!pressed || touches.length !== 1 || touches[0].identifier !== pressed.id || !inside(point(touches[0]), pressed.hit)) cancel(); });
  subscribe('onTouchCancel', 'offTouchCancel', cancel);
  subscribe('onTouchEnd', 'offTouchEnd', event => { const previous = pressed; cancel(); const touches = event.changedTouches || []; if (!previous || touches.length !== 1 || event.touches?.length || touches[0].identifier !== previous.id || previous.page !== page) return; const p = point(touches[0]), hit = find(p); if (!hit || hit.id !== previous.hit.id || !inside(p, previous.hit) || Date.now() - lastTap < 120) return; lastTap = Date.now(); previous.hit.action(); draw(); });
  subscribe('onHide', 'offHide', () => { cancel(); if (page === 'play') page = 'pause'; persist(); draw(); });
  subscribe('onShow', 'offShow', () => { cancel(); resize(); });
  subscribe('onWindowResize', 'offWindowResize', resize);
  if (channel?.subscribe) subscriptions.push(channel.subscribe(() => { if (page === 'channel') draw(); }));
  function dispose() { if (stopped) { (child?.stop || child?.dispose)?.call(child); return; } persist(); stopped = true; cancel(); for (const off of subscriptions) { try { off(); } catch { /* host cleanup */ } } }
  resize();
  return { canvas, dispose, getState: () => ({ page, mode, levelId: level.id, board: copy(board), selected, storageOK, hits: hits.map(({ action, ...hit }) => hit) }) };
}
