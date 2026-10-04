import { axes, axisIndex, EPSILON, finiteVector, pieceBounds, sweepMove } from './collision.ts';
import type { Axis, Box, Level, Offsets, Orientations, Vec3 } from './types.ts';

interface RouteStep {
  axis: Axis;
  targetOffset: number;
}

const inside = (point: Vec3, obstacle: Box): boolean =>
  point.every(
    (value, index) =>
      value > obstacle.min[index]! + EPSILON && value < obstacle.max[index]! - EPSILON,
  );

/** Route a separated piece around the enclosing boxes of stationary pieces.
 * Planning in displacement space makes each piece a point and each obstacle a
 * Minkowski-expanded box. It deliberately avoids paths through fork interiors.
 */
export function routePiece(
  level: Level,
  offsets: Offsets,
  pieceId: string,
  target: Vec3,
  orientations?: Orientations,
): RouteStep[] | null {
  const piece = level.pieces.find((candidate) => candidate.id === pieceId);
  if (
    !piece ||
    !finiteVector(target) ||
    level.pieces.some((item) => !finiteVector(offsets[item.id]))
  )
    return null;
  const start = offsets[pieceId]!;
  const original = pieceBounds(piece, [0, 0, 0], orientations?.[pieceId]);
  const stationary = level.pieces
    .filter((item) => item.id !== pieceId)
    .map((item) => pieceBounds(item, offsets[item.id]!, orientations?.[item.id]));
  if ([original, ...stationary].some((box) => !finiteVector(box.min) || !finiteVector(box.max)))
    return null;

  const search = (padding: number): RouteStep[] | null => {
    const obstacles: Box[] = stationary.map((box) => ({
      min: box.min.map((value, index) => value - original.max[index]! - padding) as unknown as Vec3,
      max: box.max.map((value, index) => value - original.min[index]! + padding) as unknown as Vec3,
    }));
    if (
      obstacles.some(
        (box) =>
          !finiteVector(box.min) ||
          !finiteVector(box.max) ||
          inside(start, box) ||
          inside(target, box),
      )
    )
      return null;
    if (start.every((value, index) => value === target[index])) return [];

    // At most ten coordinates per axis for the five-piece puzzles. Every
    // adjacent grid segment is checked in full, so long edges cannot tunnel.
    // Outward half-grid rounding makes every detour reachable by touch snapping
    // and the half-unit nudge controls, despite the optional clearance margin.
    const coordinates = axes.map((_, index) =>
      [
        ...new Set([
          start[index]!,
          target[index]!,
          ...obstacles.flatMap((box) => [
            Math.floor((box.min[index]! - 0.5) * 2) / 2,
            Math.ceil((box.max[index]! + 0.5) * 2) / 2,
          ]),
        ]),
      ]
        .filter(Number.isFinite)
        .sort((a, b) => a - b),
    );
    const [nx, ny, nz] = coordinates.map((values) => values.length) as [number, number, number];
    const encode = (x: number, y: number, z: number) => (x * ny + y) * nz + z;
    const decode = (id: number): [number, number, number] => [
      Math.floor(id / (ny * nz)),
      Math.floor(id / nz) % ny,
      id % nz,
    ];
    const point = (indices: readonly number[]): Vec3 => [
      coordinates[0]![indices[0]!]!,
      coordinates[1]![indices[1]!]!,
      coordinates[2]![indices[2]!]!,
    ];
    const startIndices = start.map((value, index) => coordinates[index]!.indexOf(value)) as [
      number,
      number,
      number,
    ];
    const targetIndices = target.map((value, index) => coordinates[index]!.indexOf(value)) as [
      number,
      number,
      number,
    ];
    const first = encode(...startIndices);
    const last = encode(...targetIndices);
    const previous = new Int32Array(nx * ny * nz).fill(-2);
    previous[first] = -1;
    const queue = [first];
    let cursor = 0;
    while (cursor < queue.length && previous[last] === -2) {
      const id = queue[cursor++]!;
      const indices = decode(id);
      const from = point(indices);
      for (let index = 0; index < 3; index++) {
        for (const direction of [-1, 1]) {
          const nextIndices = [...indices] as [number, number, number];
          nextIndices[index] = nextIndices[index]! + direction;
          if (nextIndices[index]! < 0 || nextIndices[index]! >= coordinates[index]!.length)
            continue;
          const next = encode(...nextIndices);
          if (previous[next] !== -2) continue;
          const to = point(nextIndices);
          if (!Number.isFinite(to[index]! - from[index]!)) continue;
          const low = Math.min(from[index]!, to[index]!);
          const high = Math.max(from[index]!, to[index]!);
          const blocked = obstacles.some(
            (box) =>
              from.every(
                (value, fixed) =>
                  fixed === index ||
                  (value > box.min[fixed]! + EPSILON && value < box.max[fixed]! - EPSILON),
              ) &&
              high > box.min[index]! + EPSILON &&
              low < box.max[index]! - EPSILON,
          );
          if (blocked) continue;
          previous[next] = id;
          queue.push(next);
        }
      }
    }
    if (previous[last] === -2) return null;
    const path: number[] = [];
    for (let id = last; id !== first; id = previous[id]!) path.push(id);
    path.reverse();
    let before = start;
    const route: RouteStep[] = [];
    for (const id of path) {
      const after = point(decode(id));
      const index = before.findIndex((value, i) => value !== after[i]);
      const axis = axes[index]!;
      const step = { axis, targetOffset: after[index]! };
      if (route.at(-1)?.axis === axis) route[route.length - 1] = step;
      else route.push(step);
      before = after;
    }
    return route;
  };

  // A position within the optional margin can still be physically legal. The
  // zero-padding retry also preserves narrow but valid passages.
  const route = search(0.125) ?? search(0);
  if (!route) return null;
  const current: Offsets = { ...offsets, [pieceId]: [...start] as unknown as Vec3 };
  for (const step of route) {
    const result = sweepMove(level, current, pieceId, step.targetOffset, step.axis, orientations);
    if (
      !Number.isFinite(result.actualOffset) ||
      Math.abs(result.actualOffset - step.targetOffset) > EPSILON
    )
      return null;
    const index = axisIndex(step.axis);
    current[pieceId] = current[pieceId]!.map((value, i) =>
      i === index ? result.actualOffset : value,
    ) as unknown as Vec3;
  }
  return current[pieceId]!.every((value, index) => Math.abs(value - target[index]!) <= EPSILON)
    ? route
    : null;
}
