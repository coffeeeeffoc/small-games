import { BOARD, letters, validateEntries, createGame, restoreProgress, parseWordList, isBlocked, getAvailableTiles, findSpelling, chooseWord, selectTile, submitWord, undoSelection, clearSelection, reshuffle } from './engine.js';
import { practiceBatches, setupLibrary } from './library.js';

const $ = id => document.getElementById(id);
const collections = [
  { name: '林间漫游', text: 'forest 森林\nflower 花朵\nleaf 叶子\nriver 河流\nbird 鸟儿\nsunshine 阳光' },
  { name: '海风来信', text: 'ocean 海洋\nwave 海浪\nisland 岛屿\nshell 贝壳\nsand 沙子\nbreeze 微风' },
  { name: '生活碎片', text: "coffee 咖啡\napple 苹果\nbook 书本\nmusic 音乐\ncan't 不能\nsmile 微笑" },
  { name: '漫游宇宙', text: 'planet 行星\nmoon 月亮\nstar 星星\nspace 太空\nrocket 火箭\ndream 梦想' },
  { name: '甜甜日常', text: "ice-cream 冰淇淋\ncake 蛋糕\nhoney 蜂蜜\nlemon 柠檬\npeach 桃子\ndon't 不要" },
];
let game;
let lastCollection = -1;
let pending;
let busy = false;
let audioContext;
let soundEnabled = false;
let hintId = null;
let roundStarted = 0;
let practice = null;
let review = [];
let roundName = '';

function saveProgress() {
  savePreference('ciyu-progress', JSON.stringify({ entries: validateEntries(game.words), completed: game.words.filter(word => word.done).map(word => word.word), name: roundName, practice, review }));
}
function markReview() {
  const word = getActiveWord();
  if (word && !review.some(entry => entry.word === word.word)) review.push(validateEntries([word])[0]);
  if (practice) practice.review = review;
  saveProgress();
}

