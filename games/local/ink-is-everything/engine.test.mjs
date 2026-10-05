import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from './levels.mjs';
import {
  createGame,
  step,
  command,
  getRoom,
  getSnapshot,
  getPlayerStats,
  getRewardChoices,
  getEquipmentSummary,
  getLevelDefinition,
  getNearbyInteractable,
  getObjective,
  serializeGame,
  restoreGame,
} from './engine.mjs';
import { distance, tick, takeRewards, fight, walk, door } from './tests/player-driver.mjs';

function start(chapter) {
  const game = createGame(chapter);
  assert.equal(command(game, { type: 'start' }).ok, true);
  return game;
}
let fixtureCounter = 0;
function fixture({
  spawn = { x: 150, y: 300 },
  initial = {},
  enemies = [],
  obstacles = [],
  objects = [],
  bridges = [],
  rules = {},
  chapter: chapterOverrides = {},
  room: roomOverrides = {},
} = {}) {
  const chapter = structuredClone(LEVELS['chapter-1']);
  const id = `fixture-room-${++fixtureCounter}`;
  const room = {
    ...chapter.rooms[0],
    id,
    width: 960,
    height: 600,
    isFinal: false,
    enemySpawns: enemies,
    obstacles,
    objects,
    bridges,
    portals: [],
    waves: [],
    clearReward: {},
    ...roomOverrides,
  };
  Object.assign(chapter, {
    id: `fixture-chapter-${fixtureCounter}`,
    start: id,
    gate: 'unused-final-room',
    spawn,
    initial: { ink: 90, maxInk: 100, ...initial },
    rooms: [room],
    rules: { ...chapter.rules, ...rules },
    ...chapterOverrides,
  });
  return start(chapter);
}
const closeTo = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-7, message ?? `${actual} != ${expected}`);
const reclaimDrops = (game) => game.pickups.filter((drop) => drop.kind === 'reclaim');

// Basic invariants are exercised through the same exported commands/steps as the UI.
test('version 3 has one ink/life pool and supports independent chapter objects', () => {
  const game = fixture();
  assert.equal(game.version, 3);
  assert.equal(game.player.ink, 90);
  assert.equal(game.player.maxInk, 100);
  assert.equal('hp' in game.player, false);
  assert.equal('maxHp' in game.player, false);
  assert.equal(game.levelId.startsWith('fixture-chapter-'), true);
  assert.equal(getRoom(game).id.startsWith('fixture-room-'), true);
  assert.equal(getLevelDefinition(game).id, game.levelId);
  assert.equal(LEVELS[game.levelId], undefined);
  const snapshot = getSnapshot(game);
  snapshot.player.ink = 1;
  assert.equal(game.player.ink, 90);
  assert.equal(command(game, { type: 'heal' }).ok, false);
});

test('ready/finished simulations freeze, and tab-resume dt is bounded', () => {
  const game = createGame();
  const { x, ink } = game.player;
  tick(game, { moveX: 1, shoot: true }, 10);
  assert.equal(game.player.x, x);
  assert.equal(game.player.ink, ink);
  command(game, { type: 'start' });
  step(game, { moveX: 1 }, 20);
  assert.ok(game.player.x - x <= getPlayerStats(game).speed * 0.05 + 0.01);
  assert.equal(game.time, 0.05);
});

test('walking and free dashing collide with a pillar without tunnelling', () => {
  const game = fixture({
    spawn: { x: 140, y: 270 },
    obstacles: [{ x: 200, y: 200, w: 50, h: 150, kind: 'wall' }],
  });
  tick(game, { moveX: 1, dash: true }, 50);
  assert.ok(game.player.x <= 183);
  assert.equal(game.player.ink, 90);
  assert.ok(game.stats.dashes >= 2);
});

test('a missed shot costs life and scatters only its bounded recoverable share', () => {
  const game = fixture();
  const stats = getPlayerStats(game);
  tick(game, { shoot: true, aimX: 600, aimY: 300 });
  closeTo(game.player.ink, 90 - stats.attackCost);
  assert.equal(game.stats.shots, 1);
  const drops = reclaimDrops(game);
  assert.equal(drops.length, 1);
  closeTo(drops[0].value, stats.attackCost * stats.dropReturnRatio);
  assert.ok(drops[0].value < stats.attackCost);
  assert.equal(drops[0].source, 'skill');
  assert.ok(distance(game.player, drops[0]) >= 70);
  tick(game, {}, 35);
  closeTo(game.player.ink, 90 - stats.attackCost);
  assert.equal(
    reclaimDrops(game).length,
    1,
    'recoverable skill ink must be walked over, not passively magnetized',
  );
});

test('skill droplets are collected by movement exactly once and cannot refund more than was spent', () => {
  const game = fixture();
  tick(game, { shoot: true, aimX: 600, aimY: 300 });
  const drop = { ...reclaimDrops(game)[0] };
  const spent = 90 - game.player.ink;
  tick(game, {}, 11);
  walk(game, drop, 10);
  tick(game, {}, 3);
  assert.equal(
    reclaimDrops(game).some((item) => item.id === drop.id),
    false,
  );
  closeTo(game.player.ink, 90 - spent + drop.value);
  assert.ok(game.player.ink < 90);
  const recovered = game.player.ink;
  tick(game, {}, 80);
  closeTo(game.player.ink, recovered);
});

