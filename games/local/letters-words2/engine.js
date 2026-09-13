export const BOARD = Object.freeze({ width: 560, height: 376, tileSize: 64 });

const WORD_PATTERN = /^[a-z0-9!'’+._&@#$%()/:?=-]+$/i;

function validateEntries(entries) {
  if (!Array.isArray(entries) || entries.length < 2 || entries.length > 8) {
    throw new Error('请填写 2–8 个单词，每行一个单词和中文含义。');
  }
  const seen = new Set();
  const normalized = entries.map((entry, index) => {
    const word = typeof entry?.word === 'string' ? entry.word.trim().toLowerCase() : '';
    const meaning = typeof entry?.meaning === 'string' ? entry.meaning.trim() : '';
    if (!WORD_PATTERN.test(word) || !/[a-z]/.test(word)) {
      throw new Error(`第 ${index + 1} 行的单词只支持英文字母、数字和常用符号，如 can't、ice-cream、c++。`);
    }
    if (word.length > 16) throw new Error(`第 ${index + 1} 行的单词最多 16 个字母或符号。`);
    if (!/[\u3400-\u9fff]/u.test(meaning) || meaning.length > 80) {
      throw new Error(`第 ${index + 1} 行请填写中文含义，最多 80 个字。`);
    }
    if (seen.has(word)) throw new Error(`单词「${word}」重复了，请保留一行。`);
    seen.add(word);
    return { word, meaning };
  });
  if (normalized.reduce((total, entry) => total + entry.word.length, 0) > 80) {
    throw new Error('这组单词的字母和符号总数不能超过 80 个，请减少几个单词。');
  }
  return normalized;
}

export function parseWordList(text) {
  if (typeof text !== 'string') throw new Error('请输入单词和中文含义。');
  const entries = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map((line, index) => {
    const spaced = line.match(/^(\S+)\s+(?:[,，=]\s*)?(.+)$/u);
    const match = spaced && WORD_PATTERN.test(spaced[1]) && !spaced[1].endsWith('=')
      ? spaced : line.match(/^([^\s,，=]+)(?:\s*[,，=]\s*|\s+)(.+)$/u);
    if (!match) throw new Error(`第 ${index + 1} 行格式不完整，请按「apple 苹果」填写。`);
    return { word: match[1], meaning: match[2] };
  });
  return validateEntries(entries);
}

function shuffled(items, rng) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function arrangeTiles(game, rng) {
  const pool = game.tiles.filter(tile => !tile.removed);
  let z = 0;
  for (const word of shuffled(game.words.filter(word => !word.done), rng)) {
    const slots = shuffled(Array.from({ length: 18 }, (_, index) => index), rng);
    const offsetX = (rng() - 0.5) * 48;
    const offsetY = (rng() - 0.5) * 42;
    [...word.word].forEach((char, index) => {
      const tileIndex = pool.findIndex(tile => tile.char === char);
      if (tileIndex < 0) throw new Error('棋盘字母不完整，请重新开始。');
      const [tile] = pool.splice(tileIndex, 1);
      const slot = slots[index];
      Object.assign(tile, {
        x: 44 + (slot % 6) * 76 + offsetX + (rng() - 0.5) * 8,
        y: 48 + Math.floor(slot / 6) * 112 + offsetY + (rng() - 0.5) * 8,
        z: z++,
      });
    });
  }
  game.selected = [];
  chooseNextWord(game);
}

export function createGame(entries, rng = Math.random) {
  const words = validateEntries(entries).map((entry, index) => ({ ...entry, id: `word-${index}`, done: false }));
  const tiles = words.flatMap(word => [...word.word].map(char => ({ char })));
  const game = {
    words,
    tiles: tiles.map((tile, index) => ({ ...tile, id: `tile-${index}`, x: 0, y: 0, size: BOARD.tileSize, z: index, removed: false })),
    selected: [],
    activeWordId: null,
    completed: 0,
  };
  arrangeTiles(game, rng);
  return game;
}

export function isBlocked(tile, tiles) {
  // ponytail: quadratic scans are bounded by 80 tiles; use a spatial index for larger boards.
  return !tile.removed && tiles.some(other => !other.removed && other.z > tile.z
    && other.x < tile.x + tile.size && other.x + other.size > tile.x
    && other.y < tile.y + tile.size && other.y + other.size > tile.y);
}

export function getAvailableTiles(game) {
  return game.tiles.filter(tile => !tile.removed && !isBlocked(tile, game.tiles));
}

export function findSpelling(game, wordId) {
  const word = game.words.find(word => word.id === wordId && !word.done);
  if (!word) return null;
  const available = getAvailableTiles(game).sort((a, b) => b.z - a.z);
  const selected = [];
  for (const char of word.word) {
    const index = available.findIndex(tile => tile.char === char);
    if (index < 0) return null;
    selected.push(available.splice(index, 1)[0].id);
  }
  return selected;
}

function chooseNextWord(game) {
  const remaining = game.words.filter(word => !word.done);
  game.activeWordId = (remaining.find(word => findSpelling(game, word.id)) || remaining[0])?.id ?? null;
}

export function chooseWord(game, wordId) {
  if (!game.words.some(word => word.id === wordId && !word.done)) return;
  game.activeWordId = wordId;
  clearSelection(game);
}

export function selectTile(game, tileId) {
  const tile = game.tiles.find(tile => tile.id === tileId && !tile.removed);
  const word = game.words.find(word => word.id === game.activeWordId && !word.done);
  if (!tile || !word) return { status: 'ignored' };
  const selectedIndex = game.selected.indexOf(tileId);
  if (selectedIndex !== -1) {
    game.selected.splice(selectedIndex, 1);
    return { status: 'deselected' };
  }
  if (isBlocked(tile, game.tiles)) return { status: 'blocked' };
  if (game.selected.length >= word.word.length) return { status: 'full' };
  game.selected.push(tileId);
  return { status: 'selected' };
}

export function submitWord(game) {
  const word = game.words.find(word => word.id === game.activeWordId && !word.done);
  if (!word || game.selected.length !== word.word.length) return { status: 'incomplete' };
  const tiles = game.selected.map(id => game.tiles.find(tile => tile.id === id));
  if (new Set(game.selected).size !== tiles.length
    || tiles.some(tile => !tile || tile.removed || isBlocked(tile, game.tiles))
    || tiles.map(tile => tile.char).join('') !== word.word) return { status: 'incorrect' };
  tiles.forEach(tile => { tile.removed = true; });
  word.done = true;
  game.completed++;
  clearSelection(game);
  chooseNextWord(game);
  return { status: 'correct', word, won: game.completed === game.words.length };
}

export function undoSelection(game) {
  return game.selected.pop();
}

export function clearSelection(game) {
  game.selected = [];
}

export function reshuffle(game, rng = Math.random) {
  arrangeTiles(game, rng);
}
