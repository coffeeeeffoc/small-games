import {
  WEAPONS,
  LASER,
  DRONE,
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
  FIRE_ZONE,
  isWater,
  FLIGHT,
  TERRAIN,
  type Point,
  type Point3,
  type Kind,
} from './Data.ts';
import { Flight, ballisticLaunch, muzzlePosition, aircraftPoint, shotPosition, terrainContact } from './Flight.ts';
import { missionDefinition, type MissionId, type MissionDefinition } from './MissionCatalog.ts';
import { GROWTH_VERSION, SKILLS, validBattleLoadout, attackPreview, type BattleLoadout } from './Progression.ts';
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
  origin: Point & { patrolId?: number };
  patrolElapsed?: number;
  group?: number;
  routeOffset?: number;
  rootedUntil?: number;
  immuneUntil?: number;
  slowedUntil?: number;
};
export type Shot = Point & {
  strength?: number;
  damageMultiplier?: number;
  radiusScale?: number;
  trackingUntil?: number;
  side?: number;
  id: number;
  weapon: number;
  born: number;
  due: number;
  origin: Point & { y: number };
  velocity: Point3;
  targetY: number;
  timeScale?: number;
  guidance?: { kind: 'tracking' | 'consumable'; target: number; position: Point3; trail: (Point3 & { time: number })[] };
};
export type FireZone = Point3 & { id: number; radius: number; born: number; expires: number; side?: number };
export type Drone = Point3 & { id: number; volley: number; hitCounted: boolean; side: number; expires: number; budget: number; nextAttack: number; target?: number };
export type Laser = { id: number; side: number; targetId: number; origin: Point3; remaining: number; budget: number; hitCounted: boolean };
export type BattleEvent = Point & {
  side?: number;
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
  | 'extracting'
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
  loadout: BattleLoadout = { version: GROWTH_VERSION, level: 1, effects: [], skipped: [] };
  skill = { activeUntil: 0, readyAt: 0 };
  drones: Drone[] = [];
  lasers: Laser[] = [];
  resumeCountdown = 0;
  resumeRequired = false;
  time = 0;
  progress = 0;
  convoy: ConvoyState = 'moving';
  extractionRemaining?: number;
  extractionRadioPending = false;
  completionTime?: number;
  selected = 0;
  homingAmmo = 0;
  homingSelected = false;
  homingTargetId?: number;
  aim: Point = { x: MISSION.events[0].x, z: MISSION.events[0].z };
  guns = WEAPONS.map((w) => ({ heat: 0, ammo: Number(w.ammo), cooldown: 0, cooldownTotal: 0, overheated: false }));
  units: Unit[] = [];
  shots: Shot[] = [];
  private pendingShotEvents: number[] = [];
  fireZones: FireZone[] = [];
  events: BattleEvent[] = [];
  spawned = new Set<number>();
  completed = new Set<string>();
  held = new Set<string>();
  kills = 0;
  friendlyKills = 0;
  fired = 0;
  ammoSpent = 0;
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
  duelMode = false;
  pilotSide = 0;
  duelStats = [this.combatStats(), this.combatStats()];
  private combatStats() {
    return { kills: this.kills, fired: this.fired, ammoSpent: this.ammoSpent, hits: this.hits, hitShots: this.hitShots,
      friendlyDamage: this.friendlyDamage, friendHitAt: this.friendHitAt, misses: this.misses, warning: this.warning };
  }
  private useSide(side: number) {
    this.duelStats[this.pilotSide] = this.combatStats();
    Object.assign(this, this.duelStats[side]);
    this.pilotSide = side;
    for (const unit of this.units) unit.friendly = unit.group === side;
  }
  private flight = new Flight();
  readonly aircraft = this.flight.aircraft;
  private serial = 0;
  pilotState() {
    return { flight: this.flight.checkpoint(), guns: this.guns.map(gun => ({ ...gun })),
      aim: { ...this.aim }, selected: this.selected, held: Array.from(this.held),
      loadout: {...this.loadout,effects:[...this.loadout.effects],skipped:[...this.loadout.skipped]}, skill: {...this.skill}, buff: this.buff ? {...this.buff} : undefined };
  }
  usePilot(pilot: ReturnType<Simulation['pilotState']>, side: number) {
    this.useSide(side);
    this.flight.restore(pilot.flight);
    this.guns = pilot.guns.map((gun, i) => ({ ...gun, cooldownTotal: gun.cooldownTotal ?? WEAPONS[i].interval, ammo: Number.isFinite(WEAPONS[i].ammo) ? gun.ammo : Infinity }));
    this.aim = { ...pilot.aim }; this.selected = pilot.selected; this.held = new Set(pilot.held);
    this.loadout = JSON.parse(JSON.stringify(pilot.loadout ?? {version:GROWTH_VERSION,level:1,effects:[],skipped:[]}));
    this.skill = {...(pilot.skill ?? {activeUntil:0,readyAt:0})}; this.buff = pilot.buff ? {...pilot.buff} : undefined;
  }
  stepPilot(dt: number) {
    this.flight.step(dt);
    this.updateLaserOrigin();
    for (const gun of this.guns) {
      gun.cooldown = Math.max(0, gun.cooldown - dt); gun.heat = Math.max(0, gun.heat - 18 * dt);
      if (gun.overheated && gun.heat <= 40) gun.overheated = false;
    }
    if (this.held.size && WEAPONS[this.selected].automatic) this.fire();
    if (this.buff) { this.buff.remaining=Math.max(0,this.buff.remaining-dt); if(this.buff.remaining<=1e-8)this.buff=undefined; }
  }
  applyLoadout(loadout: BattleLoadout) {
    if (this.time !== 0 || this.fired || !validBattleLoadout(loadout)) throw Error('Invalid battle loadout');
    this.loadout = {...loadout,effects:[...loadout.effects],skipped:[...loadout.skipped]};
    for (const index of [4,5]) this.guns[index].ammo = loadout.effects.includes(index===4?'drone':'laser') ? WEAPONS[index].ammo : 0;
  }
  get skillKind() { return this.loadout.effects.includes('tracking') ? 'tracking' : this.loadout.effects.includes('emp') ? 'emp' : null; }
  get skillRemaining() { return Math.max(0,this.skill.activeUntil-this.time); }
  get skillCooldown() { return Math.max(0,this.skill.readyAt-this.time); }
  get trackingActive() { return this.buff?.kind==='tracking' || this.skillKind==='tracking' && this.skillRemaining>0; }
  useSkill() {
    const kind=this.skillKind;
    if(!kind || this.phase!=='playing'||this.paused||this.time<this.skill.readyAt||this.extractionRemaining!==undefined) return false;
    if(kind==='tracking' && this.trackingActive) return false;
    const spec=SKILLS[kind];this.skill.activeUntil=this.time+spec.duration;this.skill.readyAt=this.skill.activeUntil+spec.cooldown;
    if(kind==='emp') for(const unit of this.units) if(this.canTrack(unit,0)&&this.time>=(unit.immuneUntil??0)) {
      unit.rootedUntil=this.skill.activeUntil;unit.immuneUntil=this.skill.activeUntil+SKILLS.emp.immunity;
    }
    return true;
  }
  private radiusScale(weapon=this.selected) { return weapon>=1&&weapon<=3&&this.loadout.effects.includes('radius')?1.15:1; }
  get effectiveRadius() { return WEAPONS[this.selected].radius*this.radiusScale(); }
  get attackCount() { return this.selected<4?attackPreview(this.loadout.effects).shots:1; }
  private get powerMultiplier() { return 1+(this.loadout.level>=3?.05:0)+(this.loadout.effects.includes('power')?.15:0); }
  checkpoint() {
    const { flight, height: _height, mission, aircraft: _aircraft,
      pauses, spawned, completed, held, ...state } = this;
    const value = { ...state, missionId: mission.id, flight: flight.checkpoint(),
      pauses: Array.from(pauses), spawned: Array.from(spawned), completed: Array.from(completed), held: Array.from(held) };
    return JSON.parse(JSON.stringify(value)) as typeof value;
  }
  static restore(value: ReturnType<Simulation['checkpoint']>) {
    const { missionId, flight, pauses, spawned, completed, held, ...state } = JSON.parse(JSON.stringify(value)) as typeof value;
    const sim = new Simulation(missionId);
    Object.assign(sim, state);
    sim.ammoSpent = state.ammoSpent ?? state.fired;
    for (const stats of sim.duelStats) stats.ammoSpent ??= stats.fired;
    sim.fireZones = state.fireZones ?? [];
    sim.lasers = state.lasers ?? [];
    sim.guns = WEAPONS.map((weapon, index) => sim.guns[index] ??
      { heat: 0, ammo: Number(weapon.ammo), cooldown: 0, cooldownTotal: 0, overheated: false });
    // JSON stores unlimited ammunition as null; its value comes from the weapon rules.
    sim.guns.forEach((gun, index) => { gun.cooldownTotal ??= WEAPONS[index].interval; if (!Number.isFinite(WEAPONS[index].ammo)) gun.ammo = Infinity; });
    sim.flight.restore(flight);
    sim.pauses = new Set(pauses);
    sim.spawned = new Set(spawned);
    sim.completed = new Set(completed);
    sim.held = new Set(held);
    return sim;
  }
  constructor(missionId: MissionId = 'corridor-01') {
    validateData();
    this.mission = missionDefinition(missionId);
    this.selected = this.mission.initialWeapon;
    this.guns[4].ammo=0;this.guns[5].ammo=0;
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
  get canConfigure() {
    return this.phase === 'playing' && (!this.paused || this.pauses.has('settings') &&
      Array.from(this.pauses).every(reason => reason === 'settings' || reason === 'manual'));
  }
  setOrbitDirection(direction: -1 | 1) {
    if (this.canConfigure) this.flight.setDirection(direction, this.paused);
  }
  adjustAltitude(delta: number) {
    if (this.canConfigure) this.flight.adjustAltitude(delta, this.paused);
  }
  adjustRadius(delta: number) {
    if (this.canConfigure) this.flight.adjustRadius(delta, this.paused);
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
      origin: { x: p.x, z: p.z, patrolId: this.serial },
    };
    if (kind === 'light') {
      Object.assign(u, patrolPoint(u.origin, 0, this.mission.map));
      u.patrolElapsed = 0;
      u.y = this.height(u.x, u.z);
    }
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
      if (reason === 'manual') this.resumeRequired = false;
    }
  }
  grantBuff(kind: BuffKind): boolean {
    if (this.buff || kind==='tracking' && this.trackingActive || kind !== 'tracking' && kind !== 'rate') return false;
    this.buff = { kind, remaining: COMBAT_BUFF.duration };
    return true;
  }
  grantHomingAmmo(amount: number) {
    if (!Number.isSafeInteger(amount) || amount <= 0 || !Number.isSafeInteger(this.homingAmmo + amount))
      throw new Error('Invalid homing ammo grant');
    this.homingAmmo += amount;
  }
  grantAmmoSupply() {
    this.guns[1].ammo += 60;
    this.guns[2].ammo += 24;
    this.guns[3].ammo += 6;
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
    if(!this.hasWeapon(index))return;
    this.clearInput();
    if (index !== this.selected) this.completed.add('weapon');
    this.selected = index;
    this.homingSelected = false;
    this.homingTargetId = undefined;
  }
  hasWeapon(index:number) { return index>=0&&index<4 || index===4&&this.loadout.effects.includes('drone') || index===5&&this.loadout.effects.includes('laser'); }
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
    this.aim = { x: p.x, z: p.z };
    this.homingTargetId = undefined;
  }
  setFire(source: string, on: boolean) {
    if (!on) {
      this.held.delete(source);
      return;
    }
    if (this.phase !== 'playing' || this.paused || this.extractionRemaining !== undefined || this.held.has(source)) return;
    const pressed = this.held.size === 0;
    this.held.add(source);
    if (pressed) this.fire();
  }
  command() {
    if (this.mission.mode === 'training' || !this.canConfigure || this.convoy === 'arrived' || this.extractionRemaining !== undefined) return;
    if (this.convoy === 'moving') {
      if (!this.holdPoints.some((p) => p > this.progress + 0.01)) return;
      this.convoy = 'holdRequested';
      this.completed.add('hold');
    } else {
      if (this.convoy === 'holding') this.completed.add('continue');
      this.convoy = 'moving';
    }
  }
  setExtractionRadioPending(pending: boolean) {
    if (this.phase === 'playing') this.extractionRadioPending = pending;
  }
  private attackTargets(): Point[] {
    if (this.attackCount === 1) return [this.aim];
    const origin = muzzlePosition(this.aircraft, this.selected);
    const angle = Math.atan2(this.aim.z - origin.z, this.aim.x - origin.x);
    const spread = Math.min(2.4, Math.max(.35, WEAPONS[this.selected].radius * .55));
    const radius = spread * (this.attackCount === 4 ? Math.SQRT2 : 1);
    // Keep the full-strength round on the reticle; alternate the surrounding coverage per attack.
    const phase = angle - (this.loadout.effects.includes('twin') ? Math.PI / 2 : 0) + this.ammoSpent % 2 * Math.PI;
    return Array.from({ length: this.attackCount }, (_, n) => {
      if (n === 0) return this.aim;
      const direction = phase + (n - 1) * Math.PI * 2 / (this.attackCount - 1);
      return { x: this.aim.x + Math.cos(direction) * radius, z: this.aim.z + Math.sin(direction) * radius };
    });
  }
  weaponReadiness(index = this.selected) {
    const gun=this.guns[index], heatTime=gun.overheated?Math.max(0,(gun.heat-40)/18):0;
    const remaining=Math.max(gun.cooldown,heatTime),total=Math.max(gun.cooldownTotal||WEAPONS[index].interval,gun.overheated?60/18:0);
    return { remaining, displaySeconds:Math.ceil(remaining*10)/10, total, ratio: Math.max(0,Math.min(1,remaining/total)), empty:gun.ammo<=0, overheated:gun.overheated };
  }
  reason(): FireReason {
    if (this.phase === 'briefing') return 'briefing';
    if (this.phase !== 'playing') return 'finished';
    if (this.paused) return 'paused';
    if (this.extractionRemaining !== undefined) return 'extracting';
    if (this.homingSelected) return this.homingAmmo <= 0 ? 'empty' : this.homingTarget ? 'ready' : 'target';
    const w = WEAPONS[this.selected],
      g = this.guns[this.selected];
    const targets = this.attackTargets();
    if (targets.some(point => ![point.x, point.z].every(Number.isFinite) ||
        Math.abs(point.x) > MAP.halfWidth || Math.abs(point.z) > MAP.halfDepth))
      return 'outside';
    // The entire blast disk must stay outside a protected area, including its boundary.
    if (!this.duelMode && targets.some(point => PROTECTED.some((p) => distance(p, point) <= p.radius + this.effectiveRadius))) return 'protected';
    if (this.selected>=4 && !this.loadout.effects.includes(this.selected===4?'drone':'laser')) return 'empty';
    if (this.selected===5 && (!this.aimedUnit || !this.canTrack(this.aimedUnit,w.radius) || !this.lineOfSight(this.aimedUnit))) return 'target';
    if (g.overheated) return 'overheated';
    if (g.ammo < 1) return 'empty';
    if (g.cooldown > 1e-6) return 'cooldown';
    return 'ready';
  }
  get friendlyRisk() {
    if (this.homingSelected) return false;
    const target = this.trackingTarget;
    const points = target ? [target] : this.attackTargets();
    return this.units.some(
      (u) =>
        u.friendly &&
        u.hp > 0 &&
        points.some(point => distance(u, point) <= this.effectiveRadius + UNITS[u.kind].radius),
    );
  }
  get aimedUnit() {
    return this.units
      .filter((u) => u.hp > 0 && distance(u, this.aim) <= UNITS[u.kind].radius + 1.2)
      .sort((a, b) => distance(a, this.aim) - distance(b, this.aim))[0];
  }
  private canTrack(target: Unit, radius: number) {
    return target.hp > 0 && !target.friendly &&
      (this.duelMode || !PROTECTED.some(p => distance(p, target) <= p.radius + Math.max(radius, UNITS[target.kind].radius)));
  }
  private get trackingTarget() {
    if (!this.trackingActive || this.selected>=4) return;
    const radius = this.effectiveRadius, aimed = this.aimedUnit;
    if (aimed && this.canTrack(aimed, radius)) return aimed;
    return this.units.filter(u => this.canTrack(u, radius) && distance(u, this.aim) <= COMBAT_BUFF.trackingRadius)
      .sort((a, b) => distance(a, this.aim) - distance(b, this.aim))[0];
  }
  fire() {
    if (this.homingSelected) return this.fireHoming();
    if (this.reason() !== 'ready') return false;
    if(this.selected>=4)return this.fireSpecial();
    const w = WEAPONS[this.selected],
      g = this.guns[this.selected];
    const preview=attackPreview(this.loadout.effects),count=preview.shots;
    const launches=this.attackTargets().map((point,n)=>{
      const mount=w.muzzle;
      const origin=Object.freeze(n>0&&this.loadout.effects.includes('twin')
        ? aircraftPoint(this.aircraft,{...mount,x:mount.x+(n%2===0?-.6:.6)})
        : muzzlePosition(this.aircraft,this.selected));
      return {origin,point,launch:ballisticLaunch(origin,point,w.speed,this.height)};
    });
    if(launches.some(item=>!item.launch))return false;
    g.ammo--;
    this.ammoSpent++;
    g.heat = Math.min(100, g.heat + w.heat*preview.heatMultiplier);
    g.overheated = g.heat >= 100;
    g.cooldown = w.interval*(this.loadout.effects.includes('rate')?.88:1)*(this.loadout.level>=15?.95:1) / (this.buff?.kind === 'rate' ? COMBAT_BUFF.rateMultiplier : 1);
    g.cooldownTotal = g.cooldown;
    const target = this.trackingTarget;
    for(let n=0;n<count;n++) {
    const {origin,point,launch}=launches[n];
    const delay=this.loadout.effects.includes('burst')?Math.floor(n/(this.loadout.effects.includes('twin')?2:1))*Math.min(.1,g.cooldown/2):0;
    const strength=n===0?1:preview.secondaryStrength;
    const shot: Shot = {
      id: ++this.serial,
      ...(this.duelMode ? { side: this.pilotSide } : {}),
      weapon: this.selected,
      x: point.x,
      z: point.z,
      born: this.time+delay,
      origin,
      velocity: launch!.velocity,
      targetY: launch!.targetY,
      due: this.time + delay + launch!.duration,
      strength,damageMultiplier:this.powerMultiplier*strength,radiusScale:this.radiusScale(),
      trackingUntil:Math.max(this.buff?.kind==='tracking'?this.time+this.buff.remaining:0,this.skillKind==='tracking'?this.skill.activeUntil:0),
    };
    if (target) shot.guidance = { kind: 'tracking', target: target.id, position: { ...origin }, trail: [{ ...origin, time: shot.born }] };
    else { Object.freeze(shot.velocity); Object.freeze(shot); }
    this.shots.push(shot);
    if(!delay)this.emit('shot', shot, shot.weapon);else this.pendingShotEvents.push(shot.id);
    this.fired++;
    }
    this.completed.add('fire');
    return true;
  }
  private lineOfSight(target: Point3,origin=muzzlePosition(this.aircraft,this.selected),maximum=650) {
    const range=Math.hypot(target.x-origin.x,target.y-origin.y,target.z-origin.z);
    if(!Number.isFinite(range)||range>maximum)return false;
    const samples=Math.max(2,Math.ceil(range/.5));
    for(let i=1;i<samples;i++){const t=i/samples,x=origin.x+(target.x-origin.x)*t,z=origin.z+(target.z-origin.z)*t,y=origin.y+(target.y-origin.y)*t;
      if(y<=this.height(x,z)+.05)return false;}
    return true;
  }
  private fireSpecial() {
    const weapon=this.selected,g=this.guns[weapon],origin=muzzlePosition(this.aircraft,weapon);
    if(weapon===4) {
      if(this.drones.filter(d=>d.side===this.pilotSide).length>=DRONE.count)return false;
      const volley=++this.serial;
      for(let i=0;i<DRONE.count;i++){
        const angle=i*Math.PI*2/DRONE.count;
        this.drones.push({...origin,x:origin.x+Math.cos(angle)*6,z:origin.z+Math.sin(angle)*6,id:++this.serial,volley,hitCounted:false,side:this.pilotSide,
          expires:this.time+DRONE.duration,budget:DRONE.damage*DRONE.duration/DRONE.interval,nextAttack:this.time+DRONE.interval+i*.12});
      }
      this.emit('shot',origin,weapon);
    } else {
      if(this.lasers.some(beam=>beam.side===this.pilotSide))return false;
      const target=this.aimedUnit!;
      this.lasers.push({id:++this.serial,side:this.pilotSide,targetId:target.id,origin:{...origin},remaining:LASER.duration,budget:WEAPONS[weapon].damage,hitCounted:false});
      this.emit('shot',origin,weapon).target={x:target.x,y:target.y,z:target.z};
    }
    g.ammo--;g.cooldown=g.cooldownTotal=WEAPONS[weapon].interval;this.fired++;this.ammoSpent++;this.completed.add('fire');return true;
  }
  private directHit(target: Unit, damage: number, weapon: number, countShot=true, continuous=false) {
    const actual=Math.min(target.hp,damage);target.hp-=actual;target.hit=.3;if(!continuous||countShot)this.hits++;if(countShot)this.hitShots++;
    if(!continuous||countShot||target.hp<=0){const event=this.emit('impact',target,weapon,target.id);event.damage=actual;event.outcome=target.hp>0?'hit':'destroyed';}
    if(target.hp<=0){target.deadAt=this.time;this.kills++;this.emit('kill',target,weapon,target.id);}
  }
  private updateLaserOrigin() {
    for(const beam of this.lasers)if(beam.side===this.pilotSide)beam.origin={...muzzlePosition(this.aircraft,5)};
  }
  private stepLasers(dt: number) {
    const side=this.pilotSide;
    for(const beam of this.lasers){
      if(this.duelMode)this.useSide(beam.side);
      const target=this.units.find(unit=>unit.id===beam.targetId);
      if(!target||target.hp<=0||!this.canTrack(target,WEAPONS[5].radius)||Math.abs(target.x)>MAP.halfWidth||Math.abs(target.z)>MAP.halfDepth||
        !this.lineOfSight(target,beam.origin,LASER.range)){beam.remaining=0;continue;}
      const duration=Math.min(dt,beam.remaining,beam.budget/LASER.dps),damage=duration*LASER.dps;
      if(duration<=0)continue;
      beam.remaining=Math.max(0,beam.remaining-duration);beam.budget=Math.max(0,beam.budget-damage);
      this.directHit(target,damage*(target.kind==='heavy'?WEAPONS[5].armor:1),5,!beam.hitCounted,true);beam.hitCounted=true;
      if(target.hp<=0)beam.remaining=0;
    }
    if(this.duelMode)this.useSide(side);
    this.lasers=this.lasers.filter(beam=>beam.remaining>1e-8&&beam.budget>1e-8);
  }
  private stepDrones(dt: number) {
    const side=this.pilotSide,claimed=new Map<number,Set<number>>();
    for(const drone of this.drones) {
      if(this.duelMode)this.useSide(drone.side);
      const ground=this.height(drone.x,drone.z);
      if(drone.expires<=this.time){
        drone.target=undefined;drone.y=Math.max(ground,drone.y-48*dt);
        if(drone.y<=ground)this.emit('impact',drone,4);
        continue;
      }
      const assigned=claimed.get(drone.side)??new Set<number>();claimed.set(drone.side,assigned);
      const target=this.units.filter(u=>this.canTrack(u,0)).sort((a,b)=>Number(assigned.has(a.id))-Number(assigned.has(b.id))||distance(a,drone)-distance(b,drone))[0];
      drone.target=target?.id;
      if(target){
        assigned.add(target.id);
        const angle=(drone.id-drone.volley-1)*Math.PI*2/DRONE.count;
        const hover={x:target.x+Math.cos(angle)*6,z:target.z+Math.sin(angle)*6},length=Math.max(.1,distance(hover,drone)),travel=Math.min(1,WEAPONS[4].speed*dt/length);
        drone.x+=(hover.x-drone.x)*travel;drone.z+=(hover.z-drone.z)*travel;drone.y=Math.max(target.y+16,this.height(drone.x,drone.z)+8,drone.y-60*dt);
        if(drone.budget>0&&distance(target,drone)<30&&this.time>=drone.nextAttack&&this.lineOfSight(target,drone,40)){
          const damage=Math.min(DRONE.damage,drone.budget);drone.budget-=damage;drone.nextAttack=this.time+DRONE.interval;target.slowedUntil=this.time+2;
          const countShot=!drone.hitCounted;for(const member of this.drones)if(member.volley===drone.volley)member.hitCounted=true;this.directHit(target,damage,4,countShot);
        }
      }
    }
    if(this.duelMode)this.useSide(side);
    this.drones=this.drones.filter(d=>d.expires>this.time||d.y>this.height(d.x,d.z));
  }
  fireHoming() {
    const target = this.homingTarget;
    if (this.phase !== 'playing' || this.paused || this.extractionRemaining !== undefined || this.homingAmmo <= 0 || !target || target.friendly ||
        PROTECTED.some(p => distance(p, target) <= p.radius + UNITS[target.kind].radius)) return false;
    const origin = muzzlePosition(this.aircraft, 2);
    const delta = { x: target.x - origin.x, y: target.y - origin.y, z: target.z - origin.z };
    const range = Math.hypot(delta.x, delta.y, delta.z);
    if (!Number.isFinite(range) || range <= 0) return false;
    this.clearInput();
    this.homingAmmo--;
    this.ammoSpent++;
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
    const event: BattleEvent = { id: ++this.serial, type, x: p.x, y: p.y ?? this.height(p.x, p.z), z: p.z, weapon, time: this.time, unit,
      ...(this.duelMode ? { side: this.pilotSide } : {}) };
    this.events.push(event);
    if (this.events.length > 64) this.events.shift();
    return event;
  }
  private spawn() {
    let active=this.units.filter(unit=>!unit.friendly&&unit.hp>0).length;
    this.mission.events.forEach((e, i) => {
      if (active<24&&!this.spawned.has(i) && (this.time >= e.time || this.ratio >= e.progress)) {
        active++;
        this.spawned.add(i);
        this.addUnit(e.kind, landPoint(e, this.mission.map));
        this.lastWave = i;
        this.waveAt = this.time;
        this.emit('wave', e);
      }
    });
  }
  private impact(s: Shot, point: Point3, time: number, previous: Point3[], dt: number) {
    if (s.weapon === 3 && !isWater(point, this.mission.map) &&
        Math.abs(point.x) <= MAP.halfWidth && Math.abs(point.z) <= MAP.halfDepth &&
        (this.duelMode || !PROTECTED.some(zone => distance(zone, point) <= zone.radius + WEAPONS[3].radius*(s.radiusScale??1)))) {
      this.fireZones.push({ ...point, id: s.id, radius: WEAPONS[3].radius*(s.radiusScale??1), born: time, expires: time + FIRE_ZONE.duration*(s.strength??1), side: s.side });
    }
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
        : impactDamage(s.weapon, u.kind, UNITS[u.kind].radius + Math.max(0,Math.hypot(x - point.x, y - point.y, z - point.z)-UNITS[u.kind].radius)/(s.radiusScale??1))*(s.damageMultiplier??1);
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
    } else if ((s.strength??1) === 1 && ++this.misses >= 7) this.warning = 'lead';
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
  private canMove(unit: Unit, point: Point) {
    const dx = point.x - unit.x, dz = point.z - unit.z, length2 = dx * dx + dz * dz;
    for (const zone of this.fireZones) {
      const x = unit.x - zone.x, z = unit.z - zone.z, radius = zone.radius + UNITS[unit.kind].radius;
      const dot = x * dx + z * dz;
      // Escape may cross already-overlapping fire; vehicles outside a disk cannot enter it.
      if (x * x + z * z >= radius * radius - 1e-8) {
        const t = Math.max(0, Math.min(1, -dot / (length2 || 1)));
        if ((x + dx * t) ** 2 + (z + dz * t) ** 2 < radius * radius - 1e-8) return false;
      }
    }
    const steps = Math.max(1, Math.ceil(Math.sqrt(length2) / .25));
    for (let i = 1; i <= steps; i++) {
      const p = { x: unit.x + dx * i / steps, z: unit.z + dz * i / steps };
      if (Math.abs(p.x) > MAP.halfWidth || Math.abs(p.z) > MAP.halfDepth || isWater(p, this.mission.map)) return false;
    }
    return true;
  }
  private moveUnit(unit: Unit, target: Point & { heading?: number }, limit: number) {
    const range = distance(unit, target), fraction = Math.min(1, limit / (range || 1));
    let next = { x: unit.x + (target.x - unit.x) * fraction, z: unit.z + (target.z - unit.z) * fraction };
    const engulfed = this.fireZones.some(zone => distance(unit, zone) < zone.radius + UNITS[unit.kind].radius);
    const direct = !engulfed && this.canMove(unit, next);
    if (!direct) {
      if (!engulfed) return false;
      // Search only a single speed-limited step to escape a newly engulfing fire, including overlapping zones.
      const candidates: (Point & { escape: number })[] = [];
      for (let i = 0; i < 16; i++) {
        const angle = i * Math.PI / 8;
        const p = { x: unit.x + Math.sin(angle) * limit, z: unit.z + Math.cos(angle) * limit };
        if (this.canMove(unit, p)) {
          const escape = Math.max(...this.fireZones.filter(zone => distance(unit, zone) < zone.radius + UNITS[unit.kind].radius).map(zone => {
            const x = unit.x - zone.x, z = unit.z - zone.z, radius = zone.radius + UNITS[unit.kind].radius;
            const dot = x * Math.sin(angle) + z * Math.cos(angle);
            return -dot + Math.sqrt(dot * dot + radius * radius - x * x - z * z);
          }));
          candidates.push({ ...p, escape });
        }
      }
      candidates.sort((a, b) => a.escape - b.escape || distance(a, target) - distance(b, target));
      if (!candidates.length) return false;
      next = { x: candidates[0].x, z: candidates[0].z };
    }
    const moved = distance(unit, next);
    if (moved > 1e-8) unit.heading = direct && fraction === 1 && target.heading !== undefined ? target.heading
      : Math.atan2(next.x - unit.x, next.z - unit.z);
    Object.assign(unit, next);
    unit.y = this.height(unit.x, unit.z);
    return direct && fraction === 1;
  }
  private burn(dt: number) {
    const side = this.pilotSide;
    for (const unit of this.units) {
      if (unit.hp <= 0 || unit.friendly && this.training ||
          !this.duelMode && PROTECTED.some(zone => distance(unit, zone) <= zone.radius + UNITS[unit.kind].radius)) continue;
      const zone = this.fireZones.find(zone => distance(unit, zone) <= zone.radius + UNITS[unit.kind].radius);
      if (!zone) continue;
      if (this.duelMode) this.useSide(zone.side ?? side);
      const damage = Math.min(unit.hp, FIRE_ZONE.damagePerSecond * Math.max(0, Math.min(this.time, zone.expires) - Math.max(this.time - dt, zone.born)));
      unit.hp -= damage;
      if (unit.friendly) {
        this.friendlyDamage += damage;
        this.friendHitAt = this.time;
        if (unit.kind === 'rescue') this.rescueDamage.friendly += damage;
      }
      if (unit.hp <= 0) {
        unit.deadAt = this.time;
        if (unit.friendly) this.recordFriendlyLoss(unit, 'friendly');
        else this.kills++;
        this.emit('kill', unit, 3, unit.id);
      }
    }
    if (this.duelMode) this.useSide(side);
  }
  step(dt: number) {
    if (this.phase !== 'playing' || this.paused) return;
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1) throw Error('Use fixed steps <= 0.1 seconds');
    if (!this.duelMode && this.buff && this.buff.remaining > 1e-8 && this.buff.remaining < dt - 1e-8) {
      const remaining = this.buff.remaining;
      this.step(remaining);
      this.step(dt - remaining);
      return;
    }
    this.time += dt;
    if (!this.duelMode) { this.flight.step(dt); this.updateLaserOrigin(); }
    const previous = this.units.map(({ x, y, z }) => ({ x, y, z }));
    for (const g of this.duelMode ? [] : this.guns) {
      g.cooldown = Math.max(0, g.cooldown - dt);
      g.heat = Math.max(0, g.heat - 18 * dt);
      if (g.overheated && g.heat <= 40) g.overheated = false;
    }
    let convoyBlocked = false;
    if (!this.duelMode && this.convoy !== 'holding' && this.convoy !== 'arrived') {
      let next = this.extractionRemaining === undefined ? this.progress + this.mission.speed * dt
        : this.progress + Math.min(this.routeLength / 3 * dt,
          (this.routeLength - this.progress) * Math.min(1, dt / Math.max(dt, this.extractionRemaining)));
      if (this.convoy === 'holdRequested') {
        const stop = this.holdPoints.find((p) => p >= this.progress - 0.001);
        if (stop !== undefined && next >= stop) {
          next = stop;
        }
      }
      convoyBlocked = this.units.some(unit => unit.friendly && unit.hp > 0 && unit.routeOffset !== undefined &&
        !this.canMove(unit, this.routePoint(Math.min(this.routeLength, next + unit.routeOffset))));
      if (!convoyBlocked) {
        this.progress = Math.min(this.routeLength, next);
        if (this.convoy === 'holdRequested' && this.holdPoints.some(stop => Math.abs(stop - this.progress) < 1e-8)) this.convoy = 'holding';
      }
    }
    if (this.extractionRemaining !== undefined && !convoyBlocked) this.extractionRemaining = Math.max(0, this.extractionRemaining - dt);
    for (const u of this.units) {
      u.hit = Math.max(0, u.hit - dt);
      if (u.hp <= 0) continue;
      u.attack -= dt;
      if(this.time<(u.rootedUntil??0))continue;
      const moveDt=dt*(this.time<(u.slowedUntil??0)?.55:1);
      if (u.friendly && !this.duelMode) {
        if (u.routeOffset !== undefined) {
          const point = this.routePoint(Math.min(this.routeLength, this.progress + u.routeOffset));
          const limit = this.extractionRemaining === undefined || convoyBlocked ? Math.max(this.mission.speed, UNITS[u.kind].speed) * dt : this.routeLength / 3 * dt;
          this.moveUnit(u, point, limit);
          u.y = this.height(u.x, u.z) + TERRAIN.roadLift;
        } else if (this.fireZones.some(zone => distance(u, zone) < zone.radius + UNITS[u.kind].radius)) {
          this.moveUnit(u, u, UNITS[u.kind].speed * dt);
        }
        continue;
      }
      const spec = UNITS[u.kind];
      if (u.kind === 'light') {
        const elapsed = u.patrolElapsed ?? this.time - dt - u.born;
        const point = patrolPoint(u.origin, elapsed + moveDt, this.mission.map, u.id);
        if (this.moveUnit(u, point, spec.speed * moveDt)) u.patrolElapsed = elapsed + moveDt;
        else u.patrolElapsed = elapsed;
      }
      const target = this.nearestOpponent(u);
      if (u.kind === 'heavy' && this.fireZones.some(zone => distance(u, zone) < zone.radius + spec.radius)) {
        this.moveUnit(u, u, spec.speed * moveDt);
      } else if (u.kind === 'heavy' && target && distance(u, target) > 12) {
        const angle = Math.atan2(target.x - u.x, target.z - u.z);
        const move = Math.min(spec.speed * moveDt, distance(u, target) - 12);
        this.moveUnit(u, { ...landPoint({ x: u.x + Math.sin(angle) * move, z: u.z + Math.cos(angle) * move },
          this.mission.map, u.x - riverX(u.z)), heading: angle }, move);
      }
      u.y = this.height(u.x, u.z);
    }
    const contacts = this.shots.flatMap((shot) => {
      if(this.time<shot.born)return [];
      const from=Math.max(this.time-dt,shot.born),aliveDt=this.time-from;
      if(this.pendingShotEvents.includes(shot.id)){this.pendingShotEvents=this.pendingShotEvents.filter(id=>id!==shot.id);const event=this.emit('shot',shot,shot.weapon);event.time=shot.born;if(shot.side!==undefined)event.side=shot.side;}
      if (shot.guidance) {
        const ordinary = shot.guidance.kind === 'tracking';
        const target = this.units.find(u => u.id === shot.guidance!.target);
        const radius=ordinary?WEAPONS[shot.weapon].radius*(shot.radiusScale??1):0;
        const legal=target&&target.hp>0&&(this.duelMode?target.group!==shot.side:!target.friendly)&&
          (this.duelMode||!PROTECTED.some(p=>distance(p,target)<=p.radius+Math.max(radius,UNITS[target.kind].radius)));
        if (!legal || ordinary && this.time>(shot.trackingUntil??(this.buff?.kind==='tracking'?Infinity:0))+1e-8) {
          if (!ordinary) return [{ shot, point: shot.guidance.position, time: this.time, cancelled: true }];
          this.releaseTracking(shot, from);
          const contact = terrainContact(shot, from, this.time, this.height);
          return contact ? [{ shot, ...contact, cancelled: false }] : [];
        }
        const position = shot.guidance.position;
        const delta = { x: target.x - position.x, y: target.y - position.y, z: target.z - position.z };
        const speed = ordinary ? WEAPONS[shot.weapon].speed : HOMING.speed;
        const range = Math.hypot(delta.x, delta.y, delta.z), travel = speed * aliveDt;
        if (range > 0) shot.velocity = { x: delta.x / range * speed, y: delta.y / range * speed, z: delta.z / range * speed };
        if (ordinary) {
          const contact = this.trackingContact(position, shot.velocity, from, Math.min(aliveDt, range / speed));
          if (contact) return [{ shot, ...contact, cancelled: false }];
        }
        if (range <= travel) return [{ shot, point: { x: target.x, y: target.y, z: target.z }, time: from+range/speed, cancelled: false }];
        position.x += shot.velocity.x * aliveDt; position.z += shot.velocity.z * aliveDt;
        position.y += shot.velocity.y * aliveDt;
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
      const side = this.pilotSide;
      if (this.duelMode) this.useSide(contact.shot.side ?? side);
      this.impact(contact.shot, contact.point, contact.time, previous, dt);
      if (this.duelMode) this.useSide(side);
    }
    this.shots = this.shots.filter((shot) => !contacts.some((c) => c.shot === shot));
    this.stepLasers(dt);
    this.stepDrones(dt);
    this.burn(dt);
    this.fireZones = this.fireZones.filter(zone => zone.expires > this.time + 1e-8);
    if (!this.duelMode && this.buff) {
      this.buff.remaining = Math.max(0, this.buff.remaining - dt);
      if (this.buff.remaining <= 1e-8) {
        this.buff = undefined;
        if(!this.trackingActive)for (const shot of this.shots) if (shot.guidance?.kind === 'tracking'&&shot.born<=this.time) this.releaseTracking(shot, this.time);
      }
    }
    for (const u of this.units) {
      if (u.hp <= 0) continue;
      const intent = this.attackIntent(u);
      if (intent && intent.dueIn <= 0) {
        const { target, damage } = intent;
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
        if (this.duelMode) event.side = u.group;
        if (target.hp === 0) {
          target.deadAt = this.time;
          if (target.friendly) this.recordFriendlyLoss(target, 'enemy');
          else this.friendlyKills++;
          const killed = this.emit('kill', target, 0, target.id); killed.friendly = u.friendly;
          if (this.duelMode) killed.side = u.group;
        }
        u.attack = !this.duelMode && u.friendly ? this.mission.friendlyAttackInterval : this.mission.attackInterval;
      }
    }
    if (!this.duelMode) this.spawn();
    if (this.duelMode) return;
    if (this.mission.mode === 'escort' && this.threatsRemaining === 0 && this.extractionRemaining === undefined) {
      this.extractionRemaining = this.progress >= this.routeLength ? 0 : 3;
      this.convoy = 'moving';
      this.clearInput();
      this.shots = this.shots.map(shot => {
        if (shot.guidance?.kind === 'consumable') return shot;
        if (shot.guidance) this.releaseTracking(shot, this.time);
        // Rebase at the current position; fast-forward the same remaining arc and terrain sweep.
        return Object.freeze({ ...shot, origin: shotPosition(shot, this.time),
          velocity: { ...shot.velocity, y: shot.velocity.y - FLIGHT.gravity * (this.time - shot.born) },
          born: this.time, due: this.time + (shot.due - this.time) / 4, timeScale: 4 });
      });
    }
    if (this.progress >= this.routeLength && this.units.every(unit => !unit.friendly || unit.hp <= 0 ||
        unit.routeOffset === undefined || distance(unit, this.routePoint(this.routeLength)) < 1e-6)) this.convoy = 'arrived';
    if (this.mission.mode === 'escort' && this.convoy === 'arrived' && this.shots.length === 0 && this.threatsRemaining === 0)
      this.completionTime ??= this.time; // Audio may delay the result screen, never the ranked clock.
    if (this.rescue.hp <= 0 || this.failedGroup !== undefined || this.mission.mode === 'training' && this.friendlyLosses > 0) {
      this.failedGroup ??= this.mission.mode === 'training'
        ? this.units.find((unit) => unit.friendly && unit.hp <= 0)?.group ?? 0 : 0;
      this.phase = 'failure';
      this.failure = 'vehicle';
    } else if ((this.convoy === 'arrived' && this.shots.length === 0 && !this.extractionRadioPending || this.mission.mode === 'training') && this.threatsRemaining === 0) {
      this.phase = 'success';
      if (this.mission.mode === 'escort') this.completed.add('arrived');
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
  attackIntent(unit: Unit) {
    if (!this.duelMode && this.mission.mode === 'training' || unit.hp <= 0) return;
    const spec = UNITS[unit.kind], target = this.nearestOpponent(unit);
    if (!target || spec.damage <= 0 || distance(unit, target) >= spec.range) return;
    return { target,
      damage: Math.min(target.hp, spec.damage * (this.duelMode ? target.kind === 'heavy' ? .25 : .5 : target.friendly ? this.mission.friendlyArmor : target.kind === 'heavy' ? .25 : 1)),
      dueIn: Math.max(0, unit.attack, this.mission.warmup - (this.time - unit.born)) };
  }
  get priorityThreat() {
    if (this.phase !== 'playing') return;
    return this.units.filter(unit => !unit.friendly).flatMap(unit => {
      const intent = this.attackIntent(unit);
      if (!intent || intent.dueIn > 8) return [];
      const lethal = intent.damage >= intent.target.hp;
      const critical = lethal && (intent.target === this.rescue ||
        !this.units.some(other => other !== intent.target && other.friendly && other.hp > 0 && other.group === intent.target.group));
      return [{ unit, ...intent, lethal, critical }];
    }).sort((a, b) => Number(b.critical) - Number(a.critical) || Number(b.lethal) - Number(a.lethal) ||
      a.dueIn - b.dueIn || b.damage - a.damage || a.unit.id - b.unit.id)[0];
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
