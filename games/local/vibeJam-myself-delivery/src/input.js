export function createInput({ stick, knob, boost, brake, jump, onAction, onPause, onMap, canvas, onOrbit }) {
  const keys = new Set();
  const held = { boost: new Set(), brake: new Set(), jump: new Set() };
  const captures = new Map();
  const listeners = [];
  let stickId = null, orbitId = null, centerX = 0, centerY = 0;
  let x = 0, y = 0, orbitX = 0, orbitY = 0, jumpPending = false;
  const radius = 40;
  const listen = (element, type, handler) => {
    if (!element) return;
    element.addEventListener(type, handler);
    listeners.push(() => element.removeEventListener(type, handler));
  };
  const capture = (element, event) => {
    event.preventDefault();
    captures.set(event.pointerId, element);
    try { element.setPointerCapture(event.pointerId); } catch { /* Detached pointer. */ }
  };
  const release = (id) => {
    const element = captures.get(id);
    captures.delete(id);
    try { if (element?.hasPointerCapture(id)) element.releasePointerCapture(id); } catch { /* Already released. */ }
  };
  const moveStick = (event) => {
    if (event.pointerId !== stickId) return;
    const dx = event.clientX - centerX, dy = event.clientY - centerY;
    const distance = Math.hypot(dx, dy);
    const scale = distance > radius ? radius / distance : 1;
    x = dx * scale / radius;
    y = dy * scale / radius;
    if (knob) knob.style.transform = `translate(${x * radius}px, ${y * radius}px)`;
  };
  const endStick = (event) => {
    if (event.pointerId !== stickId) return;
    stickId = null;
    x = y = 0;
    if (knob) knob.style.transform = 'translate(0px, 0px)';
    release(event.pointerId);
  };
  listen(stick, 'pointerdown', (event) => {
    if (stickId !== null || event.button !== 0) return;
    const rect = stick.getBoundingClientRect();
    centerX = rect.left + rect.width / 2;
    centerY = rect.top + rect.height / 2;
    stickId = event.pointerId;
    capture(stick, event);
    moveStick(event);
  });
  listen(stick, 'pointermove', moveStick);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(stick, type, endStick);

  for (const [name, element] of Object.entries({ boost, brake, jump })) {
    listen(element, 'pointerdown', (event) => {
      if (event.button !== 0) return;
      capture(element, event);
      held[name].add(event.pointerId);
      element.classList.add('is-held');
      if (name === 'jump') jumpPending = true;
    });
    const end = (event) => {
      held[name].delete(event.pointerId);
      element.classList.toggle('is-held', held[name].size > 0);
      release(event.pointerId);
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(element, type, end);
  }

  if (onOrbit) {
    listen(canvas, 'pointerdown', (event) => {
      if (orbitId !== null || event.button !== 0) return;
      orbitId = event.pointerId;
      orbitX = event.clientX;
      orbitY = event.clientY;
      capture(canvas, event);
    });
    listen(canvas, 'pointermove', (event) => {
      if (event.pointerId !== orbitId) return;
      onOrbit(event.clientX - orbitX, event.clientY - orbitY);
      orbitX = event.clientX;
      orbitY = event.clientY;
    });
    const end = (event) => {
      if (event.pointerId !== orbitId) return;
      orbitId = null;
      release(event.pointerId);
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(canvas, type, end);
  }

  const controls = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyE', 'Escape', 'KeyP', 'KeyM']);
  listen(window, 'keydown', (event) => {
    if (event.target?.closest?.('input, textarea, select, [contenteditable="true"]') || !controls.has(event.code)) return;
    if (event.code === 'Space' && event.target?.closest?.('button')) return;
    event.preventDefault();
    keys.add(event.code);
    if (event.repeat) return;
    if (event.code === 'Space') jumpPending = true;
    if (event.code === 'KeyE') onAction?.();
    if (event.code === 'KeyM') onMap?.();
    if (event.code === 'Escape' || event.code === 'KeyP') { reset(); onPause?.(); }
  });
  listen(window, 'keyup', (event) => keys.delete(event.code));
  listen(window, 'blur', reset);
  for (const element of [stick, boost, brake, jump, canvas]) listen(element, 'contextmenu', (event) => event.preventDefault());

  function reset() {
    keys.clear();
    stickId = orbitId = null;
    x = y = 0;
    jumpPending = false;
    for (const group of Object.values(held)) group.clear();
    for (const element of [boost, brake, jump]) element?.classList.remove('is-held');
    if (knob) knob.style.transform = 'translate(0px, 0px)';
    for (const id of [...captures.keys()]) release(id);
  }

  return {
    read() {
      const magnitude = Math.hypot(x, y);
      const deadzoneScale = magnitude > 0.1 ? (magnitude - 0.1) / (0.9 * magnitude) : 0;
      const clamp = (value) => Math.max(-1, Math.min(1, value));
      const result = {
        steer: clamp(x * deadzoneScale + Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'))),
        throttle: clamp(-y * deadzoneScale + Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'))),
        boost: held.boost.size > 0 || keys.has('ShiftLeft') || keys.has('ShiftRight'),
        brake: held.brake.size > 0,
        jump: jumpPending,
      };
      jumpPending = false;
      return result;
    },
    reset,
    destroy() { reset(); for (const remove of listeners) remove(); },
  };
}
