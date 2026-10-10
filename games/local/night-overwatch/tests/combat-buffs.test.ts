import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation, type PauseReason } from '../assets/scripts/core/Simulation.ts';
import { COMBAT_BUFF, FLIGHT, HOMING, PROTECTED, WEAPONS, distance, impactDamage } from '../assets/scripts/core/Data.ts';

const near = (actual: number, expected: number, tolerance = 1e-7) =>
  assert(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
function advance(s: Simulation, seconds: number, dt = .05) {
  const steps = Math.ceil(seconds / dt);
  for (let n = 0; n < steps; n++) s.step(seconds / steps);
}
function isolated() {
  const s = new Simulation('training-60'); s.start(); s.convoy = 'holding';
  s.units = s.units.filter(u => u.friendly);
  s.addUnit('turret', { x: 150, z: 90 }); // Keep the mission playing after an isolated target dies.
  return s;
}
function settle(s: Simulation, dt: number) {
  for (let n = 0; n < 20 / dt && s.shots.length; n++) s.step(dt);
  assert.equal(s.shots.length, 0, 'round must resolve');
}
const combatState = (s: Simulation) => JSON.stringify({ time: s.time, progress: s.progress,
  aircraft: s.aircraft, units: s.units, shots: s.shots, guns: s.guns, events: s.events,
  spawned: [...s.spawned], buff: s.buff, kills: s.kills, fired: s.fired });

test('buffs are exclusive, last sixty combat seconds, and do not survive a new simulation', () => {
  const s = isolated();
  assert(s.grantBuff('tracking'));
  assert.deepEqual(s.buff, { kind: 'tracking', remaining: 60 });
  assert(!s.grantBuff('rate')); assert(!s.grantBuff('tracking'));
  advance(s, 59.95); near(s.buff!.remaining, .05);
  advance(s, .05); assert.equal(s.buff, undefined);
  assert(s.grantBuff('rate'));
  s.phase = 'success'; const frozen = combatState(s); advance(s, 1);
  assert.equal(combatState(s), frozen);
  assert.equal(new Simulation().buff, undefined);
  const invalid = isolated();
  assert(!invalid.grantBuff('unknown' as 'rate')); assert.equal(invalid.buff, undefined);
});

test('every pause freezes all combat clocks, projectiles, aircraft, cooldown and buff duration', () => {
  const reasons: PauseReason[] = ['manual', 'supply', 'advert', 'help', 'settings', 'mission', 'orientation', 'background', 'focus'];
  for (const reason of reasons) {
    const s = isolated(), enemy = s.addUnit('light', { x: -80, z: -40 });
    s.grantBuff('tracking'); s.setAim(enemy); s.setFire('touch', true); advance(s, .1);
    s.pause(reason, true); const frozen = combatState(s);
    for (let n = 0; n < 30; n++) { s.step(.1); s.stepCountdown(.1); }
    assert.equal(combatState(s), frozen, reason); assert.equal(s.held.size, 0);
    s.pause(reason, false); s.step(.1); assert.notEqual(combatState(s), frozen);
  }
});

test('countdown is an independent three-second clock and never advances combat', () => {
  const s = isolated(); s.grantBuff('rate'); s.pause('manual', true);
  s.beginResumeCountdown(); assert.equal(s.resumeCountdown, 3);
  assert.deepEqual([...s.pauses], ['countdown']); assert.equal(s.resumeRequired, false);
  const frozen = combatState(s);
  for (let n = 0; n < 179; n++) { s.step(1 / 60); s.stepCountdown(1 / 60); }
  assert.equal(combatState(s), frozen); assert(s.paused); assert(!s.fire());
  s.stepCountdown(1 / 60); assert.equal(s.resumeCountdown, 0); assert(!s.paused);
  assert.equal(combatState(s), frozen, 'finishing the countdown does not simulate a combat frame');
  s.step(.1); near(s.time, .1); near(s.buff!.remaining, 59.9);
});

test('countdown preserves other pauses and validates fixed dt in every phase', () => {
  const s = isolated(); s.pause('help', true); s.pause('supply', true); s.pause('manual', true);
  s.beginResumeCountdown();
  assert.deepEqual([...s.pauses].sort(), ['countdown', 'help', 'supply']);
  s.stepCountdown(.1); assert.equal(s.resumeCountdown, 3);
  s.pause('help', false); s.stepCountdown(.1); assert.equal(s.resumeCountdown, 3);
  s.pause('supply', false); s.stepCountdown(.1); near(s.resumeCountdown, 2.9);
  for (const phase of ['briefing', 'success', 'failure'] as const) {
    s.phase = phase; const before = s.resumeCountdown;
    s.stepCountdown(.1); s.beginResumeCountdown(); assert.equal(s.resumeCountdown, before);
  }
  for (const dt of [0, -1, NaN, Infinity, .100001]) assert.throws(() => s.stepCountdown(dt));
});

test('any new pause cancels countdown and requires an explicit fresh three-second resume', () => {
  const reasons: PauseReason[] = ['manual', 'supply', 'advert', 'help', 'settings', 'mission', 'orientation', 'background', 'focus'];
  for (const reason of reasons) {
    const s = isolated(); s.beginResumeCountdown(); s.stepCountdown(.1); s.pause(reason, true);
    assert.equal(s.resumeCountdown, 0, reason); assert(!s.pauses.has('countdown'));
    assert(s.resumeRequired); assert(s.pauses.has('manual')); assert(s.pauses.has(reason));
    s.pause(reason, false); s.stepCountdown(.1); assert.equal(s.time, 0);
    s.beginResumeCountdown(); assert.equal(s.resumeCountdown, 3); assert(!s.resumeRequired);
    assert.deepEqual([...s.pauses], ['countdown']);
  }
});

test('starting countdown while backgrounded or unfocused leaves manual resume required', () => {
  for (const reason of ['background', 'focus'] as const) {
    const s = isolated(); s.pause(reason, true); s.beginResumeCountdown();
    assert.equal(s.resumeCountdown, 0); assert(s.resumeRequired); assert(s.pauses.has('manual'));
    assert(!s.pauses.has('countdown'));
    s.pause(reason, false); advance(s, 2); s.stepCountdown(.1);
    assert.equal(s.time, 0); assert.equal(s.resumeCountdown, 0);
    s.beginResumeCountdown(); assert.equal(s.resumeCountdown, 3);
  }
});

test('tracking prefers the aimed enemy, otherwise the nearest eligible enemy within eight units', () => {
  const s = isolated(), target = s.addUnit('turret', { x: -80, z: -40 });
  const farther = s.addUnit('light', { x: -78, z: -40 });
  s.addUnit('escort', { x: -79, z: -40 }, true);
  s.grantBuff('tracking'); s.setAim(target); assert(s.fire());
  assert.equal(s.shots[0].guidance?.target, target.id);
  s.guns[0].cooldown = 0; s.setAim({ x: -77, z: -40 }); assert(s.fire());
  assert.equal(s.shots[1].guidance?.target, farther.id);
  s.guns[0].cooldown = 0; s.setAim({ x: -77 + COMBAT_BUFF.trackingRadius + .01, z: -40 });
  assert(s.fire()); assert.equal(s.shots[2].guidance, undefined);
  const friend = s.addUnit('escort', { x: 80, z: 40 }, true);
  s.guns[0].cooldown = 0; s.setAim(friend); assert(s.fire()); assert.equal(s.shots[3].guidance, undefined);
  const p = PROTECTED[0], protectedEnemy = s.addUnit('turret', { x: p.x + p.radius - .1, z: p.z });
  s.guns[0].cooldown = 0; s.setAim({ x: p.x + p.radius + 2, z: p.z });
  assert(s.fire()); assert.equal(s.shots[4].guidance, undefined);
  assert(protectedEnemy.hp > 0);
});

test('ordinary tracking warns for friends near the acquired target, then restores aim-based warnings at expiry', () => {
  const s = isolated(), target = s.addUnit('turret', { x: -110, z: -70 });
  s.addUnit('escort', { x: -111, z: -70 }, true);
  s.choose(1); s.setAim({ x: -102.1, z: -70 });
  assert.equal(s.friendlyRisk, false);
  s.grantBuff('tracking'); assert.equal(s.friendlyRisk, true);
  assert(s.fire()); assert.equal(s.shots[0].guidance!.target, target.id);
  s.buff!.remaining = .05; s.step(.05);
  assert.equal(s.friendlyRisk, false, 'expired tracking no longer redirects the next shot');
  s.setAim(target); assert.equal(s.friendlyRisk, true);
  s.selectHoming(); assert.equal(s.friendlyRisk, false, 'consumable remains single-target');
});

test('each ordinary weapon tracks moving targets at its own speed, damage, ammo and heat', () => {
  for (const dt of [1 / 60, .1]) for (let weapon = 0; weapon < WEAPONS.length; weapon++) {
    const s = isolated(), target = s.addUnit('light', { x: -80, z: -40 }), w = WEAPONS[weapon];
    target.hp = target.maxHp = 1000;
    s.choose(weapon); s.setAim(target); s.grantBuff('tracking');
    assert(s.fire()); const shot = s.shots[0], initial = { x: target.x, z: target.z };
    assert.equal(shot.guidance?.kind, 'tracking'); assert.equal(s.homingAmmo, 0);
    assert.equal(s.guns[weapon].ammo, w.ammo - 1); assert.equal(s.guns[weapon].heat, w.heat);
    near(s.guns[weapon].cooldown, w.interval);
    for (let n = 0; n < 20 / dt && s.shots.length; n++) {
      const before = s.shotPosition(shot); s.step(dt);
      if (s.shots.length) {
        const after = s.shotPosition(shot);
        near(Math.hypot(shot.velocity.x, shot.velocity.y, shot.velocity.z), w.speed);
        near(Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z), w.speed * dt);
      }
    }
    assert.equal(s.shots.length, 0); assert(distance(target, initial) > 1);
    near(target.hp, 1000 - w.damage); assert.equal(s.hitShots, 1);
  }
});

