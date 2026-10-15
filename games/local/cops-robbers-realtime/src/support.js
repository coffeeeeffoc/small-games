export const SPRINT_SECONDS = 4;
export const SPRINT_MULTIPLIER = 1.2;
export const REWIND_SECONDS = 5;
export const starterRuns = (value) => Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 6) : 0;
const clone = (value) => JSON.parse(JSON.stringify(value));
const actors = (game) => game.playerRole === 'robber' ? game.robbers : game.cops;
const failed = (game) => game.phase === (game.playerRole === 'robber' ? 'won' : 'lost');

export function startSupport(game, started) {
  if (game.level.id === 0 || game.support) return starterRuns(started);
  const ordinal = Math.min(starterRuns(started) + 1, 6);
  game.support = { sprint: ordinal <= 5 ? 1 : 0, rewind: ordinal <= 5 ? 1 : 0,
    refilled: { sprint: false, rewind: false }, assisted: false, ordinal, history: [] };
  recordCheckpoint(game);
  return ordinal;
}

export function recordCheckpoint(game) {
  const history = game.support?.history;
  if (!history || !['ready', 'playing'].includes(game.phase)) return;
  if (history.length && game.time - history[history.length - 1].time < 0.1 - 1e-7) return;
  history.push(clone({ time: game.time, cops: game.cops, robbers: game.robbers,
    aiRethink: game.aiRethink, aiTarget: game.aiTarget ?? null, seed: game.seed, lastOrder: game.lastOrder }));
  while (history.length > 1 && history[1].time < game.time - REWIND_SECONDS - 0.2) history.shift();
}

export function sprintRemaining(game) {
  return Math.max(0, ...actors(game).map(actor => (actor.sprintUntil || 0) - game.time));
}

export function canRefill(game, kind) {
  const support = game.support;
  if (!support || !['sprint', 'rewind'].includes(kind) || support[kind] !== 0 || support.refilled[kind]) return false;
  return kind === 'rewind' ? failed(game) && support.history.length > 0
    : ['playing', 'paused'].includes(game.phase) && sprintRemaining(game) === 0;
}

export function grantSupport(game, kind, outcome) {
  if (outcome?.status !== 'completed' || !canRefill(game, kind)) return false;
  game.support[kind] = 1;
  game.support.refilled[kind] = true;
  return true;
}

export function useSprint(game, index) {
  const actor = actors(game)[index];
  if (game.phase !== 'playing' || !game.support?.sprint || !actor || actor.caught || actor.escaped ||
      sprintRemaining(game) > 0 || (game.time < game.openingSeconds && game.firstRole !== game.playerRole)) return false;
  game.support.sprint--;
  game.support.assisted = true;
  actor.sprintUntil = game.time + SPRINT_SECONDS;
  return true;
}

export function useRewind(game) {
  if (!failed(game) || !game.support?.rewind || !game.support.history.length) return false;
  const support = game.support, target = Math.max(0, game.time - REWIND_SECONDS);
  let checkpoint = support.history[0];
  for (const item of support.history) if (item.time <= target + 1e-7) checkpoint = item;
  Object.assign(game, clone(checkpoint), { phase: 'playing', events: [] });
  support.history = support.history.filter(item => item.time <= checkpoint.time);
  support.rewind--;
  support.assisted = true;
  return true;
}
