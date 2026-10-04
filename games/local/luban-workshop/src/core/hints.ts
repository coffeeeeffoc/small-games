import { axes, axisIndex, EPSILON, pieceBounds, piecesSeparated, sweepMove } from './collision.ts';
import { createGame, getProgress, tryMove, tryRotate } from './game.ts';
import { levelHintCandidates } from './guidance.ts';
import { routePiece } from './routing.ts';
import {
  IDENTITY_ORIENTATION,
  isIdentityOrientation,
  isCubeOrientation,
  orientationsEqual,
  relativeAxisRotation,
} from './rotation.ts';
import { createSearchSweep } from './search-sweep.ts';
import type { Axis, GameState, Hint, Level, Offsets, Snapshot, Vec3 } from './types.ts';

interface SearchNode {
  offsets: Offsets;
  first: Hint | null;
  parent: SearchNode | null;
  action: Hint | null;
  depth: number;
  priority: number;
}

/** A tiny binary heap keeps bounded current-pose searches responsive on phones. */
class Frontier {
  private nodes: SearchNode[] = [];
  get length(): number {
    return this.nodes.length;
  }
  push(node: SearchNode): void {
    this.nodes.push(node);
    let index = this.nodes.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.nodes[parent]!.priority <= node.priority) break;
      this.nodes[index] = this.nodes[parent]!;
      index = parent;
    }
    this.nodes[index] = node;
  }
  pop(): SearchNode {
    const result = this.nodes[0]!;
    const last = this.nodes.pop()!;
    if (this.nodes.length) {
      let index = 0;
      while (index * 2 + 1 < this.nodes.length) {
        let child = index * 2 + 1;
        if (
          child + 1 < this.nodes.length &&
          this.nodes[child + 1]!.priority < this.nodes[child]!.priority
        )
          child++;
        if (last.priority <= this.nodes[child]!.priority) break;
        this.nodes[index] = this.nodes[child]!;
        index = child;
      }
      this.nodes[index] = last;
    }
    return result;
  }
}

const sweepCache = new WeakMap<Level, ReturnType<typeof createSearchSweep>>();
const groupCache = new WeakMap<Level, string[][]>();

function groups(level: Level): string[][] {
  const cached = groupCache.get(level);
  if (cached) return cached;
  // Include every subassembly in the current six-piece campaign;
  // moving the entire puzzle cannot improve relative separation.
  const result: string[][] = [];
  for (let mask = 1; mask < 2 ** level.pieces.length; mask++) {
    result.push(level.pieces.filter((_, index) => mask & (1 << index)).map((piece) => piece.id));
  }
  result.sort((a, b) => a.length - b.length);
  groupCache.set(level, result);
  return result;
}

/** Search only legal sweeps from the actual 3D pose. Directions, group choices,
 * contact stops, and parking positions all derive from current solid geometry;
 * the level data contains no extraction order or solution script.
 */
