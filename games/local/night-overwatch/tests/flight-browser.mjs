import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sourceHash } from '../scripts/artifact.mjs';
import {
  FLIGHT,
  MAP,
  MISSION,
  WEAPONS,
  UNITS,
  HOLD_POINTS,
  ROUTE_LENGTH,
  FRIENDLY_POSTS,
  routePoint,
  patrolPoint,
  terrainHeight,
  impactDamage,
} from '../assets/scripts/core/Data.ts';

// Only read telemetry. Every change to the running game uses browser input.
export const snapshot = (page) => page.evaluate(() => globalThis.__night.snapshot());
const project = (page, point) => page.evaluate((p) => __night.screenPoint(p), point);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const distance3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const pixelDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const center = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const flightActions = [
  'rotateLeft',
  'rotateRight',
  'orbitLeft',
  'orbitRight',
  'altitudeUp',
  'altitudeDown',
  'radiusIn',
  'radiusOut',
];

export function evidenceDirectory(suite) {
  const reports = fileURLToPath(new URL('../reports/', import.meta.url));
  const root = path.resolve(process.env.NIGHT_REPORT_DIR || path.join(reports, 'balance-overhaul'));
  const relative = path.relative(reports, root);
  assert(
    !path.isAbsolute(relative) &&
      !relative.startsWith('..') &&
      !relative.split(/[\\/]/).includes('flight-overhaul'),
    'Keep QA evidence inside new game reports',
  );
  return path.join(root, suite, `${new Date().toISOString().replaceAll(':', '-')}-${process.pid}`);
}

export async function acceptanceBuild(base) {
  assert(process.env.NIGHT_URL, 'Wait for the owner to provide the stable NIGHT_URL');
  assert.match(
    process.env.NIGHT_EXPECTED_SOURCE_HASH || '',
    /^[a-f0-9]{64}$/i,
    'Pin the owner-confirmed build in NIGHT_EXPECTED_SOURCE_HASH before opening a browser',
  );
  const response = await fetch(new URL('build-info.json', base.endsWith('/') ? base : base + '/'));
  assert(response.ok, `Build metadata HTTP ${response.status}`);
  const build = await response.json();
  assert.equal(
    build.sourceHash,
    process.env.NIGHT_EXPECTED_SOURCE_HASH,
    'Test the owner-confirmed hash',
  );
  assert.equal(
    build.sourceHash,
    await sourceHash(),
    'Rebuild current production sources before acceptance',
  );
  return build;
}

export async function enemyLabelCheck(page, touch, capture) {
  const { width, height } = page.viewportSize();
  const initial = await snapshot(page);
  const enemy = initial.units.find(
    (u) => !u.friendly && u.hp > 0 && u.kind === (touch ? 'turret' : 'light'),
  );
  assert(enemy, 'Live enemy for hidden/hover label regression');
  await navigateMap(page, enemy, touch);
  const offsets = [];
  const observe = () =>
    page.evaluate((id) => {
      const s = __night.snapshot(),
        unit = s.units.find((u) => u.id === id);
      return {
        label: s.unitLabels.find((l) => l.id === id),
        anchor: __night.screenPoint(unit),
        activeEnemies: s.unitLabels
          .filter((l) => l.active && s.units.some((u) => u.id === l.id && !u.friendly))
          .map((l) => l.id),
        aimedUnit: s.aimedUnit,
        fired: s.fired,
        held: s.held,
      };
    }, enemy.id);
  if (touch) {
    await aimAt(page, enemy, true);
    let s = await snapshot(page);
    assert.equal(
      s.aimedUnit,
      enemy.id,
      'Touch reticle reaches the actual enemy without mouse hover',
    );
    assert.deepEqual(
      (await observe()).activeEnemies,
      [],
      'Touch does not fabricate mouse hover labels',
    );
    assert(!s.mousePointer, 'Touch leaves no synthetic mouse pointer');
    assert.match(s.ui.fire, /按住开火|点按开火/);
    assert.doesNotMatch(s.ui.fire, /鼠标|左键|LMB|MOUSE/i, 'Touch hint uses touch controls');
    await capture('touch-reticle-enemy');
    const friend = s.units.find((u) => u.friendly && u.hp > 0 && u.routeOffset === undefined);
    assert(friend, 'Stationary friendly for touch reticle warning');
    await navigateMap(page, friend, true);
    await aimAt(page, friend, true);
    s = await snapshot(page);
    assert(s.friendlyRisk, 'Touch reticle detects friendly-fire risk');
    assert.match(s.ui.warning, /友方|FRIENDLY/);
    assert.match(s.ui.feedback, /友方|FRIENDLY/);
    await capture('touch-reticle-friendly');
    await navigateMap(page, { x: 0, z: -60 }, true);
    s = await snapshot(page);
    assert.equal(s.aimedUnit, undefined, 'Empty-ground reticle has no stale inspected target');
    assert.equal(s.friendlyRisk, false, 'Touch reticle warning clears away from friendlies');
    assert.deepEqual((await observe()).activeEnemies, []);
    assert.equal(s.fired, initial.fired, 'Touch inspection never fires');
    assert.deepEqual(s.held, []);
    await capture('touch-reticle-away');
    return {
      enemy: enemy.id,
      friendly: friend.id,
      touch,
      hoverLabelsHidden: true,
      friendlyWarning: true,
    };
  }
  for (let i = 0; i < 6; i++) {
    const unit = (await snapshot(page)).units.find((u) => u.id === enemy.id);
    const body = await project(page, unit);
    // HUD places type text 29 CSS pixels above the marker. Alternate the real body and marker.
    const hover =
      i % 2 && offsets.length
        ? { x: body.x + offsets.at(-1).x, y: body.y + offsets.at(-1).y + 29 }
        : body;
    await page.mouse.move(hover.x, hover.y);
    await page.waitForTimeout(50);
    const reading = await observe();
    assert(reading.label?.active, 'Mouse hover over vehicle or marker reveals enemy type');
    assert.match(reading.label.text, enemy.kind === 'light' ? /轻车|LIGHT/ : /炮台|TURRET/);
    assert.deepEqual(reading.activeEnemies, [enemy.id], 'Only the inspected enemy type is visible');
    offsets.push({
      x: reading.label.x + width / 2 - reading.anchor.x,
      y: height / 2 - reading.label.y - reading.anchor.y,
    });
    if (i === 0) await capture('light-label-hover');
    await page.mouse.move(1, 1);
    await page.waitForTimeout(50);
    assert.deepEqual((await observe()).activeEnemies, [], 'Mouse leave hides enemy type');
  }
  assert(
    Math.max(...offsets.map((p) => p.x)) - Math.min(...offsets.map((p) => p.x)) < 5 &&
      Math.max(...offsets.map((p) => p.y)) - Math.min(...offsets.map((p) => p.y)) < 5,
    `Hover changes label side/offset: ${JSON.stringify(offsets)}`,
  );
  assert.equal((await snapshot(page)).fired, initial.fired, 'Type inspection never fires');
  assert.deepEqual((await snapshot(page)).held, [], 'Type inspection leaves no held fire input');
  await capture('light-label-hidden');
  return { enemy: enemy.id, touch, offsets };
}

