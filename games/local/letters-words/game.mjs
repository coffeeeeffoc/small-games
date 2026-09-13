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

function validateEntries(entries) {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 12) {
    throw new Error("每局需要 1–12 个单词。");
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
    if (!/[a-z]/.test(word) || !/^[a-z .'-]+$/.test(word) || word.length > 20) {
      throw new Error(
        `${line}：单词须为 1–20 个字符，只能包含英文字母、空格、连字符、句点和撇号。`,
      );
    }
    if (!meaning || [...meaning].length > 40) {
      throw new Error(`${line}：中文含义须为 1–40 个字符。`);
    }
    if (seen.has(word)) throw new Error(`${line}：单词「${word}」重复了。`);
    seen.add(word);
    return { word, meaning };
  });
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
        /^([a-z .'’‘-]+?)\s*(?:\t|[,，]| {2,})\s*(.+)$/i,
      );
      const implicit = line.match(/^([a-z .'’‘-]+)\s+(.+)$/i);
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

export function createGame(entries) {
  const normalized = validateEntries(entries);
  const remaining = new Map();
  for (const { word } of normalized) {
    for (const char of letters(word))
      remaining.set(char, (remaining.get(char) || 0) + 1);
  }
  return {
    entries: normalized,
    remaining,
    completed: new Set(),
    target: 0,
    draft: [],
    moves: 0,
    hints: 0,
  };
}

export function available(game, char) {
  return (
    (game.remaining.get(char) || 0) -
    game.draft.filter((letter) => letter === char).length
  );
}

export function pick(game, char) {
  if (
    game.completed.has(game.target) ||
    game.draft.length >= letters(game.entries[game.target].word).length ||
    available(game, char) <= 0
  )
    return false;
  game.draft.push(char);
  game.moves += 1;
  return true;
}

export function undo(game) {
  return game.draft.pop() !== undefined;
}

export function clearDraft(game) {
  game.draft.length = 0;
}

export function checkAnswer(game) {
  if (game.completed.size === game.entries.length) return "finished";
  const answer = letters(game.entries[game.target].word).join("");
  if (game.draft.length < answer.length) return "incomplete";
  if (game.draft.join("") !== answer) return "incorrect";
  for (const char of game.draft)
    game.remaining.set(char, game.remaining.get(char) - 1);
  game.completed.add(game.target);
  clearDraft(game);
  if (game.completed.size === game.entries.length) return "finished";
  game.target = game.entries.findIndex(
    (_, index) => !game.completed.has(index),
  );
  return "correct";
}

export function selectTarget(game, index) {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= game.entries.length ||
    game.completed.has(index)
  ) {
    return false;
  }
  game.target = index;
  clearDraft(game);
  return true;
}

export function hint(game) {
  if (game.completed.has(game.target)) return undefined;
  const answer = letters(game.entries[game.target].word);
  if (!answer.join("").startsWith(game.draft.join(""))) clearDraft(game);
  if (game.draft.length === answer.length) return undefined;
  game.hints += 1;
  return answer[game.draft.length];
}
