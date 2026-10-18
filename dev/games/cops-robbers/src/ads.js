const statuses = new Set(['completed', 'dismissed', 'unavailable', 'failed']);

/** Game-owned RewardOpportunity port. No DOM, channel SDK, placement ID or reward mutation. */
export function createGameAds({ getProvider, onPendingChange = () => {}, timeoutMs = 45000 }) {
  let active, resume, hidden = false, pending = false, disposed = false;
  return {
    get pending() { return pending; },
    setHidden(value) { hidden = value; if (!hidden) resume?.(); },
    async offer(opportunity) {
      if (disposed || active || pending) return { status: 'unavailable' };
      if (!opportunity?.id || typeof opportunity.id !== 'string') return { status: 'failed' };
      let provider, timer, cancel, cancelled = false;
      try {
        provider = getProvider();
        if (!provider?.show) return { status: 'unavailable' };
        const interrupted = new Promise(resolve => {
          active = cancel = () => { cancelled = true; resolve({ status: 'dismissed' }); resume?.(); };
          timer = setTimeout(() => resolve({ status: 'failed' }), timeoutMs);
        });
        pending = true; onPendingChange();
        const shown = Promise.resolve().then(() => cancelled ? { status: 'dismissed' } : provider.show({
          opportunityId: opportunity.id, kind: 'rewarded',
          onShown() { if (active === cancel && !cancelled) clearTimeout(timer); },
        }))
          .finally(() => { pending = false; onPendingChange(); });
        const result = await Promise.race([shown, interrupted]).catch(() => ({ status: 'failed' })).finally(() => {
          clearTimeout(timer);
          if (pending) { try { provider?.dispose?.(); } catch { /* An optional provider cannot trap play. */ } }
        });
        // A fullscreen ad may hide the game before its completed callback arrives.
        while (hidden && !cancelled) await new Promise(resolve => { resume = resolve; });
        return { status: cancelled ? 'dismissed' : statuses.has(result?.status) ? result.status : 'failed' };
      } catch { return { status: 'failed' }; }
      finally {
        clearTimeout(timer); active = undefined; resume = undefined;
      }
    },
    cancel() { active?.(); },
    dispose() { disposed = true; active?.(); },
  };
}
