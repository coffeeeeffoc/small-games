import { createNativeSession } from './native-session.js';
import { createNativeLibrary, nativeToday, readNativeIsland, nativeIslandInvitation } from './native-platform.js';
import { BOARD, letters, isBlocked, findSpelling } from './engine.js';
import { collections, miniIslands } from './challenge.js';
import { practiceBatches } from './library.js';
import { createRenderer } from './competition-renderer.js';

const C = { bg: '#f6f3e9', ink: '#244e48', muted: '#77877b', orange: '#f28d58', orangeBottom: '#cd7043',
  mint: '#cde4c4', paper: '#fffdf7', line: '#e2e3d5', tile: '#edf2d9', tileBottom: '#acc49c', blocked: '#a9bbab' };

// Native Canvas pages use the same rules, words and saves as the independent H5 game.
export function startNativeLettersGame(sdk, config, startNativeCompetition) {
  if (!sdk) throw new Error('缺少小游戏 SDK，无法启动词屿。');
  for (const key of ['createCanvas', 'getSystemInfoSync', 'onTouchEnd', 'offTouchEnd', 'onHide', 'offHide', 'onShow', 'offShow'])
    if (typeof sdk[key] !== 'function') throw new Error(`小游戏 SDK 缺少 ${key}。`);
  let hadProgress = false;
  try { hadProgress = Boolean(sdk.getStorageSync('ciyu-progress') || sdk.getStorageSync('ciyu-active-mini') || sdk.getStorageSync('ciyu-active-daily')); } catch {}
  const session = createNativeSession({ getItem: key => sdk.getStorageSync(key), setItem: (key, value) => sdk.setStorageSync(key, value) });
  const library = createNativeLibrary(sdk, config.assetBase || 'assets/english-dict/');
  const canvas = config.canvas || sdk.createCanvas(), ctx = canvas.getContext('2d');
  const subscriptions = [];
  let page = 'home', previous = 'home', stopped = false, hidden = false, serial = 0, pk = null;
  let width, height, ratio, viewportWidth, originX, top, bottom;
  let hits = [], boardArea = null, tileTargets = [], boardScroll = 0, answerScroll = 0, pageScroll = 0, maxPageScroll = 0;
  let gesture = null, pressed = null, message = '', busy = false, keyboardOpen = false;
  let soundEnabled = session.readPreference('ciyu-sound') === 'true';
  let sound = null, art = null, customText = session.savedCustom, catalog = null;
  let publisherId = 'fltrp', grade = '', bookId = '', unit = '', picker = null, pickerPage = 0;
  let wordPage = 0, resultPage = 0, shareData = null, shareBusy = false;
  const safe = run => { try { return run(); } catch { return undefined; } };
  function subscribe(name, listener) {
    if (typeof sdk[`on${name}`] !== 'function' || typeof sdk[`off${name}`] !== 'function') return false;
    sdk[`on${name}`](listener); subscriptions.push(() => sdk[`off${name}`](listener)); return true;
  }
  function resize() {
    const info = sdk.getSystemInfoSync();
    width = Math.max(240, Number(info.windowWidth) || 390); height = Math.max(240, Number(info.windowHeight) || 844);
    ratio = Math.max(1, Number(info.pixelRatio) || 1);
    viewportWidth = Math.min(width, 430); originX = (width - viewportWidth) / 2;
    const capsule = safe(() => sdk.getMenuButtonBoundingClientRect?.());
    top = Math.max(24, info.safeArea?.top || 0, capsule?.bottom || 0) + (capsule ? 12 : 0);
    bottom = Math.max(20, height - (info.safeArea?.bottom || height));
    canvas.width = width * ratio; canvas.height = height * ratio;
    gesture = null; pressed = null;
    draw();
  }
  function change(next, back = 'home') {
    serial++; busy = false; shareBusy = false; gesture = null; pressed = null;
    if (keyboardOpen) safe(() => sdk.hideKeyboard?.({}));
    keyboardOpen = false;
    if (page === 'play' && next !== 'play') session.pause();
    previous = back; page = next; pageScroll = 0; maxPageScroll = 0;
    if (next === 'play') { if (session.completed) page = 'result'; else session.resume(); }
    draw();
  }
  function play() { hadProgress = true; boardScroll = 0; answerScroll = 0; message = '点选字母牌，按顺序拼出答案。'; change('play'); }
  function start(run) { run(); play(); }
  function soundFeedback() {
    if (soundEnabled) safe(() => { sound?.stop(); sound?.play(); });
    safe(() => sdk.vibrateShort?.({ type: 'light' }));
  }
  function picked(id) {
    const result = session.pick(id);
    if (result.status === 'blocked') message = '这张牌被压住了，先消除上层字母。';
    else if (result.status === 'full') message = '答案已满，可以撤回或点击答案格修改。';
    else if (result.status === 'incorrect') message = '还不是这个单词，撤回再试试。';
    else if (result.status === 'correct') {
      soundFeedback(); message = `${result.word.displayWord || result.word.word} ✓ ${result.rescued ? '已免费整理余牌' : '拼对了！'}`;
      boardScroll = 0; answerScroll = 0;
      if (result.won) { resultPage = 0; change('result'); }
    } else if (result.status !== 'ignored') {
      soundFeedback(); message = result.status === 'deselected' ? '已撤销这个字母。' : '字母留在原位，拼对整词再一起消除。';
      const count = letters(session.activeWord?.word || '').length, available = boardArea?.answer?.w || viewportWidth - 94;
      const size = Math.min(47, Math.max(44, (available - Math.max(0, count - 1) * 5) / Math.max(1, count)));
      answerScroll = Math.max(0, session.state.game.selected.length * (size + 5) - available);
    }
    draw();
  }
  function check() {
    const result = session.submit();
    if (result.status === 'correct') { soundFeedback(); boardScroll = 0; answerScroll = 0; message = '拼对了！'; if (result.won) change('result'); }
    else message = result.status === 'incomplete' ? '还差几个字母，完整拼出再检查。' : '还不是这个单词，撤回再试试。';
    draw();
  }
  function home() { session.pause(); change('home'); }
  function mainSharePayload() {
    try { return nativeIslandInvitation(session.state); }
    catch { return { title: '词屿 · 字母叠叠乐', query: 'game=letters-words2' }; }
  }
  function openPK() {
    if (pk) return;
    safe(() => sdk.offShareAppMessage?.(mainSharePayload));
    session.pause(); change('pk');
    try {
      pk = startNativeCompetition(sdk, { ...config, canvas, homeLabel: '返回词屿', onExit() {
        pk?.stop(); pk = null; safe(() => sdk.onShareAppMessage?.(mainSharePayload)); resize(); home();
      } }, createRenderer);
    } catch (error) { pk?.stop(); pk = null; safe(() => sdk.onShareAppMessage?.(mainSharePayload)); message = error.message; change('home'); }
  }
  const selectedBook = () => catalog?.books.find(book => book.id === bookId);
  function fillBooks() {
    const candidates = catalog.books.filter(book => book.publisherId === publisherId && String(book.grade ?? '') === grade);
    bookId = candidates[0]?.id || ''; unit = candidates[0]?.units[0] || '';
  }
  function fillGrades() {
    const grades = [...new Set(catalog.books.filter(book => book.publisherId === publisherId).map(book => String(book.grade ?? '')))];
    grade = grades.sort((a, b) => Number(a || 99) - Number(b || 99))[0] || ''; fillBooks();
  }
  async function openLibrary(retry = false) {
    change('library', 'learn');
    if (catalog && !retry) return draw();
    busy = true; message = '正在读取教材目录…'; draw();
    const request = serial;
    try {
      if (retry) { library.clear(); catalog = null; }
      const data = await library.catalog();
      if (stopped || hidden || page !== 'library' || request !== serial) return;
      catalog = data; publisherId = data.publishers.some(item => item.id === 'fltrp') ? 'fltrp' : data.publishers[0]?.id;
      fillGrades(); message = '';
    } catch (error) { if (request === serial && !stopped) message = error.message; }
    finally { if (request === serial && !stopped) { busy = false; draw(); } }
  }
  async function beginPractice() {
    if (busy || !selectedBook()) return;
    const book = selectedBook(), selectedUnit = unit, request = serial;
    busy = true; message = '正在校验所选词库…'; draw();
    try {
      const data = await library.book(book);
      if (stopped || hidden || request !== serial || page !== 'library') return;
      const batches = practiceBatches(data.entries.filter(entry => !selectedUnit || entry.unit === selectedUnit));
      start(() => session.startPractice({ batches, index: 0, learned: 0, name: `${book.title} · ${selectedUnit || '整册'}`, bookId: book.id, unit: selectedUnit, review: [] }));
    } catch (error) { if (request === serial && !stopped) message = error.message; }
    finally { if (request === serial && !stopped) { busy = false; draw(); } }
  }
  function chooseField(kind) {
    if (!catalog || busy) return;
    const book = selectedBook();
    const fields = {
      publisher: { title: '选择出版社', options: catalog.publishers.map(item => ({ value: item.id, label: item.name })), choose(value) { publisherId = value; fillGrades(); } },
      grade: { title: '选择年级', options: [...new Set(catalog.books.filter(item => item.publisherId === publisherId).map(item => String(item.grade ?? '')))].sort((a, b) => Number(a || 99) - Number(b || 99)).map(value => ({ value, label: value ? `${value} 年级` : '综合词表' })), choose(value) { grade = value; fillBooks(); } },
      book: { title: '选择教材与册次', options: catalog.books.filter(item => item.publisherId === publisherId && String(item.grade ?? '') === grade).map(item => ({ value: item.id, label: item.title, detail: item.verification ? '已对照原书核验' : '历史词表 · 仅整册练习' })), choose(value) { bookId = value; unit = selectedBook()?.units[0] || ''; } },
      unit: { title: '选择学习单元', options: [...(book?.units || []).map(value => ({ value, label: value })), { value: '', label: '整册练习' }], choose(value) { unit = value; } },
    };
    picker = fields[kind]; pickerPage = 0; change('picker', 'library');
  }
  function editCustom() {
    if (!sdk.showKeyboard || !sdk.onKeyboardConfirm || !sdk.offKeyboardConfirm) { message = '当前平台输入不可用，可尝试粘贴词单。'; draw(); return; }
    keyboardOpen = true;
    const request = serial;
    try { sdk.showKeyboard({ defaultValue: customText, maxLength: 5000, multiple: true, confirmHold: false, confirmType: 'done',
      fail() { if (stopped || hidden || page !== 'custom' || request !== serial) return; keyboardOpen = false; message = '输入暂不可用，请重试或粘贴词单。'; draw(); } }); }
    catch { keyboardOpen = false; message = '输入暂不可用，请重试或粘贴词单。'; draw(); }
  }
  function importCustom() {
    try { start(() => session.importWords(customText)); } catch (error) { message = error.message; draw(); }
  }
  async function pasteCustom() {
    if (!sdk.getClipboardData) { message = '当前平台粘贴不可用，点击词单编辑。'; draw(); return; }
    const request = serial;
    safe(() => sdk.getClipboardData({ success(result) {
      if (stopped || hidden || page !== 'custom' || request !== serial) return;
      customText = String(result.data || '').slice(0, 5000); message = '词单已粘贴，核对后开始。'; draw();
    }, fail() { if (request === serial && !stopped) { message = '粘贴失败，点击词单编辑。'; draw(); } } }));
  }
  function share() {
    try { shareData = nativeIslandInvitation(session.state); } catch (error) { message = error.message; draw(); return; }
    change('share', page === 'result' ? 'result' : 'pause'); message = '';
  }
  function nativeShare() {
    if (shareBusy || !shareData) return;
    if (!sdk.shareAppMessage) { message = '当前分享不可用，可复制同题邀请。'; draw(); return; }
    const request = serial; shareBusy = true;
    const failed = () => { if (request === serial && !stopped && !hidden) { message = '分享未完成，进度已保留。'; shareBusy = false; draw(); } };
    try {
      const result = sdk.shareAppMessage({ ...shareData, fail: failed });
      if (result?.catch) result.catch(failed);
      message = '已打开平台分享，邀请朋友来同题拾词。'; draw();
    } catch { failed(); }
  }
  function copyShare() {
    if (!shareData || !sdk.setClipboardData) { message = '复制暂不可用，请使用平台分享。'; draw(); return; }
    const request = serial;
    try { sdk.setClipboardData({ data: `${shareData.title}\n同题邀请：${shareData.query}`, success() {
      if (request === serial && !stopped && !hidden) { message = '邀请已复制。'; draw(); }
    }, fail() { if (request === serial && !stopped && !hidden) { message = '复制失败，请使用平台分享。'; draw(); } } }); }
    catch { if (request === serial && !stopped) { message = '复制暂不可用，请使用平台分享。'; draw(); } }
  }
  function acceptInvitation(query) {
    if (query?.matchId || query?.pk) { openPK(); return; }
    const invitation = readNativeIsland(query);
    if (invitation.error) { message = '同题邀请无效，已保留本机进度。'; return; }
    if (invitation.mini) start(() => session.startMini(invitation.mini));
    else if (invitation.daily) start(() => session.startDaily(invitation.daily));
  }

  function rounded(x, y, w, h, radius = 18, fill = C.paper, stroke) {
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, radius); else ctx.rect(x, y, w, h);
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
  }
  function text(value, x, y, size = 15, color = C.ink, weight = 400, align = 'left') {
    ctx.fillStyle = color; ctx.font = `${weight} ${size}px sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillText(String(value), x, y);
  }
  function wrap(value, x, y, w, size = 14, color = C.muted, lines = 2, weight = 400) {
    ctx.font = `${weight} ${size}px sans-serif`;
    let line = '', row = 0;
    for (const char of String(value)) {
      if (ctx.measureText(line + char).width > w && line) {
        if (row + 1 >= lines) { text(`${line.slice(0, -1)}…`, x, y + row * (size * 1.65), size, color, weight); return; }
        text(line, x, y + row * (size * 1.65), size, color, weight); line = ''; row++;
      }
      line += char;
    }
    if (line) text(line, x, y + row * (size * 1.65), size, color, weight);
  }
  function hit(x, y, w, h, action, id = '') { hits.push({ x, y, w, h, action, id }); }
  function button(label, x, y, w, action, { h = 52, primary = false, quiet = false, enabled = true, fill, id } = {}) {
    const down = pressed && pressed.x >= x && pressed.x <= x + w && pressed.y >= y && pressed.y <= y + h;
    const actualY = y + (down ? 3 : 0);
    if (!quiet) {
      rounded(x, actualY + (down ? 1 : primary ? 5 : 3), w, h, 18, primary ? C.orangeBottom : '#becbb6');
      rounded(x, actualY, w, h, 18, !enabled ? '#e4e6dc' : fill || (primary ? C.orange : '#e4ecd8'), primary ? undefined : '#c5d1be');
    }
    text(label, x + w / 2, actualY + h / 2, primary ? 18 : 14, enabled ? (quiet ? C.muted : C.ink) : '#9aa28e', 650, 'center');
    if (enabled) hit(x, y, w, h, action, id || label);
  }
  function icon(name, x, y, action, label = name) {
    ctx.save(); ctx.translate(x + 22, y + 22); ctx.strokeStyle = C.ink; ctx.fillStyle = C.ink; ctx.lineWidth = 2;
    if (name === 'pause') { ctx.fillRect(-6, -8, 4, 16); ctx.fillRect(2, -8, 4, 16); }
    else if (name === 'back') { ctx.beginPath(); ctx.moveTo(3, -7); ctx.lineTo(-4, 0); ctx.lineTo(3, 7); ctx.stroke(); }
    else if (name === 'help') { ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.stroke(); text('?', 0, 0, 16, C.ink, 700, 'center'); }
    else { for (let i = -6; i <= 6; i += 6) { ctx.beginPath(); ctx.moveTo(-9, i); ctx.lineTo(9, i); ctx.stroke(); } ctx.beginPath(); ctx.arc(-3, -6, 3, 0, Math.PI * 2); ctx.arc(4, 0, 3, 0, Math.PI * 2); ctx.arc(-1, 6, 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore(); hit(x, y, 44, 44, action, label);
  }
  function header(label, back = () => change(previous)) {
    icon('back', 18, top, back, '返回'); text(label, viewportWidth / 2, top + 22, 15, C.ink, 650, 'center');
  }
  function title(main, sub) { text(main, 24, top + 84, 27, C.ink, 800); if (sub) wrap(sub, 24, top + 119, viewportWidth - 48, 14, C.muted, 2); }
  function hero(x, y, w, h) {
    if (art?.width) { const scale = Math.min(w / art.width, h / art.height); ctx.drawImage(art, x + (w - art.width * scale) / 2, y + (h - art.height * scale) / 2, art.width * scale, art.height * scale); }
  }
  function footer(value) { text(value, viewportWidth / 2, height - bottom - 11, 12, '#909b8c', 400, 'center'); }
  function notice(y = height - bottom - 38) { if (message || session.state.storageNotice) wrap(message || session.state.storageNotice, 24, y, viewportWidth - 48, 12, C.muted, 2); }
  function card(label, detail, x, y, w, h, action, fill = C.paper) {
    rounded(x, y, w, h, 22, fill, C.line); text(label, x + 20, y + 30, 18, C.ink, 750);
    if (detail) wrap(detail, x + 20, y + 59, w - 56, 12, C.muted, 2);
    text('›', x + w - 22, y + h / 2, 26, '#8e9c88', 400, 'center'); hit(x, y, w, h, action, label);
  }
  function miniArt(id, x, y) {
    const fill = id === 'dawn' ? '#f5dfac' : id === 'shore' ? '#d5e4c7' : '#d8ded0';
    rounded(x, y, 76, 76, 23, fill);
    if (id === 'dawn') {
      ctx.fillStyle = '#efc46f'; ctx.beginPath(); ctx.arc(x + 39, y + 26, 14, 0, Math.PI * 2); ctx.fill();
      rounded(x + 13, y + 37, 50, 29, 7, '#f6dfa4', '#d8b276'); ctx.fillStyle = '#fff9e8'; ctx.beginPath(); ctx.ellipse(x + 39, y + 51, 13, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#efc46f'; ctx.beginPath(); ctx.arc(x + 39, y + 51, 6, 0, Math.PI * 2); ctx.fill();
    } else if (id === 'shore') {
      ctx.fillStyle = '#f6d4a5'; ctx.beginPath(); ctx.ellipse(x + 40, y + 29, 18, 22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#dcbb8f'; ctx.lineWidth = 2; for (const dx of [-12, 0, 12]) { ctx.beginPath(); ctx.moveTo(x + 40 + dx, y + 13); ctx.lineTo(x + 40, y + 49); ctx.stroke(); }
      ctx.strokeStyle = '#8cbcac'; for (const dy of [58, 67]) { ctx.beginPath(); for (let px = 9; px <= 68; px++) { const py = y + dy + Math.sin(px / 7) * 3; if (px === 9) ctx.moveTo(x + px, py); else ctx.lineTo(x + px, py); } ctx.stroke(); }
    } else {
      ctx.fillStyle = '#e6c985'; ctx.beginPath(); ctx.arc(x + 40, y + 37, 23, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x + 52, y + 26, 22, 0, Math.PI * 2); ctx.fill();
      text('✦', x + 61, y + 27, 23, '#9bae93', 600, 'center'); text('✦', x + 17, y + 50, 16, '#9bae93', 600, 'center');
    }
  }
  function lineIcon(name, x, y, size = 28) {
    ctx.save(); ctx.translate(x, y); ctx.scale(size / 24, size / 24);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (name === 'book') {
      ctx.moveTo(3, 4); ctx.bezierCurveTo(7, 3, 9, 4, 12, 6); ctx.bezierCurveTo(15, 4, 17, 3, 21, 4);
      ctx.lineTo(21, 19); ctx.bezierCurveTo(17, 18, 15, 19, 12, 21); ctx.bezierCurveTo(9, 19, 7, 18, 3, 19); ctx.closePath();
      ctx.moveTo(12, 6); ctx.lineTo(12, 21);
    } else if (name === 'list') {
      if (ctx.roundRect) ctx.roundRect(5, 3, 14, 18, 2); else ctx.rect(5, 3, 14, 18);
      for (const [yy, length] of [[8, 6], [12, 6], [16, 4]]) { ctx.moveTo(9, yy); ctx.lineTo(9 + length, yy); }
    } else {
      ctx.moveTo(11, 5); ctx.lineTo(6, 9); ctx.lineTo(3, 9); ctx.lineTo(3, 15); ctx.lineTo(6, 15); ctx.lineTo(11, 19); ctx.closePath();
      if (soundEnabled) { ctx.moveTo(15, 8); ctx.bezierCurveTo(18, 10, 18, 14, 15, 16); ctx.moveTo(18, 5); ctx.bezierCurveTo(23, 9, 23, 15, 18, 19); }
      else { ctx.moveTo(16, 9); ctx.lineTo(21, 15); ctx.moveTo(21, 9); ctx.lineTo(16, 15); }
    }
    ctx.stroke(); ctx.restore();
  }
  function learningCard(label, detail, y, kind, action) {
    rounded(24, y, viewportWidth - 48, 114, 22, C.paper, C.line);
    rounded(44, y + 30, 50, 54, 14, kind === 'book' ? '#e8eedb' : '#f4e8ce');
    lineIcon(kind, 55, y + 43);
    text(label, 110, y + 44, 18, C.ink, 750);
    wrap(detail, 110, y + 74, viewportWidth - 160, 12, C.muted, 2);
    text('›', viewportWidth - 46, y + 57, 26, '#8e9c88', 400, 'center');
    hit(24, y, viewportWidth - 48, 114, action, label);
  }
  function drawHome() {
    rounded(24, top + 6, 32, 32, 10, C.ink); text('w', 40, top + 22, 26, C.bg, 850, 'center'); text('词屿', 66, top + 22, 16, C.ink, 750);
    icon('help', viewportWidth - 112, top, () => change('help'), '帮助'); icon('settings', viewportWidth - 68, top, () => change('settings'), '设置');
    text('词 屿', viewportWidth / 2, top + 107, 48, C.ink, 850, 'center'); text('字 母 叠 叠 乐', viewportWidth / 2, top + 157, 14, '#6b8574', 500, 'center');
    const artHeight = Math.min(260, Math.max(145, height - top - bottom - 425));
    hero(16, top + 161, viewportWidth - 32, artHeight);
    const y = top + 161 + artHeight;
    text('拾起字母，点亮一座单词小岛。', viewportWidth / 2, y + 10, 13, C.muted, 400, 'center');
    button(hadProgress ? session.completed ? '看看本岛收获 →' : '继续拾词 →' : '开始拾词 →', 24, y + 35, viewportWidth - 48, play, { h: 58, primary: true });
    const cw = (viewportWidth - 61) / 2;
    card('主题词岛', '三个单词，一段小冒险', 24, y + 116, cw, 106, () => change('islands'), '#e6ecd8');
    card('学习入口', '课本单词，轻松练习', 37 + cw, y + 116, cw, 106, () => change('learn'), '#f5e8d0');
    button('每日词岛', 24, y + 241, cw, () => start(() => session.startDaily(nativeToday())), { h: 44, fill: C.bg });
    button('好友同题', 37 + cw, y + 241, cw, openPK, { h: 44, fill: C.bg });
    text('不计时 · 慢慢来', viewportWidth / 2, Math.max(height - bottom - 11, y + 315), 12, '#909b8c', 400, 'center');
    maxPageScroll = Math.max(0, y + 338 - (height - bottom));
    if (message || session.state.storageNotice) notice(Math.max(height - bottom - 45, y + 287));
  }
  function drawIslands() {
    header('主题词岛', home); title('今天，去哪一岛？', '三个单词，收获一份小快乐。');
    let y = top + 163;
    for (const [i, island] of miniIslands.entries()) {
      rounded(24, y, viewportWidth - 48, 141, 22, ['#f8edd7', '#e7efdf', '#e8eae5'][i], C.line); miniArt(island.id, 40, y + 29);
      text(island.name, 132, y + 37, 19, C.ink, 750); wrap(island.description, 132, y + 67, viewportWidth - 180, 12, C.muted, 2);
      rounded(132, y + 101, 114, 23, 12, '#e9eddd'); text('3 个词 · 随时出发', 142, y + 113, 11, C.ink, 600);
      hit(24, y, viewportWidth - 48, 141, () => start(() => session.startMini(island.id)), island.id); y += 155;
    }
    card('自由拾词', '八大主题，随机遇见新单词', 24, y + 8, viewportWidth - 48, 82, () => change('free', 'islands'));
    maxPageScroll = Math.max(0, y + 115 - (height - bottom));
  }
  function drawFree() {
    header('自由拾词', () => change('islands')); title('一组新词，一座新岛。', '选择喜欢的主题，或随机出发。');
    button('随机出发 →', 24, top + 162, viewportWidth - 48, () => start(() => session.startTheme()), { primary: true, h: 58 });
    let y = top + 241;
    collections.forEach((collection, i) => { card(collection.name, '6 个词 · 自由拾词', 24, y, viewportWidth - 48, 82, () => start(() => session.startTheme(i))); y += 96; });
    maxPageScroll = Math.max(0, y + 12 - (height - bottom));
  }
  function drawLearn() {
    header('学习入口', home); title('把单词，慢慢记住。', '从课本出发，也可以带上自己的词单。');
    rounded(24, top + 158, viewportWidth - 48, 166, 24, '#e8eddc'); hero(viewportWidth - 206, top + 158, 200, 166);
    text('每天一小岛', 48, top + 212, 23, C.ink, 750); text('进步一点点', 48, top + 247, 23, C.ink, 750);
    learningCard('教材练习', '选择出版社、年级和单元', top + 341, 'book', () => void openLibrary());
    learningCard('我的词单', '用自己的 2–8 个单词练习', top + 472, 'list', () => { customText = session.savedCustom; message = ''; change('custom', 'learn'); });
    if (session.state.practice) {
      const p = session.state.practice;
      card('继续上次教材练习', `${p.name} · 已学 ${p.learned + session.state.game.completed} 词`, 24, top + 610, viewportWidth - 48, 110, play, '#e8eedf');
    } else if (session.state.review.length) card('易错词复习', `${session.state.review.length} 个提示 / 易错词`, 24, top + 610, viewportWidth - 48, 94, () => start(() => session.startReview()), '#e8eedf');
    maxPageScroll = Math.max(0, top + (session.state.practice || session.state.review.length ? 748 : 610) - (height - bottom));
  }
  function drawPlay() {
    const state = session.state, game = state.game, word = session.activeWord;
    const landscape = width > height && width >= 600;
    const hudX = landscape ? Math.round(viewportWidth * .54) : 18;
    const hudWidth = landscape ? viewportWidth - hudX - 18 : viewportWidth - 36;
    icon('back', 18, top, home, '返回首页'); icon('pause', viewportWidth - 62, top, () => change('pause'), '暂停');
    const shortName = state.mini ? miniIslands.find(island => island.id === state.mini).name : state.daily ? '每日词岛' : state.practice ? '教材练习' : state.name;
    text(`${shortName}  ${game.completed} / ${game.words.length}`, viewportWidth / 2, top + 22, 13, C.ink, 650, 'center');
    const clueY = top + 59, clueH = landscape ? 78 : height < 650 ? 98 : 122;
    rounded(hudX, clueY, hudWidth, clueH, 22, C.paper, '#e0e2d3');
    text('这一词，怎么拼？', hudX + 20, clueY + (landscape ? 20 : 26), 12, '#82917e');
    wrap(word?.meaning || '本岛已完成', hudX + 20, clueY + (landscape ? 47 : 59), hudWidth - 124, 25, C.ink, landscape ? 1 : 2, 800);
    button('换词义 ↗', hudX + hudWidth - 88, clueY + (landscape ? 27 : 36), 78, () => { wordPage = 0; change('words', 'play'); }, { h: 44, fill: '#eaf0df' });
    if (clueH === 122) text(`${letters(word?.word || '').length} 个字母 · ${word && findSpelling(game, word.id) ? '字母都已露出' : '先揭开上层'}`, hudX + 20, clueY + 103, 12, '#819079');
    if ((word?.meaning.length || 0) > 18) hit(hudX + 10, clueY + 30, hudWidth - 116, Math.max(44, clueH - 40), () => change('meaning', 'play'), '完整词义');
    const boardY = landscape ? top + 59 : clueY + clueH + 15, hudHeight = 178;
    const boardH = Math.max(100, landscape ? height - bottom - boardY : Math.min(370, height - bottom - boardY - hudHeight));
    const boardWidth = landscape ? hudX - 36 : viewportWidth - 36;
    boardArea = { x: 18, y: boardY, w: boardWidth, h: boardH };
    rounded(18, boardY, boardWidth, boardH, 28, '#e3ead6', '#d5dfc7');
    const scale = Math.max(44 / BOARD.tileSize, (boardWidth - 18) / BOARD.width);
    const boardX = 18 + (boardWidth - BOARD.width * scale) / 2;
    const scrollMax = Math.max(0, game.boardHeight * scale + 16 - boardH);
    boardScroll = Math.max(0, Math.min(boardScroll, scrollMax));
    ctx.save(); ctx.beginPath(); ctx.rect(20, boardY + 2, boardWidth - 4, boardH - 4); ctx.clip();
    tileTargets = [];
    for (const tile of [...game.tiles].filter(tile => !tile.removed).sort((a, b) => a.z - b.z)) {
      const x = boardX + tile.x * scale, y = boardY + tile.y * scale - boardScroll, size = tile.size * scale;
      if (y + size < boardY || y > boardY + boardH) continue;
      const blocked = isBlocked(tile, game.tiles), selected = game.selected.includes(tile.id);
      rounded(x, y + 5, size, size, 13, blocked ? '#91a68f' : selected ? '#d8b06a' : C.tileBottom);
      rounded(x, y, size, size, 13, blocked ? C.blocked : selected ? '#f7d58b' : C.tile, state.hint === tile.id ? '#dcac49' : blocked ? '#b6c7b4' : '#fbfcef');
      text(tile.char, x + size / 2, y + size / 2, Math.min(32, size * .5), blocked ? '#698270' : selected ? '#84652e' : '#315c4d', 800, 'center');
      if (selected) text(game.selected.indexOf(tile.id) + 1, x + size - 9, y + 10, 10, '#84652e', 700, 'center');
      const target = { x, y: Math.max(boardY + 2, y), w: size, h: Math.max(0, Math.min(boardY + boardH - 2, y + size) - Math.max(boardY + 2, y)), action: () => picked(tile.id), id: tile.id };
      // Partial cards absorb taps but need to be fully in view before they can be picked.
      if (target.h > 0) hits.push({ ...target, action: blocked || target.h < 44 ? () => { message = blocked ? '这张牌还被压住，先消除上层。' : '上下滑动，让字母牌完整露出再拾取。'; draw(); } : target.action });
      if (!blocked && target.h >= 44) tileTargets.push({ id: tile.id, char: tile.char, x, y, w: size, h: size });
    }
    ctx.restore();
    if (scrollMax > 0) {
      rounded(18 + boardWidth - 6, boardY + 10, 3, boardH - 20, 2, '#c4d3b5');
      const thumb = Math.max(20, (boardH - 20) * boardH / (game.boardHeight * scale));
      rounded(18 + boardWidth - 6, boardY + 10 + (boardH - 20 - thumb) * boardScroll / scrollMax, 3, thumb, 2, '#91ab80');
    }
    const answerY = landscape ? clueY + clueH + 7 : boardY + boardH + 18;
    text('把答案拼在这里', hudX + 3, answerY + 7, 12, '#7e8e77'); text(`${game.selected.length} / ${letters(word?.word || '').length}`, hudX + hudWidth - 3, answerY + 7, 12, '#7e8e77', 400, 'right');
    const count = letters(word?.word || '').length, availableW = hudWidth - 58, slotSize = Math.min(47, Math.max(44, (availableW - Math.max(0, count - 1) * 5) / Math.max(1, count)));
    const slotsWidth = count * (slotSize + 5) - 5, maxAnswer = Math.max(0, slotsWidth - availableW);
    answerScroll = Math.max(0, Math.min(answerScroll, maxAnswer));
    ctx.save(); ctx.beginPath(); ctx.rect(hudX, answerY + 25, availableW, 53); ctx.clip();
    for (let i = 0; i < count; i++) {
      const x = hudX + i * (slotSize + 5) - answerScroll, selectedId = game.selected[i];
      if (x + slotSize < hudX || x > hudX + availableW) continue;
      rounded(x, answerY + 25, slotSize, 47, 10, selectedId ? '#f8e3b3' : '#fffdf6', selectedId ? '#e9d0a2' : '#ced7bd');
      if (selectedId) { text(game.tiles.find(tile => tile.id === selectedId)?.char || '', x + slotSize / 2, answerY + 49, 24, C.ink, 750, 'center');
        if (x >= hudX && x + slotSize <= hudX + availableW) hit(x, answerY + 25, slotSize, 47, () => picked(selectedId), `answer-${i}`); }
    }
    ctx.restore();
    button('✓', hudX + hudWidth - 51, answerY + 25, 51, check, { h: 47, primary: true });
    if (maxAnswer > 0) {
      hit(hudX, answerY + 25, availableW, 47, () => { answerScroll = Math.min(maxAnswer, answerScroll + availableW); if (answerScroll >= maxAnswer && game.selected.length === 0) answerScroll = 0; draw(); }, '长答案');
      // Put the filled answer targets above the scroll surface.
      for (let i = 0; i < game.selected.length; i++) { const x = hudX + i * (slotSize + 5) - answerScroll; if (x >= hudX && x + slotSize <= hudX + availableW) hit(x, answerY + 25, slotSize, 47, () => picked(game.selected[i]), `answer-${i}`); }
    }
    wrap(message || (scrollMax ? '上下滑动棋盘，拾取完全露出的字母。' : '点选字母牌，按顺序拼出答案。'), hudX + 4, answerY + 91, hudWidth - 8, 11, C.muted, 1);
    const toolsY = answerY + (landscape ? 100 : 110), gap = 8, toolW = (hudWidth - 3 * gap) / 4;
    ['撤回', '清空', '重排', '提示'].forEach((label, index) => button(label, hudX + index * (toolW + gap), toolsY, toolW, () => {
      if (index === 0) { session.undo(); message = '已撤回最后一个字母。'; }
      if (index === 1) { session.clear(); answerScroll = 0; message = '已清空拼写，字母还在原位。'; }
      if (index === 2) { session.shuffle(); boardScroll = 0; answerScroll = 0; message = '重新排列好了，已完成的词保留。'; }
      if (index === 3) {
        const hintId = session.hint();
        message = hintId ? '金色边框是下一个字母。' : '先拼能露出的词，或重排继续。';
        if (hintId) {
          const tile = game.tiles.find(tile => tile.id === hintId);
          boardScroll = Math.max(0, Math.min(boardArea.maxScroll, (tile.y + tile.size / 2) * scale - boardArea.h / 2));
        }
      }
      draw();
    }, { h: landscape ? 44 : 50, fill: '#eeefdf', enabled: index > 1 || game.selected.length > 0 }));
    boardArea.maxScroll = scrollMax;
    boardArea.answer = { x: hudX, y: answerY + 25, w: availableW, h: 47, maxScroll: maxAnswer };
  }
  function drawPause() {
    header('休息一下', play);
    rounded(viewportWidth / 2 - 58, top + 89, 116, 116, 58, '#e1ead5');
    ctx.fillStyle = '#527555'; ctx.fillRect(viewportWidth / 2 - 17, top + 128, 11, 39); ctx.fillRect(viewportWidth / 2 + 6, top + 128, 11, 39);
    text('小岛会等你。', viewportWidth / 2, top + 234, 27, C.ink, 800, 'center');
    text(`${session.state.game.completed} / ${session.state.game.words.length} 词 · 进度自动保存`, viewportWidth / 2, top + 270, 13, C.muted, 400, 'center');
    let y = top + 314;
    button('继续拾词 →', 24, y, viewportWidth - 48, play, { h: 58, primary: true }); y += 76;
    button(session.state.mini || session.state.daily ? '同题再练一遍' : '换一组单词', 24, y, viewportWidth - 48, () => start(() => session.replay())); y += 65;
    if (session.state.mini || session.state.daily) { button('邀请朋友同题', 24, y, viewportWidth - 48, share, { fill: C.paper }); y += 65; }
    button('回到首页', 24, y, viewportWidth - 48, home, { fill: C.paper }); y += 70;
    if (session.state.mini || session.state.daily) { button('回到自由拾词', 24, y, viewportWidth - 48, () => { session.leaveIsland(); home(); }, { quiet: true, h: 44 }); y += 50; }
    button('拾词指南', 24, y, (viewportWidth - 61) / 2, () => change('help', 'pause'), { h: 44, quiet: true });
    button('设置', viewportWidth / 2 + 6, y, (viewportWidth - 61) / 2, () => change('settings', 'pause'), { h: 44, quiet: true });
    y += 62;
    maxPageScroll = Math.max(0, y + 25 - (height - bottom));
  }
  let channelSettingsBack = 'home';
  function drawSettings() {
    header('设置'); title('按自己的节奏。', '声音与反馈');
    const y = top + 161;
    rounded(24, y, viewportWidth - 48, 102, 22, C.paper, C.line);
    text('游戏音效', 44, y + 38, 16, C.ink, 700);
    text('字母轻响，拼对有回应', 44, y + 67, 13, C.muted);
    rounded(viewportWidth - 89, y + 29, 44, 44, 15, '#e8eedb');
    lineIcon('speaker', viewportWidth - 79, y + 39, 24);
    hit(24, y, viewportWidth - 48, 102, () => {
      soundEnabled = !soundEnabled; session.savePreference('ciyu-sound', String(soundEnabled));
      if (soundEnabled) soundFeedback(); else safe(() => sound?.stop()); draw();
    }, '游戏音效');
    footer('不计时 · 不限次数');
    if (sdk.channelEntry) button('B站入口', 24, y + 126, viewportWidth - 48, () => { channelSettingsBack = previous; change('channel', 'settings'); }, { h: 48 });
    maxPageScroll = Math.max(0, y + (sdk.channelEntry ? 200 : 122) - (height - bottom));
  }
  function drawChannel() {
    const channel = sdk.channelEntry, snapshot = channel.getSnapshot();
    header('B站入口', () => change('settings', channelSettingsBack)); title(`收藏签 ${snapshot.count || 0} 枚`);
    channel.menuActions.forEach((action, i) => button(action.label, 24, top + 180 + i * 62, viewportWidth - 48, () => {
      if (action.available === false) { message = '宿主暂不支持此入口'; draw(); return; }
      message = ''; Promise.resolve().then(() => action.run()).catch(error => { message = error.message; }).finally(draw);
    }, { h: 48 }));
    wrap(message || snapshot.message || '', 24, top + 326, viewportWidth - 48, 14, C.muted, 4);
    maxPageScroll = Math.max(0, top + 445 - (height - bottom));
  }
  function drawResult() {
    header('本岛收获', home); hero(24, top + 55, viewportWidth - 48, 208);
    text('这一岛，拾得漂亮！', viewportWidth / 2, top + 279, 27, C.ink, 800, 'center');
    text(`${session.state.mini ? miniIslands.find(item => item.id === session.state.mini).name : session.state.daily ? '每日词岛' : '本次词岛'} · ${session.state.game.words.length} 词已拾满`, viewportWidth / 2, top + 317, 13, C.muted, 400, 'center');
    if (session.state.mini || session.state.daily) { const stats = session.state.stats; text(stats.hints + stats.shuffles + stats.mistakes === 0 ? '✦ 独立拾词' : `提示 ${stats.hints} · 重排 ${stats.shuffles} · 拼错 ${stats.mistakes}`, viewportWidth / 2, top + 344, 12, '#819575', 600, 'center'); }
    const words = session.state.game.words, pageSize = 3, rows = words.slice(resultPage * pageSize, (resultPage + 1) * pageSize);
    rounded(24, top + 369, viewportWidth - 48, rows.length * 52 + 18, 22, C.paper, C.line);
    rows.forEach((word, index) => { const y = top + 401 + index * 52; wrap(word.displayWord || word.word, 44, y, (viewportWidth - 95) / 2, 18, C.ink, 1, 750); wrap(word.meaning, viewportWidth / 2 + 8, y, viewportWidth / 2 - 65, 13, C.muted, 1); text('✓', viewportWidth - 45, y, 16, '#8ba474', 700, 'center'); });
    let y = top + 398 + rows.length * 52;
    if (words.length > 3) { button('上一页', 24, y, (viewportWidth - 60) / 2, () => { resultPage--; draw(); }, { h: 44, quiet: true, enabled: resultPage > 0 }); button('下一页', viewportWidth / 2 + 6, y, (viewportWidth - 60) / 2, () => { resultPage++; draw(); }, { h: 44, quiet: true, enabled: (resultPage + 1) * pageSize < words.length }); y += 54; }
    if (session.state.mini) { button('去下一座词岛 →', 24, y, viewportWidth - 48, () => start(() => session.nextMini()), { h: 58, primary: true }); y += 75; }
    const more = session.state.practice && session.state.practice.index + 1 < session.state.practice.batches.length;
    button(more ? '继续本单元 · 下一批 →' : '再练一遍 →', 24, y, viewportWidth - 48, () => start(() => session.replay()), { h: 58, primary: !session.state.mini }); y += 74;
    if (session.state.review.length) { button(`复习 ${session.state.review.length} 个易错词`, 24, y, viewportWidth - 48, () => start(() => session.startReview()), { fill: C.paper }); y += 66; }
    if (session.state.mini || session.state.daily) { button('分享给朋友 · 邀请同题 ↗', 24, y, viewportWidth - 48, share, { quiet: true, h: 44 }); y += 48; }
    button('返回首页', 24, y, viewportWidth - 48, home, { quiet: true, h: 44 }); y += 54;
    maxPageScroll = Math.max(0, y + 12 - (height - bottom));
  }
  function drawLibrary() {
    header('教材练习', () => change('learn')); title('今天练哪一单元？', '核对教材版次，开始一小组练习。');
    const book = selectedBook();
    const fields = [['出版社', catalog?.publishers.find(item => item.id === publisherId)?.name || '读取目录…', 'publisher'], ['年级', grade ? `${grade} 年级` : '综合词表', 'grade'], ['教材与册次', book?.title || '请选择教材', 'book'], ['学习单元', unit || '整册练习', 'unit']];
    fields.forEach(([label, value, kind], i) => { const y = top + 172 + i * 91; text(label, 24, y, 13, '#6d826f'); rounded(24, y + 20, viewportWidth - 48, 54, 15, C.paper, '#d8dfcc'); wrap(value, 39, y + 47, viewportWidth - 100, 14, C.ink, 1); text('⌄', viewportWidth - 45, y + 47, 20, C.muted); if (catalog && !busy) hit(24, y + 20, viewportWidth - 48, 54, () => chooseField(kind), kind); });
    const evidenceY = top + 543;
    rounded(24, evidenceY, viewportWidth - 48, 102, 16, '#e8eedc');
    wrap(book?.verification ? `${book.count} 词 · 已对照原书核验。每批最多 6 词，离线也能练习。` : book ? '历史词表尚未核验版次与单元，仅可整册练习。' : '练习进度自动保存，离线也能练习。', 42, evidenceY + 23, viewportWidth - 84, 12, '#75886e', 2);
    if (book) { text('查看教材来源与词表范围 ↗', 42, evidenceY + 77, 12, '#526e50'); hit(24, evidenceY + 59, viewportWidth - 48, 44, () => change('book-details', 'library'), '教材来源'); }
    button(busy ? '正在读取…' : '开始单元练习 →', 24, top + 671, viewportWidth - 48, () => void beginPractice(), { h: 58, primary: true, enabled: !busy && Boolean(book) });
    button('刷新教材目录', 24, top + 740, viewportWidth - 48, () => void openLibrary(true), { h: 44, quiet: true, enabled: !busy });
    if (message) wrap(message, 24, top + 802, viewportWidth - 48, 13, C.muted, 2);
    maxPageScroll = Math.max(0, top + (message ? 862 : 810) - (height - bottom));
  }
  function drawPicker() {
    header(picker.title, () => change('library', 'learn')); title(picker.title, '点选后返回教材练习。');
    const size = Math.max(1, Math.floor((height - top - bottom - 216) / 83));
    const last = Math.max(0, Math.ceil(picker.options.length / size) - 1); pickerPage = Math.min(pickerPage, last);
    picker.options.slice(pickerPage * size, (pickerPage + 1) * size).forEach((item, i) => card(item.label, item.detail || '', 24, top + 161 + i * 83, viewportWidth - 48, 70, () => { picker.choose(item.value); message = ''; change('library', 'learn'); }));
    button('上一页', 24, height - bottom - 56, (viewportWidth - 61) / 2, () => { pickerPage--; draw(); }, { h: 44, enabled: pickerPage > 0 });
    button('下一页', viewportWidth / 2 + 6, height - bottom - 56, (viewportWidth - 61) / 2, () => { pickerPage++; draw(); }, { h: 44, enabled: pickerPage < last });
  }
  function drawCustom() {
    header('我的词单', () => change('learn')); title('带上你的单词，出发。', '每行一个英文单词和中文含义。');
    text('我的词单', 24, top + 170, 14, C.ink, 650); text('2–8 个单词或短语', viewportWidth - 24, top + 170, 12, '#8b9781', 400, 'right');
    rounded(24, top + 191, viewportWidth - 48, 256, 21, C.paper, '#d9dfcd');
    const lines = customText.split('\n');
    lines.slice(0, 7).forEach((line, i) => wrap(line, 44, top + 224 + i * 31, viewportWidth - 88, 16, C.ink, 1));
    hit(24, top + 191, viewportWidth - 48, 256, editCustom, '编辑词单');
    button('点击编辑', 24, top + 460, (viewportWidth - 61) / 2, editCustom, { h: 44, quiet: true }); button('粘贴词单', viewportWidth / 2 + 6, top + 460, (viewportWidth - 61) / 2, () => void pasteCustom(), { h: 44, quiet: true });
    rounded(24, top + 520, viewportWidth - 48, 94, 18, '#e6edd9'); wrap('英文和中文用空格或逗号分隔。支持短语、撇号和连字符，合计最多 80 个字母和符号。', 43, top + 543, viewportWidth - 86, 13, '#6b8168', 3);
    button('用这组词开始 →', 24, top + 643, viewportWidth - 48, importCustom, { h: 58, primary: true });
    if (message) wrap(message, 24, top + 730, viewportWidth - 48, 13, C.muted, 2);
    maxPageScroll = Math.max(0, top + (message ? 798 : 730) - (height - bottom));
  }
  function drawWords() {
    header('选择中文词义', play); title('先拼哪一个？', '亮色字母完全露出，就可以拾取。');
    const words = session.state.game.words, size = Math.max(1, Math.floor((height - top - bottom - 225) / 87));
    wordPage = Math.min(wordPage, Math.max(0, Math.ceil(words.length / size) - 1));
    words.slice(wordPage * size, (wordPage + 1) * size).forEach((word, index) => {
      const available = !word.done && Boolean(findSpelling(session.state.game, word.id));
      card(word.meaning, word.done ? '已完成 ✓' : available ? '字母已露出 · 可以拾取' : '仍有字母被压住', 24, top + 161 + index * 87, viewportWidth - 48, 74, () => { if (!word.done) { session.choose(word.id); boardScroll = 0; answerScroll = 0; message = available ? '已切换词义。' : '这个词还有字母被压住，先揭开上层。'; play(); } }, word.done ? '#e4e7dd' : C.paper);
    });
    button('上一页', 24, height - bottom - 56, (viewportWidth - 61) / 2, () => { wordPage--; draw(); }, { h: 44, enabled: wordPage > 0 }); button('下一页', viewportWidth / 2 + 6, height - bottom - 56, (viewportWidth - 61) / 2, () => { wordPage++; draw(); }, { h: 44, enabled: (wordPage + 1) * size < words.length });
  }
  function drawLongText(titleText, content, returnPage) {
    header(titleText, () => change(returnPage)); title(titleText);
    ctx.font = '15px sans-serif';
    let line = '', row = 0; const lineHeight = 27;
    for (const char of content) {
      if (char === '\n' || ctx.measureText(line + char).width > viewportWidth - 88 && line) { text(line, 44, top + 149 + row * lineHeight, 15, C.muted); line = ''; row++; }
      if (char !== '\n') line += char;
    }
    if (line) { text(line, 44, top + 149 + row * lineHeight, 15, C.muted); row++; }
    button('返回', 24, top + 178 + row * lineHeight, viewportWidth - 48, () => change(returnPage), { h: 58, primary: true });
    maxPageScroll = Math.max(0, top + 255 + row * lineHeight - (height - bottom));
  }
  function drawHelp() {
    header('拾词指南', () => change(previous)); title('三步，点亮一座岛。', '不计时，不限次数，慢慢来。');
    const help = [['看词义，选目标', '先看中文词义。想换一个目标，点「换词义」查看本局词单。'], ['拾起完全露出的字母', '按拼写顺序点击亮色字母牌。被压住的牌，等上层消失后就能拾起。长棋盘可以上下滑动。'], ['拼对整词，消除一层', '填满答案会自动检查。点答案格可撤销，也能清空、重排或查看提示。长答案可以左右滑动。']];
    help.forEach(([label, detail], i) => { const y = top + 162 + i * 143; rounded(24, y, viewportWidth - 48, 128, 22, C.paper, C.line); rounded(44, y + 22, 29, 29, 10, '#e2eacb'); text(`0${i + 1}`, 59, y + 37, 13, C.ink, 700, 'center'); text(label, 87, y + 32, 16, C.ink, 700); wrap(detail, 87, y + 63, viewportWidth - 130, 13, C.muted, 3); });
    button('知道了，去拾词 →', 24, top + 617, viewportWidth - 48, play, { h: 58, primary: true });
    maxPageScroll = Math.max(0, top + 705 - (height - bottom));
  }
  function drawShare() {
    header('邀请朋友', () => change(previous)); hero(66, top + 67, viewportWidth - 132, 190);
    text('把这座小岛', viewportWidth / 2, top + 290, 25, C.ink, 800, 'center'); text('送给一个朋友。', viewportWidth / 2, top + 329, 25, C.ink, 800, 'center');
    text('同一组单词，各自慢慢发现答案。', viewportWidth / 2, top + 377, 14, C.muted, 400, 'center');
    rounded(24, top + 414, viewportWidth - 48, 76, 17, C.paper, C.line); wrap(shareData?.title || '', 43, top + 440, viewportWidth - 86, 15, C.ink, 1, 650); text('同一座小岛，同样的起点', 43, top + 470, 12, C.muted);
    button('邀请朋友同题 →', 24, top + 519, viewportWidth - 48, nativeShare, { h: 58, primary: true });
    button('复制同题邀请', 24, top + 594, viewportWidth - 48, copyShare, { h: 52 });
    button('返回小岛', 24, top + 660, viewportWidth - 48, () => change(previous), { h: 44, quiet: true });
    if (message) wrap(message, 24, top + 725, viewportWidth - 48, 13, C.muted, 2);
    maxPageScroll = Math.max(0, top + (message ? 792 : 734) - (height - bottom));
  }
  function draw() {
    if (stopped || hidden || page === 'pk' || !width) return;
    viewportWidth = page === 'play' && width > height && width >= 600 ? width : Math.min(width, 430);
    originX = (width - viewportWidth) / 2;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, width, height);
    hits = []; tileTargets = []; boardArea = null;
    ctx.save(); ctx.translate(originX, page === 'play' ? 0 : -pageScroll);
    if (page === 'home') drawHome();
    else if (page === 'islands') drawIslands();
    else if (page === 'free') drawFree();
    else if (page === 'learn') drawLearn();
    else if (page === 'play') drawPlay();
    else if (page === 'pause') drawPause();
    else if (page === 'settings') drawSettings();
    else if (page === 'channel') drawChannel();
    else if (page === 'result') drawResult();
    else if (page === 'library') drawLibrary();
    else if (page === 'picker') drawPicker();
    else if (page === 'custom') drawCustom();
    else if (page === 'words') drawWords();
    else if (page === 'meaning') drawLongText('完整词义', session.activeWord?.meaning || '', 'play');
    else if (page === 'book-details') { const book = selectedBook(); drawLongText('教材来源与词表范围', `${book?.title || ''}\n\n${book?.edition || ''}\n\n${book?.verification?.notes || '此历史词表尚未核验教材单元与版次，仅可整册练习。'}\n\n${book?.source || ''}\n${(book?.verification?.evidence || []).map(item => item.pageUrl || item.url || '').join('\n')}`, 'library'); }
    else if (page === 'help') drawHelp();
    else if (page === 'share') drawShare();
    ctx.restore();
    if (page !== 'play') hits = hits.map(item => ({ ...item, y: item.y - pageScroll }));
    hits = hits.map(item => ({ ...item, x: item.x + originX }));
    const clampedScroll = Math.max(0, Math.min(pageScroll, maxPageScroll));
    if (clampedScroll !== pageScroll) { pageScroll = clampedScroll; draw(); }
  }
  const position = point => ({ x: point.clientX ?? point.x, y: point.clientY ?? point.y, id: point.identifier ?? 0 });
  const contains = (box, point) => box && point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h;
  const hasTouchStart = subscribe('TouchStart', event => {
    if (stopped || hidden || page === 'pk' || event.touches?.length > 1) { gesture = null; return; }
    const point = event.changedTouches?.[0]; if (!point) return;
    const p = position(point); gesture = { ...p, page, startX: p.x, startY: p.y, boardScroll, answerScroll, pageScroll, moved: false };
    pressed = { x: p.x - originX, y: p.y + (page === 'play' ? 0 : pageScroll) }; draw();
  });
  subscribe('TouchMove', event => {
    if (!gesture || hidden || stopped || page !== gesture.page || event.touches?.length > 1) { gesture = null; pressed = null; return; }
    const point = event.changedTouches?.find(point => (point.identifier ?? 0) === gesture.id); if (!point) return;
    const p = position(point), dx = p.x - gesture.startX, dy = p.y - gesture.startY;
    if (Math.hypot(dx, dy) <= 8 && !gesture.moved) return;
    gesture.moved = true; pressed = null;
    const local = { x: gesture.startX - originX, y: gesture.startY };
    if (page === 'play' && contains(boardArea?.answer, local)) answerScroll = Math.max(0, Math.min(boardArea.answer.maxScroll, gesture.answerScroll - dx));
    else if (page === 'play' && contains(boardArea, local)) boardScroll = Math.max(0, Math.min(boardArea.maxScroll, gesture.boardScroll - dy));
    else if (page !== 'play') pageScroll = Math.max(0, Math.min(maxPageScroll, gesture.pageScroll - dy));
    draw();
  });
  subscribe('TouchCancel', () => { gesture = null; pressed = null; draw(); });
  subscribe('TouchEnd', event => {
    if (stopped || hidden || page === 'pk') return;
    const point = event.changedTouches?.[0]; if (!point) return;
    const p = position(point), start = gesture; gesture = null; pressed = null;
    if (hasTouchStart && (!start || start.id !== p.id || start.page !== page || start.moved || Math.hypot(start.startX - p.x, start.startY - p.y) > 12)) { draw(); return; }
    const target = [...hits].reverse().find(item => contains(item, p));
    if (target) { target.action(); draw(); } else draw();
  });
  subscribe('KeyboardInput', event => { if (!stopped && !hidden && page === 'custom' && keyboardOpen) customText = String(event.value || '').slice(0, 5000); });
  subscribe('KeyboardConfirm', event => { if (stopped || hidden || page !== 'custom' || !keyboardOpen) return; customText = String(event.value || '').slice(0, 5000); keyboardOpen = false; safe(() => sdk.hideKeyboard?.({})); message = '词单已更新，核对后开始。'; draw(); });
  subscribe('Hide', () => { if (stopped) return; hidden = true; serial++; busy = false; shareBusy = false; gesture = null; pressed = null; keyboardOpen = false; safe(() => sdk.hideKeyboard?.({})); session.pause(); safe(() => sound?.stop()); });
  subscribe('Show', event => {
    if (stopped) return; hidden = false; gesture = null; pressed = null;
    if (page === 'play') page = 'pause';
    if (page === 'library' && !catalog) message = '教材读取已暂停，点击刷新重试。';
    if (page !== 'pk' && event?.query && Object.keys(event.query).length) acceptInvitation(event.query);
    resize();
  });
  subscribe('WindowResize', resize);
  subscribe('AudioInterruptionBegin', () => safe(() => sound?.stop()));
  subscribe('ShareAppMessage', mainSharePayload);
  if (sdk.channelEntry?.subscribe) subscriptions.push(sdk.channelEntry.subscribe(() => { if (page === 'channel') draw(); }));
  safe(() => { sound = sdk.createInnerAudioContext?.(); if (sound) { sound.src = 'competition-action.wav'; sound.volume = .45; sound.onError?.(() => {}); } });
  safe(() => { art = sdk.createImage?.(); if (art) { art.onload = () => draw(); art.onerror = () => {}; art.src = 'assets/ui/island.png'; } });
  resize();
  let query = {}; safe(() => { query = sdk.getLaunchOptionsSync?.()?.query || {}; }); acceptInvitation(query); draw();
  return {
    canvas,
    get state() { return { page, ...session.state }; },
    getLayout() { return { width, height, originX, top, bottom, page, boardScroll, answerScroll, pageScroll, maxPageScroll,
      board: boardArea && { ...boardArea }, tiles: tileTargets.map(tile => ({ ...tile, x: tile.x + originX })),
      targets: hits.map(({ action, ...target }) => target) }; },
    stop() {
      if (stopped) return; stopped = true; hidden = true; serial++; gesture = null; pressed = null;
      session.pause(); safe(() => sdk.hideKeyboard?.({})); pk?.stop(); pk = null;
      subscriptions.splice(0).forEach(unsubscribe => safe(unsubscribe)); safe(() => sound?.destroy()); library.clear();
      if (art) { art.onload = null; art.onerror = null; }
    },
  };
}
