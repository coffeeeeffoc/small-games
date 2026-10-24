import { SHAPES, shapeWeight } from './shapes.mjs';
import { sha256 } from './random.mjs';
import { hasPlacement } from './engine.mjs';

export function canResetOptions(state, online = false) {
  return (
    !!state &&
    state.status === 'playing' &&
    !online &&
    !state.ranked &&
    !state.challenge &&
    !state.waitingNextGroup &&
    state.used.length < 3
  );
}

/** Reward randomness never advances the normal stock or ranked random stream. */
export function resetOptions(state, rewardId) {
  if (
    !canResetOptions(state) ||
    typeof rewardId !== 'string' ||
    !rewardId ||
    state.resetRewardIds?.includes(rewardId)
  )
    return state;
  const next = JSON.parse(JSON.stringify(state));
  next.resetRewardIds = [...(state.resetRewardIds || []), rewardId];
  next.candidates = state.candidates.map((candidate, slot) => {
    if (state.used.includes(slot)) return JSON.parse(JSON.stringify(candidate));
    const stars = candidate.stars?.length || 0;
    const pool = SHAPES.filter(
      (shape) => shape.id !== candidate.shapeId && shape.size >= stars,
    );
    let ticket =
      (parseInt(sha256(`${rewardId}/${slot}/${next.resetRewardIds.length}`).slice(0, 8), 16) /
        4294967296) *
      pool.reduce((sum, shape) => sum + shapeWeight(shape, state.group), 0);
    const shape =
      pool.find((shape) => (ticket -= shapeWeight(shape, state.group)) < 0) || pool.at(-1);
    return {
      shapeId: shape.id,
      color: candidate.color,
      ...(stars ? { stars: shape.cells.slice(0, stars).map((cell) => [...cell]) } : {}),
    };
  });
  if (!hasPlacement(next)) {
    for (let slot = 0; slot < 3 && !hasPlacement(next); slot++) {
      if (next.used.includes(slot)) continue;
      const stars = state.candidates[slot].stars?.length || 0;
      for (const shape of [...SHAPES].sort((a, b) => a.size - b.size)) {
        if (shape.size < stars) continue;
        const candidate = {
          shapeId: shape.id,
          color: state.candidates[slot].color,
          ...(stars ? { stars: shape.cells.slice(0, stars).map((cell) => [...cell]) } : {}),
        };
        const trial = {
          ...next,
          candidates: next.candidates.map((value, i) => (i === slot ? candidate : value)),
        };
        if (hasPlacement(trial, slot)) {
          next.candidates = trial.candidates;
          break;
        }
      }
    }
    if (!hasPlacement(next)) return state;
  }
  // An undo from before the reward must not restore spent reward IDs or old options.
  delete next._undo;
  next.canUndo = false;
  return next;
}

/** One request owns one unchanged position. Navigation invalidates its completion. */
export function createRewardGate({ getState, eligible, getPort, grant, changed = () => {} }) {
  let generation = 0,
    pending = false,
    activePort;
  return {
    get pending() {
      return pending;
    },
    cancel() {
      generation++;
      pending = false;
      try {
        activePort?.cancel?.();
      } catch {
        /* Completion is invalidated even if SDK cleanup fails. */
      }
      activePort = undefined;
      changed();
    },
    async request(kind) {
      if (pending || !eligible(kind)) return { status: 'unavailable' };
      const port = getPort();
      if (!port || port.available === false || typeof port.offer !== 'function')
        return { status: 'unavailable' };
      const original = getState(),
        token = ++generation;
      const id = `three-choose-two:${kind}:${Date.now()}:${token}`;
      pending = true;
      activePort = port;
      changed();
      try {
        const result = await port.offer({ id, reward: { kind } });
        if (token !== generation || getState() !== original || !eligible(kind))
          return { status: 'dismissed' };
        if (result?.status === 'completed') grant(kind, id);
        return ['completed', 'dismissed', 'failed', 'unavailable'].includes(result?.status)
          ? result
          : { status: 'failed' };
      } catch {
        return { status: 'failed' };
      } finally {
        if (token === generation) {
          pending = false;
          activePort = undefined;
          changed();
        }
      }
    },
  };
}
