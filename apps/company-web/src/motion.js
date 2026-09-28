const root = document.documentElement;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const toggle = document.querySelector('.motion-toggle');
const surfaces = [...document.querySelectorAll('[data-interactive]')];
let paused = false;
let frame = 0;

function resetPointer() {
  cancelAnimationFrame(frame);
  frame = 0;
  delete root.dataset.pointer;
  for (const surface of surfaces) {
    for (const property of ['--tilt-x', '--tilt-y', '--light-x', '--light-y']) {
      surface.style.removeProperty(property);
    }
  }
}

function updateMotion() {
  resetPointer();
  root.dataset.motion = !paused && !reducedMotion.matches && !document.hidden ? 'on' : 'off';
  toggle.disabled = reducedMotion.matches;
  toggle.textContent = reducedMotion.matches
    ? '已遵循系统减少动态效果设置'
    : paused
      ? '开启动效'
      : '暂停动效';
}

toggle.hidden = false;
toggle.addEventListener('click', () => {
  paused = !paused;
  updateMotion();
});
reducedMotion.addEventListener('change', updateMotion);
finePointer.addEventListener('change', resetPointer);
document.addEventListener('visibilitychange', updateMotion);
document.documentElement.addEventListener('pointerleave', resetPointer);
window.addEventListener('blur', resetPointer);
window.addEventListener('scroll', resetPointer, { passive: true });
document.addEventListener(
  'pointermove',
  (event) => {
    if (root.dataset.motion !== 'on' || !finePointer.matches || event.pointerType !== 'mouse')
      return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = 0;
      root.dataset.pointer = 'active';
      root.style.setProperty('--pointer-x', `${event.clientX}px`);
      root.style.setProperty('--pointer-y', `${event.clientY}px`);
      const active = event.target.closest('[data-interactive]');
      for (const surface of surfaces) {
        const bounds = surface.getBoundingClientRect();
        const x = (event.clientX - bounds.left) / bounds.width;
        const y = (event.clientY - bounds.top) / bounds.height;
        surface.style.setProperty('--tilt-x', `${surface === active ? (0.5 - y) * 7 : 0}deg`);
        surface.style.setProperty('--tilt-y', `${surface === active ? (x - 0.5) * 7 : 0}deg`);
        surface.style.setProperty('--light-x', `${x * 100}%`);
        surface.style.setProperty('--light-y', `${y * 100}%`);
      }
    });
  },
  { passive: true },
);
updateMotion();
