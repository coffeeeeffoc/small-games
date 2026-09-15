export type Kind = 'archer' | 'shield' | 'mage' | 'frost';
export type Unit = { id: number; kind: Kind; level: number; cooldown: number };
export type Enemy = {
  id: number;
  kind: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  attackTimer: number;
  slow: number;
  boss: boolean;
};
export type Shot = {
  id: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  kind: Kind;
  life: number;
  duration: number;
  windup: number;
  unitId: number;
  slot: number;
  level: number;
  targetId: number;
  damage: number;
  splash: number;
  pierce: boolean;
  slow: number;
  released: boolean;
};
export type Impact = {
  id: number;
  enemyId: number;
  x: number;
  y: number;
  kind: Kind | 'bell';
  damage: number;
  killed: boolean;
  enemyKind: string;
  boss: boolean;
  life: number;
  duration: number;
  level: number;
};
export type Location = { area: 'board' | 'field'; index: number };
export type ActionResult = { ok: boolean; message: string };
export const MAX_LEVEL = 3;
export const SUMMON_COST = 18;
export const GUARDS: Record<Kind, { name: string; color: string; role: string }> = {
  archer: { name: '弓箭手', color: '#f8c86b', role: '迅捷单体 · 稳定输出' },
  shield: { name: '盾卫', color: '#7cdcca', role: '近身阻挡 · 保护城门' },
  mage: { name: '焰法师', color: '#ef967b', role: '范围爆破 · 第 3 波解锁' },
  frost: { name: '冰法师', color: '#92cafa', role: '寒冰减速 · 第 6 波解锁' },
};
export const BUFFS: Record<string, { name: string; description: string; tag: string }> = {
  quickshot: { name: '疾风箭弦', description: '所有弓箭手攻击速度提高 30%。', tag: '弓箭手' },
  pierce: {
    name: '穿云之箭',
    description: '弓箭额外穿透同列的一名敌人，造成 70% 伤害。',
    tag: '弓箭手',
  },
  thorns: { name: '荆棘壁垒', description: '被盾卫阻挡的敌人每次攻击都会受到反伤。', tag: '盾卫' },
  renewal: { name: '薪火相传', description: '每次合成回复城门 8 点生命。', tag: '合成' },
  lucky: { name: '星火跃升', description: '合成时有 20% 概率额外升一级，最高 3 级。', tag: '合成' },
  frostbite: {
    name: '凛冬之拥',
    description: '寒冰减速增强至 65%，冰法师伤害提高 20%。',
    tag: '冰法师',
  },
  arcane: { name: '余烬回响', description: '焰法师爆破范围扩大，伤害提高 25%。', tag: '焰法师' },
  bounty: { name: '夜行赏金', description: '每击败一名敌人，额外获得 2 枚金币。', tag: '经济' },
};
export type State = {
  board: (Unit | null)[];
  field: (Unit | null)[];
  enemies: Enemy[];
  shots: Shot[];
  impacts: Impact[];
  phase: 'ready' | 'playing' | 'intermission' | 'buff' | 'won' | 'lost';
  paused: boolean;
  wave: number;
  gold: number;
  hp: number;
  maxHp: number;
  elapsed: number;
  waveTime: number;
  supplyTime: number;
  skillCooldown: number;
  kills: number;
  merges: number;
  summons: number;
  buffs: string[];
  choices: string[];
  highestLevel: number;
  revived: boolean;
  events: { type: string; [key: string]: unknown }[];
  stats: {
    boardSamples: number;
    fullSamples: number;
    highestBoard: number;
    summonByKind: Record<Kind, number>;
    mergeLevels: Record<number, number>;
    bossReached: number[];
    failureWave: number | null;
  };
  pendingSupply: number;
  spawnTimer: number;
  spawned: number;
  spawnTotal: number;
  intermissionTime: number;
  waveDuration: number;
  lastMessage: string;
  nextId: number;
  talent: number;
};
const randoms = new WeakMap<State, () => number>();
const result = (ok: boolean, message: string): ActionResult => ({ ok, message });
const active = (s: State) => !s.paused && ['ready', 'playing', 'intermission'].includes(s.phase);
const has = (s: State, id: string) => s.buffs.includes(id);
const random = (s: State) => Math.max(0, Math.min(0.999999, (randoms.get(s) ?? Math.random)()));
function event(s: State, type: string, data: Record<string, unknown> = {}) {
  s.events.push({ type, at: Number(s.elapsed.toFixed(2)), wave: s.wave, ...data });
}
function occupancy(s: State) {
  const count = s.board.filter(Boolean).length;
  s.stats.highestBoard = Math.max(s.stats.highestBoard, count);
  event(s, 'board_occupancy', { occupied: count, capacity: 12, full: count === 12 });
}
function validLocation(s: State, loc: Location) {
  return (
    loc &&
    (loc.area === 'board' || loc.area === 'field') &&
    Number.isInteger(loc.index) &&
    loc.index >= 0 &&
    loc.index < s[loc.area].length
  );
}
export function createGame(talent = 0, rng: () => number = Math.random): State {
  const rank = Number.isFinite(talent) ? Math.max(0, Math.min(5, Math.floor(talent))) : 0;
  const s: State = {
    board: Array(12).fill(null),
    field: Array(4).fill(null),
    enemies: [],
    shots: [],
    impacts: [],
    phase: 'ready',
    paused: false,
    wave: 0,
    gold: SUMMON_COST * 3,
    hp: 100 + rank * 10,
    maxHp: 100 + rank * 10,
    elapsed: 0,
    waveTime: 0,
    supplyTime: 14,
    skillCooldown: 0,
    kills: 0,
    merges: 0,
    summons: 0,
    buffs: [],
    choices: [],
    highestLevel: 1,
    revived: false,
    events: [],
    stats: {
      boardSamples: 0,
      fullSamples: 0,
      highestBoard: 2,
      summonByKind: { archer: 0, shield: 0, mage: 0, frost: 0 },
      mergeLevels: {},
      bossReached: [],
      failureWave: null,
    },
    pendingSupply: 0,
    spawnTimer: 0,
    spawned: 0,
    spawnTotal: 0,
    intermissionTime: 0,
    waveDuration: 20,
    lastMessage: '将弓箭手拖到城墙，准备守夜。',
    nextId: 3,
    talent: rank,
  };
  s.board[0] = { id: 1, kind: 'archer', level: 1, cooldown: 0 };
  s.board[1] = { id: 2, kind: 'archer', level: 1, cooldown: 0 };
  randoms.set(s, rng);
  event(s, 'run_start', { talent: rank });
  occupancy(s);
  return s;
}
export function moveUnit(s: State, from: Location, to: Location): ActionResult {
  if (!active(s)) return result(false, '请先继续守夜。');
  if (!validLocation(s, from) || !validLocation(s, to)) return result(false, '这个位置不可用。');
  if (from.area === to.area && from.index === to.index) return result(false, '守卫已经在这里。');
  const unit = s[from.area][from.index],
    target = s[to.area][to.index];
  if (!unit) return result(false, '这里没有守卫。');
  if (target?.kind === unit.kind && target.level === unit.level) {
    if (unit.level >= MAX_LEVEL) return result(false, '已经是 3 级，无法继续合成。');
    let level = unit.level + 1;
    if (has(s, 'lucky') && level < MAX_LEVEL && random(s) < 0.2) level++;
    s[from.area][from.index] = null;
    s[to.area][to.index] = { ...target, level, cooldown: Math.min(unit.cooldown, target.cooldown) };
    s.merges++;
    s.highestLevel = Math.max(s.highestLevel, level);
    s.stats.mergeLevels[level] = (s.stats.mergeLevels[level] ?? 0) + 1;
    if (has(s, 'renewal')) s.hp = Math.min(s.maxHp, s.hp + 8);
    event(s, 'merge', { kind: unit.kind, fromLevel: unit.level, level, area: to.area });
    occupancy(s);
    s.lastMessage = `${GUARDS[unit.kind].name}升至 ${level} 级！`;
    return result(true, s.lastMessage);
  }
  s[from.area][from.index] = target;
  s[to.area][to.index] = unit;
  event(s, target ? 'swap' : 'move', { from, to, kind: unit.kind });
  occupancy(s);
  return result(
    true,
    to.area === 'field' ? '守卫已上阵。' : target ? '守卫已交换位置。' : '守卫已移入合成区。',
  );
}
export function sellUnit(s: State, loc: Location): ActionResult {
  if (!active(s) || !validLocation(s, loc)) return result(false, '现在无法出售。');
  const unit = s[loc.area][loc.index];
  if (!unit) return result(false, '先选择一名守卫。');
  const gold = 6 * 2 ** (unit.level - 1);
  s.gold += gold;
  s[loc.area][loc.index] = null;
  event(s, 'sell', { kind: unit.kind, level: unit.level, gold });
  occupancy(s);
  return result(true, `腾出位置，获得 ${gold} 金币。`);
}
export function summon(s: State, free = false): ActionResult {
  if (!active(s)) return result(false, '现在无法召唤。');
  const index = s.board.indexOf(null);
  if (index === -1) return result(false, '棋盘已满：合成、上阵或出售来腾出位置。');
  if (!free && s.gold < SUMMON_COST) return result(false, `召唤需要 ${SUMMON_COST} 金币。`);
  const kinds: Kind[] = ['archer', 'shield'];
  if (s.wave >= 3) kinds.push('mage');
  if (s.wave >= 6) kinds.push('frost');
  const kind = kinds[Math.floor(random(s) * kinds.length)];
  if (!free) s.gold -= SUMMON_COST;
  s.board[index] = { id: s.nextId++, kind, level: 1, cooldown: 0 };
  s.summons++;
  s.stats.summonByKind[kind]++;
  event(s, 'summon', { kind, source: free ? 'supply' : 'gold', level: 1 });
  occupancy(s);
  return result(true, `${GUARDS[kind].name}前来守夜。`);
}
export function beginWave(s: State): ActionResult {
  if (s.paused || !['ready', 'intermission'].includes(s.phase))
    return result(false, '这一波仍在进行。');
  if (s.phase === 'ready' && !s.field.some(Boolean)) return result(false, '至少派一名守卫上阵。');
  s.wave++;
  s.phase = 'playing';
  s.waveTime = 0;
  s.spawned = 0;
  s.spawnTimer = 0.7;
  s.spawnTotal = 6 + s.wave;
  s.lastMessage =
    s.wave === 3
      ? '焰法师已加入召唤池！'
      : s.wave === 6
        ? '冰法师已加入召唤池！'
        : `第 ${s.wave} 波，守住城门！`;
  event(s, 'wave_start');
  if (s.wave === 5 || s.wave === 10) {
    s.stats.bossReached.push(s.wave);
    event(s, 'boss_reached', { boss: s.wave === 5 ? 'ogre' : 'nightlord' });
  }
  return result(true, s.lastMessage);
}
export function chooseBuff(s: State, id: string): ActionResult {
  if (s.paused || s.phase !== 'buff' || !s.choices.includes(id) || !BUFFS[id])
    return result(false, '请选择本次出现的祝福。');
  s.buffs.push(id);
  s.choices = [];
  s.phase = 'intermission';
  s.intermissionTime = 3;
  event(s, 'buff_choice', { id });
  return result(true, `获得「${BUFFS[id].name}」。`);
}
function damageEnemy(s: State, enemy: Enemy, damage: number, kind: Impact['kind'], level = 1) {
  if (enemy.hp <= 0) return;
  damage = Math.min(enemy.hp, damage);
  enemy.hp -= damage;
  const killed = enemy.hp === 0;
  const duration = killed ? 0.9 : 0.7;
  s.impacts.push({
    id: s.nextId++,
    enemyId: enemy.id,
    x: enemy.x,
    y: enemy.y,
    kind,
    damage,
    killed,
    enemyKind: enemy.kind,
    boss: enemy.boss,
    life: duration,
    duration,
    level,
  });
  if (s.impacts.length > 96) s.impacts.splice(0, s.impacts.length - 96);
  event(s, 'hit', { kind, level, damage, killed, enemyId: enemy.id, boss: enemy.boss });
  if (killed) {
    s.kills++;
    s.gold += (enemy.boss ? 28 : 3) + (has(s, 'bounty') ? 2 : 0);
    event(s, 'kill', { kind: enemy.kind, boss: enemy.boss });
  }
}
export function castSkill(s: State): ActionResult {
  if (s.paused || s.phase !== 'playing') return result(false, '开战后才能释放灯火。');
  if (s.skillCooldown > 0) return result(false, `灯火还需 ${Math.ceil(s.skillCooldown)} 秒。`);
  if (!s.enemies.some((e) => e.hp > 0)) return result(false, '等待敌人进入战场。');
  s.skillCooldown = 24;
  for (const enemy of s.enemies) {
    damageEnemy(s, enemy, 44 + s.wave * 1.5, 'bell');
    enemy.slow = Math.max(enemy.slow, 3.5);
  }
  event(s, 'skill');
  return result(true, '长明灯燃起，灼伤并减速所有敌人！');
}
export function revive(s: State): ActionResult {
  if (s.phase !== 'lost' || s.revived) return result(false, '每局只有一次免费续火机会。');
  s.revived = true;
  s.hp = Math.ceil(s.maxHp * 0.6);
  s.phase = 'playing';
  s.paused = false;
  s.skillCooldown = 0;
  for (const enemy of s.enemies) {
    enemy.y = Math.min(enemy.y, 0.3);
    enemy.attackTimer = 1;
    enemy.slow = 2;
  }
  event(s, 'revive', { source: 'free' });
  return result(true, '免费续火：城门恢复 60%，敌人被击退。');
}
const enemyTypes = [
  { kind: 'crawler', hp: 1, speed: 0.052, damage: 5 },
  { kind: 'runner', hp: 0.65, speed: 0.085, damage: 4 },
  { kind: 'brute', hp: 1.9, speed: 0.036, damage: 9 },
  { kind: 'bat', hp: 0.8, speed: 0.078, damage: 5 },
  { kind: 'armored', hp: 2.25, speed: 0.04, damage: 8 },
  { kind: 'shaman', hp: 1.35, speed: 0.047, damage: 7 },
];
function spawnEnemy(s: State) {
  const boss = (s.wave === 5 || s.wave === 10) && s.spawned === 0;
  const type = enemyTypes[Math.floor(random(s) * Math.min(6, s.wave + 1))];
  const hp = boss
    ? s.wave === 5
      ? 700
      : 1650
    : (18 + s.wave * 7) * (1 + (s.wave - 1) * 0.08) * type.hp;
  s.enemies.push({
    id: s.nextId++,
    kind: boss ? (s.wave === 5 ? 'ogre' : 'nightlord') : type.kind,
    x: boss ? 0.5 : 0.1 + random(s) * 0.8,
    y: 0.035,
    hp,
    maxHp: hp,
    speed: boss ? 0.042 : type.speed + s.wave * 0.0014,
    damage: boss ? (s.wave === 5 ? 17 : 26) : type.damage + s.wave * 0.4,
    attackTimer: 0.5,
    slow: 0,
    boss,
  });
  s.spawned++;
}
function endRun(s: State, won: boolean) {
  s.phase = won ? 'won' : 'lost';
  s.hp = Math.max(0, s.hp);
  s.stats.failureWave = won ? null : s.wave;
  event(s, 'run_end', {
    won,
    failureWave: won ? null : s.wave,
    elapsed: s.elapsed,
    highestLevel: s.highestLevel,
    summons: s.summons,
    merges: s.merges,
    boardFullRate: s.stats.boardSamples ? s.stats.fullSamples / s.stats.boardSamples : 0,
    revived: s.revived,
    reviveSource: s.revived ? 'free' : null,
    successAfterRevive: s.revived && won,
  });
}
function clearWave(s: State) {
  s.gold += 12 + s.wave * 2;
  event(s, 'wave_clear', { hp: s.hp });
  if (s.wave === 10) {
    endRun(s, true);
    return;
  }
  if (s.wave === 4 || s.wave === 9) {
    const pool = Object.keys(BUFFS).filter(
      (id) => !has(s, id) && (id !== 'frostbite' || s.wave >= 6),
    );
    s.choices = [];
    while (s.choices.length < 3 && pool.length)
      s.choices.push(pool.splice(Math.floor(random(s) * pool.length), 1)[0]);
    s.phase = 'buff';
    s.lastMessage = '首领将至，选择一份守夜祝福。';
  } else {
    s.phase = 'intermission';
    s.intermissionTime = 3;
    s.lastMessage = '这一波守住了！整理队伍，下一波即将来袭。';
  }
}
function step(s: State, dt: number) {
  s.elapsed += dt;
  s.skillCooldown = Math.max(0, s.skillCooldown - dt);
  s.supplyTime -= dt;
  while (s.supplyTime <= 0) {
    s.pendingSupply++;
    s.supplyTime += 14;
  }
  while (s.pendingSupply > 0 && s.board.includes(null)) {
    if (!summon(s, true).ok) break;
    s.pendingSupply--;
  }
  s.stats.boardSamples += dt;
  if (s.board.every(Boolean)) s.stats.fullSamples += dt;
  for (const impact of s.impacts) impact.life -= dt;
  s.impacts = s.impacts.filter((impact) => impact.life > 1e-8);
  for (const shot of s.shots) {
    shot.life -= dt;
    const target = s.enemies.find((enemy) => enemy.id === shot.targetId && enemy.hp > 0);
    if (target) {
      shot.tx = target.x;
      shot.ty = target.y;
    }
    if (!shot.released && shot.duration - shot.life + 1e-8 >= shot.windup) {
      shot.released = true;
      event(s, 'attack_release', {
        unitId: shot.unitId,
        slot: shot.slot,
        kind: shot.kind,
        level: shot.level,
        shotId: shot.id,
      });
    }
    if (shot.life > 1e-8) continue;
    shot.life = 0;
    if (!target) continue;
    damageEnemy(s, target, shot.damage, shot.kind, shot.level);
    target.slow = Math.max(target.slow, shot.slow);
    const others = s.enemies
      .filter((enemy) => enemy.id !== target.id && enemy.hp > 0 && enemy.y >= 0.25)
      .sort((a, b) => b.y - a.y);
    if (shot.splash) {
      for (const other of others) {
        if (Math.hypot(other.x - target.x, other.y - target.y) < shot.splash)
          damageEnemy(s, other, shot.damage * 0.75, shot.kind, shot.level);
      }
    }
    if (shot.pierce) {
      const other = others.find((enemy) => Math.abs(enemy.x - target.x) < 0.18);
      if (other) damageEnemy(s, other, shot.damage * 0.7, shot.kind, shot.level);
    }
  }
  s.shots = s.shots.filter((shot) => shot.life > 0);
  if (s.phase === 'intermission') {
    s.intermissionTime -= dt;
    if (s.intermissionTime <= 0) beginWave(s);
    return;
  }
  s.waveTime += dt;
  s.spawnTimer -= dt;
  if (s.spawned < s.spawnTotal && s.spawnTimer <= 0) {
    spawnEnemy(s);
    s.spawnTimer += 0.9;
  }
  for (let i = 0; i < s.field.length; i++) {
    const unit = s.field[i];
    if (!unit) continue;
    unit.cooldown = Math.max(0, unit.cooldown - dt);
    if (unit.cooldown > 0) continue;
    const x = (i + 0.5) / 4;
    const targets = s.enemies
      .filter(
        (e) =>
          e.hp > 0 &&
          e.y >= (unit.kind === 'shield' ? 0.48 : 0.25) &&
          (unit.kind !== 'shield' || Math.abs(e.x - x) < 0.24),
      )
      .sort((a, b) => b.y - a.y);
    const target = targets[0];
    if (!target) continue;
    const scale = [0, 1, 2.5, 6][unit.level];
    const damage =
      { archer: 7, shield: 10, mage: 12, frost: 7 }[unit.kind] *
      scale *
      (unit.kind === 'mage' && has(s, 'arcane')
        ? 1.25
        : unit.kind === 'frost' && has(s, 'frostbite')
          ? 1.2
          : 1);
    unit.cooldown =
      { archer: 0.7, shield: 0.9, mage: 1.3, frost: 0.95 }[unit.kind] /
      (unit.kind === 'archer' && has(s, 'quickshot') ? 1.3 : 1);
    const duration = { archer: 0.32, shield: 0.22, mage: 0.48, frost: 0.38 }[unit.kind];
    const shot: Shot = {
      id: s.nextId++,
      x,
      y: 0.86,
      tx: target.x,
      ty: target.y,
      kind: unit.kind,
      life: duration,
      duration,
      windup: { archer: 0.1, shield: 0.08, mage: 0.16, frost: 0.12 }[unit.kind],
      unitId: unit.id,
      slot: i,
      level: unit.level,
      targetId: target.id,
      damage,
      splash: unit.kind === 'mage' ? (has(s, 'arcane') ? 0.23 : 0.15) : 0,
      pierce: unit.kind === 'archer' && has(s, 'pierce'),
      slow: unit.kind === 'frost' ? 2.5 : 0,
      released: false,
    };
    s.shots.push(shot);
    event(s, 'attack_start', {
      unitId: unit.id,
      slot: i,
      kind: unit.kind,
      level: unit.level,
      shotId: shot.id,
    });
  }
  const blocking = new Set<number>();
  for (let i = 0; i < s.field.length; i++) {
    const unit = s.field[i];
    if (unit?.kind !== 'shield') continue;
    const target = s.enemies
      .filter(
        (e) =>
          e.hp > 0 && e.y >= 0.67 && Math.abs(e.x - (i + 0.5) / 4) < 0.24 && !blocking.has(e.id),
      )
      .sort((a, b) => b.y - a.y)[0];
    if (!target) continue;
    blocking.add(target.id);
    target.attackTimer -= dt;
    if (target.attackTimer <= 0) {
      target.attackTimer += 1.8;
      s.hp -= target.damage * 0.15;
      if (has(s, 'thorns'))
        damageEnemy(s, target, target.damage * 2.5 + unit.level * 5, 'shield', unit.level);
      event(s, 'block', {
        enemy: target.id,
        damage: target.damage * 0.15,
        x: target.x,
        y: target.y,
        slot: i,
        unitId: unit.id,
      });
      if (s.hp <= 0) {
        endRun(s, false);
        return;
      }
    }
  }
  for (const enemy of s.enemies) {
    if (enemy.hp <= 0) continue;
    enemy.slow = Math.max(0, enemy.slow - dt);
    if (blocking.has(enemy.id)) continue;
    enemy.y = Math.min(
      0.82,
      enemy.y + enemy.speed * dt * (enemy.slow > 0 ? (has(s, 'frostbite') ? 0.35 : 0.65) : 1),
    );
    if (enemy.y >= 0.82) {
      enemy.attackTimer -= dt;
      if (enemy.attackTimer <= 0) {
        enemy.attackTimer += 1.6;
        s.hp -= enemy.damage;
        event(s, 'gate_hit', {
          damage: enemy.damage,
          hp: Math.max(0, s.hp),
          x: enemy.x,
          y: enemy.y,
        });
        if (s.hp <= 0) {
          endRun(s, false);
          return;
        }
      }
    }
  }
  s.enemies = s.enemies.filter((e) => e.hp > 0);
  if (
    s.waveTime + 1e-8 >= s.waveDuration &&
    s.spawned >= s.spawnTotal &&
    !s.enemies.length &&
    !s.impacts.some((impact) => impact.killed && impact.life > 0.35)
  )
    clearWave(s);
}
export function tick(s: State, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0 || s.paused || !['playing', 'intermission'].includes(s.phase))
    return;
  // Keep all foreground time; only movement integration uses small steps.
  let remaining = dt;
  while (remaining > 1e-9 && !s.paused && ['playing', 'intermission'].includes(s.phase)) {
    const slice = Math.min(1 / 30, remaining);
    step(s, slice);
    remaining -= slice;
  }
}
