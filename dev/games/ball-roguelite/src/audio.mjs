// Platform audio port: event-driven glass partials, bounded voices, no background timers.
export function createGlassAudio(enabled) {
  let context,
    lastImpact = -1,
    lastBreak = -1;
  const voices = new Set(),
    notes = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];
  const stats = { impacts: 0, shatters: 0, lastFrequency: 0 };
  function unlock() {
    if (!enabled()) return;
    try {
      const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
      context ||= Audio ? new Audio() : null;
      if (context?.state === 'suspended') void context.resume().catch(() => {});
    } catch {
      /* Optional on silent hosts. */
    }
  }
  function stop() {
    for (const source of voices) {
      try {
        source.stop();
      } catch {
        /* Ended. */
      }
    }
    voices.clear();
  }
  function attach(source, gain, start, duration, amplitude) {
    if (voices.size >= 20) return;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(amplitude, start + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(gain);
    gain.connect(context.destination);
    voices.add(source);
    source.onended = () => {
      voices.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    source.start(start);
    source.stop(start + duration + 0.01);
  }
  function tone(freq, duration, amp, start = context.currentTime, type = 'sine') {
    const osc = context.createOscillator(),
      gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.985, start + duration);
    attach(osc, gain, start, duration, amp);
  }
  function play(events, collisions = 0) {
    if (!context || context.state !== 'running' || !enabled()) return;
    const now = context.currentTime;
    try {
      const shattered = events.find((e) => e.type === 'break');
      if (shattered && now - lastBreak > 0.045) {
        lastBreak = now;
        stats.shatters++;
        // Inharmonic glass partials + a short high-pass crack: destruction never
        // shares the ordinary impact throttle, so a simultaneous hit cannot swallow it.
        for (const [ratio, amp] of [
          [1, 0.022],
          [1.53, 0.014],
          [2.71, 0.007],
        ])
          tone(1600 * ratio, 0.17 / ratio, amp);
        const buffer = context.createBuffer(
            1,
            Math.ceil(context.sampleRate * 0.055),
            context.sampleRate,
          ),
          data = buffer.getChannelData(0);
        let seed = 31;
        for (let i = 0; i < data.length; i++) {
          seed = (seed * 16807) % 2147483647;
          data[i] = (seed / 1073741824 - 1) * (1 - i / data.length);
        }
        const source = context.createBufferSource(),
          filter = context.createBiquadFilter(),
          gain = context.createGain();
        source.buffer = buffer;
        filter.type = 'highpass';
        filter.frequency.value = 2200;
        source.connect(filter);
        filter.connect(gain);
        gain.connect(context.destination);
        gain.gain.value = 0.03;
        voices.add(source);
        source.onended = () => {
          voices.delete(source);
          source.disconnect();
          filter.disconnect();
          gain.disconnect();
        };
        source.start();
        source.stop(now + 0.06);
      }
      const impact =
        events.find((e) => e.type === 'bounce' && e.kind !== 'wall') ||
        events.find((e) => e.type === 'hit' || e.type === 'bounce');
      if (impact && now - lastImpact > 0.045 && voices.size < 14) {
        lastImpact = now;
        const count = impact.collisionCount ?? collisions;
        const frequency =
          notes[count % notes.length] * (1 + Math.min(3, Math.floor(count / 16)) * 0.08);
        stats.impacts++;
        stats.lastFrequency = frequency;
        tone(frequency, 0.15, 0.028);
        tone(frequency * 2.76, 0.065, 0.008);
      }
      if (events.some((e) => e.type === 'launch' && e.accent) && voices.size < 14)
        tone(190, 0.055, 0.018);
      if (events.some((e) => e.type === 'pickup')) {
        tone(1320, 0.12, 0.025);
        tone(1760, 0.15, 0.018, now + 0.04);
      }
      if (events.some((e) => ['upgrade', 'won', 'reward'].includes(e.type)))
        [660, 880, 1320].forEach((n, i) => tone(n, 0.22, 0.024, now + i * 0.045));
    } catch {
      /* Audio failure never interrupts a turn. */
    }
  }
  return {
    unlock,
    play,
    stop,
    get state() {
      return context?.state || 'unavailable';
    },
    get stats() {
      return { ...stats, voices: voices.size };
    },
    suspend() {
      stop();
      void context?.suspend().catch(() => {});
    },
    dispose() {
      stop();
      void context?.close().catch(() => {});
    },
  };
}
