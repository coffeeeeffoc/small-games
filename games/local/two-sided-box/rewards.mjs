import { FACE_IDS } from './faces.mjs';

const REWARD_STATUSES = new Set(['completed', 'dismissed', 'unavailable', 'failed']);
const DEFAULT_TIMEOUT_MS = 45_000;

// An explicitly injected host keeps authority. Only standalone H5 uses the
// configured common port; absent configuration never enables a mock provider.
export function resolveRewardHost(environment = globalThis) {
  if (environment.twoSidedBoxHost !== undefined) return environment.twoSidedBoxHost;
  const port = environment.SmallGamesRewardAds;
  if (!port?.available) return undefined;
  return {
    session: { capabilities: ['advertising'] },
    ads: { offer: port.offer, cancel: port.cancel, managesTimeout: true },
  };
}

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
    // The common H5 port bounds loading/opening and permits long playback.
    if (!host.ads.managesTimeout)
      timer = setTimeout(() => resolve({ status: 'failed' }), duration);
  });
  let onAbort;
  const cancelled = new Promise((resolve) => {
    onAbort = () => {
      try {
        if (typeof host.ads.cancel === 'function') host.ads.cancel();
      } catch {
        // The game must still invalidate the grant if an optional host cancel fails.
      }
      resolve({ status: 'dismissed' });
    };
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
