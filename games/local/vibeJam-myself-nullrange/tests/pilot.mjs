import { surfaceHeight } from '../assets/scripts/core/flight-geometry.ts';
// Pure control policy: no state writes, clock changes, teleporting, or injected damage.
export function pilot(s) {
  const p = s.player,
    dist = (e) => Math.hypot(e.x - p.x, e.y - p.y, e.z - p.z);
  const escorts = s.enemies.filter((e) => e.hp > 0 && e.kind !== 'elite');
  const priority = s.enemies.find((e) => e.priority);
  const targets = priority ? [priority] : escorts.length ? escorts : s.enemies;
  const targetCost = (e) => {
    const yaw = Math.atan2(e.x - p.x, -(e.z - p.z)) - p.yaw;
    return dist(e) + 1000 * Math.abs(Math.atan2(Math.sin(yaw), Math.cos(yaw)));
  };
  let e = targets.reduce((best, e) => (!best || targetCost(e) < targetCost(best) ? e : best), null);
  const recovery = s.mission.objective.kind === 'recover';
  const item = s.pickups.reduce((best, e) => (!best || dist(e) < dist(best) ? e : best), null);
  if (item && ((!e && recovery) || (p.shield < s.craft.shield * 0.4 && dist(item) < 750))) e = item;
  if (!e && s.transport) e = { ...s.transport, z: s.transport.z - 200, y: s.transport.y + 25 };
  if (!e)
    return {
      x: 0.35,
      y: Math.max(-0.9, Math.min(0.9, (1600 - p.y) * 0.01 - p.pitch * 3)),
      scan: true,
    };
  const n = dist(e),
    yaw = Math.atan2(e.x - p.x, -(e.z - p.z)),
    delta = Math.atan2(Math.sin(yaw - p.yaw), Math.cos(yaw - p.yaw)) + (e.hp && n < 300 ? 0.18 : 0);
  let pitch = Math.atan2(e.y - p.y, Math.hypot(e.x - p.x, e.z - p.z));
  for (const ahead of [50, 100, 150, 250, 500, 800, 1200, 1800, 2400]) {
    const floor = surfaceHeight(p.x + Math.sin(p.yaw) * ahead, p.z - Math.cos(p.yaw) * ahead) + 320;
    pitch = Math.max(pitch, Math.atan2(floor - p.y, ahead));
  }
  const x =
      Math.max(-1, Math.min(1, delta * 3)) * (pitch > 0.35 && pitch - p.pitch > 0.1 ? 0.15 : 1),
    y = Math.max(-1, Math.min(1, (pitch - p.pitch) * 4)),
    radius = Math.max(1, Math.hypot(x, y));
  return {
    x: x / radius,
    y: y / radius,
    fire: !s.overheated && !!e.hp,
    boost: n > 1600 && Math.abs(delta) < 0.25,
    missile: !!e.hp && Math.abs(delta) < 0.22 && s.missileCooldown === 0 && s.missiles > 0,
    scan: !!item && dist(item) < 1000 && s.scanCooldown === 0,
  };
}
