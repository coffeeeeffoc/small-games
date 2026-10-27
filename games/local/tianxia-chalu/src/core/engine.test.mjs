import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEVELS,
  RULES,
  GENERAL_TYPES,
  createMatch,
  tick,
  switchRoute,
  setRoute,
  activeRoutes,
  getScore,
  getUnlockedLevels,
  applyResult,
  migrateProgress,
  effectSources,
  modifiersAt,
  positionOfPacket,
  positionOfGeneral,
  planRoutes,
} from './index.mjs';

const fresh = (options = {}) => createMatch({ seed: 0, aiEnabled: false, ...options });
const own = (s, f = 0) => s.cities.find((c) => c.owner === f);
const cityOfTest = (s, id) => s.cities.find((c) => c.id === id);
const junction = (s, c) => s.junctions.find((j) => j.cityId === c.id);
const freeze = (s) => {
  for (const c of s.cities) {
    c.production = 0;
    c.dispatchProgress = -1000;
  }
};
// Focused combat fixtures are synthetic; campaign simulations below only issue public commands.
function army(s, from, to, owner, troops, progress = 0.5, phase = 'road') {
  const road = s.roads.find(
    (r) => (r.a === from.id && r.b === to.id) || (r.a === to.id && r.b === from.id),
  );
  const p = {
    id: s.nextPacketId++,
    owner,
    troops,
    damage: 0,
    nextAttack: 0,
    fromCityId: from.id,
    targetCityId: to.id,
    junctionId: from.junctionId,
    roadId: phase === 'stationed' ? null : road.id,
    phase,
    from: { x: from.x, y: from.y },
    to: { x: to.x, y: to.y },
    progress,
    elapsed: 0,
    duration: road.length / (RULES.speed * road.speed),
    engaged: false,
  };
  s.packets.push(p);
  return p;
}
function general(s, city, kind = 'warrior', packet = null) {
  const t = GENERAL_TYPES[kind];
  const g = {
    id: s.nextGeneralId++,
    owner: city.owner,
    originCityId: city.id,
    cityId: packet ? null : city.id,
    packetId: packet?.id ?? null,
    kind,
    attack: t.attack,
    interval: t.interval,
    defense: t.defense,
    health: t.health,
    maxHealth: t.health,
    nextAttack: 0,
  };
  s.generals.push(g);
  return g;
}
function claim(s, city, owner) {
  city.owner = owner;
  junction(s, city).owner = owner;
}

test('initial ownership rotates fairly, every faction starts at zero and holds', () => {
  for (const level of LEVELS) {
    for (let seed = 0; seed < level.factions.length; seed++) {
      const s = fresh({ levelId: level.id, seed });
      assert.equal(s.spawns[0], level.spawnSets[0][seed]);
      assert.ok(s.cities.every((c) => c.troops === 0 && c.reserve === 0));
      assert.ok(s.junctions.every((j) => j.routeIndex === -1));
      assert.ok(s.junctions.every((j) => j.routeIndices.length === 0));
      for (const f of s.factions) {
        assert.equal(s.cities.filter((c) => c.owner === f).length, 1);
        assert.ok(
          effectSources(s).some(
            (source) => source.factionId === f && source.sourceType === 'baseline',
          ),
        );
        assert.equal(modifiersAt(s, f, own(s, f)).production, 0.08);
      }
    }
  }
});

test('hold, cycle, direct selection, ownership, type bounds and cooldown', () => {
  const s = fresh(),
    j = junction(s, own(s));
  assert.equal(switchRoute(s, 1, j.id).reason, 'not-owner');
  for (const index of [-2, j.exits.length, null, NaN, 0.5, '0'])
    assert.equal(switchRoute(s, 0, j.id, index).reason, 'invalid-route');
  for (const index of [0, 1, -1, 0]) {
    assert.equal(switchRoute(s, 0, j.id).routeIndex, index);
    assert.equal(switchRoute(s, 0, j.id).reason, 'cooldown');
    tick(s, 0.2);
  }
  assert.equal(switchRoute(s, 0, j.id, -1).ok, true);
  assert.equal(s.events.at(-1).type, 'hold');
  assert.deepEqual(s.events.at(-1).position, { x: own(s).x, y: own(s).y });
});

