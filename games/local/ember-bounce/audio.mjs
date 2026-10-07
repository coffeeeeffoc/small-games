/** All sounds are synthesized here; no recorded game audio is reused. */
export function createAudio() {
  let enabled = true;
  let haptics = true;
  let interacted = false;
  let disposed = false;
  let suspended = false;
  let context = null;
  let master = null;
  let lastHit = -Infinity;
  const voices = new Set();

  function stopVoices() {
    for (const voice of voices) {
      try {
        voice.oscillator.stop();
      } catch {
        /* A finished voice needs no stop. */
      }
      try {
        voice.oscillator.disconnect();
        voice.gain.disconnect();
      } catch {
        /* Optional audio. */
      }
    }
    voices.clear();
  }

  function tone(frequency, duration, volume, delay = 0, waveform = 'sine', target = frequency) {
    if (disposed || !enabled || !context || context.state !== 'running' || !master) return;
    if (voices.size >= 24) return;
    let oscillator;
    let gain;
    let voice;
    try {
      const start = context.currentTime + delay;
      oscillator = context.createOscillator();
      gain = context.createGain();
      oscillator.type = waveform;
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, target), start + duration);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + Math.min(0.006, duration / 4));
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(master);
      voice = { oscillator, gain };
      voices.add(voice);
      oscillator.onended = () => {
        voices.delete(voice);
        try {
          oscillator.disconnect();
          gain.disconnect();
        } catch {
          /* Context may be closed. */
        }
      };
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    } catch {
      if (voice) voices.delete(voice);
      try {
        oscillator?.stop();
      } catch {
        /* It may not have started. */
      }
      try {
        oscillator?.disconnect();
        gain?.disconnect();
      } catch {
        /* Continue silently. */
      }
    }
  }

  function vibrate(type) {
    if (!haptics || !interacted || disposed) return;
    const pattern = {
      fire: 8,
      hit: 4,
      break: 9,
      pickup: 6,
      win: [12, 35, 16],
      loss: 15,
      upgrade: [6, 22, 8],
    }[type];
    if (!pattern) return;
    try {
      globalThis.navigator?.vibrate?.(pattern);
    } catch {
      /* Unsupported or rejected vibration is optional. */
    }
  }

  return {
    async unlock() {
      if (disposed) return false;
      interacted = true;
      suspended = false;
      if (!enabled) return false;
      try {
        if (!context) {
          const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
          if (!AudioContext) return false;
          context = new AudioContext();
          master = context.createGain();
          master.gain.value = 0.4;
          master.connect(context.destination);
        }
        if (context.state === 'suspended') await context.resume();
        return !disposed && enabled && context.state === 'running';
      } catch {
        return false;
      }
    },
    play(type, combo = 1) {
      if (disposed || suspended || !interacted) return;
      if (type === 'hit') {
        const now = globalThis.performance?.now?.() ?? Date.now();
        if (now - lastHit < 60) return;
        lastHit = now;
      }
      vibrate(type);
      if (!enabled) return;
      const step = Number.isFinite(combo) ? Math.max(1, Math.min(12, Math.floor(combo))) : 1;
      switch (type) {
        case 'fire':
          tone(240, 0.13, 0.16, 0, 'triangle', 520);
          break;
        case 'hit':
          tone(420 * 2 ** ((step - 1) / 16), 0.065, 0.075, 0, 'sine', 300);
          break;
        case 'break':
          tone(640, 0.13, 0.11, 0, 'triangle', 300);
          tone(960, 0.09, 0.05, 0.015, 'sine', 470);
          break;
        case 'pickup':
          [660, 880].forEach((pitch, index) => tone(pitch, 0.18, 0.09, index * 0.045));
          break;
        case 'win':
          [440, 554.37, 659.26, 880].forEach((pitch, index) =>
            tone(pitch, 0.38, 0.105, index * 0.075, 'triangle'),
          );
          break;
        case 'loss':
          tone(300, 0.35, 0.09, 0, 'triangle', 110);
          break;
        case 'upgrade':
          [523.25, 659.26, 1046.5].forEach((pitch, index) =>
            tone(pitch, 0.26, 0.085, index * 0.055),
          );
          break;
        default:
          break;
      }
    },
    setEnabled(value) {
      enabled = value === true && !disposed;
      if (!enabled) stopVoices();
      try {
        if (master) master.gain.value = enabled ? 0.4 : 0;
      } catch {
        /* Closed context. */
      }
    },
    setHaptics(value) {
      haptics = value === true && !disposed;
      if (!haptics) {
        try {
          globalThis.navigator?.vibrate?.(0);
        } catch {
          /* Optional vibration. */
        }
      }
    },
    suspend() {
      suspended = true;
      stopVoices();
      try {
        context?.suspend()?.catch(() => {});
      } catch {
        /* Already closed. */
      }
      try {
        globalThis.navigator?.vibrate?.(0);
      } catch {
        /* Optional vibration. */
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      enabled = false;
      haptics = false;
      stopVoices();
      try {
        globalThis.navigator?.vibrate?.(0);
      } catch {
        /* Optional vibration. */
      }
      try {
        master?.disconnect();
      } catch {
        /* Already disconnected. */
      }
      try {
        context?.close()?.catch(() => {});
      } catch {
        /* Already closed. */
      }
      master = null;
      context = null;
    },
  };
}
