/** Keyboard is supplementary; every command also has a touch control. */
export function bindKeyboardInput({
  controls: c,
  active,
  isModalOpen,
  onPause,
  perform,
  toggleDraw,
  sound,
}) {
  const gameplayKeys = [
    'w',
    'a',
    's',
    'd',
    'arrowup',
    'arrowdown',
    'arrowleft',
    'arrowright',
    'f',
    'q',
    'e',
    'r',
    ' ',
  ];
  document.addEventListener('keydown', (event) => {
    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)
    )
      return;
    const key = event.key.toLowerCase();
    if (key === 'escape') {
      if (!isModalOpen()) {
        event.preventDefault();
        onPause();
      }
      return;
    }
    if (isModalOpen()) {
      if (gameplayKeys.includes(key)) event.preventDefault();
      return;
    }
    if (!active()) return;
    if (gameplayKeys.includes(key)) {
      event.preventDefault();
      c.keys.add(key);
    }
    if (event.repeat) return;
    if (key === ' ') {
      c.dashQueued = true;
      sound('dash');
    } else if (key === 'f') c.meleeQueued = true;
    else if (key === 'q') perform({ type: 'nova' });
    else if (key === 'e') perform({ type: 'interact' });
    else if (key === 'r') toggleDraw();
  });
  document.addEventListener('keyup', (event) => c.keys.delete(event.key.toLowerCase()));
}