test('persistent targets are independent, idempotent, validated and compatible with old commands', () => {
  const s = fresh(),
    c = own(s),
    j = junction(s, c);
  assert.equal(setRoute(s, 1, j.id, 0).reason, 'not-owner');
  for (const index of [-1, j.exits.length, 0.5, '0', null])
    assert.equal(setRoute(s, 0, j.id, index).reason, 'invalid-route');
  assert.equal(setRoute(s, 0, j.id, 0, 'true').reason, 'invalid-enabled');
  assert.equal(setRoute(s, 0, j.id, 0).ok, true);
  const switches = s.stats.switches;
  assert.equal(setRoute(s, 0, j.id, 0).ok, true, 'an acknowledged setting can be retried');
  assert.equal(s.stats.switches, switches);
  assert.equal(setRoute(s, 0, j.id, 1).reason, 'cooldown');
  tick(s, 0.2);
  assert.deepEqual(setRoute(s, 0, j.id, 1).routeIndices, [0, 1]);
  tick(s, 0.2);
  assert.deepEqual(setRoute(s, 0, j.id, 0, false).routeIndices, [1]);
  assert.equal(j.routeIndex, 1);
  tick(s, 0.2);
  assert.deepEqual(switchRoute(s, 0, j.id, 0).routeIndices, [0]);
  tick(s, 0.2);
  switchRoute(s, 0, j.id, -1);
  assert.deepEqual(activeRoutes(j), []);
  assert.equal(j.routeIndex, -1);
  delete j.routeIndices;
  j.routeIndex = 1;
  delete c.dispatchWaves;
  delete c.dispatchCursor;
  c.troops = 10;
  c.dispatchProgress = RULES.dispatchInterval;
  assert.deepEqual(activeRoutes(j), [1], 'legacy JSON snapshots still dispatch');
  tick(s, 0.1);
  assert.ok(s.packets.some((p) => p.targetCityId === j.exits[1]));
});

test('multiple targets share one conserved wave and rotate scarce soldiers fairly', () => {
  const s = fresh();
  freeze(s);
  const c = s.cities.find((v) => junction(s, v).exits.length === 3),
    j = junction(s, c);
  claim(s, c, 0);
  for (let index = 0; index < j.exits.length; index++) {
    assert.equal(setRoute(s, 0, j.id, index).ok, true);
    tick(s, 0.2);
  }
  c.troops = 60;
  c.dispatchProgress = RULES.dispatchInterval;
  const single = structuredClone(s);
  switchRoute(single, 0, j.id, 0);
  tick(s, 0.1);
  tick(single, 0.1);
  const sent = s.packets.filter((p) => p.fromCityId === c.id && p.phase === 'road');
  const total = sent.reduce((sum, p) => sum + p.troops, 0);
  assert.equal(new Set(sent.map((p) => p.targetCityId)).size, 3);
  assert.equal(total + c.troops, 60);
  assert.equal(
    total,
    single.packets.reduce((sum, p) => sum + p.troops, 0),
  );
  assert.ok(Math.max(...sent.map((p) => p.troops)) - Math.min(...sent.map((p) => p.troops)) <= 1);

  const scarce = structuredClone(s),
    scarceCity = cityOfTest(scarce, c.id);
  scarce.packets = [];
  scarceCity.dispatchCursor = 0;
  const destinations = [];
  for (let wave = 0; wave < 3; wave++) {
    scarceCity.troops = 1;
    scarceCity.dispatchProgress = RULES.dispatchInterval;
    tick(scarce, 0.1);
    destinations.push(scarce.packets.at(-1).targetCityId);
  }
  assert.equal(new Set(destinations).size, 3);
});

test('removing one target stops only future waves and capture clears every old route', () => {
  const s = fresh();
  freeze(s);
  const c = own(s),
    j = junction(s, c);
  c.troops = 60;
  setRoute(s, 0, j.id, 0);
  tick(s, 0.2);
  setRoute(s, 0, j.id, 1);
  c.dispatchProgress = RULES.dispatchInterval;
  tick(s, 0.2);
  const departed = s.packets.filter((p) => p.owner === 0);
  const oldTargets = departed.map((p) => p.targetCityId);
  setRoute(s, 0, j.id, 0, false);
  const nextPacket = s.nextPacketId;
  tick(s, 1.5);
  assert.deepEqual(
    departed.map((p) => p.targetCityId),
    oldTargets,
  );
  assert.ok(
    s.packets.filter((p) => p.id >= nextPacket).every((p) => p.targetCityId === j.exits[1]),
  );
  assert.deepEqual(j.routeIndices, [1]);
  setRoute(s, 0, j.id, 0);
  assert.equal(j.routeIndices.length, 2);
  c.troops = 0;
  c.dispatchProgress = -1000;
  army(s, cityOfTest(s, j.exits[0]), c, 1, 50, 1, 'siege');
  tick(s, 0.1);
  assert.equal(c.owner, 1);
  assert.deepEqual(j.routeIndices, []);
  assert.equal(c.dispatchWaves, 0);
});

