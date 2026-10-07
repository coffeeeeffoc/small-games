// Native dialog semantics retain keyboard focus and download cancellation while
// the presentation treats each dialog as a single full-screen page.
const element = value => typeof value === 'string' ? document.getElementById(value) : value;
let version = 0;
export const screenVersion = () => version;

export function openScreen(value, returnTo) {
  const target = element(value);
  const current = document.querySelector('dialog[open]');
  if (current === target) return;
  version++;
  target.dataset.returnTo = returnTo ?? current?.id ?? '';
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  target.showModal();
  target.scrollTop = 0;
  document.dispatchEvent(new Event('ciyu-screenchange'));
}

export function closeScreen(value, restore = true) {
  version++;
  const target = element(value);
  const parent = target.dataset.returnTo;
  target.close();
  if (restore && parent) openScreen(parent, element(parent).dataset.returnTo || '');
  document.dispatchEvent(new Event('ciyu-screenchange'));
}

export function closeScreens() {
  version++;
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  document.dispatchEvent(new Event('ciyu-screenchange'));
}

export function setupScreens() {
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      closeScreen(dialog);
    });
    dialog.addEventListener('close', () => document.dispatchEvent(new Event('ciyu-screenchange')));
  });
}
