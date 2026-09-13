export function createAudio(enabled = true) {
  let context;
  function unlock() {
    if (!enabled) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      context ||= new Audio();
      if (context.state === "suspended") context.resume().catch(() => {});
    } catch {
      /* Audio is optional when the browser disallows it. */
    }
  }
  function note(frequency, start, duration, type = "sine", volume = 0.045) {
    if (!enabled || !context || context.state !== "running") return;
    const oscillator = context.createOscillator(),
      gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }
  function play(type) {
    if (!enabled || !context || context.state !== "running") return;
    const t = context.currentTime;
    const sounds = {
      select: [520, 690],
      order: [460, 660, 880],
      hold: [400, 320],
      invalid: [180, 145],
      capture: [660, 880, 1100],
      win: [523, 659, 784, 1047, 784, 1047],
      lose: [587, 440, 330, 196],
      start: [392, 523, 784],
      turn: [360, 270],
    };
    const notes = sounds[type] || sounds.select;
    notes.forEach((hz, i) =>
      note(
        hz,
        t + i * (type === "win" ? 0.12 : 0.055),
        type === "win" ? 0.25 : 0.12,
        "sine",
        type === "turn" ? 0.013 : 0.04,
      ),
    );
  }
  return {
    unlock,
    play,
    setEnabled(value) {
      enabled = value;
      if (enabled) unlock();
      else context?.suspend().catch(() => {});
    },
    get enabled() {
      return enabled;
    },
  };
}
