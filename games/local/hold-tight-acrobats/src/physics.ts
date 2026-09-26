import type Phaser from 'phaser';
import { C, add, sub, rotate, mul, clamp, angleDiff, type Vec } from './config';
import type { Spawn, Platform } from './levels';
import type Matter from 'phaser/src/physics/matter-js/CustomMain.js';
export type MatterAPI = typeof Matter;
export type Body = MatterJS.BodyType;
export type Constraint = MatterJS.ConstraintType;
type RuntimeEngine = MatterJS.Engine & { gravity: { x: number; y: number; scale: number }; world: MatterJS.CompositeType };
export type Side = 0 | 1;
export type Hand = { id: string; who: number; side: Side; arm: Body; previous: Vec; grip: string | null; until: number; blocked: Map<string, { until: number; exited: boolean }>; candidate: string | null; rejection: string };
export type Character = { id: number; body: Body; arms: [Body, Body]; hands: [Hand, Hand]; shoulders: [Vec, Vec]; feet: [Body, Body]; groundedMs: number; contacts: Vec[]; balanceContact: boolean; jumpLock: number; facing: number; lastAction: number };
export class Physics {
  engine: RuntimeEngine;
  constructor(public M: MatterAPI, engine: MatterJS.Engine) {
    this.engine = engine as RuntimeEngine;
    this.engine.gravity.y = C.gravity;
    engine.positionIterations = 10; engine.velocityIterations = 8; engine.constraintIterations = 8;
  }
  add(items: Body | Constraint | (Body | Constraint)[]) { for (const item of Array.isArray(items) ? items : [items]) this.M.Composite.add(this.engine.world, item); }
  remove(item: Body | Constraint) { this.M.Composite.remove(this.engine.world, item, true); }
  clear() { this.M.Composite.clear(this.engine.world, false); this.M.Engine.clear(this.engine); }
  point(body: Body, local: Vec): Vec { return add(body.position, rotate(local, body.angle)); }
  hand(h: Hand): Vec { return this.point(h.arm, { x: C.armLength / 2, y: 0 }); }
  shoulder(c: Character, side: Side): Vec { return this.point(c.body, c.shoulders[side]); }
  constraint(options: MatterJS.IConstraintDefinition): Constraint {
    const joint = this.M.Constraint.create(options) as unknown as Constraint; this.add(joint); return joint;
  }
  makePlatform(p: Platform): Body {
    const body = this.M.Bodies.rectangle(p.x + p.w / 2, p.y + p.h / 2, p.w, p.h, { isStatic: true, angle: p.angle ?? 0, friction: C.groundFriction, label: p.id });
    this.add(body); return body;
  }
  character(id: number, spawn: Spawn): Character {
    const { Bodies, Body } = this.M;
    const x = spawn.x, y = spawn.y;
    const filter = { group: -(id + 1), category: 1, mask: 0xffffffff };
    const opts = { friction: C.bodyFriction, frictionAir: C.bodyAir, restitution: 0, collisionFilter: filter };
    const feet: [Body, Body] = [Bodies.circle(x - 8, y + 36, 6, opts), Bodies.circle(x + 8, y + 36, 6, opts)];
    // ponytail: fixed knees in a compound body; split legs only when a future level needs tucking.
    const parts = [Bodies.rectangle(x, y, 27, 30, { ...opts, chamfer: { radius: 6 } }), Bodies.circle(x, y - 23, 12, opts),
      Bodies.rectangle(x - 8, y + 23, 9, 24, opts), Bodies.rectangle(x + 8, y + 23, 9, 24, opts), ...feet];
    const body = Body.create({ parts, ...opts, label: `actor-${id}` }) as unknown as Body;
    const shift = sub(body.position, { x, y });
    const shoulders: [Vec, Vec] = [sub({ x: -16, y: -10 }, shift), sub({ x: 16, y: -10 }, shift)];
    // Spawn is the torso reference, not the compound centre of mass.
    Body.setMass(body, C.bodyMass);
    if (spawn.angle) Body.setAngle(body, spawn.angle);
    const arms = ([0, 1] as Side[]).map(side => {
      const angle = spawn.arms?.[side] ?? (side === 0 ? -1.8 : -1.34);
      const shoulder = this.point(body, shoulders[side]);
      const mid = add(shoulder, rotate({ x: C.armLength / 2, y: 0 }, angle));
      const arm = Bodies.rectangle(mid.x, mid.y, C.armLength, 9, { ...opts, angle, chamfer: { radius: 4 }, label: `arm-${id}-${side}`, frictionAir: C.armAir });
      Body.setMass(arm, C.armMass); this.add(arm);
      this.constraint({ bodyA: body, pointA: rotate(shoulders[side], body.angle), bodyB: arm, pointB: rotate({ x: -C.armLength / 2, y: 0 }, angle), length: 0, stiffness: C.jointStiffness, damping: C.damping });
      return arm;
    }) as [Body, Body];
    this.add(body);
    const hands = arms.map((arm, side) => ({ id: `h${id}-${side}`, who: id, side: side as Side, arm, previous: this.point(arm, { x: C.armLength / 2, y: 0 }), grip: null, until: 0, blocked: new Map(), candidate: null, rejection: '' })) as [Hand, Hand];
    return { id, body, feet, shoulders, arms, hands, groundedMs: 0, contacts: [], balanceContact: false, jumpLock: 0, facing: 1, lastAction: -1000 };
  }
  impulse(body: Body, impulse: Vec) {
    // Matter velocities use px / (1000/60 ms). J / m is a single delta-v, not a frame force.
    this.M.Body.setVelocity(body, add(body.velocity, mul(impulse, 1 / body.mass)));
  }
  force(body: Body, force: Vec) { this.M.Body.applyForce(body, body.position, force); }
  support(c: Character, solids: Body[], time: number) {
    c.contacts = [];
    c.balanceContact = solids.some(s => s.isStatic && c.body.position.y < s.position.y && this.M.Query.collides(c.body, [s]).some(hit => Math.abs(hit.normal.y) > 0.65));
    for (const foot of c.feet) {
      const r = rotate({ x: 0, y: 4 }, c.body.angle); const sole = add(foot.position, r);
      for (const solid of solids) {
        if (solid === c.body || solid.parent === c.body) continue;
        const collisions = this.M.Query.collides(foot, [solid]);
        // A real foot contact plus an upward-facing surface under that foot is required.
        if (collisions.length && Math.cos(c.body.angle) > 0.55 && c.body.velocity.y > -1.3) {
          const collision = collisions[0];
          const n = collision.normal;
          if (Math.abs(n.y) > 0.65 && foot.position.y < solid.position.y && this.M.Query.point([solid], { x: sole.x, y: sole.y + 5 }).length) c.contacts.push(sole);
        }
      }
    }
    c.groundedMs = c.contacts.length && time >= c.jumpLock ? c.groundedMs + C.step : 0;
  }
  posture(c: Character, aim: Vec | null, reach: (Vec | null)[] = []) {
    if (c.balanceContact || c.contacts.length) {
      // Ground reaction only: capped spring/damper torque, never overwrite angle or position.
      c.body.torque += clamp(-angleDiff(c.body.angle, 0) * C.standSpring - c.body.angularVelocity * C.standDamping, -C.standTorque, C.standTorque);
    }
    for (const h of c.hands) {
      if (h.grip) continue;
      const r = reach[h.side];
      const target = r ? Math.atan2(r.y, r.x) : aim ? Math.atan2(aim.y, aim.x) + (h.side === 0 ? -0.22 : 0.22) : h.side === 0 ? -1.8 : -1.34;
      const gravityCompensation = -C.gravity * 0.001 * h.arm.mass * C.armLength / 2 * Math.cos(h.arm.angle);
      const torque = clamp(angleDiff(target, h.arm.angle) * C.armSpring - h.arm.angularVelocity * C.armDamping + gravityCompensation, -C.armTorque, C.armTorque);
      h.arm.torque += torque; c.body.torque -= torque; // internal motor, zero net angular impulse
    }
  }
  step() { this.M.Engine.update(this.engine, C.step); }
  counts() { return { bodies: this.M.Composite.allBodies(this.engine.world).length, constraints: this.M.Composite.allConstraints(this.engine.world).length }; }
}