test('uncollected skill droplets expire instead of accumulating permanent refunds', () => {
  const game = fixture();
  tick(game, { shoot: true, aimX: 600, aimY: 300 });
  const afterSpend = game.player.ink;
  tick(game, {}, 270);
  assert.equal(reclaimDrops(game).length, 0);
  closeTo(game.player.ink, afterSpend);
});

test('shooting cannot spend the last life, and rejected actions create no drops', () => {
  for (const ink of [1, 5, 6, 6.5]) {
    const game = fixture({ initial: { ink } });
    tick(game, { shoot: true, aimX: 600, aimY: 300 });
    assert.equal(game.player.ink, ink);
    assert.equal(game.stats.shots, 0);
    assert.equal(reclaimDrops(game).length, 0);
    assert.equal(game.status, 'playing');
  }
  const exact = fixture({ initial: { ink: 7 } });
  tick(exact, { shoot: true, aimX: 600, aimY: 300 });
  assert.equal(exact.player.ink, 1);
  assert.equal(exact.stats.shots, 1);
});

test('nova spends life once, respects cooldown, and scatters two finite droplets', () => {
  const game = fixture();
  const stats = getPlayerStats(game);
  assert.equal(command(game, { type: 'nova' }).ok, true);
  closeTo(game.player.ink, 90 - stats.novaCost);
  assert.equal(reclaimDrops(game).length, 2);
  closeTo(
    reclaimDrops(game).reduce((sum, drop) => sum + drop.value, 0),
    stats.novaCost * stats.dropReturnRatio,
  );
  assert.equal(command(game, { type: 'nova' }).ok, false);
  tick(game, { nova: true }, 4);
  closeTo(game.player.ink, 90 - stats.novaCost);
  assert.equal(reclaimDrops(game).length, 2);
  const poor = fixture({ initial: { ink: stats.novaCost } });
  assert.equal(command(poor, { type: 'nova' }).ok, false);
  assert.equal(poor.player.ink, stats.novaCost);
  assert.equal(reclaimDrops(poor).length, 0);
});

test('projectiles collide with enemies and leech from damage actually dealt', () => {
  const game = fixture({
    spawn: { x: 100, y: 300 },
    initial: { ink: 40 },
    enemies: [{ type: 'blot', x: 340, y: 300, speed: 0 }],
  });
  const stats = getPlayerStats(game),
    hp = game.enemies[0].hp;
  tick(game, { shoot: true, aimX: 340, aimY: 300 });
  closeTo(game.player.ink, 40 - stats.attackCost);
  assert.equal(game.enemies[0].hp, hp);
  tick(game, {}, 10);
  assert.equal(game.enemies[0].hp, hp - stats.attackDamage);
  closeTo(game.player.ink, 40 - stats.attackCost + stats.attackDamage * stats.lifeSteal);
  assert.equal(game.stats.hits, 1);
});

test('pillars block projectiles and close-range nova damage through walls', () => {
  const shot = fixture({
    spawn: { x: 100, y: 300 },
    enemies: [{ type: 'blot', x: 340, y: 300, speed: 0 }],
    obstacles: [{ x: 215, y: 250, w: 30, h: 100, kind: 'wall' }],
  });
  const hp = shot.enemies[0].hp;
  tick(shot, { shoot: true, aimX: 340, aimY: 300 });
  tick(shot, {}, 15);
  assert.equal(shot.enemies[0].hp, hp);
  assert.equal(shot.projectiles.length, 0);
  const nova = fixture({
    enemies: [{ type: 'blot', x: 215, y: 300, speed: 0 }],
    obstacles: [{ x: 180, y: 245, w: 12, h: 110, kind: 'wall' }],
  });
  const otherHp = nova.enemies[0].hp;
  assert.equal(command(nova, { type: 'nova' }).ok, true);
  assert.equal(nova.enemies[0].hp, otherHp);
});

test('free dry brush is directional, cooldown-limited and replenishes near-empty life', () => {
  const game = fixture({
    initial: { ink: 1 },
    enemies: [
      { type: 'blot', x: 210, y: 300, speed: 0 },
      { type: 'blot', x: 90, y: 300, speed: 0 },
      { type: 'blot', x: 350, y: 300, speed: 0 },
    ],
  });
  const stats = getPlayerStats(game),
    before = game.enemies.map((enemy) => enemy.hp);
  tick(game, { melee: true, aimX: 400, aimY: 300 });
  assert.deepEqual(
    game.enemies.map((enemy) => enemy.hp),
    [before[0] - stats.meleeDamage, before[1], before[2]],
  );
  closeTo(game.player.ink, 1 + stats.meleeDamage * stats.lifeSteal);
  assert.equal(game.stats.freeAttacks, 1);
  tick(game, { melee: true, aimX: 400, aimY: 300 }, 2);
  assert.equal(game.stats.freeAttacks, 1);
});

