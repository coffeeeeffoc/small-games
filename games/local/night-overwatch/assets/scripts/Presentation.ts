import { Simulation } from './core/Simulation.ts';

const blend = (from: number, to: number, amount: number) => from + (to - from) * amount;
const angle = (from: number, to: number, amount: number, turn = Math.PI * 2) =>
  from + (((to - from + turn * 1.5) % turn) - turn / 2) * amount;

/** Presentation only: no prediction of damage, ammunition, collisions or match results. */
export class DuelPresentation {
  private rendered?: Simulation;
  private sourceTime = 0;
  private sourceAircraft?: Simulation['aircraft'];
  private sourceUnits = new Map<number, { x: number; z: number; heading: number }>();
  private received = 0;
  private duration = 100;
  push(authority: Simulation, now: number) {
    const previous = this.rendered;
    this.sourceTime = previous?.time ?? authority.time;
    this.sourceAircraft = { ...(previous?.aircraft ?? authority.aircraft) };
    this.sourceUnits.clear();
    for (const unit of previous?.units ?? authority.units) this.sourceUnits.set(unit.id, { x: unit.x, z: unit.z, heading: unit.heading });
    this.duration = Math.min(250, Math.max(50, (authority.time - this.sourceTime) * 1000));
    this.received = now;
    this.rendered = Simulation.restore(authority.checkpoint());
  }
  sample(authority: Simulation, now: number) {
    const rendered = this.rendered, aircraft = this.sourceAircraft;
    if (!rendered || !aircraft || authority.phase !== 'playing') return authority;
    const amount = Math.max(0, Math.min(1, (now - this.received) / this.duration));
    rendered.time = blend(this.sourceTime, authority.time, amount);
    rendered.phase = authority.phase;
    rendered.pauses = authority.pauses;
    rendered.aim = { ...authority.aim };
    rendered.selected = authority.selected;
    rendered.guns = authority.guns;
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
