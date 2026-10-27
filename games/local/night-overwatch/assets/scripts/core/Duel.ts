import { Simulation } from './Simulation.ts';
import { WEAPONS, patrolPoint, type Point } from './Data.ts';
import { MISSIONS } from './MissionCatalog.ts';

export const DUEL_VERSION = 'night-duel-v2';
// Retained for older presentation callers; authority has no match time limit.
export const DUEL_SECONDS = 0;
type Pilot = ReturnType<Simulation['pilotState']> & { leaseUntil: number };
export type DuelCommand = { command: string; args: unknown[] };
export type DuelState = { simulation: ReturnType<Simulation['checkpoint']>; pilots: Pilot[]; ticks: number;
  seed: number; bot: boolean; winner: number | null; finished: boolean; bots: boolean[]; botAt: number[] };
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const check = (value: unknown) => { if (!value) throw Error('Invalid duel input'); };

export function createDuel(seed: number, bot = false): DuelState {
  check(Number.isSafeInteger(seed) && seed >= 0 && seed <= 0x7fffffff);
  const map = seed % 2 ? 'highland' : 'valley';
  const sim = new Simulation(MISSIONS.find(mission => mission.map === map)!.id);
  sim.duelMode = true; sim.phase = 'playing'; sim.units = []; sim.spawned = new Set(sim.mission.events.map((_, i) => i));
  sim.convoy = 'holding'; sim.progress = 0;
  let random = seed || 1;
  const next = () => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random / 4294967296; };
  const formation = Array.from({ length: 8 }, (_, i) => ({ x: 48 + (i % 3) * 22 + next() * 8, z: -57 + Math.floor(i / 3) * 38 + next() * 8 }));
  for (const side of [0, 1]) for (let i = 0; i < formation.length; i++) {
    const sign = side === 0 ? -1 : 1;
    const unit = sim.addUnit(i < 4 ? 'light' : i < 6 ? 'turret' : 'heavy', { x: formation[i].x * sign, z: formation[i].z * sign }, side === 0);
    unit.group = side;
  }
  const first = copy({ ...sim.pilotState(), leaseUntil: 0 }), second = copy(first);
  second.flight.aircraft.x *= -1; second.flight.aircraft.z *= -1;
  second.flight.aircraft.yaw += Math.PI; second.flight.aircraft.heading = (second.flight.aircraft.heading + 180) % 360;
  first.aim = { ...formation[0] }; second.aim = { x: -formation[0].x, z: -formation[0].z };
  return { simulation: sim.checkpoint(), pilots: [first, second], ticks: 0, seed, bot, winner: null, finished: false, bots: [false, bot], botAt: [6, 6] };
}
function applyControl(sim: Simulation, input: DuelCommand) {
  check(input && typeof input === 'object' && Object.keys(input).length === 2 && Array.isArray(input.args));
  const a = input.args;
  switch (input.command) {
    case 'setAim': {
      const p = a[0] as Point;
      check(a.length === 1 && p && Object.keys(p).length === 2 && Number.isFinite(p.x) && Number.isFinite(p.z) && Math.abs(p.x) <= 10000 && Math.abs(p.z) <= 10000);
      sim.setAim(p); break;
    }
    case 'choose': check(a.length === 1 && Number.isInteger(a[0]) && Number(a[0]) >= 0 && Number(a[0]) < WEAPONS.length); sim.choose(Number(a[0])); break;
    case 'setFire':
      check(a.length === 2 && typeof a[0] === 'string' && a[0].length > 0 && a[0].length <= 80 && typeof a[1] === 'boolean');
      check(!a[1] || sim.held.has(a[0] as string) || sim.held.size < 10);
      sim.setFire(a[0] as string, a[1] as boolean); break;
    case 'fire': check(a.length === 0); sim.fire(); break;
    case 'clearInput': check(a.length === 0); sim.clearInput(); break;
    case 'adjustAltitude': case 'adjustRadius':
      check(a.length === 1 && (a[0] === -20 || a[0] === 20)); sim[input.command](a[0] as number); break;
    case 'setOrbitDirection': check(a.length === 1 && (a[0] === -1 || a[0] === 1)); sim.setOrbitDirection(a[0] as -1 | 1); break;
    default: throw Error('Unsupported duel command');
  }
}
export function commandDuel(state: DuelState, seat: number, commands: DuelCommand[]) {
  check((seat === 0 || seat === 1) && !state.bots[seat] && !state.finished && Array.isArray(commands) && commands.length <= 64);
  const sim = Simulation.restore(state.simulation), pilot = state.pilots[seat];
  sim.usePilot(pilot, seat);
  for (const command of commands) applyControl(sim, command);
  state.pilots[seat] = copy({ ...sim.pilotState(), leaseUntil: sim.time + 1 });
  sim.usePilot(state.pilots[0], 0); state.simulation = sim.checkpoint();
  return state;
}
export function takeoverDuel(state: DuelState, seat: number) {
  check(seat === 0 || seat === 1);
  state.bots[seat] = true;
  state.pilots[seat].held = [];
  return state;
}
function botControl(state: DuelState, sim: Simulation, side: number) {
  if (sim.time < state.botAt[side]) return;
  state.botAt[side] = sim.time + 8;
  const targets = sim.units.filter(unit => unit.group !== side && unit.hp > 0);
  const enemy = targets[Math.floor(sim.time / 20) % targets.length];
  if (!enemy) return;
  sim.choose(enemy.kind !== 'turret' && sim.guns[2].ammo > 0 ? 2 : 1);
  // A single rough lead deliberately underestimates flight; never solve the exact intercept.
  const flight = sim.flightTime(sim.selected, enemy);
  const aim = enemy.kind === 'light' && Number.isFinite(flight)
    ? patrolPoint(enemy.origin, (enemy.patrolElapsed ?? 0) + flight * .7, sim.mission.map) : enemy;
  const spread = 4;
  sim.setAim({ x: aim.x + Math.sin(sim.time * 2 + state.seed) * spread,
    z: aim.z + Math.cos(sim.time * 1.7 + side) * spread });
  if (!sim.friendlyRisk) sim.fire();
}
export function advanceDuel(state: DuelState, elapsedMs: number): DuelState {
  check(Number.isFinite(elapsedMs) && elapsedMs >= 0);
  if (state.finished) return state;
  const target = Math.floor(elapsedMs * 60 / 1000);
  check(target >= state.ticks);
  const sim = Simulation.restore(state.simulation);
  while (state.ticks < target && !state.finished) {
    for (const side of [0, 1]) {
      const pilot = state.pilots[side]; sim.usePilot(pilot, side);
      if (sim.time >= pilot.leaseUntil) sim.clearInput();
      sim.stepPilot(1 / 60);
      if (state.bots[side]) botControl(state, sim, side);
      state.pilots[side] = copy({ ...sim.pilotState(), leaseUntil: pilot.leaseUntil });
    }
    sim.usePilot(state.pilots[0], 0); sim.step(1 / 60); state.ticks++;
    const alive = [0, 1].map(side => sim.units.some(unit => unit.group === side && unit.hp > 0));
    if (!alive[0] || !alive[1]) {
      state.finished = true; state.winner = alive[0] === alive[1] ? null : alive[0] ? 0 : 1;
    }
  }
  state.simulation = sim.checkpoint();
  return state;
}
export function viewDuel(state: DuelState, seat = 0) {
  check(seat === 0 || seat === 1);
  const sim = Simulation.restore(state.simulation); sim.usePilot(state.pilots[seat], seat);
  for (const event of sim.events) if (event.friendly !== undefined && event.side !== undefined) event.friendly = event.side === seat;
  if (state.finished) sim.phase = state.winner === seat ? 'success' : 'failure';
  return { simulation: sim.checkpoint(), seed: state.seed, bot: state.bot, bots: [...state.bots], finished: state.finished,
    winner: state.winner, you: seat, enemyAircraft: copy(state.pilots[1 - seat].flight.aircraft),
    elapsed: sim.time, remaining: 0 };
}
