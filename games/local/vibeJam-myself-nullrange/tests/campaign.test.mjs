import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import {
  createRun,
  step,
  DT,
  enemyCanFire,
  direction,
  distance,
  lineClear,
  advanceFlight,
  advanceWeapons,
  consumeMissile,
} from '../assets/scripts/core/rules.ts';
import {
  MISSIONS,
  CRAFTS,
  validateMission,
  RULE_VERSION,
  totalEnemies,
} from '../assets/scripts/core/content.ts';
import {
  readProgress,
  saveProgress,
  recordVictory,
  missionUnlocked,
  craftUnlocked,
} from '../assets/scripts/core/progress.ts';
import { surfaceHeight, airframeSamples } from '../assets/scripts/core/flight-geometry.ts';
import { pilot } from './pilot.mjs';
const key = 'nullrange-progress-v1';
const memory = () => {
  const map = new Map();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
};
const results = [];

test('all unlocked craft can intercept the fleeing convoy through normal controls', () => {
  for (const c of CRAFTS) {
    const s = createRun(MISSIONS[1], c);
    while (s.status === 'running') step(s, pilot(s));
    assert.equal(s.status, 'won', `${c.id}: ${s.reason} at ${s.tick / 60}s`);
    assert.ok(s.tick / 60 <= 300);
  }
});
test('six normal-input missions, real first-to-six unlock chain, replay and idempotent results', async () => {
  const storage = memory(),
    p = readProgress(storage);
  assert.equal(RULE_VERSION, 'nullrange-airspace-v2');
  for (const [i, m] of MISSIONS.entries()) {
    assert.ok(missionUnlocked(p, m.id));
    const craft = CRAFTS[i < 2 ? 0 : i < 4 ? 1 : 2];
    assert.ok(craftUnlocked(p, craft.id));
    const s = createRun(m, craft);
    let first = null,
      maxEnemies = 0,
      maxShots = 0,
      phases = [],
      actions = { fire: 0, boost: 0, missile: 0, scan: 0 };
    while (s.status === 'running') {
      const input = pilot(s);
      for (const k in actions) if (input[k]) actions[k]++;
      step(s, input);
      if (first === null && s.events.includes('hit')) first = s.tick * DT;
      if (s.events.includes('phase')) phases.push(s.eliteStage);
      maxEnemies = Math.max(maxEnemies, s.enemies.length);
      maxShots = Math.max(maxShots, s.shots.length);
      assert.ok(s.tick <= m.timeLimit * 60);
      assert.ok(s.enemies.every((e) => e.y > surfaceHeight(e.x, e.z)));
    }
    assert.equal(s.status, 'won', m.id + ': ' + s.reason);
    assert.ok(first <= 15, m.id);
    assert.ok(maxEnemies <= 8 && maxShots <= 96);
    if (i > 0) assert.ok(s.tick * DT >= 90 && s.tick * DT <= 300, `${m.id}: ${s.tick * DT}s`);
    if (m.objective.kind === 'elite') assert.deepEqual(phases, [2, 3]);
    if (m.objective.kind === 'recover') assert.equal(s.recovered, m.objective.count);
    assert.equal(recordVictory(storage, p, s, true), false);
    assert.equal(p.completed[m.id], undefined);
    assert.ok(recordVictory(storage, p, s, false));
    const once = storage.getItem(key);
    assert.ok(recordVictory(storage, p, s, false));
    assert.equal(storage.getItem(key), once);
    step(s, { fire: true });
    assert.equal(storage.getItem(key), once);
    results.push({
      mission: m.id,
      craft: craft.id,
      seconds: s.tick * DT,
      firstContact: first,
      hull: s.player.hull,
      kills: s.kills,
      recovered: s.recovered,
      phases,
      maxEnemies,
      maxShots,
      actions,
    });
  }
  assert.equal(Object.keys(readProgress(storage).completed).length, 6);
  await mkdir(new URL('../reports/', import.meta.url), { recursive: true });
  await writeFile(
    new URL('../reports/b4-campaign.json', import.meta.url),
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
});
test('objective boundaries: no kill-only recovery, escape, escort loss/arrival and hard time limits', () => {
  const recovery = createRun(MISSIONS[2]);
  recovery.enemies = [];
  step(recovery);
  assert.equal(recovery.status, 'running');
  recovery.pickups.push({ ...recovery.player, x: 5000, id: 990, life: Infinity });
  for (let i = 0; i < 5000; i++) step(recovery, { x: 0.3 });
  assert.ok(recovery.pickups.some((i) => i.id === 990));
  const escape = createRun(MISSIONS[1]);
  escape.enemies.find((e) => e.priority).travel = escape.mission.objective.escapeDistance;
  step(escape);
  assert.equal(escape.status, 'lost');
  assert.match(escape.reason, /逃出/);
  const escort = createRun(MISSIONS[3]);
  escort.transport.hull = 1;
  escort.shots = [
    {
      ...escort.transport,
      id: 999,
      velocity: { x: 0, y: 0, z: 0 },
      owner: 'enemy',
      target: 0,
      missile: false,
      life: 1,
    },
  ];
  step(escort);
  assert.equal(escort.status, 'lost');
  assert.match(escort.reason, /运输机/);
  const arrival = createRun(MISSIONS[3]);
  arrival.transport.leg = arrival.mission.objective.route.length;
  step(arrival);
  assert.equal(arrival.status, 'won');
  for (const m of MISSIONS) {
    const s = createRun(m);
    s.tick = m.timeLimit * 60 - 1;
    step(s);
    assert.equal(s.status, 'lost');
    assert.match(s.reason, /超时/);
  }
});
test('forward fire, heavy telegraph and newly spawned swept collisions never target dead or missing poses', () => {
  const s = createRun(MISSIONS[4]);
  const e = s.enemies[2];
  e.yaw = 0;
  e.pitch = 0;
  e.x = 0;
  e.y = 200;
  e.z = 0;
  assert.ok(enemyCanFire(e, { x: 0, y: 200, z: -200 }));
  assert.equal(enemyCanFire(e, { x: 0, y: 200, z: 200 }), false);
  e.cooldown = 0.6;
  step(s);
  assert.ok(e.telegraph > 0);
  const wave = createRun();
  wave.enemies = [];
  step(wave);
  assert.equal(wave.wave, 1);
  assert.ok(wave.enemies.length > 0);
  const target = wave.enemies[0];
  wave.shots.push({
    ...target,
    z: target.z + 40,
    id: 999,
    velocity: { x: 0, y: 0, z: -6000 },
    owner: 'player',
    target: 0,
    missile: false,
    life: 1,
  });
  step(wave);
  assert.ok(wave.impacts.some((e) => e.kind === 'hit'));
  const dead = createRun();
  dead.enemies[0].hp = 0;
  const ref = dead.enemies[0],
    copy = { ...ref };
  step(dead);
  assert.deepEqual(ref, copy);
  assert.equal(lineClear({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -50 }), false);
});
test('three craft share flight/weapon primitives but produce different sustained fire, turn and speed; actual model bounds/nozzles', async () => {
  const records = JSON.parse(
    await readFile(new URL('../art/manifest.json', import.meta.url), 'utf8'),
  ).assets;
  const output = CRAFTS.map((c) => {
    const s = createRun(MISSIONS[0], c);
    let shots = 0,
      boost = false;
    for (let i = 0; i < 240; i++) {
      boost = advanceFlight(s.player, c, { x: 1, boost: true }, boost);
      shots += Number(advanceWeapons(s, c, true));
    }
    return { speed: s.player.speed, yaw: s.player.yaw, shots };
  });
  assert.ok(output[1].speed > output[0].speed && output[0].speed > output[2].speed);
  assert.ok(output[2].shots > output[0].shots && output[0].shots >= output[1].shots);
  for (const c of CRAFTS) {
    const m = records.find((m) => m.name === c.id);
    assert.ok(Math.max(...c.samples.map((p) => p[0])) >= m.bounds.max[0]);
    assert.ok(Math.min(...c.samples.map((p) => p[2])) <= m.bounds.min[2]);
    assert.ok(Math.min(...c.samples.map((p) => p[1])) <= m.bounds.min[1] + 1e-6);
    if (m.nozzles) assert.deepEqual(c.nozzles, m.nozzles);
  }
  const s = createRun();
  assert.equal(consumeMissile(s, false), false);
  assert.equal(consumeMissile(s, true), true);
  assert.equal(consumeMissile(s, true), false);
});
test('v1 migration never invents wins; stale completions merge, settings isolate, invalid/future storage stays untouched', () => {
  const st = memory();
  st.setItem(
    key,
    JSON.stringify({ version: 1, best: 6000, muted: true, reduced: true, sensitivity: 0.7 }),
  );
  const a = readProgress(st),
    b = readProgress(st);
  assert.deepEqual(a.completed, {});
  assert.equal(missionUnlocked(a, MISSIONS[1].id), false);
  const win = createRun();
  win.status = 'won';
  win.tick = 100;
  win.score = 500;
  assert.ok(recordVictory(st, a, win, false));
  win.score = 700;
  win.player.hull = 40;
  assert.ok(recordVictory(st, b, win, false));
  assert.deepEqual(readProgress(st).completed['dawn-patrol'], { best: 700, medal: 3, time: 100 });
  a.reduced = false;
  saveProgress(st, a, 'reduced');
  assert.equal(readProgress(st).best, 6000);
  assert.equal(readProgress(st).muted, true);
  assert.equal(readProgress(st).completed['dawn-patrol'].best, 700);
  for (const raw of [
    '',
    'broken',
    'false',
    '0',
    '[]',
    '{"version":3,"best":999}',
    '{"version":99}',
  ]) {
    st.setItem(key, raw);
    assert.equal(saveProgress(st, a, 'best'), false);
    assert.equal(st.getItem(key), raw);
  }
  st.setItem(
    key,
    '{"version":2,"completed":{"__proto__":{"medal":3,"time":100,"best":99},"invented":{"medal":3,"time":100,"best":99}},"selectedCraft":"__proto__"}',
  );
  assert.deepEqual(readProgress(st).completed, {});
  assert.equal(readProgress(st).selectedCraft, 'falcon');
  const fail = createRun();
  fail.status = 'lost';
  fail.tick = 100;
  assert.equal(recordVictory(st, a, fail, false), false);
});
test('catalog references and configurations have finite budgets and stable distinct identities', () => {
  assert.equal(new Set(MISSIONS.map((m) => m.id)).size, 6);
  assert.equal(new Set(CRAFTS.map((c) => c.id)).size, 3);
  for (const m of MISSIONS) {
    validateMission(m);
    assert.ok(totalEnemies(m) > 0);
  }
  for (const c of CRAFTS) assert.ok(!c.unlock || MISSIONS.some((m) => m.id === c.unlock));
  assert.throws(() => validateMission({ ...MISSIONS[0], timeLimit: NaN }));
  assert.throws(() => validateMission({ ...MISSIONS[0], waves: [] }));
});
test('actual AI projectile velocities obey forward cones for all behaviors, including elite volleys', () => {
  for (const kind of ['interceptor', 'skirmisher', 'heavy', 'elite']) {
    for (const z of [-240, 240]) {
      const s = createRun(),
        e = s.enemies[0];
      s.enemies = [e];
      Object.assign(e, { x: 0, y: 240, z: 0, yaw: 0, pitch: 0, kind, stage: 3, cooldown: 0 });
      Object.assign(s.player, { x: 0, y: 240, z, yaw: Math.PI, pitch: 0 });
      step(s);
      const shots = s.shots.filter((b) => b.owner === 'enemy');
      if (z > 0) assert.equal(shots.length, 0, kind + ' never fires backwards');
      else {
        assert.ok(shots.length > 0, kind + ' fires forwards');
        const d = direction(e.yaw, e.pitch);
        for (const b of shots)
          assert.ok(
            (b.velocity.x * d.x + b.velocity.y * d.y + b.velocity.z * d.z) /
              Math.hypot(...Object.values(b.velocity)) >=
              Math.cos(Math.PI / 10) - 1e-10,
          );
      }
    }
  }
});
test('phase-born escorts participate in the same projectile tick without a missing previous pose', () => {
  const s = createRun(MISSIONS[5]),
    boss = s.enemies.find((e) => e.kind === 'elite');
  s.enemies = [boss];
  Object.assign(boss, { x: 0, y: 200, z: -80, hp: 801, shield: 0, cooldown: 8 });
  Object.assign(s.player, { x: 0, y: 200, z: 0 });
  s.shots = [
    {
      id: 990,
      x: 0,
      y: 200,
      z: -40,
      velocity: { x: 0, y: 0, z: -6000 },
      owner: 'player',
      target: 0,
      missile: false,
      life: 2,
    },
    {
      id: 991,
      x: 40,
      y: 200,
      z: -40,
      velocity: { x: 0, y: 0, z: -6000 },
      owner: 'player',
      target: 0,
      missile: false,
      life: 2,
    },
  ];
  step(s);
  assert.equal(s.eliteStage, 2);
  assert.equal(s.wave, 1);
  assert.equal(s.enemies.length, 3);
  assert.ok(s.enemies.every((e) => Number.isFinite(e.hp)));
});
