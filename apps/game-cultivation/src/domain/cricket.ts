/** Seconds and percentages; shared by the browser and native Canvas entry. */
export const opponents = [
  { name: '乌头将军', owner: '隔壁 · 老陈', tell: 0.95, rest: 2.2, damage: 13, health: 80 },
  { name: '铁背青', owner: '城南 · 虫痴', tell: 0.75, rest: 1.85, damage: 16, health: 100 },
  { name: '紫金王', owner: '茶馆 · 擂主', tell: 0.6, rest: 1.5, damage: 19, health: 120 },
] as const;

export type CricketAction = 'tease' | 'strike' | 'dodge' | 'cancel';
export type CricketMatch = {
  round: number;
  phase: 'ready' | 'fighting' | 'won' | 'lost';
  time: number;
  health: number;
  enemyHealth: number;
  stamina: number;
  charge: number;
  holding: boolean;
  cooldown: number;
  dodge: number;
  enemyPhase: 'watch' | 'tell' | 'recover';
  enemyClock: number;
  combo: number;
  hits: number;
  perfects: number;
  eventId: number;
  event: 'start' | 'hit' | 'hurt' | 'dodge' | 'perfect' | 'tired' | 'win' | 'lose' | 'rustle';
  message: string;
  impact: number;
};

export function createMatch(round = 0): CricketMatch {
  const index = Math.max(0, Math.min(2, Math.trunc(round) || 0));
  return {
    round: index,
    phase: 'ready',
    time: 60,
    health: 100,
    enemyHealth: opponents[index].health,
    stamina: 100,
    charge: 0,
    holding: false,
    cooldown: 0,
    dodge: 0,
    enemyPhase: 'watch',
    enemyClock: 1.8,
    combo: 0,
    hits: 0,
    perfects: 0,
    eventId: 0,
    event: 'start',
    message: '草梗轻探，听虫声起。准备好了就揭盖开斗。',
    impact: 0,
  };
}

function signal(s: CricketMatch, event: CricketMatch['event'], message: string) {
  s.eventId++;
  s.event = event;
  s.message = message;
}

export function startMatch(s: CricketMatch): CricketMatch {
  if (s.phase !== 'ready') return s;
  return {
    ...s,
    phase: 'fighting',
    eventId: s.eventId + 1,
    message: '开斗！按住撩拨，蓄到金区松手出击。',
  };
}

function settle(s: CricketMatch) {
  if (s.health <= 0 || s.enemyHealth <= 0 || s.time <= 0) {
    const won =
      s.health > 0 &&
      (s.enemyHealth <= 0 || s.health > (s.enemyHealth / opponents[s.round].health) * 100);
    s.phase = won ? 'won' : 'lost';
    s.holding = false;
    signal(
      s,
      won ? 'win' : 'lose',
      won ? '对方收须退走。这一盆，你赢了！' : '你的蛐蛐收须退走。歇口气，再来一盆。',
    );
  }
  return s;
}

export function actCricket(state: CricketMatch, action: CricketAction): CricketMatch {
  if (state.phase !== 'fighting') return state;
  const s = { ...state };
  if (action === 'cancel') return { ...s, holding: false, charge: 0 };
  if (action === 'tease') {
    if (s.holding || s.cooldown > 0 || s.dodge > 0) return state;
    if (s.stamina < 18) {
      signal(s, 'tired', '体力不足，放下草梗喘口气。');
      return s;
    }
    s.holding = true;
    s.charge = 0;
    signal(s, 'rustle', '轻撩触须……金区松手，别撩过火。');
  }
  if (action === 'strike' && s.holding) {
    s.holding = false;
    const perfect = s.charge >= 0.55 && s.charge <= 0.82;
    const counter = s.enemyPhase === 'recover';
    const damage = Math.round((perfect ? 17 : s.charge > 0.82 ? 5 : 8) * (counter ? 1.6 : 1));
    s.enemyHealth = Math.max(0, s.enemyHealth - damage);
    s.stamina = Math.max(0, s.stamina - 18);
    s.cooldown = 0.48;
    s.hits++;
    s.combo = perfect ? s.combo + 1 : 0;
    if (perfect) s.perfects++;
    s.impact = 0.28;
    signal(
      s,
      perfect ? 'perfect' : 'hit',
      `${counter ? '趁虚反击' : perfect ? '恰到好处' : s.charge > 0.82 ? '撩过火了' : '试探一口'} −${damage}${perfect && s.combo > 1 ? ` · 连击 ${s.combo}` : ''}`,
    );
    s.charge = 0;
  }
  if (action === 'dodge') {
    if (s.dodge > 0 || s.cooldown > 0) return state;
    if (s.stamina < 23) {
      signal(s, 'tired', '体力不够闪避！先歇一歇。');
      return s;
    }
    s.holding = false;
    s.charge = 0;
    s.stamina -= 23;
    s.dodge = 0.46;
    s.cooldown = 0.68;
    signal(s, 'rustle', '收梗侧闪！最后一刻闪开才有反击机会。');
  }
  return settle(s);
}

/** Fixed small steps keep attack/dodge timing independent of display refresh rate. */
export function tickCricket(state: CricketMatch, elapsed: number): CricketMatch {
  if (state.phase !== 'fighting' || !Number.isFinite(elapsed) || elapsed <= 0) return state;
  const s = { ...state };
  let remaining = Math.min(elapsed, 0.25);
  while (remaining > 0 && s.phase === 'fighting') {
    const dt = Math.min(remaining, 1 / 120);
    remaining -= dt;
    s.time = Math.max(0, s.time - dt);
    s.cooldown = Math.max(0, s.cooldown - dt);
    s.dodge = Math.max(0, s.dodge - dt);
    s.impact = Math.max(0, s.impact - dt);
    s.stamina = Math.min(100, s.stamina + (s.holding ? -5 : 15) * dt);
    if (s.holding) {
      s.charge = Math.min(1, s.charge + dt * 0.85);
      if (s.stamina <= 0) {
        s.stamina = 0;
        s.holding = false;
        s.charge = 0;
        signal(s, 'tired', '撩得太久，蛐蛐累了。放手恢复体力。');
      }
    }
    s.enemyClock -= dt;
    if (s.enemyClock <= 0) {
      const opponent = opponents[s.round];
      if (s.enemyPhase === 'watch') {
        s.enemyPhase = 'tell';
        s.enemyClock = opponent.tell;
        signal(s, 'rustle', '它抬头张牙了……看准扑来的瞬间收梗！');
      } else if (s.enemyPhase === 'tell') {
        s.enemyPhase = 'recover';
        s.enemyClock = 1.15;
        if (s.dodge > 0) {
          signal(s, 'dodge', '扑空了！趁它露出侧身，蓄力反击！');
        } else {
          const damage = opponent.damage + (s.holding ? 5 : 0);
          s.health = Math.max(0, s.health - damage);
          s.combo = 0;
          s.holding = false;
          s.charge = 0;
          s.impact = 0.3;
          signal(s, 'hurt', `被顶退了 −${damage} · 抬头是预兆，闪晚一点。`);
        }
      } else {
        s.enemyPhase = 'watch';
        s.enemyClock = opponent.rest + Math.sin(s.time * 3) * 0.35;
      }
    }
    settle(s);
  }
  return s;
}
