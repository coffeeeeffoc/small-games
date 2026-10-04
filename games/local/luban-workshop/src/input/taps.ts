/** Activate touch buttons on release. Some browsers suppress the compatibility
 * click immediately after a captured 3D drag; pointer events still arrive.
 * Mouse/keyboard activation stays native, and the later touch click is deduped.
 */
export function bindTouchButtons(root: HTMLElement): () => void {
  const controller = new AbortController();
  const options = { signal: controller.signal };
  const touches = new Set<number>();
  const candidates = new Map<number, { button: HTMLButtonElement; x: number; y: number }>();
  let releasedAt = -Infinity;
  let nativeLink: Element | null = null;
  const buttonAt = (target: EventTarget | null) =>
    target instanceof Element ? target.closest<HTMLButtonElement>('button') : null;
  root.addEventListener(
    'pointerdown',
    (event) => {
      releasedAt = -Infinity;
      nativeLink = null;
      if (event.pointerType !== 'touch') return;
      touches.add(event.pointerId);
      if (touches.size > 1) {
        candidates.clear();
        return;
      }
      nativeLink = event.target instanceof Element ? event.target.closest('a[href]') : null;
      const button = buttonAt(event.target);
      if (button && !button.disabled && !button.closest('#stage')) {
        candidates.set(event.pointerId, { button, x: event.clientX, y: event.clientY });
      }
    },
    options,
  );
  root.addEventListener(
    'pointermove',
    (event) => {
      const tap = candidates.get(event.pointerId);
      if (tap && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 10)
        candidates.delete(event.pointerId);
    },
    options,
  );
  root.addEventListener(
    'pointerup',
    (event) => {
      // Every touch release is handled by a pointer owner, including a stage
      // drag that just mounted a completion button beneath the finger. Never
      // let the browser's later compatibility click activate that new button.
      if (event.pointerType === 'touch') releasedAt = performance.now();
      const tap = candidates.get(event.pointerId);
      candidates.delete(event.pointerId);
      touches.delete(event.pointerId);
      if (!tap || tap.button.disabled || !tap.button.isConnected) return;
      if (buttonAt(document.elementFromPoint(event.clientX, event.clientY)) !== tap.button) return;
      tap.button.click();
    },
    options,
  );
  root.addEventListener(
    'pointercancel',
    (event) => {
      if (event.pointerType === 'touch') releasedAt = performance.now();
      nativeLink = null;
      candidates.delete(event.pointerId);
      touches.delete(event.pointerId);
    },
    options,
  );
  root.addEventListener(
    'click',
    (event) => {
      if (
        event.isTrusted &&
        !(
          nativeLink &&
          event.target instanceof Element &&
          event.target.closest('a[href]') === nativeLink
        ) &&
        ((event as PointerEvent).pointerType === 'touch' || event.detail > 0) &&
        performance.now() - releasedAt < 1000
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    { ...options, capture: true },
  );
  const clear = () => {
    candidates.clear();
    touches.clear();
    nativeLink = null;
  };
  window.addEventListener('blur', clear, options);
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) clear();
    },
    options,
  );
  return () => {
    controller.abort();
    clear();
  };
}