test('ordinary guidance preserves blast falloff, heavy armor and friendly fire', () => {
  for (let weapon = 0; weapon < WEAPONS.length; weapon++) {
    const s = isolated(), w = WEAPONS[weapon], target = s.addUnit('turret', { x: -110, z: -70 });
    target.hp = target.maxHp = 1000;
    const friend = s.addUnit('escort', { x: target.x + w.radius / 2, z: target.z }, true);
    const outside = s.addUnit('escort', { x: target.x + w.radius + 2, z: target.z }, true);
    const armor = s.addUnit('heavy', target); armor.hp = armor.maxHp = 1000;
    const hp = friend.hp;
    s.choose(weapon); s.setAim(target); s.grantBuff('tracking'); assert(s.fire()); settle(s, .05);
    const impact = s.events.find(e => e.type === 'impact')!;
    const range = Math.hypot(friend.x - impact.x, s.height(friend.x, friend.z) - impact.y!, friend.z - impact.z);
    near(hp - friend.hp, impactDamage(weapon, 'escort', range)); assert(friend.hp < hp);
    assert.equal(outside.hp, outside.maxHp); near(target.hp, 1000 - w.damage);
    near(armor.hp, 1000 - w.damage * w.armor); near(s.friendlyDamage, hp - friend.hp);
    assert.equal(impact.outcome, 'friendly');
  }
});

