export const DEFAULT_WORD_SETS = [
  [
    { word: "apple", meaning: "苹果" },
    { word: "banana", meaning: "香蕉" },
    { word: "cherry", meaning: "樱桃" },
    { word: "lemon", meaning: "柠檬" },
    { word: "peach", meaning: "桃子" },
    { word: "grape", meaning: "葡萄" },
  ],
  [
    { word: "rabbit", meaning: "兔子" },
    { word: "panda", meaning: "熊猫" },
    { word: "tiger", meaning: "老虎" },
    { word: "kitten", meaning: "小猫" },
    { word: "puppy", meaning: "小狗" },
    { word: "sheep", meaning: "绵羊" },
  ],
  [
    { word: "flower", meaning: "花朵" },
    { word: "forest", meaning: "森林" },
    { word: "river", meaning: "河流" },
    { word: "cloud", meaning: "云朵" },
    { word: "sunny", meaning: "晴朗的" },
    { word: "breeze", meaning: "微风" },
  ],
  [
    { word: "hello", meaning: "你好" },
    { word: "thank you", meaning: "谢谢" },
    { word: "let's", meaning: "让我们" },
    { word: "t-shirt", meaning: "短袖T恤" },
    { word: "ice cream", meaning: "冰淇淋" },
    { word: "goodbye", meaning: "再见" },
  ],
];

export function randomWords(random = Math.random) {
  return DEFAULT_WORD_SETS[Math.floor(random() * DEFAULT_WORD_SETS.length)].map(
    (entry) => ({ ...entry }),
  );
}

export function validateEntries(entries) {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 12) {
    throw new Error('每局需要 1–12 个单词。');
  }
  const seen = new Set();
  return entries.map((entry, index) => {
    const word =
      typeof entry?.word === "string"
        ? entry.word.trim().toLowerCase().replace(/[’‘]/g, "'")
        : "";
    const meaning =
      typeof entry?.meaning === "string" ? entry.meaning.trim() : "";
    const line = `第 ${index + 1} 个词条`;
    if (!/[a-z]/.test(word) || !/^[a-z0-9 .\-'!?()/=…⋯]+$/.test(word) || word.length > 80) {
      throw new Error(
        `${line}：单词须为 1–80 个字符，包含英文字母，可使用数字、空格和常见标点。`,
      );
    }
    if (!meaning || [...meaning].length > 512) {
      throw new Error(`${line}：中文含义须为 1–512 个字符。`);
    }
    if (seen.has(word)) throw new Error(`${line}：单词「${word}」重复了。`);
    seen.add(word);
    return { word, meaning };
  });
}

export function formatWords(entries) {
  return entries.map(({ word, meaning }) => `${word}\t${meaning.replace(/\s+/g, ' ').trim()}`).join('\n');
}

