import { distance, normalized } from './math.mjs';
import { getRoom } from './definition.mjs';
import { getPlayerStats } from './stats.mjs';
import { lineOfSight } from './geometry.mjs';
import { effect, notice } from './events.mjs';
import { restoreInk } from './resources.mjs';
import { queueReward } from './growth.mjs';

export function collectPickups(state, dt) {
  const player = state.player,
    room = getRoom(state),
    stats = getPlayerStats(state);
  for (const pickup of state.pickups) {
    pickup.age += dt;
    if (pickup.kind === 'reclaim') {
      pickup.ttl = Math.max(0, pickup.ttl - dt);
      pickup.travel += Math.hypot(player.x - pickup.lastPlayerX, player.y - pickup.lastPlayerY);
      pickup.lastPlayerX = player.x;
      pickup.lastPlayerY = player.y;
      if (pickup.ttl <= 0) {
        pickup.collected = true;
        state.stats.expiredInk += pickup.value;
        continue;
      }
      if (
        pickup.age < pickup.armDelay ||
        pickup.travel < 12 ||
        distance(player, pickup) > stats.pickupRadius ||
        !lineOfSight(room, player, pickup, { includePits: true })
      )
        continue;
      // Full vessels leave a live drop on the floor; none of its stored amount is duplicated.
      if (player.ink >= player.maxInk) continue;
      pickup.collected = true;
      restoreInk(state, pickup.value, 'reclaim');
      effect(state, 'reclaim', pickup.x, pickup.y, { text: `+${pickup.value}`, life: 0.65 });
      continue;
    }
    let d = distance(pickup, player);
    if (
      (d < (stats.normalPickupMagnet ?? 118) &&
        lineOfSight(room, player, pickup, { includePits: true })) ||
      (pickup.kind === 'seal' && room.cleared)
    ) {
      const direction = normalized(player.x - pickup.x, player.y - pickup.y);
      const travel = Math.min(d, (pickup.kind === 'seal' ? 450 : 360) * dt);
      pickup.x += direction.x * travel;
      pickup.y += direction.y * travel;
      d = distance(pickup, player);
    }
    if (
      d >= player.r + pickup.r + 5 ||
      (pickup.kind !== 'seal' && !lineOfSight(room, player, pickup, { includePits: true }))
    )
      continue;
    pickup.collected = true;
    if (pickup.kind === 'ink') restoreInk(state, pickup.value, 'pickup');
    if (pickup.kind === 'gear') {
      queueReward(state, { ...pickup.gear, source: pickup.id });
      effect(state, 'gear', player.x, player.y, {
        text: pickup.gear?.title ?? '发现装备',
        life: 1,
      });
    }
    if (pickup.kind === 'seal') {
      state.seals += pickup.value;
      effect(state, 'pickup', player.x, player.y - 25, {
        text: `钥印 +${pickup.value}`,
        life: 1.4,
      });
      notice(
        state,
        state.seals >= state.definition.requiredSeals
          ? (state.definition.messages?.sealsComplete ?? '钥印已齐，寻找最终出口')
          : (state.definition.messages?.sealFound ?? '获得一枚钥印'),
      );
    }
  }
  const retained = state.pickups.filter((pickup) => !pickup.collected);
  state.pickups.splice(0, state.pickups.length, ...retained);
}
