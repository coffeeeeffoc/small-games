export function setupDisplay(game, resize) {
  const listeners = [];
  const on = (target, event, fn) => {
    target?.addEventListener(event, fn);
    listeners.push(() => target?.removeEventListener(event, fn));
  };
  function fit() {
    const w = visualViewport?.width || innerWidth,
      h = visualViewport?.height || innerHeight;
    const rotated = h > w;
    game.dataset.rotated = String(rotated);
    game.dataset.compact = String(Math.min(w, h) < 540);
    game.style.setProperty('--game-width', `${rotated ? h : w}px`);
    game.style.setProperty('--game-height', `${rotated ? w : h}px`);
    resize(rotated ? h : w, rotated ? w : h);
  }
  on(window, 'resize', fit);
  on(window.visualViewport, 'resize', fit);
  on(document, 'fullscreenchange', fit);
  on(document, 'game-displaychange', fit);
  // Fullscreen refusal is harmless: CSS keeps the complete interface in landscape.
  const lock = () => {
    try {
      screen.orientation?.lock?.('landscape')?.catch(() => {});
    } catch {}
  };
  on(game, 'pointerdown', lock);
  fit();
  return () => listeners.forEach((fn) => fn());
}
