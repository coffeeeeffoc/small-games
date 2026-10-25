import { createGame, applyUpgrade, FIELD, LEVELS } from './core.mjs';
import { LEGACY_LEVELS } from './levels.mjs';

function contentKey(level) {
  let hash = 2166136261;
  for (const char of JSON.stringify(level)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
}
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;

/** Only settled aim/upgrade states can become checkpoints; flying balls stay transient. */
export function checkpoint(game) {
  if (!game || game.practice || !['aim', 'upgrade'].includes(game.phase)) return null;
  return {
    version: 1, levelId: game.levelId, contentKey: contentKey(game.level), phase: game.phase,
    score: game.score, completedTurns: game.completedTurns, ballCount: game.ballCount,
    upgrades: [...game.upgrades], bestCombo: game.bestCombo,
    targets: game.targets.filter((target) => target.hp > 0).map(({ id, hp }) => ({ id, hp })),
  };
}

export function restoreCheckpoint(saved) {
  if (!saved || saved.version !== 1 || !['aim', 'upgrade'].includes(saved.phase)) return null;
  const level = [...LEVELS, ...LEGACY_LEVELS].find((candidate) =>
    candidate.id === saved.levelId && saved.contentKey === contentKey(candidate));
  if (!level) return null;
  if (!integer(saved.completedTurns, 0, 1000) || !integer(saved.score, 0, 1000000000)
    || !integer(saved.bestCombo, 0, 1000000) || !integer(saved.ballCount, level.balls, 32)) return null;
  const completed = saved.completedTurns;
  const earnedUpgrades = level.upgradeTurns.filter((turn) => turn <= completed).length;
  const pending = saved.phase === 'upgrade';
  if ((pending && !level.upgradeTurns.includes(completed)) || !Array.isArray(saved.upgrades)
    || saved.upgrades.length !== earnedUpgrades - Number(pending)) return null;
  const game = createGame(level);
  for (const id of saved.upgrades) {
    game.phase = 'upgrade';
    if (!applyUpgrade(game, id)) return null;
  }
  const waveIndex = Math.min(level.initialRows + completed, level.waves.length);
  const available = new Map();
  let spawnedTargets = 0;
  let pickups = 0;
  for (let row = 0; row < waveIndex; row += 1) {
    const age = row < level.initialRows ? level.initialRows - row - 1 + completed
      : completed - (row - level.initialRows + 1);
    for (const [index, target] of level.waves[row].targets.entries()) {
      const id = `${level.id}:${row}:${index}`;
      available.set(id, { ...target, id, y: 518 - age * FIELD.rowStep, maxHp: target.hp, hit: 0, rotation: target.rotation || 0 });
      if (target.kind === 'pickup') pickups += 1;
      else spawnedTargets += 1;
    }
  }
  if (!Array.isArray(saved.targets) || saved.targets.length > available.size
    || saved.ballCount < game.ballCount || saved.ballCount > Math.min(32, game.ballCount + pickups)) return null;
  const targets = [], seen = new Set();
  for (const item of saved.targets) {
    const target = available.get(item?.id);
    if (!target || seen.has(item.id) || !integer(item.hp, 1, target.maxHp)
      || target.y - target.r <= FIELD.deadline) return null;
    seen.add(item.id);
    targets.push({ ...target, hp: item.hp });
  }
  // A completed level belongs to settlement, never to a resumable aim state.
  if (waveIndex === level.waves.length && targets.every((target) => target.kind === 'pickup')) return null;
  Object.assign(game, {
    phase: saved.phase, score: saved.score, completedTurns: completed, turn: completed + 1,
    ballCount: saved.ballCount, bestCombo: saved.bestCombo, waveIndex, targets,
    destroyed: spawnedTargets - targets.filter((target) => target.kind !== 'pickup').length,
    events: [],
  });
  return game;
}
