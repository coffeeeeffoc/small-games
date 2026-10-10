import {
  WEAPONS,
  MAP,
  FRIENDLY_POSTS,
  terrainHeight,
  patrolPoint,
  UNITS,
  MISSION,
  routeLength,
  landPoint,
  riverX,
  PROTECTED,
  routePoint,
  distance,
  validateData,
  impactDamage,
  HOMING,
  COMBAT_BUFF,
  FLIGHT,
  type Point,
  type Point3,
  type Kind,
} from './Data.ts';
import { Flight, ballisticLaunch, muzzlePosition, shotPosition, terrainContact } from './Flight.ts';
import { missionDefinition, type MissionId, type MissionDefinition } from './MissionCatalog.ts';
export type PauseReason = 'help' | 'settings' | 'mission' | 'manual' | 'orientation' | 'background' | 'focus' | 'advert' | 'supply' | 'countdown';
export type BuffKind = 'tracking' | 'rate';
export type ConvoyState = 'moving' | 'holdRequested' | 'holding' | 'arrived';
export type Unit = Point3 & {
  id: number;
  kind: Kind;
  hp: number;
  maxHp: number;
  friendly: boolean;
  heading: number;
  born: number;
  attack: number;
  hit: number;
  deadAt: number;
  origin: Point;
  group?: number;
  routeOffset?: number;
};
export type Shot = Point & {
  id: number;
  weapon: number;
  born: number;
  due: number;
  origin: Point & { y: number };
  velocity: Point3;
  targetY: number;
  guidance?: { kind: 'tracking' | 'consumable'; target: number; position: Point3; trail: (Point3 & { time: number })[] };
};
export type BattleEvent = Point & {
  id: number;
  type: 'shot' | 'impact' | 'kill' | 'attack' | 'wave';
  weapon: number;
  time: number;
  unit?: number;
  outcome?: 'hit' | 'miss' | 'armor' | 'friendly' | 'destroyed';
  damage?: number;
  y?: number;
  shot?: number;
  intercepted?: boolean;
  target?: Point3;
  friendly?: boolean;
};
export type FireReason =
  | 'ready'
  | 'briefing'
  | 'paused'
  | 'finished'
  | 'protected'
  | 'overheated'
  | 'empty'
  | 'cooldown'
  | 'target'
  | 'outside';
