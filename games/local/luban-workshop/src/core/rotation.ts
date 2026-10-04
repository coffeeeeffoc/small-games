import type { Axis, Orientation, Orientations, PieceDefinition, Vec3 } from './types.ts';

export const IDENTITY_ORIENTATION: Orientation = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const MATRIX_EPSILON = 1e-8;
/** Snap only floating-point residue so inverse turns and full revolutions close. */
const clean = (value: number): number => {
  for (const exact of [-1, 0, 1]) if (Math.abs(value - exact) < 1e-12) return exact;
  return value;
};
export function transformVector(vector: Vec3, matrix: Orientation): Vec3 {
  return [0, 1, 2].map((row) =>
    clean(
      matrix[row * 3]! * vector[0] +
        matrix[row * 3 + 1]! * vector[1] +
        matrix[row * 3 + 2]! * vector[2],
    ),
  ) as unknown as Vec3;
}
export function multiplyOrientation(a: Orientation, b: Orientation): Orientation {
  return Array.from({ length: 9 }, (_, i) =>
    clean(
      [0, 1, 2].reduce((sum, k) => sum + a[Math.floor(i / 3) * 3 + k]! * b[k * 3 + (i % 3)]!, 0),
    ),
  ) as unknown as Orientation;
}
export function quarterTurnOrientation(axis: Axis, direction: -1 | 1): Orientation {
  if (axis === 'x') return [1, 0, 0, 0, 0, -direction, 0, direction, 0];
  if (axis === 'y') return [0, 0, direction, 0, 1, 0, -direction, 0, 0];
  return [0, -direction, 0, direction, 0, 0, 0, 0, 1];
}
export function rotationOrientation(axis: Axis, direction: -1 | 1, degrees = 90): Orientation {
  const radians = (direction * degrees * Math.PI) / 180;
  const c = clean(Math.cos(radians));
  const s = clean(Math.sin(radians));
  if (axis === 'x') return [1, 0, 0, 0, c, -s, 0, s, c].map(clean) as unknown as Orientation;
  if (axis === 'y') return [c, 0, s, 0, 1, 0, -s, 0, c].map(clean) as unknown as Orientation;
  return [c, -s, 0, s, c, 0, 0, 0, 1].map(clean) as unknown as Orientation;
}
export const orientationsEqual = (a: Orientation, b: Orientation): boolean =>
  a.every((value, i) => Math.abs(value - b[i]!) <= MATRIX_EPSILON);
export const isIdentityOrientation = (value: Orientation = IDENTITY_ORIENTATION): boolean =>
  orientationsEqual(value, IDENTITY_ORIENTATION);
export function validOrientation(value: unknown): value is Orientation {
  if (!Array.isArray(value) || value.length !== 9 || !value.every(Number.isFinite)) return false;
  for (let row = 0; row < 3; row++) {
    for (let other = row; other < 3; other++) {
      const dot = [0, 1, 2].reduce((sum, j) => sum + value[row * 3 + j] * value[other * 3 + j], 0);
      if (Math.abs(dot - (row === other ? 1 : 0)) > MATRIX_EPSILON) return false;
    }
  }
  const determinant =
    value[0] * (value[4] * value[8] - value[5] * value[7]) -
    value[1] * (value[3] * value[8] - value[5] * value[6]) +
    value[2] * (value[3] * value[7] - value[4] * value[6]);
  return Math.abs(determinant - 1) <= MATRIX_EPSILON;
}
export const isCubeOrientation = (value: Orientation): boolean =>
  value.every((entry) => [-1, 0, 1].some((exact) => Math.abs(entry - exact) <= MATRIX_EPSILON));

/** Infer an undoable world-axis rotation without relying on a finite orientation
 * graph. A half turn has two equivalent endpoint directions; callers validating
 * a swept path may try both. Compound world-axis rotations return null. */
export function relativeAxisRotation(
  from: Orientation,
  to: Orientation,
): { axis: Axis; direction: -1 | 1; degrees: number } | null {
  const transpose = Array.from(
    { length: 9 },
    (_, i) => from[(i % 3) * 3 + Math.floor(i / 3)]!,
  ) as unknown as Orientation;
  const relative = multiplyOrientation(to, transpose);
  for (const axis of ['x', 'y', 'z'] as const) {
    const sine = axis === 'x' ? relative[7] : axis === 'y' ? relative[2] : relative[3];
    const cosine = axis === 'x' ? relative[4] : relative[0];
    const angle = (Math.atan2(sine, cosine) * 180) / Math.PI;
    if (Math.abs(angle) < 1e-8) continue;
    const direction = angle < 0 ? -1 : 1;
    const degrees = Math.abs(angle);
    if (orientationsEqual(relative, rotationOrientation(axis, direction, degrees)))
      return { axis, direction, degrees };
  }
  return null;
}
export const cloneOrientations = (orientations: Orientations): Orientations =>
  Object.fromEntries(
    Object.entries(orientations).map(([id, value]) => [id, [...value] as unknown as Orientation]),
  );
export function pieceCenter(piece: PieceDefinition): Vec3 {
  return [0, 1, 2].map(
    (i) =>
      (Math.min(...piece.boxes.map((box) => box.min[i]!)) +
        Math.max(...piece.boxes.map((box) => box.max[i]!))) /
      2,
  ) as unknown as Vec3;
}