// Forecast from a read-only observation; no calls into the running simulation.
export function predictUnit(s, u, seconds) {
  let point = u;
  if (u.kind === 'light') point = patrolPoint(u.origin, s.time - u.born + seconds);
  else if (u.friendly && u.routeOffset !== undefined) {
    const current = s.progress * ROUTE_LENGTH;
    let progress =
      current + (s.convoy === 'holding' || s.convoy === 'arrived' ? 0 : MISSION.speed * seconds);
    if (s.convoy === 'holdRequested') {
      const stop = HOLD_POINTS.find((p) => p >= current - 0.001);
      if (stop !== undefined) progress = Math.min(progress, stop);
    }
    point = routePoint(progress + u.routeOffset);
  } else if (u.kind === 'heavy') {
    const friend = s.units
      .filter((v) => v.friendly && v.hp > 0)
      .sort((a, b) => distance(u, a) - distance(u, b))[0];
    if (friend) {
      const range = distance(u, friend);
      const move = Math.min(UNITS.heavy.speed * seconds, Math.max(0, range - 12));
      if (range > 0)
        point = {
          x: u.x + ((friend.x - u.x) * move) / range,
          z: u.z + ((friend.z - u.z) * move) / range,
        };
    }
  }
  return { x: point.x, y: terrainHeight(point.x, point.z), z: point.z };
}

export function pendingDamage(s, unit) {
  return s.shots.reduce(
    (sum, shot) =>
      sum +
      impactDamage(
        shot.weapon,
        unit.kind,
        distance3(
          { ...shot, y: shot.targetY },
          predictUnit(s, unit, Math.max(0, shot.due - s.time)),
        ),
      ),
    0,
  );
}

export function assertKillAccounting(s) {
  assert(Number.isInteger(s.kills) && s.kills >= 0, 'Player kills are a nonnegative integer');
  assert(
    Number.isInteger(s.friendlyKills) && s.friendlyKills >= 0,
    'Read-only snapshot.friendlyKills must account for defensive kills separately',
  );
  const deadEnemies = s.units.filter((u) => !u.friendly && u.hp <= 0).length;
  assert.equal(
    s.kills + s.friendlyKills,
    deadEnemies,
    'Player and friendly kill counts must partition actual dead enemies without double credit',
  );
  assert.equal(
    s.threatsRemaining,
    MISSION.events.length - deadEnemies,
    'Victory threat count includes every scheduled enemy not yet dead',
  );
  return deadEnemies;
}

export async function press(page, id, touch = false, expand = true) {
  let s = await snapshot(page);
  if (!s.buttons.some((b) => b.id === id) && expand) {
    const drawer = 'flightControls';
    if (s.buttons.some((b) => b.id === drawer)) {
      await press(page, drawer, touch, false);
      s = await snapshot(page);
    }
  }
  const b = s.buttons.find((b) => b.id === id);
  assert(b, `Visible button ${id}; actual: ${s.buttons.map((b) => b.id).join(', ')}`);
  const q = center(b);
  if (touch) await page.touchscreen.tap(q.x, q.y);
  else await page.mouse.click(q.x, q.y);
  await page.waitForTimeout(85);
}

export async function navigateMap(page, target, touch = false) {
  let before = await snapshot(page);
  if (before.buttons.some((b) => b.id === 'zoomOut')) {
    await press(page, 'flightControls', touch, false);
    before = await snapshot(page);
  }
  const map = before.ui.minimap;
  assert(map && [map.x, map.y, map.w, map.h].every(Number.isFinite), 'Minimap layout telemetry');
  assert(
    Math.abs(target.x) <= MAP.halfWidth && Math.abs(target.z) <= MAP.halfDepth,
    'Navigation destination inside mission map',
  );
  const q = {
    x: map.x + 8 + ((target.x + MAP.halfWidth) / (2 * MAP.halfWidth)) * (map.w - 16),
    y: map.y + 25 + ((target.z + MAP.halfDepth) / (2 * MAP.halfDepth)) * (map.h - 33),
  };
  const { width, height } = page.viewportSize();
  assert(q.x >= 0 && q.x < width && q.y >= 0 && q.y < height, 'Minimap target inside viewport');
  assert(
    !before.buttons.some((b) => q.x >= b.x && q.x <= b.x + b.w && q.y >= b.y && q.y <= b.y + b.h),
    'Navigation target must not overlap a HUD button',
  );
  if (touch) await page.touchscreen.tap(q.x, q.y);
  else await page.mouse.click(q.x, q.y);
  await page.waitForTimeout(120);
  const after = await snapshot(page);
  // Browser touch coordinates can round to CSS pixels; allow one map pixel, not a different sector.
  const pixel = Math.hypot((2 * MAP.halfWidth) / (map.w - 16), (2 * MAP.halfDepth) / (map.h - 33));
  assert(
    distance(after.camera.center, target) <= pixel * 1.1,
    'Minimap locates the selected ground position',
  );
  assert(
    distance(after.aim, after.camera.center) < 0.1,
    'Navigation aligns aim with camera destination',
  );
  assert.equal(after.follow, false, 'Manual navigation disables convoy-follow');
  assert.equal(after.fired, before.fired, 'Minimap navigation does not fire through');
  assert.deepEqual(
    after.guns.map((g) => g.ammo),
    before.guns.map((g) => g.ammo),
    'Navigation consumes no ammunition',
  );
  assert.deepEqual(after.held, [], 'Navigation clears held fire input');
  const screen = await project(page, after.camera.center);
  assert(
    screen.x > 0 && screen.x < width && screen.y > 0 && screen.y < height,
    'Selected map destination is genuinely visible through the camera',
  );
  return after;
}

export function assertLayout(s, width, height) {
  const ids = new Set();
  for (const b of s.buttons) {
    assert(!ids.has(b.id), `Duplicate active button ${b.id}`);
    ids.add(b.id);
    assert([b.x, b.y, b.w, b.h].every(Number.isFinite), `${b.id}: finite hit box`);
    assert(
      b.w > 0 &&
        b.h > 0 &&
        b.x >= -0.5 &&
        b.y >= -0.5 &&
        b.x + b.w <= width + 0.5 &&
        b.y + b.h <= height + 0.5,
      `${width}x${height}: ${b.id} outside viewport: ${JSON.stringify(b)}`,
    );
  }
  for (let i = 0; i < s.buttons.length; i++) {
    for (const b of s.buttons.slice(i + 1)) {
      const a = s.buttons[i];
      const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      assert(
        overlapX <= 0.5 || overlapY <= 0.5,
        `${width}x${height}: ${a.id} overlaps ${b.id} by ${overlapX}x${overlapY}`,
      );
    }
  }
}

