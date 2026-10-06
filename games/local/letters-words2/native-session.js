import {
  createGame, restoreProgress, validateEntries, parseWordList, letters, findSpelling,
  chooseWord, selectTile, submitWord, undoSelection, clearSelection, reshuffle,
  getAvailableTiles,
} from './engine.js';
import { collections, miniIslands, miniIsland, dailyIsland, seededRandom, validDay } from './challenge.js';
import { practiceBatches } from './library.js';

// The native shell keeps the existing saves and vocabulary; only presentation differs.
export function createNativeSession(storage, { now = Date.now, random = Math.random } = {}) {
  let game, name = '', mini = null, daily = null, practice = null, review = [], hint = null;
  let stats = { hints: 0, shuffles: 0, mistakes: 0 }, lastTheme = -1;
  let elapsedMs = 0, resumedAt = null, storageNotice = '';
  const read = key => { try { return storage.getItem(key); } catch { return null; } };
  const write = (key, value) => {
    try { storage.setItem(key, value); } catch { storageNotice = '本机存储暂不可用，本次仍可继续。'; }
  };
  const rng = stage => daily ? seededRandom(`ciyu-v1:${daily}:${stage}`)
    : mini ? seededRandom(`ciyu-mini-v1:${mini}:${stage}`) : random;
  const active = () => game?.words.find(word => word.id === game.activeWordId);
  const time = () => elapsedMs + (resumedAt === null ? 0 : Math.max(0, now() - resumedAt));
  function pause() {
    elapsedMs = time(); resumedAt = null; save();
  }
  function resume() { if (resumedAt === null) resumedAt = now(); }
  function save() {
    if (!game) return;
    write(mini ? 'ciyu-mini-v1' : daily ? 'ciyu-daily-v1' : 'ciyu-progress', JSON.stringify({
      entries: validateEntries(game.words), completed: game.words.filter(word => word.done).map(word => word.word),
      name, practice, review, elapsedMs: time(), ...(mini ? { mini, dailyStats: stats } : daily ? { challenge: daily, dailyStats: stats } : {}),
      board: { tiles: game.tiles, boardHeight: game.boardHeight, activeWordId: game.activeWordId, selected: game.selected },
    }));
  }
  function restore(record) {
    if (!record) throw new Error('没有存档');
    const restored = restoreProgress(record.entries, record.completed, rng('restore'), record.board);
    if (record.practice) {
      const value = record.practice;
      if (!Array.isArray(value.batches) || value.batches.length > 10000 || !Number.isInteger(value.index)
        || value.index < 0 || value.index >= value.batches.length || !Number.isInteger(value.learned) || value.learned < 0)
        throw new Error('教材进度无效');
      value.batches.forEach(entries => validateEntries(entries));
      if (JSON.stringify(value.batches[value.index]) !== JSON.stringify(record.entries)) throw new Error('教材词单不一致');
    }
    const restoredReview = Array.isArray(record.review) ? record.review : [];
    if (restoredReview.length) practiceBatches(restoredReview);
    game = restored; practice = record.practice || null; review = restoredReview;
    name = typeof record.name === 'string' ? record.name.slice(0, 300) : '继续拾词';
    elapsedMs = Number.isFinite(record.elapsedMs) && record.elapsedMs >= 0 ? record.elapsedMs : 0;
    resumedAt = null; hint = null;
  }
  function freeMode() {
    daily = null; mini = null; stats = { hints: 0, shuffles: 0, mistakes: 0 };
    write('ciyu-active-daily', ''); write('ciyu-active-mini', '');
  }
  function start(entries, title) {
    game = createGame(entries, rng('board')); name = title; hint = null;
    elapsedMs = 0; resumedAt = now(); save();
  }
  function startTheme(index) {
    freeMode(); practice = null; review = [];
    if (!Number.isInteger(index) || !collections[index]) {
      const candidates = collections.map((_, i) => i).filter(i => i !== lastTheme);
      index = candidates[Math.floor(random() * candidates.length)];
    }
    lastTheme = index;
    start(parseWordList(collections[index].text), collections[index].name);
  }
  function startIsland(kind, id, replay = false) {
    const island = kind === 'mini' ? miniIsland(id) : dailyIsland(id);
    pause(); mini = kind === 'mini' ? id : null; daily = kind === 'daily' ? id : null;
    practice = null; review = []; stats = { hints: 0, shuffles: 0, mistakes: 0 };
    write('ciyu-active-mini', mini || ''); write('ciyu-active-daily', daily || '');
    try {
      const record = JSON.parse(read(kind === 'mini' ? 'ciyu-mini-v1' : 'ciyu-daily-v1'));
      if (replay || !record || (mini ? record.mini !== mini : record.challenge !== daily) || record.practice
        || JSON.stringify(record.entries) !== JSON.stringify(island.entries) || !record.dailyStats
        || ['hints', 'shuffles', 'mistakes'].some(key => !Number.isSafeInteger(record.dailyStats[key])
          || record.dailyStats[key] < 0 || record.dailyStats[key] > 1000000)) throw new Error('新词岛');
      stats = record.dailyStats; restore(record); resume();
    } catch { stats = { hints: 0, shuffles: 0, mistakes: 0 }; start(island.entries, island.name); }
  }
  function markReview() {
    const word = active();
    if (word && !review.some(entry => entry.word === word.word)) review.push(validateEntries([word])[0]);
    if (practice) practice.review = review;
  }
  function submit() {
    const result = submitWord(game, rng(`clear:${game.completed}`));
    if (result.status === 'incorrect') { if (mini || daily) stats.mistakes++; markReview(); }
    if (result.status === 'correct') { hint = null; if (result.won) pause(); }
    save(); return result;
  }
  const session = {
    get state() { return { game, name, mini, daily, practice, review, stats, hint, elapsedMs: time(), storageNotice, paused: resumedAt === null }; },
    get activeWord() { return active(); },
    get completed() { return game.completed === game.words.length; },
    get savedCustom() { return read('ciyu-word-list') || 'apple 苹果\nforest 森林\nriver 河流'; },
    readPreference: read,
    savePreference: write,
    save, pause, resume, startTheme,
    startMini(id, replay = false) { startIsland('mini', id, replay); },
    startDaily(day, replay = false) { startIsland('daily', day, replay); },
    leaveIsland() {
      pause(); freeMode();
      try { restore(JSON.parse(read('ciyu-progress'))); } catch { startTheme(); pause(); }
    },
    startPractice(value) {
      freeMode(); practice = value; review = [];
      validateEntries(practice.batches[practice.index]); start(practice.batches[practice.index], practice.name);
    },
    importWords(text) {
      const entries = parseWordList(text); write('ciyu-word-list', text);
      freeMode(); practice = null; review = []; start(entries, '我的单词小岛');
    },
    pick(id) {
      hint = null;
      const result = selectTile(game, id);
      if (result.status !== 'selected' && result.status !== 'deselected') return result;
      save();
      return game.selected.length === letters(active().word).length ? submit() : result;
    },
    choose(id) { chooseWord(game, id); hint = null; save(); },
    undo() { undoSelection(game); hint = null; save(); },
    clear() { clearSelection(game); hint = null; save(); },
    shuffle() {
      if (mini || daily) stats.shuffles++;
      reshuffle(game, rng(`shuffle:${stats.shuffles}`)); hint = null; save();
    },
    hint() {
      const word = active();
      if (!word || !findSpelling(game, word.id)) return null;
      if (mini || daily) stats.hints++;
      markReview();
      const spelling = letters(word.word).join('');
      const selected = game.selected.map(id => game.tiles.find(tile => tile.id === id).char).join('');
      if (!spelling.startsWith(selected)) clearSelection(game);
      const next = letters(word.word)[game.selected.length];
      hint = getAvailableTiles(game).sort((a, b) => b.z - a.z).find(tile => tile.char === next && !game.selected.includes(tile.id))?.id || null;
      save(); return hint;
    },
    submit,
    replay() {
      if (mini) return startIsland('mini', mini, true);
      if (daily) return startIsland('daily', daily, true);
      if (!practice) return startTheme();
      if (practice.index + 1 < practice.batches.length) { practice.learned += game.words.length; practice.index++; }
      else { practice.index = 0; practice.learned = 0; review = []; practice.review = review; }
      start(practice.batches[practice.index], practice.name);
    },
    nextMini() { session.startMini(miniIslands[(miniIslands.findIndex(island => island.id === mini) + 1) % miniIslands.length].id, true); },
    startReview() {
      const entries = review.slice();
      if (!entries.length) return false;
      freeMode(); practice = { batches: practiceBatches(entries), index: 0, learned: 0, name: '提示 / 易错词复习', review: [] };
      review = []; start(practice.batches[0], practice.name); return true;
    },
  };
  const savedMini = read('ciyu-active-mini'), savedDaily = read('ciyu-active-daily');
  if (miniIslands.some(island => island.id === savedMini)) startIsland('mini', savedMini);
  else if (validDay(savedDaily)) startIsland('daily', savedDaily);
  else {
    freeMode();
    try { restore(JSON.parse(read('ciyu-progress'))); } catch { startTheme(); }
  }
  pause();
  return session;
}