test('large armies launch earlier and larger waves, and defeat weaker equal-supply opponents', () => {
  for (const [strongCount, weakCount] of [
    [60, 20],
    [120, 30],
    [300, 60],
  ]) {
    for (let seed = 0; seed < 8; seed++) {
      const s = fresh({ seed });
      s.sources = [];
      for (const c of s.cities) claim(s, c, null);
      const a = s.cities[0],
        b = cityOfTest(s, junction(s, a).exits[0]);
      claim(s, a, 0);
      claim(s, b, 1);
      a.troops = strongCount;
      b.troops = weakCount;
      setRoute(s, 0, a.junctionId, junction(s, a).exits.indexOf(b.id));
      setRoute(s, 1, b.junctionId, junction(s, b).exits.indexOf(a.id));
      while (s.time < 1.2) tick(s, 0.1);
      const strong = s.packets.filter((p) => p.owner === 0 && p.phase === 'road');
      const weak = s.packets.filter((p) => p.owner === 1 && p.phase === 'road');
      assert.ok(strong[0].departedAt < weak[0].departedAt);
      const firstWave = (packets) =>
        packets
          .filter((p) => p.departedAt === packets[0].departedAt)
          .reduce((sum, p) => sum + p.troops, 0);
      assert.ok(firstWave(strong) > firstWave(weak));
      tick(s, 65);
      assert.equal(b.owner, 0, `${strongCount}:${weakCount}, seed ${seed} stalled`);
      assert.equal(s.result?.winnerId, 0);
    }
  }
});

test('continuous reinforcement builds larger, faster waves with bounded seeded variation', () => {
  const s = fresh();
  freeze(s);
  const c = own(s);
  setRoute(s, 0, c.junctionId, 0);
  c.dispatchProgress = 0;
  const waves = [];
  for (let step = 0; step < 120 && waves.length < 10; step++) {
    // A steady supply fixture isolates momentum from changes in the available army.
    c.troops = 60;
    const before = c.dispatchWaves;
    tick(s, 0.1);
    if (c.dispatchWaves > before) {
      const packets = s.packets.filter((p) => p.fromCityId === c.id && p.departedAt === s.time);
      waves.push({ at: s.time, troops: packets.reduce((sum, p) => sum + p.troops, 0) });
    }
  }
  assert.equal(waves.length, 10);
  assert.ok(waves[9].at - waves[6].at < waves[3].at - waves[0].at);
  assert.ok(
    waves.slice(-3).reduce((n, w) => n + w.troops, 0) >
      waves.slice(0, 3).reduce((n, w) => n + w.troops, 0),
  );
  assert.ok(new Set(waves.map((w) => w.troops)).size > 1);
});

test('hold produces to capacity, resumes without a production burst or forced reserve', () => {
  const s = fresh(),
    c = own(s),
    neutral = s.cities.find((city) => city.owner === null);
  tick(s, 60);
  assert.equal(c.troops, c.capacity);
  assert.equal(c.productionProgress, 0);
  assert.equal(s.packets.length, 0);
  assert.equal(neutral.troops, 0);
  switchRoute(s, 0, c.junctionId, 0);
  tick(s, 2);
  assert.ok(s.packets[0].troops > RULES.packetSize);
  assert.ok(c.troops < c.capacity - RULES.packetSize);
  const total = getScore(s).find((r) => r.factionId === 0).troops;
  assert.ok(total >= c.capacity && total <= c.capacity + 3, 'no stored production burst');
  const second = fresh();
  tick(second, 2);
  switchRoute(second, 0, own(second).junctionId, 0);
  tick(second, 2);
  assert.ok(second.packets.some((p) => p.owner === 0 && p.troops > 0));
  assert.ok(own(second).troops <= 1, 'small garrisons retain no forced reserve');
});

test('departed armies retain their target after hold or a new command; capture defaults hold', () => {
  const s = fresh(),
    c = own(s);
  tick(s, 3);
  switchRoute(s, 0, c.junctionId, 0);
  tick(s, 2);
  const p = s.packets[0],
    target = p.targetCityId;
  switchRoute(s, 0, c.junctionId, -1);
  tick(s, 7);
  assert.equal(p.targetCityId, target);
  const captured = s.cities.find((city) => city.id === target);
  assert.equal(captured.owner, 0);
  assert.equal(junction(s, captured).routeIndex, -1);
  assert.deepEqual(junction(s, captured).routeIndices, []);
  assert.equal(captured.recruitProgress, 0);
});

