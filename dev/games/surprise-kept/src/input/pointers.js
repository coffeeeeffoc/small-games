import { itemArt, $ } from '../render/view.js';
import { screenArt } from '../render/art.js';

/** One gesture, one command. Pointer capture is used only after the second finger check. */
export function bindPointers(game) {
  const root = $('game'),
    ghost = $('drag-ghost');
  let drag = null,
    suppressedPointer = null;
  function clear() {
    const previous = drag;
    drag = null;
    if (previous?.element.hasPointerCapture?.(previous.id))
      previous.element.releasePointerCapture(previous.id);
    document
      .querySelectorAll('.dragging,.drop-target')
      .forEach((e) => e.classList.remove('dragging', 'drop-target'));
    ghost.hidden = true;
    drag = null;
  }
  const cancel = () => {
    if (drag) suppressedPointer = drag.id;
    clear();
  };
  function down(e) {
    // A new physical press is a new intention, not the drag's compatibility click.
    if (e.isPrimary) suppressedPointer = null;
    if (drag && e.pointerId !== drag.id) {
      cancel();
      return;
    }
    if (!e.isPrimary || e.button !== 0 || game.phase !== 'playing' || $('modal').open) return;
    const element = e.target.closest('button');
    if (!element || element.disabled) return;
    drag = {
      id: e.pointerId,
      item: element.dataset.drag,
      element,
      x: e.clientX,
      y: e.clientY,
      moving: false,
    };
    if (element.dataset.drag) element.setPointerCapture(e.pointerId);
  }
  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.item) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 9) drag.cancelled = true;
      return;
    }
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 7 && !drag.moving) {
      drag.moving = true;
      ghost.innerHTML = drag.item === 'screen' ? screenArt() : itemArt(drag.item);
      ghost.hidden = false;
      drag.element.classList.add('dragging');
    }
    if (!drag.moving) return;
    e.preventDefault();
    ghost.style.left = e.clientX + 'px';
    ghost.style.top = e.clientY + 'px';
    document.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'));
    document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest(drag.item === 'screen' ? '[data-character]' : '[data-box]')
      ?.classList.add('drop-target');
  }
  function up(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const current = drag;
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const target = hit?.closest(current.item === 'screen' ? '[data-character]' : '[data-box]');
    clear();
    if (current.moving) {
      suppressedPointer = e.pointerId;
      if (target)
        game.act(
          current.item === 'screen'
            ? { type: 'screen', character: target.dataset.character }
            : { type: 'move', item: current.item, to: target.dataset.box },
        );
      else game.view.feedback('已放回原处，安排没有改变。');
    } else if (
      e.pointerType === 'touch' &&
      !current.cancelled &&
      hit?.closest('button') === current.element
    ) {
      // Dispatch the completed tap once. Chromium may omit a compatibility click
      // immediately after a captured drag; pointerup still represents the tap.
      suppressedPointer = e.pointerId;
      current.element.click();
    }
  }
  const stopClick = (e) => {
    if (e.isTrusted && e.pointerId === suppressedPointer) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
  root.addEventListener('pointerdown', down);
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerup', up);
  root.addEventListener('pointercancel', cancel);
  root.addEventListener('lostpointercapture', (e) => {
    if (drag?.id === e.pointerId) cancel();
  });
  root.addEventListener('click', stopClick, true);
  window.addEventListener('blur', cancel);
  document.addEventListener('visibilitychange', cancel);
  window.addEventListener('resize', cancel);
  return cancel;
}
