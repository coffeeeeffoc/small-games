export function landscapeViewport(width, height, touch) {
  const rotated = Boolean(touch && height > width);
  return { width: rotated ? height : width, height: rotated ? width : height, rotated };
}

export function clientToElement(element, clientX, clientY) {
  const rect = element.getBoundingClientRect();
  if (element.closest('[data-rotated="true"]')) {
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

export function setupDisplay(game, onChange) {
  const touchMedia = matchMedia('(pointer: coarse)');
  let touch = touchMedia.matches || navigator.maxTouchPoints > 0;
  let last = '';
  const controller = new AbortController();
  const on = (target, type, callback) =>
    target?.addEventListener?.(type, callback, { signal: controller.signal });
  const native = Boolean(
    globalThis.GameGlobal ||
      [globalThis.wx, globalThis.tt, globalThis.ks, globalThis.swan].some(
        (sdk) =>
          typeof sdk?.createCanvas === 'function' && typeof sdk?.getSystemInfoSync === 'function',
      ) ||
      ['wechat', 'douyin', 'bilibili', 'minigame'].includes(
        new URLSearchParams(location.search).get('platform'),
      ),
  );
  function fit() {
    const viewport = window.visualViewport;
    const physicalWidth = Math.max(1, Math.round(viewport?.width || innerWidth));
    const physicalHeight = Math.max(1, Math.round(viewport?.height || innerHeight));
    touch ||= touchMedia.matches || navigator.maxTouchPoints > 0;
    const layout = landscapeViewport(physicalWidth, physicalHeight, touch || native);
    const key = [layout.width, layout.height, layout.rotated].join(':');
    if (key === last) return;
    last = key;
    game.style.setProperty('--game-w', layout.width + 'px');
    game.style.setProperty('--game-h', layout.height + 'px');
    game.dataset.rotated = String(layout.rotated);
    game.dataset.compact = String(layout.height <= 360);
    onChange(layout);
  }
  async function lock() {
    if (!touch && !native) return;
    try {
      await screen.orientation?.lock?.('landscape');
    } catch {
      /* CSS rotation remains playable. */
    }
  }
  on(window, 'resize', fit);
  on(window.visualViewport, 'resize', fit);
  on(screen.orientation, 'change', fit);
  on(touchMedia, 'change', fit);
  on(document, 'game-displaychange', () => {
    fit();
    void lock();
  });
  on(game, 'pointerdown', (event) => {
    if (event.pointerType === 'touch') {
      touch = true;
      fit();
    }
    if (!last) fit();
  });
  game.addEventListener('pointerdown', lock, { once: true, signal: controller.signal });
  fit();
  return { refresh: fit, dispose: () => controller.abort() };
}
