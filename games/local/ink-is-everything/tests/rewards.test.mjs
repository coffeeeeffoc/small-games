import assert from 'node:assert/strict';
import test from 'node:test';
import { LEVELS } from '../levels.mjs';
import {
  command,
  createGame,
  getLevelDefinition,
  getNearbyInteractable,
  getRewardChoices,
  getRoom,
  restoreGame,
  serializeGame,
} from '../engine.mjs';
import { tick } from './player-driver.mjs';

function equipmentChest(id, x = 150, y = 300, pool) {
  return { id, kind: 'chest', x, y, r: 24, reward: { gear: { pool, title: id } } };
}
function fixture({
  objects = [],
  obstacles = [],
  enemies = [],
  room = {},
  initial = {},
  chapter = {},
} = {}) {
  const definition = structuredClone(LEVELS['chapter-1']);
  const first = {
    ...definition.rooms[0],
    id: 'reward-floor',
    width: 960,
    height: 600,
    obstacles,
    enemySpawns: enemies,
    waves: [],
    bridges: [],
    objects,
    portals: [],
    clearReward: {},
    ...room,
  };
  Object.assign(definition, {
    id: 'deferred-reward-fixture',
    start: first.id,
    spawn: { x: 150, y: 300 },
    initial: { ink: 90, maxInk: 100, ...initial },
    rooms: [first],
    ...chapter,
  });
  const game = createGame(definition);
  assert.equal(command(game, { type: 'start' }).ok, true);
  return game;
}
function openEquipment(game, id) {
  assert.equal(command(game, { type: 'interact', objectId: id }).ok, true);
  return game.pickups.find((pickup) => pickup.kind === 'gear');
}
function pickEquipment(game, id) {
  const gear = openEquipment(game, id);
  assert.equal(command(game, { type: 'interact', objectId: gear.id }).rewardQueued, true);
  return gear;
}

test('equipment remains underfoot until an explicit pickup and each drop queues only once', () => {
  const game = fixture({ objects: [equipmentChest('floor-gear')] });
  const gear = openEquipment(game, 'floor-gear');
  const location = { x: gear.x, y: gear.y };
  tick(game, {}, 40);
  assert.equal(game.pendingRewards.length, 0);
  assert.equal(game.pickups[0], gear);
  assert.deepEqual({ x: gear.x, y: gear.y }, location, 'gear must not magnet toward the player');
  assert.equal(getNearbyInteractable(game).type, 'gear');
  assert.equal(getNearbyInteractable(game).name, '拾取装备');
  const result = command(game, { type: 'interact' });
  assert.equal(result.gear, true);
  assert.equal(result.rewardQueued, true);
  assert.equal(game.pickups.length, 0);
  assert.equal(game.pendingRewards.length, 1);
  assert.equal(game.pendingRewards[0].source, gear.id);
  assert.equal(command(game, { type: 'interact', objectId: gear.id }).ok, false);
  assert.equal(game.pendingRewards.length, 1);
});

test('equipment prompts and direct pickup both respect distance', () => {
  const game = fixture({ objects: [equipmentChest('floor-gear')] });
  const gear = openEquipment(game, 'floor-gear');
  tick(game, { moveY: -1 }, 12);
  assert.equal(getNearbyInteractable(game), null);
  assert.equal(command(game, { type: 'interact', objectId: gear.id }).ok, false);
  assert.equal(game.pendingRewards.length, 0);
  assert.equal(game.pickups.length, 1);
  tick(game, { moveY: 1 }, 6);
  assert.equal(getNearbyInteractable(game).id, gear.id);
  assert.equal(command(game, { type: 'interact', objectId: gear.id }).ok, true);
});

for (const kind of ['wall', 'pit']) {
  test(`equipment cannot be prompted or picked through a ${kind}`, () => {
    const game = fixture({
      objects: [equipmentChest('blocked-gear', 210)],
      obstacles: [{ x: 182, y: 280, w: 8, h: 40, kind }],
    });
    const gear = openEquipment(game, 'blocked-gear');
    tick(game, {}, 20);
    assert.equal(getNearbyInteractable(game), null);
    assert.equal(command(game, { type: 'interact', objectId: gear.id }).ok, false);
    assert.equal(game.pendingRewards.length, 0);
    tick(game, { moveY: 1 }, 5);
    tick(game, { moveX: 1 }, 8);
    tick(game, { moveY: -1 }, 4);
    assert.equal(getNearbyInteractable(game).id, gear.id);
    assert.equal(command(game, { type: 'interact', objectId: gear.id }).ok, true);
  });
}

test('level-up choices allow the same attack frame, enemy movement and subsequent waves to finish', () => {
  const game = fixture({
    enemies: [
      { type: 'blot', x: 210, y: 300, hp: 1, xp: 12, ink: 0, speed: 0 },
      { type: 'blot', x: 600, y: 300, hp: 1, xp: 0, ink: 0, speed: 90 },
    ],
    room: {
      waveDelay: 0.1,
      waves: [[{ type: 'blot', x: 800, y: 400, hp: 10, xp: 0, ink: 0, speed: 0 }]],
    },
  });
  tick(game, { melee: true, shoot: true, aimX: 600, aimY: 300 });
  assert.equal(game.pendingRewards.length, 1);
  assert.equal(game.stats.shots, 1, 'level-up from melee cannot cancel the ranged attack');
  assert.ok(game.enemies[0].x < 600, 'remaining enemies must advance after the level-up');
  tick(game, {}, 20);
  assert.equal(getRoom(game).waveIndex, 1);
  assert.ok(game.enemies.some((enemy) => enemy.spawnWave === 0));
  assert.equal(game.pendingRewards.length, 1);
  assert.equal(game.status, 'playing');
});