test('friendly overflow remains visible, is counted and dispatches before garrison', () => {
  const s = fresh();
  freeze(s);
  const c = own(s),
    from = s.cities.find((v) => v.id === junction(s, c).exits[0]);
  c.troops = c.capacity;
  const p = army(s, from, c, 0, 12, 1, 'siege');
  tick(s, 0.1);
  assert.equal(c.troops, c.capacity);
  assert.equal(p.troops, 12);
  assert.equal(p.phase, 'stationed');
  assert.equal(getScore(s).find((r) => r.factionId === 0).troops, c.capacity + 12);
  c.dispatchProgress = 0;
  switchRoute(s, 0, c.junctionId, 0);
  for (let step = 0; step < 20 && c.dispatchWaves === 0; step++) tick(s, 0.1);
  assert.equal(c.dispatchWaves, 1);
  const departing = s.packets.filter((v) => v.phase === 'road').reduce((n, v) => n + v.troops, 0);
  assert.equal(p.phase, 'road', 'overflow departs before any garrison soldiers');
  assert.equal(p.troops, 12);
  assert.ok(departing > RULES.packetSize);
  assert.equal(c.troops + departing, c.capacity + 12);
});

test('overflow participates in defense and cannot become a captor-owned army', () => {
  const s = fresh();
  freeze(s);
  const c = own(s),
    from = s.cities.find((v) => v.id === junction(s, c).exits[0]);
  const defender = army(s, from, c, 0, 6, 1, 'stationed');
  c.troops = c.capacity;
  army(s, from, c, 1, 200, 1, 'siege');
  tick(s, 10);
  assert.equal(c.owner, 1);
  assert.ok(!s.packets.includes(defender));
  assert.equal(c.troops <= c.capacity, true);
  assert.ok(s.packets.every((p) => p.owner === 1));
});

test('opposing armies stop on their road and damage resolves simultaneously', () => {
  const s = fresh();
  freeze(s);
  const a = own(s),
    b = s.cities.find((c) => c.id === junction(s, a).exits[0]);
  const p = army(s, a, b, 0, 8, 0.49),
    q = army(s, b, a, 1, 8, 0.49);
  const reversed = structuredClone(s);
  reversed.packets.reverse();
  tick(s, 1);
  tick(reversed, 1);
  assert.deepEqual(s, reversed);
  assert.ok(p.engaged && q.engaged);
  assert.ok(p.troops > 0 && q.troops > 0);
  assert.deepEqual(positionOfPacket(s, p), positionOfPacket(s, q));
  const pos = positionOfPacket(s, p);
  tick(s, 0.2);
  assert.deepEqual(positionOfPacket(s, p), pos);
  tick(s, 12);
  assert.equal(s.packets.length, 0, 'equal armies die together without array-order advantage');
});

test('victor continues its original direction; friendly traffic passes', () => {
  const s = fresh();
  freeze(s);
  const a = own(s),
    b = s.cities.find((c) => c.id === junction(s, a).exits[0]);
  const strong = army(s, a, b, 0, 16, 0.49);
  army(s, b, a, 1, 2, 0.49);
  tick(s, 1);
  assert.equal(strong.targetCityId, b.id);
  assert.ok(strong.progress > 0.5);
  assert.ok(strong.troops > 0);
  const friends = fresh();
  freeze(friends);
  const x = army(friends, friends.cities[0], friends.cities[1], 0, 2, 0.49),
    y = army(friends, friends.cities[1], friends.cities[0], 0, 2, 0.49);
  tick(friends, 0.2);
  assert.ok(x.progress > 0.5 && y.progress > 0.5);
  assert.equal(x.engaged, false);
});

test('intersecting geometry on different roads never triggers a road battle', () => {
  const s = fresh();
  freeze(s);
  const p = army(s, s.cities[0], s.cities[1], 0, 5),
    q = army(s, s.cities[2], s.cities[3], 1, 5);
  p.from = q.from = { x: 100, y: 100 };
  p.to = q.to = { x: 200, y: 200 };
  tick(s, 0.5);
  assert.equal(p.troops, 5);
  assert.equal(q.troops, 5);
  assert.equal(p.engaged, false);
});

test('fast and slow roads move actual armies at their declared speed; local speed aura ends out of range', () => {
  const level = LEVELS.find((l) =>
    ['fast', 'slow'].every((type) => l.roads.some((r) => r.type === type)),
  );
  const s = fresh({ levelId: level.id });
  freeze(s);
  const travelled = {};
  for (const type of ['fast', 'slow']) {
    const r = s.roads.find((v) => v.type === type);
    const p = army(
      s,
      s.cities.find((c) => c.id === r.a),
      s.cities.find((c) => c.id === r.b),
      0,
      2,
      0,
    );
    const start = positionOfPacket(s, p);
    tick(s, 0.1);
    const end = positionOfPacket(s, p);
    travelled[type] = Math.hypot(end.x - start.x, end.y - start.y);
  }
  assert.ok(Math.abs(travelled.fast / travelled.slow - 1.35 / 0.7) < 1e-8);
  const buffed = fresh({ loadout: [{ kind: 'speed', tier: 3 }] });
  freeze(buffed);
  const c = own(buffed),
    target = buffed.cities.find((v) => v.id === junction(buffed, c).exits[0]);
  const p = army(buffed, c, target, 0, 2, 0);
  assert.equal(modifiersAt(buffed, 0, positionOfPacket(buffed, p)).speed, 0.36);
  tick(buffed, 2);
  assert.equal(modifiersAt(buffed, 0, positionOfPacket(buffed, p)).speed, 0);
});

