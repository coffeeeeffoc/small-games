import { mkdir, writeFile } from 'node:fs/promises';
const dir = new URL('../public/building-power-audio/', import.meta.url);
await mkdir(dir, { recursive: true });
// Original synthesized cues, no external recordings or runtime audio dependency.
for (const [name, notes] of Object.entries({
  connect: [440, 660],
  disconnect: [330, 220],
  complete: [523, 659, 784],
  alarm: [160, 130],
  win: [523, 659, 784, 1047],
  lose: [330, 247, 165],
})) {
  const rate = 22050,
    duration = notes.length * 0.12,
    count = Math.ceil(rate * duration);
  const wav = Buffer.alloc(44 + count * 2);
  wav.write('RIFF');
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) {
    const t = i / rate,
      local = t % 0.12,
      frequency = notes[Math.min(notes.length - 1, Math.floor(t / 0.12))];
    wav.writeInt16LE(
      Math.round(
        Math.sin(t * frequency * Math.PI * 2) *
          Math.min(1, local / 0.006) *
          Math.exp(-local * 24) *
          5500,
      ),
      44 + i * 2,
    );
  }
  await writeFile(new URL(`${name}.wav`, dir), wav);
}