function clearPoint(s, width, height) {
  for (const xf of [0.5, 0.4, 0.6, 0.3, 0.7]) {
    for (const yf of [0.48, 0.56, 0.4]) {
      const p = { x: width * xf, y: height * yf };
      if (
        !s.buttons.some(
          (b) => p.x > b.x - 36 && p.x < b.x + b.w + 36 && p.y > b.y - 36 && p.y < b.y + b.h + 36,
        )
      )
        return p;
    }
  }
  throw Error('No unobstructed battlefield drag area');
}

export async function aimAt(page, target, touch = false, cdp) {
  if (!touch) {
    const q = await project(page, target);
    const { width, height } = page.viewportSize();
    assert(
      q.x > 0 && q.x < width && q.y > 0 && q.y < height,
      `Target not in camera: ${JSON.stringify({ target, screen: q })}`,
    );
    await page.mouse.move(q.x, q.y);
    await page.waitForTimeout(20);
    return;
  }
  cdp ??= await page.context().newCDPSession(page);
  const { width, height } = page.viewportSize();
  for (let attempt = 0; attempt < 12; attempt++) {
    const s = await snapshot(page);
    const points = await page.evaluate(
      ({ target, aim }) => ({
        to: __night.screenPoint(target),
        from: __night.screenPoint(aim),
      }),
      { target, aim: s.aim },
    );
    if (pixelDistance(points.to, points.from) < 1.5 && distance(s.aim, target) < 1) return;
    const map = s.ui.minimap;
    if (
      points.from.x < 12 ||
      points.from.x > width - 12 ||
      points.from.y < 60 ||
      points.from.y > height - 110 ||
      s.buttons.some(
        (b) =>
          points.from.x >= b.x &&
          points.from.x <= b.x + b.w &&
          points.from.y >= b.y &&
          points.from.y <= b.y + b.h,
      ) ||
      (map &&
        points.from.x >= map.x &&
        points.from.x <= map.x + map.w &&
        points.from.y >= map.y &&
        points.from.y <= map.y + map.h)
    ) {
      await navigateMap(page, target, true);
      continue;
    }
    // Perspective drag scale depends on depth: begin at the actual reticle, not a fixed screen centre.
    const ap = { id: 71, ...points.from };
    const moved = {
      ...ap,
      x: ap.x + Math.max(-60, Math.min(60, points.to.x - points.from.x)),
      y: ap.y + Math.max(-35, Math.min(35, points.to.y - points.from.y)),
    };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [ap] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [moved] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(20);
  }
  const s = await snapshot(page);
  assert(
    distance(s.aim, target) < 1,
    `Touch drag did not reach target: ${JSON.stringify({ aim: s.aim, target })}`,
  );
}

export async function waitForImpact(page, shot) {
  await page.waitForFunction((id) => !__night.snapshot().shots.some((s) => s.id === id), shot.id, {
    timeout: Math.max(15000, (shot.due - shot.born) * 4000),
  });
  const s = await snapshot(page);
  const impact = s.impacts.find((e) => e.shot === shot.id);
  assert(impact, 'Projectile ends in a real terrain impact event');
  assert(
    s.time >= shot.due - 1 / 60 || impact.intercepted,
    'Early impact must be a terrain interception, not an instant hit',
  );
  return impact;
}

export async function friendlyFailure(page) {
  await press(page, 'weapon2');
  const available = (await snapshot(page)).guns[2].ammo;
  assert(
    Number.isInteger(available) && available > 0,
    'Friendly-fire probe has finite heavy ammunition',
  );
  for (let n = 0; n < available && (await snapshot(page)).phase === 'playing'; n++) {
    await page.waitForFunction(
      () => __night.snapshot().phase !== 'playing' || __night.snapshot().guns[2].cooldown < 0.001,
    );
    let s = await snapshot(page);
    if (s.phase !== 'playing') break;
    let target = s.units[0];
    for (let i = 0; i < 3; i++) {
      const flight = await page.evaluate((point) => __night.flightTime(point, 2), target);
      assert(Number.isFinite(flight), 'Rescue target within ballistic range');
      target = predictUnit(s, s.units[0], flight + 0.04);
    }
    await aimAt(page, target);
    await page.keyboard.down('Space');
    await page.keyboard.up('Space');
    const shot = (await snapshot(page)).shots.at(-1);
    assert(shot, 'Friendly-fire failure uses a real launch');
    await waitForImpact(page, shot);
  }
  const s = await snapshot(page);
  assert.equal(s.phase, 'failure', 'Real friendly-fire impacts cause mission failure');
  assert.equal(s.failureCause, 'friendly');
  assert(s.friendlyDamage > 0);
  return s;
}

