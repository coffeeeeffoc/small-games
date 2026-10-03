// Short, locally synthesized sounds: no downloads or autoplay dependency.
export class GardenAudio {
  constructor() {
    this.enabled = false;
    this.context = null;
    this.lastShot = 0;
  }
  unlock() {
    if (!this.enabled) return;
    try {
      this.context ||= new (window.AudioContext || window.webkitAudioContext)();
      this.context.resume().catch(() => {});
    } catch {
      /* Sound is optional. */
    }
  }
  toggle() {
    this.enabled = !this.enabled;
    this.unlock();
    return this.enabled;
  }
  play(type) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    if (type === 'shoot' && now - this.lastShot < 0.11) return;
    if (type === 'shoot') this.lastShot = now;
    const presets = {
      shoot: [650, 330, 0.045, 0.025, 'sine'],
      plant: [330, 780, 0.16, 0.06, 'sine'],
      explode: [120, 35, 0.3, 0.12, 'triangle'],
      hit: [150, 80, 0.12, 0.06, 'sawtooth'],
      dash: [280, 700, 0.15, 0.03, 'triangle'],
      wave: [480, 760, 0.3, 0.08, 'sine'],
      upgrade: [520, 1040, 0.4, 0.07, 'sine'],
      skill: [720, 180, 0.22, 0.06, 'triangle'],
      'growth-ready': [500, 720, 0.1, 0.025, 'sine'],
      'upgrade-ready': [620, 1240, 0.3, 0.07, 'sine'],
      reflect: [920, 620, 0.05, 0.018, 'triangle'],
    };
    const settings = presets[type];
    if (!settings) return;
    const [from, to, duration, volume, wave] = settings;
    const oscillator = this.context.createOscillator(),
      gain = this.context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(to, now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }
}
