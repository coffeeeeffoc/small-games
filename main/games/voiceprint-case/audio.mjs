import { seededRandom } from './levels.mjs';

export const MIX_RMS = 0.1;
export const OUTPUT_CEILING = 0.72;
export const MAX_VOLUME = 0.8;

export function stats(samples) {
  let sum = 0;
  let peak = 0;
  for (const value of samples) {
    sum += value * value;
    peak = Math.max(peak, Math.abs(value));
  }
  return { rms: Math.sqrt(sum / Math.max(1, samples.length)), peak };
}

// Procedural ambience, not a downloaded recording. No intelligible background
// speech, sudden transients or pitch changes to the target voice are introduced.
export function makeNoise(length, sampleRate, level) {
  const random = seededRandom(level.noiseSeed);
  const result = new Float32Array(length);
  const lowAlpha = 1 - Math.exp((-2 * Math.PI * 220) / sampleRate);
  const slowAlpha = 1 - Math.exp((-2 * Math.PI * 18) / sampleRate);
  const wideAlpha = 1 - Math.exp((-2 * Math.PI * 2400) / sampleRate);
  let low = 0;
  let slow = 0;
  let wide = 0;
  for (let i = 0; i < length; i++) {
    const time = i / sampleRate;
    const white = random() * 2 - 1;
    // Fixed-Hz filters keep ambience in the speech band even on 192kHz devices.
    low += (white - low) * lowAlpha;
    slow += (white - slow) * slowAlpha;
    wide += (white - wide) * wideAlpha;
    const swell = 0.7 + 0.3 * Math.sin(time * 2.1 + 1.3) ** 2;
    let value = level.texture === 'rain' ? wide * 0.3 + low : low * 3;
    if (level.texture === 'traffic') value = (low * 2 + slow * 6) * swell;
    if (level.texture === 'vent') value += 0.06 * Math.sin(2 * Math.PI * 93 * time);
    if (level.complexity >= 2) value += 0.15 * wide * swell + 0.05 * Math.sin(time * 441);
    if (level.complexity >= 3)
      value += (wide - low) * 0.2 * (0.4 + 0.6 * Math.sin(time * 8.3) ** 2) + slow * 2;
    const fade = Math.min(1, i / (sampleRate * 0.04), (length - 1 - i) / (sampleRate * 0.08));
    result[i] = value * fade;
  }
  const rms = stats(result).rms;
  for (let i = 0; i < length; i++) result[i] /= rms || 1;
  return result;
}

export function planMix(samples, sampleRate, level = null) {
  const sourceRms = stats(samples).rms;
  if (!Number.isFinite(sourceRms) || sourceRms < 0.0001)
    throw new Error('语音素材为空或接近静音，请重新加载。');
  const noise = level ? makeNoise(samples.length, sampleRate, level) : null;
  const ratio = level ? 10 ** (-level.snrDb / 20) : 0;
  let voiceGain = MIX_RMS / sourceRms / Math.sqrt(1 + ratio * ratio);
  let noiseGain = (MIX_RMS * ratio) / Math.sqrt(1 + ratio * ratio);
  // Correct finite-buffer covariance so increasing noise does not increase RMS.
  let energy = 0;
  for (let i = 0; i < samples.length; i++) {
    const mixed = samples[i] * voiceGain + (noise?.[i] || 0) * noiseGain;
    energy += mixed * mixed;
  }
  const correction = MIX_RMS / Math.sqrt(energy / samples.length);
  voiceGain *= correction;
  noiseGain *= correction;
  return { noise, voiceGain, noiseGain, sourceRms, snrDb: level?.snrDb ?? null };
}

export function softLimit(value) {
  return OUTPUT_CEILING * Math.tanh(value / OUTPUT_CEILING);
}

export class AudioPlayer {
  constructor(onChange = () => {}) {
    this.onChange = onChange;
    this.context = null;
    this.volume = 0.45;
    this.cache = new Map();
    this.nodes = [];
    this.token = 0;
    this.active = null;
  }

  // Must be called synchronously from the start/play gesture, before fetch awaits.
  unlock() {
    if (!this.context || this.context.state === 'closed') {
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextClass) throw new Error('此浏览器不支持 Web Audio，请使用新版浏览器。');
      this.context = new AudioContextClass();
      this.limiter = this.context.createWaveShaper();
      const curve = new Float32Array(8193);
      for (let i = 0; i < curve.length; i++) curve[i] = softLimit((i * 2) / (curve.length - 1) - 1);
      this.limiter.curve = curve;
      this.master = this.context.createGain();
      this.master.gain.value = this.volume;
      this.limiter.connect(this.master).connect(this.context.destination);
    }
    return this.context.resume();
  }

  setVolume(volume) {
    this.volume = Math.min(MAX_VOLUME, Math.max(0, Number(volume) || 0));
    if (this.context && this.master)
      this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.025);
  }

  async load(clip, signal) {
    if (this.cache.has(clip.url)) return this.cache.get(clip.url);
    const response = await fetch(new URL(clip.url, import.meta.url), { signal });
    if (!response.ok) throw new Error('语音素材加载失败，请检查本地服务后重试。');
    const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (
      buffer.duration < 0.5 ||
      buffer.duration > 20 ||
      stats(buffer.getChannelData(0)).rms < 0.0001
    )
      throw new Error('语音素材校验失败。');
    this.cache.set(clip.url, buffer);
    return buffer;
  }

  async prepare(round, signal) {
    await Promise.all(round.candidates.map((clip) => this.load(clip, signal)));
  }

  async play(clip, { level = null, label = '', onEnded } = {}) {
    this.stop();
    const token = this.token;
    await this.unlock();
    const buffer = this.cache.get(clip.url);
    if (token !== this.token) return;
    if (!buffer) throw new Error('语音尚未准备完成，请重试。');
    const plan = planMix(buffer.getChannelData(0), buffer.sampleRate, level);
    const voice = this.context.createBufferSource();
    voice.buffer = buffer;
    const voiceGain = this.context.createGain();
    voiceGain.gain.value = plan.voiceGain;
    // Both sources enter the same limiter -> master -> destination chain.
    voice.connect(voiceGain).connect(this.limiter);
    this.nodes.push(voice, voiceGain);
    const startAt = this.context.currentTime + 0.012;
    if (plan.noise) {
      const noiseBuffer = this.context.createBuffer(1, buffer.length, buffer.sampleRate);
      noiseBuffer.copyToChannel(plan.noise, 0);
      const noise = this.context.createBufferSource();
      noise.buffer = noiseBuffer;
      const noiseGain = this.context.createGain();
      noiseGain.gain.value = plan.noiseGain;
      noise.connect(noiseGain).connect(this.limiter);
      this.nodes.push(noise, noiseGain);
      noise.start(startAt);
    }
    this.active = label;
    this.onChange(label, { context: this.context, startAt, buffer });
    voice.onended = () => {
      if (token !== this.token) return;
      this.stop();
      onEnded?.();
    };
    voice.start(startAt);
  }

  stop() {
    this.token++;
    for (const node of this.nodes) {
      if ('onended' in node) node.onended = null;
      try {
        node.stop?.();
      } catch {
        /* already stopped */
      }
      node.disconnect();
    }
    this.nodes = [];
    this.active = null;
    this.onChange(null);
  }

  suspend() {
    this.stop();
    return this.context?.suspend();
  }

  dispose() {
    this.stop();
    this.cache.clear();
    const context = this.context;
    this.context = null;
    return context?.close();
  }
}
