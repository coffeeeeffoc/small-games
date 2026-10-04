import type { Phase } from './types.ts';

export interface HintAccessRequest {
  levelId: string;
  phase: Phase;
  action: 'move' | 'rotate';
}

/** A Reward Opportunity compatible with the platform Game Host contract. */
export interface HintRewardOpportunity {
  readonly id: string;
  readonly reward: Readonly<HintAccessRequest & { steps: 1 }>;
}

/** The publishing entry may supply this subset of Game Host; SDKs stay outside the game. */
export interface HintHost {
  readonly session?: { readonly capabilities: readonly string[] };
  readonly ads?: { offer(opportunity: HintRewardOpportunity): Promise<unknown> };
}

export type HintAccessOutcome =
  | { status: 'granted'; source: 'free' | 'reward' }
  | { status: 'dismissed' | 'unavailable' | 'failed' };

export interface HintAccessOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

const MAX_TIMEOUT_MS = 45_000;

/**
 * Standalone hints are free. A supplied Game Host must explicitly complete its
 * Reward Opportunity; dismissal, missing inventory, and failure never grant it.
 * This function only authorizes one step. The caller must serialize requests and
 * revalidate the puzzle state before applying a previously calculated action.
 */
export async function requestHintAccess(
  host: HintHost | null | undefined,
  request: HintAccessRequest,
  { signal, timeoutMs = MAX_TIMEOUT_MS }: HintAccessOptions = {},
): Promise<HintAccessOutcome> {
  if (signal?.aborted) return { status: 'dismissed' };
  if (
    !request.levelId.trim() ||
    !['disassemble', 'reassemble'].includes(request.phase) ||
    !['move', 'rotate'].includes(request.action)
  )
    return { status: 'failed' };
  if (host == null) return { status: 'granted', source: 'free' };
  if (
    !Array.isArray(host.session?.capabilities) ||
    !host.session.capabilities.includes('advertising') ||
    typeof host.ads?.offer !== 'function'
  )
    return { status: 'unavailable' };

  const duration =
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? Math.min(timeoutMs, MAX_TIMEOUT_MS)
      : MAX_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const timeout = new Promise<{ status: 'failed' }>((resolve) => {
    timer = setTimeout(() => resolve({ status: 'failed' }), duration);
  });
  const cancelled = new Promise<{ status: 'dismissed' }>((resolve) => {
    onAbort = () => resolve({ status: 'dismissed' });
    signal?.addEventListener('abort', onAbort, { once: true });
  });
  try {
    const result = await Promise.race([
      host.ads.offer({
        id: `luban-workshop.hint.${request.phase}`,
        reward: {
          levelId: request.levelId,
          phase: request.phase,
          action: request.action,
          steps: 1,
        },
      }),
      timeout,
      cancelled,
    ]);
    // A simultaneous abort wins even if a host settles first in the same turn.
    if (signal?.aborted) return { status: 'dismissed' };
    if (!result || typeof result !== 'object' || !('status' in result)) return { status: 'failed' };
    switch (result.status) {
      case 'completed':
        return { status: 'granted', source: 'reward' };
      case 'dismissed':
      case 'unavailable':
      case 'failed':
        return { status: result.status };
      default:
        return { status: 'failed' };
    }
  } catch {
    return { status: signal?.aborted ? 'dismissed' : 'failed' };
  } finally {
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener('abort', onAbort);
  }
}
