import { axisIndex, EPSILON } from './collision.ts';
import type { Level, Offsets, PieceDefinition } from './types.ts';

interface Interval {
  min: number;
  max: number;
}

/** A search evaluates the same pair geometry thousands of times. For a moving
 * piece, another piece's offset completely determines its forbidden intervals.
 * Compile and cache those intervals instead of allocating world-space boxes on
 * every search edge. Gameplay still uses sweepMove for feedback and validation.
 */
export function createSearchSweep(
  level: Level,
): (offsets: Offsets, pieceId: string, requestedOffset: number) => number {
  const pairs = new Map<
    string,
    {
      piece: PieceDefinition;
      obstacles: { piece: PieceDefinition; intervals: Map<number, Interval[]> }[];
    }
  >();
  for (const piece of level.pieces) {
    pairs.set(piece.id, {
      piece,
      obstacles: level.pieces
        .filter((other) => other.id !== piece.id)
        .map((other) => ({ piece: other, intervals: new Map() })),
    });
  }

  return (offsets, pieceId, requestedOffset) => {
    const pair = pairs.get(pieceId);
    const current = offsets[pieceId];
    if (!pair || !Number.isFinite(current) || !Number.isFinite(requestedOffset))
      return current ?? 0;
    const target = Math.min(pair.piece.range[1], Math.max(pair.piece.range[0], requestedOffset));
    const delta = target - current!;
    if (Math.abs(delta) < EPSILON) return current!;
    const movingAxis = axisIndex(pair.piece.axis);
    const positive = delta > 0;
    let distance = Math.abs(delta);
    for (const obstacle of pair.obstacles) {
      const otherOffset = offsets[obstacle.piece.id]!;
      let intervals = obstacle.intervals.get(otherOffset);
      if (!intervals) {
        const otherAxis = axisIndex(obstacle.piece.axis);
        const found: Interval[] = [];
        for (const a of pair.piece.boxes) {
          for (const b of obstacle.piece.boxes) {
            let overlap = true;
            for (let axis = 0; axis < 3; axis++) {
              if (axis === movingAxis) continue;
              const shift = axis === otherAxis ? otherOffset : 0;
              if (
                a.min[axis]! >= b.max[axis]! + shift - EPSILON ||
                a.max[axis]! <= b.min[axis]! + shift + EPSILON
              ) {
                overlap = false;
                break;
              }
            }
            if (!overlap) continue;
            const shift = movingAxis === otherAxis ? otherOffset : 0;
            found.push({
              min: b.min[movingAxis] + shift - a.max[movingAxis],
              max: b.max[movingAxis] + shift - a.min[movingAxis],
            });
          }
        }
        found.sort((a, b) => a.min - b.min);
        intervals = [];
        for (const interval of found) {
          const previous = intervals.at(-1);
          if (previous && interval.min <= previous.max)
            previous.max = Math.max(previous.max, interval.max);
          else intervals.push({ ...interval });
        }
        // Dragged positions can be arbitrary fractions; bound each pair cache.
        if (obstacle.intervals.size >= 256)
          obstacle.intervals.delete(obstacle.intervals.keys().next().value!);
        obstacle.intervals.set(otherOffset, intervals);
      }
      for (const interval of intervals) {
        let gap: number;
        if (positive && current! <= interval.min + EPSILON) gap = interval.min - current!;
        else if (!positive && current! >= interval.max - EPSILON) gap = current! - interval.max;
        else if (current! > interval.min + EPSILON && current! < interval.max - EPSILON) gap = 0;
        else continue;
        distance = Math.min(distance, Math.max(0, gap));
      }
      if (distance < EPSILON) break;
    }
    return Math.round((current! + Math.sign(delta) * distance) * 1e6) / 1e6;
  };
}
