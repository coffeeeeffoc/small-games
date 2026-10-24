/** Engine-free round metal rods. Coordinates and distances are world units; angles are radians. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface WireSpec {
  shape: 'circle' | 'oval' | 'u' | 'stem';
  plane: 'xy' | 'xz' | 'yz';
  z: number;
  /** World-space extraction direction; independent of the ring's rotation. */
  exit: Vec3;
  fixed?: boolean;
  /** Oval's v radius / r (default 1.5). */
  aspect?: number;
  /** U arm length or welded stem length (default 0.8 r). */
  length?: number;
}
/** Structurally compatible with Ring and ActiveRing; no dependency on legacy 2D rules. */
export interface WireRing {
  id: string;
  x: number;
  y: number;
  r: number;
  gap: number;
  angle: number;
  color?: string;
  removed?: boolean;
  tilt?: number;
  wire: WireSpec;
}
export interface WirePose {
  angle?: number;
  tilt?: number;
}
export interface MetalPose {
  angle: number;
  tilt: number;
  direction: Vec3;
  distance: number;
}
export interface WireContact {
  blockerId: string;
  point: Vec3;
  distance: number;
}
export interface Extraction {
  clear: boolean;
  direction: Vec3;
  /** Travel needed for complete separation along direction. */
  distance: number;
  /** Safe travel before conservative contact, in world units; equals distance when clear. */
  blockedAt: number;
  contact?: Vec3;
}

export const WIRE_RADIUS = 3.5;
export const METAL_GAP = (Math.PI * 24) / 180;
const TAU = 2 * Math.PI;
const CHORD_ERROR = 0.08;
const CLEARANCE = 2 * WIRE_RADIUS + 2 * CHORD_ERROR + 0.02;
const SWEEP_STEP = 2;
const ZERO: Vec3 = { x: 0, y: 0, z: 0 };
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mul = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const clamp = (v: number, lo = 0, hi = 1): number => Math.max(lo, Math.min(hi, v));
const wrap = (a: number): number => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
const center = (r: WireRing): Vec3 => ({ x: r.x, y: r.y, z: r.wire.z });

function validate(r: WireRing): void {
  if (
    ![
      r.x,
      r.y,
      r.wire.z,
      r.r,
      r.gap,
      r.angle,
      r.tilt ?? 0,
      r.wire.aspect ?? 1.5,
      r.wire.length ?? r.r * 0.8,
      r.wire.exit.x,
      r.wire.exit.y,
      r.wire.exit.z,
    ].every(Number.isFinite) ||
    r.r <= 0 ||
    r.gap < 0 ||
    r.gap >= TAU ||
    (r.wire.aspect ?? 1.5) <= 0 ||
    (r.wire.length ?? r.r) <= 0 ||
    !['circle', 'oval', 'u', 'stem'].includes(r.wire.shape) ||
    !['xy', 'xz', 'yz'].includes(r.wire.plane)
  ) {
    throw new RangeError(`Invalid metal geometry: ${r.id}`);
  }
}

/** Tilted plane basis, WITHOUT angle. Rotate local points by angle before mapping through u/v.
 * Inverse input coordinates are dot(pointer-center,u/v); atan2(v,u) gives the gap angle.
 * Tilt rotates v about the unrotated local u, toward cross(u,v).
 */
export function wireBasis(r: WireRing): { u: Vec3; v: Vec3 } {
  const u = r.wire.plane === 'yz' ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const v = r.wire.plane === 'xy' ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
  return { u, v: add(mul(v, Math.cos(r.tilt ?? 0)), mul(cross(u, v), Math.sin(r.tilt ?? 0))) };
}

/** True open centerlines, including rounded U bottom/arms and the stem's welded rod.
 * Circle/oval gap faces local +u; U mouth faces +u; stem is welded at -u, opposite the gap.
 */
