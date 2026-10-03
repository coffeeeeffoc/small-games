import { distance } from './math.mjs';
import { getRoom } from './definition.mjs';
import { effect, notice } from './events.mjs';
import { spawnEnemy } from './enemies.mjs';
import { reward } from './resources.mjs';

export function loadRoom(state, id, spawn) {
  const room = getRoom(state, id);
  if (!room.visited) {
    room.visited = true;
    state.stats.roomsVisited++;
    room.enemies = room.enemySpawns.map((specification, index) =>
      spawnEnemy(state, specification, index),
    );
  }
  state.roomId = id;
  state.enemies = room.enemies;
  state.pickups = room.pickups;
  state.projectiles = [];
  state.effects = [];
  Object.assign(state.player, spawn, { dashTimer: 0, invuln: Math.max(state.player.invuln, 0.65) });
  // Dormant room spills keep their TTL but teleporting between rooms is not walking to reclaim.
  for (const pickup of state.pickups)
    if (pickup.kind === 'reclaim') {
      pickup.lastPlayerX = state.player.x;
      pickup.lastPlayerY = state.player.y;
    }
  state.transitionCd = 0.8;
  state.roomIntroTimer = 2.5;
  notice(state, room.subtitle);
}
export function finishEncounter(state, dt) {
  const room = getRoom(state);
  room.enemies = state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);
  if (state.enemies.length) return;
  if (room.cleared) {
    if (room.clearReward && !room.rewardClaimed) {
      const point = room.rewardPosition ?? { x: room.width / 2, y: room.height / 2 };
      reward(state, room.clearReward, point.x, point.y);
      room.rewardClaimed = true;
    }
    if (room.isFinal && state.status === 'playing') {
      state.status = 'won';
      state.projectiles = [];
      notice(state, state.definition.messages?.won ?? room.clearMessage ?? '这一章已完成');
    }
    return;
  }
  if (room.waveIndex < room.waves.length) {
    if (!room.waveTimer) {
      room.waveTimer = room.waveDelay ?? 1.5;
      notice(state, room.waveMessage ?? '新的敌人正在聚拢……');
      effect(state, 'text', room.width / 2, room.height / 2, {
        text: room.waveLabel ?? '下一波',
        life: room.waveTimer,
      });
    }
    room.waveTimer -= dt;
    if (room.waveTimer <= 0) {
      room.enemies = state.enemies = room.waves[room.waveIndex++].map((specification, index) =>
        spawnEnemy(state, specification, index, room.waveIndex - 1),
      );
      for (const enemy of state.enemies)
        effect(state, 'death', enemy.x, enemy.y, { radius: enemy.r + 25, life: 0.7 });
      room.waveTimer = 0;
    }
    return;
  }
  room.cleared = true;
  if (room.clearReward && !room.rewardClaimed) {
    const point = room.rewardPosition ?? { x: room.width / 2, y: room.height / 2 };
    reward(state, room.clearReward, point.x, point.y);
    room.rewardClaimed = true;
  }
  if (room.isFinal) {
    state.status = 'won';
    state.projectiles = [];
    notice(state, state.definition.messages?.won ?? room.clearMessage ?? '这一章已完成');
  } else notice(state, room.clearMessage ?? '前方的通路已经开启');
}
export function getObjective(state) {
  const room = getRoom(state),
    messages = state.definition.messages ?? {};
  if (state.status === 'won') return messages.won ?? '章节完成';
  if (state.status === 'lost') return messages.lost ?? '墨汁耗尽，重新出发';
  if (state.pendingRewards.length) return state.pendingRewards[0].title;
  if (room.isFinal) return room.objective ?? room.subtitle;
  if (
    state.seals >= state.definition.requiredSeals &&
    state.definition.requiredSeals > 0 &&
    messages.sealsComplete
  )
    return messages.sealsComplete;
  return (
    (room.cleared ? room.clearedObjective : room.objective) ??
    room.subtitle ??
    state.definition.description
  );
}
export function getNearbyInteractable(state) {
  const room = getRoom(state);
  return (
    [...room.objects.filter((object) => !object.used), ...room.portals]
      .map((object) => ({ ...object, type: object.kind, distance: distance(state.player, object) }))
      .filter((object) => object.distance <= 106)
      .sort((a, b) => a.distance - b.distance)[0] ?? null
  );
}
export function portalReason(state, portal) {
  const room = getRoom(state);
  if (portal.requiresClear && !room.cleared) return '先击败本房间的敌人';
  if (portal.requiresSeals && state.seals < portal.requiresSeals)
    return `需要 ${portal.requiresSeals} 枚钥印（已有 ${state.seals}）`;
  if (portal.bridgeId && !room.bridges.find((bridge) => bridge.id === portal.bridgeId)?.drawn)
    return '先在锚点之间画出墨桥';
  return '';
}
export function interactWith(state, object) {
  if (!object) return { ok: false, message: '走近场景物体后互动' };
  if (distance(state.player, object) > 106) return { ok: false, message: '再靠近一些' };
  if (object.kind === 'portal') {
    const reason = portalReason(state, object);
    if (reason) return { ok: false, message: reason };
    loadRoom(state, object.target, object.spawn);
    return { ok: true, message: getRoom(state).name, roomChanged: true };
  }
  if (object.used) return { ok: false, message: '这里的补给已经取走了' };
  if (object.requiresClear && !getRoom(state).cleared)
    return { ok: false, message: '先击败周围的敌人' };
  if (object.kind === 'merchant')
    return { ok: true, message: object.shopMessage ?? '用墨汁签订装备契约', shop: true };
  if (object.kind === 'spring' && state.player.ink >= state.player.maxInk)
    return { ok: false, message: '墨汁已满，可以稍后再来' };
  object.used = true;
  reward(state, object.reward, object.x, object.y);
  effect(state, 'pickup', object.x, object.y, { radius: 50, life: 0.8 });
  return { ok: true, message: object.message ?? '补给已开启，走近拾取' };
}
export function advanceWorld(state, dt) {
  finishEncounter(state, dt);
  const room = getRoom(state);
  for (const object of room.objects)
    if (
      object.autoOpen &&
      !object.used &&
      (!object.requiresClear || room.cleared) &&
      distance(state.player, object) < 72
    )
      interactWith(state, object);
  if (
    state.transitionCd <= 0 &&
    state.status === 'playing' &&
    room.cleared &&
    !state.pendingRewards.length
  ) {
    const portal = room.portals.find(
      (item) => distance(state.player, item) < item.r * 0.63 && !portalReason(state, item),
    );
    if (portal) interactWith(state, portal);
  }
}
