import type {
  Axis,
  Box,
  Level,
  Offsets,
  Orientation,
  Orientations,
  PieceDefinition,
  Vec3,
} from './types.ts';
import {
  IDENTITY_ORIENTATION,
  isIdentityOrientation,
  isCubeOrientation,
  multiplyOrientation,
  pieceCenter,
  rotationOrientation,
  transformVector,
  validOrientation,
} from './rotation.ts';

export const EPSILON = 0.000001;
export const axisIndex = (axis: Axis): 0 | 1 | 2 => (axis === 'x' ? 0 : axis === 'y' ? 1 : 2);
export const axes: readonly Axis[] = ['x', 'y', 'z'];
export const selectionIds = (ids: string | readonly string[]): string[] => [
  ...new Set(typeof ids === 'string' ? [ids] : ids),
];
export const finiteVector = (value: unknown): value is Vec3 =>
  Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

interface OrientedBox {
  center: Vec3;
  half: Vec3;
  basis: readonly [Vec3, Vec3, Vec3];
}
const dot = (a: Vec3, b: Vec3): number => a.reduce((sum, value, i) => sum + value * b[i]!, 0);
const difference = (a: Vec3, b: Vec3): Vec3 =>
  a.map((value, i) => value - b[i]!) as unknown as Vec3;
const basisOf = (orientation: Orientation): readonly [Vec3, Vec3, Vec3] =>
  [0, 1, 2].map((i) => [
    orientation[i]!,
    orientation[i + 3]!,
    orientation[i + 6]!,
  ]) as unknown as readonly [Vec3, Vec3, Vec3];
function orientedBox(
  box: Box,
  piece: PieceDefinition,
  offset: Vec3,
  orientation: Orientation = IDENTITY_ORIENTATION,
): OrientedBox {
  const pivot = pieceCenter(piece);
  const local = box.min.map((value, i) => (value + box.max[i]!) / 2 - pivot[i]!) as unknown as Vec3;
  const rotated = transformVector(local, orientation);
  return {
    center: rotated.map((value, i) => value + pivot[i]! + offset[i]!) as unknown as Vec3,
    half: box.min.map((value, i) => (box.max[i]! - value) / 2) as unknown as Vec3,
    basis: basisOf(orientation),
  };
}
function enclosingBox(box: OrientedBox): Box {
  const radius = [0, 1, 2].map((i) =>
    box.half.reduce((sum, half, j) => sum + half * Math.abs(box.basis[j]![i]!), 0),
  );
  return {
    min: box.center.map((value, i) => value - radius[i]!) as unknown as Vec3,
    max: box.center.map((value, i) => value + radius[i]!) as unknown as Vec3,
  };
}
/** Bounds enclose all eight rotated corners. For partial turns these bounds are
 * broad-phase geometry only: material collision uses the actual oriented box. */
export function worldBox(
  box: Box,
  piece: PieceDefinition,
  offset: Vec3,
  orientation: Orientation = IDENTITY_ORIENTATION,
): Box {
  if (isIdentityOrientation(orientation))
    return {
      min: box.min.map((value, i) => value + offset[i]!) as unknown as Vec3,
      max: box.max.map((value, i) => value + offset[i]!) as unknown as Vec3,
    };
  return enclosingBox(orientedBox(box, piece, offset, orientation));
}
function separatingAxes(a: OrientedBox, b: OrientedBox): Vec3[] {
  const result = [...a.basis, ...b.basis];
  for (const u of a.basis)
    for (const v of b.basis) {
      const cross: Vec3 = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ];
      const length = Math.hypot(...cross);
      if (length > 1e-10) result.push(cross.map((value) => value / length) as unknown as Vec3);
    }
  return result;
}
const projectionRadius = (box: OrientedBox, axis: Vec3): number =>
  box.half.reduce((sum, half, i) => sum + half * Math.abs(dot(box.basis[i]!, axis)), 0);
/** A positive margin inflates every projection by a guaranteed motion bound. */
function orientedBoxesOverlap(a: OrientedBox, b: OrientedBox, margin = 0): boolean {
  const delta = difference(a.center, b.center);
  return separatingAxes(a, b).every(
    (axis) =>
      Math.abs(dot(delta, axis)) <
      projectionRadius(a, axis) + projectionRadius(b, axis) + margin - EPSILON,
  );
}
function boxCorners(box: OrientedBox): Vec3[] {
  const result: Vec3[] = [];
  for (const x of [-1, 1])
    for (const y of [-1, 1])
      for (const z of [-1, 1]) {
        const signs = [x, y, z];
        result.push(
          box.center.map(
            (value, i) =>
              value +
              box.half.reduce((sum, half, j) => sum + signs[j]! * half * box.basis[j]![i]!, 0),
          ) as unknown as Vec3,
        );
      }
  return result;
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.min.every((value, i) => value < b.max[i]! - EPSILON && a.max[i]! > b.min[i]! + EPSILON);
}

