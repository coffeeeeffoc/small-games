import {
  WEAPONS,
  MAP,
  aircraft,
  UNITS,
  MISSION,
  HOLD_POINTS,
  ROUTE_LENGTH,
  PROTECTED,
  routePoint,
  distance,
  validateData,
  type Point,
  type Kind,
} from './Data.ts';
export type PauseReason = 'help' | 'mission' | 'manual' | 'orientation' | 'background' | 'focus';
export type ConvoyState = 'moving' | 'holdRequested' | 'holding' | 'arrived';
export type Unit = Point & {
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
};
export type Shot = Point & {
  id: number;
  weapon: number;
  born: number;
  due: number;
  origin: Point & { y: number };
};
export type BattleEvent = Point & {
  id: number;
  type: 'shot' | 'impact' | 'kill' | 'attack' | 'wave';
  weapon: number;
  time: number;
  unit?: number;
  outcome?: 'hit' | 'miss' | 'armor' | 'friendly' | 'destroyed';
  damage?: number;
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
  fired = 0;
  hits = 0;
  friendlyDamage = 0;
  rescueDamage = { friendly: 0, enemy: 0 };
  damageByThreat: Partial<Record<Kind, number>> = {};
  failureCause: '' | 'friendly' | 'enemy' = '';
  friendHitAt = -100;
  failure: '' | 'vehicle' | 'timeout' = '';
  lastWave = -1;
  waveAt = -100;
  warning: '' | 'armor' | 'lead' = '';
  misses = 0;
  training = false;
  private serial = 0;
  constructor() {
    validateData();
    this.addUnit('rescue', routePoint(0), true);
    this.addUnit('escort', routePoint(5), true);
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
  addUnit(kind: Kind, p: Point, friendly = false) {
    const u: Unit = {
      ...p,
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
    if (Math.abs(this.aim.x) > MAP.halfWidth || Math.abs(this.aim.z) > MAP.halfDepth)
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
    g.ammo--;
    g.heat = Math.min(100, g.heat + w.heat);
    g.overheated = g.heat >= 100;
    g.cooldown = w.interval;
    const shot = {
      id: ++this.serial,
      weapon: this.selected,
      x: this.aim.x,
      z: this.aim.z,
      born: this.time,
      origin: aircraft(this.time),
      due: this.time + w.flight,
    };
    this.shots.push(shot);
    this.emit('shot', shot, shot.weapon);
    this.fired++;
    this.completed.add('fire');
    return true;
  }
  emit(type: BattleEvent['type'], p: Point, weapon = 0, unit?: number) {
    this.events.push({ id: ++this.serial, type, ...p, weapon, time: this.time, unit });
    if (this.events.length > 64) this.events.shift();
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
  private impact(s: Shot) {
    const w = WEAPONS[s.weapon];
    let hit = false,
      friendly = false,
      armor = false,
      destroyed = false,
      total = 0;
    for (const u of this.units) {
      if (u.hp <= 0 || distance(u, s) > w.radius + UNITS[u.kind].radius) continue;
      if (u.friendly && this.training) continue;
      const damage = w.damage * (u.kind === 'heavy' ? w.armor : 1),
        actual = Math.min(u.hp, damage);
      u.hp = Math.max(0, u.hp - damage);
      total += actual;
      u.hit = 0.18;
      if (u.friendly) {
        friendly = true;
        this.friendlyDamage += actual;
        this.friendHitAt = this.time;
        if (u.kind === 'rescue') {
          this.rescueDamage.friendly += actual;
          if (u.hp === 0) this.failureCause = 'friendly';
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
        u.deadAt = this.time;
        if (!u.friendly) {
          this.kills++;
          destroyed = true;
        }
        this.emit('kill', u, s.weapon, u.id);
      }
    }
    if (hit) {
      this.misses = 0;
      if (this.warning === 'lead') this.warning = '';
    } else if (++this.misses >= 7) this.warning = 'lead';
    this.emit('impact', s, s.weapon);
    const event = this.events[this.events.length - 1];
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
      if (u.friendly) {
        Object.assign(
          u,
          routePoint(Math.min(ROUTE_LENGTH, this.progress + (u.kind === 'escort' ? 5 : 0))),
        );
        continue;
      }
      const spec = UNITS[u.kind];
      if (u.kind === 'light') {
        const next = {
          x: u.origin.x + Math.sin((this.time - u.born) * 0.5) * 5,
          z: u.origin.z + Math.cos((this.time - u.born) * 0.5) * 2,
        };
        u.heading = Math.atan2(next.x - u.x, next.z - u.z);
        Object.assign(u, next);
      }
      if (u.kind === 'heavy' && distance(u, this.rescue) > 12) {
        const angle = Math.atan2(this.rescue.x - u.x, this.rescue.z - u.z);
        u.x += Math.sin(angle) * spec.speed * dt;
        u.z += Math.cos(angle) * spec.speed * dt;
        u.heading = angle;
      }
      u.attack -= dt;
      if (
        this.time - u.born >= MISSION.warmup &&
        u.attack <= 0 &&
        distance(u, this.rescue) < spec.range
      ) {
        const damage = Math.min(this.rescue.hp, spec.damage);
        this.rescueDamage.enemy += damage;
        this.damageByThreat[u.kind] = (this.damageByThreat[u.kind] || 0) + damage;
        this.rescue.hp = Math.max(0, this.rescue.hp - spec.damage);
        if (this.rescue.hp === 0) this.failureCause = 'enemy';
        this.rescue.hit = 0.3;
        u.attack = 2.4;
        this.emit('attack', u, 0, this.rescue.id);
      }
    }
    this.spawn();
    const due = this.shots.filter((s) => s.due <= this.time);
    this.shots = this.shots.filter((s) => s.due > this.time);
    for (const s of due) this.impact(s);
    if (this.rescue.hp <= 0) {
      this.phase = 'failure';
      this.failure = 'vehicle';
    } else if (this.progress >= ROUTE_LENGTH) {
      this.convoy = 'arrived';
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
  get rating() {
    if (this.phase !== 'success') return '—';
    const health = this.rescue.hp / this.rescue.maxHp;
    return this.friendlyDamage === 0 && health >= 0.7
      ? 'S'
      : health >= 0.4 && this.friendlyDamage < 60
        ? 'A'
        : 'B';
  }
}
