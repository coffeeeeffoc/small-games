import {
  DIRECTIONS,
  SPACING,
  HALF,
  DOOR,
  RADIUS,
  EYE,
  openingId,
  roomPosition,
  sideOf,
} from './model.ts';
import type { Box, Level, Target, Run, Dir } from './model.ts';

export function geometry(level: Level) {
  const boxes: Box[] = [],
    targets: Target[] = [];
  for (const r of level.rooms) {
    const p = roomPosition(r);
    for (let dir = 0; dir < 4; dir++) {
      const d = DIRECTIONS[dir],
        horizontal = d.x === 0;
      const edge = level.edges.find(
        (e) =>
          (e.a === r.id || e.b === r.id) &&
          sideOf(r, level.rooms.find((n) => n.id === (e.a === r.id ? e.b : e.a))!) === dir,
      );
      const mirror = level.mirrors.some((m) => m.room === r.id && m.dir === dir);
      const wall = (offset: number, length: number) =>
        boxes.push({
          x: p.x + d.x * HALF + (horizontal ? offset : 0),
          z: p.z + d.z * HALF + (horizontal ? 0 : offset),
          w: horizontal ? length : 0.18,
          d: horizontal ? 0.18 : length,
          room: r.id,
        });
      if (edge) {
        wall(-(HALF + DOOR) / 2, HALF - DOOR);
        wall((HALF + DOOR) / 2, HALF - DOOR);
      } else wall(0, HALF * 2 + 0.18);
      const base = {
        room: r.id,
        dir: dir as Dir,
        x: p.x + d.x * (HALF - 0.13),
        y: EYE,
        z: p.z + d.z * (HALF - 0.13),
      };
      if (edge || mirror)
        targets.push({
          ...base,
          id: openingId(r.id, dir as Dir),
          kind: mirror ? 'mirror' : 'opening',
          label: '检查表面 / 开口',
        });
      // One physical plaque per doorway/branch, and a reference plaque on each other wall.
      targets.push({
        ...base,
        x: base.x + (horizontal ? (mirror ? 0.78 : 1.52) : 0),
        z: base.z + (horizontal ? 0 : mirror ? 0.78 : 1.52),
        id: `mark:${r.id}:${dir}`,
        kind: 'anchor',
        label: edge || mirror ? '这条支路的标记牌' : '房间参考标记牌',
      });
      const sw = level.switches.find((s) => s.room === r.id && s.dir === dir);
      if (sw)
        targets.push({
          ...base,
          id: `switch:${sw.id}`,
          kind: 'switch',
          switchId: sw.id,
          label: sw.label,
        });
      if (level.exit.room === r.id && level.exit.dir === dir)
        targets.push({ ...base, id: 'exit', kind: 'exit', label: '归途之门' });
    }
  }
  for (const e of level.edges) {
    const a = roomPosition(level.rooms.find((r) => r.id === e.a)!),
      b = roomPosition(level.rooms.find((r) => r.id === e.b)!);
    const horizontal = a.z === b.z,
      x = (a.x + b.x) / 2,
      z = (a.z + b.z) / 2;
    for (const sign of [-1, 1])
      boxes.push({
        x: x + (horizontal ? 0 : sign * DOOR),
        z: z + (horizontal ? sign * DOOR : 0),
        w: horizontal ? SPACING - HALF * 2 : 0.18,
        d: horizontal ? 0.18 : SPACING - HALF * 2,
        room: e.a,
      });
    if (e.gate)
      boxes.push({
        x,
        z,
        w: horizontal ? 0.2 : DOOR * 2,
        d: horizontal ? DOOR * 2 : 0.2,
        room: e.a,
        gate: e.gate,
      });
  }
  for (const r of level.rooms) {
    const p = roomPosition(r);
    boxes.push({ x: p.x - 2.1, z: p.z - 2.1, w: 1.3, d: 1.3, room: r.id, furniture: true });
    if (r.theme === 'garden')
      boxes.push({ x: p.x + 2.25, z: p.z - 2, w: 1.15, d: 1.15, room: r.id, furniture: true });
  }
  return { boxes, targets };
}
export const solidBoxes = (boxes: Box[], run: Run) =>
  boxes.filter((b) => !b.gate || !run.activated.includes(b.gate));
