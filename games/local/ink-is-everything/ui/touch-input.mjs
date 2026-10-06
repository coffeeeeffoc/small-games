import { $ } from './dom.mjs';
import { clientToElement } from './display.mjs';

/** Each thumb owns its pointer ID. Cancelling one gesture cannot release another. */
export function bindTouchInput({ controls: c, active, navigation, sound, capturePointer, releasePointer }) {
  const stick = $('#joystick'),
    fire = $('#fire'),
    melee = $('#melee');
  function updateStick(event) {
    const point = clientToElement(stick, event.clientX, event.clientY),
      max = stick.clientWidth * 0.3;
    let x = point.x - stick.clientWidth / 2,
      y = point.y - stick.clientHeight / 2,
      d = Math.hypot(x, y);
    if (d > max) {
      x = (x / d) * max;
      y = (y / d) * max;
      d = max;
    }
    c.moveStick = d < 5 ? { x: 0, y: 0 } : { x: x / max, y: y / max };
    $('#stick-thumb').style.transform = `translate(${x}px,${y}px)`;
  }
  stick.addEventListener('pointerdown', (event) => {
    if (!active() || c.movePointer !== null || event.button !== 0) return;
    event.preventDefault();
    c.movePointer = event.pointerId;
    navigation.reset();
    capturePointer(stick, event.pointerId);
    updateStick(event);
  });
  stick.addEventListener('pointermove', (event) => {
    if (event.pointerId === c.movePointer) {
      event.preventDefault();
      updateStick(event);
    }
  });
  function updateFireAim(event) {
    const point = clientToElement(fire, event.clientX, event.clientY),
      x = point.x - fire.clientWidth / 2,
      y = point.y - fire.clientHeight / 2,
      d = Math.hypot(x, y);
    c.fireAim = d > 15 ? { x: x / d, y: y / d } : null;
    fire.classList.toggle('aiming', Boolean(c.fireAim));
    $('#fire .aim-thumb').style.transform = c.fireAim
      ? `translate(${c.fireAim.x * Math.min(d, 42)}px,${c.fireAim.y * Math.min(d, 42)}px)`
      : '';
  }
  fire.addEventListener('pointerdown', (event) => {
    if (!active() || c.firePointer !== null || event.button !== 0) return;
    event.preventDefault();
    c.firePointer = event.pointerId;
    c.fireHeld = true;
    c.fireQueued = true;
    fire.classList.add('held');
    capturePointer(fire, event.pointerId);
    updateFireAim(event);
  });
  fire.addEventListener('pointermove', (event) => {
    if (event.pointerId === c.firePointer) {
      event.preventDefault();
      updateFireAim(event);
    }
  });
  melee.addEventListener('pointerdown', (event) => {
    if (!active() || c.meleePointer !== null || event.button !== 0) return;
    event.preventDefault();
    c.meleePointer = event.pointerId;
    c.meleeHeld = true;
    c.meleeQueued = true;
    melee.classList.add('held');
    capturePointer(melee, event.pointerId);
  });
  function release(event, kind, element) {
    const key = `${kind}Pointer`;
    if (event.pointerId !== c[key]) return;
    c[key] = null;
    if (kind === 'move') {
      c.moveStick = { x: 0, y: 0 };
      $('#stick-thumb').style.transform = '';
    } else {
      c[`${kind}Held`] = false;
      if (event.type !== 'pointerup') c[`${kind}Queued`] = false;
      element.classList.remove('held', 'aiming');
      if (kind === 'fire') {
        c.fireAim = null;
        $('#fire .aim-thumb').style.transform = '';
      }
    }
    releasePointer(element, event.pointerId);
  }
  for (const type of ['pointerup', 'pointercancel']) {
    // Window listeners also release a finger when pointer capture is unsupported.
    window.addEventListener(type, (event) => release(event, 'move', stick));
    window.addEventListener(type, (event) => release(event, 'fire', fire));
    window.addEventListener(type, (event) => release(event, 'melee', melee));
  }
  for (const type of ['lostpointercapture']) {
    stick.addEventListener(type, (event) => release(event, 'move', stick));
    fire.addEventListener(type, (event) => release(event, 'fire', fire));
    melee.addEventListener(type, (event) => release(event, 'melee', melee));
  }
  $('#dash').addEventListener('pointerdown', (event) => {
    if (!active()) return;
    event.preventDefault();
    c.dashQueued = true;
    sound('dash');
  });
}
