import type { TrialBalance } from '../content/schema.js';
import type { Enemy, Obstacle, Point, Relic, Scene } from './world.js';
export type Cue = Point & {
  id: number;
  kind:
    | 'sword'
    | 'hit'
    | 'stone'
    | 'hurt'
    | 'dodge'
    | 'qi'
    | 'scatter'
    | 'bell'
    | 'thunder'
    | 'fox'
    | 'win'
    | 'lose'
    | 'step';
  life: number;
  text: string;
};
export type Sword = Point & {
  previous: Point;
  velocity: Point;
  age: number;
  damage: number;
  strong: boolean;
  returning: boolean;
  hits: string[];
};
export type Trial = {
  phase: 'ready' | 'explore' | 'tribulation' | 'won' | 'lost';
  scene: Scene;
  balance: TrialBalance;
  elapsed: number;
  trialTime: number;
  player: Point;
  facing: Point;
  move: Point;
  aim: Point | null;
  health: number;
  qi: number;
  charge: number | null;
  breathing: number | null;
  breathCooldown: number;
  dodge: number;
  dodgeCooldown: number;
  invulnerable: number;
  attackCooldown: number;
  shield: number;
  enemies: Enemy[];
  obstacles: Obstacle[];
  forest: { enemies: Enemy[]; obstacles: Obstacle[] } | null;
  swords: Sword[];
  lightning: (Point & { timer: number; life: number; radius: number; struck: boolean })[];
  wave: number;
  cycle: number;
  exposed: number;
  tree: (Point & { life: number }) | null;
  relics: Relic[];
  collected: Relic[];
  pending: Relic | null;
  fox: 'caged' | 'following' | 'spent';
  foxPosition: Point;
  cues: Cue[];
  sequence: number;
  message: string;
  messageTime: number;
  journal: string[];
  kills: number;
  hits: number;
  steps: number;
  woodUsed: boolean;
};
export const playing = (s: Trial) =>
  (s.phase === 'explore' || s.phase === 'tribulation') && !s.pending;
export function cue(s: Trial, kind: Cue['kind'], point = s.player, text = '') {
  s.cues.push({ ...point, kind, text, id: ++s.sequence, life: kind === 'thunder' ? 0.45 : 0.7 });
  if (s.cues.length > 48) s.cues.shift();
  if (text) {
    s.message = text;
    s.messageTime = 3;
  }
}
export function remember(s: Trial, text: string) {
  if (!s.journal.includes(text)) s.journal.push(text);
}
export function cancelTrialInput(s: Trial) {
  s.move = { x: 0, y: 0 };
  s.charge = null;
  s.breathing = null;
  s.aim = null;
}
export function finishTrial(s: Trial, won: boolean, reason: string) {
  s.phase = won ? 'won' : 'lost';
  cancelTrialInput(s);
  cue(s, won ? 'win' : 'lose', s.player, reason);
}
export function hurt(s: Trial, damage: number, cause: string) {
  if (s.invulnerable > 0 || !playing(s)) return;
  if (s.shield > 0 && s.qi >= 12) {
    s.qi -= 12;
    cue(s, 'stone', s.player, '护盾挡下一击');
    remember(s, '以真气护住心脉');
    return;
  }
  if (s.fox === 'following' && cause === '落雷') {
    s.fox = 'spent';
    cue(s, 'fox', s.player, '小狐狸替你挡住落雷，退到了石台边。');
    remember(s, '灵狐为你挡下一道雷');
    return;
  }
  s.health = Math.max(0, s.health - damage);
  s.shield = 0;
  s.invulnerable = 0.65;
  s.charge = null;
  s.breathing = null;
  cue(s, 'hurt', s.player, `${cause}伤及经脉 · 先看前兆再出手`);
  if (s.health <= 0) finishTrial(s, false, `${cause}击穿了最后一道防线。`);
}
export const trialScore = (s: Trial) =>
  Math.floor(
    s.kills * 25 +
      s.wave * 100 +
      s.collected.length * 30 +
      (s.phase === 'won'
        ? 200 + s.health + Math.max(0, s.balance.tribulationSeconds - s.trialTime)
        : 0),
  );
