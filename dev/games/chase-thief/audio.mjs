// Original synthesized cues: no audio downloads or channel SDK dependencies.
export function createAudio() {
  let context;
  let enabled = true;
  const voices = new Set();
  function unlock() {
    if (!enabled) return;
    try {
      const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Audio) return;
      context ||= new Audio();
      void context.resume().catch(() => {});
    } catch {
      /* Sound is optional. */
    }
  }
  function note(frequency, offset, duration = 0.1, type = 'sine', volume = 0.055) {
    if (!enabled || !context || context.state !== 'running') return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const at = context.currentTime + offset;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
    oscillator.connect(gain).connect(context.destination);
    voices.add(oscillator);
    oscillator.onended = () => {
      voices.delete(oscillator);
      gain.disconnect();
    };
    oscillator.start(at);
    oscillator.stop(at + duration + 0.015);
  }
  function play(type) {
    if (type === 'jump') {
      note(370, 0, 0.12);
      note(540, 0.07, 0.12);
    } else if (type === 'slide') {
      note(230, 0, 0.13, 'triangle');
      note(140, 0.06, 0.14, 'triangle');
    } else if (type === 'switch') note(280, 0, 0.06, 'triangle', 0.025);
    else if (type === 'success') {
      note(610, 0, 0.08);
      note(760, 0.06, 0.12);
    } else if (type === 'boost')
      [392, 494, 587, 784].forEach((f, i) => note(f, i * 0.08, 0.19, 'triangle', 0.06));
    else if (type === 'collision') {
      note(140, 0, 0.2, 'sawtooth', 0.035);
      note(85, 0.1, 0.22, 'triangle');
    } else if (type === 'win')
      [523, 659, 784, 1047].forEach((f, i) => note(f, i * 0.12, 0.25, 'triangle', 0.06));
    else if (type === 'lose')
      [330, 277, 220].forEach((f, i) => note(f, i * 0.15, 0.23, 'triangle', 0.04));
  }
  function stop() {
    for (const voice of voices)
      try {
        voice.stop();
      } catch {
        /* Already ended. */
      }
    voices.clear();
  }
  return {
    unlock,
    play,
    stop,
    setEnabled(value) {
      enabled = Boolean(value);
      if (!enabled) stop();
    },
    destroy() {
      stop();
      void context?.close().catch(() => {});
    },
  };
}
