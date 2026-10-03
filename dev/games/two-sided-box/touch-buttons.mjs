/**
 * Some WebViews suppress the next compatibility click after a cancelled canvas
 * gesture. Activate buttons from the completed touch, then consume only its
 * duplicate browser click. Mouse and keyboard activation remain native.
 */
export function installTouchButtons(document) {
  const window = document.defaultView;
  const selector = 'button, a.brand';
  let press = null;
  let activation = null;
  function down(event) {
    if (event.pointerType !== 'touch' || !event.isPrimary) return;
    const control = event.target.closest(selector);
    press =
      control && !control.disabled
        ? { control, pointerId: event.pointerId, x: event.clientX, y: event.clientY }
        : null;
  }
  function cancel(event) {
    if (press?.pointerId === event.pointerId) press = null;
  }
  function up(event) {
    if (press?.pointerId !== event.pointerId) return;
    const touched = press;
    press = null;
    const rect = touched.control.getBoundingClientRect();
    if (
      !touched.control.isConnected ||
      touched.control.disabled ||
      Math.hypot(event.clientX - touched.x, event.clientY - touched.y) > 12 ||
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      return;
    activation = { ...touched, at: performance.now() };
    touched.control.click();
  }
  function click(event) {
    const previous = activation;
    if (!event.isTrusted || !previous || performance.now() - previous.at > 500) return;
    const duplicate =
      event.pointerType === 'touch'
        ? event.pointerId === previous.pointerId
        : !event.pointerType &&
          event.detail > 0 &&
          (event.sourceCapabilities
            ? event.sourceCapabilities.firesTouchEvents
            : event.target.closest(selector) === previous.control);
    if (duplicate) {
      event.preventDefault();
      event.stopImmediatePropagation();
      activation = null;
    }
  }
  const blur = () => {
    press = null;
  };
  document.addEventListener('pointerdown', down);
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', cancel);
  document.addEventListener('click', click, true);
  window.addEventListener('blur', blur);
  return () => {
    document.removeEventListener('pointerdown', down);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', cancel);
    document.removeEventListener('click', click, true);
    window.removeEventListener('blur', blur);
    press = activation = null;
  };
}
