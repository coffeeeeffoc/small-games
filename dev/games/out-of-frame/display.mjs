// A logical landscape viewport keeps touch controls usable when rotation is locked.
export function setupLandscape(root, onResize = () => {}) {
  root.classList.add('landscape-root');
  const fit = () => {
    const mobile = navigator.maxTouchPoints > 0 || matchMedia('(pointer:coarse)').matches;
    const width = visualViewport?.width ?? innerWidth, height = visualViewport?.height ?? innerHeight;
    const rotated = mobile && height > width;
    document.documentElement.dataset.rotated = String(rotated);
    document.documentElement.dataset.touchLandscape = String(mobile);
    document.documentElement.style.setProperty('--play-width', `${rotated ? height : width}px`);
    document.documentElement.style.setProperty('--play-height', `${rotated ? width : height}px`);
    requestAnimationFrame(onResize);
  };
  addEventListener('resize', fit);
  visualViewport?.addEventListener('resize', fit);
  document.addEventListener('game-displaychange', () => {
    // Rebuild the rotated layer after an ancestor iframe enters the top layer.
    // Chromium can otherwise keep a stale clip while DOM bounds look correct.
    root.style.position = 'absolute';
    void root.offsetWidth;
    root.style.position = '';
    fit();
  });
  fit();
}
export function logicalPoint(element, clientX, clientY) {
  const bounds = element.getBoundingClientRect();
  return document.documentElement.dataset.rotated === 'true'
    ? { x: (clientY - bounds.top) / bounds.height * element.clientWidth, y: (bounds.right - clientX) / bounds.width * element.clientHeight }
    : { x: (clientX - bounds.left) / bounds.width * element.clientWidth, y: (clientY - bounds.top) / bounds.height * element.clientHeight };
}
