import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
export const durations = {
  shoot: 0.11,
  hit: 0.2,
  kill: 0.8,
  damage: 0.45,
  missile: 0.55,
  scan: 0.65,
  pickup: 0.48,
  won: 1.35,
  lost: 1.1,
  wind: 4,
};
const RATE = 22050,
  TAU = 2 * Math.PI;
export function synthesize(name) {
  assert(Object.hasOwn(durations, name));
  const length = Math.round(durations[name] * RATE),
    samples = new Float64Array(length);
  let seed = 291026,
    low = 0,
    previous = 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2147483648 - 1;
  };
  // Integer harmonics over four seconds make the continuous engine/wind loop periodic.
  const wind = Array.from({ length: 72 }, (_, j) => ({
    f: (81 + j * 13) / 4,
    phase: random() * Math.PI,
    gain: 0.12 / Math.sqrt(j + 1),
  }));
  const note = (t, start, frequency, duration, gain = 1) => {
    const age = t - start;
    if (age < 0 || age >= duration) return 0;
    const envelope =
      Math.min(1, age / 0.008) * Math.exp(-age * 7) * Math.min(1, (duration - age) / 0.03);
    return (
      gain *
      envelope *
      (Math.sin(TAU * frequency * age) + 0.22 * Math.sin(TAU * frequency * 2 * age))
    );
  };
  for (let i = 0; i < length; i++) {
    const t = i / RATE,
      noise = random();
    low += 0.12 * (noise - low);
    const high = noise - previous;
    previous = noise;
    const attack = Math.min(1, t / 0.003),
      tail = Math.min(1, (length - 1 - i) / (RATE * 0.025));
    let value = 0;
    if (name === 'wind') {
      value =
        0.18 * Math.sin(TAU * 92 * t) +
        0.07 * Math.sin(TAU * 184 * t) +
        0.025 * Math.sin(TAU * 276 * t);
      for (const h of wind) value += h.gain * Math.sin(TAU * h.f * t + h.phase);
    } else if (name === 'shoot') {
      value =
        (0.28 * high + 0.65 * low) * Math.exp(-t * 48) +
        0.3 * Math.sin(TAU * (155 * t - 260 * t * t)) * Math.exp(-t * 36);
    } else if (name === 'hit') {
      value =
        0.33 * high * Math.exp(-t * 55) +
        0.19 * Math.sin(TAU * 1380 * t) * Math.exp(-t * 24) +
        0.12 * Math.sin(TAU * 2310 * t) * Math.exp(-t * 34);
    } else if (name === 'kill') {
      value =
        2.1 * low * Math.exp(-t * 5) +
        0.32 * noise * Math.exp(-t * 13) +
        0.36 * Math.sin(TAU * (75 * t - 25 * t * t)) * Math.exp(-t * 7);
    } else if (name === 'damage') {
      value =
        0.65 * low * Math.exp(-t * 11) +
        0.28 * Math.sin(TAU * 74 * t) * Math.exp(-t * 7) +
        0.18 * Math.sin(TAU * (760 * t - 700 * t * t)) * Math.exp(-t * 9);
    } else if (name === 'missile') {
      value =
        (1.3 * low + 0.1 * noise) * Math.sin(Math.PI * Math.min(1, t / 0.55)) * Math.exp(-t * 3) +
        0.12 * Math.sin(TAU * (90 * t + 190 * t * t)) * Math.exp(-t * 5);
    } else if (name === 'scan') {
      value =
        0.3 * Math.sin(TAU * (350 * t + 700 * t * t)) * Math.sin((Math.PI * t) / 0.65) +
        0.13 * Math.sin(TAU * (710 * t + 1100 * t * t)) * Math.exp(-t * 5);
    } else if (name === 'pickup') {
      value = note(t, 0, 659.25, 0.26) + note(t, 0.1, 783.99, 0.26) + note(t, 0.2, 1046.5, 0.28);
    } else if (name === 'won') {
      value = [523.25, 659.25, 783.99, 1046.5].reduce(
        (v, f, n) => v + note(t, n * 0.12, f, 0.85, 0.6),
        0,
      );
    } else if (name === 'lost') {
      value = [392, 329.63, 261.63].reduce((v, f, n) => v + note(t, n * 0.2, f, 0.65, 0.6), 0);
    }
    samples[i] = value * (name === 'wind' ? 1 : attack * tail);
  }
  let peak = 0,
    energy = 0;
  for (const v of samples) {
    assert(Number.isFinite(v));
    peak = Math.max(peak, Math.abs(v));
    energy += v * v;
  }
  assert(peak > 0.01 && energy / length > 0.00001, 'A playable sound must be finite and audible');
  const gain = (name === 'wind' ? 0.48 : 0.8) / peak;
  const wav = Buffer.alloc(44 + length * 2);
  wav.write('RIFF');
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(RATE, 24);
  wav.writeUInt32LE(RATE * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(length * 2, 40);
  for (let i = 0; i < length; i++)
    wav.writeInt16LE(Math.round(samples[i] * gain * 32767), 44 + i * 2);
  if (name !== 'wind') assert(wav.readInt16LE(44) === 0 && wav.readInt16LE(wav.length - 2) === 0);
  else
    assert(
      Math.abs(samples.at(-1) - samples[0]) * gain < 0.09,
      'Engine loop must not pop at its seam',
    );
  return { wav, rms: Math.sqrt(energy / length) * gain, peak: peak * gain };
}
export async function writeSoundBank(directory) {
  await mkdir(directory, { recursive: true });
  const assets = [];
  for (const name of Object.keys(durations)) {
    const { wav, rms, peak } = synthesize(name);
    await writeFile(path.join(directory, name + '.wav'), wav);
    assets.push({
      name,
      rate: RATE,
      duration: durations[name],
      bytes: wav.length,
      rms,
      peak,
      sha256: createHash('sha256').update(wav).digest('hex'),
    });
  }
  return assets;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const output = fileURLToPath(new URL('./wav/', import.meta.url));
  const assets = await writeSoundBank(output);
  await writeFile(
    new URL('./manifest.json', import.meta.url),
    JSON.stringify(
      { authoring: 'Original deterministic synthesis; no sampled recordings', assets },
      null,
      2,
    ) + '\n',
  );
  console.log(
    JSON.stringify({
      sounds: assets.length,
      bytes: assets.reduce((n, a) => n + a.bytes, 0),
      checks: 'finite PCM, audible energy, no clipping, transient endpoints and periodic loop seam',
    }),
  );
}
