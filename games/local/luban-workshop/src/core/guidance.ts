import { axisIndex, EPSILON } from './collision.ts';
import { IDENTITY_ORIENTATION } from './rotation.ts';
import type { GameState, Hint, HintPoseCondition, Level, Vec3 } from './types.ts';

/** Declarative level rules inspect the live pose. They are optional candidates,
 * never permissions to bypass the physical solver or a saved solution index. */
function matchesPose(state: GameState, condition: HintPoseCondition, origin: Vec3): boolean {
  const position = state.offsets[condition.pieceId];
  if (!position) return false;
  const offset = position.map((value, i) => value - origin[i]!);
  const tolerance = condition.tolerance ?? EPSILON;
  if (!Number.isFinite(tolerance) || tolerance < 0) return false;
  if (
    condition.offset &&
    (condition.offset.length !== 3 ||
      condition.offset.some(
        (value, index) => !Number.isFinite(value) || Math.abs(value - offset[index]!) > tolerance,
      ))
  )
    return false;
  if (
    condition.offsetRange &&
    (condition.offsetRange.min.length !== 3 ||
      condition.offsetRange.max.length !== 3 ||
      offset.some((value, index) => {
        const min = condition.offsetRange!.min[index]!;
        const max = condition.offsetRange!.max[index]!;
        return (
          !Number.isFinite(min) ||
          !Number.isFinite(max) ||
          min > max ||
          value < min - tolerance ||
          value > max + tolerance
        );
      }))
  )
    return false;
  const orientation = state.orientations[condition.pieceId] ?? IDENTITY_ORIENTATION;
  if (
    condition.orientation &&
    (condition.orientation.length !== 9 ||
      condition.orientation.some(
        (value, index) =>
          !Number.isFinite(value) || Math.abs(value - orientation[index]!) > tolerance,
      ))
  )
    return false;
  return true;
}

export function levelHintCandidates(level: Level, state: GameState): Hint[] {
  const candidates: Hint[] = [];
  for (const rule of level.hintRules ?? []) {
    const origin = rule.relativeToPieceId
      ? state.offsets[rule.relativeToPieceId]
      : ([0, 0, 0] as const);
    if (!origin || !origin.every(Number.isFinite)) continue;
    if (
      (!rule.phase || rule.phase === state.phase) &&
      // Translating to an absolute coordinate naturally stops at its target.
      // A relative rotation needs an explicit starting orientation for every
      // selected piece, otherwise an offset-only rule could rotate forever.
      (rule.action.kind !== 'rotate' ||
        rule.action.pieceIds.every((id) =>
          rule.when?.some((condition) => condition.pieceId === id && condition.orientation),
        )) &&
      (rule.when ?? []).every((condition) => matchesPose(state, condition, origin))
    )
      candidates.push({
        ...rule.action,
        pieceIds: [...rule.action.pieceIds],
        targetOffset:
          rule.action.kind === 'rotate'
            ? rule.action.targetOffset
            : rule.action.targetOffset + origin[axisIndex(rule.action.axis)],
      });
  }
  return candidates;
}