test('pending equipment cannot prevent lethal damage and the lost save remains valid', () => {
  const game = fixture({
    initial: { ink: 1 },
    objects: [equipmentChest('floor-gear')],
    enemies: [{ type: 'blot', x: 240, y: 300, speed: 0, damage: 20, windupTime: 0.1 }],
  });
  pickEquipment(game, 'floor-gear');
  tick(game, {}, 50);
  assert.equal(game.status, 'lost');
  assert.equal(game.player.ink, 0);
  assert.equal(game.pendingRewards.length, 1);
  assert.equal(
    command(game, { type: 'chooseReward', itemId: getRewardChoices(game)[0].id }).ok,
    false,
  );
  const restored = restoreGame(serializeGame(game), getLevelDefinition(game));
  assert.ok(restored);
  assert.equal(restored.status, 'lost');
});

test('a final kill completes immediately and its deferred upgrade can be selected after victory', () => {
  const game = fixture({
    enemies: [{ type: 'blot', x: 210, y: 300, hp: 1, xp: 12, ink: 0, speed: 0 }],
    room: { isFinal: true },
  });
  tick(game, { melee: true, aimX: 210, aimY: 300 });
  assert.equal(game.status, 'won');
  assert.equal(game.pendingRewards.length, 1);
  const choice = getRewardChoices(game)[0];
  assert.equal(command(game, { type: 'chooseReward', itemId: choice.id }).ok, true);
  assert.equal(game.status, 'won');
  assert.equal(game.pendingRewards.length, 0);
  assert.ok(restoreGame(serializeGame(game), getLevelDefinition(game)));
});

test('unselected rewards and floor equipment survive automatic room transitions and save restoration', () => {
  const game = fixture({
    objects: [equipmentChest('chosen-later'), equipmentChest('left-on-floor')],
  });
  const definition = getLevelDefinition(game);
  const first = definition.rooms[0];
  const second = { ...structuredClone(first), id: 'next-leaf', objects: [], portals: [] };
  const portal = (id, target) => ({
    id,
    kind: 'portal',
    x: 150,
    y: 300,
    r: 43,
    target,
    spawn: { x: 150, y: 300 },
  });
  first.portals = [portal('leave', second.id)];
  second.portals = [portal('return', first.id)];
  definition.rooms.push(second);
  const state = createGame(definition);
  command(state, { type: 'start' });
  pickEquipment(state, 'chosen-later');
  const floor = openEquipment(state, 'left-on-floor');
  const choices = getRewardChoices(state);
  tick(state, {}, 18);
  assert.equal(state.roomId, second.id, 'pending rewards cannot hold the player at a portal');
  const restored = restoreGame(serializeGame(state), definition);
  assert.ok(restored);
  assert.deepEqual(getRewardChoices(restored), choices);
  assert.equal(getRoom(restored, first.id).pickups[0].id, floor.id);
  assert.equal(command(restored, { type: 'interact', objectId: 'return' }).ok, true);
  assert.equal(command(restored, { type: 'interact', objectId: floor.id }).rewardQueued, true);
  assert.equal(restored.pendingRewards.length, 2);
  assert.ok(restoreGame(serializeGame(restored), definition));
});

test('buying a max-rank item prunes deferred choices and converts empty rewards without stranding later choices', () => {
  const equipment = {
    'single-rank': {
      id: 'single-rank',
      name: 'Single',
      maxRank: 1,
      modifiers: { attackDamage: 1 },
    },
    'other-rank': {
      id: 'other-rank',
      name: 'Other',
      maxRank: 1,
      modifiers: { meleeDamage: 1 },
    },
  };
  const game = fixture({
    initial: { ink: 20 },
    objects: [
      equipmentChest('empty-first', 150, 300, ['single-rank']),
      equipmentChest('retained', 150, 300, ['single-rank', 'other-rank']),
      { id: 'merchant', kind: 'merchant', x: 150, y: 300, r: 28 },
    ],
    chapter: { equipment, shopItems: [{ itemId: 'single-rank', price: 4 }] },
  });
  pickEquipment(game, 'empty-first');
  pickEquipment(game, 'retained');
  const before = game.player.ink;
  assert.equal(command(game, { type: 'buy', itemId: 'single-rank' }).ok, true);
  assert.equal(game.pendingRewards.length, 1);
  assert.deepEqual(getRewardChoices(game).map((item) => item.id), ['other-rank']);
  assert.equal(game.player.ink, before - 4 + getLevelDefinition(game).progression.fallbackInk);
  const restored = restoreGame(serializeGame(game), getLevelDefinition(game));
  assert.ok(restored);
  assert.equal(command(restored, { type: 'chooseReward', itemId: 'other-rank' }).ok, true);
  assert.equal(restored.pendingRewards.length, 0);
});
