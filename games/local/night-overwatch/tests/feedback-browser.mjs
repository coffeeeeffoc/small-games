import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { sourceHash } from '../scripts/artifact.mjs';
import {
  FLIGHT,
  MAP,
  WEAPONS,
  UNITS,
  terrainHeight,
  impactDamage,
} from '../assets/scripts/core/Data.ts';
import {
  acceptanceBuild,
  evidenceDirectory,
  snapshot,
  press,
  navigateMap,
  aimAt,
  assertLayout,
  enemyLabelCheck,
} from './flight-browser.mjs';

const distance3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const ground = (p) => ({ ...p, y: terrainHeight(p.x, p.z) });
const defensiveDamage = (attacks, id) =>
  attacks.filter((e) => e.friendly && e.unit === id).reduce((sum, e) => sum + e.damage, 0);

function checkProjectile(s, shot, fx) {
  const elapsed = s.time - shot.born;
  const point = s.shotPositions.find((p) => p.id === shot.id);
  assert(point, 'An airborne shot has a real 3D position');
  const expected = {
    x: shot.origin.x + shot.velocity.x * elapsed,
    y: shot.origin.y + shot.velocity.y * elapsed - (FLIGHT.gravity * elapsed ** 2) / 2,
    z: shot.origin.z + shot.velocity.z * elapsed,
  };
  assert(
    distance3(point, expected) < 1e-5,
    'Live projectile follows velocity and gravity, not linear animation progress',
  );
  const speed = Math.hypot(
    shot.velocity.x,
    shot.velocity.y - FLIGHT.gravity * elapsed,
    shot.velocity.z,
  );
  if (fx) {
    assert.equal(fx.weapon, shot.weapon);
    assert(
      [fx.x, fx.y, fx.width, fx.length, fx.speed].every(Number.isFinite),
      'Finite rendered projectile telemetry',
    );
    assert(
      fx.width >= 1.5 + shot.weapon * 0.65 && fx.width <= 5 && fx.length >= 4 + shot.weapon * 1.5 && fx.length <= 12,
      `Projectile body remains readable within 5x12 CSS pixels: ${JSON.stringify(fx)}`,
    );
    assert(
      Math.abs(fx.speed - speed) < 1e-5,
      'Rendered projectile speed is its actual ballistic velocity',
    );
  }
  return { time: s.time, ...point, speed, fx };
}

function checkDamage(before, after, impact, id, expectedKind, attacks = []) {
  const unit = before.units.find((u) => u.id === id),
    final = after.units.find((u) => u.id === id);
  assert(
    unit && final && unit.kind === 'turret',
    'Use a stationary enemy to isolate splash damage',
  );
  const centreDistance = distance3(ground(unit), impact);
  const counterfire = defensiveDamage(attacks, id);
  const damage = unit.hp - final.hp - counterfire,
    full = WEAPONS[impact.weapon].damage;
  const predicted = Math.min(
    unit.hp - counterfire,
    impactDamage(impact.weapon, unit.kind, centreDistance),
  );
  assert(
    Math.abs(damage - predicted) < 1e-5,
    'Observed health loss matches the public 3D damage rule',
  );
  if (expectedKind === 'partial') {
    assert(
      centreDistance > UNITS.turret.radius &&
        centreDistance < UNITS.turret.radius + WEAPONS[impact.weapon].radius,
      'Splash lands outside the hull and inside the blast radius',
    );
    assert(
      damage > 0 && damage < full && final.hp > 0,
      'A near miss partially damages the vehicle without destroying it',
    );
  } else if (expectedKind === 'outside') {
    assert(
      centreDistance > UNITS.turret.radius + WEAPONS[impact.weapon].radius,
      'Control shot is outside the blast radius',
    );
    assert(
      Math.abs(damage) < 1e-8,
      'Outside-radius control adds no damage beyond recorded defensive fire',
    );
  } else {
    assert(
      centreDistance < UNITS.turret.radius,
      'Direct-hit control lands inside the vehicle hull',
    );
    assert(
      Math.abs(damage - Math.min(unit.hp - counterfire, full)) < 1e-8,
      'Direct-hit control retains full damage',
    );
  }
  return {
    id,
    centreDistance,
    beforeHp: unit.hp,
    afterHp: final.hp,
    damage,
    predicted,
    full,
    counterfire,
  };
}

