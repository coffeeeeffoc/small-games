import { createGame, parseWordList, chooseWord, selectTile, submitWord, undoSelection, clearSelection, reshuffle, letters, findSpelling } from './engine.js';
import { collections, dailyIsland, miniIsland, seededRandom, validDay } from './challenge.js';

export const RANKED_RULE_VERSION = 'ciyu-input-replay-v1';
const requireInput = ok => { if (!ok) throw new Error('Invalid letters input'); };

export function rankedIsland(board, levelId) {
  if (board === 'daily') {
    requireInput(validDay(levelId));
    return dailyIsland(levelId);
  }
  if (board === 'mini') return miniIsland(levelId);
  requireInput(board === 'islands' && /^[0-7]$/.test(levelId));
  const collection = collections[Number(levelId)];
  return { name: collection.name, entries: parseWordList(collection.text) };
}

export function replayRandom(state, stage) {
  const key = state.board === 'daily' ? `ciyu-v1:${state.levelId}`
    : state.board === 'mini' ? `ciyu-mini-v1:${state.levelId}`
    : `ciyu-ranked-v1:${state.seed}:${state.levelId}`;
  return seededRandom(`${key}:${stage}`);
}

// Textbook entries are resolved from the deployed catalog by the server, never from a request.
export function createLettersReplay(board, seed, levelId, textbookEntries) {
  const entries = board === 'textbook' ? textbookEntries : rankedIsland(board, levelId).entries;
  const state = { board, seed, levelId, assisted: false, shuffles: 0, mistakes: 0, finishedAt: null };
  return { ...state, game: createGame(entries, replayRandom(state, 'board')) };
}

export function applyLettersReplay(state, frames, context) {
  for (const { input, ticks } of frames) {
    requireInput(ticks === 0 && state.game.completed < state.game.words.length);
    requireInput(input && typeof input === 'object' && !Array.isArray(input) &&
      Object.keys(input).length === 2 && Object.hasOwn(input, 'command') && Object.hasOwn(input, 'args'));
    const args = input.args, game = state.game;
    requireInput(Array.isArray(args));
    const none = () => requireInput(args.length === 0);
    switch (input.command) {
      case 'choose':
        requireInput(args.length === 1 && game.words.some(word => !word.done && word.id === args[0]));
        chooseWord(game, args[0]); break;
      case 'select': {
        requireInput(args.length === 1 && typeof args[0] === 'string');
        const result = selectTile(game, args[0]);
        requireInput(['selected', 'deselected', 'blocked', 'full'].includes(result.status));
        break;
      }
      case 'submit': {
        none();
        const result = submitWord(game, replayRandom(state, `clear:${game.completed}`));
        if (result.status === 'incorrect') state.mistakes++;
        if (result.won) {
          requireInput(Number.isSafeInteger(context?.now) && context.now >= context.createdAt);
          state.finishedAt = context.now - context.createdAt;
        }
        break;
      }
      case 'undo': none(); undoSelection(game); break;
      case 'clear': none(); clearSelection(game); break;
      case 'shuffle':
        none(); state.assisted = true; state.shuffles++;
        reshuffle(game, replayRandom(state, `shuffle:${state.shuffles}`)); break;
      case 'hint': {
        none(); requireInput(findSpelling(game, game.activeWordId));
        state.assisted = true;
        const word = game.words.find(item => item.id === game.activeWordId);
        const selected = game.selected.map(id => game.tiles.find(tile => tile.id === id).char).join('');
        if (!letters(word.word).join('').startsWith(selected)) clearSelection(game);
        break;
      }
      case 'guidance': none(); state.assisted = true; clearSelection(game); break;
      default: throw new Error('Unknown letters input');
    }
  }
  return state;
}

export function lettersReplayResult(state) {
  const complete = state.game.completed === state.game.words.length && state.finishedAt !== null;
  return { complete, eligible: complete && !state.assisted,
    score: complete ? state.game.tiles.length : 0, secondary: state.finishedAt ?? 0 };
}
