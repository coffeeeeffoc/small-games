export class Sound {
  muted = false;
  context: AudioContext | null = null;
  unlock() { try { this.context ??= new AudioContext(); if (this.context.state === 'suspended') void this.context.resume().catch(() => {}); } catch { /* Audio is optional. */ } }
  play(kind: string) {
    if (this.muted || !this.context || this.context.state !== 'running') return;
    const frequencies: Record<string, number[]> = { select: [480], charge: [240], jump: [330, 480], swing: [270, 400], grip: [650, 900], release: [510, 320], land: [180], fail: [260, 160], checkpoint: [440, 550, 660], win: [440, 550, 660, 880] };
    try { (frequencies[kind] ?? []).forEach((frequency, i) => {
      const ctx = this.context!, osc = ctx.createOscillator(), gain = ctx.createGain(), at = ctx.currentTime + i * 0.065;
      osc.type = 'sine'; osc.frequency.setValueAtTime(frequency, at); osc.connect(gain); gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(0.055, at + 0.012); gain.gain.exponentialRampToValueAtTime(0.001, at + 0.14);
      osc.start(at); osc.stop(at + 0.15);
    }); } catch { /* No gameplay dependency on device audio. */ }
  }
}