async function fireAndObserve(page, weapon, target, touch, capture, name) {
  await press(page, 'weapon' + weapon, touch);
  await navigateMap(page, target, touch);
  await aimAt(page, target, touch);
  await page.waitForFunction(() => __night.snapshot().reason === 'ready');
  const before = await snapshot(page);
  assert.equal(before.phase, 'playing');
  assert.equal(before.shots.length, 0, 'Isolate each impact from other player rounds');
  assert.equal(before.friendlyRisk, false, 'Feedback probe must not aim at friendlies');
  assert(
    Array.isArray(before.groundAttacks),
    'Read-only ground attack events distinguish defensive fire from player splash',
  );
  const previousAttacks = new Set(before.groundAttacks.map((e) => e.id)),
    attacks = new Map();
  if (touch) await press(page, 'fire', true, false);
  else await page.keyboard.press('Space');
  const launched = await snapshot(page),
    shot = launched.shots.at(-1);
  assert(shot && shot.weapon === weapon, 'Real input launches the selected weapon');
  assert.equal(launched.fired, before.fired + 1, 'Exactly one deliberate shot');
  assert(
    Math.abs(
      Math.hypot(shot.velocity.x, shot.velocity.y, shot.velocity.z) - WEAPONS[weapon].speed,
    ) < 1e-6,
    'Launch speed agrees with weapon muzzle speed',
  );
  const samples = [];
  const deadline = Date.now() + Math.max(15000, (shot.due - shot.born) * 4000);
  let projectileCaptured = false,
    lastTime = -1;
  while (Date.now() < deadline) {
    const s = await snapshot(page);
    for (const event of s.groundAttacks)
      if (!previousAttacks.has(event.id) && event.time >= before.time) attacks.set(event.id, event);
    assert(
      s.effects && Array.isArray(s.effects.impacts) && Array.isArray(s.effects.projectiles),
      'snapshot.effects must expose actually rendered FX',
    );
    assert.equal(s.fired, before.fired + 1, 'Release never leaves automatic fire armed');
    const impact = s.impacts.find((e) => e.shot === shot.id);
    if (impact) {
      const fx = s.effects.impacts.find((e) => e.id === impact.id);
      if (fx) {
        assert.equal(fx.weapon, weapon);
        assert.equal(fx.outcome, impact.outcome);
        assert([fx.x, fx.y, fx.radius, fx.age, fx.primitives].every(Number.isFinite));
        assert(
          fx.primitives > 0 && fx.radius > 0 && fx.age >= 0,
          'The terrain impact produces visible explosion primitives',
        );
        const projected = await page.evaluate((p) => __night.screenPoint(p), impact);
        assert(
          Math.hypot(fx.x - projected.x, fx.y - projected.y) < 3,
          'Explosion is drawn at its real impact anchor',
        );
        assert(samples.length >= 2, 'Observe movement across multiple real frames');
        assert(
          samples.some((p) => p.fx),
          'At least one actual projectile body was rendered in view',
        );
        assert(
          distance3(samples[0], samples.at(-1)) > 1,
          'The projectile visibly traverses the scene',
        );
        assert.equal(s.friendlyDamage, before.friendlyDamage, 'Probe causes no friendly fire');
        assert.deepEqual(s.held, []);
        await capture(name + '-explosion');
        return {
          before,
          after: s,
          shot,
          impact,
          fx,
          samples,
          groundAttacks: [...attacks.values()],
        };
      }
      assert(s.time - impact.time < 0.45, 'Impact exists but no visible explosion was drawn');
    } else if (s.time !== lastTime) {
      const fx = s.effects.projectiles.find((p) => p.id === shot.id);
      const sample = checkProjectile(s, shot, fx);
      samples.push(sample);
      lastTime = s.time;
      if (fx && !projectileCaptured) {
        await capture(name + '-projectile');
        projectileCaptured = true;
      }
    }
    assert.equal(s.phase, 'playing', 'Mission remains playable during the feedback probe');
    await page.waitForTimeout(40);
  }
  throw Error(`No rendered impact observed for ${name}, shot ${shot.id}`);
}