test('fortification absorbs damage before troops; neutral zero troop city retains ownership until entered', () => {
  const s = fresh();
  freeze(s);
  const a = own(s),
    b = s.cities.find((c) => c.id === junction(s, a).exits[0]);
  b.baseFortification = b.fortification = 40;
  b.troops = 2;
  army(s, a, b, 0, 8, 1, 'siege');
  tick(s, 0.1);
  assert.equal(b.fortification, 20);
  assert.equal(b.troops, 2);
  assert.equal(b.owner, null);
  tick(s, 12);
  assert.equal(b.owner, 0);
  assert.equal(b.fortification, 0);
  const empty = fresh();
  freeze(empty);
  tick(empty, 1);
  assert.equal(own(empty).owner, 0);
});

test('weapons have distinct cooldowns, range, splash, and capture rearming', () => {
  const totals = {};
  for (const kind of ['crossbow', 'catapult', 'cannon']) {
    const s = fresh();
    freeze(s);
    const c = own(s),
      from = s.cities.find((v) => v.id === junction(s, c).exits[0]);
    c.troops = 0;
    c.baseFortification = c.fortification = 10000;
    c.weapon = { kind, readyAt: 0, nextFire: 0, sourceOwner: null };
    const a = army(s, from, c, 1, 20, 1, 'siege'),
      b = army(s, from, c, 1, 20, 1, 'siege');
    tick(s, 0.1);
    totals[kind] = 40 - a.troops - b.troops + (a.damage + b.damage) / 10;
    assert.equal(s.events.filter((e) => e.type === 'fire').length, 1);
    if (kind === 'catapult') assert.ok(a.damage > 0 && b.damage > 0);
    else assert.equal(b.damage, 0);
    tick(s, 0.5);
    assert.equal(s.events.filter((e) => e.type === 'fire').length, 1);
  }
  assert.ok(totals.cannon > totals.crossbow);
  const s = fresh();
  freeze(s);
  const c = own(s),
    from = s.cities.find((v) => v.id === junction(s, c).exits[0]);
  c.weapon = { kind: 'crossbow', nextFire: 100, readyAt: 0, sourceOwner: null };
  army(s, from, c, 1, 10, 1, 'siege');
  tick(s, 0.1);
  assert.equal(c.owner, 1);
  assert.equal(c.weapon.readyAt, s.time + 3);
});

test('territory percentage absorbs real damage and does not regenerate damaged walls', () => {
  const s = fresh({ loadout: [{ kind: 'territory', tier: 3 }] });
  freeze(s);
  const c = own(s),
    from = s.cities.find((v) => v.id === junction(s, c).exits[0]);
  assert.equal(c.maxFortification, 24 * 1.36);
  assert.equal(c.fortification, c.maxFortification);
  const p = army(s, from, c, 1, 10, 1, 'siege');
  tick(s, 0.1);
  assert.ok(Math.abs(c.fortification - (24 * 1.36 - 25)) < 1e-8);
  assert.equal(c.owner, 0);
  p.troops = 0;
  const damaged = c.fortification;
  tick(s, 3);
  assert.equal(c.fortification, damaged);
});

test('full and split dispatch conserve wounds from actual combat', () => {
  for (const count of [1, 12]) {
    const s = fresh();
    freeze(s);
    const c = own(s),
      j = junction(s, c);
    const from = s.cities.find((v) => v.id === j.exits[0]);
    c.troops = count;
    const attacker = army(s, from, c, 1, 1, 1, 'siege');
    tick(s, 0.1);
    assert.ok(c.damage > 0);
    const wounds = c.damage;
    attacker.troops = 0;
    c.dispatchProgress = RULES.dispatchInterval;
    switchRoute(s, 0, j.id, 0);
    tick(s, 0.1);
    const sent = s.packets.find((p) => p.owner === 0);
    assert.ok(sent);
    assert.ok(Math.abs(sent.damage + c.damage - wounds) < 1e-8);
    assert.ok(Math.abs(sent.damage - (wounds * sent.troops) / count) < 1e-8);
    if (count === 1) {
      assert.equal(c.troops, 0);
      assert.equal(c.damage, 0);
    }
  }
});

