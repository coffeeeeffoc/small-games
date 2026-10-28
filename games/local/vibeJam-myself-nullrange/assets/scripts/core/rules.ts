import { CRAFTS, MISSIONS, validateMission } from './content.ts';
import type { Craft, EnemyKind, Mission } from './content.ts';
import { FLIGHT_CEILING } from './terrain.ts';
import { airframeFloor, surfaceHeight } from './flight-geometry.ts';
export { terrainHeight } from './terrain.ts';
export const DT = 1 / 60;
export type Point = { x: number; y: number; z: number };
export type Controls = {
  x: number;
  y: number;
  fire: boolean;
  boost: boolean;
  missile: boolean;
  scan: boolean;
};
export const neutral = (): Controls => ({
  x: 0,
  y: 0,
  fire: false,
  boost: false,
  missile: false,
  scan: false,
});
export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
export const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const direction = (yaw: number, pitch = 0): Point => ({
  x: Math.sin(yaw) * Math.cos(pitch),
  y: Math.sin(pitch),
  z: -Math.cos(yaw) * Math.cos(pitch),
});
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export type Aircraft = Point & {
  yaw: number;
  pitch: number;
  roll: number;
  speed: number;
  hull: number;
  shield: number;
  energy: number;
};
export type Weapon = {
  heat: number;
  overheated: boolean;
  shotCooldown: number;
  missiles: number;
  missileCooldown: number;
};
export type Enemy = Point & {
  id: number;
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  shield: number;
  yaw: number;
  pitch: number;
  cooldown: number;
  phase: number;
  stage: number;
  telegraph: number;
  priority: boolean;
  travel: number;
};
export type Shot = Point & {
  id: number;
  velocity: Point;
  owner: 'player' | 'enemy';
  target: number;
  missile: boolean;
  life: number;
  source?: number;
};
export type Impact = Point & {
  kind: 'hit' | 'shield' | 'kill' | 'pickup' | 'damage';
  id: number;
  tick: number;
};
export type State = ReturnType<typeof createRun>;
// These single-aircraft calculations are shared primitives, with no AI/mission/engine authority.
export function advanceFlight(
  p: Aircraft,
  craft: Craft,
  input: Partial<Controls>,
  boosting: boolean,
) {
  const x = Number.isFinite(input.x) ? clamp(input.x!, -1, 1) : 0,
    y = Number.isFinite(input.y) ? clamp(input.y!, -1, 1) : 0;
  p.yaw = angleDelta(p.yaw + x * craft.turn * DT, 0);
  p.pitch = clamp(
    p.pitch + y * craft.pitch * DT - p.pitch * DT * (Math.abs(y) < 0.05 ? 1.1 : 0.1),
    -0.7,
    0.7,
  );
  p.roll += (-x * 0.65 - p.roll) * DT * 7;
  boosting = input.boost === true && p.energy > (boosting ? 0 : 12);
  p.energy = clamp(p.energy + DT * (boosting ? -29 : 20), 0, 100);
  p.speed += ((boosting ? craft.boost : craft.speed) - p.speed) * DT * 3;
  const d = direction(p.yaw, p.pitch);
  for (const k of ['x', 'y', 'z'] as const) p[k] += d[k] * p.speed * DT;
  return boosting;
}
export function advanceWeapons(w: Weapon, craft: Craft, fire: boolean) {
  w.shotCooldown = Math.max(0, w.shotCooldown - DT);
  w.missileCooldown = Math.max(0, w.missileCooldown - DT);
  w.heat = Math.max(0, w.heat - DT * (fire ? 0.22 : 0.55));
  if (w.overheated && w.heat < 0.3) w.overheated = false;
  if (!fire || w.overheated || w.shotCooldown > 0) return false;
  w.shotCooldown = 0.13;
  w.heat = Math.min(1, w.heat + craft.heat);
  if (w.heat >= 0.99) w.overheated = true;
  return true;
}
export function consumeMissile(w: Weapon, locked: boolean) {
  if (!locked || w.missiles <= 0 || w.missileCooldown > 0) return false;
  w.missiles--;
  w.missileCooldown = 3;
  return true;
}
export function createRun(mission: Mission = MISSIONS[0], craft: Craft = CRAFTS[0]) {
  validateMission(mission);
  const o = mission.objective,
    route = o.kind === 'escort' ? o.route : null;
  const s = {
    mission,
    craft,
    status: 'running' as 'running' | 'won' | 'lost',
    reason: '',
    tick: 0,
    seed: mission.seed >>> 0,
    player: {
      x: 0,
      y: 115,
      z: 0,
      yaw: 0,
      pitch: 0,
      roll: 0,
      speed: craft.speed,
      hull: craft.hull,
      shield: craft.shield,
      energy: 100,
    },
    enemies: [] as Enemy[],
    shots: [] as Shot[],
    pickups: [] as (Point & { id: number; life: number })[],
    events: [] as string[],
    impacts: [] as Impact[],
    nextId: 100,
    wave: -1,
    kills: 0,
    recovered: 0,
    score: 0,
    heat: 0,
    overheated: false,
    shotCooldown: 0,
    missiles: craft.missiles,
    missileCooldown: 0,
    scanCooldown: 0,
    scanTime: 0,
    invulnerable: 0,
    damageAgo: 10,
    notice: '',
    noticeTime: 0,
    boosting: false,
    eliteStage: 1,
    eliteKilled: false,
    transport: route
      ? {
          x: route[0][0],
          y: route[0][1],
          z: route[0][2],
          hull: o.kind === 'escort' ? o.hull : 0,
          yaw: 0,
          leg: 1,
          travel: 0,
          total: route
            .slice(1)
            .reduce(
              (n, p, i) =>
                n +
                distance(
                  { x: p[0], y: p[1], z: p[2] },
                  { x: route[i][0], y: route[i][1], z: route[i][2] },
                ),
              0,
            ),
        }
      : null,
  };
  spawnWave(s);
  return s;
}
function random(s: State) {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed / 4294967296;
}
export function lineClear(a: Point, b: Point) {
  const n = Math.max(1, Math.ceil(distance(a, b) / 12));
  for (let i = 0; i <= n; i++) {
    const t = i / n,
      x = a.x + (b.x - a.x) * t,
      z = a.z + (b.z - a.z) * t;
    if (a.y + (b.y - a.y) * t < surfaceHeight(x, z)) return false;
  }
  return true;
}
export function targetInCone(s: State, degrees = 12, range = 760) {
  const p = s.player,
    d = direction(p.yaw, p.pitch),
    cone = Math.cos((degrees * Math.PI) / 180);
  let result: Enemy | undefined,
    rank = -Infinity;
  for (const e of s.enemies) {
    const length = distance(e, p);
    if (e.hp <= 0 || length < 1 || length > range) continue;
    const dot = ((e.x - p.x) * d.x + (e.y - p.y) * d.y + (e.z - p.z) * d.z) / length;
    if (dot >= cone && dot - length * 0.00006 > rank && lineClear(p, e)) {
      rank = dot - length * 0.00006;
      result = e;
    }
  }
  return result;
}
/** Relative swept segment handles projectile and target movement in one tick. */
export function sweptDistance(a: Point, b: Point, oldTarget: Point, target: Point) {
  const x = a.x - oldTarget.x,
    y = a.y - oldTarget.y,
    z = a.z - oldTarget.z,
    dx = b.x - target.x - x,
    dy = b.y - target.y - y,
    dz = b.z - target.z - z;
  const length2 = dx * dx + dy * dy + dz * dz,
    t = length2 ? clamp(-(x * dx + y * dy + z * dz) / length2, 0, 1) : 0;
  return Math.hypot(x + dx * t, y + dy * t, z + dz * t);
}
function tell(s: State, text: string) {
  s.notice = text;
  s.noticeTime = 2.5;
}
function impact(s: State, kind: Impact['kind'], p: Point) {
  s.impacts.push({ x: p.x, y: p.y, z: p.z, kind, id: s.nextId++, tick: s.tick });
}
function finish(s: State, won: boolean, reason: string) {
  if (s.status !== 'running') return;
  s.status = won ? 'won' : 'lost';
  s.reason = reason;
  if (won) s.score += Math.round((s.player.hull / s.craft.hull) * 500);
  s.events.push(s.status);
}
function spawnWave(s: State) {
  const w = s.mission.waves[++s.wave],
    anchor = s.transport || s.player,
    yaw = anchor.yaw;
  for (const spec of w.enemies) {
    const [side, alt, forward] = spec.offset,
      x = anchor.x + Math.cos(yaw) * side + Math.sin(yaw) * forward,
      z = anchor.z + Math.sin(yaw) * side - Math.cos(yaw) * forward;
    s.enemies.push({
      x,
      y: Math.min(FLIGHT_CEILING - 30, Math.max(alt, s.player.y, surfaceHeight(x, z) + 45)),
      z,
      id: s.nextId++,
      kind: spec.kind,
      hp: spec.hp,
      maxHp: spec.hp,
      shield: spec.shield || 0,
      yaw: spec.priority ? yaw : angleDelta(yaw + Math.PI, 0),
      pitch: 0,
      cooldown: 2.8 + random(s),
      phase: random(s) * 6.28,
      stage: 1,
      telegraph: 0,
      priority: !!spec.priority,
      travel: 0,
    });
  }
  tell(s, `${s.wave + 1}/${s.mission.waves.length} · ${w.label}`);
  s.events.push('wave');
}
function canSpawn(s: State) {
  const w = s.mission.waves[s.wave + 1];
  if (!w || s.enemies.filter((e) => e.hp > 0).length + w.enemies.length > 8) return false;
  const g = w.gate;
  return g.kind === 'clear'
    ? !s.enemies.some((e) => e.hp > 0)
    : g.kind === 'recovered'
      ? s.recovered >= g.value
      : g.kind === 'route'
        ? !!s.transport && s.transport.travel / s.transport.total >= g.value
        : s.eliteStage >= g.value;
}
export function damagePlayer(s: State, amount: number, reason: string) {
  if (s.status !== 'running' || s.invulnerable > 0 || !Number.isFinite(amount) || amount <= 0)
    return;
  const blocked = Math.min(s.player.shield, amount);
  s.player.shield -= blocked;
  s.player.hull = Math.max(0, s.player.hull - (amount - blocked));
  if (blocked > 0 && s.player.shield === 0) {
    s.events.push('shield');
    impact(s, 'shield', s.player);
  }
  s.damageAgo = 0;
  s.invulnerable = 0.6;
  s.events.push('damage');
  impact(s, 'damage', s.player);
  tell(s, reason);
  if (!s.player.hull) finish(s, false, reason);
}
function hit(s: State, e: Enemy, amount: number) {
  if (e.hp <= 0) return;
  if (e.kind === 'elite' && s.enemies.some((a) => a.hp > 0 && a.kind !== 'elite')) {
    tell(s, '精英护盾链接 · 先击落护航机');
    return;
  }
  const blocked = Math.min(e.shield, amount);
  e.shield -= blocked;
  amount -= blocked;
  if (blocked > 0 && e.shield === 0) {
    s.events.push('shield');
    impact(s, 'shield', e);
  }
  // Phase thresholds stop a single volley skipping reinforcements and their readable transition.
  const floor = e.kind === 'elite' && e.stage < 3 ? e.maxHp * (1 - e.stage / 3) : 0;
  e.hp = Math.max(floor, e.hp - amount);
  s.events.push('hit');
  impact(s, 'hit', e);
  if (e.kind === 'elite' && e.stage < 3 && e.hp <= floor) {
    e.stage++;
    s.eliteStage = e.stage;
    e.shield = 80;
    e.cooldown = 2.2;
    while (canSpawn(s)) spawnWave(s);
    tell(s, `精英阶段 ${e.stage}/3 · 护盾链接重新建立`);
    s.events.push('phase');
  }
  if (!e.hp) {
    s.kills++;
    s.score += e.kind === 'elite' ? 600 : 100;
    s.events.push('kill');
    impact(s, 'kill', e);
    if (e.kind === 'elite') s.eliteKilled = true;
    s.pickups.push({
      x: e.x,
      y: e.y,
      z: e.z,
      id: s.nextId++,
      life: s.mission.objective.kind === 'recover' ? Infinity : 80,
    });
  }
}
function spawnShot(
  s: State,
  owner: Shot['owner'],
  from: Point,
  to: Point,
  speed: number,
  target = 0,
  source = 0,
) {
  if (s.shots.length >= 96) return;
  const n = distance(from, to) || 1;
  s.shots.push({
    ...from,
    id: s.nextId++,
    owner,
    target,
    source,
    missile: !!target,
    life: target ? 5 : 4,
    velocity: {
      x: ((to.x - from.x) / n) * speed,
      y: ((to.y - from.y) / n) * speed,
      z: ((to.z - from.z) / n) * speed,
    },
  });
}
export function enemyCanFire(e: Enemy, target: Point, aim: Point = target) {
  const d = direction(e.yaw, e.pitch),
    n = distance(e, aim) || 1;
  return (
    distance(e, target) < 700 &&
    distance(e, target) > 35 &&
    ((aim.x - e.x) * d.x + (aim.y - e.y) * d.y + (aim.z - e.z) * d.z) / n >=
      Math.cos((18 * Math.PI) / 180) &&
    lineClear(e, target)
  );
}
function moveTransport(s: State) {
  const t = s.transport,
    o = s.mission.objective;
  if (!t || o.kind !== 'escort' || t.leg >= o.route.length) return;
  const a = o.route[t.leg],
    to = { x: a[0], y: a[1], z: a[2] },
    n = distance(t, to),
    move = Math.min(n, o.speed * DT);
  t.yaw = Math.atan2(to.x - t.x, -(to.z - t.z));
  for (const k of ['x', 'y', 'z'] as const) t[k] += ((to[k] - t[k]) / Math.max(n, 0.001)) * move;
  t.travel = Math.min(t.total, t.travel + move);
  t.y = Math.max(t.y, surfaceHeight(t.x, t.z) + 30);
  if (n <= o.speed * DT) t.leg++;
}
function advanceEnemy(s: State, e: Enemy) {
  if (e.hp <= 0) return;
  const p = s.player,
    target = s.transport && e.kind !== 'skirmisher' ? s.transport : p,
    dist = distance(e, target),
    heavy = e.kind === 'heavy' || e.kind === 'elite';
  let yaw = Math.atan2(target.x - e.x, -(target.z - e.z));
  if (!e.priority) {
    if (e.kind === 'skirmisher' && dist < 420)
      yaw += Math.sin(s.tick * DT * 0.35 + e.phase) > 0 ? 0.85 : -0.85;
    else if (dist < 160) yaw += 1.7;
    const rate = heavy ? 0.55 : e.kind === 'skirmisher' ? 1.03 : 1.2;
    e.yaw = angleDelta(e.yaw + clamp(angleDelta(yaw, e.yaw), -rate * DT, rate * DT), 0);
    const pitch = Math.atan2(target.y - e.y, Math.hypot(target.x - e.x, target.z - e.z));
    e.pitch += clamp(pitch - e.pitch, -0.45 * DT, 0.45 * DT);
  }
  const speed = e.priority
    ? 104
    : heavy
      ? dist > 400
        ? 90
        : 55
      : e.kind === 'skirmisher'
        ? dist > 500
          ? 118
          : 76
        : dist > 300
          ? 132
          : 72;
  const d = direction(e.yaw, e.priority ? 0 : e.pitch);
  for (const k of ['x', 'y', 'z'] as const) e[k] += d[k] * speed * DT;
  e.travel += speed * DT;
  e.y = clamp(Math.max(e.y, surfaceHeight(e.x, e.z) + 30), 40, FLIGHT_CEILING - 15);
  e.cooldown -= DT;
  e.telegraph = heavy && e.cooldown > 0 && e.cooldown < 1.2 ? 1 - e.cooldown / 1.2 : 0;
  if (e.priority) return;
  if (e.cooldown <= 0) {
    const lead = target === p ? Math.min(1, dist / 230) * 0.4 : 0,
      aim = {
        x: target.x + Math.sin(p.yaw) * p.speed * lead,
        y: target.y,
        z: target.z - Math.cos(p.yaw) * p.speed * lead,
      };
    if (enemyCanFire(e, target, aim)) {
      const count = e.kind === 'elite' ? e.stage * 2 + 1 : heavy ? 3 : 1;
      for (let i = 0; i < count; i++) {
        const angle = (i - (count - 1) / 2) * 0.035,
          dx = aim.x - e.x,
          dz = aim.z - e.z;
        const to = {
          x: e.x + dx * Math.cos(angle) - dz * Math.sin(angle),
          y: aim.y + (random(s) - 0.5) * 9,
          z: e.z + dx * Math.sin(angle) + dz * Math.cos(angle),
        };
        if (enemyCanFire(e, target, to)) spawnShot(s, 'enemy', e, to, heavy ? 205 : 180, 0, e.id);
      }
      e.cooldown = heavy ? 4.8 - e.stage * 0.5 : 2.8 + random(s);
      e.telegraph = 0;
      s.events.push('enemy-fire');
    } else if (heavy) e.cooldown = 1.2;
  }
}
export function step(s: State, input: Partial<Controls> = {}) {
  s.events = [];
  if (s.status !== 'running') return;
  s.tick++;
  s.impacts = s.impacts.filter((e) => s.tick - e.tick < 50).slice(-40);
  const oldTransport = s.transport ? { ...s.transport } : null;
  moveTransport(s);
  while (canSpawn(s)) spawnWave(s);
  const p = s.player,
    before = new Map<number, Point>([
      [0, { ...p }],
      ...s.enemies.map((e) => [e.id, { ...e }] as [number, Point]),
    ]);
  for (const key of ['scanCooldown', 'scanTime', 'invulnerable', 'noticeTime'] as const)
    s[key] = Math.max(0, s[key] - DT);
  s.damageAgo += DT;
  s.boosting = advanceFlight(p, s.craft, input, s.boosting);
  const floor = airframeFloor(p, s.craft.samples);
  if (p.y < floor) {
    p.y = floor;
    p.pitch = 0.3;
    p.y = Math.max(p.y, airframeFloor(p, s.craft.samples));
    damagePlayer(s, 35, '撞击地形 · 保持高度');
  } else if (p.y - floor < 18 && s.tick % 90 === 0) {
    tell(s, '近地风险 · 拉升避开翼尖碰撞');
    s.events.push('danger');
  }
  if (p.y > FLIGHT_CEILING) {
    p.y = FLIGHT_CEILING;
    p.pitch = -0.2;
    tell(s, '空域上限 · 降低高度');
  }
  if (s.status !== 'running') return;
  if (s.damageAgo > 5) p.shield = Math.min(s.craft.shield, p.shield + 7 * DT);
  const d = direction(p.yaw, p.pitch),
    muzzle = { x: p.x + d.x * 15, y: p.y + d.y * 15, z: p.z + d.z * 15 };
  if (advanceWeapons(s, s.craft, input.fire === true)) {
    const target = targetInCone(s) || {
      x: p.x + d.x * 600,
      y: p.y + d.y * 600,
      z: p.z + d.z * 600,
    };
    spawnShot(s, 'player', muzzle, target, 440);
    s.events.push('shoot');
    if (s.overheated) tell(s, '武器过热 · 松开开火冷却');
  }
  if (input.missile === true) {
    const target = targetInCone(s, 25, 900);
    if (consumeMissile(s, !!target)) {
      spawnShot(s, 'player', muzzle, target!, 245, target!.id);
      s.events.push('missile');
    } else if (!target) tell(s, '未锁定 · 将目标带入前方锁定框');
    else if (!s.missiles) tell(s, '导弹耗尽 · 使用脉冲炮');
  }
  if (input.scan === true && s.scanCooldown === 0) {
    s.scanTime = 6;
    s.scanCooldown = 10;
    s.events.push('scan');
    tell(s, '扫描开启 · 接近残骸回收护盾与能量');
  }
  for (const e of s.enemies) {
    advanceEnemy(s, e);
    if (e.hp > 0 && sweptDistance(before.get(0)!, p, before.get(e.id) || e, e) < 14)
      damagePlayer(s, 14, '与敌机相撞 · 拉开距离');
  }
  for (const shot of s.shots) {
    if (s.status !== 'running') break;
    const a = { x: shot.x, y: shot.y, z: shot.z };
    if (shot.missile) {
      const target = s.enemies.find((e) => e.id === shot.target && e.hp > 0);
      if (target) {
        const n = distance(shot, target) || 1;
        for (const k of ['x', 'y', 'z'] as const)
          shot.velocity[k] += (((target[k] - shot[k]) / n) * 260 - shot.velocity[k]) * DT * 5;
      }
    }
    for (const k of ['x', 'y', 'z'] as const) shot[k] += shot.velocity[k] * DT;
    shot.life -= DT;
    if (!lineClear(a, shot)) {
      shot.life = 0;
      continue;
    }
    if (shot.owner === 'player') {
      for (const e of s.enemies)
        if (e.hp > 0 && sweptDistance(a, shot, before.get(e.id) || e, e) < 12 && lineClear(a, e)) {
          hit(s, e, shot.missile ? 90 : 18);
          shot.life = 0;
          break;
        }
    } else if (sweptDistance(a, shot, before.get(0)!, p) < 7 && lineClear(a, p)) {
      damagePlayer(s, 14, '敌方炮火击穿机体');
      shot.life = 0;
    } else if (
      s.transport &&
      oldTransport &&
      sweptDistance(a, shot, oldTransport, s.transport) < 14
    ) {
      s.transport.hull = Math.max(0, s.transport.hull - 9);
      shot.life = 0;
      s.events.push('escort-hit');
      if (!s.transport.hull) finish(s, false, '运输机被击落 · 优先拦截攻击它的重机');
    }
  }
  s.shots = s.shots.filter((b) => b.life > 0);
  s.enemies = s.enemies.filter((e) => e.hp > 0);
  for (const item of s.pickups) {
    item.life -= DT;
    const n = distance(item, p);
    if (n < (s.scanTime > 0 ? 420 : 70)) {
      const move = Math.min(1, DT * ((s.scanTime > 0 ? 320 : 180) / Math.max(1, n) + 2.6));
      for (const k of ['x', 'y', 'z'] as const) item[k] += (p[k] - item[k]) * move;
    }
    if (distance(item, p) < 20) {
      item.life = 0;
      s.recovered++;
      s.score += 50;
      p.shield = Math.min(s.craft.shield, p.shield + 20);
      p.energy = Math.min(100, p.energy + 25);
      s.events.push('pickup');
      impact(s, 'pickup', item);
    }
  }
  s.pickups = s.pickups.filter((i) => i.life > 0);
  const o = s.mission.objective,
    allSpawned = s.wave === s.mission.waves.length - 1;
  if (o.kind === 'intercept' && s.enemies.some((e) => e.priority && e.travel >= o.escapeDistance))
    finish(s, false, '信标机逃出边界 · 使用加速优先截击');
  if (s.tick * DT >= s.mission.timeLimit) finish(s, false, '任务超时 · 完成当前目标');
  const won =
    o.kind === 'recover'
      ? s.recovered >= o.count
      : o.kind === 'escort'
        ? !!s.transport && s.transport.leg >= o.route.length && s.transport.hull > 0
        : o.kind === 'elite'
          ? s.eliteKilled
          : allSpawned && !s.enemies.length;
  if (won)
    finish(
      s,
      true,
      o.kind === 'recover'
        ? '黑匣回声全部回收'
        : o.kind === 'escort'
          ? '运输机安全抵达终点'
          : o.kind === 'elite'
            ? '精英核心已摧毁'
            : o.kind === 'intercept'
              ? '全部逃逸信标已拦截'
              : '空域已肃清',
    );
}
