const statuses = new Set(['completed', 'dismissed', 'unavailable', 'failed']);

/** Game-owned RewardOpportunity port. No DOM, channel SDK, placement ID or reward mutation. */
export function createGameAds({ getProvider, onPendingChange = () => {}, timeoutMs = 45000 }) {
  let active, pending = false, disposed = false;
  return {
    get pending() { return pending; },
    async offer(opportunity) {
      if (disposed || active || pending) return { status: 'unavailable' };
      if (!opportunity?.id || typeof opportunity.id !== 'string') return { status: 'failed' };
      let provider, timer;
      try {
        provider = getProvider();
        if (!provider?.show) return { status: 'unavailable' };
        const interrupted = new Promise(resolve => {
          active = () => resolve({ status: 'dismissed' });
          timer = setTimeout(() => resolve({ status: 'failed' }), timeoutMs);
        });
        pending = true; onPendingChange();
        const shown = Promise.resolve().then(() => provider.show({ opportunityId: opportunity.id, kind: 'rewarded' }))
          .finally(() => { pending = false; onPendingChange(); });
        const result = await Promise.race([shown, interrupted]);
        return { status: statuses.has(result?.status) ? result.status : 'failed' };
      } catch { return { status: 'failed' }; }
      finally {
        clearTimeout(timer); active = undefined;
        if (pending) { try { provider?.dispose?.(); } catch { /* An optional provider cannot trap play. */ } }
      }
    },
    cancel() { active?.(); },
    dispose() { disposed = true; active?.(); },
  };
}
