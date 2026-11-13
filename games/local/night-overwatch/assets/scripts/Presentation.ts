import { Simulation, type BattleEvent, type Shot } from './core/Simulation.ts';

const blend = (from: number, to: number, amount: number) => from + (to - from) * amount;
const angle = (from: number, to: number, amount: number, turn = Math.PI * 2) =>
  from + (((to - from + turn * 1.5) % turn) - turn / 2) * amount;

const PROJECTILE_DELAY = .1; // Keep a poll interval available for impact and trajectory updates.
const GUIDANCE_LEAD = .12;
export type PresentedImpact = BattleEvent & { shownAt?: number };
export type PresentedSimulation = Simulation & { projectileTime?: number; events: PresentedImpact[] };

/** Presentation only: no prediction of damage, ammunition, collisions or match results. */
export class DuelPresentation {
  private rendered?: PresentedSimulation;
  private sourceTime = 0;
  private sourceAircraft?: Simulation['aircraft'];
  private sourceUnits = new Map<number, { x: number; z: number; heading: number }>();
  private received = 0;
  private duration = 100;
  private snapshotTime = 0;
  private projectileStart = 0;
  private projectileRate = 1;
  private activeShots: Shot[] = [];
  private closingShots: Shot[] = [];

  private projectileTime(now: number) {
    return this.projectileStart + Math.max(0, now - this.received) / 1000 * this.projectileRate;
  }

  push(authority: Simulation, now: number) {
    const previous = this.rendered;
    this.sourceTime = previous?.time ?? authority.time;
    this.sourceAircraft = { ...(previous?.aircraft ?? authority.aircraft) };
    this.sourceUnits.clear();
    for (const unit of previous?.units ?? authority.units) this.sourceUnits.set(unit.id, { x: unit.x, z: unit.z, heading: unit.heading });
    this.duration = Math.min(250, Math.max(50, (authority.time - this.sourceTime) * 1000));
    const targetTime = authority.time - PROJECTILE_DELAY;
    this.projectileStart = this.snapshotTime > 0 ? this.projectileTime(now) : targetTime;
    this.projectileRate = Math.max(.8, Math.min(1.2, 1 + (targetTime - this.projectileStart) * 2));
    this.received = now;
    const rendered: PresentedSimulation = Simulation.restore(authority.checkpoint());
    const shots = new Map(rendered.shots.map(shot => [shot.id, shot]));
    const impacts = new Map<number, PresentedImpact>();
    for (const event of rendered.events) {
      if (event.type === 'impact' && event.shot !== undefined) impacts.set(event.shot, event);
    }
    this.closingShots = this.closingShots.filter(shot => shot.due > this.projectileStart);
    for (const shot of this.activeShots) {
      const next = shots.get(shot.id);
      if (next?.born === shot.born) continue;
      const impact = impacts.get(shot.id);
      const due = next?.born ?? impact?.time ?? Math.min(shot.due, authority.time);
      if (due <= Math.max(shot.born, this.projectileStart)) continue;
      const end = next?.origin ?? (impact && { x: impact.x, y: impact.y ?? shot.targetY, z: impact.z });
      const closing = { ...shot, due };
      if (shot.guidance && end) {
        const trail = shot.guidance.trail.filter(p => p.time <= this.snapshotTime && p.time < due);
        trail.push({ ...end, time: due });
        closing.guidance = { ...shot.guidance, trail };
      }
      this.closingShots.push(closing);
    }
    const previousEvent = previous?.events.at(-1)?.id ?? Infinity;
    for (const impact of impacts.values()) {
      // Play a newly arrived impact from its first frame if its timestamp has already passed.
      if (impact.id > previousEvent && impact.time < this.projectileStart) impact.shownAt = this.projectileStart;
    }
    for (const shot of rendered.shots) {
      const trail = shot.guidance?.trail, last = trail?.at(-1);
      if (!trail || !last || trail.length < 2) continue;
      const lead = Math.min(GUIDANCE_LEAD, shot.due - last.time);
      if (lead > 0) trail.push({
        x: last.x + shot.velocity.x * lead, y: last.y + shot.velocity.y * lead,
        z: last.z + shot.velocity.z * lead, time: last.time + lead,
      });
    }
    this.activeShots = rendered.shots;
    rendered.shots = [...this.closingShots, ...this.activeShots];
    this.snapshotTime = authority.time;
    this.rendered = rendered;
  }
  sample(authority: Simulation, now: number): PresentedSimulation {
    const rendered = this.rendered, aircraft = this.sourceAircraft;
    if (!rendered || !aircraft || authority.phase !== 'playing') return authority;
    const amount = Math.max(0, Math.min(1, (now - this.received) / this.duration));
    rendered.time = blend(this.sourceTime, authority.time, amount);
    rendered.projectileTime = this.snapshotTime > 0 ? this.projectileTime(now) : this.projectileStart;
    rendered.phase = authority.phase;
    rendered.pauses = authority.pauses;
    rendered.aim = { ...authority.aim };
    rendered.selected = authority.selected;
    rendered.guns = authority.guns;
    rendered.skill={...authority.skill};
    rendered.loadout=authority.loadout;rendered.drones=authority.drones;rendered.lasers=authority.lasers;rendered.buff=authority.buff;
    for (const key of ['x', 'y', 'z', 'pitch', 'bank', 'radius', 'altitude'] as const)
      rendered.aircraft[key] = blend(aircraft[key], authority.aircraft[key], amount);
    rendered.aircraft.yaw = angle(aircraft.yaw, authority.aircraft.yaw, amount);
    rendered.aircraft.heading = angle(aircraft.heading, authority.aircraft.heading, amount, 360);
    for (let i = 0; i < rendered.units.length; i++) {
      const unit = rendered.units[i], target = authority.units[i], from = this.sourceUnits.get(unit.id);
      if (!from || !target || target.id !== unit.id) continue;
      unit.x = blend(from.x, target.x, amount); unit.z = blend(from.z, target.z, amount);
      unit.heading = angle(from.heading, target.heading, amount);
    }
    return rendered;
  }
}
