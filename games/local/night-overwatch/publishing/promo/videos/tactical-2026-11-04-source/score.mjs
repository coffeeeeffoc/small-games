import fs from 'node:fs';
import assert from 'node:assert/strict';
// Original synthesized underscore; deterministic noise keeps rerenders identical.
const rate = 48000, duration = 30, samples = rate * duration;
const data = new Float64Array(samples);
let seed = 1707;
const noise = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1; };
for (let i = 0; i < samples; i++) {
 const t = i / rate, beat = t % .5, eighth = t % .25;
 const bass = [55, 55, 65.406, 49][Math.min(3, Math.floor(t / 8))];
 const pad = (.045 * Math.sin(2 * Math.PI * bass * t) + .025 * Math.sin(2 * Math.PI * bass * 1.5 * t)) * (0.65 + .35 * Math.sin(t * .7));
 const kick = .32 * Math.sin(2 * Math.PI * (48 * beat + 4 * (1 - Math.exp(-beat * 30)))) * Math.exp(-beat * 16);
 const pulse = .07 * Math.sin(2 * Math.PI * bass * 4 * t) * Math.exp(-eighth * 22);
 const hat = noise() * .035 * Math.exp(-eighth * 90);
 const snareTime = (t + .5) % 1;
 const snare = noise() * .08 * Math.exp(-snareTime * 28);
 data[i] = pad + (t < 23 ? kick + pulse + hat + snare : pad);
}
for (const cut of [4, 7, 10, 13, 18, 23]) {
 for (let j = 0; j < rate * .8; j++) {
  const index = Math.round((cut - .35) * rate) + j;
  if (index >= samples) break;
  const t = j / rate;
  data[index] += .11 * noise() * Math.sin(Math.PI * t / .8) + .14 * Math.sin(2 * Math.PI * 42 * t) * Math.exp(-t * 6);
 }
}
let peak = 0;
for (const value of data) peak = Math.max(peak, Math.abs(value));
assert(Number.isFinite(peak) && peak > 0);
const buffer = Buffer.alloc(44 + samples * 4);
buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8); buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(2, 22); buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 4, 28);
buffer.writeUInt16LE(4, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(samples * 4, 40);
for (let i = 0; i < samples; i++) {
 const envelope = Math.min(1, i / rate, (samples - i) / (rate * 1.5));
 const value = Math.round(data[i] / peak * .78 * envelope * 32767);
 buffer.writeInt16LE(value, 44 + i * 4); buffer.writeInt16LE(value, 46 + i * 4);
}
assert.equal(buffer.length, 44 + rate * duration * 4);
fs.writeFileSync(new URL('./public/score.wav', import.meta.url), buffer);
console.log({duration, rate, peak, bytes: buffer.length});