async function run() {
  const base = process.env.NIGHT_URL || '';
  const build = await acceptanceBuild(base);
  const dir = evidenceDirectory('feedback');
  await mkdir(dir, { recursive: true });
  const report = {
    build,
    base,
    input: 'Real mouse/keyboard/CDP touch; read-only snapshots; no simulation writes',
    status: 'running',
    viewports: [],
    errors: [],
    warnings: [],
    resourcesFailed: [],
    visualReview: {
      status: 'pending',
      items: [
        'Geometry of both pause bars',
        'Natural tree silhouettes and crowns',
        'Per-weapon body/tracer proportions and explosion readability',
      ],
    },
  };
  const browser = await chromium.launch({
    headless: process.env.NIGHT_HEADED !== '1',
    executablePath:
      process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  let page;
  try {
    const sizes = process.argv.includes('--desktop-only')
      ? [[1366, 768]]
      : process.argv.includes('--touch-only')
        ? [
            [844, 390],
            [568, 320],
          ]
        : [
            [1366, 768],
            [844, 390],
            [568, 320],
          ];
    for (const [width, height] of sizes) {
      const touch = width < 1000;
      const context = await browser.newContext({
        viewport: { width, height },
        hasTouch: touch,
        isMobile: touch,
        deviceScaleFactor: 1,
      });
      page = await context.newPage();
      page.on('pageerror', (e) => report.errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error')
          (m.text().includes('touchcancel event with cancelable=false')
            ? report.warnings
            : report.errors
          ).push(m.text());
      });
      page.on('requestfailed', (r) => report.resourcesFailed.push(r.url()));
      page.on('response', (r) => {
        if (r.status() >= 400) report.resourcesFailed.push(`${r.status()} ${r.url()}`);
      });
      const capture = (name) => page.screenshot({ path: `${dir}/${width}-${name}.png` });
      const start = async () => {
        await page.goto(base);
        await page.waitForFunction(
          () =>
            globalThis.__night?.snapshot().audio === 'ready' &&
            __night.snapshot().modelImport === 'loaded' &&
            __night.snapshot().buttons.some((b) => b.id === 'start'),
        );
        await press(page, 'start', touch);
        const s = await snapshot(page);
        assertLayout(s, width, height);
        if (!touch)
          assert(
            !s.unitLabels.some(
              (l) => l.active && s.units.some((u) => !u.friendly && u.id === l.id),
            ),
            'Enemy type text starts hidden',
          );
      };
      const result = { width, height, misses: [], splash: [] };
      report.viewports.push(result);
      await start();
      await capture((await snapshot(page)).thermal ? 'thermal-trees' : 'daylight-trees');
      await press(page, 'sensor', touch);
      await capture((await snapshot(page)).thermal ? 'thermal-trees' : 'daylight-trees');
      const pause = (await snapshot(page)).buttons.find((b) => b.id === 'pause');
      assert(pause, 'Permanent pause control');
      await page.screenshot({
        path: `${dir}/${width}-pause-control.png`,
        clip: { x: pause.x, y: pause.y, width: pause.w, height: pause.h },
      });
      await press(page, 'pause', touch);
      const frozen = await snapshot(page);
      await capture('pause-panel');
      await page.waitForTimeout(200);
      assert.equal((await snapshot(page)).time, frozen.time);
      await press(page, 'resume', touch);
      assert.equal((await snapshot(page)).fired, frozen.fired);
      result.labels = await enemyLabelCheck(page, touch, capture);

      for (const weapon of [0, 1, 2]) {
        await start();
        const probe = await fireAndObserve(
          page,
          weapon,
          { x: 0, z: -60 },
          touch,
          capture,
          `miss-${weapon}`,
        );
        assert.equal(probe.impact.outcome, 'miss', 'Empty-ground probe really misses every unit');
        assert.equal(probe.impact.damage, 0);
        assert.equal(
          probe.after.kills,
          probe.before.kills,
          'A real miss grants no player kill credit',
        );
        for (const unit of probe.before.units.filter((u) => !u.friendly)) {
          const loss = unit.hp - probe.after.units.find((u) => u.id === unit.id)?.hp;
          assert(
            Math.abs(loss - defensiveDamage(probe.groundAttacks, unit.id)) < 1e-8,
            'During a miss, every enemy health change must be explained by an actual defensive attack event',
          );
        }
        result.misses.push({
          weapon,
          shot: probe.shot,
          impact: probe.impact,
          fx: probe.fx,
          samples: probe.samples,
          groundAttacks: probe.groundAttacks,
        });
        console.log(
          `${width}: weapon ${weapon} real miss draws explosion; projectile dimensions/speed checked`,
        );
      }

      await start();
      const s = await snapshot(page);
      // A stationary, isolated emplacement makes observed HP changes attributable to one real input.
      const candidates = s.units.filter(
        (u) =>
          u.kind === 'turret' &&
          u.hp > 0 &&
          Math.abs(u.x) < MAP.halfWidth - 12 &&
          Math.abs(u.z) < MAP.halfDepth - 12,
      );
      const separation = (u) =>
        Math.min(
          ...s.units.filter((v) => v.id !== u.id).map((v) => distance3(ground(u), ground(v))),
        );
      const target = candidates.sort((a, b) => separation(b) - separation(a))[0];
      assert(target && separation(target) > 12, 'Isolated stationary splash target');
      for (const kind of ['partial', 'outside', 'direct']) {
        const offset =
          kind === 'partial'
            ? UNITS.turret.radius + WEAPONS[1].radius * 0.6
            : kind === 'outside'
              ? UNITS.turret.radius + WEAPONS[1].radius + 1
              : 0;
        const probe = await fireAndObserve(
          page,
          1,
          { x: target.x + offset, z: target.z },
          touch,
          capture,
          kind,
        );
        const damage = checkDamage(
          probe.before,
          probe.after,
          probe.impact,
          target.id,
          kind,
          probe.groundAttacks,
        );
        if (kind !== 'outside') assert.equal(probe.impact.outcome, 'hit');
        result.splash.push({
          kind,
          ...damage,
          shot: probe.shot,
          impact: probe.impact,
          fx: probe.fx,
          groundAttacks: probe.groundAttacks,
        });
        console.log(`${width}: ${kind} splash health loss ${damage.damage}`);
      }
      await context.close();
      page = undefined;
    }
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.resourcesFailed, []);
    assert.equal(
      build.sourceHash,
      await sourceHash(),
      'Production source changed during acceptance',
    );
    report.status = 'automated-passed';
  } catch (error) {
    report.status = 'failed';
    report.failure = error.stack;
    if (page && !page.isClosed()) {
      report.failureSnapshot = await snapshot(page).catch(() => undefined);
      await page.screenshot({ path: `${dir}/failure.png` }).catch(() => {});
    }
    throw error;
  } finally {
    await writeFile(`${dir}/results.json`, JSON.stringify(report, null, 2));
    await browser.close();
    console.log(`Feedback evidence: ${dir}`);
  }
}

