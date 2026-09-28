import {
  WEAPONS,
  MAP,
  FRIENDLY_POSTS,
  terrainHeight,
  patrolPoint,
  UNITS,
  MISSION,
  HOLD_POINTS,
  ROUTE_LENGTH,
  PROTECTED,
  routePoint,
  distance,
  validateData,
  impactDamage,
  type Point,
  type Point3,
  type Kind,
} from './Data.ts';
import { Flight, ballisticLaunch, muzzlePosition, shotPosition, terrainContact } from './Flight.ts';
export type PauseReason = 'help' | 'mission' | 'manual' | 'orientation' | 'background' | 'focus';
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
  | 'outside';
export class Simulation {
  phase: 'briefing' | 'playing' | 'success' | 'failure' = 'briefing';
  pauses = new Set<PauseReason>();
  time = 0;
  progress = 0;
  convoy: ConvoyState = 'moving';
  selected = 0;
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
  constructor() {
    validateData();
    Object.assign(this.addUnit('rescue', routePoint(0), true), { group: 0, routeOffset: 0 });
    Object.assign(this.addUnit('escort', routePoint(5), true), { group: 0, routeOffset: 5 });
    Object.assign(this.addUnit('escort', routePoint(10), true), { group: 0, routeOffset: 10 });
    FRIENDLY_POSTS.forEach((p, i) => {
      Object.assign(this.addUnit('escort', p, true), { group: i + 1 });
      Object.assign(this.addUnit('escort', { x: p.x + 3, z: p.z + 2 }, true), { group: i + 1 });
      Object.assign(this.addUnit('escort', { x: p.x - 3, z: p.z + 3 }, true), { group: i + 1 });
    });
  }
  get paused() {
    return this.pauses.size > 0;
  }
  get rescue() {
    return this.units[0];
  }
  get remaining() {
    return Math.max(0, MISSION.duration - this.time);
  }
  get ratio() {
    return this.progress / ROUTE_LENGTH;
  }
  get threatsRemaining() {
    return MISSION.events.length - this.spawned.size + this.units.filter((u) => !u.friendly && u.hp > 0).length;
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
    return ballisticLaunch(muzzlePosition(this.aircraft), p, WEAPONS[weapon].speed)?.duration ?? Infinity;
  }
  shotPosition(shot: Shot, time = this.time) {
    return shotPosition(shot, time);
  }
  addUnit(kind: Kind, p: Point, friendly = false) {
    const u: Unit = {
      ...p,
      y: terrainHeight(p.x, p.z),
      id: ++this.serial,
      kind,
      hp: UNITS[kind].hp,
      maxHp: UNITS[kind].hp,
      friendly,
      heading: Math.PI / 2,
      born: this.time,
      attack: MISSION.warmup,
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
      this.pauses.add(reason);
      this.clearInput();
    } else this.pauses.delete(reason);
  }
  clearInput() {
    this.held.clear();
  }
  choose(index: number) {
    if (!Number.isInteger(index) || index < 0 || index >= WEAPONS.length) return;
    this.clearInput();
    if (index !== this.selected) this.completed.add('weapon');
    this.selected = index;
  }
  setAim(p: Point) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
    if (distance(p, this.aim) > 0.2) this.completed.add('aim');
    this.aim = { ...p };
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
    if (this.phase !== 'playing' || this.paused || this.convoy === 'arrived') return;
    if (this.convoy === 'moving') {
      if (!HOLD_POINTS.some((p) => p > this.progress + 0.01)) return;
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
    return this.units.some(
      (u) =>
        u.friendly &&
        u.hp > 0 &&
        distance(u, this.aim) <= WEAPONS[this.selected].radius + UNITS[u.kind].radius,
    );
  }
  get aimedUnit() {
    return this.units
      .filter((u) => u.hp > 0 && distance(u, this.aim) <= UNITS[u.kind].radius + 1.2)
      .sort((a, b) => distance(a, this.aim) - distance(b, this.aim))[0];
  }
  fire() {
    if (this.reason() !== 'ready') return false;
    const w = WEAPONS[this.selected],
      g = this.guns[this.selected];
    const origin = Object.freeze(muzzlePosition(this.aircraft));
    const launch = ballisticLaunch(origin, this.aim, w.speed);
    if (!launch) return false;
    g.ammo--;
    g.heat = Math.min(100, g.heat + w.heat);
    g.overheated = g.heat >= 100;
    g.cooldown = w.interval;
    const shot: Shot = Object.freeze({
      id: ++this.serial,
      weapon: this.selected,
      x: this.aim.x,
      z: this.aim.z,
      born: this.time,
      origin,
      velocity: Object.freeze(launch.velocity),
      targetY: launch.targetY,
      due: this.time + launch.duration,
    });
    this.shots.push(shot);
    this.emit('shot', shot, shot.weapon);
    this.fired++;
    this.completed.add('fire');
    return true;
  }
  emit(type: BattleEvent['type'], p: Point & { y?: number }, weapon = 0, unit?: number) {
    const event: BattleEvent = { id: ++this.serial, type, x: p.x, y: p.y ?? terrainHeight(p.x, p.z), z: p.z, weapon, time: this.time, unit };
    this.events.push(event);
    if (this.events.length > 64) this.events.shift();
    return event;
  }
  private spawn() {
    MISSION.events.forEach((e, i) => {
      if (!this.spawned.has(i) && (this.time >= e.time || this.ratio >= e.progress)) {
        this.spawned.add(i);
        this.addUnit(e.kind, e);
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
      const y = terrainHeight(x, z);
      if (u.hp <= 0) continue;
      if (u.friendly && this.training) continue;
      const damage = impactDamage(s.weapon, u.kind, Math.hypot(x - point.x, y - point.y, z - point.z));
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
  step(dt: number) {
    if (this.phase !== 'playing' || this.paused) return;
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1) throw Error('Use fixed steps <= 0.1 seconds');
    this.time += dt;
    this.flight.step(dt);
    const previous = this.units.map(({ x, y, z }) => ({ x, y, z }));
    for (const g of this.guns) {
      g.cooldown = Math.max(0, g.cooldown - dt);
      g.heat = Math.max(0, g.heat - 18 * dt);
      if (g.overheated && g.heat <= 40) g.overheated = false;
    }
    if (this.convoy !== 'holding' && this.convoy !== 'arrived') {
      let next = this.progress + MISSION.speed * dt;
      if (this.convoy === 'holdRequested') {
        const stop = HOLD_POINTS.find((p) => p >= this.progress - 0.001);
        if (stop !== undefined && next >= stop) {
          next = stop;
          this.convoy = 'holding';
        }
      }
      this.progress = Math.min(ROUTE_LENGTH, next);
    }
    for (const u of this.units) {
      u.hit = Math.max(0, u.hit - dt);
      if (u.hp <= 0) continue;
      u.attack -= dt;
      if (u.friendly) {
        if (u.routeOffset !== undefined)
          Object.assign(u, routePoint(Math.min(ROUTE_LENGTH, this.progress + u.routeOffset)));
        continue;
      }
      const spec = UNITS[u.kind];
      if (u.kind === 'light') {
        Object.assign(u, patrolPoint(u.origin, this.time - u.born));
      }
      const target = this.nearestOpponent(u);
      if (u.kind === 'heavy' && target && distance(u, target) > 12) {
        const angle = Math.atan2(target.x - u.x, target.z - u.z);
        const move = Math.min(spec.speed * dt, distance(u, target) - 12);
        u.x += Math.sin(angle) * move;
        u.z += Math.cos(angle) * move;
        u.heading = angle;
      }
      u.y = terrainHeight(u.x, u.z);
    }
    const contacts = this.shots.flatMap((shot) => {
      const contact = terrainContact(shot, this.time - dt, this.time);
      return contact ? [{ shot, ...contact }] : [];
    }).sort((a, b) => a.time - b.time);
    for (const contact of contacts) this.impact(contact.shot, contact.point, contact.time, previous, dt);
    this.shots = this.shots.filter((shot) => !contacts.some((c) => c.shot === shot));
    for (const u of this.units) {
      if (u.hp <= 0) continue;
      const spec = UNITS[u.kind], target = this.nearestOpponent(u);
      if (
        target &&
        spec.damage > 0 &&
        this.time - u.born >= MISSION.warmup &&
        u.attack <= 0 &&
        distance(u, target) < spec.range
      ) {
        const damage = Math.min(target.hp, spec.damage * (target.friendly ? MISSION.friendlyArmor : target.kind === 'heavy' ? 0.25 : 1));
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
        u.attack = u.friendly ? MISSION.friendlyAttackInterval : MISSION.attackInterval;
      }
    }
    this.spawn();
    if (this.progress >= ROUTE_LENGTH) this.convoy = 'arrived';
    if (this.rescue.hp <= 0 || this.failedGroup !== undefined) {
      this.failedGroup ??= 0;
      this.phase = 'failure';
      this.failure = 'vehicle';
    } else if (this.convoy === 'arrived' && this.threatsRemaining === 0) {
      this.phase = 'success';
      this.completed.add('arrived');
    } else if (this.time >= MISSION.duration) {
      this.phase = 'failure';
      this.failure = 'timeout';
    }
    if (this.phase !== 'playing') {
      this.clearInput();
      return;
    }
    if (this.held.size && WEAPONS[this.selected].automatic) this.fire();
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
