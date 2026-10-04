import type { Axis, Orientation, Orientations, PieceDefinition, Vec3 } from './types.ts';

export const IDENTITY_ORIENTATION: Orientation = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const clean = (value: number): number => (value === 0 ? 0 : value);
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
export const isIdentityOrientation = (value: Orientation = IDENTITY_ORIENTATION): boolean =>
  value.every((entry, i) => entry === IDENTITY_ORIENTATION[i]);
export function validOrientation(value: unknown): value is Orientation {
  if (
    !Array.isArray(value) ||
    value.length !== 9 ||
    value.some((v) => v !== -1 && v !== 0 && v !== 1)
  )
    return false;
  for (let i = 0; i < 3; i++) {
    if (
      [0, 1, 2].reduce((sum, j) => sum + Math.abs(value[i * 3 + j]), 0) !== 1 ||
      [0, 1, 2].reduce((sum, j) => sum + Math.abs(value[j * 3 + i]), 0) !== 1
    )
      return false;
  }
  return (
    value[0] * (value[4] * value[8] - value[5] * value[7]) -
      value[1] * (value[3] * value[8] - value[5] * value[6]) +
      value[2] * (value[3] * value[7] - value[4] * value[6]) ===
    1
  );
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
