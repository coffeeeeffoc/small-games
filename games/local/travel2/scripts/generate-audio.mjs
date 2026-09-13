import { mkdirSync, writeFileSync } from 'node:fs';

const directory = new URL('../public/audio/', import.meta.url);
mkdirSync(directory, { recursive: true });
const sampleRate = 22050;

function wav(name, seconds, sample) {
  const length = Math.floor(sampleRate * seconds);
  const buffer = Buffer.alloc(44 + length * 2);
  buffer.write('RIFF');
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(length * 2, 40);
  for (let i = 0; i < length; i++)
    buffer.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, sample(i / sampleRate))) * 32767),
      44 + i * 2,
    );
  writeFileSync(new URL(name, directory), buffer);
}

let seed = 73;
let filtered = 0;
wav('river.wav', 8, (t) => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  filtered = filtered * 0.96 + (seed / 4294967296 - 0.5) * 0.04;
  const edge = Math.min(1, t / 0.25, (8 - t) / 0.25);
  return filtered * (0.6 + 0.28 * Math.sin((t * Math.PI) / 2)) * edge;
});
wav('bell.wav', 2, (t) => {
  const strike = Math.min(1, t / 0.015) * Math.exp(-t * 3.4);
  return (
    strike *
    (Math.sin(2 * Math.PI * 523.25 * t) * 0.22 +
      Math.sin(2 * Math.PI * 1049 * t) * 0.08 +
      Math.sin(2 * Math.PI * 1568 * t) * 0.035)
  );
});
console.log('Generated river ambience and collection chime (original synthesized audio).');