test('overkill only leeches remaining enemy health and death rewards happen once', () => {
  const game = fixture({
    initial: { ink: 20 },
    enemies: [{ type: 'blot', x: 210, y: 300, speed: 0, hp: 2, ink: 0, xp: 0 }],
  });
  tick(game, { melee: true, aimX: 400, aimY: 300 });
  closeTo(game.player.ink, 20 + 2 * getPlayerStats(game).lifeSteal + 6);
  assert.equal(game.stats.enemiesDefeated, 1);
  const afterKill = game.player.ink;
  tick(game, { melee: true, aimX: 400, aimY: 300 }, 25);
  closeTo(game.player.ink, afterKill);
  assert.equal(game.stats.enemiesDefeated, 1);
});

test('lifesteal and kill restoration never exceed maxInk', () => {
  const game = fixture({
    initial: { ink: 99 },
    enemies: [{ type: 'blot', x: 210, y: 300, speed: 0, hp: 2, ink: 0, xp: 0 }],
  });
  tick(game, { melee: true, aimX: 400, aimY: 300 });
  assert.equal(game.player.ink, game.player.maxInk);
  tick(game, { melee: true, aimX: 400, aimY: 300 }, 20);
  assert.equal(game.player.ink, 100);
});

test('free dash works at one life, grants brief invulnerability and respects cooldown', () => {
  const game = fixture({ initial: { ink: 1 } });
  tick(game, { dash: true, moveX: 1 });
  assert.ok(game.player.invuln > 0);
  tick(game, { dash: true, moveX: 1 }, 4);
  assert.equal(game.stats.dashes, 1);
  assert.equal(game.player.ink, 1);
  tick(game, { dash: true, moveX: 1 }, 20);
  assert.equal(game.stats.dashes, 2);
});

test('guard visibly winds up, locks aim and commits to a dodgeable charge', () => {
  const game = fixture({ enemies: [{ type: 'guard', x: 400, y: 300 }] });
  for (let i = 0; i < 50 && game.enemies[0].state !== 'windup'; i++) tick(game);
  const enemy = game.enemies[0],
    direction = { x: enemy.aimX, y: enemy.aimY };
  assert.equal(enemy.state, 'windup');
  tick(game, { moveY: 1 }, 7);
  assert.equal(enemy.state, 'windup');
  assert.equal(enemy.aimX, direction.x);
  assert.equal(enemy.aimY, direction.y);
  assert.equal(game.player.ink, 90);
  for (let i = 0; i < 30 && enemy.state === 'windup'; i++) tick(game, { moveY: 1 });
  assert.equal(enemy.state, 'attack');
  tick(game, { moveY: 1 }, 12);
  assert.equal(game.player.ink, 90);
});

test('enemy damage removes ink/life and zero ends the run without resurrection', () => {
  const game = fixture({ initial: { ink: 12 }, enemies: [{ type: 'blot', x: 230, y: 300 }] });
  tick(game, {}, 100);
  assert.equal(game.player.ink, 0);
  assert.equal(game.status, 'lost');
  assert.ok(game.stats.damageTaken >= 12);
  const before = serializeGame(game);
  tick(game, { melee: true, shoot: true, nova: true, moveX: 1 }, 50);
  assert.equal(serializeGame(game), before);
  assert.equal(command(game, { type: 'nova' }).ok, false);
});

function gearChest(id, pool, x = 150, y = 300) {
  return {
    id,
    kind: 'chest',
    x,
    y,
    r: 24,
    reward: { gear: { pool, title: 'Fixture equipment' } },
    requiresClear: true,
  };
}
const fixtureEquipment = {
  'test-nib': {
    id: 'test-nib',
    name: 'Test nib',
    description: 'Fixture damage modifier',
    maxRank: 2,
    modifiers: { attackDamage: 3 },
  },
  'test-sac': {
    id: 'test-sac',
    name: 'Test sac',
    description: 'Fixture maximum modifier',
    maxRank: 1,
    modifiers: { maxInk: 17 },
  },
  'test-return': {
    id: 'test-return',
    name: 'Test return',
    description: 'Fixture bounded recovery modifier',
    maxRank: 1,
    modifiers: { lifeSteal: 20, dropReturnRatio: 20 },
  },
};
function openChest(game, id) {
  assert.equal(command(game, { type: 'interact', objectId: id }).ok, true);
  tick(game, {}, 4);
  const gear = game.pickups.find((pickup) => pickup.kind === 'gear');
  if (gear) assert.equal(command(game, { type: 'interact', objectId: gear.id }).ok, true);
}

