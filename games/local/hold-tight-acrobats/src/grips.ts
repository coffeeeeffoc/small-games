import { C, add, sub, dot, unit, distance, segmentDistance, rotate, type Vec } from './config';
import type { Anchor, InitialGrip } from './levels';
import { Physics, type Body, type Character, type Constraint, type Hand, type Side } from './physics';
export type Grip = { id: string; a: Hand; b?: Hand; anchor?: Anchor; joint: Constraint };
export type Target = { id: string; point: Vec; previous: Vec; hand?: Hand; anchor?: Anchor };
export class Grips {
  connections = new Map<string, Grip>();
  occupied = new Map<string, string>();
  serial = 0;
  constructor(public p: Physics, public actors: Character[], public anchors: Anchor[], public solids: Body[], public feedback: (text: string, sound: string) => void) {}
  target(h: Hand): Target { return { id: h.id, point: this.p.hand(h), previous: h.previous, hand: h }; }
  targets(h: Hand): Target[] {
    return [
      ...this.anchors.map(anchor => ({ id: anchor.id, point: anchor, previous: anchor, anchor })),
      ...this.actors.filter(a => a.id !== h.who).flatMap(a => a.hands.map(hand => this.target(hand))),
    ];
  }
  clearPath(from: Vec, to: Vec) {
    const delta = sub(to, from);
    const a = add(from, { x: delta.x * 0.04, y: delta.y * 0.04 });
    const b = add(from, { x: delta.x * 0.96, y: delta.y * 0.96 });
    return this.p.M.Query.ray(this.solids, a, b, 2).length === 0;
  }
  legal(h: Hand, t: Target, now: number, swept = true): string {
    if (h.grip || t.hand?.grip || this.occupied.has(t.id)) return '抓握槽已占用';
    if (t.hand?.who === h.who) return '不能抓自己';
    if (h.until > now || (t.hand && t.hand.until > now)) return '松手冷却';
    const blocked = h.blocked.get(t.id), reverse = t.hand?.blocked.get(h.id);
    if ((blocked && (blocked.until > now || !blocked.exited)) || (reverse && (reverse.until > now || !reverse.exited))) return '先离开旧抓点';
    const hand = this.p.hand(h), shoulder = this.p.shoulder(this.actors[h.who], h.side);
    if (distance(shoulder, t.point) > C.armLength + C.armSlack) return '超过臂展';
    const near = distance(hand, t.point) <= C.gripRadius;
    const sweep = swept && segmentDistance({ x: 0, y: 0 }, sub(h.previous, t.previous), sub(hand, t.point)) <= C.gripRadius;
    if (!near && !sweep) return '手端未进入范围';
    if (!this.clearPath(shoulder, t.point) || !this.clearPath(hand, t.point) || (sweep && !this.clearPath(h.previous, hand))) return '实体遮挡';
    // Limit the creation gap even for swept catches; never tighten a long invisible rope.
    if (distance(hand, t.point) > C.gripRadius + 7) return '经过但已离开';
    return '';
  }
  attach(h: Hand, t: Target, now: number): Grip | null {
    if (this.legal(h, t, now)) return null;
    const point = rotate({ x: C.armLength / 2, y: 0 }, h.arm.angle);
    const joint = this.p.constraint({ bodyA: h.arm, pointA: point,
      bodyB: t.hand?.arm, pointB: t.hand ? rotate({ x: C.armLength / 2, y: 0 }, t.hand.arm.angle) : { x: t.point.x, y: t.point.y },
      length: 2, stiffness: C.gripStiffness, damping: C.damping });
    const grip: Grip = { id: `grip-${++this.serial}`, a: h, b: t.hand, anchor: t.anchor, joint };
    this.connections.set(grip.id, grip); h.grip = grip.id;
    if (t.hand) t.hand.grip = grip.id;
    this.occupied.set(h.id, grip.id); this.occupied.set(t.id, grip.id);
    this.feedback(`${h.who + 1}号${h.side === 0 ? '左' : '右'}手抓牢 · ${t.anchor?.name ?? `队员 ${t.hand!.who + 1}`}`, 'grip');
    return grip;
  }
  initialize(initial: InitialGrip[]) {
    for (const g of initial) {
      const h = this.actors[g.who].hands[g.side];
      const anchor = this.anchors.find(a => a.id === g.anchor);
      const t = anchor ? { id: anchor.id, point: anchor, previous: anchor, anchor } : this.target(this.actors[g.other!].hands[g.otherSide!]);
      if (!this.attach(h, t, 0)) throw new Error(`非法出生抓握: ${h.id} -> ${t.id}: ${this.legal(h, t, 0)}`);
    }
  }
  release(h: Hand, now: number) {
    const grip = h.grip ? this.connections.get(h.grip) : null;
    if (!grip) { this.feedback('这只手已经空闲', ''); return; }
    const otherId = (hand: Hand) => grip.anchor?.id ?? (grip.a === hand ? grip.b!.id : grip.a.id);
    for (const hand of [grip.a, grip.b].filter((x): x is Hand => !!x)) {
      hand.grip = null; hand.until = now + C.releaseMs;
      hand.blocked.set(otherId(hand), { until: now + C.regrabMs, exited: false });
      this.occupied.delete(hand.id);
    }
    if (grip.anchor) this.occupied.delete(grip.anchor.id);
    this.p.remove(grip.joint); this.connections.delete(grip.id);
    this.feedback(`${h.who + 1}号${h.side === 0 ? '左' : '右'}手已松开`, 'release');
  }
  update(now: number, selected: number, aim: Vec) {
    for (const actor of this.actors) for (const h of actor.hands) {
      const targets = this.targets(h); const hand = this.p.hand(h); h.candidate = null;
      for (const [id, block] of h.blocked) {
        const target = targets.find(t => t.id === id);
        if (!target || distance(hand, target.point) > C.hysteresis) block.exited = true;
        if (block.exited && now >= block.until) h.blocked.delete(id);
      }
      if (h.grip) continue;
      const direction = selected === actor.id ? aim : { x: actor.facing * 0.65, y: -0.76 };
      const sorted = targets.map(t => ({ t, score: distance(hand, t.point) - dot(unit(sub(t.point, this.p.shoulder(actor, h.side))), direction) * C.directionPriority - (t.anchor ? C.scenePriority : 0) }))
        .sort((a, b) => a.score - b.score || a.t.id.localeCompare(b.t.id));
      h.rejection = '附近没有可抓点';
      for (const { t } of sorted) {
        const reason = this.legal(h, t, now);
        if (t === sorted[0]?.t) h.rejection = reason;
        if (distance(hand, t.point) < 35 && distance(this.p.shoulder(actor, h.side), t.point) < C.armLength + C.armSlack && this.clearPath(hand, t.point)) h.candidate ??= t.id;
        if (!reason) { this.attach(h, t, now); break; }
      }
    }
  }
  graph(who: number) {
    const members = new Set([who]); const anchors: Anchor[] = []; const path: Grip[] = [];
    const queue = [who];
    while (queue.length) {
      const id = queue.shift()!;
      for (const grip of this.connections.values()) {
        if (grip.a.who !== id && grip.b?.who !== id) continue;
        if (!path.includes(grip)) path.push(grip);
        if (grip.anchor && !anchors.includes(grip.anchor)) anchors.push(grip.anchor);
        const next = grip.b ? (grip.a.who === id ? grip.b.who : grip.a.who) : null;
        if (next !== null && !members.has(next)) { members.add(next); queue.push(next); }
      }
    }
    return { members, anchors, path };
  }
  label(h: Hand) {
    const g = h.grip ? this.connections.get(h.grip) : null;
    return g?.anchor?.name ?? (g?.b ? `队员 ${(g.a === h ? g.b.who : g.a.who) + 1}` : '空闲');
  }
}
