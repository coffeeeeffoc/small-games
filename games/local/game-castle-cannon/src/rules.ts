import type { Level, ModuleSpec } from './levels.js';
export type Ammo = 'solid' | 'blast';
export interface Unit {
  id: number;
  x: number;
  hp: number;
  arrived: boolean;
}
export interface Module extends ModuleSpec {
  maxHp: number;
  destroyedAt: number | null;
}
export interface Shot {
  x: number;
  y: number;
  ammo: Ammo;
  remaining: number;
  hits: string[];
}
export interface Battle {
  level: Level;
  time: number;
  reload: number;
  modules: Module[];
  units: Unit[];
  capture: number;
  result: 'playing' | 'won' | 'lost';
  shots: Shot[];
  arrows: number;
  lastArrow: number;
  losses: number;
  notice: string;
  events: { time: number; type: string; target: string }[];
}
export const ORIGIN = { x: 126, y: 350 };
export const RELOAD = 2.8;
export function createBattle(level: Level, bonus = 0): Battle {
  return {
    level,
    time: 0,
    reload: 0,
    modules: level.modules.map((m) => ({ ...m, maxHp: m.hp, destroyedAt: null })),
    units: Array.from({ length: level.soldiers + bonus }, (_, id) => ({
      id,
      x: level.staging - (id % 4) * 23,
      hp: 3,
      arrived: false,
    })),
    capture: 0,
    result: 'playing',
    shots: [],
    arrows: 0,
    lastArrow: 0,
    losses: 0,
    notice: level.hint,
    events: [],
  };
}
export function alive(b: Battle) {
  return b.units.filter((u) => u.hp > 0);
}
export function shoot(b: Battle, ammo: Ammo, x: number, y: number): boolean {
  if (
    b.result !== 'playing' ||
    b.reload > 0 ||
    ![x, y].every(Number.isFinite) ||
    x < 220 ||
    x > 880 ||
    y < 95 ||
    y > 360
  )
    return false;
  const dx = x - ORIGIN.x,
    dy = y - ORIGIN.y,
    length = Math.hypot(dx, dy);
  const targets = b.modules
    .filter((m) => m.hp > 0)
    .map((m) => {
      const projection = ((m.x - ORIGIN.x) * dx + (m.y - ORIGIN.y) * dy) / length;
      const distance = Math.abs((m.x - ORIGIN.x) * dy - (m.y - ORIGIN.y) * dx) / length;
      return { m, projection, distance };
    })
    .filter(
      (v) => v.projection > 0 && v.projection <= length + v.m.radius && v.distance <= v.m.radius,
    )
    .sort((a, c) => a.projection - c.projection);
  // Coordinates supplied by scene picking identify the visible aimed module. Content-space
  // approach rays must not redirect that aim into a gate that is elsewhere in the 3D view.
  const aimed = b.modules
    .filter((m) => m.hp > 0)
    .map((m) => ({ m, distance: Math.hypot(m.x - x, m.y - y) }))
    .filter((t) => t.distance <= t.m.radius)
    .sort((a, c) => a.distance - c.distance)[0]?.m;
  const direct = aimed ?? targets[0]?.m;
  const impact = direct ?? { x, y };
  const hits =
    ammo === 'solid'
      ? direct
        ? [direct.id]
        : []
      : b.modules
          .filter((m) => m.hp > 0 && Math.hypot(m.x - impact.x, m.y - impact.y) <= 84)
          .map((m) => m.id);
  b.shots.push({ x: impact.x, y: impact.y, ammo, remaining: 0.38, hits });
  b.reload = RELOAD;
  b.events.push({ time: b.time, type: ammo, target: hits.join(',') });
  b.notice = hits.length ? '炮弹出膛！' : '打空了，瞄准建筑';
  return true;
}
function impact(b: Battle, s: Shot) {
  for (const id of s.hits) {
    const m = b.modules.find((v) => v.id === id)!;
    if (m.hp <= 0) continue;
    m.hp = Math.max(0, m.hp - (s.ammo === 'solid' ? 3 : 2));
    if (m.hp === 0) {
      m.destroyedAt = b.time;
      b.notice =
        m.kind === 'gate'
          ? '城门破了！小队突进'
          : m.kind === 'tower'
            ? '箭塔倒下！威胁减少'
            : '障碍清除，继续推进';
      b.events.push({ time: b.time, type: 'destroyed', target: m.id });
    } else
      b.notice = `${m.kind === 'tower' ? '箭塔' : m.kind === 'gate' ? '城门' : '障碍'}开裂，再来一炮`;
  }
}
/** Fixed substeps make arrows, capture and hits independent of caller frame rate. */
export function step(b: Battle, seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 120)
    throw new Error('Invalid time step');
  while (seconds > 1e-8 && b.result === 'playing') {
    const dt = Math.min(seconds, 0.05);
    seconds -= dt;
    b.time += dt;
    b.reload = Math.max(0, b.reload - dt);
    for (const shot of b.shots) {
      const before = shot.remaining;
      shot.remaining -= dt;
      if (before > 0 && shot.remaining <= 0) impact(b, shot);
    }
    b.shots = b.shots.filter((s) => s.remaining > -0.8);
    const blockers = b.modules.filter((m) => m.hp > 0 && m.kind !== 'tower');
    const barrier = blockers.length ? Math.min(...blockers.map((m) => m.x - 36)) : 830;
    for (const u of alive(b)) {
      u.x = Math.min(barrier, u.x + b.level.speed * dt);
      u.arrived = u.x >= 829;
    }
    const towers = b.modules.filter((m) => m.kind === 'tower' && m.hp > 0);
    // Towers can reach the approach, so waiting without shooting eventually loses.
    if (towers.length && b.time - b.lastArrow >= 0.7) {
      b.lastArrow = b.time;
      for (const tower of towers) {
        const victim = alive(b)
          .filter((u) => u.x >= 410)
          .sort((a, c) => c.x - a.x || a.id - c.id)[0];
        if (victim) {
          victim.hp -= tower.attack ?? 1;
          b.arrows++;
          if (victim.hp <= 0) {
            b.losses++;
            b.events.push({ time: b.time, type: 'casualty', target: String(victim.id) });
            b.notice = '箭塔压制！小队正在减员';
          }
        }
      }
    }
    const troops = alive(b);
    const arrived = troops.filter((u) => u.arrived).length;
    if (arrived) b.capture = Math.min(1, b.capture + ((arrived / 4) * dt) / b.level.capture);
    if (b.capture >= 1) {
      b.result = 'won';
      b.notice = '城堡占领！';
    } else if (!troops.length || b.time >= b.level.duration) {
      b.result = 'lost';
      b.notice = !troops.length
        ? '小队全员撤离，先拆箭塔减少伤亡'
        : '时间耗尽，清除通路上的门与障碍';
    }
  }
}