test('six general types have real distinct stats, follow troops, and return to a friendly garrison', () => {
  assert.equal(Object.keys(GENERAL_TYPES).length, 6);
  assert.equal(new Set(Object.values(GENERAL_TYPES).map((g) => g.aura)).size, 6);
  const s = fresh();
  freeze(s);
  const c = own(s),
    next = s.cities.find((v) => v.id === junction(s, c).exits[0]);
  claim(s, next, 0);
  const g = general(s, c);
  c.troops = 5;
  c.dispatchProgress = 0;
  switchRoute(s, 0, c.junctionId, 0);
  tick(s, 2);
  assert.equal(g.cityId, null);
  assert.equal(typeof g.packetId, 'number');
  assert.deepEqual(positionOfGeneral(s, g), positionOfPacket(s, s.packets[0]));
  switchRoute(s, 0, c.junctionId, -1);
  tick(s, 8);
  assert.equal(g.cityId, next.id);
  assert.equal(g.packetId, null);
});

test('continuous recruitment pauses during siege, caps per source/faction and resets on loss', () => {
  const s = fresh({ levelId: 'campaign-071' });
  freeze(s);
  for (const city of s.cities) city.weapon = null;
  const c = s.cities.find((v) => v.type === 'muster');
  claim(s, c, 0);
  c.baseFortification = c.fortification = 10000;
  tick(s, 10);
  assert.ok(c.recruitProgress >= 9.9 && c.recruitProgress < 11);
  const from = s.cities.find((v) => v.id === junction(s, c).exits[0]);
  const attacker = army(s, from, c, 1, 1, 1, 'siege');
  const before = c.recruitProgress;
  tick(s, 2);
  assert.equal(c.recruitProgress, before);
  attacker.troops = 0;
  tick(s, 11);
  assert.equal(s.generals.filter((g) => g.originCityId === c.id).length, 1);
  tick(s, 30);
  assert.equal(s.generals.filter((g) => g.originCityId === c.id).length, 1);
  assert.equal(c.recruitProgress, 0);
  const all = s.cities.filter((v) => v.type === 'muster');
  for (const v of all) claim(s, v, 0);
  tick(s, 22);
  assert.equal(s.generals.filter((g) => g.owner === 0).length, 2);
  assert.ok(
    all
      .filter((v) => !s.generals.some((g) => g.originCityId === v.id))
      .every((v) => v.recruitProgress === 0),
  );
  const other = all.find((v) => !s.generals.some((g) => g.cityId === v.id));
  other.recruitProgress = 7;
  other.baseFortification = other.fortification = 0;
  army(
    s,
    s.cities.find((v) => v.id === junction(s, other).exits[0]),
    other,
    1,
    10,
    1,
    'siege',
  );
  tick(s, 0.1);
  assert.equal(other.owner, 1);
  assert.equal(other.recruitProgress, 0);
});

test('general and card auras are local, source bound, highest-of-kind and jointly capped', () => {
  const s = fresh({
      loadout: [
        { kind: 'attack', tier: 3 },
        { kind: 'attack', tier: 0 },
      ],
    }),
    c = own(s),
    g = general(s, c);
  assert.equal(modifiersAt(s, 0, c).attack, 0.36);
  assert.equal(modifiersAt(s, 1, c).attack, 0);
  assert.equal(modifiersAt(s, 0, { x: c.x + 200, y: c.y }).attack, 0);
  for (const kind of ['speed', 'rate', 'defense', 'health'])
    s.sources.push({ id: kind, cityId: c.id, factionId: 0, kind, radius: 95, value: 0.5 });
  assert.ok(
    Object.values(modifiersAt(s, 0, c)).reduce((a, b) => a + b, 0) <= RULES.bonusCap + 1e-9,
  );
  claim(s, c, 1);
  assert.equal(effectSources(s).filter((v) => v.factionId === 0).length, 0);
  assert.equal(modifiersAt(s, 0, c).attack, 0);
  assert.ok(g.health > 0);
});

test('moving/dead generals immediately lose their aura and death starts recruitment cooldown', () => {
  const s = fresh();
  freeze(s);
  const c = own(s),
    target = s.cities.find((v) => v.id === junction(s, c).exits[0]);
  const g = general(s, c);
  assert.equal(modifiersAt(s, 0, c).attack, 0.22);
  const p = army(s, c, target, 0, 0, 0.9);
  g.cityId = null;
  g.packetId = p.id;
  assert.equal(modifiersAt(s, 0, c).attack, 0);
  const q = army(s, target, c, 1, 1000, 0.1);
  tick(s, 0.1);
  assert.equal(s.generals.length, 0);
  assert.equal(c.recruitReadyAt, s.time + RULES.recruitCooldown);
  assert.ok(q.troops > 0);
  assert.ok(!effectSources(s).some((source) => source.sourceType === 'general'));
});

