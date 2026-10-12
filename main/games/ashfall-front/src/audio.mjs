export function createAudio(enabled = true) {
  let context,
    master,
    noiseBuffer,
    voices = 0;
  async function unlock() {
    if (!enabled) return;
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio) return;
    try {
      if (!context) {
        context = new Audio();
        master = context.createGain();
        master.gain.value = 0.2;
        master.connect(context.destination);
        noiseBuffer = context.createBuffer(
          1,
          Math.floor(context.sampleRate * 0.4),
          context.sampleRate,
        );
        const samples = noiseBuffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * 0.8;
      }
      if (context.state === 'suspended') await context.resume();
    } catch {
      /* Optional audio never blocks gameplay. */
    }
  }
  function voice({
    frequency = 120,
    end = 60,
    duration = 0.1,
    gain = 0.25,
    type = 'triangle',
    noise = false,
    cutoff = 2000,
    delay = 0,
  }) {
    if (!enabled || !context || context.state !== 'running' || voices >= 18) return;
    voices++;
    const t = context.currentTime + delay;
    const source = noise ? context.createBufferSource() : context.createOscillator();
    if (noise) source.buffer = noiseBuffer;
    else {
      source.type = type;
      source.frequency.setValueAtTime(frequency, t);
      source.frequency.exponentialRampToValueAtTime(Math.max(10, end), t + duration);
    }
    const envelope = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    envelope.gain.setValueAtTime(0.001, t);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.002, gain), t + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter).connect(envelope).connect(master);
    source.onended = () => {
      voices--;
      source.disconnect();
      filter.disconnect();
      envelope.disconnect();
    };
    source.start(t);
    source.stop(t + duration + 0.01);
  }
  function play(event) {
    const type = typeof event === 'string' ? event : event.type;
    if (type === 'shoot' && event.owner !== 'enemy') {
      voice({ frequency: 110, end: 45, duration: 0.065, gain: 0.2, type: 'square', cutoff: 950 });
      voice({ noise: true, duration: 0.055, gain: 0.11, cutoff: 2600 });
    } else if (type === 'hit' && event.target === 'enemy') {
      voice({ frequency: 600, end: 190, duration: 0.045, gain: 0.07, type: 'triangle' });
    } else if (type === 'explode') {
      voice({ noise: true, duration: 0.33, gain: 0.45, cutoff: 750 });
      voice({ frequency: 95, end: 28, duration: 0.3, gain: 0.5, type: 'sine' });
    } else if (type === 'dash') {
      voice({ noise: true, duration: 0.16, gain: 0.1, cutoff: 1700 });
    } else if (type === 'hurt' || (type === 'hit' && event.target === 'player')) {
      voice({ frequency: 180, end: 60, duration: 0.18, gain: 0.23, type: 'sawtooth', cutoff: 700 });
    } else if (type === 'room-clear' || type === 'upgrade' || type === 'win') {
      [330, 440, 660].forEach((frequency, i) =>
        voice({
          frequency,
          end: frequency,
          duration: 0.23,
          gain: 0.14,
          delay: i * 0.09,
          type: 'sine',
        }),
      );
    } else if (type === 'warning') {
      voice({ frequency: 190, end: 130, duration: 0.15, gain: 0.16, type: 'sine' });
    }
  }
  return {
    unlock,
    play,
    async setEnabled(value) {
      enabled = value;
      if (enabled) await unlock();
      else await context?.suspend().catch(() => {});
    },
    suspend() {
      void context?.suspend().catch(() => {});
    },
    dispose() {
      void context?.close().catch(() => {});
    },
  };
}
