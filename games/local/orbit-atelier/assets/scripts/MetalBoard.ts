import type { AtelierView } from './AtelierView';
import type { State, Ring, Hint } from './core/rules';
import { wirePaths, wireBasis, WIRE_RADIUS, type WireRing, type Vec3 } from './core/metal';

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const center = (r: WireRing): Vec3 => ({ x: r.x, y: r.y, z: r.wire.z });
const blend = (hex: string, light: number) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    '#' +
    [n >> 16, (n >> 8) & 255, n & 255]
      .map((v) =>
        Math.min(255, Math.max(0, Math.round(v * light)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
};
/** Orthographic view of the same round rods used by collision; no invented crossing buckles. */
export class MetalBoard {
  yaw = Math.PI / 6;
  pitch = 0.7;
  offset: { id: string; translation: Vec3 } | null = null;
  contact: Vec3 | null = null;
  levelId = '';
  radii = new Map<string, number>();
  constructor(public owner: AtelierView) {}
  basis() {
    const c = Math.cos(this.yaw),
      s = Math.sin(this.yaw),
      p = Math.sin(this.pitch),
      q = Math.cos(this.pitch);
    return {
      right: { x: c, y: 0, z: -s },
      up: { x: s * p, y: q, z: c * p },
      forward: { x: s * q, y: -p, z: c * q },
    };
  }
  raw(p: Vec3) {
    const b = this.basis();
    return { x: dot(p, b.right), y: -dot(p, b.up), z: dot(p, b.forward) };
  }
  project(p: Vec3) {
    const r = this.raw(p),
      f = this.owner.fit;
    return { x: f.x + (r.x - f.cx) * f.scale, y: f.y + (r.y - f.cy) * f.scale, z: r.z };
  }
  layout(state: State) {
    if (this.levelId !== state.levelId) {
      this.levelId = state.levelId;
      this.radii.clear();
    }
    const extents = (state.rings as WireRing[]).map((r) => {
      const c = center(r),
        p = this.raw(c);
      if (!this.radii.has(r.id))
        this.radii.set(
          r.id,
          Math.max(
            ...wirePaths(r)
              .flat()
              .map((v) => Math.hypot(v.x - c.x, v.y - c.y, v.z - c.z)),
          ) +
            WIRE_RADIUS +
            6,
        );
      return { p, r: this.radii.get(r.id)! };
    });
    const left = Math.min(...extents.map((v) => v.p.x - v.r)),
      right = Math.max(...extents.map((v) => v.p.x + v.r));
    const top = Math.min(...extents.map((v) => v.p.y - v.r)),
      bottom = Math.max(...extents.map((v) => v.p.y + v.r));
    const b = this.owner.bounds;
    this.owner.fit = {
      x: b.x + b.w / 2,
      y: b.y + b.h / 2,
      cx: (left + right) / 2,
      cy: (top + bottom) / 2,
      scale: Math.min(b.w / (right - left), b.h / (bottom - top), 2.1),
    };
  }
  inputAngle(ring: Ring, x: number, y: number) {
    const r = ring as WireRing,
      b = wireBasis(r),
      c = this.project(center(r)),
      camera = this.basis();
    const ux = dot(b.u, camera.right),
      uy = -dot(b.u, camera.up),
      vx = dot(b.v, camera.right),
      vy = -dot(b.v, camera.up);
    const dx = x - c.x,
      dy = y - c.y,
      det = ux * vy - uy * vx;
    return Math.abs(det) < 0.02
      ? Math.atan2(dy, dx)
      : Math.atan2((ux * dy - uy * dx) / det, (dx * vy - dy * vx) / det);
  }
  pick(state: State, x: number, y: number, selected: string | null) {
    const hits: { ring: WireRing; distance: number; depth: number }[] = [];
    for (const ring of state.rings as WireRing[]) {
      if (ring.removed) continue;
      let best = Infinity,
        depth = -Infinity;
      for (const path of wirePaths(ring))
        for (let i = 1; i < path.length; i++) {
          const a = this.project(path[i - 1]),
            b = this.project(path[i]),
            dx = b.x - a.x,
            dy = b.y - a.y;
          const t = Math.max(
            0,
            Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)),
          );
          const d = Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
          if (d < best) {
            best = d;
            depth = a.z + (b.z - a.z) * t;
          }
        }
      if (best < 27) hits.push({ ring, distance: best, depth });
    }
    const movable = hits.filter((h) => !h.ring.wire.fixed);
    const choices = movable.length ? movable : hits;
    choices.sort(
      (a, b) =>
        a.distance -
        b.distance -
        (a.ring.id === selected ? 4 : 0) +
        (b.ring.id === selected ? 4 : 0) -
        (a.depth - b.depth) * 0.005,
    );
    const hit = choices[0];
    return hit ? { ring: hit.ring, angle: this.inputAngle(hit.ring, x, y) } : null;
  }
  draw(state: State, selected: string | null, hint: Hint | null) {
    const u = this.owner,
      g = u.board;
    this.layout(state);
    const f = u.fit,
      b = u.bounds;
    for (let i = 10; i > 0; i--)
      u.circle(g, f.x, f.y, Math.min(b.w, b.h) * (0.48 + i * 0.012), '#041824', 8);
    const live = (state.rings as WireRing[]).filter((r) => !r.removed);
    const paths = live.flatMap((ring) =>
      wirePaths(ring, this.offset?.id === ring.id ? this.offset.translation : undefined).map(
        (path) => ({ ring, points: path.map((p) => this.project(p)) }),
      ),
    );
    const diameter = 2 * WIRE_RADIUS * f.scale;
    const tube = (points: { x: number; y: number }[], ring: WireRing, round = true) => {
      const xy = points.map((p) => [p.x, p.y]),
        hex = ring.color || '#a9bfc2';
      u.line(g, xy, blend(hex, 0.4), diameter, 255, round);
      u.line(
        g,
        xy.map(([x, y]) => [x! - 0.3, y! - 0.5]),
        blend(hex, 0.84),
        diameter * 0.8,
        255,
        round,
      );
      u.line(
        g,
        xy.map(([x, y]) => [x! - diameter * 0.12, y! - diameter * 0.13]),
        blend(hex, 1.16),
        diameter * 0.4,
        255,
        round,
      );
      u.line(
        g,
        xy.map(([x, y]) => [x! - diameter * 0.17, y! - diameter * 0.2]),
        '#f1f5e6',
        Math.max(0.55, diameter * 0.1),
        170,
        round,
      );
    };
    for (const path of paths) {
      const xy = path.points.map((p) => [p.x, p.y]);
      if (path.ring.id === selected) u.line(g, xy, '#91eddf', diameter + 6, 25);
      u.line(
        g,
        xy.map(([x, y]) => [x! + 1, y! + 3]),
        '#000b12',
        diameter + 3,
        75,
      );
    }
    for (const path of paths) tube(path.points, path.ring);
    const overpasses: {
      points: (typeof paths)[number]['points'];
      ring: WireRing;
      depth: number;
    }[] = [];
    for (let i = 0; i < paths.length; i++)
      for (let j = i + 1; j < paths.length; j++) {
        const a = paths[i]!,
          b = paths[j]!;
        if (a.ring.id === b.ring.id) continue;
        for (let ai = 1; ai < a.points.length; ai++)
          for (let bi = 1; bi < b.points.length; bi++) {
            const p = a.points[ai - 1]!,
              q = a.points[ai]!,
              r = b.points[bi - 1]!,
              t = b.points[bi]!;
            if (
              Math.max(p.x, q.x) < Math.min(r.x, t.x) ||
              Math.max(r.x, t.x) < Math.min(p.x, q.x) ||
              Math.max(p.y, q.y) < Math.min(r.y, t.y) ||
              Math.max(r.y, t.y) < Math.min(p.y, q.y)
            )
              continue;
            const ax = q.x - p.x,
              ay = q.y - p.y,
              bx = t.x - r.x,
              by = t.y - r.y,
              den = ax * by - ay * bx;
            if (Math.abs(den) < 1e-7) continue;
            const u = ((r.x - p.x) * by - (r.y - p.y) * bx) / den,
              w = ((r.x - p.x) * ay - (r.y - p.y) * ax) / den;
            if (u < 0 || u > 1 || w < 0 || w > 1) continue;
            const az = p.z + (q.z - p.z) * u,
              bz = r.z + (t.z - r.z) * w,
              front = az > bz ? a : b,
              index = az > bz ? ai : bi;
            let left = index - 1,
              right = index,
              travel = 0;
            while (left > 0 && travel < diameter * 1.6) {
              travel += Math.hypot(
                front.points[left]!.x - front.points[left - 1]!.x,
                front.points[left]!.y - front.points[left - 1]!.y,
              );
              left--;
            }
            travel = 0;
            while (right < front.points.length - 1 && travel < diameter * 1.6) {
              travel += Math.hypot(
                front.points[right + 1]!.x - front.points[right]!.x,
                front.points[right + 1]!.y - front.points[right]!.y,
              );
              right++;
            }
            overpasses.push({
              points: front.points.slice(left, right + 1),
              ring: front.ring,
              depth: Math.max(az, bz),
            });
          }
      }
    // Redraw continuous front arcs with butt ends; short rounded strokes would look like beads.
    overpasses.sort((a, b) => a.depth - b.depth);
    for (const pass of overpasses) tube(pass.points, pass.ring, false);
    for (const ring of live) {
      if (!state.goalRingIds?.includes(ring.id)) continue;
      const points = wirePaths(
        ring,
        this.offset?.id === ring.id ? this.offset.translation : undefined,
      )
        .flat()
        .map((p) => this.project(p));
      const p = points.reduce((a, b) => (b.z > a.z ? b : a));
      if (p.x < b.x || p.x > b.x + b.w || p.y < b.y || p.y > b.y + b.h) continue;
      u.line(
        g,
        [
          [p.x, p.y],
          [p.x + 10, p.y + 13],
        ],
        '#e4c58d',
        1.5,
      );
      u.circle(g, p.x + 12, p.y + 17, 10, '#071b25', 200);
      u.star(g, p.x + 12, p.y + 17, 7, '#8ff5df');
    }
    const focus = live.find((r) => r.id === selected && !r.wire.fixed);
    if (focus && !this.offset) {
      const c = this.project(center(focus)),
        e = focus.wire.exit,
        n = Math.hypot(e.x, e.y, e.z) || 1;
      const p = this.project({
        x: focus.x + (e.x * 20) / n,
        y: focus.y + (e.y * 20) / n,
        z: focus.wire.z + (e.z * 20) / n,
      });
      const dx = p.x - c.x,
        dy = p.y - c.y,
        len = Math.hypot(dx, dy) || 1,
        ex = c.x + (dx / len) * 29,
        ey = c.y + (dy / len) * 29;
      u.line(
        g,
        [
          [c.x, c.y],
          [ex, ey],
        ],
        '#8ff5df',
        1.5,
        160,
      );
      u.line(
        g,
        [
          [ex - (dx / len) * 7 - (dy / len) * 4, ey - (dy / len) * 7 + (dx / len) * 4],
          [ex, ey],
          [ex - (dx / len) * 7 + (dy / len) * 4, ey - (dy / len) * 7 - (dx / len) * 4],
        ],
        '#8ff5df',
        1.5,
        160,
      );
    }
    if (hint) {
      const r = live.find((r) => r.id === hint.ringId);
      if (r) {
        const suggested = { ...r, angle: hint.angle, tilt: hint.tilt ?? r.tilt };
        const point = wirePaths(suggested)[0]?.[0];
        if (point) {
          const p = this.project(point);
          u.circle(g, p.x, p.y, 13, '#8ff5df', 210, 1.4);
        }
      }
    }
    if (this.contact) {
      const p = this.project(this.contact);
      u.circle(g, p.x, p.y, 10, '#efac91', 220, 1.5);
    }
  }
  snapshot() {
    return { ...this.basis(), yaw: this.yaw, pitch: this.pitch };
  }
}
