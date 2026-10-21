import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { LEVELS, validateLevels, getLevel, createMatch } from '../src/core/index.mjs';

test('100 explicit configs, ten chapters, stable IDs, unique coordinate/road signatures and touch spacing', async () => {
  assert.deepEqual(validateLevels(), { valid: true, errors: [] });
  assert.equal(LEVELS.length, 100);
  assert.equal(
    (await readdir(new URL('../src/content/maps/', import.meta.url))).filter((f) =>
      f.endsWith('.mjs'),
    ).length,
    100,
  );
  assert.equal(LEVELS[0].id, 'crossroads');
  assert.equal(LEVELS[2].id, 'riverfork');
  assert.equal(LEVELS[4].id, 'four-kingdoms');
  for (let chapter = 1; chapter <= 10; chapter++)
    assert.equal(LEVELS.filter((l) => l.chapter === chapter).length, 10);
  const signatures = new Set();
  for (const [i, l] of LEVELS.entries()) {
    assert.equal(l.order, i + 1);
    assert.deepEqual(l.requires, i ? [LEVELS[i - 1].id] : []);
    assert.equal(l.reward.unlock, LEVELS[i + 1]?.id ?? null);
    assert.ok(l.cities.length >= 4 && l.cities.length <= 12);
    for (const a of l.cities)
      for (const b of l.cities) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 64);
    const signature = JSON.stringify([
      l.cities.map((c) => [c.x, c.y]),
      l.roads.map((r) => [[r.a, r.b].sort(), r.type]).sort(),
    ]);
    assert.ok(!signatures.has(signature), `duplicate road/coordinate configuration: ${l.id}`);
    signatures.add(signature);
    const source = await readFile(
      new URL(`../src/content/maps/${l.id}.mjs`, import.meta.url),
      'utf8',
    );
    assert.ok(source.startsWith('// Explicit campaign configuration;'));
    assert.ok(source.includes('export default {'));
    assert.ok(!source.includes('Math.random'));
    assert.ok(
      l.roads.every(
        (r) =>
          l.cities.find((c) => c.id === r.a).junction.exits.includes(r.b) &&
          l.cities.find((c) => c.id === r.b).junction.exits.includes(r.a),
      ),
    );
  }
});

test('content progression introduces supply, roads, passes, weapons and six general types', () => {
  assert.ok(!LEVELS.slice(0, 10).some((l) => l.cities.some((c) => c.type !== 'town')));
  assert.ok(LEVELS.slice(10, 20).some((l) => l.cities.some((c) => c.type === 'barracks')));
  assert.ok(LEVELS.slice(20, 30).some((l) => l.roads.some((r) => r.type === 'fast')));
  assert.ok(LEVELS.slice(20, 30).some((l) => l.roads.some((r) => r.type === 'slow')));
  assert.ok(LEVELS.slice(40, 50).some((l) => l.cities.some((c) => c.type === 'pass')));
  assert.equal(
    new Set(LEVELS.slice(50, 60).flatMap((l) => l.cities.map((c) => c.weapon).filter(Boolean)))
      .size,
    3,
  );
  assert.equal(
    new Set(LEVELS.slice(60, 70).flatMap((l) => l.cities.map((c) => c.general).filter(Boolean)))
      .size,
    6,
  );
});

test('schema rejects malformed objects, unknown fields, duplicate roads, invalid budgets and cyclic unlocks', () => {
  for (const malformed of [null, {}, [], [null], [{ id: 'bad' }]])
    assert.equal(validateLevels(malformed).valid, false);
  for (const mutate of [
    (l) => {
      l.extra = true;
    },
    (l) => {
      l.duration = 0;
    },
    (l) => {
      l.order = 2;
    },
    (l) => {
      l.cities[0].troops = 1;
    },
    (l) => {
      l.cities[0].reserve = 8;
    },
    (l) => {
      l.cities[0].owner = 0;
    },
    (l) => {
      l.cities[0].x = NaN;
    },
    (l) => {
      l.cities[0].weapon = 'laser';
    },
    (l) => {
      l.cities[0].general = 'ghost';
    },
    (l) => {
      l.cities[1].x = l.cities[0].x;
      l.cities[1].y = l.cities[0].y;
    },
    (l) => {
      l.cities[0].junction.exits.pop();
    },
    (l) => {
      l.cities[0].junction.routeIndex = 0;
    },
    (l) => {
      l.roads.push({ ...l.roads[0], id: 'duplicate', a: l.roads[0].b, b: l.roads[0].a });
    },
    (l) => {
      l.roads[0].a = 'unknown';
    },
    (l) => {
      l.roads[0].type = 'teleport';
    },
    (l) => {
      l.spawnSets[0][1] = l.spawnSets[0][0];
    },
    (l) => {
      l.cities[0].type = 'barracks';
    },
    (l) => {
      l.baseline.value = 9;
    },
    (l) => {
      l.factions = [0, 0];
    },
    (l) => {
      l.reward.unlock = 'missing';
    },
    (l) => {
      l.requires = [LEVELS.at(-1).id];
    },
  ]) {
    const levels = structuredClone(LEVELS);
    mutate(levels[0]);
    assert.equal(validateLevels(levels).valid, false, String(mutate));
  }
  assert.throws(() => getLevel('missing'), /Unknown level/);
});

test('all legal spawn sets can be reached by seeds and retries preserve exact initial state', () => {
  for (const l of LEVELS)
    for (let set = 0; set < l.spawnSets.length; set++) {
      const seed = set * l.factions.length;
      const a = createMatch({ levelId: l.id, seed }),
        b = createMatch({ levelId: l.id, seed });
      assert.deepEqual(a, b);
      assert.equal(a.spawnSetIndex, set);
      assert.deepEqual(Object.values(a.spawns), l.spawnSets[set]);
    }
});