export function wirePaths(r: WireRing, translation: Vec3 = ZERO): Vec3[][] {
  validate(r);
  if (![translation.x, translation.y, translation.z].every(Number.isFinite))
    throw new RangeError('Invalid translation');
  const { u, v } = wireBasis(r);
  const origin = add(center(r), translation);
  const c = Math.cos(r.angle),
    s = Math.sin(r.angle);
  const point = (x: number, y: number): Vec3 =>
    add(origin, add(mul(u, x * c - y * s), mul(v, x * s + y * c)));
  const b = r.wire.shape === 'oval' ? r.r * (r.wire.aspect ?? 1.5) : r.r;
  const arc = (start: number, sweep: number): Vec3[] => {
    const count = Math.max(2, Math.ceil(sweep / Math.sqrt((8 * CHORD_ERROR) / Math.max(r.r, b))));
    return Array.from({ length: count + 1 }, (_, i) => {
      const a = start + (sweep * i) / count;
      return point(r.r * Math.cos(a), b * Math.sin(a));
    });
  };
  const length = r.wire.length ?? r.r * 0.8;
  if (r.wire.shape === 'u') {
    return [[point(length, r.r), ...arc(Math.PI / 2, Math.PI), point(length, -r.r)]];
  }
  const paths = [arc(r.gap / 2, TAU - r.gap)];
  if (r.wire.shape === 'stem') paths.push([point(-r.r, 0), point(-r.r - length, 0)]);
  return paths;
}

interface Box {
  min: Vec3;
  max: Vec3;
}
interface Segment {
  a: Vec3;
  b: Vec3;
  box: Box;
}
interface Geometry {
  ring: WireRing;
  segments: Segment[];
  box: Box;
  radius: number;
  basis: { u: Vec3; v: Vec3 };
}
function bounds(points: Vec3[]): Box {
  const min = { x: Infinity, y: Infinity, z: Infinity },
    max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of points)
    for (const k of ['x', 'y', 'z'] as const) {
      min[k] = Math.min(min[k], p[k]);
      max[k] = Math.max(max[k], p[k]);
    }
  return { min, max };
}
function geometry(ring: WireRing): Geometry {
  const paths = wirePaths(ring),
    points = paths.flat();
  const segments = paths.flatMap((path) =>
    path.slice(1).map((b, i) => ({ a: path[i], b, box: bounds([path[i], b]) })),
  );
  return {
    ring,
    segments,
    box: bounds(points),
    radius: CHORD_ERROR + Math.max(...points.map((p) => norm(sub(p, center(ring))))),
    basis: wireBasis(ring),
  };
}
function overlaps(a: Box, b: Box, shift: Vec3, padding: number): boolean {
  return (
    a.min.x + shift.x <= b.max.x + padding &&
    a.max.x + shift.x >= b.min.x - padding &&
    a.min.y + shift.y <= b.max.y + padding &&
    a.max.y + shift.y >= b.min.y - padding &&
    a.min.z + shift.z <= b.max.z + padding &&
    a.max.z + shift.z >= b.min.z - padding
  );
}

/** Closest points on finite segments, including parallel and degenerate segments. */
function segmentPair(a: Vec3, b: Vec3, c: Vec3, d: Vec3): [Vec3, Vec3] {
  const u = sub(b, a),
    v = sub(d, c),
    w = sub(a, c);
  const aa = dot(u, u),
    bb = dot(u, v),
    cc = dot(v, v),
    dd = dot(u, w),
    ee = dot(v, w);
  let s = 0,
    t = 0;
  if (aa < 1e-12) t = cc < 1e-12 ? 0 : clamp(ee / cc);
  else if (cc < 1e-12) s = clamp(-dd / aa);
  else {
    const denom = aa * cc - bb * bb;
    s = denom > 1e-12 ? clamp((bb * ee - cc * dd) / denom) : 0;
    t = (bb * s + ee) / cc;
    if (t < 0) {
      t = 0;
      s = clamp(-dd / aa);
    } else if (t > 1) {
      t = 1;
      s = clamp((bb - dd) / aa);
    }
  }
  return [add(a, mul(u, s)), add(c, mul(v, t))];
}

