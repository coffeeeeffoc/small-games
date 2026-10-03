// Enlarge the existing live board so selection, gestures and progress stay intact.
const buttons = [];
let opener, enteredFullscreen = false, sawFullscreen = false;
const expanded = () => document.body.classList.contains('map-expanded');
const fullscreenButton = () => document.querySelector('[data-game-fullscreen]');
const icon = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>';

function closeMap(restoreFocus = true) {
  document.body.classList.remove('map-expanded');
  sync();
  if (enteredFullscreen && fullscreenButton()?.getAttribute('aria-pressed') === 'true') fullscreenButton().click();
  enteredFullscreen = false;
  sawFullscreen = false;
  if (restoreFocus && opener?.isConnected) opener.focus();
}
function sync() {
  for (const button of buttons) {
    button.setAttribute('aria-label', expanded() ? '收起地图' : '放大地图');
    button.setAttribute('aria-pressed', String(expanded()));
    button.title = expanded() ? '收起地图（Esc）' : '放大地图';
  }
}
for (const frame of document.querySelectorAll('.board-frame')) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'map-expand-button';
  button.innerHTML = icon;
  button.addEventListener('click', () => {
    if (expanded()) return closeMap();
    opener = button;
    document.body.classList.add('map-expanded');
    sync();
    const control = fullscreenButton();
    sawFullscreen = control?.getAttribute('aria-pressed') === 'true';
    enteredFullscreen = control?.getAttribute('aria-pressed') === 'false';
    if (enteredFullscreen) control.click();
  });
  buttons.push(button);
  frame.append(button);
}
sync();
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && expanded() && !document.querySelector('dialog[open]')) closeMap();
});
document.addEventListener('game-displaychange', () => {
  if (!expanded()) return;
  if (fullscreenButton()?.getAttribute('aria-pressed') === 'true') sawFullscreen = true;
  else if (sawFullscreen) closeMap();
});
new MutationObserver(() => {
  if (expanded() && !document.body.classList.contains('focus-play')) closeMap(false);
}).observe(document.body, { attributes: true, attributeFilter: ['class'] });
