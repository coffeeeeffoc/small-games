/** Pure puzzle rules. Angles use screen coordinates: right = 0, down = π / 2. */
export const TAU = Math.PI * 2;
export const RING_STROKE = 15;
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
  /** Named rings that must be released before this star clasp opens. */
  requires?: string[];
}

export interface Level {
  id: string;
  name: string;
  chapter: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  intro?: string;
  rings: Ring[];
  campaign?: 'nova' | 'classic';
  goalRingIds?: string[];
  parMoves?: number;
  revision?: number;
}

export interface ActiveRing extends Ring {
  removed: boolean;
}

export interface State {
  levelId: string;
  rings: ActiveRing[];
  releasedCount: number;
  goalRingIds?: string[];
  revision: number;
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
  return (
    !!ring &&
    !ring.removed &&
    (state.releasedCount < (ring.unlockAfter ?? 0) ||
      (ring.requires ?? []).some(
        (id) => !state.rings.find((candidate) => candidate.id === id)?.removed,
      ))
  );
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
    revision: level.revision ?? 1,
    ...(level.goalRingIds ? { goalRingIds: [...level.goalRingIds] } : {}),
  };
}

/** Rotation does not release a ring; the input layer calls tryRelease on pointer-up. */
export function rotateRing(state: State, ringId: string, angle: number): boolean {
  const ring = state.rings.find((candidate) => candidate.id === ringId);
  if (!ring || ring.removed || isLocked(state, ringId) || !Number.isFinite(angle)) return false;
  ring.angle = normalizeAngle(angle);
  return true;
}

/** Both rounded ring tips and the neighbouring band must fit through the opening. */
export function openingClearance(ring: Pick<Ring, 'r'>): number {
  return Math.asin(Math.min(1, (RING_STROKE + 2) / ring.r));
}

export function hasBandAt(ring: Ring, angle: number): boolean {
  return (
    angleDistance(ring.angle, angle) >
    ring.gap / 2 - Math.asin(Math.min(1, RING_STROKE / (2 * ring.r)))
  );
}

export function clearsOpening(ring: Ring, angle: number): boolean {
  return angleDistance(ring.angle, angle) <= ring.gap / 2 - openingClearance(ring) + EPSILON;
}

export function canRelease(state: State, ringId: string): boolean {
  const ring = state.rings.find((candidate) => candidate.id === ringId);
  if (!ring || ring.removed || isLocked(state, ringId)) return false;
  return getBlockers(state, ringId).every((blocker) =>
    blocker.angles.every((angle) => clearsOpening(ring, angle)),
  );
}

export function tryRelease(state: State, ringId: string): boolean {
  if (!canRelease(state, ringId)) return false;
  const ring = state.rings.find((candidate) => candidate.id === ringId)!;
  ring.removed = true;
  state.releasedCount += 1;
  return true;
}

export function isComplete(state: State): boolean {
  return state.goalRingIds?.length
    ? state.goalRingIds.every((id) => state.rings.some((ring) => ring.id === id && ring.removed))
    : state.rings.every((ring) => ring.removed);
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
  return best && best.span <= opening + EPSILON ? best.angle : null;
}

/** A direction is valid only when every physical contact fits inside the opening. */
export function releaseAngle(state: State, ringId: string): number | null {
  const ring = state.rings.find((candidate) => candidate.id === ringId);
  if (!ring || ring.removed || isLocked(state, ringId)) return null;
  const angles = getBlockers(state, ringId).flatMap((blocker) => blocker.angles);
  return coveringAngle(angles, ring.gap - openingClearance(ring) * 2, ring.angle);
}

/** Explicit gesture assistance. Merely loading, selecting, or hinting never rotates. */
export function snapAngle(state: State, ringId: string, angle: number, maxDegrees = 6): number {
  if (!Number.isFinite(angle)) return angle;
  const normalized = normalizeAngle(angle);
  const target = releaseAngle(state, ringId);
  if (target === null || !getBlockers(state, ringId).length) return normalized;
  const limit = (Math.min(6, Math.max(0, maxDegrees)) * Math.PI) / 180;
  return angleDistance(normalized, target) <= limit + EPSILON ? target : normalized;
}

