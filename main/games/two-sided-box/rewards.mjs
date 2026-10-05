import { FACE_IDS } from './faces.mjs';

const REWARD_STATUSES = new Set(['completed', 'dismissed', 'unavailable', 'failed']);
const DEFAULT_TIMEOUT_MS = 45_000;

// A publishing host may explicitly inject window.twoSidedBoxHost using the
// repository's GameHost advertising contract. The standalone page has no ad
// provider; its free hints remain available regardless of this optional port.
export function canOfferReward(host) {
  return (
    Array.isArray(host?.session?.capabilities) &&
    host.session.capabilities.includes('advertising') &&
    typeof host?.ads?.offer === 'function'
  );
}

export async function offerFaceReward(
  host,
  faceId,
  { timeoutMs = DEFAULT_TIMEOUT_MS, signal } = {},
) {
  if (!canOfferReward(host) || !FACE_IDS.includes(faceId)) return { status: 'unavailable' };
  if (signal?.aborted) return { status: 'dismissed' };
  const duration =
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? Math.min(timeoutMs, DEFAULT_TIMEOUT_MS)
      : DEFAULT_TIMEOUT_MS;
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ status: 'failed' }), duration);
  });
  let onAbort;
  const cancelled = new Promise((resolve) => {
    onAbort = () => resolve({ status: 'dismissed' });
    signal?.addEventListener('abort', onAbort, { once: true });
  });
  try {
    const result = await Promise.race([
      host.ads.offer({ id: 'two-sided-box.reveal-face', reward: { face: faceId, faces: 1 } }),
      timeout,
      cancelled,
    ]);
    // Cancellation invalidates this observation grant even if the host's
    // advertising port cannot cancel its own video or resolves in the same turn.
    if (signal?.aborted) return { status: 'dismissed' };
    return { status: REWARD_STATUSES.has(result?.status) ? result.status : 'failed' };
  } catch {
    return { status: 'failed' };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