export function pieceBounds(piece: PieceDefinition, offset: Vec3, orientation?: Orientation): Box {
  const boxes = piece.boxes.map((box) => worldBox(box, piece, offset, orientation));
  return {
    min: [0, 1, 2].map((i) => Math.min(...boxes.map((box) => box.min[i]!))) as unknown as Vec3,
    max: [0, 1, 2].map((i) => Math.max(...boxes.map((box) => box.max[i]!))) as unknown as Vec3,
  };
}

/** A symmetric piece may seat with another cube orientation. Compare occupied
 * volume rather than requiring a particular matrix or box partition. Puzzle
 * definitions use disjoint material boxes; face contact contributes no volume. */
export function isPieceAssembled(
  piece: PieceDefinition,
  offset: Vec3,
  orientation?: Orientation,
): boolean {
  if (!offset.every((value) => Math.abs(value) <= EPSILON)) return false;
  // An axis-aligned box union cannot seat with oblique material faces. The cube
  // symmetries below still compare occupied volume rather than box partitions.
  if (orientation && !isCubeOrientation(orientation)) return false;
  return piece.boxes.every((original) => {
    // Once the seat is within positional tolerance, compare orientation at the
    // exact seat. Otherwise face area amplifies harmless sub-epsilon drag error
    // into a volume mismatch and prevents a visibly restored puzzle completing.
    const box = worldBox(original, piece, [0, 0, 0], orientation);
    const volume = box.min.reduce((product, value, i) => product * (box.max[i]! - value), 1);
    const covered = piece.boxes.reduce(
      (total, target) =>
        total +
        box.min.reduce(
          (product, value, i) =>
            product *
            Math.max(0, Math.min(box.max[i]!, target.max[i]!) - Math.max(value, target.min[i]!)),
          1,
        ),
      0,
    );
    return Math.abs(covered - volume) < EPSILON;
  });
}

/** Clearance between enclosing boxes prevents a piece sitting inside a fork's
 * empty slot from counting as removed. It also depends only on relative pose. */
export function piecesSeparated(a: Box, b: Box): boolean {
  const clearance = 0.25;
  return a.min.some(
    (value, i) =>
      value >= b.max[i]! + clearance - EPSILON || b.min[i]! >= a.max[i]! + clearance - EPSILON,
  );
}

export function isCollisionFree(
  level: Level,
  offsets: Offsets,
  orientations?: Orientations,
): boolean {
  if (
    level.pieces.some(
      (piece) =>
        !finiteVector(offsets[piece.id]) ||
        (orientations && !validOrientation(orientations[piece.id])),
    )
  )
    return false;
  if (!orientations || level.pieces.every((piece) => isCubeOrientation(orientations[piece.id]!))) {
    const boxes = level.pieces.map((piece) =>
      piece.boxes.map((box) => worldBox(box, piece, offsets[piece.id]!, orientations?.[piece.id])),
    );
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++)
        if (boxes[i]!.some((a) => boxes[j]!.some((b) => boxesOverlap(a, b)))) return false;
    return true;
  }
  const geometry = level.pieces.map((piece) =>
    piece.boxes.map((box) => {
      const material = orientedBox(box, piece, offsets[piece.id]!, orientations?.[piece.id]);
      return { material, bounds: enclosingBox(material) };
    }),
  );
  for (let i = 0; i < geometry.length; i++) {
    for (let j = i + 1; j < geometry.length; j++) {
      for (const a of geometry[i]!)
        for (const b of geometry[j]!) {
          if (boxesOverlap(a.bounds, b.bounds) && orientedBoxesOverlap(a.material, b.material))
            return false;
        }
    }
  }
  return true;
}

export interface SweepResult {
  actualOffset: number;
  blocked: boolean;
  blockedBy: string[];
}

/** Exact swept separating-axis test for oriented boxes translating on a world axis.
 * Selected members retain their relative poses and never obstruct each other.
 * The entire interval is checked, including obstacles beyond the drag endpoint.
 * Face contact is permitted; positive-volume intersection is not.
 */
