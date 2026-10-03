import type { Effect, GameState } from '../core/types.ts';
import { impactDelay } from './feedback.ts';
import { storage } from './platform.ts';

type Bus = 'music' | 'sfx';
const volume = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;

/** Original synthesized score and layered foley. Driven by Runtime; no extra timer/game loop. */
export class Sound {
  context: BaseAudioContext | null = null;
  output: GainNode | null = null;
  buses: Record<Bus, GainNode> | null = null;
  limiter: DynamicsCompressorNode | null = null;
  noiseBuffer: AudioBuffer | null = null;
  private silent = storage.read<boolean>('muted', false) === true;
  musicVolume = volume(storage.read('music-volume', 0.35), 0.35);
  sfxVolume = volume(storage.read('sfx-volume', 0.8), 0.8);
  lastId = 0;
  playing = false;
  beat = 0;
  nextBeat = 0;
  peakVoices = 0;
  cues = 0;
  unavailable = false;
  voices = new Set<() => void>();
  private lastHit = -1;
  private disposed = false;
  constructor(context?: BaseAudioContext) {
    if (context) this.initialize(context);
  }
  get muted() {
    return this.silent;
  }
  set muted(value: boolean) {
    this.silent = value;
    storage.write('muted', value);
    if (value) this.stopVoices();
    this.syncVolumes();
  }
  initialize(context: BaseAudioContext) {
    this.context = context;
    this.output = context.createGain();
    this.limiter = context.createDynamicsCompressor();
    this.limiter.threshold.value = -12;
    this.limiter.knee.value = 10;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.16;
    this.buses = { music: context.createGain(), sfx: context.createGain() };
    this.buses.music.connect(this.limiter);
    this.buses.sfx.connect(this.limiter);
    this.limiter.connect(this.output);
    this.output.connect(context.destination);
    this.noiseBuffer = context.createBuffer(
      1,
      Math.ceil(context.sampleRate * 0.7),
      context.sampleRate,
    );
    const data = this.noiseBuffer.getChannelData(0);
    let seed = 731;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      data[i] = (seed >>> 0) / 2147483648 - 1;
    }
    this.syncVolumes();
  }
  unlock() {
    if (this.disposed) return;
    try {
      if (!this.context) this.initialize(new AudioContext());
      if (this.context instanceof AudioContext && this.context.state === 'suspended')
        void this.context.resume().catch(() => {
          this.unavailable = true;
        });
    } catch {
      this.unavailable = true;
    }
  }
  setVolume(bus: Bus, value: number) {
    if (bus === 'music') this.musicVolume = volume(value, this.musicVolume);
    else this.sfxVolume = volume(value, this.sfxVolume);
    storage.write(`${bus}-volume`, bus === 'music' ? this.musicVolume : this.sfxVolume);
    this.syncVolumes();
  }
  syncVolumes() {
    if (!this.context || !this.buses || !this.output) return;
    const at = this.context.currentTime;
    for (const [node, value] of [
      [this.output, this.muted ? 0 : 0.75],
      [this.buses.music, this.musicVolume],
      [this.buses.sfx, this.sfxVolume],
    ] as const) {
      node.gain.cancelScheduledValues(at);
      node.gain.setTargetAtTime(value, at, 0.012);
    }
  }
  voice(
    source: AudioScheduledSourceNode,
    tail: AudioNode,
    nodes: AudioNode[],
    at: number,
    duration: number,
    level: number,
    pan: number,
    bus: Bus,
  ) {
    const ctx = this.context!;
    if (this.voices.size >= 48) this.voices.values().next().value?.();
    const gain = ctx.createGain(),
      stereo = ctx.createStereoPanner();
    stereo.pan.value = Math.max(-0.8, Math.min(0.8, pan));
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    tail.connect(gain);
    gain.connect(stereo);
    stereo.connect(this.buses![bus]);
    const clear = () => {
      if (!this.voices.delete(clear)) return;
      source.onended = null;
      try {
        source.stop();
      } catch {
        /* already ended */
      }
      for (const node of [...nodes, gain, stereo]) node.disconnect();
    };
    this.voices.add(clear);
    this.peakVoices = Math.max(this.peakVoices, this.voices.size);
    source.onended = clear;
    source.start(at);
    source.stop(at + duration + 0.015);
  }
  tone(
    hz: number,
    duration: number,
    level: number,
    at: number,
    end = hz,
    type: OscillatorType = 'triangle',
    pan = 0,
    bus: Bus = 'sfx',
  ) {
    if (!this.context || this.muted || this.disposed) return;
    const source = this.context.createOscillator();
    source.type = type;
    source.frequency.setValueAtTime(hz, at);
    source.frequency.exponentialRampToValueAtTime(Math.max(20, end), at + duration);
    this.voice(source, source, [source], at, duration, level, pan, bus);
  }
  noise(
    hz: number,
    duration: number,
    level: number,
    at: number,
    pan = 0,
    bus: Bus = 'sfx',
    highpass = false,
  ) {
    if (!this.context || this.muted || this.disposed) return;
    const source = this.context.createBufferSource(),
      filter = this.context.createBiquadFilter();
    source.buffer = this.noiseBuffer;
    filter.type = highpass ? 'highpass' : 'lowpass';
    filter.frequency.value = hz;
    filter.Q.value = 0.6;
    source.connect(filter);
    this.voice(source, filter, [source, filter], at, duration, level, pan, bus);
  }
  setPlaying(value: boolean, restart = false) {
    this.playing = value;
    this.nextBeat = this.context?.currentTime ?? 0;
    if (!value || restart) this.stopVoices();
    if (restart) {
      this.lastId = 0;
      this.beat = 0;
      this.lastHit = -1;
    }
  }
  musicStep(at: number, step: number, pressure: number) {
    const root = [73.42, 65.41, 87.31, 55][Math.floor(step / 16) % 4];
    if (step % 2 === 0) {
      this.tone(root, 0.22, 0.1, at, root, 'triangle', -0.12, 'music');
      this.tone(130, 0.16, 0.16, at, 42, 'sine', 0, 'music');
    }
    if (step % 4 === 2) this.noise(2600, 0.12, 0.07, at, 0.1, 'music');
    this.noise(6500, 0.038, 0.02 + pressure * 0.02, at, step % 2 ? -0.25 : 0.25, 'music', true);
    if (step % 4 === 0 || pressure > 0.6) {
      const note = root * [4, 6, 8, 6][step % 4];
      this.tone(note, 0.3, 0.024 + pressure * 0.012, at, note, 'sine', 0.3, 'music');
    }
    if (step % 16 === 0) {
      this.tone(root * 2, 1.6, 0.05, at, root * 2, 'sine', -0.4, 'music');
      this.tone(root * 3, 1.6, 0.025, at, root * 3, 'sine', 0.4, 'music');
    }
  }
  update(state: GameState) {
    if (!this.context || !this.playing || this.muted || !this.musicVolume) return;
    const now = this.context.currentTime;
    if (this.nextBeat < now - 0.1) this.nextBeat = now + 0.015;
    const pressure = state.enemies.some((e) => e.kind === 'boss')
      ? 1
      : state.enemies.some((e) => e.z > 0)
        ? 0.75
        : 0.25;
    while (this.nextBeat < now + 0.12) {
      this.musicStep(this.nextBeat, this.beat++, pressure);
      this.nextBeat += 60 / 116 / 2;
    }
  }
  cue(e: Effect, at = this.context?.currentTime ?? 0) {
    if (!this.context || this.muted || this.disposed) return;
    this.cues++;
    at += impactDelay(e);
    const pan = e.x / 7,
      variation = 1 + ((e.id % 5) - 2) * 0.035;
    if (e.kind === 'shot') {
      const shotgun = e.weapon === 'shotgun',
        grenade = e.weapon === 'grenade';
      this.noise(
        shotgun ? 2100 : grenade ? 550 : 3600,
        shotgun ? 0.17 : 0.065,
        shotgun ? 0.75 : 0.6,
        at,
        pan,
      );
      this.tone(
        (grenade ? 115 : shotgun ? 165 : 260) * variation,
        grenade ? 0.18 : 0.085,
        0.32,
        at,
        grenade ? 48 : 70,
        'triangle',
        pan,
      );
      if (!grenade) this.noise(6800, 0.025, 0.14, at + 0.035, pan, 'sfx', true);
    } else if (e.kind === 'hit') {
      if (e.surface === 'flesh') {
        this.noise(950, 0.085, 0.32, at, pan);
        this.tone(190 * variation, 0.06, 0.15, at, 80, 'sine', pan);
      } else {
        this.tone(e.surface === 'armor' ? 1700 : 920, 0.11, 0.18, at, 550, 'triangle', pan);
        this.noise(5800, 0.045, 0.2, at, pan, 'sfx', true);
      }
    } else if (e.kind === 'death') {
      this.tone(
        (e.enemyKind === 'boss' ? 170 : 350) * variation,
        0.22,
        0.24,
        at,
        65,
        'triangle',
        pan,
      );
      this.noise(850, 0.16, 0.27, at + 0.03, pan);
      this.tone(720 * variation, 0.095, 0.12, at + 0.055, 1200, 'sine', pan);
    } else if (e.kind === 'blast') {
      this.noise(1200, 0.42, 0.65, at, pan);
      this.tone(150, 0.36, 0.48, at, 28, 'sine', pan);
    } else if (e.kind === 'hurt') {
      this.tone(105, 0.18, 0.32, at, 38, 'triangle', pan);
      this.noise(550, 0.13, 0.25, at, pan);
    } else if (e.kind === 'reward') {
      [523.25, 659.25, 783.99, 1046.5].forEach((hz, i) =>
        this.tone(hz, 0.27, 0.17, at + i * 0.075, hz, 'sine', pan),
      );
    } else if (e.kind === 'warning') {
      [0, 0.18].forEach((delay) =>
        this.tone(e.enemyKind === 'boss' ? 560 : 740, 0.14, 0.16, at + delay, 430, 'triangle', pan),
      );
    }
    if (['warning', 'hurt', 'reward'].includes(e.kind) && this.buses) {
      const gain = this.buses.music.gain;
      gain.cancelScheduledValues(at);
      gain.setTargetAtTime(this.musicVolume * 0.35, at, 0.02);
      gain.setTargetAtTime(this.musicVolume, at + 0.4, 0.15);
    }
  }
  consume(effects: Effect[]) {
    const fresh = effects.filter((e) => e.id > this.lastId);
    if (!fresh.length) return;
    this.lastId = fresh.at(-1)!.id;
    if (!this.playing) return;
    const shots = new Set<string>();
    for (const e of fresh) {
      if (e.kind === 'shot') {
        if (shots.has(e.weapon!)) continue;
        shots.add(e.weapon!);
      } else if (e.kind === 'hit') {
        if (e.tick - this.lastHit < 2) continue;
        this.lastHit = e.tick;
      } else if (fresh.find((x) => x.kind === e.kind) !== e) continue;
      this.cue(e);
    }
  }
  ui(kind: 'start' | 'focus' | 'formation') {
    const now = this.context?.currentTime ?? 0;
    this.tone(kind === 'start' ? 330 : 480, 0.09, 0.07, now, kind === 'focus' ? 660 : 400, 'sine');
  }
  result(won: boolean) {
    this.setPlaying(false);
    const now = this.context?.currentTime ?? 0;
    (won ? [392, 523.25, 659.25, 783.99] : [220, 174.61, 146.83]).forEach((hz, i) =>
      this.tone(hz, 0.6, 0.13, now + i * 0.16, hz, 'triangle'),
    );
  }
  stopVoices() {
    for (const stop of this.voices) stop();
  }
  inspect() {
    return {
      context: this.context?.state ?? (this.unavailable ? 'unavailable' : 'locked'),
      muted: this.muted,
      music: this.musicVolume,
      sfx: this.sfxVolume,
      playing: this.playing,
      voices: this.voices.size,
      peakVoices: this.peakVoices,
      musicSteps: this.beat,
      cues: this.cues,
    };
  }
  dispose() {
    this.disposed = true;
    this.playing = false;
    this.stopVoices();
    this.buses?.music.disconnect();
    this.buses?.sfx.disconnect();
    this.limiter?.disconnect();
    this.output?.disconnect();
    if (typeof AudioContext !== 'undefined' && this.context instanceof AudioContext)
      void this.context.close().catch(() => {});
  }
}