export function circleHits(x: number, z: number, b: Box, radius = RADIUS) {
  const dx = x - Math.max(b.x - b.w / 2, Math.min(x, b.x + b.w / 2));
  const dz = z - Math.max(b.z - b.d / 2, Math.min(z, b.z + b.d / 2));
  return dx * dx + dz * dz < radius * radius - 1e-9;
}
export function isSafe(level: Level, run: Run, boxes: Box[]) {
  const onFloor =
    level.rooms.some(
      (r) => Math.abs(run.x - r.x * SPACING) < HALF && Math.abs(run.z - r.z * SPACING) < HALF,
    ) ||
    level.edges.some((e) => {
      const a = roomPosition(level.rooms.find((r) => r.id === e.a)!),
        b = roomPosition(level.rooms.find((r) => r.id === e.b)!);
      return (
        run.x >= Math.min(a.x, b.x) - DOOR + RADIUS &&
        run.x <= Math.max(a.x, b.x) + DOOR - RADIUS &&
        run.z >= Math.min(a.z, b.z) - DOOR + RADIUS &&
        run.z <= Math.max(a.z, b.z) + DOOR - RADIUS
      );
    });
  return onFloor && !solidBoxes(boxes, run).some((b) => circleHits(run.x, run.z, b));
}
export function move(run: Run, dx: number, dz: number, boxes: Box[]) {
  // ponytail: scan at most ~300 solids per substep; use a spatial grid only if larger layouts need it.
  const solid = solidBoxes(boxes, run),
    steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.07));
  for (let i = 0; i < steps; i++) {
    const x = run.x + dx / steps;
    if (!solid.some((b) => circleHits(x, run.z, b))) run.x = x;
    const z = run.z + dz / steps;
    if (!solid.some((b) => circleHits(run.x, z, b))) run.z = z;
  }
}
// Segment/AABB slab intersection: interactions never trace reflected rays.
export function occluded(x: number, z: number, tx: number, tz: number, boxes: Box[]) {
  return boxes.some((b) => {
    let lo = 0,
      hi = 0.98;
    for (const [start, delta, min, max] of [
      [x, tx - x, b.x - b.w / 2, b.x + b.w / 2],
      [z, tz - z, b.z - b.d / 2, b.z + b.d / 2],
    ]) {
      if (Math.abs(delta) < 1e-9) {
        if (start < min || start > max) return false;
      } else {
        const a = (min - start) / delta,
          c = (max - start) / delta;
        lo = Math.max(lo, Math.min(a, c));
        hi = Math.min(hi, Math.max(a, c));
        if (lo > hi) return false;
      }
    }
    return hi >= lo;
  });
}
export function visible(run: Run, t: Target, boxes: Box[], distance: number, cone = 0.8) {
  const dx = t.x - run.x,
    dz = t.z - run.z,
    dy = t.y - EYE,
    length = Math.hypot(dx, dz, dy);
  const dot =
    (dx * -Math.sin(run.yaw) * Math.cos(run.pitch) +
      dz * -Math.cos(run.yaw) * Math.cos(run.pitch) +
      dy * Math.sin(run.pitch)) /
    length;
  return (
    length <= distance && dot > cone && !occluded(run.x, run.z, t.x, t.z, solidBoxes(boxes, run))
  );
}
export function focus(run: Run, targets: Target[], boxes: Box[], anchor = false) {
  return targets
    .filter(
      (t) =>
        (anchor ? t.kind === 'anchor' : t.kind !== 'anchor') &&
        visible(run, t, boxes, anchor ? 2.7 : 2.55, anchor ? 0.82 : 0.93),
    )
    .sort((a, b) => Math.hypot(a.x - run.x, a.z - run.z) - Math.hypot(b.x - run.x, b.z - run.z))[0];
}