export function sweepMove(
  level: Level,
  offsets: Offsets,
  pieceIds: string | readonly string[],
  requestedOffset: number,
  requestedAxis?: Axis,
  orientations?: Orientations,
): SweepResult {
  const ids = selectionIds(pieceIds);
  const leader = level.pieces.find((candidate) => candidate.id === ids[0]);
  const axis = requestedAxis ?? leader?.axis ?? 'x';
  const index = axisIndex(axis);
  const current = offsets[ids[0] ?? '']?.[index];
  const invalid = {
    actualOffset: Number.isFinite(current) ? current! : 0,
    blocked: true,
    blockedBy: [],
  };
  if (
    !leader ||
    !axes.includes(axis) ||
    !Number.isFinite(requestedOffset) ||
    !Number.isFinite(current) ||
    !Number.isFinite(requestedOffset - current!) ||
    level.pieces.some(
      (piece) =>
        !finiteVector(offsets[piece.id]) ||
        (orientations && !validOrientation(orientations[piece.id])),
    ) ||
    ids.some((id) => !level.pieces.some((piece) => piece.id === id))
  )
    return invalid;
  const delta = requestedOffset - current!;
  if (ids.some((id) => !Number.isFinite(offsets[id]![index] + delta))) return invalid;
  if (Math.abs(delta) < EPSILON) return { actualOffset: current!, blocked: false, blockedBy: [] };
  const sign = Math.sign(delta);
  let permittedDistance = Math.abs(delta);
  let blockedBy: string[] = [];
  const selected = new Set(ids);
  // Keep the common orthogonal puzzle search on the exact AABB fast path.
  // Partial rotations take the general 15-axis continuous test below.
  if (!orientations || level.pieces.every((piece) => isCubeOrientation(orientations[piece.id]!))) {
    const geometry = level.pieces.map((piece) => ({
      piece,
      boxes: piece.boxes.map((box) =>
        worldBox(box, piece, offsets[piece.id]!, orientations?.[piece.id]),
      ),
    }));
    for (const { piece, boxes } of geometry) {
      if (!selected.has(piece.id)) continue;
      for (const { piece: other, boxes: obstacles } of geometry) {
        if (selected.has(other.id)) continue;
        for (const a of boxes)
          for (const b of obstacles) {
            if (
              a.min.some(
                (value, i) =>
                  i !== index && (value >= b.max[i]! - EPSILON || a.max[i]! <= b.min[i]! + EPSILON),
              )
            )
              continue;
            let gap: number;
            if (sign > 0 && a.max[index] <= b.min[index] + EPSILON)
              gap = b.min[index] - a.max[index];
            else if (sign < 0 && a.min[index] >= b.max[index] - EPSILON)
              gap = a.min[index] - b.max[index];
            else if (a.min[index] < b.max[index] - EPSILON && a.max[index] > b.min[index] + EPSILON)
              gap = 0;
            else continue;
            gap = Math.max(0, gap);
            if (gap < permittedDistance - EPSILON) {
              permittedDistance = gap;
              blockedBy = [other.id];
            } else if (
              Math.abs(gap - permittedDistance) < EPSILON &&
              gap < Math.abs(delta) - EPSILON &&
              !blockedBy.includes(other.id)
            )
              blockedBy.push(other.id);
          }
      }
    }
    const actualOffset = current! + sign * permittedDistance;
    return { actualOffset, blocked: Math.abs(actualOffset - requestedOffset) > EPSILON, blockedBy };
  }
  const geometry = level.pieces.map((piece) => ({
    piece,
    boxes: piece.boxes.map((original) => {
      const material = orientedBox(original, piece, offsets[piece.id]!, orientations?.[piece.id]);
      return { material, bounds: enclosingBox(material) };
    }),
  }));
  for (const { piece, boxes } of geometry) {
    if (!selected.has(piece.id)) continue;
    for (const { piece: other, boxes: obstacles } of geometry) {
      if (selected.has(other.id)) continue;
      for (const { material: a, bounds } of boxes) {
        const swept: Box = {
          min: bounds.min.map(
            (value, i) => value + (i === index ? Math.min(0, delta) : 0),
          ) as unknown as Vec3,
          max: bounds.max.map(
            (value, i) => value + (i === index ? Math.max(0, delta) : 0),
          ) as unknown as Vec3,
        };
        for (const { material: b, bounds: obstacleBounds } of obstacles) {
          if (!boxesOverlap(swept, obstacleBounds)) continue;
          let entry = -Infinity;
          let exit = Infinity;
          const deltaCenter = difference(a.center, b.center);
          for (const separating of separatingAxes(a, b)) {
            const center = dot(deltaCenter, separating);
            const radius = projectionRadius(a, separating) + projectionRadius(b, separating);
            const velocity = sign * separating[index];
            if (Math.abs(velocity) < 1e-12) {
              if (Math.abs(center) >= radius - EPSILON) {
                exit = -Infinity;
                break;
              }
              continue;
            }
            const first = (-radius - center) / velocity;
            const second = (radius - center) / velocity;
            entry = Math.max(entry, Math.min(first, second));
            exit = Math.min(exit, Math.max(first, second));
            if (entry >= exit - EPSILON) break;
          }
          if (entry >= exit - EPSILON || exit <= EPSILON || entry >= Math.abs(delta) - EPSILON)
            continue;
          const gap = Math.max(0, entry);
          if (gap < permittedDistance - EPSILON) {
            permittedDistance = gap;
            blockedBy = [other.id];
          } else if (
            Math.abs(gap - permittedDistance) < EPSILON &&
            gap < Math.abs(delta) - EPSILON &&
            !blockedBy.includes(other.id)
          ) {
            blockedBy.push(other.id);
          }
        }
      }
    }
  }
  const actualOffset = current! + sign * permittedDistance;
  return { actualOffset, blocked: Math.abs(actualOffset - requestedOffset) > EPSILON, blockedBy };
}