function directHint(level: Level, state: GameState, reverseTarget?: Offsets): Hint | null {
  if (!reverseTarget && getProgress(level, state).complete) return null;
  const sweep = sweepCache.get(level) ?? createSearchSweep(level);
  sweepCache.set(level, sweep);
  const key = (offsets: Offsets) =>
    level.pieces
      .flatMap((piece) => offsets[piece.id]!.map((value) => Math.round(value * 1e5)))
      .join(',');
  const score = (offsets: Offsets): number => {
    if (state.phase === 'reassemble') {
      return level.pieces.reduce(
        (sum, piece) =>
          sum +
          offsets[piece.id]!.reduce((subtotal, value, index) => {
            const distance = Math.abs(value - (reverseTarget?.[piece.id]?.[index] ?? 0));
            return subtotal + (distance < EPSILON ? 0 : 8 + Math.min(distance, 30) * 0.02);
          }, 0),
        0,
      );
    }
    const bounds = level.pieces.map((piece) =>
      pieceBounds(piece, offsets[piece.id]!, state.orientations[piece.id]),
    );
    let contacts = 0;
    for (let i = 0; i < bounds.length; i++)
      for (let j = i + 1; j < bounds.length; j++)
        if (!piecesSeparated(bounds[i]!, bounds[j]!)) contacts++;
    return contacts * 8;
  };
  const initialScore = score(state.offsets);
  const selections = groups(level);
  const frontier = new Frontier();
  frontier.push({
    offsets: state.offsets,
    first: null,
    parent: null,
    action: null,
    depth: 0,
    priority: initialScore,
  });
  const visited = new Set([key(state.offsets)]);
  let fallback: { hint: Hint; score: number } | null = null;
  // Keep both memory and work bounded. A fallback must improve the current
  // geometry; never suggest an arbitrary legal move that can cause a loop.
  for (let cursor = 0; cursor < 80 && frontier.length && visited.size < 2200; cursor++) {
    const node = frontier.pop();
    const bounds = Object.fromEntries(
      level.pieces.map((piece) => [
        piece.id,
        pieceBounds(piece, node.offsets[piece.id]!, state.orientations[piece.id]),
      ]),
    );
    for (const ids of selections) {
      const leader = level.pieces.find((piece) => piece.id === ids[0])!;
      const outsiders = level.pieces.filter((piece) => !ids.includes(piece.id));
      if (!outsiders.length && state.phase === 'disassemble') continue;
      // Prefer the displayed primary direction only as a tie breaker.
      const directions: Axis[] = [leader.axis, ...axes.filter((axis) => axis !== leader.axis)];
      for (const axis of directions) {
        const index = axisIndex(axis);
        const current = node.offsets[leader.id]![index];
        const targets: number[] = [];
        if (state.phase === 'reassemble') {
          // A group can return one shared displacement to zero atomically.
          // Unequal offsets still have individual candidates below.
          const goal = reverseTarget?.[leader.id]?.[index] ?? 0;
          if (
            ids.every(
              (id) =>
                Math.abs(
                  (reverseTarget?.[id]?.[index] ?? 0) - node.offsets[id]![index] - (goal - current),
                ) < EPSILON,
            )
          )
            targets.push(goal);
        } else targets.push(0);
        if (outsiders.length) {
          const movingMin = Math.min(...ids.map((id) => bounds[id]!.min[index]));
          const movingMax = Math.max(...ids.map((id) => bounds[id]!.max[index]));
          // Include the original seat in parking extents during reassembly so
          // detours provide clearance to both the current and final assemblies.
          const fixed = outsiders.map((piece) => bounds[piece.id]!);
          if (state.phase === 'reassemble')
            fixed.push(...level.pieces.map((piece) => pieceBounds(piece, [0, 0, 0])));
          targets.push(current + Math.max(...fixed.map((box) => box.max[index])) - movingMin + 1);
          targets.push(current + Math.min(...fixed.map((box) => box.min[index])) - movingMax - 1);
        }
        for (const target of targets) {
          const actualOffset = sweep(node.offsets, ids, target, axis, state.orientations);
          const delta = actualOffset - current;
          if (Math.abs(delta) < EPSILON) continue;
          const offsets = { ...node.offsets };
          for (const id of ids)
            offsets[id] = offsets[id]!.map(
              (value, i) => value + (i === index ? delta : 0),
            ) as unknown as Vec3;
          const stateKey = key(offsets);
          if (visited.has(stateKey)) continue;
          visited.add(stateKey);
          const direction = delta > 0 ? 1 : -1;
          const labels = ids
            .map((id) =>
              String.fromCharCode(65 + level.pieces.findIndex((piece) => piece.id === id)),
            )
            .join('、');
          const action: Hint = {
            pieceId: leader.id,
            pieceIds: ids,
            axis,
            targetOffset: actualOffset,
            direction,
            message: `选择${labels}${ids.length > 1 ? '组成一组' : ''}，沿${axis.toUpperCase()}轴${direction > 0 ? '正向' : '负向'}${state.phase === 'reassemble' && Math.abs(actualOffset) < EPSILON ? '移回原位' : Math.abs(actualOffset - target) > EPSILON ? '移到接触处' : '移动'}。`,
          };
          const hint = node.first ?? action;
          const nextScore = score(offsets);
          if (nextScore < EPSILON) {
            if (!reverseTarget) return hint;
            // Reaching the target is a tolerance comparison, not equality of
            // rounded cache keys: e.g. -0.7 * EPSILON and 0 are the same seated
            // coordinate but fall into different rounding buckets. Keep the
            // first reverse step directly and prove it from the actual pose.
            const reverseTargetOffset = node.offsets[action.pieceId]![axisIndex(action.axis)];
            const live = sweepMove(
              level,
              reverseTarget,
              action.pieceIds,
              reverseTargetOffset,
              action.axis,
              state.orientations,
            );
            if (
              Math.abs(live.actualOffset - reverseTargetOffset) > EPSILON ||
              Math.abs(
                live.actualOffset - reverseTarget[action.pieceId]![axisIndex(action.axis)],
              ) <= EPSILON
            )
              continue;
            const firstReverse = plannedHint(
              level,
              { ...state, offsets: reverseTarget },
              action.pieceIds,
              action.axis,
              live.actualOffset,
            );
            let cursor: SearchNode = {
              offsets,
              first: hint,
              parent: node,
              action,
              depth: node.depth + 1,
              priority: 0,
            };
            let cache = routeCache.get(level);
            if (!cache) {
              cache = new Map();
              routeCache.set(level, cache);
            }
            if (cache.size > 2000) cache.clear();
            while (cursor.parent && cursor.action) {
              const before = { ...state, offsets: cursor.offsets, phase: 'reassemble' as const };
              const move = cursor.action;
              const reverse = plannedHint(
                level,
                before,
                move.pieceIds,
                move.axis,
                cursor.parent.offsets[move.pieceId]![axisIndex(move.axis)],
              );
              cache.set(exactKey(level, before), reverse);
              cursor = cursor.parent;
            }
            cache.set(exactKey(level, { ...state, offsets: reverseTarget }), firstReverse);
            return firstReverse;
          }
          if (
            !node.first &&
            nextScore < initialScore - EPSILON &&
            (!fallback || nextScore < fallback.score)
          )
            fallback = { hint, score: nextScore };
          frontier.push({
            offsets,
            first: hint,
            parent: node,
            action,
            depth: node.depth + 1,
            priority: nextScore + (node.depth + 1) * 0.12 + ids.length * 0.001,
          });
        }
      }
    }
  }
  return reverseTarget ? null : (fallback?.hint ?? null);
}

