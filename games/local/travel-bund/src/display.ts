// Browser display capabilities live outside the touring rules and scene renderer.
export function landscapeViewport(width: number, height: number, touch: boolean) {
  const rotated = touch && height > width;
  return { width: rotated ? height : width, height: rotated ? width : height, rotated };
}

export function clientDelta(dx: number, dy: number, rotated: boolean): [number, number] {
  return rotated ? [dy, -dx] : [dx, dy];
}

export function clientToElement(element: HTMLElement, clientX: number, clientY: number) {
  const rect = element.getBoundingClientRect();
  const rotated = Boolean(element.closest('[data-rotated="true"]'));
  return rotated
    ? {
        x: ((clientY - rect.top) * element.clientWidth) / (rect.height || 1),
        y: ((rect.right - clientX) * element.clientHeight) / (rect.width || 1),
      }
    : {
        x: ((clientX - rect.left) * element.clientWidth) / (rect.width || 1),
        y: ((clientY - rect.top) * element.clientHeight) / (rect.height || 1),
      };
}

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void | Promise<void>;
};
type FullscreenElement = Element & { webkitRequestFullscreen?: () => void | Promise<void> };
type LandscapeOrientation = ScreenOrientation & { lock?: (orientation: string) => Promise<void> };

export function setupDisplay(
  game: HTMLElement,
  dialog: HTMLDialogElement,
  callbacks: {
    onChange: () => void;
    onMessage: (message: string) => void;
    onFullscreenChange: (active: boolean, pending: boolean) => void;
  },
) {
  const scope = game.ownerDocument.defaultView!;
  const document = game.ownerDocument as FullscreenDocument;
  const coarse = scope.matchMedia('(pointer: coarse)');
  let touch = coarse.matches || scope.navigator.maxTouchPoints > 0;
  // Match the shared H5 fullscreen control: fullscreen the owning Shell display,
  // including all of this game's controls, without changing iframe permissions.
  let host = document;
  let hostTarget: Element = document.documentElement;
  let immersiveStyle: HTMLStyleElement | undefined;
  let frame: Element | undefined;
  let previousFrameMarker: string | null = null;
  try {
    const display = scope.frameElement?.closest('[data-game-display-host]');
    if (display) {
      host = display.ownerDocument as FullscreenDocument;
      hostTarget = display;
      frame = scope.frameElement!;
      previousFrameMarker = frame.getAttribute('data-bund-game-display');
      frame.setAttribute('data-bund-game-display', 'true');
      // The game owns its immersive mode. Scope the host styling to this iframe
      // and restore it on exit/unmount, alongside the existing fullscreen adapter.
      immersiveStyle = host.createElement('style');
      immersiveStyle.textContent =
        '.standalone-page:is(:fullscreen, :-webkit-full-screen):has(iframe[data-bund-game-display="true"]) > nav { display: none; }';
      host.head.append(immersiveStyle);
    }
  } catch {
    // Cross-origin embeds use their own complete document.
  }
  const owners = new Set([document, host]);
  function restoreHost() {
    immersiveStyle?.remove();
    if (previousFrameMarker === null) frame?.removeAttribute('data-bund-game-display');
    else frame?.setAttribute('data-bund-game-display', previousFrameMarker);
  }
  const pageHidden = (event: PageTransitionEvent) => {
    if (!event.persisted) dispose();
  };
  const active = () =>
    Boolean(
      document.fullscreenElement ||
        document.webkitFullscreenElement ||
        host.fullscreenElement ||
        host.webkitFullscreenElement,
    );
  let disposed = false,
    pending = false,
    previous = '',
    timeout = 0;

  function fit() {
    if (disposed) return;
    const viewport = scope.visualViewport;
    const width = Math.max(1, Math.round(viewport?.width || scope.innerWidth));
    const height = Math.max(1, Math.round(viewport?.height || scope.innerHeight));
    touch ||= coarse.matches || scope.navigator.maxTouchPoints > 0;
    const layout = landscapeViewport(width, height, touch);
    // Logical top/right/bottom/left become physical right/bottom/left/top.
    const sides = layout.rotated
      ? ['right', 'bottom', 'left', 'top']
      : ['top', 'right', 'bottom', 'left'];
    for (const element of [game, dialog]) {
      element.dataset.rotated = String(layout.rotated);
      element.dataset.touch = String(touch);
      element.dataset.compactLandscape = String(layout.height <= 540);
      for (const [name, value] of Object.entries({
        'game-width': layout.width,
        'game-height': layout.height,
        'viewport-width': width,
        'viewport-height': height,
        'viewport-left': viewport?.offsetLeft || 0,
        'viewport-top': viewport?.offsetTop || 0,
      }))
        element.style.setProperty(`--${name}`, `${value}px`);
      ['top', 'right', 'bottom', 'left'].forEach((side, index) =>
        element.style.setProperty(`--safe-${side}`, `env(safe-area-inset-${sides[index]}, 0px)`),
      );
    }
    const key = `${width}:${height}:${layout.rotated}:${touch}`;
    if (previous && previous !== key) callbacks.onChange();
    previous = key;
  }

  async function lockLandscape() {
    if (!touch || disposed) return;
    try {
      await (scope.screen.orientation as LandscapeOrientation)?.lock?.('landscape');
    } catch {
      // CSS rotation keeps the game playable with auto-rotate disabled or Safari.
    }
  }
  function changed() {
    if (disposed) return;
    pending = false;
    scope.clearTimeout(timeout);
    callbacks.onFullscreenChange(active(), pending);
    fit();
    if (active()) void lockLandscape();
  }
  async function switchFullscreen(exiting: boolean) {
    if (disposed || pending || active() !== exiting) return;
    const owner = document.fullscreenElement || document.webkitFullscreenElement ? document : host;
    const target = hostTarget as FullscreenElement;
    const method = exiting
      ? owner.exitFullscreen || owner.webkitExitFullscreen
      : target.requestFullscreen || target.webkitRequestFullscreen;
    if (!method) {
      callbacks.onMessage('当前浏览器不支持网页全屏，可继续横屏游览。');
      void lockLandscape();
      return;
    }
    pending = true;
    callbacks.onFullscreenChange(active(), pending);
    timeout = scope.setTimeout(() => {
      changed();
      if (active() === exiting) callbacks.onMessage('浏览器未切换全屏，可继续横屏游览。');
    }, 1800);
    try {
      // Invoke before awaiting anything: entry must retain the original user gesture.
      await method.call(exiting ? owner : target);
      if (disposed) return;
      if (!exiting) void lockLandscape();
      if (active() !== exiting) changed();
    } catch {
      if (disposed) return;
      changed();
      callbacks.onMessage(
        exiting
          ? '暂时无法退出全屏，可使用浏览器的退出操作。'
          : '浏览器未允许全屏，可继续横屏游览。',
      );
    }
  }
  const resize = () => fit();
  scope.addEventListener('resize', resize);
  scope.visualViewport?.addEventListener('resize', resize);
  scope.visualViewport?.addEventListener('scroll', resize);
  scope.screen.orientation?.addEventListener('change', resize);
  coarse.addEventListener('change', resize);
  for (const owner of owners) {
    owner.addEventListener('fullscreenchange', changed);
    owner.addEventListener('webkitfullscreenchange', changed);
  }
  // BFCache restores the existing React tree; re-read its physical viewport.
  scope.addEventListener('pageshow', changed);
  scope.addEventListener('pagehide', pageHidden);
  fit();
  callbacks.onFullscreenChange(active(), false);
  void lockLandscape();
  function dispose() {
    if (disposed) return;
    disposed = true;
    restoreHost();
    scope.clearTimeout(timeout);
    scope.removeEventListener('resize', resize);
    scope.removeEventListener('pageshow', changed);
    scope.removeEventListener('pagehide', pageHidden);
    scope.visualViewport?.removeEventListener('resize', resize);
    scope.visualViewport?.removeEventListener('scroll', resize);
    scope.screen.orientation?.removeEventListener('change', resize);
    coarse.removeEventListener('change', resize);
    for (const owner of owners) {
      owner.removeEventListener('fullscreenchange', changed);
      owner.removeEventListener('webkitfullscreenchange', changed);
    }
  }
  return {
    enterFullscreen: () => {
      void switchFullscreen(false);
    },
    toggleFullscreen: () => {
      void switchFullscreen(active());
    },
    isFullscreen: active,
    dispose,
  };
}