test('picked-up equipment keeps stable choices while the player continues moving and attacking', () => {
  const pool = Object.keys(fixtureEquipment);
  const game = fixture({
    objects: [gearChest('test-chest', pool)],
    chapter: { equipment: fixtureEquipment },
  });
  openChest(game, 'test-chest');
  const choices = getRewardChoices(game);
  assert.equal(choices.length, 3);
  assert.deepEqual(new Set(choices.map((item) => item.id)), new Set(pool));
  assert.ok(choices.every((item) => item.nextRank === 1 && item.name && item.description));
  const before = { time: game.time, x: game.player.x, shots: game.stats.shots };
  tick(game, { moveX: 1, shoot: true, melee: true }, 5);
  assert.ok(game.time > before.time && game.player.x > before.x);
  assert.ok(game.stats.shots > before.shots && game.stats.freeAttacks > 0);
  assert.deepEqual(getRewardChoices(game), choices, 'waiting must not reroll a pending reward');
  assert.notEqual(getObjective(game), game.pendingRewards[0].title);
  assert.equal(command(game, { type: 'nova' }).ok, true, 'pending equipment must not block actions');
  assert.equal(command(game, { type: 'chooseReward', itemId: 'unknown-item' }).ok, false);
  assert.equal(game.pendingRewards.length, 1);
  const damage = getPlayerStats(game).attackDamage;
  assert.equal(command(game, { type: 'chooseReward', itemId: 'test-nib' }).ok, true);
  assert.equal(game.equipment['test-nib'], 1);
  assert.equal(getPlayerStats(game).attackDamage, damage + 3);
  assert.equal(getRewardChoices(game).length, 0);
  assert.equal(command(game, { type: 'chooseReward', itemId: 'test-nib' }).ok, false);
  assert.equal(command(game, { type: 'interact', objectId: 'test-chest' }).ok, false);
  assert.equal(game.equipment['test-nib'], 1);
  assert.deepEqual(
    getEquipmentSummary(game).map((item) => [item.id, item.rank]),
    [['test-nib', 1]],
  );
});

test('equipment ranks are capped and duplicate reward sources cannot grow stats twice', () => {
  const game = fixture({
    initial: { ink: 20 },
    objects: ['one', 'two', 'three'].map((id) => gearChest(id, ['test-nib', 'test-nib'])),
    chapter: { equipment: fixtureEquipment },
  });
  const initialDamage = getPlayerStats(game).attackDamage;
  for (const id of ['one', 'two']) {
    openChest(game, id);
    assert.equal(
      getRewardChoices(game).length,
      1,
      'duplicate ids must not become duplicate choices',
    );
    assert.equal(command(game, { type: 'chooseReward', itemId: 'test-nib' }).ok, true);
  }
  assert.equal(game.equipment['test-nib'], 2);
  assert.equal(getPlayerStats(game).attackDamage, initialDamage + 6);
  const before = game.player.ink;
  openChest(game, 'three');
  assert.equal(getRewardChoices(game).length, 0);
  assert.equal(game.player.ink, before + getLevelDefinition(game).progression.fallbackInk);
  assert.equal(game.equipment['test-nib'], 2);
  assert.equal(command(game, { type: 'chooseReward', itemId: 'test-nib' }).ok, false);
});

test('data-driven maximum equipment restores only the gained capacity and recovery ratios stay bounded', () => {
  const game = fixture({
    initial: { ink: 20 },
    objects: [gearChest('sac', ['test-sac']), gearChest('return', ['test-return'])],
    chapter: { equipment: fixtureEquipment },
  });
  openChest(game, 'sac');
  assert.equal(command(game, { type: 'chooseReward', itemId: 'test-sac' }).ok, true);
  assert.equal(game.player.maxInk, 117);
  assert.equal(game.player.ink, 37);
  openChest(game, 'return');
  assert.equal(command(game, { type: 'chooseReward', itemId: 'test-return' }).ok, true);
  assert.equal(getPlayerStats(game).lifeSteal, 1);
  assert.ok(getPlayerStats(game).dropReturnRatio <= 0.8);
  tick(game, { shoot: true, aimX: 600, aimY: 300 });
  const spilled = reclaimDrops(game).reduce((sum, drop) => sum + drop.value, 0);
  assert.ok(spilled <= getPlayerStats(game).attackCost * 0.8);
});

test('experience raises ink capacity and offers equipment without duplicating kill rewards', () => {
  const game = fixture({
    initial: { ink: 20 },
    enemies: [{ type: 'blot', x: 210, y: 300, speed: 0, hp: 1, ink: 0, xp: 12 }],
  });
  tick(game, { melee: true, aimX: 400, aimY: 300 });
  assert.equal(game.progression.level, 2);
  assert.equal(game.progression.xp, 0);
  assert.equal(game.progression.nextXp, 20);
  assert.equal(game.player.maxInk, 108);
  closeTo(game.player.ink, 20 + 0.25 + 6 + 8);
  assert.equal(game.pendingRewards.length, 1);
  assert.equal(game.stats.levelsGained, 1);
  assert.equal(game.stats.lifeStolen, 0.25);
  assert.equal(game.stats.killRestored, 6);
  takeRewards(game);
  tick(game, {}, 10);
  assert.equal(game.progression.level, 2);
  assert.equal(game.stats.enemiesDefeated, 1);
});

