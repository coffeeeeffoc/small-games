import { validateLevel } from '../content/levels.ts';
import { moveEnemies, projectiles, shoot, skill, spawnWaves } from './combat.ts';
import { clamp } from './geometry.ts';
import { settleTiers, updateFocus } from './rewards.ts';
import { HZ, type GameState, type Input, type Level } from './types.ts';
export function createGame(level: Level, seed = level.seed): GameState {
  validateLevel(level);
  return {
    level: structuredClone(level),
    seed,
    tick: 0,
    phase: 'playing',
    reason: '',
    x: 0,
    members: Array.from({ length: 6 }, (_, id) => ({
      id,
      hp: 20,
      weapon: 'rifle',
      nextShot: id * 2,
    })),
    nextMember: 6,
    shield: 0,
    formation: 'wide',
    focus: null,
    candidate: null,
    focusTicks: 0,
    enemies: [],
    supplies: level.supplies.map((config) => ({
      config: structuredClone(config),
      damage: 0,
      claimed: 0,
      status: 'waiting',
    })),
    projectiles: [],
    effects: [],
    effectId: 0,
    skillReady: 0,
    hasteUntil: 0,
    bossDefeated: false,
    grants: [],
    stats: { kills: 0, rescued: 0, lost: 0, forwardDamage: 0, supplyDamage: 0, shots: 0, score: 0 },
  };
}
export function step(state: GameState, input: Input = {}) {
  if (state.phase !== 'playing') return;
  state.tick++;
  state.effects = state.effects.filter((e) => state.tick - e.tick < 60);
  let delta = 0;
  if (Number.isFinite(input.targetX)) delta = clamp(input.targetX! - state.x, -6 / HZ, 6 / HZ);
  else if (Number.isFinite(input.moveX)) delta = (clamp(input.moveX!, -1, 1) * 6) / HZ;
  state.x = clamp(state.x + delta, -3.65, 3.65);
  if (input.formation && state.level.formation && state.tick >= 46 * HZ)
    state.formation = state.formation === 'wide' ? 'compact' : 'wide';
  for (const supply of state.supplies)
    if (supply.status === 'waiting' && state.tick >= supply.config.start) supply.status = 'active';
  spawnWaves(state);
  updateFocus(state);
  if (input.skill) skill(state);
  shoot(state);
  projectiles(state);
  // Boundary contract: valid attacks -> threshold grants -> expiry, including the deadline tick.
  for (const supply of state.supplies) if (supply.status === 'active') settleTiers(state, supply);
  for (const supply of state.supplies)
    if (supply.status === 'active' && state.tick >= supply.config.end) supply.status = 'expired';
  if (
    state.focus &&
    !state.supplies.some((s) => s.config.id === state.focus && s.status === 'active')
  ) {
    state.focus = null;
    state.candidate = null;
    state.focusTicks = 0;
  }
  moveEnemies(state);
  const alive = state.members.filter((m) => m.hp > 0);
  if (!alive.length) {
    state.phase = 'lost';
    state.reason =
      state.focus || state.candidate
        ? '集火补给期间，敌人突破正面。提前回防或用震荡弹创造窗口。'
        : '小队防线被突破。横移躲预警，优先清理冲刺者。';
  } else if (state.tick >= state.level.duration) {
    state.phase = state.level.bossRequired && !state.bossDefeated ? 'lost' : 'won';
    state.reason =
      state.phase === 'lost'
        ? '撤离时间已到，街口冲撞者仍在阻挡。攻击吊架控制器，争取破甲窗口。'
        : '街口已清空，救援小队完成撤离。';
    if (state.phase === 'won')
      state.stats.score +=
        500 + alive.reduce((sum, m) => sum + m.hp, 0) + Math.min(600, state.stats.rescued * 80);
  }
}
export function snapshot(state: GameState) {
  const boss = state.enemies.find((e) => e.kind === 'boss'),
    cycle = boss ? (state.tick - boss.born) % 210 : 0;
  const bossWarning =
    boss && ((cycle >= 60 && cycle <= 102) || (cycle >= 140 && cycle <= 182))
      ? { x: boss.aimX, type: cycle < 120 ? 'charge' : 'stomp' }
      : null;
  return {
    tick: state.tick,
    phase: state.phase,
    x: state.x,
    hp: state.members.reduce((n, m) => n + m.hp, 0),
    alive: state.members.filter((m) => m.hp > 0).length,
    focus: state.focus,
    enemies: state.enemies.length,
    bossWarning,
    stats: { ...state.stats },
    supplies: state.supplies.map((s) => ({
      id: s.config.id,
      damage: s.damage,
      claimed: s.claimed,
      status: s.status,
    })),
    grants: structuredClone(state.grants),
  };
}
export function advanceClock(
  clock: { accumulator: number },
  elapsedSeconds: number,
  tick: () => void,
) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) return;
  clock.accumulator += elapsedSeconds;
  while (clock.accumulator + 1e-9 >= 1 / HZ) {
    tick();
    clock.accumulator -= 1 / HZ;
  }
}