/** Exact point-to-spatial-circle/open-arc distance: no imaginary band across a gap. */
function nearestArc(p: Vec3, g: Geometry): Vec3 {
  const r = g.ring,
    local = sub(p, center(r));
  const x = dot(local, g.basis.u),
    y = dot(local, g.basis.v);
  let angle = Math.atan2(y, x);
  const relative = wrap(angle - r.angle);
  if (Math.abs(relative) < r.gap / 2) angle = r.angle + ((relative < 0 ? -1 : 1) * r.gap) / 2;
  return add(
    center(r),
    add(mul(g.basis.u, r.r * Math.cos(angle)), mul(g.basis.v, r.r * Math.sin(angle))),
  );
}
function arcContact(a: Vec3, b: Vec3, g: Geometry, limit: number): [Vec3, Vec3] | null {
  const mid = mul(add(a, b), 0.5),
    near = nearestArc(mid, g);
  const distance = norm(sub(mid, near)),
    half = norm(sub(a, b)) / 2;
  if (distance - half > limit) return null;
  if (distance <= limit || half <= 0.04) return [mid, near];
  return arcContact(a, mid, g, limit) ?? arcContact(mid, b, g, limit);
}
function collide(
  moving: Geometry,
  obstacles: Geometry[],
  shift: Vec3,
  padding = 0,
): WireContact | null {
  const limit = CLEARANCE + padding;
  for (const obstacle of obstacles) {
    if (!overlaps(moving.box, obstacle.box, shift, limit)) continue;
    for (const segment of moving.segments) {
      if (!overlaps(segment.box, obstacle.box, shift, limit)) continue;
      const a = add(segment.a, shift),
        b = add(segment.b, shift);
      if (obstacle.ring.wire.shape === 'circle') {
        const pair = arcContact(a, b, obstacle, limit);
        if (pair)
          return {
            blockerId: obstacle.ring.id,
            point: mul(add(...pair), 0.5),
            distance: norm(sub(...pair)),
          };
      } else {
        for (const other of obstacle.segments) {
          if (!overlaps(segment.box, other.box, shift, limit)) continue;
          const pair = segmentPair(a, b, other.a, other.b),
            distance = norm(sub(...pair));
          if (distance <= limit)
            return { blockerId: obstacle.ring.id, point: mul(add(...pair), 0.5), distance };
        }
      }
    }
  }
  return null;
}
function active(rings: readonly WireRing[], id: string): WireRing | undefined {
  return rings.find((r) => r.id === id && !r.removed);
}
function others(rings: readonly WireRing[], id: string): Geometry[] {
  return rings.filter((r) => r.id !== id && !r.removed).map(geometry);
}

/** Static overlap only; use canPose for a swept rotation, testExtraction for a swept translation. */
export function wireCollision(
  rings: readonly WireRing[],
  movingId: string,
  pose: WirePose = {},
  translation: Vec3 = ZERO,
): WireContact | null {
  const r = active(rings, movingId);
  if (!r) return null;
  if (![translation.x, translation.y, translation.z].every(Number.isFinite))
    throw new RangeError('Invalid translation');
  return collide(
    geometry({ ...r, angle: pose.angle ?? r.angle, tilt: pose.tilt ?? r.tilt }),
    others(rings, movingId),
    translation,
  );
}

function sweepPose(r: WireRing, pose: WirePose, obstacles: Geometry[]): boolean {
  const angle = pose.angle ?? r.angle,
    tilt = pose.tilt ?? r.tilt ?? 0;
  if (![angle, tilt].every(Number.isFinite)) return false;
  const initial = geometry(r);
  const da = wrap(angle - r.angle),
    dt = tilt - (r.tilt ?? 0);
  // Rigid motion is Lipschitz in radius * (|dAngle| + |dTilt|); padding covers between samples.
  const travel = initial.radius * (Math.abs(da) + Math.abs(dt));
  const count = Math.max(1, Math.ceil(travel / SWEEP_STEP));
  if (collide(initial, obstacles, ZERO, travel / count / 2)) return false;
  for (let i = 1; i <= count; i++) {
    const sample = {
      ...r,
      angle: r.angle + (da * i) / count,
      tilt: (r.tilt ?? 0) + (dt * i) / count,
    };
    if (collide(geometry(sample), obstacles, ZERO, travel / count / 2)) return false;
  }
  return true;
}