test('drawing uses life once and still cannot spend the final point', () => {
  const bridge = {
    id: 'custom-bridge',
    from: { x: 150, y: 300 },
    to: { x: 150, y: 180 },
    rect: { x: 100, y: 220, w: 100, h: 30 },
    cost: 8,
    drawn: false,
    label: 'Fixture bridge',
  };
  const game = fixture({ bridges: [bridge] });
  assert.equal(command(game, { type: 'draw', bridgeId: bridge.id }).ok, true);
  assert.equal(game.player.ink, 82);
  assert.equal(getRoom(game).bridges[0].drawn, true);
  assert.equal(command(game, { type: 'draw', bridgeId: bridge.id }).ok, false);
  assert.equal(game.player.ink, 82);
  assert.equal(reclaimDrops(game).length, 0, 'exploration spends cannot mint skill refunds');
  const poor = fixture({ initial: { ink: 8 }, bridges: [bridge] });
  assert.equal(command(poor, { type: 'draw', bridgeId: bridge.id }).ok, false);
  assert.equal(poor.player.ink, 8);
  assert.equal(getRoom(poor).bridges[0].drawn, false);
});

test('finite ink chests are picked up once and capped by the single life maximum', () => {
  const game = fixture({
    initial: { ink: 90 },
    objects: [{ id: 'ink-cache', kind: 'chest', x: 150, y: 300, r: 24, reward: { ink: 30 } }],
  });
  openChest(game, 'ink-cache');
  assert.equal(game.player.ink, 100);
  assert.equal(game.stats.inkRecovered, 10);
  assert.equal(command(game, { type: 'interact', objectId: 'ink-cache' }).ok, false);
  tick(game, {}, 40);
  assert.equal(game.player.ink, 100);
  assert.equal(game.stats.inkRecovered, 10);
});

test('nearby merchants exchange life for ranked equipment, with no spending past the cap', () => {
  const merchant = { id: 'fixture-merchant', kind: 'merchant', x: 150, y: 300, r: 28 };
  const options = {
    objects: [merchant],
    chapter: {
      equipment: fixtureEquipment,
      shopItems: [{ id: 'custom-offer', itemId: 'test-nib', price: 8 }],
    },
  };
  const far = fixture({ ...options, spawn: { x: 500, y: 300 } });
  assert.equal(command(far, { type: 'buy', itemId: 'test-nib' }).ok, false);
  const game = fixture(options);
  assert.equal(getNearbyInteractable(game).type, 'merchant');
  assert.equal(command(game, { type: 'interact', objectId: merchant.id }).shop, true);
  assert.equal(command(game, { type: 'buy', itemId: 'test-nib' }).ok, true);
  assert.equal(game.player.ink, 82);
  assert.equal(command(game, { type: 'buy', itemId: 'test-nib' }).ok, true);
  assert.equal(game.player.ink, 74);
  assert.equal(game.equipment['test-nib'], 2);
  assert.equal(command(game, { type: 'buy', itemId: 'test-nib' }).ok, false);
  assert.equal(game.player.ink, 74);
  assert.equal(reclaimDrops(game).length, 0);
  const poor = fixture({ ...options, initial: { ink: 8 } });
  assert.equal(command(poor, { type: 'buy', itemId: 'test-nib' }).ok, false);
  assert.equal(poor.player.ink, 8);
  assert.equal(poor.equipment['test-nib'], undefined);
});

test('save resumes live projectiles, cooldowns and reclaim ownership without serializing rule definitions', () => {
  const game = fixture({ enemies: [{ type: 'blot', x: 800, y: 450, speed: 0 }] });
  tick(game, { shoot: true, aimX: 800, aimY: 100 });
  const payload = JSON.parse(serializeGame(game));
  assert.equal('definition' in payload, false);
  assert.equal('pickups' in payload, false);
  assert.equal('enemies' in payload, false);
  const restored = restoreGame(payload, getLevelDefinition(game));
  assert.ok(restored);
  assert.equal(restored.player.ink, game.player.ink);
  assert.equal(restored.player.shootCd, game.player.shootCd);
  assert.deepEqual(restored.projectiles, game.projectiles);
  assert.deepEqual(restored.pickups, game.pickups);
  assert.equal(restored.pickups, getRoom(restored).pickups);
  assert.equal(restored.enemies, getRoom(restored).enemies);
  tick(restored, {}, 11);
  const drop = { ...reclaimDrops(restored)[0] };
  walk(restored, drop, 10);
  assert.equal(
    reclaimDrops(restored).some((item) => item.id === drop.id),
    false,
  );
  const second = restoreGame(serializeGame(restored), getLevelDefinition(restored));
  assert.ok(second);
  const before = second.player.ink;
  tick(second, {}, 10);
  assert.equal(
    reclaimDrops(second).some((item) => item.id === drop.id),
    false,
  );
  assert.equal(second.player.ink, before);
});

test('pending reward saves preserve choices and cannot be rerolled or claimed twice', () => {
  const game = fixture({
    objects: [gearChest('save-gear', Object.keys(fixtureEquipment))],
    chapter: { equipment: fixtureEquipment },
  });
  openChest(game, 'save-gear');
  const restored = restoreGame(serializeGame(game), getLevelDefinition(game));
  assert.ok(restored);
  assert.deepEqual(getRewardChoices(restored), getRewardChoices(game));
  assert.equal(command(restored, { type: 'chooseReward', itemId: 'test-sac' }).ok, true);
  const afterChoice = restoreGame(serializeGame(restored), getLevelDefinition(game));
  assert.ok(afterChoice);
  assert.equal(afterChoice.player.maxInk, 117);
  assert.equal(afterChoice.equipment['test-sac'], 1);
  assert.equal(getRewardChoices(afterChoice).length, 0);
  assert.equal(command(afterChoice, { type: 'interact', objectId: 'save-gear' }).ok, false);
  assert.equal(command(afterChoice, { type: 'chooseReward', itemId: 'test-sac' }).ok, false);
});