export class Simulation {
  readonly mission: MissionDefinition;
  phase: 'briefing' | 'playing' | 'success' | 'failure' = 'briefing';
  pauses = new Set<PauseReason>();
  buff?: { kind: BuffKind; remaining: number };
  resumeCountdown = 0;
  resumeRequired = false;
  time = 0;
  progress = 0;
  convoy: ConvoyState = 'moving';
  selected = 0;
  homingAmmo = 0;
  homingSelected = false;
  homingTargetId?: number;
  aim: Point = { x: MISSION.events[0].x, z: MISSION.events[0].z };
  guns = WEAPONS.map((w) => ({ heat: 0, ammo: Number(w.ammo), cooldown: 0, overheated: false }));
  units: Unit[] = [];
  shots: Shot[] = [];
  events: BattleEvent[] = [];
  spawned = new Set<number>();
  completed = new Set<string>();
  held = new Set<string>();
  kills = 0;
  friendlyKills = 0;
  fired = 0;
  hits = 0;
  hitShots = 0;
  friendlyDamage = 0;
  rescueDamage = { friendly: 0, enemy: 0 };
  damageByThreat: Partial<Record<Kind, number>> = {};
  failureCause: '' | 'friendly' | 'enemy' = '';
  // 0: critical rescue vehicle; 1–3: the corresponding outpost lost its last survivor.
  failedGroup: number | undefined;
  friendHitAt = -100;
  failure: '' | 'vehicle' | 'timeout' = '';
  lastWave = -1;
  waveAt = -100;
  warning: '' | 'armor' | 'lead' = '';
  misses = 0;
  training = false;
  private flight = new Flight();
  readonly aircraft = this.flight.aircraft;
  private serial = 0;
  constructor(missionId: MissionId = 'corridor-01') {
    validateData();
    this.mission = missionDefinition(missionId);
    this.aim = { x: this.mission.events[0].x, z: this.mission.events[0].z };
    Object.assign(this.addUnit('rescue', this.routePoint(0), true), { group: 0, routeOffset: 0 });
    Object.assign(this.addUnit('escort', this.routePoint(5), true), { group: 0, routeOffset: 5 });
    Object.assign(this.addUnit('escort', this.routePoint(10), true), { group: 0, routeOffset: 10 });
    FRIENDLY_POSTS.forEach((p, i) => {
      Object.assign(this.addUnit('escort', p, true), { group: i + 1 });
      Object.assign(this.addUnit('escort', { x: p.x + 3, z: p.z + 2 }, true), { group: i + 1 });
      Object.assign(this.addUnit('escort', { x: p.x - 3, z: p.z + 3 }, true), { group: i + 1 });
    });
  }
  height = (x: number, z: number) => terrainHeight(x, z, this.mission.map);
  get routeLength() { return routeLength(this.mission.map); }
  get holdPoints() { return [this.routeLength * 0.28, this.routeLength * 0.64]; }
  routePoint(d: number) { return routePoint(d, this.mission.map); }
  get paused() {
    return this.pauses.size > 0;
  }
  get rescue() {
    return this.units[0];
  }
  get remaining() {
    return Math.max(0, this.mission.duration - this.time);
  }
  get ratio() {
    return this.progress / this.routeLength;
  }
  get threatsRemaining() {
    return this.mission.events.length - this.spawned.size + this.units.filter((u) => !u.friendly && u.hp > 0).length;
  }
  get friendlyLosses() {
    return this.units.filter((u) => u.friendly && u.hp <= 0).length;
  }
  setOrbitDirection(direction: -1 | 1) {
    if (!this.paused && this.phase === 'playing') this.flight.setDirection(direction);
  }
  adjustAltitude(delta: number) {
    if (!this.paused && this.phase === 'playing') this.flight.adjustAltitude(delta);
  }
  adjustRadius(delta: number) {
    if (!this.paused && this.phase === 'playing') this.flight.adjustRadius(delta);
  }
  flightTime(weapon = this.selected, p: Point | null = this.aim) {
    if (!p || !Number.isInteger(weapon) || !WEAPONS[weapon] || ![p.x, p.z].every(Number.isFinite) ||
        Math.abs(p.x) > MAP.halfWidth || Math.abs(p.z) > MAP.halfDepth) return Infinity;
    return ballisticLaunch(muzzlePosition(this.aircraft, weapon), p, WEAPONS[weapon].speed, this.height)?.duration ?? Infinity;
  }
  shotPosition(shot: Shot, time = this.time) {
    if (shot.guidance) {
      const trail = shot.guidance.trail;
      const after = trail.find(p => p.time >= time) ?? trail[trail.length - 1];
      const before = trail[Math.max(0, trail.indexOf(after) - 1)];
      const fraction = Math.max(0, Math.min(1, (time - before.time) / (after.time - before.time || 1)));
      return { x: before.x + (after.x - before.x) * fraction,
        y: before.y + (after.y - before.y) * fraction, z: before.z + (after.z - before.z) * fraction };
    }
    return shotPosition(shot, time);
  }
  addUnit(kind: Kind, p: Point, friendly = false) {
    const u: Unit = {
      ...p,
      y: this.height(p.x, p.z),
      id: ++this.serial,
      kind,
      hp: UNITS[kind].hp,
      maxHp: UNITS[kind].hp,
      friendly,
      heading: Math.PI / 2,
      born: this.time,
      attack: this.mission.warmup,
      hit: 0,
      deadAt: -1,
      origin: { ...p },
    };
    this.units.push(u);
    return u;
  }
  start() {
    if (this.phase === 'briefing') {
      this.phase = 'playing';
      this.spawn();
    }
  }
  pause(reason: PauseReason, on: boolean) {
    if (on) {
      if (reason !== 'countdown' && this.pauses.has('countdown')) {
        this.resumeCountdown = 0;
        this.pauses.delete('countdown');
        this.pauses.add('manual');
        this.resumeRequired = true;
      }
      this.pauses.add(reason);
      this.clearInput();
    } else {
      this.pauses.delete(reason);
      if (reason === 'countdown') this.resumeCountdown = 0;
    }
  }
  grantBuff(kind: BuffKind): boolean {
    if (this.buff || kind !== 'tracking' && kind !== 'rate') return false;
    this.buff = { kind, remaining: COMBAT_BUFF.duration };
    return true;
  }
  beginResumeCountdown() {
    if (this.phase !== 'playing') return;
    if (this.pauses.has('background') || this.pauses.has('focus')) {
      this.pause('countdown', false);
      this.pause('manual', true);
      this.resumeRequired = true;
      return;
    }
    this.pauses.delete('manual');
    this.resumeRequired = false;
    this.resumeCountdown = 3;
    this.pause('countdown', true);
  }
  stepCountdown(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1) throw Error('Use fixed steps <= 0.1 seconds');
    if (this.phase !== 'playing' || this.pauses.size !== 1 || !this.pauses.has('countdown')) return;
    this.resumeCountdown = Math.max(0, this.resumeCountdown - dt);
    if (this.resumeCountdown <= 1e-8) this.pause('countdown', false);
  }
  clearInput() {
    this.held.clear();
  }
  choose(index: number) {
    if (!Number.isInteger(index) || index < 0 || index >= WEAPONS.length) return;
    this.clearInput();
    if (index !== this.selected) this.completed.add('weapon');
    this.selected = index;
    this.homingSelected = false;
    this.homingTargetId = undefined;
  }
  selectHoming() {
    this.clearInput();
    this.homingSelected = true;
    this.homingTargetId = undefined;
  }
  get homingTarget() {
    const target = this.homingTargetId === undefined ? this.aimedUnit
      : this.units.find(u => u.id === this.homingTargetId && u.hp > 0);
    return target && !target.friendly &&
      !PROTECTED.some(p => distance(p, target) <= p.radius + UNITS[target.kind].radius) ? target : undefined;
  }
  lockHoming(id: number) {
    this.homingTargetId = id;
    const target = this.homingTarget;
    if (target) this.aim = { x: target.x, z: target.z };
    return !!target;
  }
  setAim(p: Point) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
    if (distance(p, this.aim) > 0.2) this.completed.add('aim');
    this.aim = { ...p };
    this.homingTargetId = undefined;
  }
  setFire(source: string, on: boolean) {
    if (!on) {
      this.held.delete(source);
      return;
    }
    if (this.phase !== 'playing' || this.paused || this.held.has(source)) return;
    const pressed = this.held.size === 0;
    this.held.add(source);
    if (pressed) this.fire();
  }
  command() {
    if (this.mission.mode === 'training' || this.phase !== 'playing' || this.paused || this.convoy === 'arrived') return;
    if (this.convoy === 'moving') {
      if (!this.holdPoints.some((p) => p > this.progress + 0.01)) return;
      this.convoy = 'holdRequested';
      this.completed.add('hold');
    } else {
      if (this.convoy === 'holding') this.completed.add('continue');
      this.convoy = 'moving';
    }
  }
  reason(): FireReason {
    if (this.phase === 'briefing') return 'briefing';
    if (this.phase !== 'playing') return 'finished';
    if (this.paused) return 'paused';
    if (this.homingSelected) return this.homingAmmo <= 0 ? 'empty' : this.homingTarget ? 'ready' : 'target';
    const w = WEAPONS[this.selected],
      g = this.guns[this.selected];
    if (![this.aim.x, this.aim.z].every(Number.isFinite) ||
        Math.abs(this.aim.x) > MAP.halfWidth || Math.abs(this.aim.z) > MAP.halfDepth)
      return 'outside';
    // The entire blast disk must stay outside a protected area, including its boundary.
    if (PROTECTED.some((p) => distance(p, this.aim) <= p.radius + w.radius)) return 'protected';
    if (g.overheated) return 'overheated';
    if (g.ammo <= 0) return 'empty';
    if (g.cooldown > 1e-6) return 'cooldown';
    return 'ready';
  }
  get friendlyRisk() {
    if (this.homingSelected) return false;
    const point = this.trackingTarget ?? this.aim;
    return this.units.some(
      (u) =>
        u.friendly &&
        u.hp > 0 &&
        distance(u, point) <= WEAPONS[this.selected].radius + UNITS[u.kind].radius,
    );
  }
  get aimedUnit() {
    return this.units
      .filter((u) => u.hp > 0 && distance(u, this.aim) <= UNITS[u.kind].radius + 1.2)
      .sort((a, b) => distance(a, this.aim) - distance(b, this.aim))[0];
  }
  private canTrack(target: Unit, radius: number) {
    return target.hp > 0 && !target.friendly &&
      !PROTECTED.some(p => distance(p, target) <= p.radius + Math.max(radius, UNITS[target.kind].radius));
  }
  private get trackingTarget() {
    if (this.buff?.kind !== 'tracking') return;
    const radius = WEAPONS[this.selected].radius, aimed = this.aimedUnit;
    if (aimed && this.canTrack(aimed, radius)) return aimed;
    return this.units.filter(u => this.canTrack(u, radius) && distance(u, this.aim) <= COMBAT_BUFF.trackingRadius)
      .sort((a, b) => distance(a, this.aim) - distance(b, this.aim))[0];
  }
  fire() {
    if (this.homingSelected) return this.fireHoming();
    if (this.reason() !== 'ready') return false;
    const w = WEAPONS[this.selected],
      g = this.guns[this.selected];
    const origin = Object.freeze(muzzlePosition(this.aircraft, this.selected));
    const launch = ballisticLaunch(origin, this.aim, w.speed, this.height);
    if (!launch) return false;
    g.ammo--;
    g.heat = Math.min(100, g.heat + w.heat);
    g.overheated = g.heat >= 100;
    g.cooldown = w.interval / (this.buff?.kind === 'rate' ? COMBAT_BUFF.rateMultiplier : 1);
    const target = this.trackingTarget;
    const shot: Shot = {
      id: ++this.serial,
      weapon: this.selected,
      x: this.aim.x,
      z: this.aim.z,
      born: this.time,
      origin,
      velocity: launch.velocity,
      targetY: launch.targetY,
      due: this.time + launch.duration,
    };
    if (target) shot.guidance = { kind: 'tracking', target: target.id, position: { ...origin }, trail: [{ ...origin, time: this.time }] };
    else { Object.freeze(shot.velocity); Object.freeze(shot); }
    this.shots.push(shot);
    this.emit('shot', shot, shot.weapon);
    this.fired++;
    this.completed.add('fire');
    return true;
  }
  fireHoming() {
    const target = this.homingTarget;
    if (this.phase !== 'playing' || this.paused || this.homingAmmo <= 0 || !target || target.friendly ||
        PROTECTED.some(p => distance(p, target) <= p.radius + UNITS[target.kind].radius)) return false;
    const origin = muzzlePosition(this.aircraft, 2);
    const delta = { x: target.x - origin.x, y: target.y - origin.y, z: target.z - origin.z };
    const range = Math.hypot(delta.x, delta.y, delta.z);
    if (!Number.isFinite(range) || range <= 0) return false;
    this.clearInput();
    this.homingAmmo--;
    const shot: Shot = {
      id: ++this.serial, weapon: 2, x: target.x, z: target.z, born: this.time,
      due: this.time + range / HOMING.speed, origin,
      velocity: { x: delta.x / range * HOMING.speed, y: delta.y / range * HOMING.speed, z: delta.z / range * HOMING.speed },
      targetY: target.y,
      guidance: { kind: 'consumable', target: target.id, position: { ...origin }, trail: [{ ...origin, time: this.time }] },
    };
    this.shots.push(shot);
    this.emit('shot', shot, shot.weapon).unit = target.id;
    this.fired++;
    this.completed.add('fire');
    return true;
  }
  emit(type: BattleEvent['type'], p: Point & { y?: number }, weapon = 0, unit?: number) {
    const event: BattleEvent = { id: ++this.serial, type, x: p.x, y: p.y ?? this.height(p.x, p.z), z: p.z, weapon, time: this.time, unit };
    this.events.push(event);
    if (this.events.length > 64) this.events.shift();
    return event;
  }
  private spawn() {
    this.mission.events.forEach((e, i) => {
      if (!this.spawned.has(i) && (this.time >= e.time || this.ratio >= e.progress)) {
        this.spawned.add(i);
        this.addUnit(e.kind, landPoint(e, this.mission.map));
        this.lastWave = i;
        this.waveAt = this.time;
        this.emit('wave', e);
      }
    });
  }
  private impact(s: Shot, point: Point3, time: number, previous: Point3[], dt: number) {
    let hit = false,
      friendly = false,
      armor = false,
      destroyed = false,
      total = 0;
    const fraction = Math.max(0, Math.min(1, (time - (this.time - dt)) / dt));
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i], before = previous[i] ?? u;
      const x = before.x + (u.x - before.x) * fraction;
      const z = before.z + (u.z - before.z) * fraction;
      const y = this.height(x, z);
      if (u.hp <= 0) continue;
      if (u.friendly && this.training) continue;
      const damage = s.guidance?.kind === 'consumable' ? u.id === s.guidance.target && !u.friendly ? HOMING.damage : 0
        : impactDamage(s.weapon, u.kind, Math.hypot(x - point.x, y - point.y, z - point.z));
      if (damage <= 0) continue;
      const actual = Math.min(u.hp, damage);
      u.hp = Math.max(0, u.hp - damage);
      total += actual;
      u.hit = 0.18;
      if (u.friendly) {
        friendly = true;
        this.friendlyDamage += actual;
        this.friendHitAt = time;
        if (u.kind === 'rescue') {
          this.rescueDamage.friendly += actual;
        }
      } else {
        hit = true;
        this.hits++;
        this.completed.add('hit');
        if (u.kind === 'heavy' && s.weapon === 0) {
          this.warning = 'armor';
          armor = true;
        } else this.warning = '';
      }
      if (u.hp === 0) {
        u.deadAt = time;
        if (u.friendly) this.recordFriendlyLoss(u, 'friendly');
        else {
          this.kills++;
          destroyed = true;
        }
        this.emit('kill', { x, y, z }, s.weapon, u.id).time = time;
      }
    }
    if (hit) {
      this.hitShots++;
      this.misses = 0;
      if (this.warning === 'lead') this.warning = '';
    } else if (++this.misses >= 7) this.warning = 'lead';
    const event = this.emit('impact', point, s.weapon);
    event.time = time;
    event.shot = s.id;
    event.intercepted = time < s.due - 1e-5;
    event.outcome = friendly
      ? 'friendly'
      : destroyed
        ? 'destroyed'
        : armor
          ? 'armor'
          : hit
            ? 'hit'
            : 'miss';
    event.damage = total;
  }
  private releaseTracking(shot: Shot, time: number) {
    shot.origin = { ...shot.guidance!.position };
    shot.born = time;
    shot.guidance = undefined;
    // Rebase the ballistic arc at lock loss; the original muzzle is no longer its origin.
    const duration = (shot.velocity.y + Math.sqrt(shot.velocity.y ** 2 + 2 * FLIGHT.gravity * Math.max(0, shot.origin.y))) / FLIGHT.gravity;
    shot.due = time + Math.max(.1, duration);
    const contact = terrainContact(shot, time, shot.due, this.height);
    if (contact) {
      shot.due = contact.time;
      shot.x = contact.point.x; shot.z = contact.point.z; shot.targetY = contact.point.y;
    }
  }
  private trackingContact(position: Point3, velocity: Point3, time: number, dt: number) {
    const at = (t: number): Point3 => ({ x: position.x + velocity.x * t,
      y: position.y + velocity.y * t, z: position.z + velocity.z * t });
    // shortcut: half-unit sweeps match the ballistic terrain test; upgrade together for cliffs/caves.
    const count = Math.max(1, Math.ceil(dt * Math.hypot(velocity.x, velocity.y, velocity.z) / .5));
    let start = 0;
    for (let i = 1; i <= count; i++) {
      let stop = dt * i / count;
      const point = at(stop);
      if (point.y <= this.height(point.x, point.z) + 1e-8) {
        for (let n = 0; n < 24; n++) {
          const mid = (start + stop) / 2, p = at(mid);
          if (p.y <= this.height(p.x, p.z)) stop = mid;
          else start = mid;
        }
        const hit = at(stop);
        hit.y = this.height(hit.x, hit.z);
        return { point: hit, time: time + stop };
      }
      start = stop;
    }
  }
  step(dt: number) {
    if (this.phase !== 'playing' || this.paused) return;
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1) throw Error('Use fixed steps <= 0.1 seconds');
    if (this.mission.mode === 'training') dt = Math.min(dt, Math.max(0, this.mission.duration - this.time));
    if (this.buff && this.buff.remaining > 1e-8 && this.buff.remaining < dt - 1e-8) {
      const remaining = this.buff.remaining;
      this.step(remaining);
      this.step(dt - remaining);
      return;
    }
    this.time += dt;
    this.flight.step(dt);
    const previous = this.units.map(({ x, y, z }) => ({ x, y, z }));
    for (const g of this.guns) {
      g.cooldown = Math.max(0, g.cooldown - dt);
      g.heat = Math.max(0, g.heat - 18 * dt);
      if (g.overheated && g.heat <= 40) g.overheated = false;
    }
    if (this.convoy !== 'holding' && this.convoy !== 'arrived') {
      let next = this.progress + this.mission.speed * dt;
      if (this.convoy === 'holdRequested') {
        const stop = this.holdPoints.find((p) => p >= this.progress - 0.001);
        if (stop !== undefined && next >= stop) {
          next = stop;
          this.convoy = 'holding';
        }
      }
      this.progress = Math.min(this.routeLength, next);
    }
    for (const u of this.units) {
      u.hit = Math.max(0, u.hit - dt);
      if (u.hp <= 0) continue;
      u.attack -= dt;
      if (u.friendly) {
        if (u.routeOffset !== undefined)
          Object.assign(u, this.routePoint(Math.min(this.routeLength, this.progress + u.routeOffset)));
        continue;
      }
      const spec = UNITS[u.kind];
      if (u.kind === 'light') {
        Object.assign(u, patrolPoint(u.origin, this.time - u.born, this.mission.map));
      }
      const target = this.nearestOpponent(u);
      if (u.kind === 'heavy' && target && distance(u, target) > 12) {
        const angle = Math.atan2(target.x - u.x, target.z - u.z);
        const move = Math.min(spec.speed * dt, distance(u, target) - 12);
        Object.assign(u, landPoint({ x: u.x + Math.sin(angle) * move, z: u.z + Math.cos(angle) * move },
          this.mission.map, u.x - riverX(u.z)));
        u.heading = angle;
      }
      u.y = this.height(u.x, u.z);
    }
    const contacts = this.shots.flatMap((shot) => {
      if (shot.guidance) {
        const ordinary = shot.guidance.kind === 'tracking';
        const target = this.units.find(u => u.id === shot.guidance!.target);
        if (!target || !this.canTrack(target, ordinary ? WEAPONS[shot.weapon].radius : 0) ||
            ordinary && this.buff?.kind !== 'tracking') {
          if (!ordinary) return [{ shot, point: shot.guidance.position, time: this.time, cancelled: true }];
          this.releaseTracking(shot, this.time - dt);
          const contact = terrainContact(shot, this.time - dt, this.time, this.height);
          return contact ? [{ shot, ...contact, cancelled: false }] : [];
        }
        const position = shot.guidance.position;
        const delta = { x: target.x - position.x, y: target.y - position.y, z: target.z - position.z };
        const speed = ordinary ? WEAPONS[shot.weapon].speed : HOMING.speed;
        const range = Math.hypot(delta.x, delta.y, delta.z), travel = speed * dt;
        if (range > 0) shot.velocity = { x: delta.x / range * speed, y: delta.y / range * speed, z: delta.z / range * speed };
        if (ordinary) {
          const contact = this.trackingContact(position, shot.velocity, this.time - dt, Math.min(dt, range / speed));
          if (contact) return [{ shot, ...contact, cancelled: false }];
        }
        if (range <= travel) return [{ shot, point: { x: target.x, y: target.y, z: target.z }, time: this.time, cancelled: false }];
        position.x += shot.velocity.x * dt; position.z += shot.velocity.z * dt;
        position.y += shot.velocity.y * dt;
        if (!ordinary) position.y = Math.max(position.y, this.height(position.x, position.z) + Math.min(2, range * .1));
        shot.x = target.x; shot.z = target.z; shot.targetY = target.y;
        shot.due = this.time + (range - travel) / speed;
        shot.guidance.trail.push({ ...position, time: this.time });
        // shortcut: 32 fixed-step samples cover the visible trail; retain more only for flight replay.
        if (shot.guidance.trail.length > 32) shot.guidance.trail.shift();
        return [];
      }
      const contact = terrainContact(shot, this.time - dt, this.time, this.height);
      return contact ? [{ shot, ...contact, cancelled: false }] : [];
    }).sort((a, b) => a.time - b.time);
    for (const contact of contacts) if (!contact.cancelled) {
      if (contact.shot.guidance) {
        Object.assign(contact.shot.guidance.position, contact.point);
        contact.shot.guidance.trail.push({ ...contact.point, time: contact.time });
      }
      this.impact(contact.shot, contact.point, contact.time, previous, dt);
    }
    this.shots = this.shots.filter((shot) => !contacts.some((c) => c.shot === shot));
    if (this.buff) {
      this.buff.remaining = Math.max(0, this.buff.remaining - dt);
      if (this.buff.remaining <= 1e-8) {
        this.buff = undefined;
        for (const shot of this.shots) if (shot.guidance?.kind === 'tracking') this.releaseTracking(shot, this.time);
      }
    }
    for (const u of this.units) {
      if (u.hp <= 0) continue;
      const spec = UNITS[u.kind], target = this.nearestOpponent(u);
      if (
        this.mission.mode !== 'training' && target &&
        spec.damage > 0 &&
        this.time - u.born >= this.mission.warmup &&
        u.attack <= 0 &&
        distance(u, target) < spec.range
      ) {
        const damage = Math.min(target.hp, spec.damage * (target.friendly ? this.mission.friendlyArmor : target.kind === 'heavy' ? 0.25 : 1));
        target.hp = Math.max(0, target.hp - damage);
        if (target === this.rescue) {
          this.rescueDamage.enemy += damage;
          this.damageByThreat[u.kind] = (this.damageByThreat[u.kind] || 0) + damage;
        }
        target.hit = 0.3;
        const event = this.emit('attack', u, 0, target.id);
        event.target = { x: target.x, y: target.y, z: target.z };
        event.damage = damage;
        event.friendly = u.friendly;
        if (target.hp === 0) {
          target.deadAt = this.time;
          if (target.friendly) this.recordFriendlyLoss(target, 'enemy');
          else this.friendlyKills++;
          this.emit('kill', target, 0, target.id).friendly = u.friendly;
        }
        u.attack = u.friendly ? this.mission.friendlyAttackInterval : this.mission.attackInterval;
      }
    }
    this.spawn();
    if (this.progress >= this.routeLength) this.convoy = 'arrived';
    if (this.rescue.hp <= 0 || this.failedGroup !== undefined || this.mission.mode === 'training' && this.friendlyLosses > 0) {
      this.failedGroup ??= this.mission.mode === 'training'
        ? this.units.find((unit) => unit.friendly && unit.hp <= 0)?.group ?? 0 : 0;
      this.phase = 'failure';
      this.failure = 'vehicle';
    } else if ((this.convoy === 'arrived' || this.mission.mode === 'training') && this.threatsRemaining === 0) {
      this.phase = 'success';
      if (this.mission.mode === 'escort') this.completed.add('arrived');
    } else if (this.time >= this.mission.duration) {
      this.phase = 'failure';
      this.failure = 'timeout';
    }
    if (this.phase !== 'playing') {
      this.clearInput();
      return;
    }
    if (this.homingSelected && this.homingTargetId !== undefined) {
      const target = this.homingTarget;
      if (target) this.aim = { x: target.x, z: target.z };
    }
    if (this.held.size && !this.homingSelected && WEAPONS[this.selected].automatic) this.fire();
  }
  private recordFriendlyLoss(unit: Unit, cause: 'friendly' | 'enemy') {
    if (this.failedGroup !== undefined) return;
    if (unit === this.rescue || (unit.group !== undefined &&
        !this.units.some((other) => other.friendly && other.group === unit.group && other.hp > 0))) {
      this.failedGroup = unit.group ?? 0;
      this.failureCause = cause;
    }
  }
  private nearestOpponent(from: Unit) {
    let nearest: Unit | undefined, range = Infinity;
    for (const u of this.units) {
      if (u.friendly === from.friendly || u.hp <= 0) continue;
      const d = distance(from, u);
      if (d < range) { nearest = u; range = d; }
    }
    return nearest;
  }
  get rating() {
    if (this.phase !== 'success') return '—';
    const health = this.rescue.hp / this.rescue.maxHp;
    return this.friendlyDamage === 0 && health >= 0.7 && this.friendlyLosses === 0
      ? 'S'
      : health >= 0.4 && this.friendlyDamage < 60 && this.friendlyLosses <= 2
        ? 'A'
        : 'B';
  }
}
