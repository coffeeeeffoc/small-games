/** Game-owned eligibility; the public port alone owns SDK visibility and close callbacks. */
export function rewardEligible(run, kind) {
  if (!run || !['supply', 'revive'].includes(kind) || run.rewardUsed[kind]) return false;
  return kind === 'supply'
    ? run.phase === 'playing' && run.player.hp > 0 && run.player.hp < run.player.maxHp
    : run.phase === 'lost' && run.player.hp === 0;
}

export function createRewards({ current, port, locked = (_value) => {} }) {
  let generation = 0,
    pending = false;
  return {
    get pending() {
      return pending;
    },
    cancel() {
      generation++;
      pending = false;
      port()?.cancel?.();
      locked(false);
    },
    async offer(kind) {
      const run = current(),
        ads = port();
      if (pending || !ads?.available || !rewardEligible(run, kind)) return 'unavailable';
      const token = ++generation,
        epoch = run.roomEpoch;
      pending = true;
      locked(true);
      try {
        const result = await ads.offer({ id: `ashfall-${kind}-${token}`, placement: kind });
        if (token !== generation || run !== current() || run.roomEpoch !== epoch) return 'expired';
        if (result?.status !== 'completed') return result?.status || 'failed';
        if (!rewardEligible(run, kind)) return 'expired';
        run.rewardUsed[kind] = true;
        run.assisted = true;
        if (kind === 'revive') {
          run.phase = 'playing';
          run.player.hp = run.player.maxHp * 0.5;
          run.player.invulnerable = 2;
          run.bullets = [];
        } else run.player.hp = Math.min(run.player.maxHp, run.player.hp + run.player.maxHp * 0.4);
        return 'completed';
      } catch {
        return 'failed';
      } finally {
        if (token === generation) {
          pending = false;
          locked(false);
        }
      }
    },
  };
}
