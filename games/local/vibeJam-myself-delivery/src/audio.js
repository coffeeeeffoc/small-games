export function createAudio() {
  let context, master, motor, motorGain;
  let muted = false, paused = false, destroyed = false;
  const voices = new Set();
  const lastPlayed = new Map();
  const notes = {
    pickup: [660, 880], start: [330, 440, 660], delivery: [523, 659, 784, 1047],
    crash: [105, 65], jump: [240, 480], fail: [330, 262, 196], horn: [220, 277], ui: [520],
  };
  const resumeContext = () => {
    if (context && context.state !== 'closed') context.resume().catch(() => {});
  };
  const level = () => {
    if (!master) return;
    master.gain.setTargetAtTime(muted || paused ? 0 : 0.25, context.currentTime, 0.025);
  };
  function unlock() {
    if (destroyed) return;
    if (!context) {
      const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContext) return;
      try {
        context = new AudioContext();
        master = context.createGain();
        master.gain.value = muted || paused ? 0 : 0.25;
        master.connect(context.destination);
        motorGain = context.createGain();
        motorGain.gain.value = 0;
        motorGain.connect(master);
        motor = context.createOscillator();
        motor.type = 'triangle';
        motor.frequency.value = 55;
        motor.connect(motorGain);
        motor.start();
      } catch {
        context?.close().catch(() => {});
        context = master = motor = motorGain = undefined;
        return;
      }
    }
    if (!paused) resumeContext();
  }
  return {
    unlock,
    mute(value) { muted = Boolean(value); level(); },
    engine(speed, boosting = false) {
      if (!motor || destroyed) return;
      const amount = Math.min(1, Math.max(0, Number.isFinite(speed) ? Math.abs(speed) / 16 : 0));
      motor.frequency.setTargetAtTime(55 + amount * 68 + (boosting ? 18 : 0), context.currentTime, 0.12);
      motorGain.gain.setTargetAtTime(paused || amount < 0.01 ? 0 : 0.045 + amount * 0.07, context.currentTime, 0.1);
    },
    play(type) {
      if (!context || context.state !== 'running' || muted || paused || destroyed || voices.size > 16) return;
      const name = String(type).toLowerCase();
      const melody = notes[name];
      if (!melody) return;
      const now = context.currentTime;
      if (now - (lastPlayed.get(name) ?? -Infinity) < (name === 'crash' ? 0.3 : 0.065)) return;
      lastPlayed.set(name, now);
      const step = name === 'delivery' ? 0.105 : 0.075;
      melody.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const time = now + index * step;
        oscillator.type = name === 'crash' ? 'triangle' : 'sine';
        oscillator.frequency.setValueAtTime(frequency, time);
        oscillator.frequency.exponentialRampToValueAtTime(frequency * (name === 'jump' ? 1.3 : 0.98), time + 0.14);
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(name === 'ui' ? 0.12 : 0.2, time + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
        oscillator.connect(gain);
        gain.connect(master);
        voices.add(oscillator);
        oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(time);
        oscillator.stop(time + 0.2);
      });
    },
    suspend() {
      paused = true;
      level();
      if (context?.state === 'running') context.suspend().catch(() => {});
    },
    resume() { paused = false; level(); resumeContext(); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const voice of voices) { try { voice.stop(); } catch { /* Already stopped. */ } }
      try { motor?.stop(); } catch { /* Already stopped. */ }
      motor?.disconnect();
      motorGain?.disconnect();
      master?.disconnect();
      context?.close().catch(() => {});
      voices.clear();
    },
  };
}
