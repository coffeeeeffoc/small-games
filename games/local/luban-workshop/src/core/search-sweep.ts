import { axes, axisIndex, EPSILON, finiteVector, selectionIds, worldBox } from './collision.ts';
import { IDENTITY_ORIENTATION, validOrientation } from './rotation.ts';
import type { Axis, Level, Offsets, Orientations, PieceDefinition } from './types.ts';

interface Interval {
  min: number;
  max: number;
}

/** Cached pair intervals accelerate search without changing the live collision
 * rules. All three position coordinates, any travel axis, and rigid selections
 * are supported; selected members never obstruct one another. */
export function createSearchSweep(
  level: Level,
): (
  offsets: Offsets,
  pieceIds: string | readonly string[],
  requestedOffset: number,
  axis?: Axis,
  orientations?: Orientations,
) => number {
  const pairs = new Map<
    string,
    {
      piece: PieceDefinition;
      obstacles: { piece: PieceDefinition; intervals: Map<string, Interval[]> }[];
    }
  >();
  for (const piece of level.pieces)
    pairs.set(piece.id, {
      piece,
      obstacles: level.pieces
        .filter((other) => other.id !== piece.id)
        .map((other) => ({ piece: other, intervals: new Map() })),
    });

  return (offsets, pieceIds, requestedOffset, requestedAxis, orientations) => {
    const ids = selectionIds(pieceIds);
    const leader = pairs.get(ids[0] ?? '');
    const axis = requestedAxis ?? leader?.piece.axis ?? 'x';
    const index = axisIndex(axis);
    const current = offsets[ids[0] ?? '']?.[index];
    if (
      !leader ||
      !axes.includes(axis) ||
      !Number.isFinite(current) ||
      !Number.isFinite(requestedOffset) ||
      !Number.isFinite(requestedOffset - current!) ||
      ids.some((id) => !pairs.has(id)) ||
      level.pieces.some(
        (piece) =>
          !finiteVector(offsets[piece.id]) ||
          (orientations && !validOrientation(orientations[piece.id])),
      )
    )
      return Number.isFinite(current) ? current! : 0;
    const delta = requestedOffset - current!;
    if (ids.some((id) => !Number.isFinite(offsets[id]![index] + delta))) return current!;
    if (Math.abs(delta) < EPSILON) return current!;
    const positive = delta > 0;
    const selected = new Set(ids);
    let distance = Math.abs(delta);
    for (const id of ids) {
      const pair = pairs.get(id)!;
      const position = offsets[id]!;
      for (const obstacle of pair.obstacles) {
        if (selected.has(obstacle.piece.id)) continue;
        const otherPosition = offsets[obstacle.piece.id]!;
        const orientation = orientations?.[id] ?? IDENTITY_ORIENTATION;
        const otherOrientation = orientations?.[obstacle.piece.id] ?? IDENTITY_ORIENTATION;
        const key = `${axis}:${position.join(',')}:${otherPosition.join(',')}:${orientation.join(',')}:${otherOrientation.join(',')}`;
        let intervals = obstacle.intervals.get(key);
        if (!intervals) {
          const found: Interval[] = [];
          const moving = pair.piece.boxes.map((box) =>
            worldBox(box, pair.piece, position, orientation),
          );
          const stationary = obstacle.piece.boxes.map((box) =>
            worldBox(box, obstacle.piece, otherPosition, otherOrientation),
          );
          for (const a of moving)
            for (const b of stationary) {
              let overlap = true;
              for (let i = 0; i < 3; i++) {
                if (i === index) continue;
                if (a.min[i]! >= b.max[i]! - EPSILON || a.max[i]! <= b.min[i]! + EPSILON) {
                  overlap = false;
                  break;
                }
              }
              if (overlap)
                found.push({
                  min: b.min[index] - a.max[index],
                  max: b.max[index] - a.min[index],
                });
            }
          found.sort((a, b) => a.min - b.min);
          intervals = [];
          for (const interval of found) {
            const previous = intervals.at(-1);
            if (previous && interval.min <= previous.max)
              previous.max = Math.max(previous.max, interval.max);
            else intervals.push({ ...interval });
          }
          if (obstacle.intervals.size >= 1024)
            obstacle.intervals.delete(obstacle.intervals.keys().next().value!);
          obstacle.intervals.set(key, intervals);
        }
        for (const interval of intervals) {
          let gap: number;
          if (positive && interval.min >= -EPSILON) gap = interval.min;
          else if (!positive && interval.max <= EPSILON) gap = -interval.max;
          else if (interval.min < -EPSILON && interval.max > EPSILON) gap = 0;
          else continue;
          gap = Math.max(0, gap);
          if (gap < distance - EPSILON) distance = gap;
        }
        if (distance === 0) break;
      }
      if (distance === 0) break;
    }
    return current! + Math.sign(delta) * distance;
  };
}
