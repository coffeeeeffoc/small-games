// Lightweight browser adapter for standalone H5 games. No channel SDK or secret belongs here.
const terminalStatuses = new Set(['completed', 'dismissed', 'unavailable', 'failed']);
const blockedParams = /^(dev|debug|token|access_token|authorization|secret|session|password)$/i;
const boundedNumber = (value, fallback, minimum, maximum) =>
  Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;

/** Public challenges contain only explicitly supplied, bounded, non-sensitive parameters. */
export function publicChallengeUrl(base, params = {}) {
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid public URL');
  url.username = '';
  url.password = '';
  let shellRoute;
  const route = /^#\/games\/([^/?#]+)(?:\?[^#]*)?$/.exec(url.hash);
  if (route) {
    let id;
    try {
      id = decodeURIComponent(route[1]);
    } catch {
      throw new Error('Invalid public Shell route');
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,79}$/.test(id)) throw new Error('Invalid public Shell route');
    shellRoute = `/games/${encodeURIComponent(id)}`;
  } else if (/^#\/games(?:\/|\?|$)/.test(url.hash)) {
    throw new Error('Invalid public Shell route');
  }
  url.search = '';
  url.hash = '';
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(key) || blockedParams.test(key)) continue;
    if (!['string', 'number', 'boolean'].includes(typeof value)) continue;
    const text = String(value);
    if (text.length <= 256) query.set(key, text);
  }
  // The Shell passes only its hash route query into the game. Standalone games
  // read location.search. Never copy either source's inherited query/dev flags.
  if (shellRoute) url.hash = `${shellRoute}${query.size ? `?${query}` : ''}`;
  else url.search = query.toString();
  return url.href;
}

/** shared = browser handoff; copied = clipboard write. Neither proves delivery to a friend. */
export async function shareChallenge(options, environment = globalThis) {
  let url;
  try {
    url = publicChallengeUrl(options.url ?? environment.location.href, options.params);
  } catch {
    return { status: 'unavailable', url: '' };
  }
  const navigator = environment.navigator;
  if (typeof navigator?.share === 'function') {
    try {
      await navigator.share({ title: options.title, text: options.text, url });
      return { status: 'shared', url };
    } catch (error) {
      if (error?.name === 'AbortError') return { status: 'cancelled', url };
      // Unsupported/blocked system sharing can still offer an honest clipboard fallback.
    }
  }
  try {
    if (!navigator?.clipboard?.writeText) return { status: 'unavailable', url };
    await navigator.clipboard.writeText(url);
    return { status: 'copied', url };
  } catch {
    return { status: 'failed', url };
  }
}

/**
 * A visible simulation AdProvider with the Game Host RewardOutcome contract.
 * It never awards anything itself. Only an explicit completed result may grant a reward.
 */
export function createSimulationAdProvider(options = {}) {
  const doc = options.document ?? globalThis.document;
  const durationMs = boundedNumber(options.durationMs, 4000, 1000, 15000);
  let active;
  return {
    show(request = {}) {
      const root = options.root ?? doc?.body;
      if (!root || !doc || doc.hidden || active) return Promise.resolve({ status: 'unavailable' });
      return new Promise((resolve) => {
        const previousFocus = doc.activeElement;
        const overlay = doc.createElement('div');
        overlay.setAttribute('data-game-ad', 'mock');
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', '模拟广告');
        overlay.style.cssText =
          'position:fixed;inset:0;z-index:2147483600;display:grid;place-items:center;padding:max(16px,env(safe-area-inset-top)) 16px;background:#07131be8;box-sizing:border-box;touch-action:manipulation;color:#f4f8fa;font:16px/1.5 system-ui,sans-serif;';
        const card = doc.createElement('div');
        card.style.cssText =
          'width:min(360px,100%);max-height:100%;overflow:auto;box-sizing:border-box;border:1px solid #52716e;border-radius:24px;padding:24px;background:#142b30;text-align:center;';
        const heading = doc.createElement('h2');
        heading.textContent = '休息片刻 · 模拟广告';
        heading.style.cssText = 'font-size:20px;margin:0 0 14px;';
        const message = doc.createElement('p');
        message.textContent =
          request.kind === 'interstitial'
            ? '随时关闭，继续下一局。'
            : '观看结束后可领取本次可选奖励。';
        const progress = doc.createElement('p');
        progress.setAttribute('role', 'status');
        progress.setAttribute('aria-live', 'polite');
        const complete = doc.createElement('button');
        complete.textContent = request.kind === 'interstitial' ? '继续游戏' : '领取奖励';
        complete.disabled = true;
        const close = doc.createElement('button');
        close.textContent = '关闭并继续';
        for (const button of [complete, close]) {
          button.type = 'button';
          button.style.cssText =
            'display:block;width:100%;min-height:48px;margin-top:12px;border:1px solid #739894;border-radius:14px;background:#254448;color:#f4f8fa;font:600 16px system-ui;cursor:pointer;';
        }
        complete.style.background = '#367a69';
        card.append(heading, message, progress, complete, close);
        overlay.append(card);
        let elapsed = 0;
        let settled = false;
        let interval;
        let timeout;
        const finish = (status) => {
          if (settled) return;
          settled = true;
          clearInterval(interval);
          clearTimeout(timeout);
          doc.removeEventListener('visibilitychange', hidden);
          doc.removeEventListener('keydown', keydown, true);
          overlay.remove();
          active = undefined;
          try {
            previousFocus?.focus?.({ preventScroll: true });
          } catch {
            /* Detached control. */
          }
          resolve({ status });
        };
        const hidden = () => {
          if (doc.hidden) finish('dismissed');
        };
        const keydown = (event) => {
          // A game may also listen on document; modal keystrokes must not resume/fire it.
          event.stopImmediatePropagation();
          if (event.key === 'Escape') {
            event.preventDefault();
            finish('dismissed');
          }
          if (event.key === 'Tab') {
            event.preventDefault();
            (doc.activeElement === close && !complete.disabled ? complete : close).focus();
          }
        };
        close.addEventListener('click', () => finish('dismissed'));
        complete.addEventListener('click', () => {
          if (!complete.disabled) finish('completed');
        });
        const update = () => {
          progress.textContent =
            elapsed >= durationMs ? '观看完成' : `${Math.ceil((durationMs - elapsed) / 1000)} 秒`;
          complete.disabled = elapsed < durationMs;
          complete.style.opacity = complete.disabled ? '.5' : '1';
        };
        active = finish;
        try {
          root.append(overlay);
          close.focus();
          doc.addEventListener('visibilitychange', hidden);
          doc.addEventListener('keydown', keydown, true);
          update();
          interval = setInterval(() => {
            elapsed += 250;
            update();
          }, 250);
          timeout = setTimeout(() => finish('dismissed'), 30000);
        } catch {
          finish('failed');
        }
      });
    },
    dispose() {
      active?.('dismissed');
    },
  };
}

