export class GameAudio {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.context = null;
  }
  unlock() {
    if (!this.enabled) return;
    try {
      const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Audio) return;
      this.context ||= new Audio();
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    } catch {
      /* Sound is optional; touch play remains available. */
    }
  }
  play(kind = 'tap') {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const notes = {
      tap: [640],
      move: [440, 660],
      leave: [520, 390],
      return: [390, 520],
      screen: [280, 350],
      undo: [500, 350],
      success: [523, 659, 784, 1047],
      miss: [300, 240],
    }[kind] || [580];
    notes.forEach((frequency, index) => {
      const at = this.context.currentTime + index * 0.09;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.045, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.19);
      oscillator.connect(gain);
      gain.connect(this.context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.21);
    });
  }
  suspend() {
    this.context?.suspend().catch(() => {});
  }
  dispose() {
    this.context?.close().catch(() => {});
    this.context = null;
  }
}