const routeCache = new WeakMap<Level, Map<string, Hint>>();
const exactKey = (level: Level, state: GameState): string =>
  `${state.phase}:${level.pieces
    .flatMap((piece) => [
      ...state.offsets[piece.id]!.map((value) => Math.round(value / EPSILON)),
      ...(state.orientations[piece.id] ?? IDENTITY_ORIENTATION),
    ])
    .join(',')}`;

/** Include the exact live pose and action counters so an ad callback cannot
 * apply a recommendation calculated before a drag, mode change, undo or reset. */
export const hintStateKey = (level: Level, state: GameState): string =>
  JSON.stringify([
    level.id,
    state.phase,
    state.moves,
    state.history.length,
    state.future.length,
    ...level.pieces.flatMap((piece) => [
      state.offsets[piece.id],
      state.orientations[piece.id] ?? IDENTITY_ORIENTATION,
    ]),
  ]);

/** Execute one recommendation as one undoable action. A blocked or stale
 * recommendation is rejected atomically instead of silently making half a move. */
export function applyHint(level: Level, state: GameState, hint: Hint): GameState {
  if (
    state.levelId !== level.id ||
    (hint.stateKey !== undefined && hint.stateKey !== hintStateKey(level, state)) ||
    !axes.includes(hint.axis) ||
    ![-1, 1].includes(hint.direction) ||
    !hint.pieceIds.length ||
    hint.pieceId !== hint.pieceIds[0] ||
    new Set(hint.pieceIds).size !== hint.pieceIds.length ||
    hint.pieceIds.some((id) => !level.pieces.some((piece) => piece.id === id))
  )
    return state;
  if (hint.kind === 'rotate') {
    const degrees = hint.rotationDegrees ?? 90;
    if (!Number.isFinite(degrees) || degrees <= 0 || degrees > 180) return state;
    const result = tryRotate(level, state, hint.pieceIds, hint.axis, hint.direction, degrees);
    return result.blocked ? state : result.state;
  }
  if (hint.kind !== undefined && hint.kind !== 'move') return state;
  if (!Number.isFinite(hint.targetOffset)) return state;
  const start = state.offsets[hint.pieceId]![axisIndex(hint.axis)];
  if ((hint.targetOffset - start) * hint.direction <= EPSILON) return state;
  const result = tryMove(level, state, hint.pieceIds, hint.targetOffset, hint.axis);
  return Math.abs(result.actualOffset - hint.targetOffset) <= EPSILON ? result.state : state;
}

