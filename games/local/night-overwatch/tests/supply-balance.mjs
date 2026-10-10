import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Run from any directory with Node 24: node <game>/tests/supply-balance.mjs
const game = new URL('../', import.meta.url);
const sourceFiles = ['Data.ts', 'Simulation.ts', 'Flight.ts', 'MissionCatalog.ts'];
const hash = url => createHash('sha256').update(readFileSync(url)).digest('hex');
const sourceHashes = () => Object.fromEntries(sourceFiles.map(file => [file, hash(new URL(`assets/scripts/core/${file}`, game))]));
const sources = sourceHashes();
const { Simulation } = await import('../assets/scripts/core/Simulation.ts');
const { WEAPONS, HOMING, UNITS, COMBAT_BUFF, patrolPoint, landPoint, riverX, impactDamage } = await import('../assets/scripts/core/Data.ts');
assert.equal(HOMING.damage, 120, 'This calibration adopts 120 consumable damage');
assert.equal(HOMING.speed, 70);
assert.equal(COMBAT_BUFF.duration, 60);
assert.equal(COMBAT_BUFF.rateMultiplier, 1.3);

const dt = 1 / 60, positions = [[-110, -45], [-110, 55], [35, -45], [35, 55], [110, -45], [110, 55]];
const ages = [0, 2.5, 5, 7.5, 10, 12.5, 15, 17.5];
const missions = ['corridor-01', 'ambush-02'];
const round = x => Number(x.toFixed(6));
const near = (actual, expected, message) => assert(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} != ${expected}`);
const speed = shot => Math.hypot(shot.velocity.x, shot.velocity.y, shot.velocity.z);
function setup(kind = 'turret', p = [35, -20], age = 0, mission = missions[0], hp = 10000) {
  const s = new Simulation(mission); s.start(); s.convoy = 'holding';
  s.mission.events.forEach((_, i) => s.spawned.add(i));
  s.units = s.units.filter(u => u.friendly);
  for (const u of s.units) u.attack = Infinity;
  const t = s.addUnit(kind, { x: p[0], z: p[1] });
  t.attack = Infinity; t.born = -age; t.hp = t.maxHp = hp;
  if (kind === 'light') Object.assign(t, patrolPoint(t.origin, age, s.mission.map));
  t.y = s.height(t.x, t.z);
  return { s, t };
}
function predicted(s, t, delay) {
  if (t.kind === 'light') return patrolPoint(t.origin, s.time - t.born + delay, s.mission.map);
  if (t.kind !== 'heavy') return t;
  const allies = s.units.filter(u => u.friendly && u.hp > 0);
  const distance = u => Math.hypot(u.x - t.x, u.z - t.z);
  const friend = allies.sort((a, b) => distance(a) - distance(b))[0], d = distance(friend);
  if (d <= 12) return t;
  const move = Math.min(UNITS.heavy.speed * delay, d - 12);
  return landPoint({ x: t.x + (friend.x - t.x) * move / d, z: t.z + (friend.z - t.z) * move / d }, s.mission.map, t.x - riverX(t.z));
}
function launch(s, t, weapon, mode = 'normal', aim = 'current') {
  s.choose(weapon);
  if (mode === 'tracking' && !s.buff) assert(s.grantBuff('tracking'));
  let point = t;
  if (aim === 'predictive') for (let i = 0; i < 12; i++) point = predicted(s, t, s.flightTime(weapon, point));
  s.setAim(point);
  if (mode === 'consumable') {
    s.selectHoming(); s.homingAmmo = 1;
    assert(s.lockHoming(t.id)); // A valid explicit lock supersedes either initial aim policy.
  }
  const ammo = s.guns[weapon].ammo, heat = s.guns[weapon].heat;
  assert(s.fire(), `Cannot fire ${mode}/${WEAPONS[weapon].id}: ${s.reason()}`);
  const shot = s.shots.at(-1);
  near(speed(shot), mode === 'consumable' ? HOMING.speed : WEAPONS[weapon].speed, 'launch speed');
  if (mode !== 'consumable') {
    assert.equal(s.guns[weapon].ammo, ammo - 1);
    near(s.guns[weapon].heat, Math.min(100, heat + WEAPONS[weapon].heat), 'normal heat');
    near(s.guns[weapon].cooldown, WEAPONS[weapon].interval / (s.buff?.kind === 'rate' ? 1.3 : 1), 'cooldown');
  } else assert.equal(s.homingAmmo, 0);
  assert.equal(shot.guidance?.kind, mode === 'normal' ? undefined : mode);
  return shot;
}
function settle(s, shot) {
  for (let i = 0; i < 20 / dt && s.shots.includes(shot); i++) {
    s.step(dt);
    if (shot.guidance) near(speed(shot), shot.guidance.kind === 'consumable' ? HOMING.speed : WEAPONS[shot.weapon].speed, 'guided speed');
  }
  assert(!s.shots.includes(shot), 'Shot must resolve within 20 seconds');
  const event = s.events.find(e => e.type === 'impact' && e.shot === shot.id);
  assert(event, 'A live unprotected target must produce an impact');
  return event;
}

const motion = [];
for (const mission of missions) for (const kind of ['light', 'heavy', 'turret']) {
  for (const mode of ['normal', 'tracking', 'consumable']) for (const aim of mode === 'tracking' ? ['current'] : ['current', 'predictive']) {
    for (const weapon of mode === 'consumable' ? [2] : [0, 1, 2]) {
      const samples = [];
      for (const p of positions) for (const age of ages) {
        const { s, t } = setup(kind, p, age, mission), shot = launch(s, t, weapon, mode, aim);
        const event = settle(s, shot), damage = 10000 - t.hp;
        near(event.damage, damage + s.friendlyDamage, 'Impact includes target and any nearby allies');
        const maximum = mode === 'consumable' ? HOMING.damage : impactDamage(weapon, kind, 0);
        assert(damage >= 0 && damage <= maximum + 1e-6);
        if (mode === 'consumable') {
          near(damage, 120, 'consumable damage'); assert.equal(s.hitShots, 1); assert.equal(s.friendlyDamage, 0);
        }
        samples.push({ damage, friendlyDamage: s.friendlyDamage, seconds: event.time - shot.born, hit: s.hitShots });
      }
      const mean = key => round(samples.reduce((n, x) => n + x[key], 0) / samples.length);
      motion.push({ mission, kind, mode, aim, weapon: mode === 'consumable' ? 'homing' : WEAPONS[weapon].id,
        samples: samples.length, hits: samples.reduce((n, x) => n + x.hit, 0), hitRate: mean('hit'),
        meanDamage: mean('damage'), meanFriendlyDamage: mean('friendlyDamage'), meanFlightSeconds: mean('seconds'),
        flightSecondsRange: [Math.min(...samples.map(x => x.seconds)), Math.max(...samples.map(x => x.seconds))].map(round) });
    }
  }
}

const kills = [];
for (const mission of missions) for (const kind of ['light', 'turret', 'heavy']) {
  const { s, t } = setup(kind, [35, -20], 0, mission, UNITS[kind].hp);
  const hpAfterHits = [];
  while (t.hp > 0 && hpAfterHits.length < 3) { settle(s, launch(s, t, 2, 'consumable')); hpAfterHits.push(t.hp); }
  assert.equal(t.hp, 0); assert.equal(s.fired, kind === 'heavy' ? 2 : 1);
  kills.push({ mission, kind, initialHp: UNITS[kind].hp, hpAfterHits, shots: s.fired });
}

const cluster = [], offsets = [0, 2, 3.5, 6, 7];
for (const mode of ['normal', 'tracking', 'consumable']) for (const weapon of mode === 'consumable' ? [2] : [0, 1, 2]) {
  const { s, t } = setup();
  const targets = [t, ...offsets.slice(1).map(dx => {
    const u = s.addUnit('turret', { x: 35 + dx, z: -20 }); u.attack = Infinity; u.hp = u.maxHp = 10000; return u;
  })];
  const friend = s.addUnit('escort', { x: 37, z: -20 }, true); friend.attack = Infinity;
  const event = settle(s, launch(s, t, weapon, mode));
  for (const u of [...targets, friend]) {
    const distance = Math.hypot(u.x - event.x, u.y - event.y, u.z - event.z);
    const expected = mode === 'consumable' ? u === t ? 120 : 0 : impactDamage(weapon, u.kind, distance);
    near(u.maxHp - u.hp, expected, `${mode} AoE/friendly payload`);
  }
  if (mode !== 'consumable' && weapon > 0) assert(s.friendlyDamage > 0, 'Guidance must not erase ordinary friendly fire');
  cluster.push({ mode, weapon: mode === 'consumable' ? 'homing' : WEAPONS[weapon].id,
    enemyDamage: targets.map(u => round(u.maxHp - u.hp)), totalEnemyDamage: round(targets.reduce((n, u) => n + u.maxHp - u.hp, 0)), friendlyDamage: round(s.friendlyDamage) });
}
for (const normal of cluster.filter(row => row.mode === 'normal')) {
  const tracking = cluster.find(row => row.mode === 'tracking' && row.weapon === normal.weapon);
  assert.deepEqual(tracking.enemyDamage, normal.enemyDamage, 'Tracking preserves ordinary AoE');
  assert.equal(tracking.friendlyDamage, normal.friendlyDamage, 'Tracking preserves ordinary friendly damage');
}

const cadence = [];
for (const step of [dt, 1 / 600]) for (const weapon of [0, 1, 2]) for (const rateBuff of [false, true]) {
  const { s, t } = setup('turret', [35, -20], 0, missions[0], 100000);
  s.choose(weapon); s.setAim(t);
  if (rateBuff) assert(s.grantBuff('rate'));
  let overheatedSeconds = 0, previousShotTime, minimumShotInterval = Infinity;
  const interval = WEAPONS[weapon].interval / (rateBuff ? 1.3 : 1);
  for (let frame = 0; frame < Math.round(60 / step); frame++) {
    if (s.fire()) {
      near(s.guns[weapon].cooldown, interval, 'actual buff cooldown');
      if (previousShotTime !== undefined) {
        const gap = s.time - previousShotTime;
        assert(gap + 1e-6 >= interval); minimumShotInterval = Math.min(minimumShotInterval, gap);
      }
      previousShotTime = s.time;
    }
    if (s.guns[weapon].overheated) overheatedSeconds += step;
    s.step(step);
  }
  assert.equal(s.buff, undefined, 'Rate buff expires at 60 simulation seconds');
  cadence.push({ dt: step, weapon: WEAPONS[weapon].id, rateBuff, intervalSeconds: interval,
    minimumShotInterval: round(minimumShotInterval), shots: s.fired, overheatedSeconds: round(overheatedSeconds),
    remainingAmmo: Number.isFinite(s.guns[weapon].ammo) ? s.guns[weapon].ammo : 'Infinity' });
}

const lifecycle = [];
for (const kind of ['tracking', 'rate']) {
  const { s, t } = setup(); assert(s.grantBuff(kind));
  launch(s, t, 1, kind === 'tracking' ? 'tracking' : 'normal');
  const snapshot = () => JSON.stringify({ time: s.time, buff: s.buff, guns: s.guns, shots: s.shots, units: s.units });
  for (const reason of ['manual', 'supply', 'advert', 'countdown', 'background']) {
    s.pause(reason, true); const before = snapshot();
    for (let n = 0; n < 120; n++) s.step(dt);
    assert.equal(snapshot(), before, `${reason} freezes ${kind}`); s.pause(reason, false);
  }
  for (let n = 0; n < 59 * 60; n++) s.step(dt);
  near(s.buff.remaining, 1, 'one second remaining');
  const shot = launch(s, t, 2, kind === 'tracking' ? 'tracking' : 'normal');
  for (let n = 0; n < 60; n++) s.step(dt);
  assert.equal(s.buff, undefined); assert.equal(shot.guidance, undefined, 'In-flight tracking ends at expiry');
  assert(s.shots.includes(shot), 'Expiry must not erase an in-flight ordinary shot');
  lifecycle.push({ kind, durationSeconds: round(s.time), pauseReasons: ['manual', 'supply', 'advert', 'countdown', 'background'], expired: true });
}

assert.deepEqual(sourceHashes(), sources, 'Core changed during calibration; rerun after concurrent edits settle');
const report = {
  schemaVersion: 1, recordedAt: new Date().toISOString(), node: process.version,
  command: 'node games/local/night-overwatch/tests/supply-balance.mjs',
  head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fileURLToPath(game), encoding: 'utf8' }).trim(),
  sourceSha256: sources, scriptSha256: hash(new URL(import.meta.url)),
  historicalBaseline: {
    head: '0075fce02f29d2dcd33546ca99eb86f24276ac98', homingDamage: 240,
    sourceSha256: { 'Data.ts': '13fb152f865d2f89d09ba10d604b104159f017bfa0b47e6b965145a493b67856',
      'Simulation.ts': 'f1202a18484ab2c9f75bd80d24b850dfdd256f267b12f1947ea4ee3650ee5000' },
    note: 'Prior read-only inline experiment, not rerun here; current results use the working-tree sources hashed above.',
  },
  configuration: { homing: HOMING, buff: COMBAT_BUFF, weapons: WEAPONS.map((w, i) => ({ id: w.id, damage: w.damage,
    damageAgainstHeavy: impactDamage(i, 'heavy', 0), speed: w.speed, interval: w.interval, radius: w.radius,
    heat: w.heat, armor: w.armor, ammo: Number.isFinite(w.ammo) ? w.ammo : 'Infinity' })) },
  fixture: { dt, missions, positions, ages, targetHp: 10000, predictiveIterations: 12, cluster: { origin: [35, -20], offsets, friendOffset: 2 },
    note: 'Default aircraft pose; convoy held, mission spawning and ground fire suppressed. Raised HP measures uncapped damage. Cadence uses 100000 HP and attempts fire each step in [0,60); heavy assumes immediate manual retrigger.' },
  motion, kills, cluster, cadence, lifecycle,
  limitations: [
    'Synthetic deterministic fixtures, not observed player accuracy, mission win rates, browser/device or SDK acceptance.',
    'Only six origins and the default launch pose; patrol ages vary light motion but repeat stationary/heavy setups.',
    'Predictive aim uses exact game motion; consumable explicit lock supersedes current/predictive initial aim.',
    'No new 240-damage simulation or source/config mutation; historical baseline is context only.',
    'Normal tracking respects terrain; hit rate does not imply guaranteed hits on other terrain or target paths.',
    'Interval / 1.3 changes burst cadence, not guaranteed sustained DPS: ordinary heat/cooling and tick quantization remain.',
    'Unlimited paused resupply permits stockpiling; damage calibration alone cannot balance reward availability.',
  ],
};
const output = new URL('reports/combat-supply/balance.json', game);
mkdirSync(new URL('reports/combat-supply/', game), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ report: fileURLToPath(output), homingDamage: HOMING.damage,
  motionScenarios: motion.reduce((n, row) => n + row.samples, 0), assertions: 'passed',
  cadence60Hz: cadence.filter(row => row.dt === dt), sourceSha256: sources }, null, 2));
