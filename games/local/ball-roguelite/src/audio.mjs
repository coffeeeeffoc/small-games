// The caller owns permission: setActive(true) only while playing; suspend before
// menus, mute or background. unlock retries a gesture-blocked resume but never
// changes permission. Sound settings are checked again after async transitions.
export function createGlassAudio(enabled) {
  let context, master, noiseBuffer;
  let active = false,
    disposed = false;
  let lastImpact = -Infinity,
    lastBreak = -Infinity,
    lastReturn = -Infinity;
  let lastAbsorb = -Infinity,
    lastRecall = -Infinity;
  const pending = new Map(),
    voices = new Map();
  const notes = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];
  const stats = { impacts: 0, shatters: 0, returns: 0, absorbs: 0, recalls: 0, lastFrequency: 0 };
  const allowed = () => !disposed && active && !!enabled();
  function mute(value) {
    if (!master || !context) return;
    try {
      master.gain.setValueAtTime(value ? 0 : 1, context.currentTime);
    } catch {
      /* Optional audio. */
    }
  }
  function stop() {
    for (const [source, release] of [...voices]) {
      try {
        source.stop();
      } catch {
        /* Already ended. */
      }
      release();
    }
  }
  // Keep calls synchronous for gesture permission; every completion reconciles
  // current desired state, including a resume that completes after suspension.
  function transition(kind) {
    if (!context || context.state === 'closed' || pending.has(kind)) return;
    const operation = {},
      current = context;
    pending.set(kind, operation);
    let result;
    try {
      result = current[kind]();
    } catch {
      pending.delete(kind);
      return;
    }
    Promise.resolve(result).then(
      () => {
        if (pending.get(kind) === operation) pending.delete(kind);
        if (context === current) reconcile();
      },
      () => {
        if (pending.get(kind) === operation) pending.delete(kind);
        // Gesture failures retry explicitly, never in an endless Promise loop.
        if (!allowed()) {
          mute(true);
          stop();
        }
      },
    );
  }
  function reconcile(forceSuspend = false) {
    if (!context || context.state === 'closed') return;
    if (!allowed()) {
      mute(true);
      stop();
      if (disposed) transition('close');
      else if (forceSuspend || context.state === 'running') transition('suspend');
    } else {
      mute(false);
      if (context.state === 'suspended' || context.state === 'interrupted') transition('resume');
    }
  }
  function onStateChange() {
    reconcile();
  }
  function unlock() {
    if (!allowed()) {
      reconcile();
      return;
    }
    try {
      if (!context) {
        const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Audio) return;
        context = new Audio();
        master = context.createGain();
        master.gain.setValueAtTime(0, context.currentTime);
        master.connect(context.destination);
        context.addEventListener?.('statechange', onStateChange);
      }
      reconcile();
    } catch {
      /* Optional on silent or gesture-restricted hosts. */
    }
  }
  function setActive(value) {
    if (disposed) return;
    active = !!value;
    if (allowed()) unlock();
    else reconcile(true);
  }
  function attach(source, gain, start, duration, amplitude, filter = null) {
    if (!allowed() || voices.size >= 20) return false;
    const nodes = filter ? [source, filter, gain] : [source, gain];
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      voices.delete(source);
      source.onended = null;
      for (const node of nodes) {
        try {
          node.disconnect();
        } catch {
          /* Already disconnected. */
        }
      }
    };
    voices.set(source, release);
    try {
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(amplitude, start + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
      gain.connect(master);
      source.onended = release;
      source.start(start);
      source.stop(start + duration + 0.01);
      return true;
    } catch {
      try {
        source.stop();
      } catch {
        /* May not have started. */
      }
      release();
      return false;
    }
  }
  function tone(
    freq,
    duration,
    amp,
    start = context.currentTime,
    type = 'sine',
    end = freq * 0.985,
  ) {
    if (!allowed() || voices.size >= 20) return false;
    const osc = context.createOscillator(),
      gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    osc.frequency.exponentialRampToValueAtTime(end, start + duration);
    return attach(osc, gain, start, duration, amp);
  }
  function crack(now) {
    if (voices.size >= 20) return;
    if (!noiseBuffer) {
      noiseBuffer = context.createBuffer(
        1,
        Math.ceil(context.sampleRate * 0.055),
        context.sampleRate,
      );
      const data = noiseBuffer.getChannelData(0);
      let seed = 31;
      for (let i = 0; i < data.length; i++) {
        seed = (seed * 16807) % 2147483647;
        data[i] = (seed / 1073741824 - 1) * (1 - i / data.length);
      }
    }
    const source = context.createBufferSource(),
      filter = context.createBiquadFilter();
    source.buffer = noiseBuffer;
    filter.type = 'highpass';
    filter.frequency.value = 2200;
    attach(source, context.createGain(), now, 0.055, 0.03, filter);
  }
  function play(events, collisions = 0) {
    if (!allowed()) {
      reconcile();
      return;
    }
    if (!context || context.state !== 'running') return;
    const now = context.currentTime;
    try {
      const shattered = events.find((e) => e.type === 'break');
      if (shattered && now - lastBreak > 0.045 && voices.size < 20) {
        lastBreak = now;
        stats.shatters++;
        for (const [ratio, amp] of [
          [1, 0.022],
          [1.53, 0.014],
          [2.71, 0.007],
        ])
          tone(1600 * ratio, 0.17 / ratio, amp);
        crack(now);
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
      if (
        events.some((e) => e.type === 'absorb') &&
        now - lastAbsorb >= 0.09 &&
        tone(220, 0.12, 0.024, now, 'sine', 72)
      ) {
        lastAbsorb = now;
        stats.absorbs++;
      }
      if (
        events.some((e) => e.type === 'return' || e.type === 'returned') &&
        now - lastReturn >= 0.1 &&
        tone(480, 0.075, 0.013, now, 'sine', 340)
      ) {
        lastReturn = now;
        stats.returns++;
      }
      if (
        events.some((e) => e.type === 'recall') &&
        now - lastRecall >= 0.22 &&
        tone(360, 0.22, 0.032, now, 'sine', 75)
      ) {
        lastRecall = now;
        stats.recalls++;
        tone(540, 0.17, 0.009, now, 'sine', 120);
      }
    } catch {
      /* Audio failure never interrupts a turn. */
    }
  }
  return {
    setActive,
    unlock,
    play,
    stop,
    get active() {
      return allowed();
    },
    get state() {
      return context?.state || 'unavailable';
    },
    get stats() {
      return { ...stats, voices: voices.size };
    },
    suspend() {
      setActive(false);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      active = false;
      mute(true);
      stop();
      context?.removeEventListener?.('statechange', onStateChange);
      try {
        master?.disconnect();
      } catch {
        /* Already disconnected. */
      }
      noiseBuffer = null;
      reconcile();
    },
  };
}
