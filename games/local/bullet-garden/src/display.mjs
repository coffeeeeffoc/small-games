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

export function setupDisplay({ game, onChange = () => {} }) {
  const scope = game.ownerDocument.defaultView;
  const document = game.ownerDocument;
  const mobile = scope.matchMedia('(pointer: coarse)');
  const miniGame = isMiniGameRuntime(scope);
  // A mouse/trackpad (or a detached browser touch session) can change the primary
  // pointer mid-run. Once touch is available, retain the landscape touch layout.
  let touchLayout = mobile.matches || scope.navigator.maxTouchPoints > 0;
  game.dataset.runtime = miniGame ? 'minigame' : 'web';
  let previous = '',
    resizeFrame = 0;
  function fit(notify = true) {
    const viewport = scope.visualViewport;
    const width = Math.max(1, Math.round(viewport?.width || scope.innerWidth));
    const height = Math.max(1, Math.round(viewport?.height || scope.innerHeight));
    touchLayout ||= mobile.matches || scope.navigator.maxTouchPoints > 0;
    const layout = landscapeViewport(width, height, touchLayout || miniGame);
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
    if (!touchLayout && !miniGame) return;
    try {
      await scope.screen?.orientation?.lock?.('landscape');
    } catch {
      // Safari and non-fullscreen browsers use the automatic CSS rotation instead.
    }
  }

  const resize = () => fit();
  scope.addEventListener('resize', resize);
  scope.visualViewport?.addEventListener('resize', resize);
  scope.screen?.orientation?.addEventListener?.('change', resize);
  mobile.addEventListener?.('change', resize);
  document.addEventListener('pointerdown', lockLandscape, { once: true });
  fit(false);
  void lockLandscape();
  return { miniGame, refresh: resize, lockLandscape };
}