function plannedHint(
  level: Level,
  state: GameState,
  pieceIds: string[],
  axis: Axis,
  targetOffset: number,
): Hint {
  const index = axisIndex(axis);
  const direction = targetOffset > state.offsets[pieceIds[0]!]![index] ? 1 : -1;
  const labels = pieceIds
    .map((id) => String.fromCharCode(65 + level.pieces.findIndex((piece) => piece.id === id)))
    .join('、');
  return {
    pieceId: pieceIds[0]!,
    pieceIds,
    axis,
    targetOffset,
    direction,
    message: `选择${labels}${pieceIds.length > 1 ? '组成一组' : ''}，沿${axis.toUpperCase()}轴${direction > 0 ? '正向' : '负向'}移动，${Math.abs(targetOffset) < EPSILON ? '将这一方向归位' : '留出移动空间'}。`,
  };
}

function rotationHint(
  level: Level,
  pieceId: string,
  axis: Axis,
  direction: -1 | 1,
  degrees: number,
): Hint {
  const label = String.fromCharCode(65 + level.pieces.findIndex((piece) => piece.id === pieceId));
  return {
    kind: 'rotate',
    pieceId,
    pieceIds: [pieceId],
    axis,
    direction,
    rotationDegrees: degrees,
    targetOffset: 0,
    message: `选择${label}，绕${axis.toUpperCase()}轴${direction > 0 ? '正向' : '负向'}旋转${Number(degrees.toFixed(2))}°，调整回原来的朝向。`,
  };
}

/** Restore arbitrary orientations with at most three world-axis rotations.
 * The Z/Y/X Euler decomposition is used only after every swept step has been
 * proved legal. A blocked route is retried with room supplied by the parking
 * planner. Quarter-turn poses retain the shorter bounded cube search below. */
function orientationRoute(level: Level, initial: GameState, pieceId: string): Hint[] | null {
  const orientation = initial.orientations[pieceId] ?? IDENTITY_ORIENTATION;
  if (isIdentityOrientation(orientation)) return [];
  const single = relativeAxisRotation(orientation, IDENTITY_ORIENTATION);
  if (single) {
    const hint = rotationHint(level, pieceId, single.axis, single.direction, single.degrees);
    if (applyHint(level, initial, hint) !== initial) return [hint];
  }
  // A quarter-turn graph has just 24 unique orientations. Never apply this
  // graph to arbitrary-angle matrices, whose floating-point keys can proliferate.
  if (isCubeOrientation(orientation)) {
    const queue: { state: GameState; hints: Hint[] }[] = [{ state: initial, hints: [] }];
    const orientationKey = (value: readonly number[]) => value.map(Math.round).join(',');
    const visited = new Set([orientationKey(orientation)]);
    for (let cursor = 0; cursor < queue.length && cursor < 24; cursor++) {
      const node = queue[cursor]!;
      for (const axis of axes)
        for (const direction of [1, -1] as const) {
          const hint = rotationHint(level, pieceId, axis, direction, 90);
          const next = applyHint(level, node.state, hint);
          if (next === node.state) continue;
          const key = orientationKey(next.orientations[pieceId]!);
          if (visited.has(key)) continue;
          visited.add(key);
          const hints = [...node.hints, hint];
          if (isIdentityOrientation(next.orientations[pieceId])) return hints;
          queue.push({ state: next, hints });
        }
    }
    return null;
  }
  const y = Math.asin(Math.max(-1, Math.min(1, -orientation[6])));
  const nearGimbalLock = Math.abs(Math.cos(y)) < 1e-8;
  const x = nearGimbalLock
    ? Math.atan2(-orientation[5], orientation[4])
    : Math.atan2(orientation[7], orientation[8]);
  const z = nearGimbalLock ? 0 : Math.atan2(orientation[3], orientation[0]);
  const steps: [Axis, number][] = [
    ['z', -z],
    ['y', -y],
    ['x', -x],
  ];
  let state = initial;
  const hints: Hint[] = [];
  for (const [axis, angle] of steps) {
    if (Math.abs(angle) < 1e-9) continue;
    const hint = rotationHint(
      level,
      pieceId,
      axis,
      angle > 0 ? 1 : -1,
      (Math.abs(angle) * 180) / Math.PI,
    );
    const next = applyHint(level, state, hint);
    if (next === state) return null;
    state = next;
    hints.push(hint);
  }
  return isIdentityOrientation(state.orientations[pieceId]) ? hints : null;
}