export function cloneState(state: State): State {
  return {
    ...state,
    goalRingIds: state.goalRingIds ? [...state.goalRingIds] : undefined,
    rings: state.rings.map((ring) => ({
      ...ring,
      requires: ring.requires ? [...ring.requires] : undefined,
    })),
  };
}

/** Removal only relaxes locks and contacts. BFS gives the fewest releases to the goal. */
export function shortestSolution(initial: State, allowedIds?: ReadonlySet<string>): Hint[] | null {
  if (isComplete(initial)) return [];
  const key = (state: State) => state.rings.map((ring) => (ring.removed ? '1' : '0')).join('');
  const queue: { state: State; path: Hint[] }[] = [{ state: cloneState(initial), path: [] }];
  const seen = new Set([key(initial)]);
  for (let head = 0; head < queue.length; head++) {
    const { state, path } = queue[head]!;
    for (const ring of state.rings) {
      if (allowedIds && !allowedIds.has(ring.id)) continue;
      const angle = releaseAngle(state, ring.id);
      if (angle === null) continue;
      const next = cloneState(state);
      rotateRing(next, ring.id, angle);
      if (!tryRelease(next, ring.id)) continue;
      const move = { ringId: ring.id, angle };
      const nextPath = [...path, move];
      if (isComplete(next)) return nextPath;
      const signature = key(next);
      if (!seen.has(signature)) {
        seen.add(signature);
        queue.push({ state: next, path: nextPath });
      }
    }
  }
  return null;
}

export function findHint(state: State): Hint | null {
  return shortestSolution(state)?.[0] ?? null;
}

export function solveLevel(level: Level): Hint[] | null {
  return shortestSolution(createState(level));
}

/** Validate a saved removal subset without trusting its geometry, goal, or counters. */
export function isReachableRemoval(level: Level, removedIds: ReadonlySet<string>): boolean {
  const state = createState(level);
  if (!removedIds.size) return true;
  const pending = new Set(removedIds);
  while (pending.size) {
    let changed = false;
    for (const id of Array.from(pending)) {
      const angle = releaseAngle(state, id);
      if (angle === null) continue;
      rotateRing(state, id, angle);
      if (tryRelease(state, id)) {
        pending.delete(id);
        changed = true;
      }
    }
    if (!changed) return false;
  }
  return true;
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
  if (
    !Number.isInteger(value.chapter) ||
    (value.chapter as number) < 1 ||
    (value.chapter as number) > 8
  )
    errors.push('chapter must be an integer between 1 and 8');
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
      (typeof ring.r === 'number' && ring.gap <= openingClearance({ r: ring.r }) * 2) ||
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
  const rings = value.rings as Record<string, unknown>[];
  for (const ring of rings) {
    if (!isObject(ring) || ring.requires === undefined) continue;
    if (
      !Array.isArray(ring.requires) ||
      new Set(ring.requires).size !== ring.requires.length ||
      ring.requires.some((id) => typeof id !== 'string' || !seen.has(id) || id === ring.id)
    ) {
      errors.push(`ring ${String(ring.id)} requires must contain distinct other ring IDs`);
    }
  }
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const ring = rings.find((candidate) => isObject(candidate) && candidate.id === id);
    for (const dependency of Array.isArray(ring?.requires) ? ring.requires : []) {
      if (typeof dependency === 'string' && seen.has(dependency) && visit(dependency)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  if (Array.from(seen).some(visit)) errors.push('ring dependency locks contain a cycle');
  if (
    value.goalRingIds !== undefined &&
    (!Array.isArray(value.goalRingIds) ||
      !value.goalRingIds.length ||
      new Set(value.goalRingIds).size !== value.goalRingIds.length ||
      value.goalRingIds.some((id) => !seen.has(id)))
  ) {
    errors.push('goalRingIds must contain distinct existing ring IDs');
  }
  if (value.campaign !== undefined && value.campaign !== 'nova' && value.campaign !== 'classic')
    errors.push('campaign must be nova or classic');
  if (
    value.parMoves !== undefined &&
    (!Number.isInteger(value.parMoves) ||
      (value.parMoves as number) < 1 ||
      (value.parMoves as number) > ringCount)
  )
    errors.push('parMoves must be between 1 and the ring count');
  if (
    value.revision !== undefined &&
    (!Number.isInteger(value.revision) || (value.revision as number) < 1)
  )
    errors.push('revision must be a positive integer');
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
