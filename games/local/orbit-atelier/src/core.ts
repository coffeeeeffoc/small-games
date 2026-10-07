/** Pure puzzle rules. Angles use screen coordinates: right = 0, down = π / 2. */
export const TAU = Math.PI * 2;
export const STROKE_MARGIN = 0.055;
const EPSILON = 1e-9;

export interface Point {
  x: number;
  y: number;
}

export interface Ring extends Point {
  id: string;
  r: number;
  /** Width of the opening, in radians. */
  gap: number;
  /** Direction of the centre of the opening, in radians. */
  angle: number;
  color?: string;
  unlockAfter?: number;
}

export interface Level {
  id: string;
  name: string;
  chapter: 1 | 2 | 3;
  intro?: string;
  rings: Ring[];
}

export interface ActiveRing extends Ring {
  removed: boolean;
}

export interface State {
  levelId: string;
  rings: ActiveRing[];
  releasedCount: number;
}

export interface Hint {
  ringId: string;
  angle: number;
}

export interface Blocker {
  neighborId: string;
  points: [Point, Point];
  angles: [number, number];
}

export function normalizeAngle(angle: number): number {
  return ((((angle + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
}

export function angleDistance(a: number, b: number): number {
  return Math.abs(normalizeAngle(a - b));
}

/** Touching, concentric, contained and disjoint circles are not interwoven. */
export function circleIntersections(a: Ring, b: Ring): [Point, Point] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.hypot(dx, dy);
  if (
    distance <= EPSILON ||
    distance >= a.r + b.r - EPSILON ||
    distance <= Math.abs(a.r - b.r) + EPSILON
  ) {
    return null;
  }
  const along = (a.r * a.r - b.r * b.r + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, a.r * a.r - along * along));
  const midX = a.x + (along * dx) / distance;
  const midY = a.y + (along * dy) / distance;
  const offsetX = (-dy * height) / distance;
  const offsetY = (dx * height) / distance;
  return [
    { x: midX + offsetX, y: midY + offsetY },
    { x: midX - offsetX, y: midY - offsetY },
  ];
}

/** Connections depend on the full circle geometry, never a neighbour's opening. */
export function getBlockers(state: State, ringId: string): Blocker[] {
  const ring = state.rings.find((candidate) => candidate.id === ringId);
  if (!ring || ring.removed) return [];
  const blockers: Blocker[] = [];
  for (const neighbor of state.rings) {
    if (neighbor.id === ringId || neighbor.removed) continue;
    const points = circleIntersections(ring, neighbor);
    if (!points) continue;
    blockers.push({
      neighborId: neighbor.id,
      points,
      angles: points.map((point) => Math.atan2(point.y - ring.y, point.x - ring.x)) as [
        number,
        number,
      ],
    });
  }
  return blockers;
}

export function isLocked(state: State, ringId: string): boolean {
  const ring = state.rings.find((candidate) => candidate.id === ringId);
  return !!ring && !ring.removed && state.releasedCount < (ring.unlockAfter ?? 0);
}

export function createState(level: Level): State {
  const errors = validateLevel(level);
  if (errors.length) throw new Error(`Invalid level: ${errors.join('; ')}`);
  return {
    levelId: level.id,
    rings: level.rings.map((ring) => ({
      ...ring,
      angle: normalizeAngle(ring.angle),
      removed: false,
    })),
    releasedCount: 0,
  };
}

/** Rotation does not release a ring; the input layer calls tryRelease on pointer-up. */
export function rotateRing(state: State, ringId: string, angle: number): boolean {
  const ring = state.rings.find((candidate) => candidate.id === ringId);
  if (!ring || ring.removed || isLocked(state, ringId) || !Number.isFinite(angle)) return false;
  ring.angle = normalizeAngle(angle);
  return true;
}

export function tryRelease(state: State, ringId: string): boolean {
  const ring = state.rings.find((candidate) => candidate.id === ringId);
  if (!ring || ring.removed || isLocked(state, ringId)) return false;
  const safeHalfGap = ring.gap / 2 - STROKE_MARGIN;
  if (
    getBlockers(state, ringId).some((blocker) =>
      blocker.angles.some((angle) => angleDistance(ring.angle, angle) > safeHalfGap + EPSILON),
    )
  ) {
    return false;
  }
  ring.removed = true;
  state.releasedCount += 1;
  return true;
}

export function isComplete(state: State): boolean {
  return state.rings.every((ring) => ring.removed);
}

/** The complement of the largest angular gap is the shortest covering arc. */
function coveringAngle(angles: number[], opening: number, currentAngle: number): number | null {
  if (!angles.length) return currentAngle;
  const sorted = angles.map((angle) => (normalizeAngle(angle) + TAU) % TAU).sort((a, b) => a - b);
  let best: { angle: number; span: number } | null = null;
  for (let index = 0; index < sorted.length; index += 1) {
    const next = index + 1 < sorted.length ? sorted[index + 1]! : sorted[0]! + TAU;
    const span = TAU - (next - sorted[index]!);
    const angle = normalizeAngle(next + span / 2);
    if (
      !best ||
      span < best.span - EPSILON ||
      (Math.abs(span - best.span) <= EPSILON &&
        angleDistance(angle, currentAngle) < angleDistance(best.angle, currentAngle))
    ) {
      best = { angle, span };
    }
  }
  return best && best.span + STROKE_MARGIN * 2 <= opening + EPSILON ? best.angle : null;
}

export function findHint(state: State): Hint | null {
  for (const ring of state.rings) {
    if (ring.removed || isLocked(state, ring.id)) continue;
    const angles = getBlockers(state, ring.id).flatMap((blocker) => blocker.angles);
    const angle = coveringAngle(angles, ring.gap, ring.angle);
    if (angle !== null) return { ringId: ring.id, angle };
  }
  return null;
}

/** Removal only relaxes geometric and count locks, so any available move is safe. */
export function solveLevel(level: Level): Hint[] | null {
  const state = createState(level);
  const moves: Hint[] = [];
  while (!isComplete(state)) {
    const hint = findHint(state);
    if (!hint) return null;
    rotateRing(state, hint.ringId, hint.angle);
    if (!tryRelease(state, hint.ringId)) return null;
    moves.push(hint);
  }
  return moves;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 80;
}

/** Game-owned schema validation for authored content and untrusted imported data. */
export function validateLevel(value: unknown): string[] {
  if (!isObject(value)) return ['level must be an object'];
  const errors: string[] = [];
  if (!isName(value.id))
    errors.push('level id must be a non-empty string of at most 80 characters');
  if (!isName(value.name))
    errors.push('level name must be a non-empty string of at most 80 characters');
  if (![1, 2, 3].includes(value.chapter as number)) errors.push('chapter must be 1, 2 or 3');
  if (value.intro !== undefined && (typeof value.intro !== 'string' || value.intro.length > 160)) {
    errors.push('intro must be a string of at most 160 characters');
  }
  if (!Array.isArray(value.rings) || value.rings.length < 1 || value.rings.length > 64) {
    errors.push('rings must contain between 1 and 64 rings');
    return errors;
  }
  const ringCount = value.rings.length;
  const seen = new Set<string>();
  value.rings.forEach((ring: unknown, index: number) => {
    const label = `ring ${index + 1}`;
    if (!isObject(ring)) {
      errors.push(`${label} must be an object`);
      return;
    }
    if (!isName(ring.id)) errors.push(`${label} id must be a non-empty string`);
    else if (seen.has(ring.id)) errors.push(`${label} has duplicate id ${ring.id}`);
    else seen.add(ring.id);
    for (const coordinate of ['x', 'y'] as const) {
      const coordinateValue = ring[coordinate];
      if (
        typeof coordinateValue !== 'number' ||
        !Number.isFinite(coordinateValue) ||
        Math.abs(coordinateValue) > 10000
      ) {
        errors.push(`${label} ${coordinate} must be finite and within ±10000`);
      }
    }
    if (typeof ring.r !== 'number' || !Number.isFinite(ring.r) || ring.r < 1 || ring.r > 1000) {
      errors.push(`${label} radius must be between 1 and 1000`);
    }
    if (
      typeof ring.gap !== 'number' ||
      !Number.isFinite(ring.gap) ||
      ring.gap <= STROKE_MARGIN * 2 ||
      ring.gap >= TAU
    ) {
      errors.push(`${label} gap must be greater than stroke clearance and less than a full turn`);
    }
    if (typeof ring.angle !== 'number' || !Number.isFinite(ring.angle))
      errors.push(`${label} angle must be finite`);
    if (ring.color !== undefined && !isName(ring.color))
      errors.push(`${label} color must be a non-empty string`);
    if (
      ring.unlockAfter !== undefined &&
      (!Number.isInteger(ring.unlockAfter) ||
        (ring.unlockAfter as number) < 0 ||
        (ring.unlockAfter as number) >= ringCount)
    ) {
      errors.push(`${label} unlockAfter must be an integer between 0 and the other ring count`);
    }
  });
  return errors;
}

export function validateLevels(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1) return ['level catalog must be a non-empty array'];
  const errors: string[] = [];
  const seen = new Set<string>();
  value.forEach((level: unknown, index: number) => {
    const schemaErrors = validateLevel(level);
    errors.push(...schemaErrors.map((error) => `level ${index + 1}: ${error}`));
    if (schemaErrors.length) return;
    const valid = level as Level;
    if (seen.has(valid.id)) errors.push(`duplicate level id ${valid.id}`);
    seen.add(valid.id);
    if (!solveLevel(valid)) errors.push(`level ${valid.id} cannot be completed`);
  });
  return errors;
}