/** Saved history is merely a candidate route: infer each inverse rigid action,
 * prove it with today's collision solver, and compare every resulting pose.
 * This recovers compound rotations without assuming a trusted solution script. */
function planHistoryReassembly(level: Level, initial: GameState): Hint | null {
  let state = initial;
  const route: { state: GameState; hint: Hint }[] = [];
  const samePose = (a: GameState, b: Snapshot): boolean =>
    level.pieces.every(
      (piece) =>
        a.offsets[piece.id]!.every(
          (value, i) => Math.abs(value - b.offsets[piece.id]![i]!) <= EPSILON,
        ) && orientationsEqual(a.orientations[piece.id], b.orientations[piece.id]),
    );
  for (const previous of initial.history.slice(-512).reverse()) {
    if (samePose(state, previous)) continue;
    // A short genuine reversal is useful guidance. Replaying hundreds of
    // exploratory drags is not: let the geometric planner find a direct route.
    if (route.length >= Math.max(12, level.pieces.length * 4)) return null;
    const ids = level.pieces
      .filter(
        (piece) =>
          state.offsets[piece.id]!.some(
            (value, i) => Math.abs(value - previous.offsets[piece.id]![i]!) > EPSILON,
          ) || !orientationsEqual(state.orientations[piece.id], previous.orientations[piece.id]),
      )
      .map((piece) => piece.id);
    if (!ids.length) continue;
    let hint: Hint | null = null;
    const leader = ids[0]!;
    if (ids.every((id) => orientationsEqual(state.orientations[id], previous.orientations[id]))) {
      const changedAxes = axes.filter((axis) =>
        ids.some(
          (id) =>
            Math.abs(previous.offsets[id]![axisIndex(axis)] - state.offsets[id]![axisIndex(axis)]) >
            EPSILON,
        ),
      );
      if (changedAxes.length !== 1) return null;
      hint = plannedHint(
        level,
        state,
        ids,
        changedAxes[0]!,
        previous.offsets[leader]![axisIndex(changedAxes[0]!)],
      );
    } else {
      const rotation = relativeAxisRotation(
        state.orientations[leader]!,
        previous.orientations[leader]!,
      );
      if (!rotation) return null;
      hint = {
        ...rotationHint(level, leader, rotation.axis, rotation.direction, rotation.degrees),
        pieceIds: ids,
      };
    }
    const next = applyHint(level, state, hint);
    if (next === state || !samePose(next, previous)) return null;
    route.push({ state, hint });
    state = next;
    if (getProgress(level, state).assembled === level.pieces.length) {
      let cache = routeCache.get(level);
      if (!cache) {
        cache = new Map();
        routeCache.set(level, cache);
      }
      if (cache.size > 2000) cache.clear();
      for (const step of route) cache.set(exactKey(level, step.state), step.hint);
      return route[0]?.hint ?? null;
    }
  }
  return null;
}

