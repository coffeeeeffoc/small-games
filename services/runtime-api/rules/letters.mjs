import {
  BOARD,
  createGame,
  selectTile,
  submitWord,
  chooseWord,
  clearSelection,
  undoSelection,
  reshuffle,
  findSpelling,
  getAvailableTiles,
  letters,
  isBlocked,
} from '../../../games/local/letters-words2/engine.js';

const entries = [
  ['forest', '森林'],
  ['flower', '花朵'],
  ['leaf', '叶子'],
  ['river', '河流'],
  ['bird', '鸟儿'],
  ['sunshine', '阳光'],
  ['ocean', '海洋'],
  ['wave', '海浪'],
  ['island', '岛屿'],
  ['shell', '贝壳'],
  ['sand', '沙子'],
  ['breeze', '微风'],
  ['planet', '行星'],
  ['moon', '月亮'],
  ['star', '星星'],
  ['space', '太空'],
  ['rocket', '火箭'],
  ['dream', '梦想'],
].map(([word, meaning]) => ({ word, meaning }));
const durationMs = 120_000;
const description =
  '120 秒固定基础词库 18 词，每词仅一次。无提示正确词数优先，其次正确率，再比服务端用时。提示词不计排位正确量；错误提交计入正确率分母。重排、撤回免费；拼出不代表已经掌握。';
function random(state) {
  state.random = (Math.imul(state.random, 1664525) + 1013904223) >>> 0;
  return state.random / 4294967296;
}
function nextBoard(state) {
  state.game = createGame(state.entries.slice(state.batch * 6, state.batch * 6 + 6), () =>
    random(state),
  );
  // Tile identifiers must not disclose the original word spelling through sorted IDs.
  const ids = state.game.tiles.map((_, index) => `tile-${index}`);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  state.game.tiles.forEach((tile, index) => {
    tile.id = ids[index];
  });
  state.hint = null;
}
function initial(seed) {
  let hash = 2166136261;
  for (const char of String(seed)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  const state = {
    random: hash,
    entries: [...entries],
    batch: 0,
    correct: 0,
    cleanCorrect: 0,
    attempts: 0,
    assisted: [],
    elapsedMs: 0,
    finished: false,
    feedback: '同一基础词库 18 词，120 秒；正确词量优先，其次正确率和用时。',
  };
  for (let i = state.entries.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1));
    [state.entries[i], state.entries[j]] = [state.entries[j], state.entries[i]];
  }
  nextBoard(state);
  return state;
}
function view(state) {
  const game = state.game;
  const active = game.words.find((word) => word.id === game.activeWordId);
  // Only relative overlap depth is public: engine insertion order contains word spellings.
  const visible = game.tiles.filter((tile) => !tile.removed).sort((a, b) => a.z - b.z);
  const depths = new Map();
  for (const tile of visible)
    depths.set(
      tile.id,
      1 +
        Math.max(
          0,
          ...visible
            .filter(
              (other) =>
                other.z < tile.z &&
                other.x < tile.x + tile.size &&
                other.x + other.size > tile.x &&
                other.y < tile.y + tile.size &&
                other.y + other.size > tile.y,
            )
            .map((other) => depths.get(other.id)),
        ),
    );
  return {
    kind: 'letters',
    board: { width: BOARD.width, height: game.boardHeight },
    tiles: visible
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((tile) => ({
        id: tile.id,
        char: tile.char,
        x: tile.x,
        y: tile.y,
        size: tile.size,
        z: depths.get(tile.id),
        blocked: isBlocked(tile, game.tiles),
      })),
    selected: [...game.selected],
    activeWordId: game.activeWordId,
    words: game.words.map((word) => ({
      id: word.id,
      meaning: word.meaning,
      done: word.done,
      available: !!findSpelling(game, word.id),
    })),
    meaning: active?.meaning || '本轮完成',
    length: active ? letters(active.word).length : 0,
    correct: state.correct,
    cleanCorrect: state.cleanCorrect,
    attempts: state.attempts,
    total: entries.length,
    assisted: state.assisted.length,
    hint: state.hint,
    elapsedMs: state.elapsedMs,
    durationMs,
    finished: state.finished,
    feedback: state.feedback,
    rules: description,
  };
}
function action(state, input, elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < state.elapsedMs) throw new Error('无效比赛时间');
  if (!input || typeof input.type !== 'string') throw new Error('无效操作');
  if (state.finished) throw new Error('比赛已经结算');
  state.elapsedMs = Math.min(durationMs, elapsedMs);
  if (elapsedMs >= durationMs) {
    state.finished = true;
    state.feedback = '时间到，按服务端已确认的词量结算。';
    return;
  }
  const game = state.game;
  const active = game.words.find((word) => word.id === game.activeWordId);
  switch (input.type) {
    case 'select': {
      const result = selectTile(game, input.tileId);
      if (!['selected', 'deselected'].includes(result.status)) throw new Error('该字母不可选择');
      state.hint = null;
      state.feedback = '按顺序选字母，填满后检查。';
      break;
    }
    case 'choose':
      if (!game.words.some((word) => word.id === input.wordId && !word.done))
        throw new Error('该词不可选择');
      chooseWord(game, input.wordId);
      state.hint = null;
      break;
    case 'undo':
      if (!game.selected.length) throw new Error('没有可撤回字母');
      undoSelection(game);
      break;
    case 'clear':
      clearSelection(game);
      break;
    case 'shuffle':
      reshuffle(game, () => random(state));
      state.hint = null;
      break;
    case 'hint': {
      if (!active || !findSpelling(game, active.id))
        throw new Error('当前词尚被遮挡，请先选择可拼词义');
      if (!state.assisted.includes(active.word)) state.assisted.push(active.word);
      const selected = game.selected
        .map((id) => game.tiles.find((tile) => tile.id === id).char)
        .join('');
      if (!letters(active.word).join('').startsWith(selected)) clearSelection(game);
      const next = letters(active.word)[game.selected.length];
      state.hint =
        getAvailableTiles(game).find(
          (tile) => tile.char === next && !game.selected.includes(tile.id),
        )?.id || null;
      state.feedback = '已使用提示：此词可继续练习，但不计排位正确词量。';
      break;
    }
    case 'submit': {
      if (!active || game.selected.length !== letters(active.word).length)
        throw new Error('请先拼完当前单词');
      const result = submitWord(game, () => random(state));
      state.attempts++;
      if (result.status !== 'correct') {
        state.feedback = '拼写不正确，可以撤回修改。';
        break;
      }
      state.correct++;
      if (!state.assisted.includes(result.word.word)) state.cleanCorrect++;
      state.feedback = '服务端已确认拼写正确。';
      state.hint = null;
      if (result.won && state.correct < entries.length) {
        state.batch++;
        nextBoard(state);
      }
      if (state.correct === entries.length) state.finished = true;
      break;
    }
    case 'finish':
      state.finished = true;
      break;
    default:
      throw new Error('未知操作');
  }
}
function result(state) {
  const accuracy = state.attempts ? Math.floor((state.cleanCorrect / state.attempts) * 10_000) : 0;
  return {
    finished: state.finished,
    eligible: state.finished && state.cleanCorrect > 0,
    score: state.cleanCorrect * 1_000_000 + accuracy,
    secondary: state.elapsedMs,
    correct: state.cleanCorrect,
    accuracy,
    assisted: state.assisted.length,
  };
}
export default {
  id: 'letters-words2',
  title: '词屿 · 基础词库 120 秒',
  version: 'basic-18-v1',
  durationMs,
  description,
  initial,
  view,
  action,
  result,
};
