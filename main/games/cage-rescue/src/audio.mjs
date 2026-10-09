export function createAudio(enabled = true) {
  let context;
  const voices = new Set();
  return {
    enable(value) {
      enabled = value;
      if (!value) this.suspend();
    },
    unlock() {
      if (!enabled) return;
      try {
        context ??= new (globalThis.AudioContext || globalThis.webkitAudioContext)();
        void context.resume().catch(() => {});
      } catch {
        /* Optional audio never blocks touch controls. */
      }
    },
    play(type) {
      if (!enabled || context?.state !== 'running') return;
      const notes = {
        bounce: [380],
        brick: [620],
        cage: [420, 630],
        rescue: [660, 880],
        miss: [190, 130],
        win: [440, 554, 660, 880],
      }[type] || [280];
      notes.forEach((frequency, i) => {
        const osc = context.createOscillator(),
          gain = context.createGain(),
          start = context.currentTime + i * 0.085;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.07, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
        osc.connect(gain);
        gain.connect(context.destination);
        osc.start(start);
        osc.stop(start + 0.18);
        voices.add(osc);
        osc.onended = () => {
          voices.delete(osc);
          osc.disconnect();
          gain.disconnect();
        };
      });
    },
    suspend() {
      for (const voice of voices) {
        try {
          voice.stop();
        } catch {}
      }
      if (context) void context.suspend().catch(() => {});
    },
    dispose() {
      this.suspend();
      if (context) void context.close().catch(() => {});
    },
  };
}
