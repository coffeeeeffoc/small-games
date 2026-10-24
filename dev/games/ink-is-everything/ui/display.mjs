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
  let previous = '', resizeFrame = 0;
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
  }
  async function lockLandscape() {
    if (scope.navigator.maxTouchPoints === 0 && !miniGame) return;
    try {
      await scope.screen?.orientation?.lock?.('landscape');
    } catch {
      /* CSS rotation remains playable. */
    }
  }
  scope.addEventListener('resize', fit);
  scope.visualViewport?.addEventListener('resize', fit);
  scope.screen?.orientation?.addEventListener?.('change', fit);
  document.addEventListener('pointerdown', lockLandscape, { once: true });
  scope.addEventListener('pageshow', fit);
  fit();
  return { miniGame, refresh: fit, lockLandscape };
}