function readPreference(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function savePreference(key, value) {
  try { localStorage.setItem(key, value); } catch { /* Private browsing can disable storage; the game still works. */ }
}

function playSound(kind = 'pick') {
  if (!soundEnabled) return;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  try {
    audioContext ||= new Audio();
    if (audioContext.state === 'suspended') void audioContext.resume().catch(() => {});
    const notes = kind === 'win' ? [523, 659, 784, 1047] : kind === 'correct' ? [523, 659, 784] : kind === 'error' ? [196, 165] : [440 + (game?.selected.length || 0) * 45];
    notes.forEach((frequency, index) => {
      const time = audioContext.currentTime + index * .09;
      const oscillator = audioContext.createOscillator();
      const volume = audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      volume.gain.setValueAtTime(0, time);
      volume.gain.linearRampToValueAtTime(.06, time + .012);
      volume.gain.exponentialRampToValueAtTime(.001, time + .22);
      oscillator.connect(volume).connect(audioContext.destination);
      oscillator.start(time);
      oscillator.stop(time + .24);
      oscillator.onended = () => { oscillator.disconnect(); volume.disconnect(); };
    });
  } catch { /* Unsupported audio must never interrupt a move. */ }
}

function renderSound() {
  $('sound-button').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4Z"/>${soundEnabled ? '<path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>' : '<path d="m16 9 5 6m0-6-5 6"/>'}</svg>`;
  const label = soundEnabled ? '关闭音效' : '开启音效';
  $('sound-button').setAttribute('aria-label', label);
  $('sound-button').setAttribute('aria-pressed', String(soundEnabled));
  $('sound-button').title = label;
}

function feedback(message, kind = '') {
  $('feedback').textContent = message;
  $('feedback').className = `feedback ${kind}`;
}

function getActiveWord() { return game.words.find(word => word.id === game.activeWordId); }
function selectedText() { return game.selected.map(id => game.tiles.find(tile => tile.id === id).char).join(''); }
function hasPlayableWord() { return game.words.some(word => !word.done && findSpelling(game, word.id)); }

function renderBoard() {
  const focusedTile = document.activeElement?.dataset.tileId;
  const fragment = document.createDocumentFragment();
  for (const tile of game.tiles) {
    if (tile.removed) continue;
    const blocked = isBlocked(tile, game.tiles);
    const selectionIndex = game.selected.indexOf(tile.id);
    const button = document.createElement('button');
    button.className = `tile${blocked ? ' is-blocked' : ''}${selectionIndex >= 0 ? ' is-selected' : ''}${hintId === tile.id ? ' is-hinted' : ''}`;
    button.dataset.tileId = tile.id;
    button.dataset.char = tile.char;
    button.dataset.tone = String(tile.id.slice(5) % 4);
    button.style.left = `${tile.x / BOARD.width * 100}%`;
    button.style.top = `${tile.y / game.boardHeight * 100}%`;
    button.style.width = `${tile.size / BOARD.width * 100}%`;
    button.style.height = `${tile.size / game.boardHeight * 100}%`;
    button.style.zIndex = tile.z;
    button.textContent = tile.char;
    button.setAttribute('aria-label', `${tile.char}，${blocked ? '被遮挡，暂不可取' : selectionIndex >= 0 ? `已选第 ${selectionIndex + 1} 个，点击撤销` : '可以拾取'}`);
    button.setAttribute('aria-disabled', String(blocked));
    button.setAttribute('aria-pressed', String(selectionIndex >= 0));
    button.tabIndex = blocked ? -1 : 0;
    if (selectionIndex >= 0) {
      const index = document.createElement('small');
      index.textContent = selectionIndex + 1;
      index.setAttribute('aria-hidden', 'true');
      button.append(index);
    }
    fragment.append(button);
  }
  $('board').replaceChildren(fragment);
  $('board').style.aspectRatio = `${BOARD.width}/${game.boardHeight}`;
  $('board').classList.toggle('is-complete', game.completed === game.words.length);
  if (focusedTile) $('board').querySelector(`[data-tile-id="${focusedTile}"]`)?.focus({ preventScroll: true });
  const remaining = game.tiles.filter(tile => !tile.removed).length;
  $('board-summary').textContent = `${remaining} 片字母 · ${getAvailableTiles(game).length} 片已露出`;
}

function renderAnswer() {
  const word = getActiveWord();
  const chars = [...selectedText()];
  const fragment = document.createDocumentFragment();
  const answer = word ? letters(word.word) : [];
  for (let i = 0; i < answer.length; i++) {
    const filled = i < chars.length;
    const slot = document.createElement(filled ? 'button' : 'span');
    slot.className = `answer-slot ${filled ? 'filled' : 'empty'}${i === chars.length ? ' next' : ''}`;
    if (filled) {
      slot.textContent = chars[i];
      slot.dataset.selectionIndex = i;
      slot.setAttribute('aria-label', `撤销第 ${i + 1} 个字母 ${chars[i]}`);
    } else slot.setAttribute('aria-label', `第 ${i + 1} 个字母，待选择`);
    fragment.append(slot);
  }
  $('answer-slots').replaceChildren(fragment);
  $('answer-slots').classList.toggle('long', answer.length > 8);
  $('letter-count').textContent = `${chars.length} / ${answer.length}`;
  $('submit-button').disabled = busy || !word || !chars.length;
  $('undo-button').disabled = busy || !chars.length;
  $('clear-button').disabled = busy || !chars.length;
  $('hint-button').disabled = busy || !word;
  $('shuffle-button').disabled = busy || !word;
}

function renderWords() {
  const active = getActiveWord();
  $('current-meaning').textContent = active?.meaning || '全部拾齐';
  const hasSymbols = active && /[^a-z]/.test(active.word);
  $('clue-detail').textContent = active ? `${letters(active.word).length} 个${hasSymbols ? '字符 · 符号要拼，空格自动补齐' : '字母 · 从亮色卡片开始'}` : '这座小岛，已被你点亮';
  $('word-position').textContent = `${String(game.words.indexOf(active) + 1).padStart(2, '0')} / ${String(game.words.length).padStart(2, '0')}`;
  const playable = active && findSpelling(game, active.id);
  document.querySelector('.clue-card').classList.toggle('waiting', !!active && !playable);
  $('clue-state').textContent = !active ? '所有单词都找到了答案' : playable ? '这一词的字母都已露出' : hasPlayableWord() ? '先拼其他词，让下层字母露出来' : '暂时卡住了，重新排列就能继续';
  $('completed-count').textContent = game.completed;
  $('total-count').textContent = ` / ${game.words.length}`;
  $('progress-fill').style.width = `${game.completed / game.words.length * 100}%`;
  const progress = document.querySelector('.progress-track');
  progress.setAttribute('aria-valuemax', game.words.length);
  progress.setAttribute('aria-valuenow', game.completed);
  const fragment = document.createDocumentFragment();
  game.words.forEach((word, index) => {
    const button = document.createElement('button');
    button.className = `word-row${word.done ? ' done' : ''}${word.id === game.activeWordId ? ' active' : ''}`;
    button.dataset.wordId = word.id;
    button.disabled = word.done;
    button.setAttribute('aria-pressed', String(word.id === game.activeWordId));
    button.setAttribute('aria-label', `${word.meaning}，${word.done ? '已完成' : word.id === game.activeWordId ? '当前词义' : '点击切换'}`);
    const number = document.createElement('span');
    number.className = 'word-number';
    number.textContent = word.done ? '✓' : String(index + 1).padStart(2, '0');
    const text = document.createElement('span');
    text.className = 'word-text';
    text.textContent = word.meaning;
    if (word.done) {
      const english = document.createElement('small');
      english.textContent = word.displayWord || word.word;
      text.append(english);
    }
    const status = document.createElement('span');
    status.className = 'word-status';
    status.textContent = word.done ? '完成' : word.id === game.activeWordId ? '正在拼 ↗' : findSpelling(game, word.id) ? '可拼' : '待解锁';
    button.append(number, text, status);
    fragment.append(button);
  });
  $('word-list').replaceChildren(fragment);
  $('study-progress').textContent = practice ? `教材进度 ${practice.learned + game.completed} / ${practice.batches.flat().length} 词 · 第 ${practice.index + 1} / ${practice.batches.length} 岛` : '练习随时保存 · 提示过和拼错的词可在结算复习';
}

function render() { renderBoard(); renderWords(); renderAnswer(); }

function startGame(entries, name) {
  clearTimeout(pending);
  busy = false;
  hintId = null;
  game = createGame(entries);
  roundStarted = performance.now();
  roundName = name;
  $('theme-name').textContent = name;
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  render();
  saveProgress();
  feedback('先看中文词义，再按顺序点击亮色字母。');
}

function randomGame() {
  practice = null;
  review = [];
  const choices = collections.map((_, index) => index).filter(index => index !== lastCollection);
  lastCollection = choices[Math.floor(Math.random() * choices.length)];
  const collection = collections[lastCollection];
  startGame(parseWordList(collection.text), collection.name);
}

function showWin() {
  const minutes = Math.max(1, Math.ceil((performance.now() - roundStarted) / 60000));
  $('win-summary').textContent = `${game.words.length} 个单词，${game.tiles.length} 片字母。${minutes} 分钟的小小收获。`;
  if (practice) $('win-summary').textContent += ` 教材已完成 ${practice.learned + game.completed} / ${practice.batches.flat().length} 词。`;
  $('play-again-button').textContent = practice && practice.index + 1 < practice.batches.length ? '继续本单元 · 下一座词岛 →' : practice ? '本次教材练习完成 · 再练一遍' : '再去下一座词岛 →';
  $('review-button').hidden = !review.length;
  $('review-button').textContent = `再练 ${review.length} 个提示 / 易错词`;
  $('win-words').replaceChildren(...game.words.map(word => {
    const span = document.createElement('span');
    span.textContent = `${word.displayWord || word.word} · ${word.meaning}`;
    return span;
  }));
  // A modal opened by the player takes precedence over the delayed celebration.
  if (!document.querySelector('dialog[open]')) $('win-dialog').showModal();
}

function checkSpelling() {
  if (busy || !getActiveWord()) return;
  const picked = [...game.selected];
  const result = submitWord(game);
  if (result.status === 'incomplete') {
    feedback('还差几个字母，完整拼出单词再检查。');
    return;
  }
  if (result.status === 'incorrect') {
    markReview();
    feedback('还不是这个单词。可以点击答案格修改，或撤回再试。', 'error');
    $('answer-slots').classList.remove('is-shaking');
    void $('answer-slots').offsetWidth;
    $('answer-slots').classList.add('is-shaking');
    playSound('error');
    return;
  }
  busy = true;
  saveProgress();
  hintId = null;
  playSound(result.won ? 'win' : 'correct');
  feedback(`${result.word.displayWord || result.word.word}，${result.word.meaning}。拼对了！`, 'success');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (const id of picked) {
    const tile = $('board').querySelector(`[data-tile-id="${id}"]`);
    tile?.animate([{ opacity: 1 }, { opacity: 0, translate: '0 -14px' }], { duration: reducedMotion ? 0 : 260, fill: 'forwards' });
  }
  $('submit-button').disabled = true;
  pending = setTimeout(() => {
    busy = false;
    render();
    if (result.won) {
      feedback('所有单词都拼对了，棋盘已清空。', 'success');
      showWin();
    } else if (result.rescued) feedback('拼对了！同字母自由取用让余牌互相遮挡，已自动免费整理；已完成的词保留。', 'success');
    else feedback(`${result.word.displayWord || result.word.word} ✓ 已消除。下一词：${getActiveWord().meaning}`, 'success');
  }, reducedMotion ? 0 : 280);
}

function pickTile(id) {
  if (busy) return;
  hintId = null;
  const result = selectTile(game, id);
  if (result.status === 'blocked') {
    feedback('这张卡片还被压住，哪怕只重叠一点，也要先消除上层。', 'error');
    const button = $('board').querySelector(`[data-tile-id="${id}"]`);
    button?.classList.remove('is-shaking');
    if (button) { void button.offsetWidth; button.classList.add('is-shaking'); }
    playSound('error');
    return;
  }
  if (result.status === 'full') { feedback('答案格已满。撤回或点击答案格修改一下。', 'error'); return; }
  if (result.status === 'ignored') return;
  renderBoard();
  renderAnswer();
  playSound();
  feedback(result.status === 'deselected' ? '已撤销这个字母，继续按顺序拼写。' : '选中的卡片留在原位，拼对整词才会一起消除。');
  if (game.selected.length === letters(getActiveWord().word).length) checkSpelling();
}

$('board').addEventListener('click', event => {
  const tile = event.target.closest('[data-tile-id]');
  if (tile) pickTile(tile.dataset.tileId);
});
$('answer-slots').addEventListener('click', event => {
  const slot = event.target.closest('[data-selection-index]');
  if (slot) pickTile(game.selected[Number(slot.dataset.selectionIndex)]);
});
$('word-list').addEventListener('click', event => {
  const row = event.target.closest('[data-word-id]');
  if (busy || !row || row.disabled || row.dataset.wordId === game.activeWordId) return;
  chooseWord(game, row.dataset.wordId);
  hintId = null;
  render();
  feedback(findSpelling(game, game.activeWordId) ? '已切换词义，按顺序拾取字母吧。' : '这词还有字母被压住，可以先拼词单里标记「可拼」的词。');
});
$('submit-button').addEventListener('click', checkSpelling);
$('undo-button').addEventListener('click', () => {
  if (busy || !game.selected.length) return;
  undoSelection(game);
  hintId = null;
  renderBoard(); renderAnswer();
  feedback('已撤回最后一个字母。');
});
$('clear-button').addEventListener('click', () => {
  if (busy) return;
  clearSelection(game);
  hintId = null;
  renderBoard(); renderAnswer();
  feedback('已清空拼写，所有字母都还在原位。');
});
$('shuffle-button').addEventListener('click', () => {
  if (busy || !getActiveWord()) return;
  reshuffle(game);
  hintId = null;
  render();
  feedback('重新排列好了，已完成的单词保留。继续拾词吧。');
  playSound();
});
$('hint-button').addEventListener('click', () => {
  if (busy || !getActiveWord()) return;
  const word = getActiveWord();
  markReview();
  if (!findSpelling(game, word.id)) {
    feedback(hasPlayableWord() ? '这个词的字母还没全部露出，先试试词单里标记「可拼」的词。' : '暂时没有完整可拼的词，点击「重新排列」就能继续。');
    return;
  }
  if (!letters(word.word).join('').startsWith(selectedText())) {
    clearSelection(game);
    feedback('刚才的顺序不太对，已帮你清空。沿着金色边框从头拼吧。');
  } else feedback('金色边框是下一个字母，点击它继续拼。');
  const next = letters(word.word)[game.selected.length];
  hintId = getAvailableTiles(game).sort((a, b) => b.z - a.z).find(tile => tile.char === next && !game.selected.includes(tile.id))?.id || null;
  renderBoard(); renderAnswer();
});
$('new-button').addEventListener('click', randomGame);
$('play-again-button').addEventListener('click', () => {
  if (!practice) return randomGame();
  if (practice.index + 1 < practice.batches.length) { practice.learned += game.words.length; practice.index++; }
  else { practice.index = 0; practice.learned = 0; review = []; practice.review = review; }
  startGame(practice.batches[practice.index], practice.name);
});
$('review-button').addEventListener('click', () => {
  practice = { batches: practiceBatches(review), index: 0, learned: 0, name: '提示 / 易错词复习', review: [] };
  review = [];
  startGame(practice.batches[0], practice.name);
});
$('help-button').addEventListener('click', () => $('help-dialog').showModal());
$('import-button').addEventListener('click', () => {
  $('word-input').value = readPreference('ciyu-word-list') || game.words.map(word => `${word.displayWord || word.word} ${word.meaning}`).join('\n');
  $('import-error').textContent = '';
  $('import-dialog').showModal();
});
$('import-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const entries = parseWordList($('word-input').value);
    savePreference('ciyu-word-list', $('word-input').value);
    practice = null; review = [];
    startGame(entries, '我的单词小岛');
    feedback('你的专属词单已就绪，字母和符号都放进小岛了。');
  } catch (error) {
    $('import-error').textContent = error.message;
  }
});
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
$('sound-button').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  savePreference('ciyu-sound', String(soundEnabled));
  renderSound();
  playSound();
});
document.addEventListener('keydown', event => {
  if (document.querySelector('dialog[open]') || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'Backspace') { event.preventDefault(); $('undo-button').click(); }
  // Enter on focused buttons keeps native keyboard activation.
  if (event.key === 'Enter' && !event.target.closest('button,a,input,textarea')) { event.preventDefault(); checkSpelling(); }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && audioContext?.state === 'running') void audioContext.suspend().catch(() => {});
});