/** A constructive fallback for unusual reassembly poses: separate the current
 * geometry, park the pieces in open space, route to a freshly solved separated
 * arrangement, then reverse its legal extraction sweeps. The parking paths use
 * conservative enclosing boxes, so no detour can pass through a fork or tooth.
 * Cache poses at collision precision so harmless touch-drag roundoff does not
 * discard a valid route. Every cached action still receives a fresh sweep check.
 */
function planReassembly(level: Level, initial: GameState): Hint | null {
  const route: { state: GameState; hint: Hint }[] = [];
  let state = initial;
  const append = (candidate: Hint): boolean => {
    // Planning changes phase and temporary poses; only public live hints may
    // carry an execution fingerprint. Cached actions are revalidated on read.
    const hint = { ...candidate, stateKey: undefined };
    if (hint.kind === 'rotate') {
      const rotated = tryRotate(
        level,
        state,
        hint.pieceIds,
        hint.axis,
        hint.direction,
        hint.rotationDegrees,
      );
      if (rotated.blocked) return false;
      route.push({ state, hint });
      state = rotated.state;
      return true;
    }
    const index = axisIndex(hint.axis);
    const result = sweepMove(
      level,
      state.offsets,
      hint.pieceIds,
      hint.targetOffset,
      hint.axis,
      state.orientations,
    );
    if (Math.abs(result.actualOffset - hint.targetOffset) > EPSILON) return false;
    const delta = result.actualOffset - state.offsets[hint.pieceId]![index];
    if (Math.abs(delta) < EPSILON) return true;
    const offsets = { ...state.offsets };
    for (const id of hint.pieceIds)
      offsets[id] = offsets[id]!.map(
        (value, i) => value + (i === index ? delta : 0),
      ) as unknown as Vec3;
    route.push({ state, hint });
    state = { ...state, offsets };
    return true;
  };
  const separate = (): boolean => {
    for (let i = 0; i < level.pieces.length * 5; i++) {
      const separating = { ...state, phase: 'disassemble' as const };
      if (getProgress(level, separating).complete) return true;
      const hint = getHint(level, separating);
      if (!hint || !append(hint)) return false;
    }
    return false;
  };
  // Derive a reversible assembly sequence using exactly the same physical
  // solver used for live hints. No per-level solution or preferred order.
  state = createGame(level);
  if (!separate()) return null;
  const canonical = state.offsets;
  const reverse = route
    .map(({ state: before, hint }) => ({
      ...hint,
      targetOffset: before.offsets[hint.pieceId]![axisIndex(hint.axis)],
    }))
    .reverse();
  route.length = 0;
  state = initial;
  if (!separate()) return null;
  const currentBounds = level.pieces.map((piece) =>
    pieceBounds(piece, state.offsets[piece.id]!, state.orientations[piece.id]),
  );
  const originalBounds = level.pieces.map((piece) => pieceBounds(piece, [0, 0, 0]));
  const canonicalBounds = level.pieces.map((piece) => pieceBounds(piece, canonical[piece.id]!));
  const spacing =
    Math.ceil(
      (Math.max(
        ...originalBounds.map((box) =>
          Math.hypot(...box.max.map((value, i) => value - box.min[i]!)),
        ),
      ) +
        4) *
        2,
    ) / 2;
  const outside =
    Math.ceil(
      (Math.max(
        ...[...currentBounds, ...originalBounds, ...canonicalBounds].flatMap((box) =>
          [...box.min, ...box.max].map(Math.abs),
        ),
      ) +
        spacing * 2) *
        2,
    ) / 2;
  const routeTo = (pieceId: string, target: Vec3): boolean => {
    const steps = routePiece(level, state.offsets, pieceId, target, state.orientations);
    if (!steps) return false;
    for (const step of steps)
      if (!append(plannedHint(level, state, [pieceId], step.axis, step.targetOffset))) return false;
    return true;
  };
  for (let i = 0; i < level.pieces.length; i++)
    if (!routeTo(level.pieces[i]!.id, [outside + i * spacing, outside, outside])) return null;
  for (const piece of level.pieces) {
    const rotations = orientationRoute(level, state, piece.id);
    if (!rotations) return null;
    for (const hint of rotations) if (!append(hint)) return null;
  }
  for (const piece of level.pieces) if (!routeTo(piece.id, canonical[piece.id]!)) return null;
  for (const step of reverse)
    if (!append(plannedHint(level, state, step.pieceIds, step.axis, step.targetOffset)))
      return null;
  if (!getProgress(level, { ...state, phase: 'reassemble' }).complete) return null;
  let cache = routeCache.get(level);
  if (!cache) {
    cache = new Map();
    routeCache.set(level, cache);
  }
  if (cache.size > 2000) cache.clear();
  for (const step of route) cache.set(exactKey(level, step.state), step.hint);
  return route[0]?.hint ?? null;
}

