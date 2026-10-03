/** Optional synthesized feedback; storage/audio denial never interrupts play. */
export function createAudio() {
  let context,
    muted = true;
  try {
    muted = localStorage.getItem('ink-is-everything:muted') !== 'false';
  } catch {}
  const api = {
    get muted() {
      return muted;
    },
    toggle() {
      muted = !muted;
      try {
        localStorage.setItem('ink-is-everything:muted', String(muted));
      } catch {}
      api.play('pickup');
    },
    play(kind) {
      if (muted) return;
      try {
        context ||= new (window.AudioContext || window.webkitAudioContext)();
        if (context.state === 'suspended') context.resume().catch(() => {});
        const oscillator = context.createOscillator(),
          gain = context.createGain(),
          now = context.currentTime;
        const hz =
          { shot: 155, hit: 90, hurt: 66, dash: 350, pickup: 600, nova: 440, draw: 275, win: 780 }[
            kind
          ] || 290;
        oscillator.type = ['hurt', 'shot'].includes(kind) ? 'triangle' : 'sine';
        oscillator.frequency.setValueAtTime(hz, now);
        oscillator.frequency.exponentialRampToValueAtTime(
          hz * (kind === 'win' ? 1.6 : 0.55),
          now + 0.13,
        );
        gain.gain.setValueAtTime(kind === 'shot' ? 0.025 : 0.045, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(now + 0.18);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
      } catch {}
    },
  };
  return api;
}
