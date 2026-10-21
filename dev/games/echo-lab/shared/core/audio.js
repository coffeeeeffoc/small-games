// Platform-independent audio math; contexts are injected by the runtime adapter.
export const MAX_AUDIO_SECONDS = 15;
export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const MAX_PATH_DELAY_SECONDS = 8;
const FIXED_HEADROOM = 0.55;
const RENDER_PADDING_SECONDS = 0.05;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export function softLimitCurve() {
  // Transparent below 0.7, smoothly softened above it, bounded below full scale.
  // No per-layout normalization: adding absorption must remain audible.
  const curve = new Float32Array(4097);
  for (let i = 0; i < curve.length; i += 1) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    const a = Math.abs(x);
    curve[i] = Math.sign(x) * (a <= 0.7 ? a : 0.7 + 0.25 * Math.tanh((a - 0.7) / 0.25));
  }
  return curve;
}

export function audioPaths(geometry, dry) {
  if (dry) return [{ delay: 0, gain: 1, pan: 0 }];
  const paths = Array.isArray(geometry?.paths) ? geometry.paths : [];
  if (paths.length > 4096) throw new Error('声音路径过多，请减少反射次数或装置数量。');
  return paths.flatMap((path) => {
    const delay = Number(path.delay);
    const gain = Number(path.gain);
    if (!Number.isFinite(delay) || delay < 0 || !Number.isFinite(gain) || gain === 0) return [];
    if (delay > MAX_PATH_DELAY_SECONDS)
      throw new Error('原型支持最长 8 秒的传播路径，请缩小空间。');
    return [{ delay, gain, pan: clamp(Number(path.pan) || 0, -1, 1) }];
  });
}

export function createImpulse(context, paths) {
  const maxDelay = paths.reduce((max, path) => Math.max(max, path.delay), 0);
  // Two samples after the final tap preserve its fractional-sample interpolation.
  const impulse = context.createBuffer(
    2,
    Math.max(2, Math.ceil(maxDelay * context.sampleRate) + 2),
    context.sampleRate,
  );
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);
  for (const path of paths) {
    const sample = path.delay * context.sampleRate;
    const index = Math.floor(sample);
    const fraction = sample - index;
    const l = path.gain * Math.sqrt((1 - path.pan) / 2);
    const r = path.gain * Math.sqrt((1 + path.pan) / 2);
    left[index] += l * (1 - fraction);
    left[index + 1] += l * fraction;
    right[index] += r * (1 - fraction);
    right[index + 1] += r * fraction;
  }
  return { impulse, maxDelay };
}

export function createGraph(context, input, paths, volume, limiterCurve) {
  const source = context.createBufferSource();
  source.buffer = input;
  const convolver = context.createConvolver();
  convolver.normalize = false;
  const { impulse, maxDelay } = createImpulse(context, paths);
  convolver.buffer = impulse;
  const gain = context.createGain();
  gain.gain.value = FIXED_HEADROOM * clamp(Number.isFinite(volume) ? volume : 0.65, 0, 1);
  const limiter = context.createWaveShaper();
  limiter.curve = limiterCurve;
  limiter.oversample = 'none';
  source.connect(convolver);
  convolver.connect(gain);
  gain.connect(limiter);
  limiter.connect(context.destination);
  return {
    source,
    duration: input.duration + maxDelay + RENDER_PADDING_SECONDS,
    disconnect() {
      for (const node of [source, convolver, gain, limiter]) {
        try {
          node.disconnect();
        } catch {
          /* Node may already have been disconnected. */
        }
      }
    },
  };
}

export function monoClip(context, decoded) {
  const length = Math.max(
    1,
    Math.min(decoded.length, Math.floor(decoded.sampleRate * MAX_AUDIO_SECONDS)),
  );
  const mono = context.createBuffer(1, length, decoded.sampleRate);
  const output = mono.getChannelData(0);
  for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
    const input = decoded.getChannelData(channel);
    for (let i = 0; i < length; i += 1) output[i] += input[i] / decoded.numberOfChannels;
  }
  // A truncation otherwise introduces a sharp artificial click into every echo.
  if (length < decoded.length) {
    const fade = Math.min(length, Math.round(decoded.sampleRate * 0.008));
    for (let i = 0; i < fade; i += 1) output[length - fade + i] *= 1 - i / Math.max(1, fade - 1);
  }
  return mono;
}

export function builtinBuffer(context, name) {
  const names = { clap: '拍手', kick: '短鼓点', chime: '清脆铃音' };
  if (!(name in names)) throw new Error('未知的内置测试音。');
  const duration = { clap: 0.32, kick: 0.65, chime: 1.25 }[name];
  const buffer = context.createBuffer(
    1,
    Math.ceil(context.sampleRate * duration),
    context.sampleRate,
  );
  const samples = buffer.getChannelData(0);
  let seed = 918273;
  let previousNoise = 0;
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const t = i / context.sampleRate;
    let value = 0;
    if (name === 'clap') {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = (seed / 4294967296) * 2 - 1;
      const highNoise = noise - previousNoise * 0.7;
      previousNoise = noise;
      for (const offset of [0, 0.011, 0.024]) {
        const time = t - offset;
        if (time >= 0)
          value +=
            highNoise *
            Math.min(1, time / 0.0006) *
            Math.exp(-time * 58) *
            (offset === 0 ? 1 : 0.6);
      }
    } else if (name === 'kick') {
      const phase = 2 * Math.PI * (48 * t + (115 / 35) * (1 - Math.exp(-35 * t)));
      value = Math.sin(phase) * Math.exp(-t * 10) * Math.min(1, t / 0.0015);
    } else {
      value =
        Math.min(1, t / 0.002) *
        (Math.sin(2 * Math.PI * 523.25 * t) * Math.exp(-t * 5.5) +
          0.4 * Math.sin(2 * Math.PI * 1046.5 * t) * Math.exp(-t * 8) +
          0.16 * Math.sin(2 * Math.PI * 1569.75 * t) * Math.exp(-t * 12));
    }
    // Keep the built-in's end continuous without changing any room response.
    value *= clamp((duration - t) / 0.012, 0, 1);
    samples[i] = value;
    peak = Math.max(peak, Math.abs(value));
  }
  const scale = peak > 0 ? 0.8 / peak : 1;
  for (let i = 0; i < samples.length; i += 1) samples[i] *= scale;
  return { buffer, name: names[name] };
}

/** Encode an AudioBuffer-compatible object as interleaved PCM16 WAV. */
export function encodeWavBytes(buffer) {
  const channels = buffer.numberOfChannels;
  const bytesPerFrame = channels * 2;
  const dataSize = buffer.length * bytesPerFrame;
  const array = new ArrayBuffer(44 + dataSize);
  const view = new DataView(array);
  const writeText = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * bytesPerFrame, true);
  view.setUint16(32, bytesPerFrame, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, dataSize, true);
  const data = Array.from({ length: channels }, (_, i) => buffer.getChannelData(i));
  let offset = 44;
  for (let i = 0; i < buffer.length; i += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = clamp(data[channel][i], -1, 1);
      view.setInt16(offset, Math.round(sample < 0 ? sample * 32768 : sample * 32767), true);
      offset += 2;
    }
  }
  return array;
}
