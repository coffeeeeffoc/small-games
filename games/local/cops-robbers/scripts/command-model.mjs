import assert from 'node:assert/strict';

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
}

export function equalSnapshot(actual, expected, property) {
  try { assert.deepEqual(actual, expected, property); }
  catch (error) { error.signature = `assertion:${property}`; throw error; }
}

// This model remembers observations, not a second implementation of the game rules.
export function snapshotModel(initial) {
  const start = structuredClone(initial), history = [];
  return {
    get depth() { return history.length; },
    moved(before) { history.push(structuredClone(before)); },
    hint(before, after) { equalSnapshot(after, before, 'hint-preserves-board'); },
    undo(after) {
      assert.ok(history.length, 'model undo requires an earlier move');
      equalSnapshot(after, history.at(-1), 'undo-restores-previous-board');
      history.pop();
    },
    restart(after) {
      equalSnapshot(after, start, 'restart-restores-initial-board');
      history.length = 0;
    },
  };
}

// Deletion shrinking keeps concrete commands. Invalid preconditions, timeouts and
// other failures never count as reproductions of the original property failure.
export async function minimizeCommands(commands, replay, {
  signature, maxAttempts = 16, maxMs = 30000, onAccept = async () => {},
} = {}) {
  assert.ok(typeof signature === 'string' && signature.startsWith('assertion:'));
  let best = structuredClone(commands), chunks = 2, attempts = 0;
  const started = Date.now(), attemptsLog = [];
  while (best.length > 0 && attempts < maxAttempts && Date.now() - started < maxMs) {
    const size = Math.ceil(best.length / chunks);
    let reduced = false;
    for (let offset = 0; offset < best.length; offset += size) {
      if (attempts >= maxAttempts || Date.now() - started >= maxMs) break;
      const candidate = [...best.slice(0, offset), ...best.slice(offset + size)];
      const result = await replay(candidate, started + maxMs);
      attempts++;
      const accepted = result.status === 'failed' && result.signature === signature;
      attemptsLog.push({ length: candidate.length, status: result.status, signature: result.signature, accepted });
      if (accepted) {
        best = candidate;
        await onAccept(structuredClone(best), result);
        chunks = Math.max(2, chunks - 1); reduced = true; break;
      }
    }
    if (!reduced) {
      if (chunks >= best.length) break;
      chunks = Math.min(best.length, chunks * 2);
    }
  }
  return { commands: best, attempts, attemptsLog, elapsedMs: Date.now() - started,
    budgetExhausted: attempts >= maxAttempts || Date.now() - started >= maxMs };
}