/** Shortest angle sweep and linear tilt sweep; does not mutate. Fixed/removed/missing rings refuse. */
export function canPose(rings: readonly WireRing[], id: string, pose: WirePose): boolean {
  const r = active(rings, id);
  return !!r && !r.wire.fixed && sweepPose(r, pose, others(rings, id));
}

export function testExtraction(
  rings: readonly WireRing[],
  id: string,
  pose: WirePose = {},
): Extraction {
  const r = active(rings, id);
  if (!r) return { clear: false, direction: ZERO, distance: 0, blockedAt: 0 };
  validate(r);
  const length = norm(r.wire.exit);
  const direction = length ? mul(r.wire.exit, 1 / length) : ZERO;
  const failed: Extraction = { clear: false, direction, distance: 0, blockedAt: 0 };
  if (r.wire.fixed || !length) return failed;
  const obstacles = others(rings, id);
  if (!sweepPose(r, pose, obstacles)) return failed;
  const moving = geometry({ ...r, angle: pose.angle ?? r.angle, tilt: pose.tilt ?? r.tilt });
  const min = Math.min(
    ...moving.segments.flatMap((s) => [dot(s.a, direction), dot(s.b, direction)]),
  );
  const max = Math.max(
    min,
    ...obstacles.flatMap((g) =>
      g.segments.flatMap((s) => [dot(s.a, direction), dot(s.b, direction)]),
    ),
  );
  const distance = max - min + CLEARANCE + SWEEP_STEP;
  const count = Math.max(1, Math.ceil(distance / SWEEP_STEP)),
    step = distance / count;
  for (let i = 0; i <= count; i++) {
    const contact = collide(moving, obstacles, mul(direction, step * i), step / 2);
    if (contact)
      return {
        clear: false,
        direction,
        distance,
        blockedAt: Math.max(0, step * i - step / 2),
        contact: contact.point,
      };
  }
  return { clear: true, direction, distance, blockedAt: distance };
}

/** Small deterministic candidate set; every returned pose has a reachable sweep AND clear extraction. */
export function findMetalPose(rings: readonly WireRing[], id: string): MetalPose | null {
  const r = active(rings, id);
  if (!r || r.wire.fixed || !norm(r.wire.exit)) return null;
  const tilts = Array.from(new Set([r.tilt ?? 0, 0, Math.PI / 6, -Math.PI / 6]));
  for (const tilt of tilts) {
    const { u, v } = wireBasis({ ...r, tilt });
    const aligned = Math.atan2(-dot(r.wire.exit, v), -dot(r.wire.exit, u));
    const angles = Array.from(
      new Set([aligned, r.angle, aligned + Math.PI / 2, aligned - Math.PI / 2]),
    );
    for (const angle of angles) {
      const result = testExtraction(rings, id, { angle, tilt });
      if (result.clear)
        return { angle: wrap(angle), tilt, direction: result.direction, distance: result.distance };
    }
  }
  return null;
}

export function findMetalHint(
  rings: readonly WireRing[],
  goalIds: readonly string[] = [],
): (MetalPose & { ringId: string }) | null {
  const candidates = rings.filter((r) => !r.removed && !r.wire.fixed);
  candidates.sort((a, b) => Number(goalIds.includes(b.id)) - Number(goalIds.includes(a.id)));
  for (const r of candidates) {
    const pose = findMetalPose(rings, r.id);
    if (pose) return { ringId: r.id, ...pose };
  }
  return null;
}
