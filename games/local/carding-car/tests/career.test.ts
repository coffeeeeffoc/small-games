import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { Career, shopItems, milestones, type CareerFinish, type UpgradePart } from '../assets/scripts/Career.ts';
import { vehicles, drivers } from '../assets/scripts/Selection.ts';
import { routes } from '../assets/scripts/RouteCatalog.ts';

function storage(raw?: string) {
  const values = new Map<string, string>(raw === undefined ? [] : [['kart-career-v1', raw]]);
  return {
    values, failRead: false, failWrite: false, writes: 0,
    getItem(key: string) {
      if (this.failRead) throw new Error('unavailable');
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (this.failWrite) throw new Error('quota');
      values.set(key, value);
      this.writes++;
    },
  };
}
function race(id: string, changes: Partial<CareerFinish> = {}): CareerFinish {
  return { id, position: 1, entrants: 4, time: 120, route: 'seaside', mode: 'standard',
    coins: 2, boosts: 3, driftBoosts: 2, ...changes };
}

test('fresh careers own the defaults; every vehicle/driver model and procedural cosmetic is in the shop', () => {
  const s = storage(), career = new Career(s), other = new Career(storage());
  assert.deepEqual(career.profile, {
    xp: 0, coins: 0, races: 0, wins: 0, podiums: 0,
    owned: ['vehicle:classic-kart', 'driver:rookie', 'decoration:none', 'pet:none'],
    equipped: { vehicle: 'classic-kart', driver: 'rookie', decoration: 'none', pet: 'none' },
    upgrades: { engine: 0, grip: 0, nitro: 0 }, routes: [], claimed: [],
  });
  assert.equal(career.level, 1);
  assert.deepEqual(career.levelProgress, { current: 0, needed: 100 });
  assert.deepEqual(career.performance(), { engine: 0, grip: 0, nitro: 0 });
  assert.equal(career.lastReward, undefined);
  assert.equal(career.saveError, '');
  assert.equal(s.writes, 0, 'opening a career does not overwrite storage');
  assert.notEqual(career.profile.owned, other.profile.owned);
  assert.equal(new Set(shopItems.map((item) => item.id)).size, shopItems.length);
  for (const [category, catalog] of [['vehicle', vehicles], ['driver', drivers]] as const) {
    assert.deepEqual(shopItems.filter((item) => item.category === category).map((item) => item.assetId),
      catalog.map(([id]) => id));
    for (const [id] of catalog)
      assert.ok(existsSync(new URL(`../../../../assets/carding-car/runtime-expansion/${category}s/${id}.glb`, import.meta.url)), id);
  }
  const cosmetics = shopItems.filter((item) => ['decoration', 'pet'].includes(item.category) && item.assetId !== 'none');
  assert.deepEqual(cosmetics.map((item) => item.assetId),
    ['racing-stripes', 'halo', 'comet', 'cloud-cat', 'star-bot', 'mini-dragon']);
  assert.equal(new Set(cosmetics.map((item) => item.color)).size, 6);
  for (const item of shopItems) {
    assert.equal(item.id, `${item.category}:${item.assetId}`);
    assert.ok(item.name && item.description);
    assert.ok(Number.isSafeInteger(item.price) && item.price >= 0);
    if (item.color) assert.match(item.color, /^#[0-9a-f]{6}$/i);
  }
});

test('the first three races fund a vehicle, decoration, pet, driver and functional upgrade that survive reload', () => {
  const s = storage(), career = new Career(s);
  assert.deepEqual(career.finish(race('one')), { coins: 230, xp: 126, position: 1, levelBefore: 1, levelAfter: 2 });
  assert.deepEqual(career.levelProgress, { current: 26, needed: 300 });
  assert.equal(career.buy('vehicle:dune-buggy'), true);
  assert.equal(career.profile.equipped.vehicle, 'classic-kart', 'buying does not force a selection');
  assert.equal(career.equip('vehicle:dune-buggy'), true);
  assert.equal(career.claim('first-finish'), true);
  assert.equal(career.buy('decoration:racing-stripes'), true);
  assert.equal(career.equip('decoration:racing-stripes'), true);
  career.finish(race('two', { position: 2, route: 'city' }));
  assert.equal(career.buy('pet:cloud-cat'), true);
  assert.equal(career.equip('pet:cloud-cat'), true);
  career.finish(race('three', { route: 'glacier', coins: 30, boosts: 20, driftBoosts: 10 }));
  assert.equal(career.claim('first-win'), true);
  assert.equal(career.buy('driver:aviator'), true);
  assert.equal(career.equip('driver:aviator'), true);
  assert.equal(career.upgrade('engine'), true);
  assert.equal(career.claim('three-routes'), true);
  assert.equal(career.profile.races, 3);
  assert.equal(career.profile.wins, 2);
  assert.equal(career.profile.podiums, 3);
  assert.deepEqual(career.performance(), { engine: 1, grip: 0, nitro: 0 });
  const restored = new Career(s);
  assert.deepEqual(restored.profile, career.profile);
  assert.equal(restored.level, career.level);
  assert.deepEqual(restored.performance(), career.performance());
  assert.equal(restored.lastReward, undefined, 'an old reward is not presented as a new result');
  assert.equal(restored.equip('pet:none'), true);
  assert.equal(restored.equip('decoration:none'), true);
});

test('unknown, locked, unaffordable and duplicate purchases fail; every catalog item can be bought and equipped', () => {
  const s = storage(), career = new Career(s);
  assert.equal(career.buy('vehicle:dune-buggy'), false);
  assert.equal(career.equip('vehicle:dune-buggy'), false);
  assert.equal(career.buy('vehicle:unknown'), false);
  assert.equal(career.equip('driver:unknown'), false);
  assert.equal(career.buy('vehicle:classic-kart'), false);
  assert.equal(career.upgrade('engine'), false);
  assert.equal(s.writes, 0);
  let id = 0;
  for (const item of shopItems) {
    if (!career.profile.owned.includes(item.id)) {
      while (career.profile.coins < item.price) assert.ok(career.finish(race(`shop-${id++}`)));
      const coins = career.profile.coins;
      assert.equal(career.buy(item.id), true, item.id);
      assert.equal(career.profile.coins, coins - item.price);
    }
    assert.equal(career.equip(item.id), true, item.id);
    assert.equal(career.profile.equipped[item.category], item.assetId);
    const before = JSON.stringify(career.profile), writes = s.writes;
    assert.equal(career.buy(item.id), false);
    assert.equal(career.equip(item.id), true);
    assert.equal(JSON.stringify(career.profile), before);
    assert.equal(s.writes, writes, 'already equipped items do not write');
  }
  assert.equal(career.profile.owned.length, shopItems.length);
  assert.deepEqual(new Career(s).profile, career.profile);
});

test('a failed save rolls back purchases, equipment, upgrades, milestones and race IDs; retry succeeds once', () => {
  const s = storage(), career = new Career(s);
  career.finish(race('saved-one'));
  career.finish(race('saved-two'));
  assert.equal(career.buy('vehicle:dune-buggy'), true);
  const profile = career.profile, reward = career.lastReward, raw = s.values.get('kart-career-v1');
  const before = JSON.stringify(profile);
  s.failWrite = true;
  for (const action of [
    () => career.buy('driver:aviator'), () => career.equip('vehicle:dune-buggy'),
    () => career.upgrade('engine'), () => career.upgrade('grip'), () => career.upgrade('nitro'),
    () => career.claim('first-finish'), () => career.finish(race('retry-me')),
  ]) {
    assert.ok(!action());
    assert.equal(career.profile, profile, 'failed writes do not replace the public profile');
    assert.equal(JSON.stringify(career.profile), before);
    assert.equal(s.values.get('kart-career-v1'), raw);
    assert.equal(career.lastReward, reward);
    assert.ok(career.saveError);
  }
  s.failWrite = false;
  assert.equal(career.buy('driver:aviator'), true);
  assert.equal(career.equip('vehicle:dune-buggy'), true);
  assert.equal(career.claim('first-finish'), true);
  assert.equal(career.upgrade('engine'), true);
  assert.ok(career.finish(race('retry-me')));
  assert.equal(career.saveError, '');
  assert.equal(career.finish(race('retry-me')), undefined);
  const restored = new Career(s);
  assert.equal(restored.finish(race('retry-me')), undefined);
  assert.equal(restored.claim('first-finish'), false);
  assert.deepEqual(restored.profile, career.profile);
});

test('race IDs remain deduplicated after many races and reload, including another route/mode and prototype names', () => {
  const s = storage(), career = new Career(s);
  assert.ok(career.finish(race('__proto__')));
  for (let i = 0; i < 300; i++) assert.ok(career.finish(race(`later-${i}`)));
  const restored = new Career(s), before = JSON.stringify(restored.profile), writes = s.writes;
  assert.equal(restored.finish(race('__proto__', { route: 'city', mode: 'sprint' })), undefined);
  assert.equal(restored.finish(race('later-0')), undefined);
  assert.equal(restored.finish(race('later-299')), undefined);
  assert.equal(JSON.stringify(restored.profile), before);
  assert.equal(s.writes, writes);
  assert.ok(restored.finish(race('constructor')));
  assert.equal(restored.profile.races, 302);
});

test('all career milestones use their actual statistic, cap displayed progress, and pay only once', () => {
  const s = storage(), career = new Career(s);
  for (const milestone of milestones) {
    assert.equal(career.milestoneProgress(milestone.id), 0);
    assert.equal(career.claim(milestone.id), false);
  }
  assert.equal(career.milestoneProgress('unknown'), 0);
  assert.equal(career.claim('unknown'), false);
  for (let i = 0; i < 20; i++) {
    career.finish(race(`milestone-${i}`, { position: i < 5 ? 1 : 4, route: routes[i % routes.length].id }));
    for (const milestone of milestones) {
      const actual = milestone.stat === 'routes' ? career.profile.routes.length : career.profile[milestone.stat];
      assert.equal(career.milestoneProgress(milestone.id), Math.min(milestone.target, actual));
    }
  }
  assert.equal(career.profile.wins, 5);
  assert.equal(career.profile.podiums, 5);
  for (const milestone of milestones) {
    const { coins, xp } = career.profile;
    assert.equal(career.claim(milestone.id), true);
    assert.equal(career.profile.coins, coins + milestone.coins);
    assert.equal(career.profile.xp, xp + milestone.xp);
    assert.equal(career.claim(milestone.id), false);
  }
  assert.equal(career.profile.claimed.length, milestones.length);
  const restored = new Career(s);
  for (const milestone of milestones) assert.equal(restored.claim(milestone.id), false);
});

test('each part costs more per level, returns independent integer levels, caps at five and survives reload', () => {
  const s = storage(JSON.stringify({ coins: 10_000 })), career = new Career(s);
  for (const part of ['engine', 'grip', 'nitro'] as const) {
    for (let level = 0; level < 5; level++) {
      assert.equal(career.upgradeCost(part), 180 + level * 140);
      const coins = career.profile.coins, before = career.performance();
      assert.equal(career.upgrade(part), true);
      assert.equal(career.profile.coins, coins - 180 - level * 140);
      assert.equal(career.profile.upgrades[part], level + 1);
      assert.ok(career.performance()[part] > before[part]);
      for (const other of ['engine', 'grip', 'nitro'] as const)
        if (other !== part) assert.equal(career.performance()[other], before[other]);
    }
    const coins = career.profile.coins;
    assert.equal(career.upgradeCost(part), 0);
    assert.equal(career.upgrade(part), false);
    assert.equal(career.profile.coins, coins);
  }
  for (const part of ['unknown', '__proto__', 'constructor']) {
    assert.equal(career.upgradeCost(part as UpgradePart), 0);
    assert.equal(career.upgrade(part as UpgradePart), false);
  }
  assert.deepEqual(career.performance(), { engine: 5, grip: 5, nitro: 5 });
  career.performance().engine = 0;
  assert.equal(career.profile.upgrades.engine, 5, 'temporary race tuning cannot mutate purchased upgrades');
  assert.deepEqual(new Career(s).profile, career.profile);
});

test('practice, unfinished and invalid results never change money, progress, reward display or storage', () => {
  const s = storage(), career = new Career(s);
  career.finish(race('real'));
  const before = JSON.stringify(career.profile), reward = career.lastReward, writes = s.writes;
  for (const changes of [
    { practice: true }, { practice: 'false' }, { id: '' }, { id: ' ' }, { id: ' padded ' }, { id: 'a'.repeat(129) },
    { position: 0 }, { position: -1 }, { position: 1.5 }, { position: 5 }, { position: NaN },
    { entrants: 0 }, { entrants: 9 }, { entrants: 1.5 }, { entrants: Infinity },
    { time: 0 }, { time: -1 }, { time: NaN }, { time: Infinity }, { time: 3601 }, { time: '120' },
    { mode: 'practice' }, { mode: 'unknown' }, { route: 'unknown' }, { route: '../seaside' },
    { coins: -1 }, { coins: NaN }, { coins: Infinity }, { coins: 1.5 }, { coins: '10' },
    { boosts: -1 }, { boosts: Infinity }, { boosts: 1_000_001 }, { driftBoosts: NaN }, { driftBoosts: 0.5 },
  ]) {
    assert.equal(career.finish({ ...race('invalid'), ...changes } as CareerFinish), undefined, JSON.stringify(changes));
    assert.equal(JSON.stringify(career.profile), before);
    assert.equal(career.lastReward, reward);
    assert.equal(s.writes, writes);
  }
  assert.equal(career.finish(null as unknown as CareerFinish), undefined);
  assert.equal(career.finish({} as CareerFinish), undefined);
  assert.ok(career.finish(race('invalid', { practice: false })), 'invalid attempts do not consume a race ID');
});

test('solo finishes earn completion rewards without competitive wins; sprint pays less and skill bonuses are capped', () => {
  const solo = new Career(storage());
  assert.deepEqual(solo.finish(race('solo', { entrants: 1, coins: 0, boosts: 0, driftBoosts: 0 })),
    { coins: 120, xp: 70, position: 1, levelBefore: 1, levelAfter: 1 });
  assert.equal(solo.profile.races, 1);
  assert.equal(solo.profile.wins, 0);
  assert.equal(solo.profile.podiums, 0);
  assert.equal(solo.claim('first-win'), false);
  const standard = new Career(storage()), sprint = new Career(storage());
  const long = standard.finish(race('standard'))!, short = sprint.finish(race('sprint', { mode: 'sprint' }))!;
  assert.ok(short.coins < long.coins && short.xp < long.xp);
  const capped = standard.finish(race('huge-counters', { coins: 1_000_000, boosts: 1_000_000, driftBoosts: 1_000_000 }))!;
  assert.equal(capped.coins, 370);
  assert.equal(capped.xp, 200);
});

test('corrupt saves default safely; stored numbers, ownership, equipment, routes and claimed IDs are sanitized', () => {
  for (const raw of ['{broken', 'null', '[]', 'true', '12', '"text"']) {
    const career = new Career(storage(raw));
    assert.deepEqual(career.profile, new Career(storage()).profile);
    assert.ok(career.finish(race('repair')), 'a corrupt profile can be saved again');
  }
  const s = storage(`{"xp":1e400,"coins":9999999999999,"races":6.9,"wins":9,"podiums":4,
    "owned":["vehicle:dune-buggy","vehicle:dune-buggy","driver:aviator","vehicle:unknown",3],
    "equipped":{"vehicle":"dune-buggy","driver":"champion","decoration":"cloud-cat","pet":"unknown"},
    "upgrades":{"engine":99,"grip":-3,"nitro":1.9},
    "routes":["city","city","unknown",null],"claimed":["first-finish","first-finish","unknown"],
    "rewarded":["already","already",null,42,""]}`);
  const career = new Career(s);
  assert.equal(career.profile.xp, 0);
  assert.equal(career.profile.coins, 1_000_000_000);
  assert.equal(career.profile.races, 6);
  assert.equal(career.profile.wins, 4);
  assert.equal(career.profile.podiums, 4);
  assert.deepEqual(career.profile.upgrades, { engine: 5, grip: 0, nitro: 1 });
  assert.deepEqual(career.profile.equipped, { vehicle: 'dune-buggy', driver: 'rookie', decoration: 'none', pet: 'none' });
  assert.deepEqual(career.profile.routes, ['city']);
  assert.deepEqual(career.profile.claimed, ['first-finish']);
  assert.equal(career.profile.owned.length, 6);
  assert.equal(career.finish(race('already')), undefined);
  assert.equal(career.claim('first-finish'), false);
  assert.ok(career.finish(race('repaired')));
  assert.deepEqual(new Career(s).profile, career.profile);
  for (const value of Object.values(career.profile.upgrades))
    assert.ok(Number.isInteger(value) && value >= 0 && value <= 5);
  for (const key of ['xp', 'coins', 'races', 'wins', 'podiums'] as const)
    assert.ok(Number.isSafeInteger(career.profile[key]) && career.profile[key] <= 1_000_000_000);
  const wrongTypes = new Career(storage(JSON.stringify({ xp: '100', coins: -5, races: false,
    owned: {}, equipped: [], upgrades: { engine: '5', grip: null }, routes: 'city', claimed: {} })));
  assert.deepEqual(wrongTypes.profile, new Career(storage()).profile);
});

test('near-cap rewards report only actual credits; capped counters and level progress remain finite', () => {
  const s = storage(JSON.stringify({ coins: 999_999_997, xp: 999_999_998,
    races: 1_000_000_000, wins: 1_000_000_000, podiums: 1_000_000_000 }));
  const career = new Career(s), reward = career.finish(race('cap'))!;
  assert.equal(reward.coins, 3);
  assert.equal(reward.xp, 2);
  for (const key of ['coins', 'xp', 'races', 'wins', 'podiums'] as const)
    assert.equal(career.profile[key], 1_000_000_000);
  assert.ok(Number.isInteger(career.level));
  assert.ok(career.levelProgress.current >= 0 && career.levelProgress.current < career.levelProgress.needed);
  assert.ok(career.claim('first-finish'));
  assert.equal(career.profile.coins, 1_000_000_000);
  assert.equal(career.profile.xp, 1_000_000_000);
  assert.equal(new Career(s).finish(race('cap')), undefined);
  for (const xp of [0, 99, 100, 399, 400, 899, 900]) {
    const atBoundary = new Career(storage(JSON.stringify({ xp })));
    assert.equal(atBoundary.level, Math.floor(Math.sqrt(xp / 100)) + 1);
    assert.ok(atBoundary.levelProgress.current >= 0 && atBoundary.levelProgress.current < atBoundary.levelProgress.needed);
  }
});

test('read failures cannot overwrite an unseen save; reopening after recovery preserves progress', () => {
  const s = storage(JSON.stringify({ coins: 1000, xp: 400 })), original = s.values.get('kart-career-v1');
  s.failRead = true;
  const career = new Career(s);
  assert.ok(career.saveError);
  assert.equal(career.finish(race('unreadable')), undefined);
  assert.equal(career.buy('driver:aviator'), false);
  s.failRead = false;
  assert.equal(career.finish(race('still-unreadable')), undefined, 'reopen before replacing an unseen profile');
  assert.equal(s.writes, 0);
  assert.equal(s.values.get('kart-career-v1'), original);
  const restored = new Career(s);
  assert.equal(restored.profile.coins, 1000);
  assert.equal(restored.level, 3);
  assert.equal(restored.buy('driver:aviator'), true);
  assert.equal(restored.saveError, '');
});
