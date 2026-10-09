import { nativeScenes as scenes } from './native-scenes.js';
import { createRenderer } from './competition-renderer.js';
import { createNativeHistoryImageLoader } from './native-assets.mjs';
import { scoreGuess, chooseRounds, validPoint, MIN_YEAR, MAX_YEAR } from './src/game.js';
import { routes, routeDeck } from './src/routes.js';

const SAVE = 'here-and-then:native:v1';
const ROUND_SECONDS = 25;
const observationHint = '观察建筑材料、交通方式与衣着，把多处线索结合起来判断。';
const validInput = input => input && (!input.guess || validPoint(input.guess)) && /^\d{0,4}$/.test(input.digits || '');
export function restoreNativeHistory(value) {
  if (!value || value.version !== 1) return { settings: { region: 'all', timed: false }, visited: [], best: 0, journey: null };
  const result = { settings: { region: value.settings?.region === 'china' ? 'china' : 'all', timed: value.settings?.timed === true }, visited: Array.isArray(value.visited) ? value.visited.filter(id => scenes.some(s => s.id === id)) : [], best: Number.isFinite(value.best) ? Math.max(0, value.best) : 0, journey: null };
  const j = value.journey;
  if (!j || !Array.isArray(j.deck) || ![1, 3, 5].includes(j.deck.length) || new Set(j.deck).size !== j.deck.length || j.deck.some(id => !scenes.some(s => s.id === id)) || !Number.isInteger(j.index) || j.index < 0 || j.index >= j.deck.length || !['guessing', 'revealed'].includes(j.phase) || !validInput(j.input) || !Array.isArray(j.answers) || j.answers.length !== j.index + (j.phase === 'revealed' ? 1 : 0) || !Number.isFinite(j.remaining) || j.remaining < 0 || j.remaining > 90) return result;
  if (j.answers.some(a => !a || (a.point !== null && !validPoint(a.point)) || (a.year !== null && (!Number.isInteger(a.year) || a.year === 0 || a.year < MIN_YEAR || a.year > MAX_YEAR)))) return result;
  result.journey = { ...j, remaining: Math.min(ROUND_SECONDS, j.remaining), timed: j.timed === true, hint: j.hint === true, answers: j.answers.map((a, i) => ({ ...scoreGuess(scenes.find(s => s.id === j.deck[i]), a.point, a.year), point: a.point, year: a.year, penalty: a.penalty === 500 ? 500 : 0 })) };
  return result;
}