test('ordinary tracking is blocked by terrain rather than flying through a hill', () => {
  for (const dt of [1 / 60, .1]) {
    const s = isolated(); Object.assign(s.aircraft, { x: -100, y: FLIGHT.minAltitude, z: 23, yaw: 0, pitch: 0 });
    const target = s.addUnit('turret', { x: 100, z: 23 });
    s.setAim(target); s.grantBuff('tracking'); assert(s.fire()); const shot = s.shots[0]; settle(s, dt);
    const impact = s.events.find(e => e.type === 'impact')!;
    assert(impact.intercepted); assert(distance(impact, target) > 30);
    near(impact.y!, s.height(impact.x, impact.z)); assert.equal(impact.shot, shot.id);
    assert.equal(target.hp, target.maxHp); assert.equal(s.hits, 0);
  }
});

test('expiry rebases an in-flight round without changing position or speed, then gravity resumes', () => {
  const s = isolated(), target = s.addUnit('turret', { x: -80, z: -40 });
  s.grantBuff('tracking'); s.buff!.remaining = .15; s.setAim(target); s.choose(2); assert(s.fire());
  const shot = s.shots[0]; s.step(.1);
  const before = s.shotPosition(shot), velocity = { ...shot.velocity };
  s.step(.05);
  assert.equal(s.buff, undefined); assert.equal(shot.guidance, undefined); near(shot.born, .15);
  const atExpiry = s.shotPosition(shot);
  near(atExpiry.x, before.x + velocity.x * .05); near(atExpiry.y, before.y + velocity.y * .05);
  near(atExpiry.z, before.z + velocity.z * .05); near(Math.hypot(shot.velocity.x, shot.velocity.y, shot.velocity.z), WEAPONS[2].speed);
  assert.deepEqual(shot.origin, atExpiry);
  target.x += 50; s.step(.05);
  const after = s.shotPosition(shot);
  near(after.x, atExpiry.x + velocity.x * .05); near(after.z, atExpiry.z + velocity.z * .05);
  near(after.y, atExpiry.y + velocity.y * .05 - .5 * FLIGHT.gravity * .05 ** 2);
  assert(s.grantBuff('tracking')); s.step(.05); assert.equal(shot.guidance, undefined, 'new buff cannot relock old rounds');
  settle(s, .05); assert.equal(target.hp, target.maxHp);
});