test('all card kinds are bounded, meaningful local sources; duplicate reinforcement uses highest', () => {
  for (const kind of [
    'troops',
    'production',
    'attack',
    'rate',
    'defense',
    'health',
    'speed',
    'general',
    'weapon',
    'territory',
  ]) {
    const s = fresh({ loadout: [{ kind, tier: 3 }] }),
      c = own(s);
    assert.ok(effectSources(s).some((v) => v.kind === kind && v.sourceType === 'card'));
    assert.equal(own(s, 1).troops, 0);
    if (kind === 'troops') assert.equal(c.troops, 16);
    else if (kind === 'general') {
      assert.ok(c.generalKind);
      tick(s, 16);
      assert.equal(s.generals.length, 1);
    } else if (kind === 'weapon') assert.equal(c.weapon.kind, 'crossbow');
    else if (kind === 'territory') {
      assert.ok(c.capacity > RULES.capacity);
      assert.ok(c.fortification > 0);
    } else assert.ok(modifiersAt(s, 0, c)[kind] > 0);
  }
  assert.equal(
    own(
      fresh({
        loadout: [
          { kind: 'troops', tier: 0 },
          { kind: 'troops', tier: 3 },
        ],
      }),
    ).troops,
    16,
  );
  for (const loadout of [
    null,
    {},
    [null],
    [{ kind: 'attack', tier: 4 }],
    [{ kind: 'attack', tier: -1 }],
    [{ kind: 'attack', tier: 1.1 }],
    [{ kind: 'attack', tier: 0, power: 9 }],
    [{ kind: 'unknown', tier: 0 }],
    Array(3).fill({ kind: 'attack', tier: 0 }),
  ])
    assert.throws(() => fresh({ loadout }), /Loadout/);
});

test('health, defense, attack and rate alter actual battle damage, not just display', () => {
  const losses = (kind) => {
    const s = fresh({ loadout: kind ? [{ kind, tier: 3 }] : [] });
    freeze(s);
    const c = own(s),
      target = s.cities.find((v) => v.id === junction(s, c).exits[0]);
    c.troops = 20;
    const p = army(s, target, c, 1, 20, 1, 'siege');
    tick(s, 2.6);
    return { defenders: c.troops, attackers: p.troops };
  };
  const base = losses();
  assert.ok(losses('health').defenders > base.defenders);
  assert.ok(losses('defense').defenders > base.defenders);
  assert.ok(losses('attack').attackers < base.attackers);
  assert.ok(losses('rate').attackers < base.attackers);
});

test('AI chooses expansion, holds for strength, and supplies along decreasing front distance', () => {
  const s = fresh();
  freeze(s);
  const c = own(s);
  assert.equal(planRoutes(s, 0)[0].routeIndex, -1);
  c.troops = 10;
  assert.notEqual(planRoutes(s, 0)[0].routeIndex, -1);
  for (const id of junction(s, c).exits)
    claim(
      s,
      s.cities.find((v) => v.id === id),
      0,
    );
  const route = planRoutes(s, 0).find((v) => v.junctionId === c.junctionId);
  assert.notEqual(route.routeIndex, -1);
  assert.equal(s.cities.find((v) => v.id === junction(s, c).exits[route.routeIndex]).owner, 0);
  for (const v of s.cities)
    if (v.owner === 1) {
      v.troops = 60;
      v.baseFortification = v.fortification = 45;
    }
  const front = s.cities.find((v) => v.owner === 0 && v !== c);
  front.troops = 0;
  assert.equal(planRoutes(s, 0).find((v) => v.junctionId === front.junctionId).routeIndex, -1);
});

test('seed, command stream and JSON snapshots replay identically across chunk sizes', () => {
  const a = createMatch({
    levelId: 'campaign-071',
    seed: 'replay',
    loadout: [{ kind: 'general', tier: 2 }],
  });
  const b = structuredClone(a);
  tick(a, 30);
  for (let i = 0; i < 300; i++) tick(b, 0.1);
  assert.deepEqual(a, b);
  const clone = JSON.parse(JSON.stringify(a));
  for (const command of planRoutes(a, 0)) {
    switchRoute(a, 0, command.junctionId, command.routeIndex);
    switchRoute(clone, 0, command.junctionId, command.routeIndex);
  }
  tick(a, 10);
  tick(clone, 10);
  assert.deepEqual(a, clone);
  const easy = fresh({ difficulty: 'easy' }),
    hard = fresh({ difficulty: 'hard' });
  assert.deepEqual(easy.cities, hard.cities);
  assert.deepEqual(easy.roads, hard.roads);
  assert.ok(easy.ai[0].nextDecision > hard.ai[0].nextDecision);
  for (const seed of [NaN, Infinity, -1, 0x100000000, '', 'a'.repeat(129), {}, null])
    assert.throws(() => fresh({ seed }), /Seed/);
  for (const seconds of [-1, NaN, Infinity]) assert.throws(() => tick(a, seconds), /duration/);
});