test('save rejects old versions, invalid life, duplicate drops, oversized refunds and invalid equipment', () => {
  const game = fixture();
  tick(game, { shoot: true, aimX: 800, aimY: 450 });
  const definition = getLevelDefinition(game);
  const saved = JSON.parse(serializeGame(game));
  const corruptions = [
    (copy) => {
      copy.version = 2;
    },
    (copy) => {
      copy.player.hp = 6;
    },
    (copy) => {
      copy.player.ink = NaN;
    },
    (copy) => {
      copy.player.ink = -1;
    },
    (copy) => {
      copy.player.ink = copy.player.maxInk + 1;
    },
    (copy) => {
      copy.player.maxInk += 10;
    },
    (copy) => {
      copy.player.x = -10;
    },
    (copy) => {
      copy.rooms[copy.roomId].pickups.push(structuredClone(copy.rooms[copy.roomId].pickups[0]));
    },
    (copy) => {
      copy.rooms[copy.roomId].pickups[0].value = 100;
    },
    (copy) => {
      copy.rooms[copy.roomId].pickups[0].value = -1;
    },
    (copy) => {
      copy.equipment['unknown-equipment'] = 1;
    },
    (copy) => {
      copy.equipment['fine-nib'] = 4;
    },
    (copy) => {
      copy.pendingRewards.push({ id: 'invalid-choice', choices: ['unknown-item'] });
    },
  ];
  for (const [index, mutate] of corruptions.entries()) {
    const copy = structuredClone(saved);
    mutate(copy);
    assert.equal(restoreGame(copy, definition), null, `corruption ${index} was accepted`);
  }
  assert.equal(restoreGame('{broken', definition), null);
  assert.equal(
    restoreGame(saved),
    null,
    'unknown custom chapters require their trusted definition',
  );
  saved.definition = { ...definition, rules: { ...definition.rules, attackDamage: 9999 } };
  const safe = restoreGame(saved, definition);
  assert.ok(safe);
  assert.equal(getPlayerStats(safe).attackDamage, definition.rules.attackDamage);
});

test('a different chapter uses its own room sizes, three-seal gate, final marker and trusted save definition', () => {
  const chapter = structuredClone(LEVELS['chapter-1']);
  const first = {
    id: 'blue-paper-start',
    name: 'Blue paper',
    width: 640,
    height: 420,
    boundary: 24,
    obstacles: [],
    bridges: [],
    objects: [],
    waves: [],
    enemySpawns: [{ type: 'blot', x: 155, y: 210, hp: 1, xp: 0, ink: 0, speed: 0 }],
    clearReward: { seals: 3 },
    rewardPosition: { x: 150, y: 210 },
    portals: [
      {
        id: 'three-seal-door',
        kind: 'portal',
        x: 580,
        y: 210,
        r: 43,
        target: 'folded-ending',
        spawn: { x: 100, y: 210 },
        requiresClear: true,
        requiresSeals: 3,
      },
    ],
  };
  const final = {
    id: 'folded-ending',
    name: 'Folded ending',
    width: 720,
    height: 480,
    boundary: 24,
    isFinal: true,
    obstacles: [],
    bridges: [],
    objects: [],
    portals: [],
    waves: [],
    enemySpawns: [{ type: 'blot', x: 155, y: 210, hp: 1, xp: 0, ink: 0, speed: 0 }],
  };
  Object.assign(chapter, {
    id: 'independent-chapter',
    start: first.id,
    rooms: [first, final],
    spawn: { x: 100, y: 210 },
    requiredSeals: 3,
  });
  const game = start(chapter);
  tick(game, { melee: true, aimX: 155, aimY: 210 });
  tick(game, {}, 12);
  assert.equal(game.seals, 3);
  tick(game, { moveY: -1 }, 60);
  closeTo(game.player.y, first.boundary + game.player.r);
  walk(game, { x: 100, y: 210 }, 5);
  const restored = restoreGame(serializeGame(game), chapter);
  assert.ok(restored);
  assert.equal(getRoom(restored).width, 640);
  assert.equal(restored.seals, 3);
  door(restored, 'three-seal-door');
  assert.equal(getRoom(restored).width, 720);
  tick(restored, { melee: true, aimX: 155, aimY: 210 });
  tick(restored, {}, 3);
  assert.equal(restored.status, 'won');
  assert.equal(restored.stats.enemiesDefeated, 2);
  assert.equal(command(restored, { type: 'restart' }).ok, true);
  assert.equal(restored.roomId, first.id);
  assert.equal(restored.seals, 0);
  assert.equal(restored.player.ink, chapter.initial.ink);
});