/**
 * Standalone browser host adapter. pause() must return a function restoring the previous
 * state (including an already paused game). No ad is shown during active play automatically.
 * adMode is immutable: off (default), mock (explicit simulation), or host (injected provider).
 */
export function createH5Publishing(options) {
  const environment = options.environment ?? globalThis;
  const mode = options.adMode ?? 'off';
  const provider =
    mode === 'mock'
      ? createSimulationAdProvider({
          document: environment.document,
          root: options.root,
          durationMs: options.durationMs,
        })
      : mode === 'host'
        ? options.provider
        : undefined;
  const now = options.now ?? Date.now;
  const cooldownMs = boundedNumber(options.cooldownMs, 60000, 30000, 3600000);
  const maxPerSession = Math.floor(boundedNumber(options.maxPerSession, 6, 0, 12));
  let lastShown = -Infinity;
  let impressions = 0;
  let busy = false;
  let providerPending = false;
  let disposed = false;
  let naturalBreaks = 0;
  let cancel;

  async function offer(request, kind) {
    if (disposed || busy || providerPending || !provider || environment.document?.hidden)
      return { status: 'unavailable' };
    if (!request?.placement || typeof request.placement !== 'string')
      return { status: 'unavailable' };
    if (kind === 'interstitial') {
      if (request.naturalBreak !== true) return { status: 'unavailable' };
      naturalBreaks += 1;
      // First result stays uninterrupted; never schedule a popup after a queued click.
      if (naturalBreaks % 3 !== 0) return { status: 'unavailable' };
    }
    if (impressions >= maxPerSession || now() - lastShown < cooldownMs)
      return { status: 'unavailable' };
    busy = true;
    let resume;
    let timer;
    try {
      resume = options.pause?.();
      const interrupted = new Promise((resolve) => {
        cancel = () => resolve({ status: 'dismissed' });
        timer = setTimeout(() => resolve({ status: 'failed' }), 45000);
      });
      providerPending = true;
      let shown;
      try {
        shown = Promise.resolve(
          provider.show({ opportunityId: `${options.gameId}.${request.placement}`, kind }),
        ).finally(() => {
          providerPending = false;
        });
      } catch (error) {
        providerPending = false;
        throw error;
      }
      const result = await Promise.race([shown, interrupted]);
      const status = terminalStatuses.has(result?.status) ? result.status : 'failed';
      // Count attempts too: an unavailable network must not cause repeated interruption.
      lastShown = now();
      impressions += 1;
      return { status };
    } catch {
      lastShown = now();
      impressions += 1;
      return { status: 'failed' };
    } finally {
      clearTimeout(timer);
      cancel = undefined;
      // Dispose injected operations after any terminal path to prevent late completion.
      try {
        if (providerPending) provider.dispose?.();
      } catch {
        /* A broken optional provider cannot trap the game. */
      }
      try {
        if (typeof resume === 'function') resume();
      } catch {
        /* Game manages lifecycle errors. */
      }
      busy = false;
    }
  }
  return Object.freeze({
    share(request = {}) {
      if (disposed) return Promise.resolve({ status: 'unavailable', url: '' });
      return shareChallenge(
        { title: options.title, url: options.publicUrl ?? environment.location?.href, ...request },
        environment,
      );
    },
    rewarded: (request) => offer(request, 'rewarded'),
    interstitial: (request) => offer(request, 'interstitial'),
    dispose() {
      disposed = true;
      cancel?.();
      try {
        provider?.dispose?.();
      } catch {
        /* Optional cleanup. */
      }
    },
  });
}
