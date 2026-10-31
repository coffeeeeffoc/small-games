import { Game } from './engine.js';
import { LEVELS, levelConfig, prepareLevel } from './campaign.js';

export const RANKED_RULE_VERSION = 'tetracube-20261031-1';
export const STEP_HZ = 120;

export function createRun(mode = 'endless', seed = 1, levelId) {
  const level = mode === 'campaign' ? LEVELS.find((item) => item.id === levelId) : null;
  if (
    !['campaign', 'endless'].includes(mode) ||
    (mode === 'campaign' && !level) ||
    (mode === 'endless' && levelId !== undefined)
  )
    throw new Error('Unknown challenge');
  const game = new Game({ ...(level ? { config: levelConfig(level) } : {}), seed });
  if (level) prepareLevel(game, level);
  game.drainEvents();
  return {
    mode,
    levelId: level?.id,
    game,
    ticks: 0,
    steps: 0,
    fallTicks: 0,
    status: 'playing',
    assisted: false,
  };
}

export function checkRun(run) {
  const level = LEVELS.find((item) => item.id === run.levelId);
  if (level && run.game.lines >= level.targetLines) run.status = 'won';
  else if (run.game.status !== 'playing' || (level && run.game.placed >= level.pieceLimit))
    run.status = 'lost';
  return run.status;
}

export function applyInput(run, input) {
  if (
    !input ||
    Array.isArray(input) ||
    typeof input !== 'object' ||
    Object.keys(input).some(
      (key) => !['action', 'axis', 'direction', 'plane', 'turn'].includes(key),
    )
  )
    throw new Error('Invalid input');
  if (!Object.keys(input).length) return false;
  if (run.status !== 'playing') throw new Error('Run ended');
  const { action } = input;
  const allowed = {
    move: ['action', 'axis', 'direction'],
    rotate: ['action', 'plane', 'direction'],
    drop: ['action'],
    hold: ['action'],
    flip: ['action', 'turn'],
    end: ['action'],
  }[action];
  if (!allowed || Object.keys(input).some((key) => !allowed.includes(key)))
    throw new Error('Invalid action');
  if ((action === 'move' || action === 'rotate') && ![-1, 1].includes(input.direction))
    throw new Error('Invalid direction');
  if (action === 'move' && ![0, 1].includes(input.axis)) throw new Error('Invalid movement axis');
  if (action === 'rotate' && !['XY', 'XZ', 'YZ'].includes(input.plane))
    throw new Error('Invalid rotation plane');
  if (action === 'flip' && !['left', 'right', 'invert'].includes(input.turn))
    throw new Error('Invalid container turn');
  const level = LEVELS.find((item) => item.id === run.levelId);
  if (action === 'flip' && level && run.game.flipCount >= level.maxFlips) return false;
  const ok =
    action === 'move'
      ? run.game.move(input.axis, input.direction)
      : action === 'rotate'
        ? run.game.rotate(input.plane, input.direction)
        : action === 'drop'
          ? run.game.hardDrop()
          : action === 'hold'
            ? run.game.hold()
            : action === 'flip'
              ? run.game.flipContainer(input.turn)
              : (run.game.end(), true);
  if (ok) run.steps++;
  if (ok && action === 'flip' && input.turn === 'invert') run.assisted = true;
  if (ok && (action === 'drop' || action === 'flip')) run.fallTicks = 0;
  checkRun(run);
  return ok;
}

export function advanceTicks(run, ticks) {
  if (!Number.isSafeInteger(ticks) || ticks < 0 || ticks > 2400) throw new Error('Invalid ticks');
  for (let i = 0; i < ticks; i++) {
    if (run.status !== 'playing') throw new Error('Run ended');
    run.ticks++;
    run.fallTicks++;
    if (run.fallTicks * 1000 >= run.game.fallInterval * STEP_HZ) {
      run.fallTicks = 0;
      run.game.tick();
      checkRun(run);
    }
  }
}

export function snapshotRun(run) {
  return { ...run, game: run.game.getSnapshot() };
}

export function restoreRun(value) {
  if (
    !value ||
    !Number.isSafeInteger(value.ticks) ||
    value.ticks < 0 ||
    !Number.isSafeInteger(value.steps) ||
    value.steps < 0 ||
    !Number.isSafeInteger(value.fallTicks) ||
    value.fallTicks < 0 ||
    !['playing', 'won', 'lost'].includes(value.status) ||
    typeof value.assisted !== 'boolean'
  )
    throw new Error('Invalid run save');
  const run = createRun(value.mode, 1, value.levelId);
  run.game.restore(value.game);
  run.ticks = value.ticks;
  run.steps = value.steps;
  run.fallTicks = value.fallTicks;
  run.assisted = value.assisted;
  checkRun(run);
  if (run.status !== value.status) throw new Error('Invalid run status');
  return run;
}

export function runResult(run) {
  const level = LEVELS.find((item) => item.id === run.levelId);
  return {
    complete: run.status !== 'playing',
    eligible: !run.assisted && (level ? run.status === 'won' : run.status === 'lost'),
    score: level ? (run.status === 'won' ? level.index + 1 : 0) : run.game.score,
    secondary: run.steps,
    elapsedMs: Math.round((run.ticks * 1000) / STEP_HZ),
    stars:
      run.status === 'won'
        ? 1 +
          Number(run.game.placed <= level.parPieces && !run.assisted) +
          Number(run.ticks <= level.parSeconds * STEP_HZ && !run.assisted)
        : 0,
  };
}
