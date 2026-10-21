// Synthesized instruments keep the first load small; all scheduling is cosmetic.
export function createAudio(settings, environment = globalThis) {
  let ctx,
    active = false,
    lastAmbient = 0,
    lastMusic = 0,
    note = 0,
    voices = 0;
  const history = [];
  function unlock() {
    const Audio = environment.AudioContext || environment.webkitAudioContext;
    if (!Audio) return;
    ctx ??= new Audio();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  }
  function tone(hz, length = 0.12, volume = 0.025, shape = 'triangle', delay = 0) {
    if (!ctx || ctx.state !== 'running' || voices >= 12) return;
    voices++;
    const start = ctx.currentTime + delay,
      oscillator = ctx.createOscillator(),
      gain = ctx.createGain();
    oscillator.type = shape;
    oscillator.frequency.setValueAtTime(hz, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + length + 0.02);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      voices--;
    };
  }
  function event(type) {
    history.push(type);
    if (history.length > 64) history.shift();
    if (!settings().sound) return;
    const patterns = {
      switch: [392, 523],
      hold: [220, 165],
      capture: [392, 523, 784],
      lost: [220, 185, 130],
      general: [330, 440, 660, 880],
      elimination: [130, 98],
      victory: [392, 523, 659, 784],
      defeat: [294, 220, 165],
      draw: [392, 330],
      fire: [90, 60],
      hit: [140],
    };
    (patterns[type] ?? patterns.switch).forEach((hz, i) =>
      tone(
        hz,
        type === 'fire' ? 0.2 : 0.16,
        0.04,
        type === 'fire' ? 'sawtooth' : 'triangle',
        i * 0.08,
      ),
    );
  }
  function frame(now, state) {
    if (!active || !ctx || ctx.state !== 'running') return;
    if (settings().sound && now - lastAmbient > 900) {
      lastAmbient = now;
      if (state?.packets.some((p) => p.engaged || p.phase === 'siege')) {
        tone(105, 0.16, 0.025, 'sawtooth');
        tone(150, 0.08, 0.014, 'triangle', 0.1);
      } else if (state?.packets.some((p) => p.phase === 'road')) {
        tone(90, 0.11, 0.017);
        tone(110, 0.09, 0.012, 'triangle', 0.16);
      }
    }
    if (settings().music && now - lastMusic > 2200) {
      lastMusic = now;
      const hz = [196, 246.94, 293.66, 329.63, 293.66, 246.94][note++ % 6];
      tone(hz, 1.9, 0.012, 'sine');
      tone(hz / 2, 2, 0.008, 'sine');
    }
  }
  return {
    unlock,
    event,
    frame,
    resume() {
      active = true;
      lastAmbient = lastMusic = 0;
      unlock();
    },
    pause() {
      active = false;
      void ctx?.suspend().catch(() => {});
    },
    dispose() {
      active = false;
      void ctx?.close().catch(() => {});
      ctx = undefined;
    },
    snapshot: () => ({ active, state: ctx?.state ?? 'uninitialized', events: [...history] }),
  };
}
