import { createGame } from './runtime.mjs';
import { getRoom } from './definition.mjs';
import { getPlayerStats } from './stats.mjs';
import { blocked } from './geometry.mjs';
import { finite } from './math.mjs';
import { spawnEnemy } from './enemies.mjs';
import { notice } from './events.mjs';

export function serializeGame(state) {
  const snapshot = structuredClone(state);
  delete snapshot.definition;
  // Current-room arrays already live in rooms; retain single ownership in the saved payload.
  delete snapshot.enemies;
  delete snapshot.pickups;
  snapshot.effects = [];
  return JSON.stringify(snapshot);
}
const validNumbers = (item, keys) => keys.every((key) => finite(item?.[key]));
const nonnegative = (item, keys) => validNumbers(item, keys) && keys.every((key) => item[key] >= 0);
const integer = (value, min = 0) => Number.isInteger(value) && value >= min;
export function restoreGame(snapshot, definition) {
  try {
    const saved = typeof snapshot === 'string' ? JSON.parse(snapshot) : structuredClone(snapshot);
    if (
      !saved ||
      saved.version !== 3 ||
      !definition ||
      saved.levelId !== definition.id ||
      !['ready', 'playing', 'won', 'lost'].includes(saved.status)
    )
      return null;
    const fresh = createGame(definition);
    definition = fresh.definition;
    const spillBudgets = new Map();
    if (
      !saved.player ||
      !saved.progression ||
      !saved.equipment ||
      !saved.rooms ||
      !fresh.rooms[saved.roomId]
    )
      return null;
    if ('hp' in saved.player || 'maxHp' in saved.player) return null;
    for (const key of Object.keys(fresh.player)) if (!finite(saved.player[key])) return null;
    if (
      !nonnegative(saved.player, [
        'ink',
        'maxInk',
        'dashCd',
        'dashTimer',
        'meleeCd',
        'shootCd',
        'novaCd',
        'invuln',
      ])
    )
      return null;
    if (
      !integer(saved.progression.level, 1) ||
      !nonnegative(saved.progression, ['xp', 'nextXp']) ||
      saved.progression.nextXp <= 0 ||
      saved.progression.xp >= saved.progression.nextXp
    )
      return null;
    if (
      saved.progression.nextXp !==
      fresh.definition.progression.baseNextXp +
        (saved.progression.level - 1) * fresh.definition.progression.xpGrowth
    )
      return null;
    for (const [id, rank] of Object.entries(saved.equipment))
      if (
        !definition.equipment[id] ||
        !integer(rank, 1) ||
        rank > (definition.equipment[id].maxRank ?? 1)
      )
        return null;
    fresh.progression = saved.progression;
    fresh.equipment = saved.equipment;
    if (
      Math.abs(getPlayerStats(fresh).maxInk - saved.player.maxInk) > 0.001 ||
      saved.player.ink > saved.player.maxInk ||
      saved.player.r !== (definition.rules.playerRadius ?? 17)
    )
      return null;
    if (
      (saved.status === 'lost') !== saved.player.ink <= 0 ||
      !nonnegative(saved, ['time']) ||
      !integer(saved.serial) ||
      !integer(saved.seals)
    )
      return null;
    const allIds = new Set();
    function unique(id) {
      if (typeof id !== 'string' || allIds.has(id)) return false;
      allIds.add(id);
      return true;
    }
    for (const [id, room] of Object.entries(fresh.rooms)) {
      const previous = saved.rooms[id];
      if (
        !previous ||
        !Array.isArray(previous.enemies) ||
        !Array.isArray(previous.pickups) ||
        !Array.isArray(previous.objects) ||
        !Array.isArray(previous.bridges) ||
        previous.enemies.length > 200 ||
        previous.pickups.length > 2000
      )
        return null;
      if (
        !integer(previous.waveIndex) ||
        previous.waveIndex > room.waves.length ||
        !finite(previous.waveTimer) ||
        previous.waveTimer < 0
      )
        return null;
      const restoredEnemies = [];
      for (const enemy of previous.enemies) {
        if (!unique(enemy.id) || !integer(enemy.spawnIndex) || !integer(enemy.spawnWave, -1))
          return null;
        const specification =
          enemy.spawnWave === -1
            ? room.enemySpawns[enemy.spawnIndex]
            : room.waves[enemy.spawnWave]?.[enemy.spawnIndex];
        if (!specification || specification.type !== enemy.type) return null;
        const actor = spawnEnemy(fresh, specification, enemy.spawnIndex, enemy.spawnWave);
        if (
          enemy.maxHp !== actor.maxHp ||
          !nonnegative(enemy, ['hp', 'flash', 'cycle']) ||
          enemy.hp > actor.maxHp ||
          !validNumbers(enemy, ['x', 'y', 'aimX', 'aimY', 'timer']) ||
          !['chase', 'windup', 'attack', 'recover'].includes(enemy.state) ||
          ![1, 2].includes(enemy.phase)
        )
          return null;
        for (const key of [
          'id',
          'hp',
          'x',
          'y',
          'aimX',
          'aimY',
          'timer',
          'state',
          'phase',
          'cycle',
          'flash',
          'attackKind',
          'range',
          'currentWindup',
          'hitPlayer',
        ])
          if (enemy[key] !== undefined) actor[key] = enemy[key];
        restoredEnemies.push(actor);
      }
      const pickups = [];
      for (const pickup of previous.pickups) {
        if (
          !unique(pickup.id) ||
          !['ink', 'seal', 'gear', 'reclaim'].includes(pickup.kind) ||
          !nonnegative(pickup, ['value', 'age', 'r']) ||
          pickup.value <= 0 ||
          !validNumbers(pickup, ['x', 'y'])
        )
          return null;
        if (pickup.kind === 'reclaim') {
          if (
            !nonnegative(pickup, ['ttl', 'maxTtl', 'armDelay', 'sourceCost', 'travel']) ||
            pickup.ttl > pickup.maxTtl ||
            pickup.maxTtl > definition.rules.dropLifetime ||
            pickup.value >= pickup.sourceCost ||
            pickup.value > pickup.sourceCost * definition.rules.maxDropReturnRatio + 0.001 ||
            !['shot', 'nova'].includes(pickup.skillId) ||
            !validNumbers(pickup, ['originX', 'originY', 'lastPlayerX', 'lastPlayerY'])
          )
            return null;
        }
        if (pickup.kind === 'reclaim') {
          if (
            typeof pickup.castId !== 'string' ||
            !finite(pickup.returnBudget) ||
            pickup.returnBudget <= 0 ||
            pickup.returnBudget > pickup.sourceCost * definition.rules.maxDropReturnRatio + 0.001
          )
            return null;
          const cast = spillBudgets.get(pickup.castId) ?? {
            total: 0,
            budget: pickup.returnBudget,
            cost: pickup.sourceCost,
          };
          if (cast.budget !== pickup.returnBudget || cast.cost !== pickup.sourceCost) return null;
          cast.total += pickup.value;
          if (cast.total > cast.budget + 0.001) return null;
          spillBudgets.set(pickup.castId, cast);
        }
        if (
          pickup.kind === 'gear' &&
          (!pickup.gear ||
            (pickup.gear.pool &&
              (!Array.isArray(pickup.gear.pool) ||
                pickup.gear.pool.some((item) => !definition.equipment[item]))))
        )
          return null;
        pickups.push(pickup);
      }
      Object.assign(room, {
        visited: Boolean(previous.visited),
        cleared: Boolean(previous.cleared),
        rewardClaimed: Boolean(previous.rewardClaimed),
        waveIndex: previous.waveIndex,
        waveTimer: previous.waveTimer,
        enemies: restoredEnemies,
        pickups,
      });
      for (const object of room.objects)
        object.used = Boolean(previous.objects.find((item) => item.id === object.id)?.used);
      for (const bridge of room.bridges)
        bridge.drawn = Boolean(previous.bridges.find((item) => item.id === bridge.id)?.drawn);
    }
    if (!Array.isArray(saved.pendingRewards) || saved.pendingRewards.length > 100) return null;
    for (const pending of saved.pendingRewards)
      if (
        !unique(pending.id) ||
        !Array.isArray(pending.choices) ||
        !pending.choices.length ||
        new Set(pending.choices).size !== pending.choices.length ||
        pending.choices.some(
          (id) =>
            !definition.equipment[id] ||
            (saved.equipment[id] ?? 0) >= (definition.equipment[id].maxRank ?? 1),
        )
      )
        return null;
    Object.assign(fresh, {
      roomId: saved.roomId,
      player: saved.player,
      status: saved.status,
      time: saved.time,
      seals: saved.seals,
      serial: saved.serial,
      pendingRewards: saved.pendingRewards,
    });
    const room = getRoom(fresh);
    if (!room.visited || blocked(room, fresh.player)) return null;
    for (const [key, value] of Object.entries(fresh.stats)) {
      if (key === 'spent') {
        for (const category of Object.keys(value)) {
          if (!finite(saved.stats?.spent?.[category]) || saved.stats.spent[category] < 0)
            return null;
          value[category] = saved.stats.spent[category];
        }
      } else {
        if (!finite(saved.stats?.[key]) || saved.stats[key] < 0) return null;
        fresh.stats[key] = saved.stats[key];
      }
    }
    if (!Array.isArray(saved.projectiles) || saved.projectiles.length > 1000) return null;
    for (const shot of saved.projectiles)
      if (
        !unique(shot.id) ||
        !['player', 'enemy'].includes(shot.owner) ||
        !validNumbers(shot, ['x', 'y', 'vx', 'vy']) ||
        !nonnegative(shot, ['r', 'damage', 'life'])
      )
        return null;
    fresh.projectiles = saved.projectiles;
    fresh.enemies = room.enemies;
    fresh.pickups = room.pickups;
    fresh.effects = [];
    fresh.transitionCd = Math.max(0, Number(saved.transitionCd) || 0);
    notice(fresh, fresh.definition.messages?.resume ?? '继续未完成的冒险');
    return fresh;
  } catch {
    return null;
  }
}