test('elimination includes surviving armies and generals; player death does not end other factions', () => {
  const s = fresh({ levelId: 'four-kingdoms' });
  freeze(s);
  const c = own(s),
    target = s.cities.find((v) => v.id === junction(s, c).exits[0]);
  const g = general(s, c),
    p = army(s, c, target, 0, 0, 0);
  g.cityId = null;
  g.packetId = p.id;
  claim(s, c, 1);
  tick(s, 0.1);
  assert.equal(s.eliminatedAt[0], null);
  assert.equal(getScore(s).find((r) => r.factionId === 0).alive, true);
  g.health = 0;
  tick(s, 0.1);
  assert.equal(s.eliminatedAt[0], 0.2);
  assert.equal(s.status, 'playing');
  const c2 = own(s, 2);
  claim(s, c2, 1);
  tick(s, 0.1);
  assert.ok(
    getScore(s).find((r) => r.factionId === 2).rank <
      getScore(s).find((r) => r.factionId === 0).rank,
  );
});

test('survivors rank by cities then all troops; ties share rank and natural results are eligible', () => {
  const s = fresh({ levelId: 'four-kingdoms' });
  freeze(s);
  own(s, 0).troops = 10;
  own(s, 1).troops = 10;
  own(s, 2).troops = 5;
  own(s, 3).troops = 1;
  assert.deepEqual(
    getScore(s).map((r) => r.rank),
    [1, 1, 3, 4],
  );
  tick(s, s.duration);
  assert.equal(s.result.outcome, 'draw');
  assert.equal(s.result.reason, 'timeout');
  assert.equal(s.result.completed, true);
  assert.equal(s.result.rewardEligible, true);
  const finished = structuredClone(s);
  tick(s, 5);
  assert.deepEqual(s, finished);
  assert.equal(switchRoute(s, 0, own(s).junctionId).reason, 'match-finished');
  const win = fresh();
  freeze(win);
  claim(win, own(win, 1), 0);
  tick(win, 0.1);
  assert.equal(win.result.winnerId, 0);
  assert.equal(win.result.reason, 'elimination');
});

test('legacy completed IDs survive, new chapters unlock sequentially, incomplete/abandoned results grant nothing', () => {
  const p = migrateProgress({
    version: 1,
    completed: ['crossroads', 'riverfork', 'four-kingdoms', 'unknown'],
    stars: { crossroads: 8 },
    best: { crossroads: -2 },
  });
  assert.equal(p.version, 2);
  assert.equal(p.completed.length, 3);
  assert.equal(p.stars.crossroads, 3);
  assert.equal(p.best.crossroads, 0);
  assert.ok(getUnlockedLevels(p).includes('campaign-002'));
  assert.ok(getUnlockedLevels(p).includes('four-kingdoms'));
  const progress = {},
    result = { levelId: 'crossroads', outcome: 'victory', stars: 2, score: 4100 };
  applyResult(progress, result);
  assert.deepEqual(progress.completed, []);
  applyResult(progress, { ...result, completed: true, reason: 'abandoned' });
  assert.deepEqual(progress.completed, []);
  applyResult(progress, { ...result, completed: true, reason: 'timeout' });
  assert.deepEqual(getUnlockedLevels(progress), ['crossroads', 'campaign-002']);
  const before = structuredClone(progress);
  applyResult(progress, { ...result, completed: true, reason: 'timeout' });
  assert.deepEqual(progress, before);
});

test('real command-only pilots finish a representative tutorial, weapon and general map', () => {
  for (const levelId of ['crossroads', 'campaign-051', 'campaign-071']) {
    const s = createMatch({ levelId, seed: 2 });
    while (s.status === 'playing') {
      for (const c of planRoutes(s, 0, 'aggressive'))
        if (s.junctions.find((j) => j.id === c.junctionId).routeIndex !== c.routeIndex)
          switchRoute(s, 0, c.junctionId, c.routeIndex);
      tick(s, 4);
    }
    assert.ok(s.result.completed);
    assert.equal(s.result.rankings.length, s.factions.length);
    assert.ok(
      s.cities.every((c) => Number.isInteger(c.troops) && c.troops >= 0 && c.troops <= c.capacity),
    );
    assert.ok(
      s.packets.every((p) => Number.isFinite(p.progress) && p.progress >= 0 && p.progress <= 1),
    );
    assert.ok(
      s.events.every(
        (e) =>
          Number.isFinite(e.position.x) &&
          Number.isFinite(e.position.y) &&
          Object.hasOwn(e, 'factionId'),
      ),
    );
  }
});
