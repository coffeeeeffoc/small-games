// One pointer path for mouse, pen and touch. Rules remain in the caller.
export function installDrag(root, { enabled, accepts, drop }) {
  let drag = null;
  let suppress = null;
  const targetAt = (x, y) => {
    const element = document.elementFromPoint(x, y)?.closest('[data-drop-zone], [data-drag-zone], [data-action="slot"], .map-stage');
    if (!element) return null;
    return { zone: element.dataset.dropZone || element.dataset.dragZone || (element.dataset.action === 'slot' ? 'board' : 'map'), uid: element.dataset.uid,
      slot: element.dataset.slot === undefined ? undefined : Number(element.dataset.slot), element };
  };
  const clean = () => {
    if (!drag) return;
    const old = drag;
    drag = null;
    old.ghost?.remove();
    old.element.classList.remove('drag-source');
    old.hover?.classList.remove('drop-ready', 'drop-denied');
    root.querySelector('.map-game')?.classList.remove('dragging');
    if (old.element.hasPointerCapture?.(old.id)) old.element.releasePointerCapture(old.id);
    return old;
  };
  const cancel = () => {
    const old = clean();
    if (old?.active) suppress = { until: performance.now() + 500, x: old.x, y: old.y };
  };
  root.addEventListener('pointerdown', event => {
    if (!enabled() || event.button !== 0 || event.isPrimary === false) return;
    const element = event.target.closest('[data-drag-zone]');
    if (!element || element.disabled || !element.dataset.uid) return;
    if (drag) cancel();
    drag = { element, id: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY,
      source: { zone: element.dataset.dragZone, uid: element.dataset.uid, slot: Number(element.dataset.slot) } };
    element.setPointerCapture(event.pointerId);
  });
  root.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    drag.x = event.clientX; drag.y = event.clientY;
    if (!drag.active && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < 8) return;
    event.preventDefault();
    if (!drag.active) {
      drag.active = true;
      drag.ghost = drag.element.cloneNode(true);
      drag.ghost.classList.add('drag-ghost');
      const box = drag.element.getBoundingClientRect();
      const width = Math.min(110, box.width);
      drag.ghost.style.width = `${width}px`;
      drag.ghost.style.height = `${box.height * width / box.width}px`;
      drag.ghost.removeAttribute('id');
      drag.ghost.setAttribute('aria-hidden', 'true');
      drag.ghost.tabIndex = -1;
      root.querySelector('.map-game').append(drag.ghost);
      drag.element.classList.add('drag-source');
      root.querySelector('.map-game').classList.add('dragging');
    }
    drag.ghost.style.left = `${drag.x}px`;
    drag.ghost.style.top = `${drag.y}px`;
    const target = targetAt(drag.x, drag.y);
    drag.hover?.classList.remove('drop-ready', 'drop-denied');
    drag.hover = target?.element;
    if (target) drag.hover.classList.add(accepts(drag.source, target) ? 'drop-ready' : 'drop-denied');
  }, { passive: false });
  root.addEventListener('pointerup', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const target = targetAt(event.clientX, event.clientY);
    const old = clean();
    if (!old.active) return;
    event.preventDefault();
    suppress = { until: performance.now() + 500, x: event.clientX, y: event.clientY };
    if (enabled()) drop(old.source, target);
  });
  root.addEventListener('pointercancel', cancel);
  root.addEventListener('lostpointercapture', event => { if (drag?.id === event.pointerId) cancel(); });
  document.addEventListener('click', event => {
    if (suppress && performance.now() < suppress.until && Math.hypot(event.clientX - suppress.x, event.clientY - suppress.y) < 10) {
      event.preventDefault(); event.stopImmediatePropagation(); suppress = null;
    }
  }, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') cancel(); });
  window.addEventListener('blur', cancel);
  window.addEventListener('resize', cancel);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
  return { cancel };
}
