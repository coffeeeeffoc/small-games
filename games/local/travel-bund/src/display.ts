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

type LandscapeOrientation = ScreenOrientation & { lock?: (orientation: string) => Promise<void> };

export function setupDisplay(
  game: HTMLElement,
  dialog: HTMLDialogElement,
  callbacks: {
    onChange: () => void;
  },
) {
  const scope = game.ownerDocument.defaultView!;
  const coarse = scope.matchMedia('(pointer: coarse)');
  let touch = coarse.matches || scope.navigator.maxTouchPoints > 0;
  const pageHidden = (event: PageTransitionEvent) => {
    if (!event.persisted) dispose();
  };
  let disposed = false, previous = '';

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
  const resize = () => fit();
  scope.addEventListener('resize', resize);
  scope.visualViewport?.addEventListener('resize', resize);
  scope.visualViewport?.addEventListener('scroll', resize);
  scope.screen.orientation?.addEventListener('change', resize);
  coarse.addEventListener('change', resize);
  // BFCache restores the existing React tree; re-read its physical viewport.
  scope.addEventListener('pageshow', resize);
  scope.addEventListener('pagehide', pageHidden);
  fit();
  void lockLandscape();
  function dispose() {
    if (disposed) return;
    disposed = true;
    scope.removeEventListener('resize', resize);
    scope.removeEventListener('pageshow', resize);
    scope.removeEventListener('pagehide', pageHidden);
    scope.visualViewport?.removeEventListener('resize', resize);
    scope.visualViewport?.removeEventListener('scroll', resize);
    scope.screen.orientation?.removeEventListener('change', resize);
    coarse.removeEventListener('change', resize);
  }
  return { dispose };
}
