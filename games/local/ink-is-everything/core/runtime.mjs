import { clamp } from './math.mjs';
import { normalizeDefinition, getRoom } from './definition.mjs';
import { advanceEffects, notice } from './events.mjs';
import { playerActions } from './player.mjs';
import { advanceEnemy } from './enemies.mjs';
import { advanceProjectiles } from './combat.mjs';
import { collectPickups } from './pickups.mjs';
import { loadRoom, advanceWorld } from './world.mjs';
import { runCommand } from './commands.mjs';

export function createGame(input) {
  const definition = normalizeDefinition(input);
  const state = {
    version: 3,
    definition,
    levelId: definition.id,
    status: 'ready',
    roomId: definition.start,
    serial: 0,
    time: 0,
    seals: 0,
    progression: { level: 1, xp: 0, nextXp: definition.progression.baseNextXp },
    equipment: {},
    pendingRewards: [],
    player: {
      ...definition.spawn,
      ink: definition.initial.ink,
      maxInk: definition.initial.maxInk,
      r: definition.rules.playerRadius ?? 17,
      aimX: 1,
      aimY: 0,
      dashCd: 0,
      dashTimer: 0,
      dashX: 1,
      dashY: 0,
      meleeCd: 0,
      shootCd: 0,
      novaCd: 0,
      invuln: 0,
    },
    enemies: [],
    projectiles: [],
    pickups: [],
    effects: [],
    log: [],
    message: '',
    messageTimer: 0,
    transitionCd: 0,
    rooms: Object.fromEntries(
      definition.rooms.map((room) => [
        room.id,
        {
          ...structuredClone(room),
          visited: false,
          cleared: !room.enemySpawns.length && !room.waves.length,
          rewardClaimed: false,
          waveIndex: 0,
          waveTimer: 0,
          enemies: [],
          pickups: [],
        },
      ]),
    ),
    stats: {
      spent: { attack: 0, nova: 0, explore: 0, trade: 0 },
      shots: 0,
      hits: 0,
      projectileHits: 0,
      damageDealt: 0,
      freeAttacks: 0,
      dashes: 0,
      enemiesDefeated: 0,
      inkRecovered: 0,
      damageTaken: 0,
      roomsVisited: 0,
      trades: 0,
      bridgesDrawn: 0,
      drawn: 0,
      kills: 0,
      inkSpent: 0,
      lifeStolen: 0,
      killRestored: 0,
      reclaimed: 0,
      spilled: 0,
      expiredInk: 0,
      skillsUsed: 0,
      novas: 0,
      equipmentFound: 0,
      levelsGained: 0,
      rewardsOffered: 0,
      rewardsChosen: 0,
    },
  };
  loadRoom(state, definition.start, definition.spawn);
  return state;
}
export function command(state, action = {}) {
  if (action.type === 'restart') {
    const fresh = createGame(action.definition ?? state.definition);
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, fresh, { status: 'playing' });
    return { ok: true, message: '重新出发' };
  }
  if (action.type === 'start') {
    if (state.status !== 'ready') return { ok: false, message: '冒险已经开始' };
    state.status = 'playing';
    return { ok: true, message: state.definition.description };
  }
  return runCommand(state, action);
}
export function step(state, input = {}, duration = 1 / 60) {
  if (state.status !== 'playing' || state.pendingRewards.length) return state;
  if (state.player.ink <= 0) {
    state.status = 'lost';
    return state;
  }
  const dt = clamp(Number(duration) || 0, 0, 0.05);
  if (!dt) return state;
  state.time += dt;
  advanceEffects(state, dt);
  playerActions(state, input, dt);
  if (state.pendingRewards.length) return state;
  for (const enemy of state.enemies) advanceEnemy(state, enemy, dt);
  advanceProjectiles(state, dt);
  if (state.status !== 'playing' || state.pendingRewards.length) return state;
  // Collect first so remaining-room references cannot be mixed by a portal transition.
  collectPickups(state, dt);
  if (state.pendingRewards.length) return state;
  advanceWorld(state, dt);
  return state;
}
export const getSnapshot = (state) => structuredClone(state);
export { getRoom };