export function startNativeHistoryGame(sdk, config = {}, startNativeCompetition) {
  for (const key of ['createCanvas', 'getSystemInfoSync', 'onTouchStart', 'offTouchStart', 'onTouchMove', 'offTouchMove', 'onTouchEnd', 'offTouchEnd', 'onTouchCancel', 'offTouchCancel', 'onHide', 'offHide', 'onShow', 'offShow']) if (typeof sdk?.[key] !== 'function') throw new Error(`此时此地原生宿主缺少 ${key}`);
  const canvas = config.canvas || sdk.createCanvas(), ctx = canvas.getContext('2d');
  const loadImage = createNativeHistoryImageLoader(sdk, config.assetPackages);
  const nativeRenderer = options => createRenderer({ ...options, loadImage });
  const renderer = nativeRenderer();
  let saved; try { saved = sdk.getStorageSync?.(SAVE); if (typeof saved === 'string') saved = JSON.parse(saved); } catch { /* Storage denial keeps local play available. */ }
  let data = restoreNativeHistory(saved), page = 'home', previous = 'home', listPage = 0, learnPage = 0, hits = [], stopped = false, visible = true, touch = null, session = 0, info, w, h, ratio, top, bottom, child, message = '', last = Date.now();
  const subscriptions = [];
  const channel = sdk.channelEntry; let channelMessage = '';
  const runChannel = action => { if (action.available === false) { channelMessage = '宿主暂不支持此入口'; draw(); return; } channelMessage = ''; Promise.resolve().then(() => action.run()).catch(error => { channelMessage = error.message; }).finally(draw); };
  const listen = (on, off, fn) => { if (sdk[on] && sdk[off]) { sdk[on](fn); subscriptions.push(() => sdk[off](fn)); } };
  function persist() { try { sdk.setStorageSync?.(SAVE, { ...data, version: 1 }); } catch { message = '存档暂不可用，本次仍可继续'; } }
  function resize() { info = sdk.getSystemInfoSync(); w = info.windowWidth; h = info.windowHeight; ratio = Math.max(1, info.pixelRatio || 1); top = Math.max(48, (info.safeArea?.top || 0) + 12); bottom = Math.max(12, h - (info.safeArea?.bottom || h)); canvas.width = w * ratio; canvas.height = h * ratio; draw(); }
  const score = () => data.journey?.answers.reduce((n, a) => n + Math.max(0, a.total - a.penalty), 0) || 0;
  const scene = () => scenes.find(s => s.id === data.journey.deck[data.journey.index]);
  function begin(deck, timed = data.settings.timed) { session++; data.journey = { deck: deck.map(s => s.id), index: 0, phase: 'guessing', input: { guess: null, digits: '', bce: false }, answers: [], remaining: ROUND_SECONDS, hint: false, timed }; page = 'play'; last = Date.now(); persist(); draw(); }
  function go(next) { touch = null; page = next; last = Date.now(); persist(); draw(); }
  function act(input) {
    const j = data.journey;
    if (!input || !j) return;
    if (input.type === 'hint' && j.phase === 'guessing') j.hint = true;
    if (input.type === 'guess' && j.phase === 'guessing') {
      const point = validPoint(input.point) ? input.point : null, year = Number.isInteger(input.year) && input.year !== 0 && input.year >= MIN_YEAR && input.year <= MAX_YEAR ? input.year : null;
      j.answers.push({ ...scoreGuess(scene(), point, year), point, year, penalty: j.hint ? 500 : 0 }); j.phase = 'revealed';
      if (!data.visited.includes(scene().id)) data.visited.push(scene().id);
      data.best = Math.max(data.best, score());
    }
    if (input.type === 'next' && j.phase === 'revealed') {
      if (j.index === j.deck.length - 1) { go('summary'); return; }
      j.index++; j.phase = 'guessing'; j.input = { guess: null, digits: '', bce: false }; j.hint = false; j.remaining = ROUND_SECONDS;
    }
    persist(); draw();
  }
  function view() {
    const j = data.journey, s = scene(), a = j.answers[j.index];
    return { round: j.index + 1, total: j.deck.length, roundKey: `${session}:${j.deck.join(',')}:${j.index}`, phase: j.phase, image: s.image, clue: s.clue, hint: j.hint ? observationHint : null, score: score(), input: j.input, remainingMs: j.timed ? j.remaining * 1000 : undefined, finished: false, answer: a ? { score: Math.max(0, a.total - a.penalty), penalty: a.penalty, timedOut: a.point === null || a.year === null } : null };
  }
  function text(t, x, y, size = 18, color = '#243d33') { ctx.fillStyle = color; ctx.font = `${size}px sans-serif`; ctx.fillText(String(t), x, y); }
  function wrap(t, y, maxLines = 10) { let line = '', row = 0; ctx.font = '16px sans-serif'; for (const c of String(t)) { if (ctx.measureText(line + c).width > w - 48 && line) { text(line, 24, y + row++ * 26, 16); line = ''; if (row >= maxLines) return; } line += c; } if (line) text(line, 24, y + row * 26, 16); }
  function button(label, y, run, primary = false, x = 24, width = w - 48) { ctx.fillStyle = primary ? '#244e40' : '#e4dece'; ctx.fillRect(x, y, width, 48); ctx.textAlign = 'center'; text(label, x + width / 2, y + 24, 16, primary ? '#fff9ec' : '#243d33'); ctx.textAlign = 'left'; hits.push({ x, y, w: width, h: 48, run, label }); }
  function draw() {
    if (stopped || !visible || child || !w) return;
    hits = []; ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = '#f4efe4'; ctx.fillRect(0, 0, w, h);
    if (page === 'play') {
      button('暂停', top, () => go('pause'), false, w - 96, 72);
      // Draw the required parallel bars rather than a font glyph.
      ctx.fillStyle = '#243d33'; ctx.fillRect(w - 90, top + 15, 4, 18); ctx.fillRect(w - 83, top + 15, 4, 18);
      const j = data.journey; if (j.phase === 'revealed') button('评分手记', top, () => { learnPage = 0; go('learn'); }, false, 16, Math.min(160, w - 130)); else text(j.timed && j.phase === 'guessing' ? `剩余 ${Math.ceil(j.remaining)} 秒` : '悠闲观察', 16, top + 24, 15);
      ctx.save(); ctx.translate(0, top + 56); renderer.draw(ctx, w, h - top - 56 - bottom, view()); ctx.restore(); return;
    }
    text(page === 'home' ? '此时 · 此地' : ({ levels: '选择一幕', routes: '主题旅途', settings: '设置', help: '如何观察', pause: '旅途已暂停', summary: '旅途完成', learn: '评分手记' }[page] || '此时 · 此地'), 24, top + 28, 26);
    let y = top + 86;
    const add = (label, fn, primary) => { button(label, y, fn, primary); y += 60; };
    if (page === 'home') {
      text(`已探索 ${data.visited.length} / ${scenes.length} 幕 · 最高 ${data.best} 分`, 24, y, 16); y += 58;
      add('开始五幕旅途', () => begin(chooseRounds(scenes, data.settings.region, Math.random, data.visited)), true);
      if (data.journey) add('继续存档', () => go('play'));
      add('选择一幕练习', () => go('levels')); add('主题旅途', () => go('routes'));
      if (h < 650) { const half = (w - 56) / 2; button('帮助', y, () => { previous = 'home'; go('help'); }, false, 24, half); button('设置', y, () => go('settings'), false, 32 + half, half); y += 60; } else { add('帮助', () => { previous = 'home'; go('help'); }); add('设置', () => go('settings')); }
      if (config.apiUrl && config.competitionConfigured && typeof startNativeCompetition === 'function') add('好友挑战', () => { stop(); child = startNativeCompetition(sdk, { ...config, canvas, onExit: () => { child?.stop?.(); child = startNativeHistoryGame(sdk, config, startNativeCompetition); } }, nativeRenderer); });
    } else if (page === 'levels') {
      const count = Math.max(1, Math.floor((h - bottom - y - 125) / 60));
      scenes.slice(listPage * count, (listPage + 1) * count).forEach(s => add(`${data.visited.includes(s.id) ? '✓ ' : ''}${s.title}`, () => begin([s], false)));
      add('上一页 / 下一页', () => { listPage = (listPage + 1) % Math.ceil(scenes.length / count); draw(); }); add('返回主页', () => go('home'));
    } else if (page === 'routes') { routes.forEach(r => add(r.name, () => begin(routeDeck(scenes, r.id), false))); add('返回主页', () => go('home'));
    } else if (page === 'settings') {
      add(`范围：${data.settings.region === 'china' ? '中国' : '世界'}`, () => { data.settings.region = data.settings.region === 'china' ? 'all' : 'china'; persist(); draw(); });
      add(`旅途：${data.settings.timed ? '每幕25秒' : '悠闲无计时'}`, () => { data.settings.timed = !data.settings.timed; persist(); draw(); });
      wrap('声音：本模式没有音效。分享、登录及奖励由已配置的平台能力提供；未配置时本地探索不受影响。', y + 14, 5); y += 154;
      if (channel) { const half = (w - 56) / 2; button('B站入口', y, () => go('channel'), false, 24, half); button('返回主页', y, () => go('home'), false, 32 + half, half); } else add('返回主页', () => go('home'));
    } else if (page === 'channel' && channel) {
      const snapshot = channel.getSnapshot(); text(`收藏签 ${snapshot.count || 0} 枚`, 24, y); y += 44;
      channel.menuActions.forEach(action => add(action.label, () => runChannel(action)));
      wrap(channelMessage || snapshot.message || '', y + 12, 4); y += 110; add('返回设置', () => go('settings'));
    } else if (page === 'help') {
      wrap('观察全景，使用向左、向右和放大寻找线索。打开地图点击落点，输入公元或公元前年代，再提交。地点和年代各2500分。提示扣500分。没有公元0年。本地练习不计全站榜。图片为AI艺术复原，提交后仅显示评分，不公开答案或误差。计时旅途每幕25秒。滑出按钮或取消触摸不会触发操作。', y, 10); y += 280; add('返回', () => go(previous));
    } else if (page === 'pause') { add('继续观察', () => go('play'), true); add('帮助', () => { previous = 'pause'; go('help'); }); add('保存并返回主页', () => go('home'));
     } else if (page === 'learn') {
      const lines = []; ctx.font = '16px sans-serif';
      for (const paragraph of ['本幕评分已收录。标准地点、年代和误差均不公开。', '观察建筑、交通与衣着，尝试把多处线索结合起来判断。', '练习可以暂停；正式好友挑战由服务器计时，每幕25秒，切后台不会暂停。', '本地成绩只保存在设备中，不进入全站榜。', '图片为AI历史想象复原。']) {
        let line = ''; for (const c of paragraph) { if (ctx.measureText(line + c).width > w - 48 && line) { lines.push(line); line = ''; } line += c; } if (line) lines.push(line);
      }
      const count = Math.max(1, Math.floor((h - bottom - y - 130) / 26)), pages = Math.ceil(lines.length / count);
      lines.slice(learnPage * count, (learnPage + 1) * count).forEach((line, i) => text(line, 24, y + i * 26, 16)); y += count * 26 + 12;
      add(`手记 ${learnPage + 1}/${pages} · 下一页`, () => { learnPage = (learnPage + 1) % pages; draw(); }); add('返回本幕', () => go('play'));
    } else if (page === 'summary') { text(`本次 ${score()} 分`, 24, y, 24); y += 64; add('再走五幕', () => begin(chooseRounds(scenes, data.settings.region, Math.random, data.visited)), true); add('返回主页', () => { data.journey = null; go('home'); }); }
    if (message) text(message, 24, h - bottom - 18, 12);
  }
  const point = t => ({ x: t.clientX ?? t.x, y: t.clientY ?? t.y, id: t.identifier ?? t.id ?? 0 });
  listen('onTouchStart', 'offTouchStart', e => { if (!visible || stopped || child || e.touches?.length !== 1) { touch = null; return; } touch = { ...point(e.touches[0]), page }; });
  listen('onTouchMove', 'offTouchMove', e => { if (!touch) return; const p = e.touches?.length === 1 ? point(e.touches[0]) : null; if (!p || p.id !== touch.id || Math.hypot(p.x - touch.x, p.y - touch.y) > 14) touch = null; });
  listen('onTouchCancel', 'offTouchCancel', () => { touch = null; });
  listen('onTouchEnd', 'offTouchEnd', e => {
    const start = touch; touch = null; if (!start || stopped || !visible || child || start.page !== page || e.touches?.length || e.changedTouches?.length !== 1) return;
    const p = point(e.changedTouches[0]); if (p.id !== start.id || Math.hypot(p.x - start.x, p.y - start.y) > 14) return;
    const hit = hits.find(b => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h && start.x >= b.x && start.x <= b.x + b.w && start.y >= b.y && start.y <= b.y + b.h);
    if (hit) hit.run(); else if (page === 'play') {
      const action = renderer.tap(p.x, p.y - top - 56, view()); data.journey.input = renderer.snapshot();
      if (action?.type === 'next' && data.journey.index === data.journey.deck.length - 1) go('summary'); else act(action);
      persist(); draw();
    }
  });
  listen('onHide', 'offHide', () => { touch = null; if (page === 'play') page = 'pause'; visible = false; persist(); });
  listen('onShow', 'offShow', () => { visible = true; last = Date.now(); resize(); });
  listen('onWindowResize', 'offWindowResize', () => { touch = null; resize(); });
  if (channel?.subscribe) subscriptions.push(channel.subscribe(() => { if (page === 'channel') draw(); }));
  const interval = setInterval(() => { const now = Date.now(), dt = Math.max(0, Math.min(1, (now - last) / 1000)); last = now; const j = data.journey; if (visible && page === 'play' && j?.timed && j.phase === 'guessing') { j.remaining = Math.max(0, j.remaining - dt); if (j.remaining === 0) act({ type: 'guess', point: null, year: null }); } draw(); }, 100);
  function stop() { if (stopped) { child?.stop?.(); return; } persist(); stopped = true; touch = null; clearInterval(interval); for (const off of subscriptions.splice(0)) off(); child?.stop?.(); }
  resize(); return { canvas, stop };
}
