import { C, add, sub, mul, unit, distance, length, clamp, type Vec } from './config';
import { Physics, type Character, type Body, type Side } from './physics';
import { Grips } from './grips';
import type { Level, Zone } from './levels';
export type Action = 'jump' | 'swing';
export type Charge = { who: number; action: Action; started: number; source: string; direction: Vec };
export class Simulation {
  actors: Character[] = []; solids: Body[] = []; grips!: Grips;
  selected = 0; time = 0; accumulator = 0; charge: Charge | null = null;
  move: { who: number; direction: number; source: string } | null = null;
  aim: Vec = unit({ x: 0.7, y: -0.8 });
  status: 'playing' | 'failed' | 'won' = 'playing'; paused = false;
  message = ''; messageUntil = 0; checkpoint = false; checkpointHold = 0; winHold = 0;
  events: { time: number; kind: string; text: string }[] = [];
  actions: { who: number; type: Action; power: number; time: number }[] = [];
  onSound: (kind: string) => void = () => {};
  resets = 0; numericalErrors = 0;
  constructor(public p: Physics, public level: Level) { this.load(level); }
  tell(text: string, sound = '') {
    this.message = text; this.messageUntil = this.time + 2200;
    if (sound) { this.onSound(sound); this.events.push({ time: this.time, kind: sound, text }); if (this.events.length > 120) this.events.shift(); }
  }
  load(level: Level, fromCheckpoint = false) {
    this.p.clear(); this.level = level; this.time = 0; this.accumulator = 0; this.charge = null; this.move = null;
    this.status = 'playing'; this.paused = false; this.winHold = 0; this.checkpointHold = 0; this.selected = level.id === 3 || (level.id === 5 && !fromCheckpoint) ? 2 : 0;
    this.actions = []; this.events = []; this.message = level.tip; this.messageUntil = 5000;
    this.aim = unit({ x: 0.7, y: -0.8 }); this.checkpoint = fromCheckpoint && !!level.checkpoint;
    this.solids = level.platforms.map(p => this.p.makePlatform(p));
    this.actors = (this.checkpoint ? level.checkpoint!.spawns : level.spawns).map((s, id) => this.p.character(id, s));
    this.grips = new Grips(this.p, this.actors, level.anchors, this.solids, (text, sound) => this.tell(text, sound));
    if (!this.checkpoint) this.grips.initialize(level.grips);
    this.resets++;
  }
  reset(full = false) { this.load(this.level, this.checkpoint && !full); }
  cancel(reason = '') { if (this.charge && reason) this.tell(reason); this.charge = null; }
  pause(paused: boolean) { this.paused = paused; this.cancel(); this.move = null; this.accumulator = 0; }
  select(who: number) {
    if (!this.actors[who] || who === this.selected) return;
    this.cancel('已切换队员，蓄力取消'); this.move = null; this.selected = who; this.onSound('select');
  }
  setAim(direction: Vec) {
    if (!Number.isFinite(direction.x + direction.y) || length(direction) < 0.01) return;
    const normalized = unit(direction);
    this.aim = (this.charge?.action ?? this.qualification(this.selected).action) === 'jump'
      ? unit({ x: clamp(normalized.x, -0.85, 0.85), y: Math.min(-0.48, normalized.y) }) : normalized;
    if (this.charge) this.charge.direction = { ...this.aim };
    if (Math.abs(this.aim.x) > 0.1) this.actors[this.selected].facing = Math.sign(this.aim.x);
  }
  movement(direction: number, source: string) {
    if (this.paused || this.status !== 'playing') return;
    if (!direction) { if (this.move?.source === source) this.move = null; return; }
    this.move = { who: this.selected, direction: Math.sign(direction), source };
    this.setAim({ x: Math.sign(direction) * 0.7, y: -0.8 });
  }
  qualification(who: number): { action: Action | null; reason: string } {
    const c = this.actors[who];
    if (c.groundedMs >= C.supportMs) return { action: 'jump', reason: this.grips.graph(who).anchors.length ? '仍抓着支点 · 起跳不会松手' : '脚下站稳，可以起跳' };
    if (this.grips.graph(who).anchors.length) return { action: 'swing', reason: '已连接场景支点 · 松手才能飞出' };
    return { action: null, reason: '空中没有支点 · 不能二段跳' };
  }
  begin(source: string) {
    if (this.charge || this.paused || this.status !== 'playing') return false;
    const c = this.actors[this.selected], q = this.qualification(c.id);
    if (!q.action) { this.tell(q.reason); return false; }
    if (this.time - c.lastAction < C.actionCooldown) { this.tell('稍等一下，再次借力'); return false; }
    this.charge = { who: c.id, action: q.action, started: this.time, source, direction: { ...this.aim } };
    this.onSound('charge'); return true;
  }
  get power() { return this.charge ? clamp((this.time - this.charge.started) / C.chargeMs, 0, 1) : 0; }
  releaseCharge(source: string) {
    const charge = this.charge;
    if (!charge || source !== charge.source) return false;
    const power = this.power; this.charge = null;
    if (this.paused || this.status !== 'playing' || charge.who !== this.selected) return false;
    const c = this.actors[charge.who], q = this.qualification(c.id);
    if (q.action !== charge.action) { this.tell('支撑已改变，本次蓄力取消'); return false; }
    if (this.time - c.lastAction < C.actionCooldown) return false;
    let direction = charge.direction;
    const smooth = power * power * (3 - 2 * power);
    if (charge.action === 'jump') {
      // Always a useful upward jump; horizontal drag sets the forward intent.
      direction = unit({ x: clamp(direction.x, -0.85, 0.85), y: Math.min(-0.48, direction.y) });
      this.p.impulse(c.body, mul(direction, c.body.mass * (C.jumpMin + (C.jumpMax - C.jumpMin) * smooth)));
      c.jumpLock = this.time + 180; c.groundedMs = 0;
    } else {
      const anchors = this.grips.graph(c.id).anchors;
      // Nearest actual support, never rotate a group around an invented centre.
      const anchor = [...anchors].sort((a, b) => distance(c.body.position, a) - distance(c.body.position, b) || a.id.localeCompare(b.id))[0];
      const radial = unit(sub(c.body.position, anchor));
      direction = unit({ x: radial.y, y: -radial.x });
      const intent = Math.sign(charge.direction.x) || c.facing;
      if (direction.x * intent < 0) direction = mul(direction, -1);
      const conservative = anchors.length > 1 ? 0.5 : 1;
      this.p.impulse(c.body, mul(direction, c.body.mass * (C.swingMin + (C.swingMax - C.swingMin) * smooth) * conservative));
    }
    c.lastAction = this.time;
    this.actions.push({ who: c.id, type: charge.action, power, time: this.time });
    this.tell(charge.action === 'jump' ? '起跳！牵着的队友会增加负载' : '摆起来！到合适时机再松手', charge.action);
    return true;
  }
  releaseHand(side: Side) {
    if (this.paused || this.status !== 'playing') return;
    this.grips.release(this.actors[this.selected].hands[side], this.time);
    if (this.charge && this.qualification(this.charge.who).action !== this.charge.action) this.cancel('支点松开，蓄力取消');
  }
  advance(delta: number) {
    if (this.paused || this.status !== 'playing') { this.accumulator = 0; return; }
    if (!Number.isFinite(delta) || delta < 0 || delta > C.maxFrame) { this.accumulator = 0; this.cancel('画面中断，蓄力取消'); return; }
    this.accumulator += delta;
    while (this.accumulator + 1e-7 >= C.step && this.status === 'playing') { this.tick(); this.accumulator -= C.step; }
  }
  tick() {
    this.time += C.step;
    for (const c of this.actors) {
      for (const h of c.hands) h.previous = this.p.hand(h);
      const reach = c.hands.map(h => {
        if (h.grip || h.until > this.time) return null;
        const shoulder = this.p.shoulder(c, h.side), hand = this.p.hand(h);
        const target = this.level.anchors.filter(a => !this.grips.occupied.has(a.id) && !h.blocked.has(a.id) && distance(shoulder, a) < C.armLength + 18 && distance(hand, a) < 42 && this.grips.clearPath(shoulder, a))
          .sort((a, b) => distance(hand, a) - distance(hand, b) || a.id.localeCompare(b.id))[0];
        return target ? sub(target, shoulder) : null;
      });
      this.p.posture(c, c.id === this.selected && this.charge ? this.aim : null, reach);
      if (!this.charge && this.move?.who === c.id && this.selected === c.id && c.groundedMs >= C.supportMs && Math.abs(c.body.velocity.x) < C.walkSpeed) this.p.force(c.body, { x: this.move.direction * C.walkForce * c.body.mass, y: 0 });
    }
    this.p.step();
    const supportBodies = [...this.solids, ...this.actors.map(a => a.body)];
    for (const c of this.actors) {
      this.p.support(c, supportBodies, this.time);
      for (const body of [c.body, ...c.arms]) {
        if (![body.position.x, body.position.y, body.velocity.x, body.velocity.y, body.angle].every(Number.isFinite)) { this.fault('非有限刚体状态'); return; }
        if (body.speed > C.maxSpeed) this.p.M.Body.setVelocity(body, mul(unit(body.velocity), C.maxSpeed));
        if (Math.abs(body.angularVelocity) > C.maxAngular) this.p.M.Body.setAngularVelocity(body, clamp(body.angularVelocity, -C.maxAngular, C.maxAngular));
      }
      for (const h of c.hands) if (distance(this.p.hand(h), this.p.shoulder(c, h.side)) > C.armLength + 35) { this.fault('手臂约束异常'); return; }
    }
    this.grips.update(this.time, this.selected, this.aim);
    for (const g of this.grips.connections.values()) {
      if (distance(this.p.hand(g.a), g.b ? this.p.hand(g.b) : g.anchor!) > 65) { this.fault('抓握约束异常'); return; }
    }
    if (this.charge && this.qualification(this.charge.who).action !== this.charge.action) this.cancel('支撑已改变，本次蓄力取消');
    this.progress();
  }
  safe(c: Character, z: Zone) {
    const { x, y } = c.body.position;
    return x > z.x && x < z.x + z.w && y > z.y && y < z.y + z.h && c.groundedMs >= C.supportMs && c.body.speed < C.safeSpeed;
  }
  progress() {
    for (const c of this.actors) {
      const { x, y } = c.body.position;
      if (y > this.level.deathY || x < this.level.bounds.x - 100 || x > this.level.bounds.x + this.level.bounds.w + 100 || this.level.hazards.some(z => x > z.x && x < z.x + z.w && y > z.y && y < z.y + z.h)) {
        this.status = 'failed'; this.cancel(); this.move = null; this.tell(`${c.id + 1}号落出了安全范围`, 'fail'); return;
      }
    }
    const cp = this.level.checkpoint;
    if (cp && !this.checkpoint) {
      this.checkpointHold = this.actors.every(c => this.safe(c, cp.zone)) ? this.checkpointHold + C.step : 0;
      if (this.checkpointHold >= C.safeMs) { this.checkpoint = true; this.tell('全员集合！检查点已点亮', 'checkpoint'); }
    }
    this.winHold = this.actors.every(c => this.safe(c, this.level.goal)) ? this.winHold + C.step : 0;
    if (this.winHold >= C.safeMs) { this.status = 'won'; this.cancel(); this.move = null; this.tell('三个人，一个都不能少。全员到达！', 'win'); }
  }
  fault(reason: string) {
    this.numericalErrors++; console.error(`[physics] ${reason}`, this.snapshot());
    this.reset(); this.pause(true); this.tell(`物理异常已重置：${reason}。请重新开始。`);
  }
  snapshot() {
    return { level: this.level.id, selected: this.selected, time: this.time, status: this.status, paused: this.paused, checkpoint: this.checkpoint, charge: this.charge ? { ...this.charge, power: this.power } : null,
      message: this.message, actors: this.actors.map(c => ({ id: c.id, x: c.body.position.x, y: c.body.position.y, vx: c.body.velocity.x, vy: c.body.velocity.y, angle: c.body.angle, grounded: c.groundedMs >= C.supportMs,
        action: this.qualification(c.id).action, hands: c.hands.map(h => ({ position: this.p.hand(h), target: this.grips.label(h), grip: h.grip, cooldown: Math.max(0, h.until - this.time), rejection: h.rejection })), safe: this.safe(c, this.level.goal) })),
      grips: [...this.grips.connections.values()].map(g => ({ id: g.id, a: g.a.id, b: g.b?.id, anchor: g.anchor?.id })), counts: this.p.counts(), actions: [...this.actions], events: [...this.events], numericalErrors: this.numericalErrors };
  }
}
