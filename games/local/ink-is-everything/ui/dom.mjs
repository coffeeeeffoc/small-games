/** DOM helpers shared by presentation modules; no game state lives here. */
export const $ = (selector) => document.querySelector(selector);
export const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const amount = (value) =>
  (Number.isFinite(Number(value)) ? Number(value) : 0).toLocaleString('zh-CN', {
    maximumFractionDigits: 1,
  });
export function setText(selector, value) {
  const element = $(selector);
  if (element.textContent !== String(value)) element.textContent = value;
}
/** Touch clicks can have detail 0 and land on a control revealed by pointerdown. */
export function isKeyboardClick(event) {
  return event.detail === 0 && !event.pointerType && !event.sourceCapabilities?.firesTouchEvents;
}
/** pointerdown also supports a second thumb; non-pointer clicks preserve keyboard access. */
export function bindPress(selector, handler) {
  const button = $(selector);
  button.addEventListener('pointerdown', (event) => {
    if (button.disabled || event.button !== 0) return;
    event.preventDefault();
    handler(event);
  });
  button.addEventListener('click', (event) => {
    if (!button.disabled && isKeyboardClick(event)) handler(event);
  });
}
