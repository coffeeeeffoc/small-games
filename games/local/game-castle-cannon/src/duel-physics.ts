import { DUEL_RULES as R, nodePoint, duelGroundHeight, trenchFor } from './duel-map.js';
import { cancelCharge, travel, activeGun } from './duel-actions.js';
import { distance, type Duel, type Point, type Shell } from './duel-types.js';
export function segmentBox(a: Point, b: Point, center: Point, size: Point): number | null {
  let near = 0,
    far = 1;
  for (const axis of ['x', 'y', 'z'] as const) {
    const delta = b[axis] - a[axis],
      low = center[axis] - size[axis] / 2,
      high = center[axis] + size[axis] / 2;
    if (Math.abs(delta) < 1e-8) {
      if (a[axis] < low || a[axis] > high) return null;
    } else {
      const first = (low - a[axis]) / delta,
        second = (high - a[axis]) / delta;
      near = Math.max(near, Math.min(first, second));
      far = Math.min(far, Math.max(first, second));
      if (near > far) return null;
    }
  }
  return near;
}
export function cover(duel: Duel, from: Point, to: Point, exclude = '') {
  const covered = duel.structures.some(
    (s) => s.hp > 0 && s.id !== exclude && segmentBox(from, to, s.position, s.size) !== null,
  );
  return (
    covered ||
    ([0, 1] as const).some((side) => {
      const t = trenchFor(side);
      return segmentBox(from, to, t.position, t.size) !== null;
    })
  );
}
function hitShell(duel: Duel, shell: Shell, previous: Point) {
  const floor = duelGroundHeight(shell.position.x, shell.position.z);
  const before = previous.y - duelGroundHeight(previous.x, previous.z),
    after = shell.position.y - floor;
  let fraction = after <= 0 ? Math.max(0, before / (before - after)) : 2;
  let hit = 'terrain';
  const consider = (id: string, center: Point, size: Point) => {
    const t = segmentBox(previous, shell.position, center, size);
    if (t !== null && t < fraction) {
      fraction = t;
      hit = id;
    }
  };
  for (const s of duel.structures) if (s.hp > 0) consider(s.id, s.position, s.size);
  for (const p of duel.fighters) {
    const trench = trenchFor(p.side);
    consider(`trench:${p.side}`, trench.position, trench.size);
    const h = p.crouched ? 0.55 : 1.9;
    if (p.hp > 0)
      consider(
        `player:${p.side}`,
        { ...p.position, y: p.position.y + h / 2 },
        { x: 0.85, y: h, z: 0.85 },
      );
    for (const g of p.guns)
      if (g.hp > 0 && g.bunker === p.destroyed)
        consider(
          `gun:${p.side}:${g.id}`,
          { ...g.position, y: g.position.y + 1 },
          { x: 2.7, y: 2, z: 2.7 },
        );
    const bunker = nodePoint(p.side, 'shelter');
    consider(`bunker:${p.side}`, { ...bunker, y: 1.1 }, { x: 7, y: 2.2, z: 6 });
  }
  if (fraction > 1) return false;
  shell.position = {
    x: previous.x + (shell.position.x - previous.x) * fraction,
    y: previous.y + (shell.position.y - previous.y) * fraction,
    z: previous.z + (shell.position.z - previous.z) * fraction,
  };
  explode(duel, shell, hit);
  return true;
}
export function explode(duel: Duel, shell: Shell, hit: string) {
  const cfg = R[shell.ammo],
    energy = 0.7 + shell.power * 0.3;
  // Capture cover before destroying any wall, so array order cannot remove blast shielding.
  const shields = duel.fighters.map((p) =>
    cover(duel, shell.position, { ...p.position, y: p.position.y + 0.8 }, hit),
  );
  for (const s of duel.structures)
    if (s.hp > 0) {
      const surfaceDistance = Math.hypot(
        ...(['x', 'y', 'z'] as const).map((axis) =>
          Math.max(0, Math.abs(s.position[axis] - shell.position[axis]) - s.size[axis] / 2),
        ),
      );
      const damage =
        s.id === hit
          ? cfg.structure * energy
          : cfg.structure * energy * 0.65 * Math.max(0, 1 - surfaceDistance / cfg.radius);
      s.hp = Math.max(0, s.hp - damage);
    }
  for (const p of duel.fighters) {
    for (const gun of p.guns)
      if (gun.repair !== null && distance(gun.position, shell.position) < cfg.radius)
        gun.repair = 0;
    for (const gun of p.guns)
      if (!gun.bunker && gun.hp > 0) {
        const d = distance(gun.position, shell.position);
        gun.hp = Math.max(
          0,
          gun.hp -
            (hit === `gun:${p.side}:${gun.id}` ? 65 : Math.max(0, 1 - d / cfg.radius) * 35) *
              energy,
        );
      }
    const d = distance({ ...p.position, y: p.position.y + 0.8 }, shell.position);
    let damage = cfg.character * energy * Math.max(0, 1 - d / cfg.radius);
    if (hit === `player:${p.side}`) damage = cfg.character * energy * 1.15;
    if (shields[p.side]) damage *= 0.22;
    if (p.crouched) damage *= 0.65;
    if (p.node === 'shelter' && !p.route.length) damage *= p.destroyed ? 0.5 : 0.18;
    if (hit === `bunker:${p.side}` && p.node === 'shelter' && !p.route.length)
      damage = Math.max(damage, cfg.character * energy * (p.destroyed ? 0.45 : 0.12));
    p.hp = Math.max(0, p.hp - damage);
  }
  const last = duel.fighters[shell.side].lastShot;
  if (last) {
    last.impact = { ...shell.position };
    last.trail = [...shell.trail, { ...shell.position }];
  }
  duel.impacts.push({
    id: shell.id,
    position: { ...shell.position },
    at: duel.time,
    ammo: shell.ammo,
    hit,
  });
}
export function advanceShells(duel: Duel, dt: number) {
  const survivors: Shell[] = [];
  for (const s of duel.shells) {
    const before = { ...s.position };
    s.position.x += s.velocity.x * dt;
    s.position.z += s.velocity.z * dt;
    s.position.y += s.velocity.y * dt - (R.gravity * dt * dt) / 2;
    s.velocity.y -= R.gravity * dt;
    s.age += dt;
    if (duel.tick % 6 === 0) s.trail.push({ ...s.position });
    if (s.trail.length > 90) s.trail.shift();
    if (
      !hitShell(duel, s, before) &&
      s.age < 12 &&
      Math.abs(s.position.x) < 220 &&
      Math.abs(s.position.z) < 130
    )
      survivors.push(s);
  }
  duel.shells = survivors;
  duel.impacts = duel.impacts.filter((i) => duel.time - i.at < 4);
  for (const p of duel.fighters) {
    // Unsupported masonry falls with its lower section; collapsed cells no longer collide.
    for (const s of duel.structures.filter((s) => s.side === p.side)) {
      if (
        s.hp > 0 &&
        s.position.y > s.size.y / 2 + 0.1 &&
        duel.structures.some(
          (below) =>
            below.side === s.side &&
            below.position.x === s.position.x &&
            below.position.z === s.position.z &&
            Math.abs(below.position.y + below.size.y / 2 - (s.position.y - s.size.y / 2)) < 0.1 &&
            below.hp <= 0,
        )
      )
        s.hp = 0;
    }
    const cityGone = duel.structures.every((s) => s.side !== p.side || s.hp <= 0);
    if (cityGone && !p.destroyed) {
      p.destroyed = true;
      for (const g of p.guns) if (!g.bunker) g.hp = 0;
      cancelCharge(p);
      if (p.hp > 0 && p.node !== 'shelter') travel(p, 'shelter');
    } else if (p.station && activeGun(p)?.hp === 0 && activeGun(p)?.repair === null && p.hp > 0)
      travel(p, 'shelter');
  }
}
