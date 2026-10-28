// Test pilot produces only public controls, never edits a run or advances its clock.
export function pilot(s) {
  const p = s.player;
  const e = s.enemies.reduce(
    (best, e) =>
      !best ||
      Math.hypot(e.x - p.x, e.y - p.y, e.z - p.z) <
        Math.hypot(best.x - p.x, best.y - p.y, best.z - p.z)
        ? e
        : best,
    null,
  );
  if (!e) return {};
  const yaw = Math.atan2(e.x - p.x, -(e.z - p.z)),
    delta = Math.atan2(Math.sin(yaw - p.yaw), Math.cos(yaw - p.yaw));
  const pitch = Math.atan2(e.y - p.y, Math.hypot(e.x - p.x, e.z - p.z));
  return {
    x: Math.max(-1, Math.min(1, delta * 3)),
    y: Math.max(-1, Math.min(1, (pitch - p.pitch) * 4)),
    fire: !s.overheated,
    missile: Math.abs(delta) < 0.25 && s.missileCooldown === 0,
    scan: s.pickups.length > 0 && s.scanCooldown === 0,
  };
}
