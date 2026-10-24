import { Simulation, type PauseReason } from './Simulation.ts';
import { WEAPONS } from './Data.ts';
import { MISSIONS, TRAINING } from './MissionCatalog.ts';

export const RANKED_RULE_VERSION = 'night-input-replay-v4';
export type ReplayFrame = { input: Record<string, unknown>; ticks: number };
export type NightReplay = { simulation: ReturnType<Simulation['checkpoint']>; assisted: boolean };
const commands = ['setOrbitDirection', 'adjustAltitude', 'adjustRadius', 'pause',
  'beginResumeCountdown', 'stepCountdown', 'clearInput', 'choose', 'selectHoming',
  'lockHoming', 'setAim', 'setFire', 'command', 'fire', 'grantBuff', 'setExtractionRadioPending'] as const;
const pauseReasons: PauseReason[] = ['help', 'settings', 'mission', 'manual', 'orientation',
  'background', 'focus', 'advert', 'supply', 'countdown'];
function requireInput(ok: unknown): asserts ok {
  if (!ok) throw new Error('Invalid night input');
}
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function createNightReplay(board: string, levelId?: string): NightReplay {
  const mission = board === 'training' && levelId === undefined ? TRAINING
    : board === 'campaign' ? MISSIONS.find(item => item.id === levelId) : undefined;
  requireInput(mission);
  const sim = new Simulation(mission.id);
  sim.start();
  return { simulation: sim.checkpoint(), assisted: false };
}

function command(sim: Simulation, input: Record<string, unknown>, state: NightReplay) {
  requireInput(Object.keys(input).length === 2 && Object.hasOwn(input, 'command') && Object.hasOwn(input, 'args'));
  const args = input.args;
  requireInput(Array.isArray(args));
  const one = () => requireInput(args.length === 1);
  const none = () => requireInput(args.length === 0);
  switch (input.command) {
    case 'setOrbitDirection':
      one(); requireInput(args[0] === -1 || args[0] === 1); sim.setOrbitDirection(args[0]); break;
    case 'adjustAltitude':
    case 'adjustRadius':
      one(); requireInput(args[0] === -20 || args[0] === 20); sim[input.command](args[0]); break;
    case 'pause':
      requireInput(args.length === 2 && pauseReasons.includes(args[0]) && typeof args[1] === 'boolean');
      sim.pause(args[0], args[1]); break;
    case 'beginResumeCountdown': none(); sim.beginResumeCountdown(); break;
    case 'stepCountdown':
      one(); requireInput(finite(args[0]) && args[0] > 0 && args[0] <= .1); sim.stepCountdown(args[0]); break;
    case 'clearInput': none(); sim.clearInput(); break;
    case 'choose':
      one(); requireInput(Number.isInteger(args[0]) && args[0] >= 0 && args[0] < WEAPONS.length);
      sim.choose(args[0]); break;
    case 'selectHoming': none(); sim.selectHoming(); break;
    case 'lockHoming':
      one(); requireInput(Number.isSafeInteger(args[0]) && args[0] > 0 && args[0] <= 10000);
      sim.lockHoming(args[0]); break;
    case 'setAim': {
      one(); const point = args[0];
      requireInput(point && typeof point === 'object' && !Array.isArray(point) &&
        Object.keys(point).length === 2 && finite(point.x) && finite(point.z) &&
        Math.abs(point.x) <= 10000 && Math.abs(point.z) <= 10000);
      sim.setAim({ x: point.x, z: point.z }); break;
    }
    case 'setFire':
      requireInput(args.length === 2 && typeof args[0] === 'string' && args[0].length > 0 &&
        args[0].length <= 80 && typeof args[1] === 'boolean');
      requireInput(!args[1] || sim.held.has(args[0]) || sim.held.size < 10);
      sim.setFire(args[0], args[1]); break;
    case 'command': none(); sim.command(); break;
    case 'setExtractionRadioPending':
      one(); requireInput(typeof args[0] === 'boolean'); sim.setExtractionRadioPending(args[0]); break;
    case 'fire': none(); sim.fire(); break;
    case 'grantBuff':
      one(); requireInput(args[0] === 'tracking' || args[0] === 'rate');
      state.assisted = true; sim.grantBuff(args[0]); break;
    default: throw new Error('Unknown night input');
  }
}

export function applyNightReplay(state: NightReplay, frames: ReplayFrame[]): NightReplay {
  const sim = Simulation.restore(state.simulation);
  for (const { input, ticks } of frames) {
    requireInput(input && typeof input === 'object' && !Array.isArray(input) &&
      Number.isSafeInteger(ticks) && ticks >= 0 && ticks <= 2400 && ticks % 2 === 0);
    requireInput(sim.phase === 'playing');
    if (Object.keys(input).length) {
      requireInput(ticks === 0);
      command(sim, input, state);
    } else {
      requireInput(ticks > 0 && !sim.paused);
      for (let tick = 0; tick < ticks; tick += 2) {
        requireInput(sim.phase === 'playing');
        sim.step(1 / 60);
      }
    }
  }
  state.simulation = sim.checkpoint();
  return state;
}

export function nightReplayResult(state: NightReplay) {
  const sim = Simulation.restore(state.simulation);
  const complete = sim.phase === 'success' || sim.phase === 'failure';
  const training = sim.mission.mode === 'training';
  const eligible = complete && sim.phase === 'success' && !sim.threatsRemaining &&
    !sim.training && !state.assisted && (!training || !sim.friendlyDamage && !sim.friendlyLosses);
  return { complete, eligible,
    score: eligible ? training ? 1 : MISSIONS.findIndex(item => item.id === sim.mission.id) + 1 : 0,
    secondary: Math.round(sim.time * 1000) };
}

/** Observe public controls only; nested fire/clear calls remain owned by the simulation. */
export function observeNightInputs(sim: Simulation, record: (input: Record<string, unknown>, ticks: number) => void) {
  let depth = 0;
  for (const name of commands) {
    const original = sim[name];
    Object.defineProperty(sim, name, { configurable: true, writable: true, value: (...args: unknown[]) => {
      if (depth === 0) {
        const point = args[0] as { x: number; z: number };
        const values = name === 'setAim' ? [{ x: point.x, z: point.z }] : args;
        record({ command: name, args: JSON.parse(JSON.stringify(values)) }, 0);
      }
      depth++;
      try { return Reflect.apply(original, sim, args); } finally { depth--; }
    } });
  }
  const step = sim.step;
  Object.defineProperty(sim, 'step', { configurable: true, writable: true, value: (dt: number) => {
    if (depth === 0 && sim.phase === 'playing' && !sim.paused)
      record(dt === 1 / 60 ? {} : { invalidStep: true }, dt === 1 / 60 ? 2 : 0);
    depth++;
    try { return step.call(sim, dt); } finally { depth--; }
  } });
}
