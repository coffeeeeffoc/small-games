import { defaultTrialBalance, type TrialBalance } from '../content/schema.js';
import { createWorld, direction, distance } from './world.js';
import { tickCombat } from './combat.js';
import { enterScene, movePlayer, nearby } from './actions.js';
import { cue, playing, type Trial } from './trial-types.js';
export * from './trial-types.js';
export * from './actions.js';

export function createTrial(balance: TrialBalance = defaultTrialBalance): Trial {
  return {
    phase: 'ready',
    scene: 'cave',
    balance: { ...balance },
    elapsed: 0,
    trialTime: 0,
    player: { x: 205, y: 410 },
    facing: { x: 0, y: -1 },
    move: { x: 0, y: 0 },
    aim: null,
    health: balance.health,
    qi: balance.startingQi,
    charge: null,
    breathing: null,
    breathCooldown: 0,
    dodge: 0,
    dodgeCooldown: 0,
    invulnerable: 0,
    attackCooldown: 0,
    shield: 0,
    ...createWorld('cave'),
    forest: null,
    swords: [],
    lightning: [],
    wave: 0,
    cycle: 0,
    exposed: 0,
    tree: null,
    relics: [],
    collected: [],
    pending: null,
    fox: 'caged',
    foxPosition: { x: 95, y: 295 },
    cues: [],
    sequence: 0,
    message: '一炷香，一场自己的修行。',
    messageTime: 4,
    journal: [],
    kills: 0,
    hits: 0,
    steps: 0,
    woodUsed: false,
  };
}
function step(s: Trial, dt: number) {
  const previous = s.elapsed;
  s.elapsed += dt;
  const warning = s.balance.preparationSeconds - 20;
  if (s.phase === 'explore' && previous < warning && s.elapsed >= warning)
    cue(s, 'bell', s.player, '香将燃尽 · 二十息后接引渡劫，收气准备！');
  for (const key of [
    'dodge',
    'dodgeCooldown',
    'invulnerable',
    'attackCooldown',
    'shield',
    'breathCooldown',
    'messageTime',
    'exposed',
  ] as const)
    s[key] = Math.max(0, s[key] - dt);
  s.cues.forEach((c) => (c.life -= dt));
  s.cues = s.cues.filter((c) => c.life > 0);
  if (s.charge !== null) s.charge = Math.min(1.3, s.charge + dt);
  if (s.breathing !== null) {
    if (!nearby(s).spring || Math.hypot(s.move.x, s.move.y) > 0.1) s.breathing = null;
    else {
      s.breathing += dt;
      if (s.breathing >= s.balance.breathLimit) {
        s.breathing = null;
        s.breathCooldown = 0.7;
        cue(s, 'scatter', s.player, '气息散乱 · 这口未收稳，下次早些松开');
      }
    }
  }
  movePlayer(s, dt);
  if (s.fox === 'following') {
    const d = direction(s.foxPosition, s.player);
    if (distance(s.foxPosition, s.player) > 38) {
      s.foxPosition.x += d.x * dt * 170;
      s.foxPosition.y += d.y * dt * 170;
    }
  }
  if (s.phase === 'explore' && s.elapsed >= s.balance.preparationSeconds) enterScene(s, 'summit');
  tickCombat(s, dt);
}
/** Fixed substeps are shared by native, Web and deterministic gameplay checks. */
export function tickTrial(s: Trial, seconds: number) {
  if (!playing(s) || !Number.isFinite(seconds) || seconds <= 0) return;
  let remaining = Math.min(seconds, 0.1);
  while (remaining > 0.000001 && playing(s)) {
    const dt = Math.min(remaining, 1 / 60);
    step(s, dt);
    remaining -= dt;
  }
}
