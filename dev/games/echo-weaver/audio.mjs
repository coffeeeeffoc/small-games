/** Original, synthesized feedback only. The puzzle clock never depends on audio. */
export function createAudio() {
  let enabled = false;
  let context = null;
  let master = null;
  let disposed = false;
  const voices = new Set();

  function stopVoices() {
    for (const voice of voices) {
      try {
        voice.oscillator.stop();
      } catch {
        /* Already stopped. */
      }
      try {
        voice.oscillator.disconnect();
      } catch {
        /* Optional audio is best effort. */
      }
      try {
        voice.gain.disconnect();
      } catch {
        /* Optional audio is best effort. */
      }
    }
    voices.clear();
  }

  function pluck(frequency, duration, volume, delay = 0, type = 'sine') {
    if (!enabled || disposed || !context || context.state !== 'running' || !master) return;
    let oscillator;
    let gain;
    let voice;
    try {
      const start = context.currentTime + delay;
      oscillator = context.createOscillator();
      gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.997, start + duration);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + 0.008);
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
      oscillator.stop(start + duration + 0.025);
    } catch {
      if (voice) voices.delete(voice);
      try {
        oscillator?.stop();
      } catch {
        /* The voice may not have started. */
      }
      try {
        oscillator?.disconnect();
        gain?.disconnect();
      } catch {
        /* Device may be unavailable. */
      }
    }
  }

  return {
    setEnabled(value) {
      enabled = value === true && !disposed;
      if (!enabled) stopVoices();
    },
    async unlock() {
      if (!enabled || disposed) return false;
      try {
        if (!context) {
          const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
          if (!AudioContext) return false;
          context = new AudioContext();
          master = context.createGain();
          master.gain.value = 0.45;
          master.connect(context.destination);
        }
        if (context.state === 'suspended') await context.resume();
        return !disposed && enabled && context.state === 'running';
      } catch {
        return false;
      }
    },
    tone(kind, index = 0) {
      if (!enabled || disposed) return;
      const pitchIndex = Number.isFinite(index) ? Math.max(0, Math.min(2, Math.floor(index))) : 0;
      switch (kind) {
        case 'emit':
          pluck(196, 0.24, 0.28, 0, 'triangle');
          pluck(392, 0.36, 0.08);
          break;
        case 'tick':
          pluck(784, 0.055, 0.065);
          break;
        case 'echo':
          pluck([392, 493.88, 587.33][pitchIndex], 0.32, 0.26);
          break;
        case 'success':
          [392, 493.88, 587.33, 783.99].forEach((frequency, note) =>
            pluck(frequency, 0.55, 0.12, note * 0.085),
          );
          break;
        case 'fail':
          pluck(164.81, 0.24, 0.11);
          break;
        case 'control':
        default:
          pluck(523.25, 0.07, 0.07);
      }
    },
    suspend() {
      stopVoices();
      try {
        const suspended = context?.suspend();
        suspended?.catch(() => {});
      } catch {
        /* Unsupported/closed contexts are equivalent to silent mode. */
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      enabled = false;
      stopVoices();
      try {
        master?.disconnect();
      } catch {
        /* Context may already be closed. */
      }
      try {
        const closed = context?.close();
        closed?.catch(() => {});
      } catch {
        /* Audio shutdown must never affect gameplay. */
      }
      master = null;
    },
  };
}