function genericHint(level: Level, state: GameState): Hint | null {
  const progress = getProgress(level, state);
  // The untouched assembly needs no restoration hint, even though switching
  // modes alone deliberately does not award a completion.
  if (progress.complete || (state.phase === 'reassemble' && progress.assembled === progress.total))
    return null;
  const cached = routeCache.get(level)?.get(exactKey(level, state));
  if (cached) {
    if (cached.kind === 'rotate') {
      if (
        !tryRotate(
          level,
          state,
          cached.pieceIds,
          cached.axis,
          cached.direction,
          cached.rotationDegrees,
        ).blocked
      )
        return cached;
    } else {
      const check = sweepMove(
        level,
        state.offsets,
        cached.pieceIds,
        cached.targetOffset,
        cached.axis,
        state.orientations,
      );
      if (Math.abs(check.actualOffset - cached.targetOffset) < EPSILON) return cached;
    }
  }
  if (state.phase === 'reassemble') {
    const history = planHistoryReassembly(level, state);
    if (history) return history;
  }
  if (
    state.phase === 'reassemble' &&
    level.pieces.some((piece) => !isIdentityOrientation(state.orientations[piece.id]))
  ) {
    for (const piece of level.pieces) {
      const rotations = orientationRoute(level, state, piece.id);
      if (rotations?.length) return rotations[0]!;
    }
    // Returning translations to zero while a piece still has another
    // orientation does not restore the puzzle. Make room and turn it first.
    return planHistoryReassembly(level, state) ?? planReassembly(level, state);
  }
  // Searching from the seated assembly preserves temporary contact stops even
  // after their frames have moved away. Reverse the discovered group sweeps to
  // obtain a short, collision-checked route from the player's exact 3D pose.
  if (state.phase === 'reassemble') {
    const reverse = directHint(level, { ...createGame(level), phase: 'reassemble' }, state.offsets);
    if (reverse) return reverse;
  }
  const direct = directHint(level, state);
  return (
    direct ??
    (state.phase === 'reassemble'
      ? (planHistoryReassembly(level, state) ?? planReassembly(level, state))
      : null)
  );
}

/** Level-specific explanations and unlock rules precede the generic solver;
 * every candidate is validated against the exact live state before being shown. */
export function getHint(level: Level, state: GameState): Hint | null {
  const progress = getProgress(level, state);
  if (progress.complete || (state.phase === 'reassemble' && progress.assembled === progress.total))
    return null;
  // A proved route already accounts for its intermediate detours. Preserve it
  // while the exact pose still matches; a local level rule must not undo its
  // previous step and send the player around a cycle.
  const cached = routeCache.get(level)?.get(exactKey(level, state));
  if (cached && applyHint(level, state, cached) !== state)
    return { ...cached, stateKey: hintStateKey(level, state) };
  for (const candidate of levelHintCandidates(level, state)) {
    if (applyHint(level, state, candidate) !== state)
      return { ...candidate, stateKey: hintStateKey(level, state) };
  }
  const candidate = genericHint(level, state);
  return candidate && applyHint(level, state, candidate) !== state
    ? { ...candidate, stateKey: hintStateKey(level, state) }
    : null;
}