export function parseWords(text) {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) throw new Error("请输入单词和中文含义，每行一个词条。");
  return validateEntries(
    lines.map((line, index) => {
      const explicit = line.match(
        /^([a-z0-9 .'’‘!?()/=…⋯-]+?)\s*(?:\t|[,，]| {2,})\s*(.+)$/i,
      );
      const implicit = line.match(/^([a-z0-9 .'’‘!?()/=…⋯-]+)\s+(.+)$/i);
      const match = explicit || implicit;
      if (!match)
        throw new Error(`第 ${index + 1} 行格式不正确，请输入「apple 苹果」。`);
      return { word: match[1], meaning: match[2] };
    }),
  );
}

export function letters(word) {
  return [...word.toLowerCase().replace(/[’‘]/g, "'")].filter(
    (char) => char !== " ",
  );
}

export function shuffled(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function createGame(entries, { overlap = false, ordered = true } = {}, random = Math.random) {
  const normalized = validateEntries(entries);
  const remaining = new Map();
  for (const { word } of normalized) {
    for (const char of letters(word))
      remaining.set(char, (remaining.get(char) || 0) + 1);
  }
  const game = {
    entries: normalized,
    remaining,
    completed: new Set(),
    target: 0,
    draft: [],
    moves: 0,
    hints: 0,
    overlap,
    ordered,
    selected: [],
    tiles: [],
  };
  if (overlap) {
    if ([...remaining.values()].reduce((sum, n) => sum + n, 0) > 80)
      throw new Error('重叠棋盘每批最多 80 块字母，请拆成更小的批次。');
    game.tiles = normalized.flatMap(({ word }) => letters(word)).map((char, id) =>
      ({ id, char, removed: false, x: 0, y: 0, z: 0, size: 60 }));
    reshuffle(game, random);
  }
  return game;
}

export function available(game, char) {
  if (game.overlap) return game.tiles.filter(tile => tile.char === char && !tile.removed
    && !game.selected.includes(tile.id) && !isBlocked(tile, game.tiles)).length;
  return (
    (game.remaining.get(char) || 0) -
    game.draft.filter((letter) => letter === char).length
  );
}

export function pick(game, char, tileId) {
  if (
    game.completed.has(game.target) ||
    game.draft.length >= (game.ordered ? letters(game.entries[game.target].word).length : 80) ||
    available(game, char) <= 0
  )
    return false;
  if (game.overlap) {
    const tile = game.tiles.find(tile => tile.char === char && (tileId === undefined || tile.id === tileId)
      && !tile.removed && !game.selected.includes(tile.id) && !isBlocked(tile, game.tiles));
    if (!tile) return false;
    game.selected.push(tile.id);
  }
  game.draft.push(char);
  game.moves += 1;
  return true;
}

export function undo(game) {
  return removeDraft(game, game.draft.length - 1);
}

export function removeDraft(game, index) {
  if (!Number.isInteger(index) || index < 0 || index >= game.draft.length) return false;
  game.draft.splice(index, 1);
  game.selected.splice(index, 1);
  return true;
}

export function clearDraft(game) {
  game.draft.length = 0;
  game.selected.length = 0;
}

export function checkAnswer(game, index = game.target) {
  if (game.completed.size === game.entries.length) return "finished";
  if (!Number.isInteger(index) || !game.entries[index] || game.completed.has(index)
      || (game.ordered && index !== game.target)) return "incorrect";
  const answer = letters(game.entries[index].word).join("");
  if (!game.draft.length || (game.ordered && game.draft.length < answer.length)) return "incomplete";
  if (game.draft.join("") !== answer) return "incorrect";
  if (game.overlap) {
    if (game.selected.length !== game.draft.length || new Set(game.selected).size !== game.selected.length
        || game.selected.some((id, i) => !game.tiles[id] || game.tiles[id].removed
          || game.tiles[id].char !== game.draft[i] || isBlocked(game.tiles[id], game.tiles))) return "incorrect";
    game.selected.forEach(id => { game.tiles[id].removed = true; });
  }
  for (const char of game.draft)
    game.remaining.set(char, game.remaining.get(char) - 1);
  game.completed.add(index);
  clearDraft(game);
  if (game.completed.size === game.entries.length) return "finished";
  game.target = game.entries.findIndex(
    (_, index) => !game.completed.has(index),
  );
  if (game.overlap && game.ordered && !canSpell(game, game.target)) reshuffle(game);
  return "correct";
}

export function hint(game) {
  if (!game.ordered) return undefined;
  if (game.completed.has(game.target)) return undefined;
  const answer = letters(game.entries[game.target].word);
  if (!answer.join("").startsWith(game.draft.join(""))) clearDraft(game);
  if (game.draft.length === answer.length) return undefined;
  game.hints += 1;
  return answer[game.draft.length];
}

export function isBlocked(tile, tiles) {
  // ponytail: at most 80 tiles per batch; use spatial indexing only for larger boards.
  return !tile.removed && tiles.some(other => !other.removed && other.z > tile.z
    && other.x < tile.x + tile.size && other.x + other.size > tile.x
    && other.y < tile.y + tile.size && other.y + other.size > tile.y);
}

export function canSpell(game, index) {
  const stock = new Map();
  for (const tile of game.tiles.filter(tile => !tile.removed && !isBlocked(tile, game.tiles)))
    stock.set(tile.char, (stock.get(tile.char) || 0) + 1);
  return letters(game.entries[index].word).every(char => {
    const count = stock.get(char) || 0;
    stock.set(char, count - 1);
    return count > 0;
  });
}

export function reshuffle(game, random = Math.random) {
  clearDraft(game);
  const pool = game.tiles.filter(tile => !tile.removed);
  const indices = game.entries.map((_, i) => i).filter(i => !game.completed.has(i));
  const order = game.ordered ? indices.reverse() : shuffled(indices, random);
  const slotsCount = Math.max(15, ...indices.map(i => letters(game.entries[i].word).length));
  game.boardHeight = Math.ceil(slotsCount / 5) * 68 + 22;
  let z = 0;
  for (const index of order) {
    const slots = shuffled(Array.from({ length: slotsCount }, (_, i) => i), random);
    const offsetX = random() * 12;
    const offsetY = random() * 12;
    letters(game.entries[index].word).forEach((char, i) => {
      const tileIndex = pool.findIndex(tile => tile.char === char);
      if (tileIndex < 0) throw new Error('棋盘字母不完整，请重新开始。');
      const [tile] = pool.splice(tileIndex, 1);
      Object.assign(tile, { x: 4 + slots[i] % 5 * 68 + offsetX,
        y: 4 + Math.floor(slots[i] / 5) * 68 + offsetY, z: z++ });
    });
  }
}
