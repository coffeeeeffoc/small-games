import { chooseUpgrade, grantSupply } from './core.mjs';

/** Game-owned eligibility; the public port alone owns SDK visibility and close callbacks. */
export function rewardEligible(run, kind) {
  if (!run) return false;
  if (kind === 'overdrive') return run.phase === 'upgrade' && run.choices.includes('overdrive');
  if (!['supply', 'revive'].includes(kind) || run.rewardUsed[kind]) return false;
  return kind === 'supply'
    ? run.phase === 'playing' && run.player.hp > 0 && !run.supplyUsed
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
        epoch = run.roomEpoch,
        rank = run.rank,
        choices = run.choices;
      pending = true;
      locked(true);
      try {
        const result = await ads.offer({ id: `ashfall-${kind}-${token}`, placement: kind });
        if (token !== generation || run !== current() || run.roomEpoch !== epoch) return 'expired';
        if (result?.status !== 'completed') return result?.status || 'failed';
        if (
          !rewardEligible(run, kind) ||
          (kind === 'overdrive' && (run.rank !== rank || run.choices !== choices))
        )
          return 'expired';
        if (kind === 'overdrive') {
          if (!chooseUpgrade(run, kind, { rewarded: true })) return 'expired';
          run.assisted = true;
          return 'completed';
        }
        run.rewardUsed[kind] = true;
        run.assisted = true;
        if (kind === 'revive') {
          run.phase = 'playing';
          run.player.hp = run.player.maxHp * 0.5;
          run.player.invulnerable = 2;
          run.bullets = [];
        } else if (!grantSupply(run)) return 'expired';
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