function collectRoomRewards(game, preference) {
  for (const pickup of [...game.pickups].filter((item) =>
    ['gear', 'seal', 'ink'].includes(item.kind),
  )) {
    walk(game, pickup, 35);
    tick(game, {}, 10);
    if (pickup.kind === 'gear')
      assert.equal(command(game, { type: 'interact', objectId: pickup.id }).ok, true);
    takeRewards(game, preference);
  }
}
function completeMainRoute(game, fightOptions = {}) {
  for (const id of [
    'arrival-east',
    'sentinel-east',
    'market-north',
    'warden-south',
    'market-east',
  ]) {
    fight(game, fightOptions);
    collectRoomRewards(game, fightOptions.preference);
    door(game, id);
  }
  fight(game, fightOptions);
  assert.equal(game.status, 'won');
  assert.equal(game.seals, 2);
}

test('complete main route wins with real movement, combat and collected upgrades', () => {
  const game = start();
  completeMainRoute(game);
  assert.equal(game.stats.roomsVisited, 5);
  assert.equal(game.stats.bridgesDrawn, 0);
  assert.equal(game.stats.trades, 0);
  assert.equal(game.stats.enemiesDefeated, 17);
  assert.ok(game.stats.shots > 0 && game.stats.freeAttacks > 0 && game.stats.dashes > 0);
  assert.ok(game.stats.lifeStolen > 0 && game.stats.killRestored > 0);
  assert.ok(game.stats.equipmentFound >= 3 && game.progression.level > 1);
  assert.ok(game.player.ink > 0);
});

test('optional equipment archive and merchant produce a second complete real-input route', () => {
  const game = start();
  fight(game, { preference: 'backflow-amber' });
  collectRoomRewards(game, 'backflow-amber');
  walk(game, getRoom(game).bridges[0].from);
  assert.equal(command(game, { type: 'draw', bridgeId: 'archive-bridge' }).ok, true);
  door(game, 'arrival-north');
  fight(game, { preference: 'backflow-amber' });
  walk(game, getRoom(game).objects[0]);
  tick(game, {}, 10);
  takeRewards(game, 'backflow-amber');
  collectRoomRewards(game, 'backflow-amber');
  assert.equal(getRoom(game).objects[0].used, true);
  door(game, 'archive-south');
  walk(game, getRoom(game).bridges[0].from);
  door(game, 'arrival-east');
  fight(game);
  collectRoomRewards(game);
  door(game, 'sentinel-east');
  walk(
    game,
    getRoom(game).objects.find((object) => object.kind === 'merchant'),
  );
  const contract = getLevelDefinition(game).shopItems.find(
    (offer) =>
      (game.equipment[offer.itemId] ?? 0) <
      getLevelDefinition(game).equipment[offer.itemId].maxRank,
  );
  assert.ok(contract);
  assert.equal(command(game, { type: 'buy', itemId: contract.itemId }).ok, true);
  door(game, 'market-north');
  fight(game);
  collectRoomRewards(game);
  door(game, 'warden-south');
  door(game, 'market-east');
  fight(game);
  assert.equal(game.status, 'won');
  assert.equal(game.stats.roomsVisited, 6);
  assert.equal(game.stats.bridgesDrawn, 1);
  assert.equal(game.stats.spent.explore, 8);
  assert.equal(game.stats.trades, 1);
  assert.equal(game.seals, 2);
  assert.equal(game.stats.enemiesDefeated, 20);
  assert.ok(game.stats.equipmentFound > 3);
});

test('free melee and dodge can recover from one life without requiring a consumable skill', () => {
  const game = fixture({
    initial: { ink: 1 },
    enemies: [{ type: 'blot', x: 270, y: 300, hp: 18, xp: 0, ink: 0 }],
  });
  fight(game, { meleeOnly: true });
  assert.equal(game.stats.spent.attack, 0);
  assert.equal(game.stats.spent.nova, 0);
  assert.ok(game.player.ink > 1);
  assert.equal(game.stats.enemiesDefeated, 1);
  assert.ok(game.stats.freeAttacks >= 4);
  assert.ok(game.stats.dashes >= 1);
});

test('full ink leaves a skill drop intact, and later missing life can consume it only once', () => {
  const game = fixture({
    initial: { ink: 100 },
    objects: [{ id: 'fill-ink', kind: 'chest', x: 150, y: 300, r: 24, reward: { ink: 6 } }],
  });
  tick(game, { shoot: true, aimX: 600, aimY: 300 });
  const drop = { ...reclaimDrops(game)[0] };
  openChest(game, 'fill-ink');
  assert.equal(game.player.ink, 100);
  tick(game, {}, 10);
  walk(game, drop, 10);
  tick(game, {}, 3);
  assert.equal(game.player.ink, 100);
  assert.ok(reclaimDrops(game).some((item) => item.id === drop.id));
  tick(game, { shoot: true, aimX: 600, aimY: 300 });
  assert.equal(game.player.ink, 100 - getPlayerStats(game).attackCost + drop.value);
  assert.equal(
    reclaimDrops(game).some((item) => item.id === drop.id),
    false,
  );
  assert.equal(game.stats.reclaimed, drop.value);
  tick(game, {}, 10);
  assert.equal(game.stats.reclaimed, drop.value);
});

