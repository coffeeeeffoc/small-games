import { distance, normalized, rounded } from './math.mjs';
import { effect, nextId, notice } from './events.mjs';
import { blocked, lineOfSight, moveActor, reachableDropPosition } from './geometry.mjs';
import { getRoom } from './definition.mjs';
import { getPlayerStats } from './stats.mjs';

export function restoreInk(state, value, source = 'pickup', origin) {
  if (state.status === 'lost' || value <= 0) return 0;
  const amount = rounded(Math.max(0, Math.min(value, state.player.maxInk - state.player.ink)));
  state.player.ink = rounded(state.player.ink + amount);
  const key = {
    lifesteal: 'lifeStolen',
    kill: 'killRestored',
    reclaim: 'reclaimed',
    pickup: 'inkRecovered',
  }[source];
  if (key) state.stats[key] += amount;
  if (amount > 0)
    effect(
      state,
      source === 'lifesteal' ? 'lifesteal' : 'pickup',
      state.player.x,
      state.player.y - 24,
      {
        text: `+${Math.round(amount * 10) / 10}`,
        source,
        ...(origin
          ? { from: { x: origin.x, y: origin.y }, to: { x: state.player.x, y: state.player.y } }
          : {}),
        life: source === 'lifesteal' ? 0.45 : 0.8,
      },
    );
  return amount;
}
export function spendInk(state, amount, category) {
  if (
    !Number.isFinite(amount) ||
    amount < 0 ||
    state.player.ink - amount < state.definition.rules.minInkAfterSpend
  )
    return false;
  state.player.ink = rounded(state.player.ink - amount);
  state.stats.spent[category] = (state.stats.spent[category] ?? 0) + amount;
  state.stats.inkSpent += amount;
  effect(state, 'spend', state.player.x, state.player.y - 22, {
    text: `−${amount}`,
    source: category,
    life: 0.45,
  });
  return true;
}
export function addPickup(state, kind, x, y, value, extra = {}) {
  const item = {
    id: nextId(state, 'drop'),
    kind,
    x,
    y,
    r: kind === 'seal' || kind === 'gear' ? 15 : 8,
    value,
    age: 0,
    ...extra,
  };
  state.pickups.push(item);
  return item;
}
export function reward(state, rewards = {}, x, y) {
  if (rewards.ink > 0) addPickup(state, 'ink', x - 14, y, rewards.ink);
  if (rewards.seals > 0) addPickup(state, 'seal', x, y - 12, rewards.seals);
  if (rewards.gear) addPickup(state, 'gear', x + 18, y, 1, { gear: structuredClone(rewards.gear) });
}
export function spillSkillInk(state, skillId, cost, count = 1) {
  const stats = getPlayerStats(state);
  const total = rounded(cost * stats.dropReturnRatio);
  if (total <= 0) return;
  const room = getRoom(state),
    player = state.player;
  const aim = Math.atan2(player.aimY, player.aimX);
  const castId = nextId(state, 'cast');
  let assigned = 0;
  for (let index = 0; index < count; index++) {
    const base = aim + (index - (count - 1) / 2) * 1.5 + (state.stats.skillsUsed % 2 ? 0.7 : -0.7);
    let position = null;
    for (let attempt = 0; attempt < 24; attempt++) {
      const angle = base + (attempt * Math.PI) / 12;
      const reach =
        stats.dropDistanceMin +
        ((stats.dropDistanceMax - stats.dropDistanceMin) * ((attempt + index) % 3)) / 2;
      const candidate = {
        x: player.x + Math.cos(angle) * reach,
        y: player.y + Math.sin(angle) * reach,
        r: player.r,
      };
      if (
        !blocked(room, candidate) &&
        lineOfSight(room, player, candidate, { includePits: true, radius: player.r })
      ) {
        position = candidate;
        break;
      }
    }
    if (!position)
      position = reachableDropPosition(room, player, base, stats.dropDistanceMin, player.r);
    const value = index === count - 1 ? rounded(total - assigned) : rounded(total / count);
    assigned += value;
    addPickup(state, 'reclaim', position.x, position.y, value, {
      source: 'skill',
      skillId,
      castId,
      sourceCost: cost,
      returnBudget: total,
      armDelay: stats.dropArmTime,
      ttl: stats.dropLifetime,
      maxTtl: stats.dropLifetime,
      originX: player.x,
      originY: player.y,
      travel: 0,
      lastPlayerX: player.x,
      lastPlayerY: player.y,
      requiresMovement: true,
    });
  }
  state.stats.spilled += total;
}
export function hurtPlayer(state, damage, source) {
  const player = state.player;
  if (player.invuln > 0 || state.status !== 'playing') return false;
  const amount = Math.min(player.ink, Math.max(0, damage));
  player.ink = rounded(player.ink - amount);
  player.invuln = 0.85;
  state.stats.damageTaken += amount;
  state.shake = 0.22;
  effect(state, 'hit', player.x, player.y, {
    radius: 27,
    text: `−${Math.round(amount)}`,
    source: 'damage',
    life: 0.55,
  });
  if (source) {
    const direction = normalized(player.x - source.x, player.y - source.y);
    moveActor(getRoom(state), player, direction.x * 24, direction.y * 24);
  }
  if (player.ink <= 0) {
    state.status = 'lost';
    notice(state, state.definition.messages?.lost ?? '墨汁耗尽。');
  }
  return amount > 0;
}
