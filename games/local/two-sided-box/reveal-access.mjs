/**
 * Observation access is free by default. A future rewarded-ad integration can
 * inject an async provider(request, { signal }) that returns { granted: true }
 * only after its own completion check. It must not modify the game state.
 *
 * The caller applies a grant to the current level and should also check its own
 * level generation before revealing anything. Invalidate when leaving a level.
 */
export function createRevealAccess({ provider = async () => ({ granted: true }) } = {}) {
  if (typeof provider !== 'function') throw new TypeError('Reveal provider must be a function.');

  let active = null;

  function invalidate() {
    if (!active) return false;
    const request = active;
    active = null;
    request.cancel({ granted: false, reason: 'cancelled' });
    request.controller.abort();
    return true;
  }

  async function request(details) {
    if (
      !details ||
      !['face', 'structure'].includes(details.kind) ||
      typeof details.levelId !== 'string' ||
      !details.levelId
    ) {
      return { granted: false, reason: 'invalid-request' };
    }
    if (active) return { granted: false, reason: 'busy' };

    const token = { controller: new AbortController(), cancel: null };
    const cancelled = new Promise((resolve) => {
      token.cancel = resolve;
    });
    active = token;
    const payload = { kind: details.kind, levelId: details.levelId };
    if (details.face !== undefined) payload.face = details.face;

    // Attach rejection handling before awaiting, including when a provider
    // continues working after cancellation because it does not support abort.
    const provided = Promise.resolve()
      .then(() => {
        if (active !== token) return { granted: false, reason: 'cancelled' };
        return provider(payload, { signal: token.controller.signal });
      })
      .then((result) => {
        if (result?.granted === true) return { granted: true };
        return {
          granted: false,
          reason: typeof result?.reason === 'string' ? result.reason : 'denied',
        };
      })
      .catch(() => ({ granted: false, reason: 'provider-error' }));

    const result = await Promise.race([provided, cancelled]);
    if (active !== token) return { granted: false, reason: 'cancelled' };
    active = null;
    return result;
  }

  return {
    request,
    invalidate,
    cancel: invalidate,
    get pending() {
      return active !== null;
    },
  };
}