test('tight spaces place droplets on legal floor and still require movement to reclaim', () => {
  const obstacles = [
    { x: 60, y: 60, w: 80, h: 10, kind: 'wall' },
    { x: 60, y: 130, w: 80, h: 10, kind: 'wall' },
    { x: 60, y: 70, w: 10, h: 60, kind: 'wall' },
    { x: 130, y: 70, w: 10, h: 60, kind: 'wall' },
  ];
  const game = fixture({ spawn: { x: 100, y: 100 }, obstacles });
  tick(game, { shoot: true, aimX: 600, aimY: 100 });
  const drop = reclaimDrops(game)[0];
  assert.ok(drop.x - drop.r >= 70 && drop.x + drop.r <= 130);
  assert.ok(drop.y - drop.r >= 70 && drop.y + drop.r <= 130);
  const afterSpend = game.player.ink;
  tick(game, {}, 20);
  assert.equal(
    game.player.ink,
    afterSpend,
    'a fallback drop underfoot must not enable stationary refunding',
  );
  tick(game, { moveX: 1 });
  tick(game, { moveX: -1 });
  tick(game, { moveX: 1 });
  assert.equal(game.player.ink, afterSpend + drop.value);
  assert.equal(reclaimDrops(game).length, 0);
});

test('room transitions preserve droplet ownership and teleport distance cannot count as reclamation movement', () => {
  const chapter = structuredClone(LEVELS['chapter-1']);
  const returnPoint = { x: 150 + Math.cos(0.7) * 80, y: 300 + Math.sin(0.7) * 80 };
  const base = {
    width: 960,
    height: 600,
    obstacles: [],
    bridges: [],
    objects: [],
    waves: [],
    enemySpawns: [],
  };
  chapter.id = 'reclaim-transitions';
  chapter.start = 'empty-leaf-a';
  chapter.spawn = { x: 150, y: 300 };
  chapter.rooms = [
    {
      ...base,
      id: 'empty-leaf-a',
      portals: [
        {
          id: 'leave',
          kind: 'portal',
          x: 150,
          y: 300,
          r: 43,
          target: 'empty-leaf-b',
          spawn: { x: 150, y: 300 },
        },
      ],
    },
    {
      ...base,
      id: 'empty-leaf-b',
      portals: [
        {
          id: 'return',
          kind: 'portal',
          x: 150,
          y: 300,
          r: 43,
          target: 'empty-leaf-a',
          spawn: returnPoint,
        },
      ],
    },
  ];
  const game = start(chapter);
  tick(game, { shoot: true, aimX: 600, aimY: 300 });
  tick(game, {}, 11);
  const drop = { ...reclaimDrops(game)[0] };
  closeTo(drop.x, returnPoint.x);
  closeTo(drop.y, returnPoint.y);
  assert.equal(command(game, { type: 'interact', objectId: 'leave' }).ok, true);
  assert.equal(reclaimDrops(game).length, 0);
  tick(game, {}, 10);
  closeTo(getRoom(game, 'empty-leaf-a').pickups[0].ttl, drop.ttl);
  assert.equal(command(game, { type: 'interact', objectId: 'return' }).ok, true);
  const before = game.player.ink;
  tick(game, {}, 3);
  assert.equal(game.player.ink, before);
  assert.equal(reclaimDrops(game).length, 1);
  tick(game, { moveX: 1 }, 2);
  assert.equal(game.player.ink, before + drop.value);
  assert.equal(reclaimDrops(game).length, 0);
});

test('saved nova fragments share a cast budget so duplicated partial refunds cannot inflate one cast', () => {
  const game = fixture();
  assert.equal(command(game, { type: 'nova' }).ok, true);
  const saved = JSON.parse(serializeGame(game));
  const drops = saved.rooms[saved.roomId].pickups;
  assert.equal(drops.length, 2);
  assert.equal(drops[0].castId, drops[1].castId);
  closeTo(
    drops.reduce((total, drop) => total + drop.value, 0),
    drops[0].returnBudget,
  );
  const doubled = structuredClone(saved);
  const copied = { ...doubled.rooms[doubled.roomId].pickups[0], id: 'extra-fragment' };
  doubled.rooms[doubled.roomId].pickups.push(copied);
  assert.equal(restoreGame(doubled, getLevelDefinition(game)), null);
  const oversized = structuredClone(saved);
  for (const item of oversized.rooms[oversized.roomId].pickups) item.value = item.sourceCost * 0.6;
  assert.equal(restoreGame(oversized, getLevelDefinition(game)), null);
  assert.ok(restoreGame(saved, getLevelDefinition(game)));
});

test('an empty final room completes through its chapter marker without a hardcoded boss id', () => {
  const game = fixture({ room: { isFinal: true, clearReward: { ink: 3 } } });
  assert.equal(game.status, 'playing');
  tick(game);
  assert.equal(game.status, 'won');
  assert.equal(getRoom(game).cleared, true);
  assert.equal(getRoom(game).rewardClaimed, true);
  const rewards = game.pickups.length;
  tick(game, {}, 20);
  assert.equal(game.pickups.length, rewards);
  assert.ok(restoreGame(serializeGame(game), getLevelDefinition(game)));
});
