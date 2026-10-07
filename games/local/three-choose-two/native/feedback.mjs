const EFFECTS = ['tap', 'place', 'clear', 'win', 'invalid', 'undo'];

// CanvasSound comes from the shared native media adapter. The original music
// is a quiet 2.5-second, 11025 Hz mono harmony loop (55 KB), with no SDK autoplay.
export function createNativeFeedback(target, sdk, getSettings) {
  let disposed = false, active = false, musicPlaying = false;
  const voices = new Map();
  function safely(run) {
    try {
      const result = run();
      result?.catch?.(() => {});
    } catch { /* Optional platform feedback never blocks a move. */ }
  }
  for (const kind of EFFECTS) safely(() => {
    const voice = target.createSound?.(`assets/audio/${kind}.wav`, { volume: .3 });
    if (voice) voices.set(kind, voice);
  });
  let music;
  safely(() => { music = target.createSound?.('assets/audio/music.wav', { loop: true, volume: .16 }); });

  function stopEffects() { for (const voice of voices.values()) safely(() => voice.stop?.()); }
  function syncMusic() {
    const shouldPlay = !disposed && active && !!getSettings().music;
    if (shouldPlay === musicPlaying) return;
    musicPlaying = shouldPlay;
    safely(() => shouldPlay ? music?.play?.() : music?.stop?.());
  }
  function setActive(value) {
    if (disposed) return;
    const wasActive = active;
    active = !!value;
    if (wasActive && !active) stopEffects();
    syncMusic();
  }
  function sound(kind) {
    if (disposed) return;
    const settings = getSettings();
    if (settings.sound) safely(() => voices.get(kind)?.play?.());
    if (active && settings.vibration && (kind === 'place' || kind === 'clear'))
      safely(() => sdk?.vibrateShort?.({ type: kind === 'clear' ? 'medium' : 'light', fail() {} }));
  }
  function settingsChanged() {
    if (disposed) return;
    if (!getSettings().sound) stopEffects();
    syncMusic();
  }
  function dispose() {
    if (disposed) return;
    active = false;
    syncMusic();
    stopEffects();
    disposed = true;
    for (const voice of voices.values()) safely(() => voice.dispose?.());
    safely(() => music?.dispose?.());
    voices.clear();music = undefined;
  }
  return { sound, setActive, settingsChanged, dispose };
}
