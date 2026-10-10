export function createAudio(enabled) {
  let context,
    last = 0;
  function unlock() {
    if (!enabled()) return;
    try {
      context ??= new (window.AudioContext || window.webkitAudioContext)();
      if (context.state === 'suspended') void context.resume().catch(() => {});
    } catch {
      /* Silent play is supported. */
    }
  }
  function play(type, strength = 0.5) {
    if (!enabled() || !context || context.state !== 'running') return;
    const now = context.currentTime;
    if (now - last < 0.024 && type !== 'pocket') return;
    last = now;
    const osc = context.createOscillator(),
      gain = context.createGain();
    osc.type = type === 'pocket' ? 'sine' : 'triangle';
    const hz = type === 'pocket' ? 420 : type === 'strike' ? 170 : 650 + strength * 900;
    osc.frequency.setValueAtTime(hz, now);
    osc.frequency.exponentialRampToValueAtTime(type === 'pocket' ? 180 : hz * 0.3, now + 0.1);
    gain.gain.setValueAtTime((type === 'pocket' ? 0.17 : 0.06) * (0.2 + strength), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain).connect(context.destination);
    osc.start();
    osc.stop(now + 0.15);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
  return {
    unlock,
    play,
    suspend: () => context?.suspend().catch(() => {}),
    close: () => context?.close().catch(() => {}),
  };
}
