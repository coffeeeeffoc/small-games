import { MISSIONS, validateMission } from './content.ts';
import type { Mission } from './content.ts';
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
export type Enemy = Point & {
  id: number;
  hp: number;
  yaw: number;
  cooldown: number;
  phase: number;
};
export type Shot = Point & {
  id: number;
  velocity: Point;
  owner: 'player' | 'enemy';
  target: number;
  missile: boolean;
  life: number;
};
export type State = ReturnType<typeof createRun>;
export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
export const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const direction = (yaw: number, pitch = 0): Point => ({
  x: Math.sin(yaw) * Math.cos(pitch),
  y: Math.sin(pitch),
  z: -Math.cos(yaw) * Math.cos(pitch),
});
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export function createRun(mission: Mission = MISSIONS[0]) {
  validateMission(mission);
  return {
    mission,
    status: 'running' as 'running' | 'won' | 'lost',
    reason: '',
    tick: 0,
    seed: mission.seed >>> 0,
    player: {
      x: 0,
      y: 95,
      z: 0,
      yaw: 0,
      pitch: 0,
      roll: 0,
      speed: 92,
      hull: 100,
      shield: 70,
      energy: 100,
    },
    enemies: mission.enemies.map(
      (e, i): Enemy => ({ ...e, id: i + 1, yaw: Math.PI, cooldown: 2.8 + i, phase: i * 2.1 }),
    ),
    shots: [] as Shot[],
    pickups: [] as (Point & { id: number; life: number })[],
    events: [] as string[],
    nextId: 100,
    kills: 0,
    recovered: 0,
    score: 0,
    heat: 0,
    overheated: false,
    shotCooldown: 0,
    missiles: 6,
    missileCooldown: 0,
    scanCooldown: 0,
    scanTime: 0,
    invulnerable: 0,
    damageAgo: 10,
    notice: '',
    noticeTime: 0,
    boosting: false,
  };
}
function random(s: State) {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed / 4294967296;
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
    if (dot >= cone && dot - length * 0.00006 > rank) {
      rank = dot - length * 0.00006;
      result = e;
    }
  }
  return result;
}
/** Relative swept segment handles both projectile and target movement in one tick. */
export function sweptDistance(a: Point, b: Point, oldTarget: Point, target: Point) {
  const x = a.x - oldTarget.x,
    y = a.y - oldTarget.y,
    z = a.z - oldTarget.z;
  const dx = b.x - target.x - x,
    dy = b.y - target.y - y,
    dz = b.z - target.z - z;
  const length2 = dx * dx + dy * dy + dz * dz;
  const t = length2 ? clamp(-(x * dx + y * dy + z * dz) / length2, 0, 1) : 0;
  return Math.hypot(x + dx * t, y + dy * t, z + dz * t);
}
function tell(s: State, text: string) {
  s.notice = text;
  s.noticeTime = 2.5;
}
function spawnShot(
  s: State,
  owner: Shot['owner'],
  from: Point,
  to: Point,
  speed: number,
  target = 0,
) {
  const n = distance(from, to) || 1;
  s.shots.push({
    ...from,
    id: s.nextId++,
    owner,
    target,
    missile: !!target,
    life: target ? 5 : 3,
    velocity: {
      x: ((to.x - from.x) / n) * speed,
      y: ((to.y - from.y) / n) * speed,
      z: ((to.z - from.z) / n) * speed,
    },
  });
}
export function damagePlayer(s: State, amount: number, reason: string) {
  if (s.status !== 'running' || s.invulnerable > 0 || !Number.isFinite(amount) || amount <= 0)
    return;
  const blocked = Math.min(s.player.shield, amount);
  s.player.shield -= blocked;
  s.player.hull = Math.max(0, s.player.hull - (amount - blocked));
  s.damageAgo = 0;
  s.invulnerable = 0.6;
  s.events.push('damage');
  tell(s, reason);
  if (!s.player.hull) {
    s.status = 'lost';
    s.reason = reason;
    s.events.push('lost');
  }
}
function hit(s: State, e: Enemy, amount: number) {
  if (e.hp <= 0) return;
  e.hp = Math.max(0, e.hp - amount);
  s.events.push('hit');
  if (!e.hp) {
    s.kills++;
    s.score += 100;
    s.events.push('kill');
    s.pickups.push({ x: e.x, y: e.y, z: e.z, id: s.nextId++, life: 40 });
  }
}
export function step(s: State, input: Partial<Controls> = {}) {
  s.events = [];
  if (s.status !== 'running') return;
  s.tick++;
  const p = s.player,
    before = new Map<number, Point>([
      [0, { ...p }],
      ...s.enemies.map((e) => [e.id, { ...e }] as [number, Point]),
    ]);
  for (const key of [
    'shotCooldown',
    'missileCooldown',
    'scanCooldown',
    'scanTime',
    'invulnerable',
    'noticeTime',
  ] as const)
    s[key] = Math.max(0, s[key] - DT);
  s.damageAgo += DT;
  const x = Number.isFinite(input.x) ? clamp(input.x!, -1, 1) : 0;
  const y = Number.isFinite(input.y) ? clamp(input.y!, -1, 1) : 0;
  p.yaw = angleDelta(p.yaw + x * 1.42 * DT, 0);
  p.pitch = clamp(
    p.pitch + y * 0.95 * DT - p.pitch * DT * (Math.abs(y) < 0.05 ? 1.1 : 0.1),
    -0.7,
    0.7,
  );
  p.roll += (-x * 0.65 - p.roll) * DT * 7;
  s.boosting = input.boost === true && p.energy > (s.boosting ? 0 : 12);
  p.energy = clamp(p.energy + DT * (s.boosting ? -29 : 20), 0, 100);
  p.speed += ((s.boosting ? 165 : 92) - p.speed) * DT * 3;
  const d = direction(p.yaw, p.pitch);
  p.x += d.x * p.speed * DT;
  p.y += d.y * p.speed * DT;
  p.z += d.z * p.speed * DT;
  const floor = airframeFloor(p);
  if (p.y < floor) {
    p.y = floor;
    p.pitch = 0.3;
    p.y = Math.max(p.y, airframeFloor(p));
    damagePlayer(s, 35, '撞击地形 · 保持高度');
  }
  if (p.y > FLIGHT_CEILING) {
    p.y = FLIGHT_CEILING;
    p.pitch = -0.2;
    tell(s, '空域上限 · 降低高度');
  }
  if (s.status !== 'running') return;
  if (s.damageAgo > 5) p.shield = Math.min(70, p.shield + 7 * DT);
  s.heat = Math.max(0, s.heat - DT * (input.fire === true ? 0.22 : 0.55));
  if (s.overheated && s.heat < 0.3) s.overheated = false;
  const muzzle = { x: p.x + d.x * 13, y: p.y + d.y * 13, z: p.z + d.z * 13 };
  if (input.fire === true && !s.overheated && s.shotCooldown === 0) {
    const target = targetInCone(s) || {
      x: p.x + d.x * 600,
      y: p.y + d.y * 600,
      z: p.z + d.z * 600,
    };
    spawnShot(s, 'player', muzzle, target, 440);
    s.shotCooldown = 0.13;
    s.heat = Math.min(1, s.heat + 0.105);
    s.events.push('shoot');
    if (s.heat >= 0.99) {
      s.overheated = true;
      tell(s, '武器过热 · 松开开火冷却');
    }
  }
  if (input.missile === true) {
    const target = targetInCone(s, 25, 900);
    if (!target) tell(s, '未锁定 · 将目标带入前方锁定框');
    else if (!s.missiles) tell(s, '导弹耗尽 · 使用脉冲炮');
    else if (s.missileCooldown > 0) tell(s, '导弹冷却中');
    else {
      spawnShot(s, 'player', muzzle, target, 245, target.id);
      s.missiles--;
      s.missileCooldown = 3;
      s.events.push('missile');
    }
  }
  if (input.scan === true && s.scanCooldown === 0) {
    s.scanTime = 6;
    s.scanCooldown = 10;
    s.events.push('scan');
    tell(s, '扫描开启 · 接近残骸回收护盾与能量');
  }
  for (const e of s.enemies) {
    const dist = distance(e, p),
      yaw = Math.atan2(p.x - e.x, -(p.z - e.z));
    e.yaw += clamp(angleDelta(yaw, e.yaw), -0.88 * DT, 0.88 * DT);
    const speed = dist > 290 ? 120 : 62;
    e.x += Math.sin(e.yaw) * speed * DT;
    e.z -= Math.cos(e.yaw) * speed * DT;
    e.y += clamp(p.y - e.y + Math.sin(s.tick * DT * 0.8 + e.phase) * 16, -22, 22) * DT;
    e.y = Math.max(surfaceHeight(e.x, e.z) + 25, e.y);
    e.cooldown -= DT;
    if (e.cooldown <= 0 && dist < 600 && dist > 35) {
      const lead = Math.min(1, dist / 230) * 0.55;
      spawnShot(
        s,
        'enemy',
        e,
        {
          x: p.x + d.x * p.speed * lead + (random(s) - 0.5) * 20,
          y: p.y + d.y * p.speed * lead + (random(s) - 0.5) * 20,
          z: p.z + d.z * p.speed * lead,
        },
        180,
      );
      e.cooldown = 2.6 + random(s);
    }
    if (sweptDistance(before.get(0)!, p, before.get(e.id)!, e) < 14)
      damagePlayer(s, 22, '与敌机相撞 · 拉开距离');
  }
  for (const shot of s.shots) {
    if (s.status !== 'running') break;
    const a = { x: shot.x, y: shot.y, z: shot.z };
    if (shot.missile) {
      const target = s.enemies.find((e) => e.id === shot.target && e.hp > 0);
      if (target) {
        const n = distance(shot, target) || 1;
        for (const key of ['x', 'y', 'z'] as const)
          shot.velocity[key] +=
            (((target[key] - shot[key]) / n) * 260 - shot.velocity[key]) * DT * 5;
      }
    }
    for (const key of ['x', 'y', 'z'] as const) shot[key] += shot.velocity[key] * DT;
    shot.life -= DT;
    if (shot.owner === 'player') {
      for (const e of s.enemies)
        if (e.hp > 0 && sweptDistance(a, shot, before.get(e.id)!, e) < 12) {
          hit(s, e, shot.missile ? 90 : 18);
          shot.life = 0;
          break;
        }
    } else if (sweptDistance(a, shot, before.get(0)!, p) < 7) {
      damagePlayer(s, 14, '敌方炮火击穿机体');
      shot.life = 0;
    }
    if (shot.y < surfaceHeight(shot.x, shot.z)) shot.life = 0;
  }
  s.shots = s.shots.filter((b) => b.life > 0);
  s.enemies = s.enemies.filter((e) => e.hp > 0);
  for (const item of s.pickups) {
    item.life -= DT;
    const n = distance(item, p);
    if (n < (s.scanTime > 0 ? 340 : 70)) {
      const move = Math.min(1, DT * ((s.scanTime > 0 ? 260 : 180) / Math.max(1, n) + 2.6));
      for (const key of ['x', 'y', 'z'] as const) item[key] += (p[key] - item[key]) * move;
    }
    if (distance(item, p) < 16) {
      item.life = 0;
      s.recovered++;
      s.score += 50;
      p.shield = Math.min(70, p.shield + 14);
      p.energy = Math.min(100, p.energy + 18);
      s.events.push('pickup');
    }
  }
  s.pickups = s.pickups.filter((i) => i.life > 0);
  if (s.status === 'running' && !s.enemies.length) {
    s.status = 'won';
    s.reason = '空域已肃清';
    s.score += Math.round(p.hull * 5);
    s.events.push('won');
  } else if (s.status === 'running' && s.tick * DT >= s.mission.timeLimit) {
    s.status = 'lost';
    s.reason = '任务超时 · 追击目标并开火';
    s.events.push('lost');
  }
}
