let context: AudioContext | undefined;
let ambience: GainNode | undefined;
let enabled = false;

export function setSound(on: boolean) {
  enabled = on;
  if (!on) { void context?.suspend(); return; }
  try {
    context ??= new AudioContext();
    void context.resume().catch(() => {});
    if (!ambience) {
      const length = context.sampleRate * 3;
      const noise = context.createBuffer(1, length, context.sampleRate);
      const samples = noise.getChannelData(0);
      for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;
      const rain = context.createBufferSource();
      rain.buffer = noise;
      rain.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      ambience = context.createGain();
      ambience.gain.value = 0.023;
      rain.connect(filter).connect(ambience).connect(context.destination);
      rain.start();
    }
  } catch { /* Audio is optional when the browser does not expose Web Audio. */ }
}

export function sound(kind: 'tap' | 'evidence' | 'wrong' = 'tap') {
  if (!enabled || !context || context.state !== 'running') return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(kind === 'wrong' ? 140 : kind === 'evidence' ? 660 : 360, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(kind === 'evidence' ? 990 : 180, context.currentTime + 0.12);
  gain.gain.setValueAtTime(0.055, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.22);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.23);
  if (kind === 'evidence' && navigator.vibrate) navigator.vibrate(25);
}
