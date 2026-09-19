import { mkdir, writeFile } from 'node:fs/promises';
const out = new URL('../assets/art/art-audio/', import.meta.url);
await mkdir(out, { recursive: true });
// Original synthesized effects, PCM mono. All platforms use the same Cocos AudioSource.
for (const [name, seconds, frequency] of [
  ['engine', 1, 80],
  ['tick', 0.12, 650],
  ['charge', 0.2, 850],
  ['charge2', 0.26, 1200],
  ['boost', 0.45, 300],
  ['hit', 0.16, 100],
  ['finish', 0.65, 520],
]) {
  const rate = 22050,
    n = Math.floor(seconds * rate),
    b = Buffer.alloc(44 + n * 2);
  b.write('RIFF');
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / rate,
      progress = i / n,
      envelope = name === 'engine' ? 0.24 : Math.min(1, t * 70) * (1 - progress) ** 1.6 * 0.55;
    const phase =
      2 *
      Math.PI *
      (frequency * t + (name === 'boost' ? 650 * t * t : name === 'finish' ? 240 * t * t : 0));
    const sample = (Math.sin(phase) + 0.2 * Math.sin(phase * 2)) * envelope;
    b.writeInt16LE(Math.round(sample * 22000), 44 + i * 2);
  }
  await writeFile(new URL(name + '.wav', out), b);
}