// Read-only trajectory prediction + live range-dependent flight time. No simulation stepping/state writes.
export async function missionReplay(
  page,
  { touch = false, omitLast = false, forgiving = false, capture } = {},
) {
  assert(MISSION.events.length > 0, 'Mission contains scheduled enemy threats');
  assert(
    !(forgiving && omitLast),
    'Forgiving success and omitted-threat failure are separate replays',
  );
  const initial = await snapshot(page);
  const friendlyIds = initial.units.filter((u) => u.friendly).map((u) => u.id);
  const deliberateMisses = [],
    missChecks = [];
  let delayedStart, missFailure;
  if (forgiving) {
    assert.equal(initial.fired, 0, 'Forgiving replay starts fresh without prior player fire');
    console.log(
      `${touch ? 'touch' : 'desktop'} forgiving: observing sixty simulation seconds with no player intervention`,
    );
    await page.waitForFunction(
      () => __night.snapshot().time >= 60 || __night.snapshot().phase !== 'playing',
      null,
      { timeout: 180000 },
    );
    delayedStart = await snapshot(page);
    assert.equal(
      delayedStart.phase,
      'playing',
      'New players can wait sixty seconds before helping',
    );
    assert.equal(delayedStart.fired, 0, 'Delay is real idle time, not simulated player assistance');
    assert.equal(
      delayedStart.kills,
      0,
      'Defensive kills never inflate player credit during idle observation',
    );
    assertKillAccounting(delayedStart);
    assert(
      friendlyIds.every((id) => delayedStart.units.some((u) => u.id === id && u.hp > 0)),
      'Every initial friendly survives the intervention delay',
    );
    assert(
      delayedStart.groundAttacks.some((e) => e.friendly && e.damage > 0),
      'Defenders really return fire',
    );
    assert(
      delayedStart.units.some((u) => !u.friendly && u.hp < u.maxHp),
      'Defensive fire actually damages enemies',
    );
    await capture?.('forgiving-delay-60s');
    console.log(
      `${touch ? 'touch' : 'desktop'} forgiving: all ${friendlyIds.length} friendlies survive the idle delay`,
    );
  }
  const cdp = touch ? await page.context().newCDPSession(page) : undefined;
  if (touch) {
    // Use the real optical zoom: a far target can be smaller than one touch coordinate pixel.
    for (let i = 0; i < 8; i++) await press(page, 'zoomIn', true);
    await press(page, 'flightControls', true, false);
  }
  const started = Date.now(),
    seen = new Set();
  let omitted,
    peakDraws = 0,
    peakEffects = 0,
    mapNavigations = 0;
  while (Date.now() - started < (MISSION.duration + 60) * 3000) {
    if (missFailure) throw missFailure;
    let s = await snapshot(page);
    assertKillAccounting(s);
    peakDraws = Math.max(peakDraws, s.drawCalls || 0);
    peakEffects = Math.max(peakEffects, s.visibleEffects || 0);
    for (const u of s.units.filter((u) => !u.friendly)) seen.add(u.id);
    if (omitLast && !omitted && seen.size >= MISSION.events.length) {
      const friends = s.units.filter((u) => u.friendly);
      omitted = s.units
        .filter((u) => !u.friendly && u.kind === 'turret' && u.hp > 0)
        .sort(
          (a, b) =>
            Math.min(...friends.map((f) => distance(b, f))) -
            Math.min(...friends.map((f) => distance(a, f))),
        )[0]?.id;
    }
    if (s.phase !== 'playing') {
      await Promise.all(missChecks);
      if (missFailure) throw missFailure;
      assert.equal(seen.size, MISSION.events.length, 'All scheduled threats were encountered');
      if (omitLast) {
        assert(omitted, 'Omission run actually leaves one live threat');
        assert.equal(s.phase, 'failure', 'Leaving a threat must never produce success');
        assert.deepEqual(
          s.units.filter((u) => !u.friendly && u.hp > 0).map((u) => u.id),
          [omitted],
          'Only the intentionally omitted threat remains',
        );
        assert.equal(s.kills + s.friendlyKills, MISSION.events.length - 1);
        assert.equal(s.threatsRemaining, 1);
        assert(
          s.units.filter((u) => u.friendly).every((u) => u.hp > 0),
          'Omission result must not be caused by friendly losses',
        );
        assert(
          s.progress >= 0.99 || s.failure === 'timeout',
          'Omission must reach extraction or timeout; an early friendly death cannot prove the win gate',
        );
      } else {
        assert.equal(s.phase, 'success', JSON.stringify(s));
        assert.equal(s.kills + s.friendlyKills, MISSION.events.length);
        assert.equal(s.threatsRemaining, 0);
        assert(
          s.units.filter((u) => u.friendly).every((u) => u.hp > 0),
          'Every friendly group survives',
        );
        assert.equal(s.friendlyDamage, 0, 'Replay must avoid friendly fire');
        assert.equal(s.convoy, 'arrived', 'Threat clearance alone cannot finish the escort');
        assert(
          s.progress >= 1 - 1e-6 && s.time >= ROUTE_LENGTH / MISSION.speed - 1 / 60,
          'Success requires completing the configured convoy journey',
        );
      }
      assert.deepEqual(
        s.units.filter((u) => u.friendly).map((u) => u.id),
        friendlyIds,
        'Every initial friendly remains accounted for at mission end',
      );
      if (forgiving) {
        assert(deliberateMisses.length > 0, 'Forgiving replay includes actual deliberate misses');
        assert.equal(
          deliberateMisses.length,
          Math.floor((s.fired - initial.fired) / 4),
          'Every fourth player round is an independently verified terrain miss',
        );
        assert(s.kills > 0, 'Player intervention contributes real kills after the idle delay');
        for (const [index, gun] of s.guns.entries())
          if (Number.isFinite(WEAPONS[index].ammo))
            assert(
              gun.ammo > 0,
              `Forgiving replay retains weapon ${index} ammunition after its deliberate misses`,
            );
      }
      return {
        ...s,
        encountered: seen.size,
        omitted,
        peakDraws,
        peakEffects,
        mapNavigations,
        initialFriendlyCount: friendlyIds.length,
        convoySeconds: ROUTE_LENGTH / MISSION.speed,
        missionSeconds: MISSION.duration,
        forgiving,
        delayedStart,
        deliberateMisses: deliberateMisses.sort((a, b) => a.ordinal - b.ordinal),
      };
    }
    const friends = s.units.filter((u) => u.friendly && u.hp > 0);
    const enemies = s.units
      .filter((u) => !u.friendly && u.hp > 0 && u.id !== omitted)
      .sort(
        (a, b) =>
          Math.min(...friends.map((f) => distance(a, f))) -
          Math.min(...friends.map((f) => distance(b, f))),
      );
    const projected = await page.evaluate(
      (units) => units.map((u) => ({ id: u.id, ...__night.screenPoint(u) })),
      enemies,
    );
    const { width, height } = page.viewportSize();
    const visible = (p) =>
      p.x >= 24 &&
      p.x <= width - 24 &&
      p.y >= 70 &&
      p.y <= height - 112 &&
      !s.buttons.some((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
    const candidates = enemies.filter((u) => pendingDamage(s, u) < u.hp);
    const enemy =
      candidates.find((u) => visible(projected.find((p) => p.id === u.id))) ?? candidates[0];
    if (enemy) {
      if (
        !visible(projected.find((p) => p.id === enemy.id)) ||
        (touch && distance(s.camera.center, enemy) > 20)
      ) {
        s = await navigateMap(page, enemy, touch);
        mapNavigations++;
      }
      const gun =
        enemy.kind === 'heavy' && s.guns[2].ammo > 0
          ? 2
          : enemy.kind !== 'light' && s.guns[1].ammo > 0
            ? 1
            : 0;
      if (s.selected !== gun) await press(page, 'weapon' + gun, touch);
      s = await snapshot(page);
      const liveEnemy = s.units.find((u) => u.id === enemy.id);
      if (!liveEnemy || liveEnemy.hp <= 0) continue;
      let lead = enemy;
      let flightTime;
      for (let i = 0; i < 3; i++) {
        flightTime = await page.evaluate(({ point, weapon }) => __night.flightTime(point, weapon), {
          point: lead,
          weapon: gun,
        });
        assert(Number.isFinite(flightTime), 'Predicted contact within ballistic range');
        lead = predictUnit(s, liveEnemy, flightTime + 0.06);
      }
      if (!visible(await project(page, lead))) {
        await navigateMap(page, lead, touch);
        mapNavigations++;
      }
      await aimAt(page, lead, touch, cdp);
      s = await snapshot(page);
      if (
        s.reason === 'ready' &&
        !s.friendlyRisk &&
        !s.units
          .filter((u) => u.friendly && u.hp > 0)
          .some(
            (f) =>
              distance3(predictUnit(s, f, flightTime), lead) <
              WEAPONS[gun].radius + UNITS[f.kind].radius + 1,
          )
      ) {
        const ordinal = s.fired - initial.fired + 1;
        const deliberate = forgiving && ordinal % 4 === 0;
        if (deliberate) {
          const empty = { x: 0, z: -60 };
          await navigateMap(page, empty, touch);
          mapNavigations++;
          await aimAt(page, empty, touch, cdp);
          s = await snapshot(page);
          assert.equal(s.reason, 'ready', 'Deliberate miss uses a legal live firing opportunity');
          assert.equal(s.friendlyRisk, false, 'Deliberate miss stays clear of friendlies');
        }
        if (touch) await press(page, 'fire', true, false);
        else {
          await page.keyboard.down('Space');
          await page.keyboard.up('Space');
        }
        if (forgiving) {
          const fired = await snapshot(page),
            shot = fired.shots.at(-1);
          assert.equal(
            fired.fired,
            s.fired + 1,
            'Each forgiving input launches exactly one player round',
          );
          assert(shot && shot.weapon === gun, 'Forgiving replay records the real launched round');
          if (deliberate)
            missChecks.push(
              waitForImpact(page, shot)
                .then((impact) => {
                  assert.equal(
                    impact.outcome,
                    'miss',
                    `Intentional round ${ordinal} must actually miss`,
                  );
                  assert.equal(impact.damage, 0, 'Intentional miss deals no player damage');
                  deliberateMisses.push({ ordinal, shot, impact });
                })
                .catch((error) => {
                  missFailure = error;
                }),
            );
        }
      }
    }
    if (s.convoy === 'holding') await press(page, 'convoy', touch);
    await page.waitForTimeout(100);
  }
  throw Error('Real-input mission replay timed out');
}

async function run() {
  const base = process.env.NIGHT_URL || 'http://localhost:4318';
  const dir = evidenceDirectory('flight');
  await mkdir(dir, { recursive: true });
  const build = await acceptanceBuild(base);
  console.log(`Flight evidence: ${dir}`);
  const browser = await chromium.launch({
    headless: process.env.NIGHT_HEADED !== '1',
    executablePath:
      process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const report = {
    build,
    base,
    input: 'Real Playwright mouse/keyboard and CDP touch; read-only telemetry',
    fullMissionRequested: process.argv.includes('--mission'),
    omissionRequested: process.argv.includes('--omission'),
    forgivingRequested: process.argv.includes('--forgiving'),
    viewports: [],
    errors: [],
    warnings: [],
    resourcesFailed: [],
    status: 'running',
  };
  let activePage;
  try {
    const viewports = process.argv.includes('--touch-only')
      ? [[844, 390]]
      : process.argv.includes('--desktop-only')
        ? [[1366, 768]]
        : [
            [1366, 768],
            [844, 390],
          ];
    for (const [width, height] of viewports) {
      const touch = width < 1000;
      const context = await browser.newContext({
        viewport: { width, height },
        hasTouch: touch,
        isMobile: touch,
        deviceScaleFactor: 1,
      });
      const page = (activePage = await context.newPage());
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
      const capture = (name) => page.screenshot({ path: path.join(dir, `${width}-${name}.png`) });
      const result = { width, height, checks: [] };
      report.viewports.push(result);
      const check = (name) => {
        result.checks.push(name);
        console.log(`${width}: ${name}`);
      };
      const cdp = touch ? await context.newCDPSession(page) : undefined;
      await page.goto(base);
      await page.waitForFunction(
        () =>
          globalThis.__night?.snapshot().audio === 'ready' &&
          __night.snapshot().buttons.some((b) => b.id === 'start'),
      );
      await press(page, 'start', touch);
      let s = await snapshot(page);
      assert.equal(s.modelImport, 'loaded');
      assertKillAccounting(s);
      for (const [index, gun] of s.guns.entries())
        assert.equal(
          gun.ammo,
          Number.isFinite(WEAPONS[index].ammo) ? WEAPONS[index].ammo : 'infinite',
          `Weapon ${index} starts with its configured ammunition`,
        );
      assert.equal(
        s.guns[2].ammo,
        WEAPONS[2].ammo,
        'Briefing/start preserves the configured heavy ammunition',
      );
      result.heavyAmmo = {
        configured: WEAPONS[2].ammo,
        initial: s.guns[2].ammo,
        reloadSeconds: WEAPONS[2].interval,
      };
      for (const key of ['x', 'y', 'z', 'heading', 'yaw', 'radius', 'altitude', 'direction'])
        assert(Number.isFinite(s.aircraft?.[key]), `Aircraft telemetry ${key}`);
      assert(s.camera?.position && Array.isArray(s.shotPositions) && Array.isArray(s.unitLabels));
      if (!touch)
        assert(
          !s.unitLabels.some((l) => l.active && s.units.some((u) => !u.friendly && u.id === l.id)),
          'Enemy type labels are hidden before hover',
        );
      assert.equal(
        s.threatsRemaining,
        MISSION.events.length,
        'Every configured threat remains at mission start',
      );
      const friends = s.units.filter((u) => u.friendly);
      assert(friends.length >= 4, 'Multiple friendly groups');
      assert.deepEqual(
        [...new Set(friends.map((u) => u.group))].sort((a, b) => a - b),
        Array.from({ length: FRIENDLY_POSTS.length + 1 }, (_, i) => i),
        'Convoy and every configured post have defenders',
      );
      for (let group = 0; group <= FRIENDLY_POSTS.length; group++)
        assert.equal(
          friends.filter((u) => u.group === group).length,
          3,
          'Each convoy/post group starts with three friendlies',
        );
      for (const friend of friends) {
        assert.equal(
          friend.maxHp,
          UNITS[friend.kind].hp,
          'Friendly maximum durability matches its unit configuration',
        );
        assert.equal(friend.hp, friend.maxHp, 'Friendly units begin at full health');
      }
      result.friendlyRoster = friends.map(({ id, kind, group, hp, maxHp }) => ({
        id,
        kind,
        group,
        hp,
        maxHp,
      }));
      assert(
        Math.max(...friends.flatMap((a) => friends.map((b) => distance(a, b)))) > 35,
        'Friendly groups must be spread across the terrain',
      );
      assertLayout(s, width, height);
      await capture('battle');
      const beforeFullscreen = s;
      await press(page, 'fullscreen', touch, false);
      await page.waitForFunction(() => !!document.fullscreenElement);
      assert.equal((await snapshot(page)).pauses.length, 0, 'Direct fullscreen does not pause');
      await capture('fullscreen');
      await press(page, 'fullscreen', touch, false);
      await page.waitForFunction(() => !document.fullscreenElement);
      await page.waitForTimeout(250);
      s = await snapshot(page);
      assert(s.time > beforeFullscreen.time && s.progress >= beforeFullscreen.progress);
      assert.equal(s.fired, beforeFullscreen.fired);
      assert.equal(s.phase, 'playing');
      assert.deepEqual(s.held, []);
      check('permanent fullscreen: real entry/exit, progress retained, no accidental shot');

      const anchor = { x: s.units[0].x, z: s.units[0].z };
      const p0 = await project(page, anchor),
        naturalBefore = s;
      await page.waitForTimeout(850);
      s = await snapshot(page);
      assert(distance3(s.aircraft, naturalBefore.aircraft) > 0.1, 'Aircraft naturally travels');
      assert(
        distance3(s.camera.position, naturalBefore.camera.position) > 0.1,
        'Camera travels with aircraft',
      );
      assert(
        pixelDistance(await project(page, anchor), p0) > 0.25,
        'Stationary ground visibly changes projection',
      );
      check('natural aircraft motion changes the actual camera and ground projection');

      const originalCenter = { ...s.camera.center };
      for (const destination of [
        { x: -82, z: -36 },
        { x: 78, z: 32 },
      ]) {
        const before = await snapshot(page),
          oldProjection = await project(page, anchor);
        s = await navigateMap(page, destination, touch);
        assert(
          distance(s.camera.center, before.camera.center) > 20,
          'Minimap moves to a different sector',
        );
        assert(
          pixelDistance(await project(page, anchor), oldProjection) > 5,
          'Sector navigation changes real ground projection',
        );
        await page.waitForTimeout(180);
        assert.equal(
          (await snapshot(page)).fired,
          before.fired,
          'Minimap release does not leave firing stuck',
        );
      }
      await capture('minimap-navigation');
      await navigateMap(page, originalCenter, touch);
      check(
        'minimap sector navigation: real camera/aim alignment, no fire/ammo leak, no sticky trigger',
      );

      await press(page, 'flightControls', touch, false);
      assertLayout(await snapshot(page), width, height);
      await capture('flight-controls');
      for (const id of flightActions) {
        const before = await snapshot(page),
          q = await project(page, anchor);
        // A stabilized camera intentionally keeps its focus point nearly still; sample depth off-axis too.
        const landmarks = [
          anchor,
          { x: anchor.x + 32, z: anchor.z - 24 },
          { x: anchor.x + 55, z: anchor.z + 15 },
        ];
        const projectedBefore = await page.evaluate(
          (points) => points.map((p) => __night.screenPoint(p)),
          landmarks,
        );
        await press(page, id, touch);
        await page.waitForTimeout(
          id.startsWith('altitude') || id.startsWith('radius') ? 1000 : 200,
        );
        s = await snapshot(page);
        assert.equal(s.fired, before.fired, `${id} must not fire through the panel`);
        assert.deepEqual(s.held, []);
        assertLayout(s, width, height);
        if (id.startsWith('rotate')) {
          assert.notDeepEqual(
            s.camera.rotation,
            before.camera.rotation,
            `${id}: real camera rotation`,
          );
          assert(
            pixelDistance(await project(page, anchor), q) > 1,
            `${id}: changed ground projection`,
          );
        } else if (id.startsWith('orbit')) {
          assert.equal(s.aircraft.direction, id === 'orbitLeft' ? -1 : 1);
          // A bank-limited reversal keeps cruise speed; full circle recapture is covered by Flight's fixed-step test.
          await page.waitForTimeout(2800);
          const a = (await snapshot(page)).aircraft;
          await page.waitForTimeout(450);
          const b = (await snapshot(page)).aircraft;
          assert(Math.sign(b.bank) === a.direction, `${id}: banks into the requested turn`);
          assert(Math.abs(b.bank) <= FLIGHT.maxBank + 1e-8, `${id}: bounded physical bank`);
          assert(distance(a, b) > 2, `${id}: keeps flying during reversal`);
        } else {
          const key = id.startsWith('altitude') ? 'altitude' : 'radius';
          const sign = id.endsWith('Up') || id.endsWith('Out') ? 1 : -1;
          assert((s.aircraft[key] - before.aircraft[key]) * sign > 0, `${id}: ${key} changes`);
          assert(
            distance3(s.camera.position, before.camera.position) > 1,
            `${id}: camera position changes`,
          );
          const projectedAfter = await page.evaluate(
            (points) => points.map((p) => __night.screenPoint(p)),
            landmarks,
          );
          assert(
            Math.max(...projectedAfter.map((p, i) => pixelDistance(p, projectedBefore[i]))) > 0.25,
            `${id}: ground projection changes across scene depth`,
          );
        }
      }
      await press(page, 'flightControls', touch, false);
      check(
        'rotation, both orbit directions, altitude and radius; panel input isolation and layout',
      );

      const picks = [];
      for (const [xf, yf] of [
        [0.38, 0.43],
        [0.52, 0.5],
        [0.65, 0.56],
      ]) {
        if (!touch) await page.mouse.move(width * xf, height * yf);
        else {
          const ap = { id: 1, x: width * 0.5, y: height * 0.48 };
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [ap] });
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ ...ap, x: ap.x + 28, y: ap.y - 17 }],
          });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        }
        s = await snapshot(page);
        if (!touch)
          assert(
            pixelDistance(await project(page, s.aim), { x: width * xf, y: height * yf }) < 3,
            'Picked elevated terrain round-trips to the actual pointer',
          );
        picks.push({ ...s.aim, y: terrainHeight(s.aim.x, s.aim.z) });
      }
      assert(
        Math.max(...picks.map((p) => p.y)) - Math.min(...picks.map((p) => p.y)) > 0.05,
        'Terrain picker must follow non-flat ground',
      );
      check('terrain elevation picking and pointer projection');

      await press(page, 'weapon2', touch);
      // At orbit centre, yaw motion cannot masquerade as a distance/altitude effect.
      const target = { x: 0, z: 0, y: terrainHeight(0, 0) };
      await aimAt(page, target, touch, cdp);
      const low = await snapshot(page);
      await press(page, 'altitudeUp', touch);
      await press(page, 'flightControls', touch, false);
      await aimAt(page, target, touch, cdp);
      const high = await snapshot(page);
      assert(
        high.flightTime > low.flightTime,
        'Higher altitude increases time to the same ground point',
      );
      await press(page, 'radiusOut', touch);
      await press(page, 'flightControls', touch, false);
      await aimAt(page, target, touch, cdp);
      const far = await snapshot(page);
      assert(
        Math.abs(far.flightTime - high.flightTime) > 0.005,
        'Orbit radius affects actual flight time',
      );
      assert.equal(far.reason, 'ready', 'Ballistic sample is a legal ground aim');
      let heldFire;
      if (touch) {
        heldFire = { id: 90, ...center(far.buttons.find((b) => b.id === 'fire')) };
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [heldFire] });
      } else await page.keyboard.down('Space');
      await page.waitForTimeout(60);
      s = await snapshot(page);
      const shot = s.shots.at(-1);
      assert(shot, 'Real fire input launches shell');
      assert.equal(
        s.guns[2].ammo,
        far.guns[2].ammo - 1,
        'One heavy trigger press consumes exactly one round',
      );
      assert(
        Math.abs(s.guns[2].cooldown - (WEAPONS[2].interval - (s.time - shot.born))) < 1 / 60,
        'Heavy reload retains the configured interval',
      );
      result.heavyAmmo.afterOneShot = s.guns[2].ammo;
      assert(
        Math.abs(shot.due - shot.born - far.flightTime) < 0.15,
        'The launched shot uses the displayed distance/height-dependent flight time',
      );
      assert(
        shot.due - shot.born > 1.4,
        'Heavy shell must visibly travel for longer than the old one-second flight',
      );
      assert(
        distance3(shot.origin, far.aircraft) < 12,
        'Shell originates at the aircraft, not near target',
      );
      const elapsed = s.time - shot.born;
      const mount = WEAPONS[shot.weapon].muzzle;
      const mountDistance = Math.hypot(mount.x, mount.y, mount.z);
      assert(
        Math.abs(distance3(shot.origin, s.aircraft) - mountDistance) < FLIGHT.speed * elapsed + 1,
        'Launch point is the fixed aircraft mount, allowing only travel since launch',
      );
      assert(
        distance3(shot.origin, { ...shot, y: shot.targetY }) > 100,
        'Long-range 3D trajectory',
      );
      const first = s.shotPositions.find((p) => p.id === shot.id);
      assert(
        first && distance3(first, shot.origin) < distance3(first, { ...shot, y: shot.targetY }),
        'Early shell is still nearer aircraft than impact',
      );
      await page.waitForTimeout(250);
      const moved = (await snapshot(page)).shotPositions.find((p) => p.id === shot.id);
      assert(
        moved && distance3(first, moved) > 1 && moved.y < first.y,
        'Shell visibly advances through the 3D route',
      );
      await capture('long-range-shell');
      if (touch) {
        const pauseFinger = {
          id: 91,
          ...center((await snapshot(page)).buttons.find((b) => b.id === 'pause')),
        };
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [heldFire, pauseFinger],
        });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [heldFire] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await page.keyboard.press('p');
        await page.keyboard.up('Space');
      }
      await page.waitForFunction(() => __night.snapshot().pauses.includes('manual'));
      const frozen = await snapshot(page);
      assert(
        frozen.shots.some((p) => p.id === shot.id),
        'Pause while shell is genuinely in flight',
      );
      assertLayout(frozen, width, height);
      await capture('pause');
      await page.waitForTimeout(500);
      const still = await snapshot(page);
      for (const key of ['time', 'aircraft', 'camera', 'shotPositions', 'shots', 'fired'])
        assert.deepEqual(still[key], frozen[key], `Pause freezes ${key}`);
      assert.deepEqual(still.held, []);
      await press(page, 'settings', touch);
      await press(page, 'help', touch);
      assertLayout(await snapshot(page), width, height);
      await press(page, 'close', touch);
      assert((await snapshot(page)).pauses.includes('manual'), 'Closing help retains manual pause');
      await press(page, 'close', touch);
      await press(page, 'resume', touch, false);
      await page.waitForTimeout(220);
      const resumed = await snapshot(page);
      assert(resumed.time > frozen.time);
      assert.equal(resumed.fired, frozen.fired, 'Resume requires fresh fire input');
      const sameShot = resumed.shots.find((p) => p.id === shot.id);
      assert(sameShot, 'Long-range shell still exists after resume');
      for (const key of ['origin', 'velocity', 'x', 'z', 'due', 'targetY'])
        assert.deepEqual(sameShot[key], shot[key], `In-flight ${key} remains fixed`);
      await press(page, 'fire', touch, false);
      const cooling = await snapshot(page);
      assert(
        cooling.time - shot.born < WEAPONS[2].interval,
        'Fresh press probes the active reload interval',
      );
      assert.equal(
        cooling.fired,
        resumed.fired,
        'A fresh trigger press during reload does not launch',
      );
      assert.equal(
        cooling.guns[2].ammo,
        result.heavyAmmo.afterOneShot,
        'Rejected reload press consumes no ammunition',
      );
      result.heavyAmmo.reloadBlockedFreshPress = true;
      if (!touch) {
        await navigateMap(page, shot);
        if ((await snapshot(page)).thermal) await press(page, 'sensor');
        for (let i = 0; i < 6; i++) await press(page, 'zoomIn');
        await press(page, 'flightControls', false, false);
      }
      const impact = await waitForImpact(page, shot);
      assert.equal(
        (await snapshot(page)).guns[2].cooldown,
        0,
        'Reload finishes while the long-range round travels',
      );
      if (!touch) {
        assert.equal(impact.outcome, 'miss', 'Close explosion screenshot uses a real terrain miss');
        await page.waitForFunction((time) => __night.snapshot().time - time >= 0.25, impact.time);
        result.closeMiss = await snapshot(page);
        await capture('heavy-miss-daylight-close');
        for (let i = 0; i < 6; i++) await press(page, 'zoomOut');
        await press(page, 'flightControls', false, false);
      }
      check(
        'distance/height flight times, aircraft launch, long trajectory, pause freeze and clean resume',
      );

      result.labels = await enemyLabelCheck(page, touch, capture);
      check(
        touch
          ? 'touch reticle aim, friendly warning and touch hints; no synthetic hover labels'
          : 'enemy types hidden by default, shown on hover, hidden on leave; fixed ground-relative anchor',
      );

      if (touch) {
        await press(page, 'weapon0', true);
        s = await snapshot(page);
        const ap = { id: 1, ...clearPoint(s, width, height) };
        const fp = { id: 2, ...center(s.buttons.find((b) => b.id === 'fire')) };
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [ap] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [ap, fp] });
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ ...ap, x: ap.x + 30, y: ap.y - 18 }, fp],
        });
        await page.waitForTimeout(480);
        const firing = await snapshot(page);
        assert(firing.fired >= s.fired + 3, 'Second finger really fires while first finger aims');
        assert(distance(s.aim, firing.aim) > 1, 'First finger really moves aim');
        await capture('two-finger-fire');
        const outside = { ...fp, x: ap.x, y: ap.y };
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [ap, outside],
        });
        const released = await snapshot(page);
        await page.waitForTimeout(300);
        assert.equal(
          (await snapshot(page)).fired,
          released.fired,
          'Sliding off fire stops immediately',
        );
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [ap, fp] });
        await page.waitForTimeout(300);
        assert.equal((await snapshot(page)).fired, released.fired, 'Sliding back does not re-arm');
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        assert.deepEqual((await snapshot(page)).held, []);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [fp] });
        await page.waitForTimeout(160);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        const cancelled = await snapshot(page);
        await page.waitForTimeout(400);
        assert.equal((await snapshot(page)).fired, cancelled.fired);
        assert.deepEqual((await snapshot(page)).held, []);
        check('real simultaneous drag/fire, slide-out, no re-arm and touch cancellation');
      }
      result.interactionPassed = true;
      await writeFile(path.join(dir, 'progress.json'), JSON.stringify(report, null, 2));
      const replays = [
        process.argv.includes('--mission') && 'mission',
        process.argv.includes('--forgiving') && 'forgiving',
      ].filter(Boolean);
      for (const replay of replays) {
        await page.reload();
        await page.waitForFunction(() =>
          globalThis.__night?.snapshot().buttons.some((b) => b.id === 'start'),
        );
        await press(page, 'start', touch);
        result[replay] = await missionReplay(page, {
          touch,
          forgiving: replay === 'forgiving',
          capture,
        });
        await capture(`${replay}-success`);
        await press(page, 'retry', touch, false);
        const retry = await snapshot(page);
        assert.equal(retry.phase, 'playing');
        assert.equal(retry.fired, 0, 'Real retry clears prior launches');
        assert.equal(retry.kills, 0, 'Retry clears player kill credit');
        assert.equal(retry.friendlyKills, 0, 'Retry clears defensive kill credit');
        for (const [index, gun] of retry.guns.entries())
          assert.equal(
            gun.ammo,
            Number.isFinite(WEAPONS[index].ammo) ? WEAPONS[index].ammo : 'infinite',
            `Retry restores configured weapon ${index} ammunition`,
          );
        assert.equal(
          retry.guns[2].ammo,
          WEAPONS[2].ammo,
          'Real retry restores the configured heavy ammunition',
        );
        assert.equal(retry.units[0].hp, retry.units[0].maxHp, 'Real retry restores rescue health');
        result.heavyAmmo.afterRetry = retry.guns[2].ammo;
        await capture(`${replay}-retry-ammo`);
        check(
          `complete ${replay}: all ${MISSION.events.length} threats cleared (${result[replay].kills} player + ` +
            `${result[replay].friendlyKills} defenders), every friendly survives, zero friendly fire; ` +
            `retry restores ${WEAPONS[2].ammo} heavy rounds`,
        );
        await writeFile(path.join(dir, 'progress.json'), JSON.stringify(report, null, 2));
      }
      if (!touch && process.argv.includes('--omission')) {
        await page.reload();
        await page.waitForFunction(() =>
          globalThis.__night?.snapshot().buttons.some((b) => b.id === 'start'),
        );
        await press(page, 'start');
        result.omission = await missionReplay(page, { omitLast: true });
        await capture('omitted-threat-failure');
      }
      await context.close();
      activePage = undefined;
      await writeFile(path.join(dir, 'progress.json'), JSON.stringify(report, null, 2));
    }
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.resourcesFailed, []);
    assert.equal(
      build.sourceHash,
      await sourceHash(),
      'Production source changed during acceptance',
    );
    report.status = 'passed';
    report.visualReview =
      'Pause aesthetics and terrain art require review of the captured screenshots';
  } catch (error) {
    report.status = 'failed';
    report.failure = error.stack;
    if (activePage && !activePage.isClosed()) {
      report.failureSnapshot = await snapshot(activePage).catch(() => undefined);
      await activePage.screenshot({ path: path.join(dir, 'failure.png') }).catch(() => {});
    }
    throw error;
  } finally {
    const mode = process.argv.includes('--forgiving')
      ? process.argv.includes('--mission')
        ? 'mission-and-forgiving'
        : 'forgiving'
      : process.argv.includes('--mission')
        ? 'mission'
        : process.argv.includes('--omission')
          ? 'omission'
          : 'interaction';
    const viewport = process.argv.includes('--touch-only')
      ? '-touch'
      : process.argv.includes('--desktop-only')
        ? '-desktop'
        : '';
    const historical = path.join(dir, 'historical');
    await mkdir(historical, { recursive: true });
    for (const name of ['results.json', `${mode}${viewport}-results.json`]) {
      const old = await readFile(path.join(dir, name)).catch((e) => {
        if (e.code !== 'ENOENT') throw e;
      });
      if (old) await writeFile(path.join(historical, `${Date.now()}-${name}`), old);
      await writeFile(path.join(dir, name), JSON.stringify(report, null, 2));
    }
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--prediction-check')) {
    const s = { time: 11, progress: 0, convoy: 'moving', units: [] };
    const origin = { x: -78, z: 16 };
    const expected = patrolPoint(origin, 10);
    assert.deepEqual(predictUnit(s, { kind: 'light', origin, born: 4 }, 3), {
      x: expected.x,
      y: terrainHeight(expected.x, expected.z),
      z: expected.z,
    });
    const friend = { kind: 'escort', friendly: true, hp: 160, x: 13, z: 0 };
    s.units.push(friend);
    assert.equal(
      predictUnit(s, { kind: 'heavy', x: 0, z: 0 }, 9).x,
      1,
      'Heavy prediction stops twelve units from the nearest friendly',
    );
    assert.equal(
      predictUnit(s, friend, 9).x,
      13,
      'A fixed friendly post does not follow the convoy',
    );
    s.progress = (HOLD_POINTS[0] - 0.5) / ROUTE_LENGTH;
    s.convoy = 'holdRequested';
    const held = routePoint(HOLD_POINTS[0] + 5);
    assert.deepEqual(predictUnit(s, { ...friend, routeOffset: 5 }, 9), {
      x: held.x,
      y: terrainHeight(held.x, held.z),
      z: held.z,
    });
    const target = { kind: 'turret', x: 0, z: 0, hp: WEAPONS[1].damage * 0.75 };
    s.shots = [
      {
        weapon: 1,
        x: UNITS.turret.radius + WEAPONS[1].radius / 2,
        z: 0,
        targetY: terrainHeight(0, 0),
        due: s.time + 1,
      },
    ];
    assert(Math.abs(pendingDamage(s, target) - WEAPONS[1].damage / 2) < 1e-9);
    assert(
      pendingDamage(s, target) < target.hp,
      'Partial pending splash must not skip a surviving enemy',
    );
    s.shots[0].targetY += WEAPONS[1].radius + UNITS.turret.radius;
    assert.equal(
      pendingDamage(s, target),
      0,
      'Pending splash uses 3D distance, not a flat blast disk',
    );
    const accounted = {
      kills: 1,
      friendlyKills: 1,
      threatsRemaining: MISSION.events.length - 2,
      units: [
        { friendly: false, hp: 0 },
        { friendly: false, hp: 0 },
        { friendly: true, hp: 0 },
      ],
    };
    assert.equal(assertKillAccounting(accounted), 2);
    assert.throws(() => assertKillAccounting({ ...accounted, kills: 2 }), /double credit/);
    assert.throws(
      () => assertKillAccounting({ ...accounted, friendlyKills: undefined }),
      /friendlyKills/,
    );
    console.log(
      'Prediction/accounting passed: patrol, heavy stand-off, posts, hold, partial 3D splash and separate kill credit.',
    );
  } else await run();
}
