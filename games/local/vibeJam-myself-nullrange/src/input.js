export function createInput({
  joystick, stick, fire, boost, onAction = () => {}, onPause = () => {},
  onView = () => {}, isPlaying = () => true,
}) {
  const state = { x: 0, y: 0, fire: false, boost: false };
  const keys = new Set();
  const pointers = new Map();
  const listeners = [];
  const movementKeys = new Set([
    'KeyA', 'KeyD', 'KeyW', 'KeyS', 'ArrowLeft', 'ArrowRight',
    'ArrowUp', 'ArrowDown', 'Space', 'ShiftLeft', 'ShiftRight',
  ]);
  let axisX = 0;
  let axisY = 0;
  let joystickPointer = null;

  function listen(element, event, callback) {
    element.addEventListener(event, callback);
    listeners.push(() => element.removeEventListener(event, callback));
  }

  function sync() {
    const held = (...codes) => codes.some(code => keys.has(code));
    const kinds = new Set([...pointers.values()].map(pointer => pointer.kind));
    const x = axisX + Number(held('KeyD', 'ArrowRight')) - Number(held('KeyA', 'ArrowLeft'));
    const y = axisY + Number(held('KeyS', 'ArrowDown')) - Number(held('KeyW', 'ArrowUp'));
    const length = Math.max(1, Math.hypot(x, y));
    state.x = x / length;
    state.y = y / length;
    state.fire = kinds.has('fire') || held('Space');
    state.boost = kinds.has('boost') || held('ShiftLeft', 'ShiftRight');
    joystick.classList.toggle('active', joystickPointer !== null);
    fire.classList.toggle('active', state.fire);
    boost.classList.toggle('active', state.boost);
  }

  function moveStick(event) {
    const bounds = joystick.getBoundingClientRect();
    const radius = Math.max(1, (Math.min(bounds.width, bounds.height)
      - Math.max(stick.offsetWidth, stick.offsetHeight)) / 2);
    const dx = event.clientX - (bounds.left + bounds.width / 2);
    const dy = event.clientY - (bounds.top + bounds.height / 2);
    const distance = Math.hypot(dx, dy);
    const scale = distance > radius ? radius / distance : 1;
    stick.style.translate = `${dx * scale}px ${dy * scale}px`;
    const magnitude = Math.max(0, (Math.min(1, distance / radius) - 0.09) / 0.91);
    axisX = distance ? dx / distance * magnitude : 0;
    axisY = distance ? dy / distance * magnitude : 0;
    sync();
  }

  function releaseCapture(element, pointerId) {
    // The browser may already have released capture on cancellation or removal.
    if (element.hasPointerCapture(pointerId)) {
      try { element.releasePointerCapture(pointerId); } catch { /* Capture expired. */ }
    }
  }

  function endPointer(event) {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    pointers.delete(event.pointerId);
    if (event.pointerId === joystickPointer) {
      joystickPointer = null;
      axisX = axisY = 0;
      stick.style.translate = '0px 0px';
    }
    sync();
    releaseCapture(pointer.element, event.pointerId);
  }

  for (const [element, kind] of [[joystick, 'joystick'], [fire, 'fire'], [boost, 'boost']]) {
    listen(element, 'contextmenu', event => event.preventDefault());
    listen(element, 'pointerdown', event => {
      if (!isPlaying() || event.button !== 0) return;
      if (kind === 'joystick' && joystickPointer !== null) return;
      event.preventDefault();
      pointers.set(event.pointerId, { element, kind });
      if (kind === 'joystick') joystickPointer = event.pointerId;
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        endPointer(event);
        return;
      }
      if (kind === 'joystick') moveStick(event);
      else sync();
    });
    listen(element, 'pointerup', endPointer);
    listen(element, 'pointercancel', endPointer);
    listen(element, 'lostpointercapture', endPointer);
  }

  listen(joystick, 'pointermove', event => {
    if (event.pointerId !== joystickPointer) return;
    if (!isPlaying()) {
      endPointer(event);
      return;
    }
    event.preventDefault();
    moveStick(event);
  });

  function isInteractive(event) {
    return event.target instanceof Element && event.target.closest(
      'input, textarea, select, button, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
    );
  }

  listen(window, 'keydown', event => {
    if (isInteractive(event) || event.ctrlKey || event.metaKey || event.altKey) return;
    const pauseKey = event.code === 'Escape' || event.code === 'KeyP';
    if (pauseKey) {
      event.preventDefault();
      if (!event.repeat) onPause();
      return;
    }
    if (!isPlaying()) return;
    if (movementKeys.has(event.code)) {
      event.preventDefault();
      keys.add(event.code);
      sync();
      return;
    }
    if (!['KeyQ', 'KeyE', 'KeyV'].includes(event.code)) return;
    event.preventDefault();
    if (event.repeat) return;
    if (event.code === 'KeyV') onView();
    else onAction(event.code === 'KeyQ' ? 'scan' : 'missile');
  });

  listen(window, 'keyup', event => {
    if (!movementKeys.has(event.code)) return;
    if (keys.delete(event.code)) sync();
    if (isPlaying() && !isInteractive(event)
      && !event.ctrlKey && !event.metaKey && !event.altKey) event.preventDefault();
  });

  function reset() {
    const captured = [...pointers.entries()];
    pointers.clear();
    keys.clear();
    joystickPointer = null;
    axisX = axisY = 0;
    stick.style.translate = '0px 0px';
    sync();
    for (const [pointerId, { element }] of captured) releaseCapture(element, pointerId);
  }

  listen(window, 'blur', reset);
  listen(document, 'visibilitychange', () => { if (document.hidden) reset(); });
  reset();
  return {
    state,
    reset,
    destroy() {
      reset();
      for (const remove of listeners) remove();
    },
  };
}
