export const REVIVE_LIMIT = 2;

export function adPolicy(port) {
  // Missing/off providers preserve the original free inversion. Runtime failures do not.
  return { invertNeedsAd: port?.available === true, showRevive: port?.available === true };
}

export function readRevives(save) {
  if (save?.revivesUsed === undefined) return save?.rescueUsed === true ? 1 : 0;
  if (
    !Number.isInteger(save.revivesUsed) ||
    save.revivesUsed < 0 ||
    save.revivesUsed > REVIVE_LIMIT
  )
    throw Error('Invalid saved revive count.');
  return save.revivesUsed;
}

/** One controller belongs to one run. Visibility does not invalidate an ad. */
export function createRewardController(game, offer, used = 0) {
  readRevives({ revivesUsed: used });
  let count = used,
    generation = 0,
    pending = false,
    disposed = false;
  return {
    get pending() {
      return pending;
    },
    get used() {
      return count;
    },
    cancel() {
      generation++;
      pending = false;
    },
    dispose() {
      this.cancel();
      disposed = true;
    },
    async request(kind) {
      if (disposed || pending) return { status: 'dismissed', applied: false };
      if (kind !== 'invert' && kind !== 'revive') return { status: 'failed', applied: false };
      const eligible = () =>
        kind === 'revive'
          ? count < REVIVE_LIMIT && ['danger', 'over'].includes(game.status) && !!game.pending
          : game.status === 'playing';
      if (!eligible()) return { status: 'unavailable', applied: false };
      const token = ++generation;
      const before = JSON.stringify(game.getSnapshot());
      pending = true;
      let result;
      try {
        result = await offer(kind);
      } catch {
        result = { status: 'failed' };
      }
      if (disposed || token !== generation) return { status: 'dismissed', applied: false };
      pending = false;
      const status = ['completed', 'dismissed', 'unavailable', 'failed'].includes(result?.status)
        ? result.status
        : 'failed';
      if (status !== 'completed' || !eligible() || before !== JSON.stringify(game.getSnapshot()))
        return { status, applied: false };
      const applied = kind === 'revive' ? game.revive() : game.flipContainer('invert');
      if (applied && kind === 'revive') count++;
      return { status, applied };
    },
  };
}
