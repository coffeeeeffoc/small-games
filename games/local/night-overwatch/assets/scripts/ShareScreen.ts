/** Explicitly requested browser share entry; ordinary and native entries have no control. */
export function shareScreenControl(search: string, changed: (active: boolean) => void) {
  const values = new URLSearchParams(search).getAll('fullscreen');
  if (values.length !== 1 || values[0] !== '1' || typeof document === 'undefined' || !document.fullscreenEnabled) return;
  const update = () => changed(!!document.fullscreenElement);
  document.addEventListener('fullscreenchange', update);
  update();
  return {
    async toggle() {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    },
    dispose() { document.removeEventListener('fullscreenchange', update); },
  };
}