test('expiry inside a fixed step advances only the remaining guided fraction', () => {
  const s = isolated(), target = s.addUnit('turret', { x: -80, z: -40 });
  s.setAim(target); s.grantBuff('tracking'); s.buff!.remaining = .03; assert(s.fire());
  const shot = s.shots[0]; s.step(.1);
  assert.equal(shot.guidance, undefined); near(shot.born, .03); near(s.time, .1);
  const point = s.shotPosition(shot);
  near(point.x, shot.origin.x + shot.velocity.x * .07);
  near(point.y, shot.origin.y + shot.velocity.y * .07 - .5 * FLIGHT.gravity * .07 ** 2);
});

test('ordinary lock loss becomes ballistic without silently acquiring another target', () => {
  for (const loss of ['dead', 'friendly', 'protected'] as const) {
    const s = isolated(), target = s.addUnit('turret', { x: -80, z: -40 });
    s.addUnit('light', { x: -78, z: -40 }); s.grantBuff('tracking'); s.setAim(target); assert(s.fire());
    const shot = s.shots[0]; s.step(.1); const before = s.shotPosition(shot), velocity = { ...shot.velocity };
    if (loss === 'dead') target.hp = 0;
    else if (loss === 'friendly') target.friendly = true;
    else Object.assign(target, PROTECTED[0]);
    s.step(.1); assert.equal(shot.guidance, undefined, loss); assert(s.shots.includes(shot));
    assert.deepEqual(shot.origin, before); assert.deepEqual(shot.velocity, velocity);
  }
});

test('rate boost divides actual firing interval by 1.3 without changing heat or ammo cost', () => {
  for (let weapon = 0; weapon < WEAPONS.length; weapon++) {
    const s = isolated(), w = WEAPONS[weapon]; s.choose(weapon); s.setAim({ x: -80, z: -40 });
    s.grantBuff('rate'); assert(s.fire());
    const interval = w.interval / 1.3;
    near(s.guns[weapon].cooldown, interval); assert.equal(s.guns[weapon].heat, w.heat);
    assert.equal(s.guns[weapon].ammo, w.ammo - 1); assert.equal(s.shots[0].guidance, undefined);
    advance(s, interval - .0001); assert(!s.fire()); advance(s, .0001); assert(s.fire());
    near(s.time, interval); assert.equal(s.guns[weapon].ammo, w.ammo - 2);
    near(s.guns[weapon].heat, Math.max(0, w.heat - interval * 18) + w.heat);
    s.buff!.remaining = .01; advance(s, .01); advance(s, interval);
    assert(s.fire()); near(s.guns[weapon].cooldown, w.interval);
  }
});

test('consumable guidance remains independent of buff expiry and deals 120 only to its lock', () => {
  for (const kind of ['light', 'turret', 'heavy'] as const) {
    const s = isolated(), target = s.addUnit(kind, { x: -80, z: -40 });
    const hp = target.hp, friend = s.addUnit('escort', target, true);
    const bystander = s.addUnit('turret', target);
    s.grantBuff('tracking'); s.buff!.remaining = .01; s.homingAmmo = 2; s.setAim(target);
    assert(s.fireHoming()); const shot = s.shots[0]; assert.equal(shot.guidance?.kind, 'consumable');
    s.step(.1); assert.equal(s.buff, undefined); assert.equal(shot.guidance?.kind, 'consumable');
    settle(s, .05); assert.equal(HOMING.damage, 120); assert.equal(target.hp, Math.max(0, hp - 120));
    assert.equal(friend.hp, friend.maxHp); assert.equal(bystander.hp, bystander.maxHp);
    assert.equal(s.homingAmmo, 1);
    if (kind === 'heavy') { s.lockHoming(target.id); assert(s.fireHoming()); settle(s, .05); assert.equal(target.hp, 0); }
  }
});
