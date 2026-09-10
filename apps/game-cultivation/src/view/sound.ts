import type { CricketMatch } from '../domain/cricket.js';

/** Synthesized insect calls, room air and ceramic knocks; audio starts only on a gesture. */
export function createCricketSound() {
  let context: AudioContext | undefined;
  let master: GainNode;
  let ambience: ReturnType<typeof setInterval> | undefined;
  let enabled = true;
  function tone(frequency: number, duration: number, volume: number, delay = 0, end = frequency) {
    if (!context || context.state !== 'running') return;
    const t = context.currentTime + delay;
    const oscillator = context.createOscillator(),
      gain = context.createGain();
    oscillator.frequency.setValueAtTime(frequency, t);
    oscillator.frequency.exponentialRampToValueAtTime(end, t + duration);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(t);
    oscillator.stop(t + duration);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }
  return {
    async start() {
      if (typeof AudioContext === 'undefined') return false;
      try {
        if (!context) {
          context = new AudioContext();
          master = context.createGain();
          master.gain.value = enabled ? 0.4 : 0;
          master.connect(context.destination);
          const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.035;
          const air = context.createBufferSource(),
            filter = context.createBiquadFilter();
          air.buffer = buffer;
          air.loop = true;
          filter.type = 'lowpass';
          filter.frequency.value = 440;
          air.connect(filter);
          filter.connect(master);
          air.start();
          ambience = setInterval(() => {
            for (let i = 0; i < 3; i++) tone(3800 + Math.random() * 600, 0.045, 0.04, i * 0.08);
            if (Math.random() > 0.65) tone(680, 0.14, 0.025, 0.4, 470);
          }, 1700);
        }
        await context.resume();
        return context.state === 'running';
      } catch {
        return false;
      }
    },
    mute(value: boolean) {
      enabled = !value;
      if (context) master.gain.setTargetAtTime(enabled ? 0.4 : 0, context.currentTime, 0.05);
    },
    pause() {
      void context?.suspend().catch(() => undefined);
    },
    play(event: CricketMatch['event']) {
      if (event === 'hit' || event === 'hurt' || event === 'perfect') {
        tone(event === 'hurt' ? 100 : 180, 0.16, 0.5, 0, 45);
        tone(780, 0.05, 0.1);
        if (event === 'perfect') {
          tone(650, 0.15, 0.12, 0.04);
          tone(980, 0.2, 0.08, 0.1);
        }
      } else if (event === 'win' || event === 'lose') {
        (event === 'win' ? [392, 523, 659, 784] : [330, 294, 220]).forEach((f, i) =>
          tone(f, 0.5, 0.18, i * 0.12),
        );
      } else if (event === 'dodge') tone(850, 0.18, 0.15, 0, 1800);
      else tone(2400, 0.07, 0.06, 0, 800);
    },
    dispose() {
      clearInterval(ambience);
      void context?.close().catch(() => undefined);
      context = undefined;
    },
  };
}