/** Exact coordinate extrema of every rotating corner over an angular interval.
 * This encloses the whole swept volume, not just sampled endpoint poses. */
function rotationEnvelope(
  box: OrientedBox,
  pivot: Vec3,
  axis: Axis,
  low: number,
  high: number,
): Box {
  const fixed = axisIndex(axis);
  const u = (fixed + 1) % 3;
  const v = (fixed + 2) % 3;
  const bounds = enclosingBox(box);
  const min = [...bounds.min];
  const max = [...bounds.max];
  min[u] = min[v] = Infinity;
  max[u] = max[v] = -Infinity;
  const extrema = (a: number, b: number): number[] => {
    const evaluate = (angle: number) => a * Math.cos(angle) + b * Math.sin(angle);
    const values = [evaluate(low), evaluate(high)];
    const turning = Math.atan2(b, a);
    for (let k = -2; k <= 2; k++) {
      const angle = turning + k * Math.PI;
      if (angle > low && angle < high) values.push(evaluate(angle));
    }
    return values;
  };
  for (const corner of boxCorners(box)) {
    const first = corner[u]!;
    const second = corner[v]!;
    const a = first - pivot[u]!;
    const b = second - pivot[v]!;
    const firstValues = extrema(a, -b).map((value) => value + pivot[u]!);
    const secondValues = extrema(b, a).map((value) => value + pivot[v]!);
    min[u] = Math.min(min[u]!, ...firstValues);
    max[u] = Math.max(max[u]!, ...firstValues);
    min[v] = Math.min(min[v]!, ...secondValues);
    max[v] = Math.max(max[v]!, ...secondValues);
  }
  return { min: min as unknown as Vec3, max: max as unknown as Vec3 };
}

export interface RotationSweep {
  offsets: Offsets;
  orientations: Orientations;
  pivot: Vec3;
  blocked: boolean;
  blockedBy: string[];
}

/** Rigid configurable turn about the mean of selected material-reference centers. Exact
 * corner envelopes and a midpoint OBB with a proven corner-displacement bound
 * certify each continuous interval. Intervals below 90/128 degrees that remain
 * ambiguous are conservatively rejected. Midpoints alone never prove safety.
 * Selected members preserve relative geometry and do not obstruct each other. */
