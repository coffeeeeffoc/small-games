/** Browser display adapter. Coordinates remain in the game's landscape axes. */
export function landscapeViewport(width, height) {
  const rotated = height > width;
  return { width: rotated ? height : width, height: rotated ? width : height, rotated };
}

export function clientToElement(element, clientX, clientY) {
  const rect = element.getBoundingClientRect();
  if (element.closest('[data-rotated="true"]'))
    return {
      x: ((clientY - rect.top) * element.clientWidth) / (rect.height || 1),
      y: ((rect.right - clientX) * element.clientHeight) / (rect.width || 1),
    };
  return {
    x: ((clientX - rect.left) * element.clientWidth) / (rect.width || 1),
    y: ((clientY - rect.top) * element.clientHeight) / (rect.height || 1),
  };
}

export function elementToClient(element, x, y) {
  const rect = element.getBoundingClientRect();
  if (element.closest('[data-rotated="true"]'))
    return {
      x: rect.right - (y * rect.width) / (element.clientHeight || 1),
      y: rect.top + (x * rect.height) / (element.clientWidth || 1),
    };
  return {
    x: rect.left + (x * rect.width) / (element.clientWidth || 1),
    y: rect.top + (y * rect.height) / (element.clientHeight || 1),
  };
}

export function isMiniGameRuntime(scope = globalThis) {
  const query = new URLSearchParams(scope.location?.search || '');
  const entries = new Set([
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
  return (
    ['runtime', 'platform', 'entry', 'target'].some((key) => entries.has(query.get(key))) ||
    Boolean(
      scope.GameGlobal ||
        [scope.wx, scope.tt, scope.ks, scope.swan].some(
          (sdk) =>
            typeof sdk?.createCanvas === 'function' && typeof sdk?.getSystemInfoSync === 'function',
        ),
    )
  );
}

export function setupDisplay({ game, onChange = () => {} }) {
  const document = game.ownerDocument,
    scope = document.defaultView;
  const miniGame = isMiniGameRuntime(scope);
  game.dataset.runtime = miniGame ? 'minigame' : 'web';
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:absolute;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.append(probe);
  const notice = document.createElement('div');
  notice.id = 'display-notice';
  notice.setAttribute('role', 'status');
  notice.hidden = true;
  game.append(notice);
  let previous = '',
    resizeFrame = 0,
    pending = false,
    noticeTimer;
  let host = document;
  try {
    const display =
      scope.parent !== scope && scope.parent.document.querySelector('[data-game-display-host]');
    if (display && scope.frameElement && display.contains(scope.frameElement))
      host = scope.parent.document;
  } catch {
    /* Cross-origin iframes keep their own display boundary. */
  }
  const isFullscreen = () =>
    Boolean(
      document.fullscreenElement ||
        document.webkitFullscreenElement ||
        host.fullscreenElement ||
        host.webkitFullscreenElement,
    );
  function feedback(message) {
    clearTimeout(noticeTimer);
    notice.textContent = message;
    notice.hidden = false;
    noticeTimer = setTimeout(() => {
      notice.hidden = true;
    }, 3500);
  }
  function fit() {
    const viewport = scope.visualViewport;
    const width = Math.max(1, Math.round(viewport?.width || scope.innerWidth));
    const height = Math.max(1, Math.round(viewport?.height || scope.innerHeight));
    const layout = landscapeViewport(width, height);
    const key = `${width}:${height}:${layout.rotated}`;
    game.style.setProperty('--game-width', `${layout.width}px`);
    game.style.setProperty('--game-height', `${layout.height}px`);
    game.dataset.rotated = String(layout.rotated);
    game.dataset.compact = String(layout.height <= 430 || layout.width <= 740);
    const css = scope.getComputedStyle(probe);
    const safe = ['Top', 'Right', 'Bottom', 'Left'].map((side) => css[`padding${side}`] || '0px');
    const logical = layout.rotated ? [safe[1], safe[2], safe[3], safe[0]] : safe;
    ['top', 'right', 'bottom', 'left'].forEach((side, i) =>
      game.style.setProperty(`--safe-${side}`, logical[i]),
    );
    if (key !== previous) {
      scope.cancelAnimationFrame(resizeFrame);
      resizeFrame = scope.requestAnimationFrame(onChange);
    }
    previous = key;
    syncFullscreen();
  }
  async function lockLandscape() {
    if (scope.navigator.maxTouchPoints === 0 && !miniGame) return;
    try {
      await scope.screen?.orientation?.lock?.('landscape');
    } catch {
      /* CSS rotation remains playable. */
    }
  }
  function syncFullscreen() {
    game.dataset.fullscreen = String(isFullscreen());
    for (const button of game.querySelectorAll('#home-fullscreen,#modal-fullscreen')) {
      button.hidden = miniGame;
      button.disabled = pending;
      button.textContent = pending ? '切换中…' : isFullscreen() ? '退出全屏' : '全屏';
      button.setAttribute('aria-pressed', String(isFullscreen()));
    }
  }
  async function toggleFullscreen() {
    if (miniGame || pending) return;
    const exiting = isFullscreen();
    const owner = document.fullscreenElement || document.webkitFullscreenElement ? document : host;
    const target = owner.querySelector('[data-game-display-host]') || owner.documentElement;
    const method = exiting
      ? owner.exitFullscreen || owner.webkitExitFullscreen
      : target.requestFullscreen || target.webkitRequestFullscreen;
    if (!method) {
      feedback('当前浏览器不支持全屏，已适配横屏。');
      return;
    }
    pending = true;
    syncFullscreen();
    const timeout = setTimeout(() => {
      pending = false;
      fit();
    }, 1800);
    try {
      await method.call(exiting ? owner : target);
      if (!exiting) void lockLandscape();
    } catch {
      feedback('浏览器未允许切换全屏，可继续横屏游玩。');
    } finally {
      clearTimeout(timeout);
      pending = false;
      fit();
    }
  }
  const changed = () => {
    pending = false;
    fit();
    if (isFullscreen()) void lockLandscape();
  };
  for (const owner of new Set([document, host])) {
    owner.addEventListener('fullscreenchange', changed);
    owner.addEventListener('webkitfullscreenchange', changed);
  }
  scope.addEventListener('resize', fit);
  scope.visualViewport?.addEventListener('resize', fit);
  scope.screen?.orientation?.addEventListener?.('change', fit);
  document.addEventListener('pointerdown', lockLandscape, { once: true });
  scope.addEventListener('pageshow', fit);
  fit();
  return { miniGame, refresh: fit, toggleFullscreen, isFullscreen, lockLandscape, syncFullscreen };
}
