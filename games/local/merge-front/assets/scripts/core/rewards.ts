import type { Match } from './engine.ts';
import { DRAW_COST } from './engine.ts';

export type RewardStatus = 'completed' | 'dismissed' | 'unavailable' | 'failed';
export interface RewardResult {
  status: RewardStatus;
}
export interface RewardRequest {
  placement: 'income-boost';
  matchId: string;
}
export type RewardOffer = (request: RewardRequest) => RewardResult | Promise<RewardResult>;
export interface RewardController {
  request(): Promise<RewardResult>;
  cancel(): void;
  dispose(): void;
}

const pending = new WeakMap<Match, object>();
export function createRewardController(match: Match, offer?: RewardOffer): RewardController {
  let disposed = false;
  let cancel: (() => void) | undefined;
  return {
    request(): Promise<RewardResult> {
      if (
        disposed ||
        !offer ||
        pending.has(match) ||
        match.phase !== 'running' ||
        match.sides[0].boostUsed
      )
        return Promise.resolve({ status: 'unavailable' });
      const token = {};
      pending.set(match, token);
      return new Promise<RewardResult>((resolve) => {
        let finished = false;
        const finish = (status: RewardStatus): void => {
          if (finished) return;
          finished = true;
          cancel = undefined;
          if (disposed || match.phase !== 'running') status = 'dismissed';
          if (status === 'completed') {
            if (match.sides[0].boostUsed) status = 'unavailable';
            else {
              match.sides[0].boostUsed = true;
              match.sides[0].coins += DRAW_COST;
              match.assisted = true;
            }
          }
          resolve({ status });
        };
        cancel = () => finish('dismissed');
        const release = (): void => {
          if (pending.get(match) === token) pending.delete(match);
        };
        try {
          Promise.resolve(offer({ placement: 'income-boost', matchId: match.id })).then(
            (result) => {
              try {
                const status =
                  result &&
                  ['completed', 'dismissed', 'unavailable', 'failed'].includes(result.status)
                    ? result.status
                    : 'failed';
                finish(status);
              } catch {
                finish('failed');
              } finally {
                release();
              }
            },
            () => {
              finish('failed');
              release();
            },
          );
        } catch {
          finish('failed');
          release();
        }
        // Keep the match locked until the provider settles, even after local cancellation.
      });
    },
    cancel(): void {
      cancel?.();
    },
    dispose(): void {
      disposed = true;
      cancel?.();
    },
  };
}
