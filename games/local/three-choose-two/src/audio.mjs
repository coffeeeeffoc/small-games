// Original, synthesized feedback. No network assets or autoplay are required.
export function createAudio(getSettings) {
  let context, musicTimer, active = false, note = 0;
  function unlock() {
    try {
      context ??= new (globalThis.AudioContext || globalThis.webkitAudioContext)();
      if (context.state === 'suspended') void context.resume().catch(() => {});
    } catch { /* Audio is optional. */ }
  }
  function tone(frequency, start = 0, duration = .1, gain = .05, type = 'sine') {
    if (!context || context.state !== 'running') return;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const time = context.currentTime + start;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(gain, time + .012);
    envelope.gain.exponentialRampToValueAtTime(.0001, time + duration);
    oscillator.connect(envelope); envelope.connect(context.destination);
    oscillator.start(time); oscillator.stop(time + duration + .02);
  }
  function play(kind, lines = 1) {
    if (!getSettings().sound) return;
    unlock();
    if (kind === 'clear' || kind === 'win') {
      const notes = kind === 'win' ? [392, 494, 587, 784] : [440, 554, 659];
      notes.forEach((frequency, index) => tone(frequency, index * .055, .22, .048));
      if (lines > 1) tone(880, .14, .28, .035);
    } else if (kind === 'invalid') tone(180, 0, .09, .035, 'triangle');
    else if (kind === 'undo') { tone(440, 0, .09); tone(330, .06, .1); }
    else if (kind === 'discard') tone(260, 0, .11, .025, 'triangle');
    else tone(kind === 'place' ? 350 : 520, 0, .08, .035, 'triangle');
  }
  function syncMusic(playing) {
    active = playing;
    clearInterval(musicTimer); musicTimer = undefined;
    if (!playing || !getSettings().music) return;
    unlock();
    const melody = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 349.23];
    musicTimer = setInterval(() => {
      if (active && getSettings().music) tone(melody[note++ % melody.length], 0, .85, .009);
    }, 1150);
  }
  function vibrate(kind) {
    if (!getSettings().vibration || !navigator.vibrate) return;
    try { navigator.vibrate(kind === 'clear' ? [15, 30, 20] : kind === 'invalid' ? 12 : 8); } catch { /* Optional. */ }
  }
  function stop() { syncMusic(false); try { void context?.suspend(); } catch { /* Optional. */ } }
  return { unlock, play, vibrate, syncMusic, stop, destroy() { stop(); void context?.close(); } };
}