soundEnabled = readPreference('ciyu-sound') === 'true';
renderSound();
setupLibrary(selected => {
  practice = selected;
  review = [];
  startGame(practice.batches[0], practice.name);
});
try {
  const saved = JSON.parse(readPreference('ciyu-progress'));
  if (!saved) throw new Error('No save');
  game = restoreProgress(saved.entries, saved.completed);
  if (saved.practice) {
    const p = saved.practice;
    if (!Array.isArray(p.batches) || p.batches.length > 10000 || !Number.isInteger(p.index) || p.index < 0 || p.index >= p.batches.length
        || !Number.isInteger(p.learned) || p.learned < 0) throw new Error('Invalid practice');
    p.batches.forEach(entries => createGame(entries));
    if (JSON.stringify(p.batches[p.index]) !== JSON.stringify(saved.entries)) throw new Error('Mismatched practice');
  }
  practice = saved.practice || null;
  review = Array.isArray(saved.review) ? saved.review : [];
  if (review.length) practiceBatches(review);
  roundName = typeof saved.name === 'string' ? saved.name.slice(0, 300) : '继续练习';
  $('theme-name').textContent = roundName;
  roundStarted = performance.now();
  render();
  feedback('已恢复上次完成进度，剩余字母重新摆好了。');
  if (game.completed === game.words.length) showWin();
} catch { randomGame(); }
