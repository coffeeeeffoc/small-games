import { surfaceHeight } from '../assets/scripts/core/flight-geometry.ts';
// Pure control policy: no state writes, clock changes, teleporting, or injected damage.
export function pilot(s) {
  const p = s.player,
    dist = (e) => Math.hypot(e.x - p.x, e.y - p.y, e.z - p.z);
  const escorts = s.enemies.filter((e) => e.hp > 0 && e.kind !== 'elite');
  const priority = s.enemies.find((e) => e.priority);
  const targets = priority ? [priority] : escorts.length ? escorts : s.enemies;
  let e = targets.reduce((best, e) => (!best || dist(e) < dist(best) ? e : best), null);
  const recovery = s.mission.objective.kind === 'recover';
  const item = s.pickups.reduce((best, e) => (!best || dist(e) < dist(best) ? e : best), null);
  if (
    item &&
    ((!e && recovery) ||
      (recovery && dist(item) < 440) ||
      (p.shield < s.craft.shield * 0.4 && dist(item) < 350))
  )
    e = item;
  if (!e && s.transport) e = { ...s.transport, z: s.transport.z - 200, y: s.transport.y + 25 };
  if (!e) return { x: 0.35, y: (180 - p.y) * 0.01 - p.pitch * 3, scan: true };
  const n = dist(e),
    yaw = Math.atan2(e.x - p.x, -(e.z - p.z)),
    delta = Math.atan2(Math.sin(yaw - p.yaw), Math.cos(yaw - p.yaw)) + (e.hp && n < 100 ? 0.18 : 0);
  const safeY = Math.max(
    e.y,
    surfaceHeight(p.x + Math.sin(p.yaw) * 160, p.z - Math.cos(p.yaw) * 160) + 40,
  );
  const pitch = Math.atan2(safeY - p.y, Math.hypot(e.x - p.x, e.z - p.z));
  return {
    x: Math.max(-1, Math.min(1, delta * 3)),
    y: Math.max(-1, Math.min(1, (pitch - p.pitch) * 4)),
    fire: !s.overheated && !!e.hp,
    boost: n > 620 && Math.abs(delta) < 0.25,
    missile: !!e.hp && Math.abs(delta) < 0.22 && s.missileCooldown === 0 && s.missiles > 0,
    scan: !!item && dist(item) < 480 && s.scanCooldown === 0,
  };
}
