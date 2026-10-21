import { audioPaths, softLimitCurve } from './audio.js';

export function createPcmBuffer(channels, length, sampleRate) {
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  return {
    length,
    sampleRate,
    numberOfChannels: channels,
    duration: length / sampleRate,
    getChannelData: (channel) => data[channel],
  };
}

export const pcmContext = (sampleRate = 22050) => ({ sampleRate, createBuffer: createPcmBuffer });

// Sparse convolution with the same fractional taps, equal-power pan, fixed
// headroom and sampled limiter as the browser graph. Yield between paths so a
// 15-second recording never monopolizes the small-program UI or defeats stop.
export async function renderPcm(
  input,
  geometry,
  {
    dry = false,
    volume = 0.65,
    cancelled = () => false,
    yieldTask = () => new Promise((resolve) => setTimeout(resolve, 0)),
  } = {},
) {
  const paths = audioPaths(geometry, dry);
  const rate = input.sampleRate;
  const delay = paths.reduce((max, path) => Math.max(max, path.delay), 0);
  const output = createPcmBuffer(2, Math.ceil((input.duration + delay + 0.05) * rate), rate);
  const mono = input.getChannelData(0);
  const left = output.getChannelData(0),
    right = output.getChannelData(1);
  const check = () => {
    if (cancelled()) {
      const error = new Error('操作已取消');
      error.name = 'AbortError';
      throw error;
    }
  };
  check();
  for (let p = 0; p < paths.length; p += 1) {
    const path = paths[p];
    const sample = path.delay * rate,
      offset = Math.floor(sample),
      fraction = sample - offset;
    const l = path.gain * Math.sqrt((1 - path.pan) / 2);
    const r = path.gain * Math.sqrt((1 + path.pan) / 2);
    for (let i = 0; i < mono.length; i += 1) {
      const value = mono[i],
        index = offset + i;
      left[index] += value * l * (1 - fraction);
      left[index + 1] += value * l * fraction;
      right[index] += value * r * (1 - fraction);
      right[index + 1] += value * r * fraction;
    }
    if (p % 4 === 3) {
      await yieldTask();
      check();
    }
  }
  const gain = 0.55 * Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0.65));
  const curve = softLimitCurve();
  for (const channel of [left, right]) {
    for (let i = 0; i < channel.length; i += 1) {
      const x = Math.max(-1, Math.min(1, channel[i] * gain));
      const position = ((x + 1) / 2) * (curve.length - 1);
      const index = Math.floor(position),
        fraction = position - index;
      channel[i] =
        curve[index] * (1 - fraction) + curve[Math.min(index + 1, curve.length - 1)] * fraction;
    }
  }
  check();
  return output;
}
