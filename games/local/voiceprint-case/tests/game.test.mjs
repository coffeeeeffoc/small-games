import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { LEVELS, createRun, judge, validateManifest } from '../levels.mjs';
import { planMix, stats, softLimit, OUTPUT_CEILING, MIX_RMS } from '../audio.mjs';

const manifest = JSON.parse(
  await readFile(new URL('../assets/audio/manifest.json', import.meta.url), 'utf8'),
);

function readWav(data) {
  assert.equal(data.toString('ascii', 0, 4), 'RIFF');
  assert.equal(data.toString('ascii', 8, 12), 'WAVE');
  let offset = 12;
  let sampleRate;
  let pcm;
  while (offset + 8 <= data.length) {
    const kind = data.toString('ascii', offset, offset + 4);
    const length = data.readUInt32LE(offset + 4);
    if (kind === 'fmt ') {
      assert.equal(data.readUInt16LE(offset + 8), 1, 'PCM audio');
      assert.equal(data.readUInt16LE(offset + 10), 1, 'mono');
      sampleRate = data.readUInt32LE(offset + 12);
      assert.equal(data.readUInt16LE(offset + 22), 16, '16-bit PCM');
    }
    if (kind === 'data') pcm = data.subarray(offset + 8, offset + 8 + length);
    offset += 8 + length + (length % 2);
  }
  assert.ok(pcm?.length && sampleRate);
  const samples = Float32Array.from(
    { length: pcm.length / 2 },
    (_, i) => pcm.readInt16LE(i * 2) / 32768,
  );
  return { samples, sampleRate };
}

test('12 complete rounds, randomized and balanced targets preserve exact clip identity', () => {
  const positions = new Set();
  for (let seed = 0; seed < 256; seed++) {
    const rounds = createRun(manifest, seed);
    assert.equal(rounds.length, 12);
    const count = new Map();
    for (const round of rounds) {
      assert.equal(round.candidates.length, 3);
      assert.equal(new Set(round.candidates.map((clip) => clip.voiceId)).size, 3);
      assert.strictEqual(round.target, round.candidates[round.correctIndex]);
      assert.ok(judge(round, round.correctIndex).correct);
      assert.ok(!judge(round, (round.correctIndex + 1) % 3).correct);
      positions.add(round.correctIndex);
      count.set(round.target.voiceId, (count.get(round.target.voiceId) || 0) + 1);
      const phrase = manifest.phrases[round.phraseIndex];
      assert.ok(round.candidates.every((clip) => phrase.clips.includes(clip)));
    }
    assert.deepEqual([...count.values()], [4, 4, 4]);
  }
  assert.equal(positions.size, 3);
  assert.deepEqual(createRun(manifest, 123), createRun(manifest, 123));
  assert.throws(() => judge(createRun(manifest, 1)[0], null));
  assert.throws(() => validateManifest({ voices: [], phrases: [] }));
});

test('all static Chinese speech files have matching hashes, valid duration and audible energy', async () => {
  const hashes = new Set();
  for (const clip of manifest.phrases.flatMap((phrase) => phrase.clips)) {
    const bytes = await readFile(new URL('../' + clip.url, import.meta.url));
    const hash = createHash('sha256').update(bytes).digest('hex');
    assert.equal(hash, clip.sha256);
    hashes.add(hash);
    const { samples, sampleRate } = readWav(bytes);
    const { rms, peak } = stats(samples);
    assert.ok(samples.length / sampleRate > 1 && samples.length / sampleRate < 15);
    assert.ok(rms > 0.005 && peak > 0.05 && peak < 0.99);
  }
  assert.equal(hashes.size, 12, 'no duplicate/placeholder clips');
});

test('every level has measured SNR, constant RMS, deterministic ambience and bounded soft limiting', async () => {
  const rounds = createRun(manifest, 73);
  for (const round of rounds) {
    const { samples, sampleRate } = readWav(
      await readFile(new URL('../' + round.target.url, import.meta.url)),
    );
    const mix = planMix(samples, sampleRate, round);
    const scene = Float32Array.from(
      samples,
      (sample, i) => sample * mix.voiceGain + mix.noise[i] * mix.noiseGain,
    );
    const measuredSnr =
      20 *
      Math.log10((stats(samples).rms * mix.voiceGain) / (stats(mix.noise).rms * mix.noiseGain));
    assert.ok(Math.abs(measuredSnr - round.snrDb) < 0.00001);
    assert.ok(Math.abs(stats(scene).rms - MIX_RMS) < 0.00001);
    assert.deepEqual(mix.noise, planMix(samples, sampleRate, round).noise);
    assert.ok(stats(Float32Array.from(scene, softLimit)).peak < OUTPUT_CEILING);
  }
  assert.ok(LEVELS.every((level, i) => i === 0 || level.snrDb < LEVELS[i - 1].snrDb));
  assert.ok(LEVELS.every((level, i) => i === 0 || level.complexity >= LEVELS[i - 1].complexity));
  assert.ok(Math.abs(softLimit(100)) <= OUTPUT_CEILING);
  assert.throws(() => planMix(new Float32Array(100), 8000));
});