if (process.argv.includes('--self-check')) {
  const weapon = 1,
    unit = { id: 1, kind: 'turret', hp: 90, x: 0, z: 0 };
  const before = { units: [unit] };
  for (const [kind, offset] of [
    ['direct', 0],
    ['partial', UNITS.turret.radius + WEAPONS[weapon].radius / 2],
    ['outside', UNITS.turret.radius + WEAPONS[weapon].radius + 1],
  ]) {
    const impact = { weapon, x: offset, y: terrainHeight(0, 0), z: 0 };
    const amount = impactDamage(weapon, unit.kind, offset);
    checkDamage(before, { units: [{ ...unit, hp: unit.hp - amount }] }, impact, unit.id, kind);
    checkDamage(
      before,
      { units: [{ ...unit, hp: unit.hp - amount - 1.6 }] },
      impact,
      unit.id,
      kind,
      [{ friendly: true, unit: unit.id, damage: 1.6 }],
    );
    if (kind === 'partial')
      assert.throws(() =>
        checkDamage(
          before,
          { units: [{ ...unit, hp: unit.hp - WEAPONS[weapon].damage }] },
          impact,
          unit.id,
          kind,
        ),
      );
  }
  const shot = {
    id: 2,
    weapon: 1,
    born: 0,
    origin: { x: 0, y: 100, z: 0 },
    velocity: { x: 20, y: -30, z: 10 },
  };
  const time = 2,
    position = { id: shot.id, x: 40, y: 40 - FLIGHT.gravity * 2, z: 20 };
  const s = { time, shotPositions: [position] };
  const fx = {
    id: 2,
    weapon: 1,
    x: 100,
    y: 100,
    width: 1,
    length: 3,
    speed: Math.hypot(20, -30 - FLIGHT.gravity * time, 10),
  };
  checkProjectile(s, shot, fx);
  assert.throws(() => checkProjectile(s, shot, { ...fx, width: 10 }));
  assert.throws(() => checkProjectile(s, shot, { ...fx, speed: fx.speed / 2 }));
  assert.throws(() =>
    checkProjectile({ ...s, shotPositions: [{ ...position, y: position.y + 2 }] }, shot, fx),
  );
  console.log(
    'Feedback checkers reject full splash damage, oversized bodies, false speeds and linear flight. No browser opened.',
  );
} else await run();
