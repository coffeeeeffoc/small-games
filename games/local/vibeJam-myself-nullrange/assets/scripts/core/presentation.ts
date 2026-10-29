import type { State } from './rules.ts';
import { rating } from './progress.ts';
import { totalEnemies, RADAR_RANGE, PULSE_RANGE, MISSILE_RANGE } from './content.ts';

export type Insets = { left: number; top: number; right: number; bottom: number };
export const ZERO_INSETS: Insets = { left: 0, top: 0, right: 0, bottom: 0 };
export function logicalInsets(physical: Insets, rotated: boolean, scale: number): Insets {
  const px = (n: number) => (Number.isFinite(n) ? Math.max(0, n) / scale : 0);
  return rotated
    ? {
        left: px(physical.top),
        top: px(physical.right),
        right: px(physical.bottom),
        bottom: px(physical.left),
      }
    : {
        left: px(physical.left),
        top: px(physical.top),
        right: px(physical.right),
        bottom: px(physical.bottom),
      };
}
export function safeBounds(width: number, height: number, web: Insets, native: Insets) {
  const edge = (a: number, b: number, limit: number) => Math.min(limit * 0.25, Math.max(0, a, b));
  const left = edge(web.left, native.left, width) + 18;
  const top = edge(web.top, native.top, height) + 12;
  const right = width - edge(web.right, native.right, width) - 18;
  const bottom = height - edge(web.bottom, native.bottom, height) - 12;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}
// Heading-up radar: screen-up is the aircraft's actual forward vector, not world north.
export function radarContacts(s: State, range = RADAR_RANGE) {
  const c = Math.cos(s.player.yaw),
    sn = Math.sin(s.player.yaw);
  return s.enemies
    .filter((e) => e.hp > 0)
    .map((e) => {
      const dx = e.x - s.player.x,
        dz = e.z - s.player.z;
      const right = dx * c + dz * sn,
        forward = dx * sn - dz * c;
      const length = Math.hypot(right, forward);
      const factor = 1 / Math.max(range, length);
      return {
        id: e.id,
        x: right * factor,
        y: -forward * factor,
        distance: length,
        outside: length > range,
      };
    });
}
export const missionRating = rating;
export function objectiveText(s: State) {
  const o = s.mission.objective;
  if (o.kind === 'recover')
    return `回收 ${s.recovered}/${o.count} · 波次 ${s.wave + 1}/${s.mission.waves.length}`;
  if (o.kind === 'escort' && s.transport)
    return `护航 ${Math.round((s.transport.travel / s.transport.total) * 100)}% · 运输机 ${Math.ceil((s.transport.hull / o.hull) * 100)}%`;
  if (o.kind === 'elite') {
    const e = s.enemies.find((e) => e.kind === 'elite');
    return `精英 ${s.eliteStage}/3 · ${e ? Math.ceil((e.hp / e.maxHp) * 100) : 0}% ${s.enemies.length > 1 ? '护盾链接' : ''}`;
  }
  if (o.kind === 'intercept') {
    const e = s.enemies.find((e) => e.priority);
    return e
      ? `信标 ${s.wave}/${s.mission.waves.length} · 逃逸 ${Math.round((e.travel / o.escapeDistance) * 100)}%`
      : `信标 ${s.wave + 1}/${s.mission.waves.length} · 剩余护航 ${s.enemies.length}`;
  }
  return `击落 ${s.kills}/${totalEnemies(s.mission)} · 波次 ${s.wave + 1}/${s.mission.waves.length}`;
}
export const distanceText = (metres: number) =>
  metres >= 1000 ? `${(metres / 1000).toFixed(1)}km` : `${Math.round(metres)}m`;
export function engagementHint(s: State, point: { x: number; y: number; z: number }) {
  if (s.noticeTime > 0) return s.notice;
  const dx = point.x - s.player.x,
    dz = point.z - s.player.z;
  const heading = Math.atan2(dx, -dz) - s.player.yaw;
  if (Math.cos(heading) < 0) return '目标在后方 · 转向追击';
  const range = Math.hypot(dx, point.y - s.player.y, dz);
  return range > MISSILE_RANGE
    ? '超出射程 · 长按加速接近'
    : range > PULSE_RANGE
      ? s.missiles > 0
        ? s.missileCooldown > 0
          ? '导弹冷却 · 保持目标在前方'
          : '导弹射程内 · 对准目标发射'
        : '导弹耗尽 · 接近至1.8km使用机炮'
      : '机炮射程内 · 对准目标开火';
}
export function navigationTarget(s: State) {
  const nearest = (a: { x: number; y: number; z: number }[]) =>
    a.reduce(
      (best, e) =>
        !best ||
        Math.hypot(e.x - s.player.x, e.z - s.player.z) <
          Math.hypot(best.x - s.player.x, best.z - s.player.z)
          ? e
          : best,
      null as { x: number; y: number; z: number } | null,
    );
  if (s.mission.objective.kind === 'recover' && s.pickups.length)
    return { point: nearest(s.pickups)!, label: '回收残骸' };
  const priority = s.enemies.find((e) => e.priority);
  if (priority) return { point: priority, label: '主目标·信标机' };
  if (s.transport) return { point: s.transport, label: '友方运输机' };
  const e = nearest(s.enemies);
  return e ? { point: e, label: '敌方目标' } : null;
}
