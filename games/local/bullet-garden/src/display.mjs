const MINI_GAME_ENTRIES = new Set([
  'minigame',
  'mini-game',
  'wechat',
  'weixin',
  'wechatgame',
  'bilibili',
  'douyin',
  'bytedance',
  'bytedance-mini-game',
  'kuaishou',
  'baidu',
]);

export function isMiniGameRuntime(scope = globalThis, search = scope.location?.search || '') {
  const query = new URLSearchParams(search);
  if (
    ['runtime', 'platform', 'entry', 'target'].some((key) => MINI_GAME_ENTRIES.has(query.get(key)))
  )
    return true;
  // The WeChat browser also exposes wx; only its canvas game API identifies a game runtime.
  return Boolean(
    scope.GameGlobal ||
      [scope.wx, scope.tt, scope.ks, scope.swan].some(
        (sdk) =>
          typeof sdk?.createCanvas === 'function' && typeof sdk?.getSystemInfoSync === 'function',
      ),
  );
}

export function landscapeViewport(width, height, mobile) {
  const rotated = mobile && height > width;
  return { width: rotated ? height : width, height: rotated ? width : height, rotated };
}

function rotatedElement(element) {
  return Boolean(element.closest('[data-rotated="true"]'));
}

// Transform browser pointer coordinates into the element's unrotated CSS coordinates.
// Bounding boxes alone swap the axes when the entire game is turned clockwise.
export function clientToElement(element, clientX, clientY) {
  const rect = element.getBoundingClientRect();
  if (rotatedElement(element)) {
    return {
      x: ((clientY - rect.top) * element.clientWidth) / (rect.height || 1),
      y: ((rect.right - clientX) * element.clientHeight) / (rect.width || 1),
    };
  }
  return {
    x: ((clientX - rect.left) * element.clientWidth) / (rect.width || 1),
    y: ((clientY - rect.top) * element.clientHeight) / (rect.height || 1),
  };
}

export function elementToClient(element, x, y) {
  const rect = element.getBoundingClientRect();
  if (rotatedElement(element)) {
    return {
      x: rect.right - (y * rect.width) / (element.clientHeight || 1),
      y: rect.top + (x * rect.height) / (element.clientWidth || 1),
    };
  }
  return {
    x: rect.left + (x * rect.width) / (element.clientWidth || 1),
    y: rect.top + (y * rect.height) / (element.clientHeight || 1),
  };
}

export function setupDisplay({ game, onChange = () => {}, onMessage = () => {} }) {
  const scope = game.ownerDocument.defaultView;
  const document = game.ownerDocument;
  const mobile = scope.matchMedia('(pointer: coarse)');
  const miniGame = isMiniGameRuntime(scope);
  game.dataset.runtime = miniGame ? 'minigame' : 'web';
  let previous = '',
    pending = false,
    resizeFrame = 0,
    messageTimer;
  const notice = document.createElement('div');
  notice.id = 'display-notice';
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  notice.hidden = true;
  game.append(notice);

  function feedback(message) {
    clearTimeout(messageTimer);
    notice.textContent = message;
    notice.hidden = false;
    messageTimer = setTimeout(() => {
      notice.hidden = true;
    }, 4000);
    onMessage(message);
  }

  function fit(notify = true) {
    const viewport = scope.visualViewport;
    const width = Math.max(1, Math.round(viewport?.width || scope.innerWidth));
    const height = Math.max(1, Math.round(viewport?.height || scope.innerHeight));
    const layout = landscapeViewport(width, height, mobile.matches || miniGame);
    const key = `${width}:${height}:${layout.rotated}`;
    game.style.setProperty('--game-width', `${layout.width}px`);
    game.style.setProperty('--game-height', `${layout.height}px`);
    game.dataset.rotated = String(layout.rotated);
    game.dataset.compactLandscape = String(layout.height <= 540);
    if (previous !== key && notify) {
      scope.cancelAnimationFrame(resizeFrame);
      resizeFrame = scope.requestAnimationFrame(onChange);
    }
    previous = key;
  }

  async function lockLandscape() {
    if (!mobile.matches && !miniGame) return;
    try {
      await scope.screen?.orientation?.lock?.('landscape');
    } catch {
      // Safari and non-fullscreen browsers use the automatic CSS rotation instead.
    }
  }

  // Match the shell's display host so the same button works in standalone and iframe entries.
  let host = document;
  try {
    const parentHost =
      scope.parent !== scope && scope.parent.document.querySelector('[data-game-display-host]');
    if (parentHost && scope.frameElement && parentHost.contains(scope.frameElement))
      host = scope.parent.document;
  } catch {
    /* Cross-origin embeddings fullscreen their own game document. */
  }
  const active = () =>
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    host.fullscreenElement ||
    host.webkitFullscreenElement;
  let button;
  if (!miniGame) {
    button = document.createElement('button');
    button.id = 'fullscreen';
    button.className = 'fullscreen-control';
    button.type = 'button';
    game.append(button);
  }

  function syncFullscreen() {
    if (button) {
      const label = active() ? '退出全屏' : '全屏';
      button.textContent = pending ? '切换中…' : label;
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(Boolean(active())));
      button.disabled = pending;
    }
    fit();
  }

  async function toggleFullscreen() {
    if (pending) return;
    const exiting = Boolean(active());
    const owner = document.fullscreenElement || document.webkitFullscreenElement ? document : host;
    const target = owner.querySelector('[data-game-display-host]') || owner.documentElement;
    const method = exiting
      ? owner.exitFullscreen || owner.webkitExitFullscreen
      : target.requestFullscreen || target.webkitRequestFullscreen;
    if (!method) {
      feedback('当前浏览器不支持网页全屏，已自动适配横屏。');
      return;
    }
    pending = true;
    syncFullscreen();
    const timeout = setTimeout(() => {
      pending = false;
      syncFullscreen();
    }, 1800);
    try {
      // Must be called during the user's click, before any asynchronous work.
      await method.call(exiting ? owner : target);
      if (!exiting) await lockLandscape();
    } catch {
      feedback(
        exiting
          ? '暂时无法退出全屏，可使用浏览器的退出操作。'
          : '浏览器未允许全屏，可继续横屏游玩。',
      );
    } finally {
      clearTimeout(timeout);
      pending = false;
      syncFullscreen();
    }
  }

  button?.addEventListener('click', toggleFullscreen);
  const resize = () => fit();
  const displayChanged = () => {
    pending = false;
    syncFullscreen();
    if (active()) void lockLandscape();
  };
  for (const owner of new Set([document, host])) {
    owner.addEventListener('fullscreenchange', displayChanged);
    owner.addEventListener('webkitfullscreenchange', displayChanged);
  }
  scope.addEventListener('resize', resize);
  scope.visualViewport?.addEventListener('resize', resize);
  scope.screen?.orientation?.addEventListener?.('change', resize);
  mobile.addEventListener?.('change', resize);
  document.addEventListener('pointerdown', lockLandscape, { once: true });
  fit(false);
  syncFullscreen();
  void lockLandscape();
  return { miniGame, refresh: resize, lockLandscape };
}