export function sweepRotation(
  level: Level,
  offsets: Offsets,
  orientations: Orientations,
  pieceIds: string | readonly string[],
  axis: Axis,
  direction: -1 | 1,
  rotationDegrees = 90,
  /** Used only when validating legacy saves that rotated around bounds. */
  legacyPivot?: Vec3,
): RotationSweep {
  const ids = selectionIds(pieceIds);
  const invalid: RotationSweep = {
    offsets,
    orientations,
    pivot: [0, 0, 0],
    blocked: true,
    blockedBy: [],
  };
  if (
    !ids.length ||
    !axes.includes(axis) ||
    (direction !== -1 && direction !== 1) ||
    !Number.isFinite(rotationDegrees) ||
    rotationDegrees < 1e-5 ||
    rotationDegrees > 180 ||
    ids.some((id) => !level.pieces.some((piece) => piece.id === id)) ||
    !isCollisionFree(level, offsets, orientations)
  )
    return invalid;
  const selected = new Set(ids);
  const moving = level.pieces.filter((piece) => selected.has(piece.id));
  // Averaging the fixed material-reference centers commutes with every rigid
  // transform. An oblique shape's enclosing AABB center does not, so using it
  // would make inverse partial turns shift an asymmetric piece or selection.
  const centers = moving.map(
    (piece) =>
      pieceCenter(piece).map((value, i) => value + offsets[piece.id]![i]!) as unknown as Vec3,
  );
  const pivot =
    legacyPivot ??
    ([0, 1, 2].map((i) =>
      centers.reduce((sum, center) => sum + center[i]! / centers.length, 0),
    ) as unknown as Vec3);
  if (!finiteVector(pivot)) return invalid;
  const blockedBy: string[] = [];
  const angle = (direction * rotationDegrees * Math.PI) / 180;
  const low = Math.min(0, angle);
  const high = Math.max(0, angle);
  const rotateBox = (box: OrientedBox, radians: number): OrientedBox => {
    const rotation = rotationOrientation(
      axis,
      radians < 0 ? -1 : 1,
      (Math.abs(radians) * 180) / Math.PI,
    );
    const center = transformVector(difference(box.center, pivot), rotation);
    return {
      center: center.map((value, i) => value + pivot[i]!) as unknown as Vec3,
      half: box.half,
      basis: box.basis.map((basis) =>
        transformVector(basis, rotation),
      ) as unknown as OrientedBox['basis'],
    };
  };
  const arcBlocked = (
    box: OrientedBox,
    other: OrientedBox,
    obstacleBounds: Box,
    radius: number,
    start: number,
    end: number,
  ): boolean => {
    if (!boxesOverlap(rotationEnvelope(box, pivot, axis, start, end), obstacleBounds)) return false;
    const middle = (start + end) / 2;
    // Every point in the rotating solid stays within this distance of its
    // midpoint pose. A separating plane outside it certifies the whole arc.
    const displacement = 2 * radius * Math.sin((end - start) / 4);
    if (!orientedBoxesOverlap(rotateBox(box, middle), other, displacement)) return false;
    if (end - start <= Math.PI / 256) return true;
    return (
      arcBlocked(box, other, obstacleBounds, radius, start, middle) ||
      arcBlocked(box, other, obstacleBounds, radius, middle, end)
    );
  };
  const geometry = moving.flatMap((piece) =>
    piece.boxes.map((box) => {
      const material = orientedBox(box, piece, offsets[piece.id]!, orientations[piece.id]);
      const radius = Math.max(
        ...boxCorners(material).map((corner) =>
          Math.hypot(...corner.map((value, i) => (i === axisIndex(axis) ? 0 : value - pivot[i]!))),
        ),
      );
      return { material, radius };
    }),
  );
  for (const other of level.pieces) {
    if (selected.has(other.id)) continue;
    const stationary = other.boxes.map((box) =>
      orientedBox(box, other, offsets[other.id]!, orientations[other.id]),
    );
    if (
      geometry.some(({ material, radius }) =>
        stationary.some((obstacle) =>
          arcBlocked(material, obstacle, enclosingBox(obstacle), radius, low, high),
        ),
      )
    )
      blockedBy.push(other.id);
  }
  if (blockedBy.length) return { ...invalid, pivot, blockedBy };
  const rotation = rotationOrientation(axis, direction, rotationDegrees);
  const nextOffsets = { ...offsets };
  const nextOrientations = { ...orientations };
  for (const piece of moving) {
    const center = pieceCenter(piece);
    const relative = center.map(
      (value, i) => value + offsets[piece.id]![i]! - pivot[i]!,
    ) as unknown as Vec3;
    const rotated = transformVector(relative, rotation);
    nextOffsets[piece.id] = rotated.map(
      (value, i) => value + pivot[i]! - center[i]!,
    ) as unknown as Vec3;
    nextOrientations[piece.id] = multiplyOrientation(rotation, orientations[piece.id]!);
  }
  if (!isCollisionFree(level, nextOffsets, nextOrientations)) return { ...invalid, pivot };
  return {
    offsets: nextOffsets,
    orientations: nextOrientations,
    pivot,
    blocked: false,
    blockedBy: [],
  };
}
