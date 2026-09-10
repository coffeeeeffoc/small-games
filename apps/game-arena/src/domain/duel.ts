import type { Creature } from './model.js';

export type DuelInput = 'tease' | 'release' | 'dodge' | 'rest' | 'cancel';
export type Duel = {
  hp: number;
  enemyHp: number;
  maxHp: number;
  enemyMaxHp: number;
  stamina: number;
  charge: number;
  holding: boolean;
  resting: boolean;
  x: number;
  enemyX: number;
  time: number;
  cycle: number;
  windup: number;
  dodge: number;
  cooldown: number;
  impact: number;
  enemyImpact: number;
  hits: number;
  parries: number;
  combo: number;
  event: number;
  cue: 'start' | 'rustle' | 'hit' | 'hurt' | 'dodge' | 'win' | 'lose';
  message: string;
  winner: boolean | null;
  attack: number;
  enemyAttack: number;
  pace: number;
  chargeRate: number;
};

export function createDuel(creature: Creature, enemy: Creature, tier: number): Duel {
  return {
    hp: creature.hp,
    maxHp: creature.hp,
    enemyHp: enemy.hp,
    enemyMaxHp: enemy.hp,
    stamina: 100,
    charge: 0,
    holding: false,
    resting: false,
    x: 33,
    enemyX: 67,
    time: 0,
    cycle: 1.7,
    windup: 0,
    dodge: 0,
    cooldown: 0,
    impact: 0,
    enemyImpact: 0,
    hits: 0,
    parries: 0,
    combo: 0,
    event: 0,
    cue: 'start',
    message: '轻拨草梗，等它蓄势，再松手。',
    winner: null,
    attack: creature.attack,
    enemyAttack: enemy.attack,
    chargeRate: Math.max(0.6, Math.min(1.6, creature.speed)),
    pace: Math.max(1.2, 2.6 - tier * 0.24 - Math.min(0.3, enemy.speed * 0.1)),
  };
}

function announce(d: Duel, cue: Duel['cue'], message: string) {
  d.event += 1;
  d.cue = cue;
  d.message = message;
}

function finish(d: Duel): Duel {
  if (d.hp <= 0 || d.enemyHp <= 0 || d.time >= 60) {
    d.winner = d.hp > 0 && (d.enemyHp <= 0 || d.hp / d.maxHp > d.enemyHp / d.enemyMaxHp);
    d.holding = false;
    d.resting = false;
    announce(
      d,
      d.winner ? 'win' : 'lose',
      d.winner ? '对手退须！这一盆，你赢了。' : '收虫歇息。看准抬头，再闪身反击。',
    );
  }
  return d;
}

/** Input changes the same combat state used by the web and native versions. */
export function inputDuel(current: Duel, input: DuelInput): Duel {
  if (current.winner !== null) return current;
  const d = { ...current };
  if (input === 'cancel') {
    d.holding = false;
    d.resting = false;
    d.charge = 0;
    return d;
  }
  if (input === 'rest') {
    d.resting = true;
    d.holding = false;
    d.charge = 0;
    return d;
  }
  if (input === 'tease') {
    if (d.cooldown > 0 || d.stamina < 16 || d.holding) return current;
    d.holding = true;
    d.resting = false;
    announce(d, 'rustle', '草梗拨须 · 蓄到金色区松手');
  }
  if (input === 'release' && d.holding) {
    d.holding = false;
    const sweet = d.charge >= 0.55 && d.charge <= 1.05;
    const exhausted = d.stamina < 12;
    const reach = 17 + Math.min(1, d.charge) * 8;
    d.stamina = Math.max(0, d.stamina - 17);
    d.cooldown = 0.55;
    if (d.enemyX - d.x > reach || exhausted) {
      announce(d, 'rustle', exhausted ? '体力不足，收势回气！' : '扑空了！先拨草靠近，再出手。');
      d.combo = 0;
    } else {
      const damage = Math.max(
        1,
        Math.round(d.attack * (sweet ? 1.3 : 0.42) * (d.windup > 0 ? 1.15 : 1)),
      );
      d.enemyHp = Math.max(0, d.enemyHp - damage);
      d.enemyX = Math.min(76, d.enemyX + (sweet ? 9 : 4));
      d.impact = 0.35;
      d.hits += 1;
      d.combo = sweet ? d.combo + 1 : 0;
      announce(
        d,
        'hit',
        sweet ? `咬准了！−${damage} · ${d.combo} 连击` : `试探轻咬 −${damage} · 蓄势再久一点`,
      );
    }
    d.charge = 0;
  }
  if (input === 'dodge' && d.dodge <= 0 && d.cooldown <= 0 && d.stamina >= 20) {
    d.holding = false;
    d.resting = false;
    d.charge = 0;
    d.dodge = 0.48;
    d.cooldown = 0.62;
    d.stamina -= 20;
    d.x = Math.max(24, d.x - 5);
    announce(d, 'rustle', '侧身！闪避只持续半秒，看准对手抬头。');
  }
  return finish(d);
}

/** Fixed short steps prevent background catch-up and preserve timing windows. */
export function tickDuel(current: Duel, dt = 0.05): Duel {
  if (current.winner !== null || !Number.isFinite(dt) || dt <= 0) return current;
  const d = { ...current };
  dt = Math.min(dt, 0.1);
  d.time += dt;
  d.cooldown = Math.max(0, d.cooldown - dt);
  d.dodge = Math.max(0, d.dodge - dt);
  d.impact = Math.max(0, d.impact - dt);
  d.enemyImpact = Math.max(0, d.enemyImpact - dt);
  d.stamina = Math.min(100, Math.max(0, d.stamina + dt * (d.holding ? -9 : d.resting ? 27 : 9)));
  if (d.holding) {
    d.charge = Math.min(1.6, d.charge + dt * d.chargeRate);
    if (d.charge >= 1.5) d.stamina = Math.max(0, d.stamina - dt * 22);
  }
  const target = d.resting ? 28 : 43;
  if (d.dodge === 0)
    d.x += Math.sign(target - d.x) * Math.min(Math.abs(target - d.x), dt * (d.holding ? 12 : 6));
  d.enemyX += Math.sign(58 - d.enemyX) * Math.min(Math.abs(58 - d.enemyX), dt * 7);
  if (d.windup > 0) {
    d.windup = Math.max(0, d.windup - dt);
    if (d.windup === 0) {
      d.enemyX = d.x + 18;
      if (d.dodge > 0) {
        d.parries += 1;
        d.stamina = Math.min(100, d.stamina + 13);
        d.cycle = d.pace + 0.65;
        announce(d, 'dodge', '漂亮！躲开扑咬 · 对手露出空当');
      } else {
        const damage = Math.max(1, Math.round(d.enemyAttack * (d.resting ? 1.4 : 0.85)));
        d.hp = Math.max(0, d.hp - damage);
        d.enemyImpact = 0.35;
        d.x = Math.max(24, d.x - 7);
        d.combo = 0;
        d.cycle = d.pace;
        announce(
          d,
          'hurt',
          `被顶退 −${damage}${d.resting ? ' · 对手进攻时回气会受重击' : ' · 抬头时按闪避'}`,
        );
      }
    }
  } else {
    d.cycle -= dt;
    if (d.cycle <= 0) {
      d.windup = 0.7;
      announce(d, 'rustle', '对手抬头蓄力！稍等半拍，按闪避');
    }
  }
  return finish(d);
}
