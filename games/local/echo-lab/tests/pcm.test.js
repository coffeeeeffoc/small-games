import test from 'node:test';
import assert from 'node:assert/strict';
import { builtinBuffer, encodeWavBytes, monoClip } from '../shared/core/audio.js';
import { createPcmBuffer, pcmContext, renderPcm } from '../shared/core/pcm.js';

const impulse = () => {
  const buffer = createPcmBuffer(1, 10, 1000);
  buffer.getChannelData(0)[0] = 1;
  return buffer;
};
const peak = (data) => Math.max(...Array.from(data, Math.abs));

test('PCM preserves absolute fractional arrivals, stereo pan and full tails', async () => {
  const output = await renderPcm(
    impulse(),
    { paths: [{ delay: 0.2005, gain: 0.8, pan: -1 }] },
    { volume: 1 },
  );
  assert.equal(output.numberOfChannels, 2);
  assert.ok(output.duration >= 0.2605);
  assert.equal(peak(output.getChannelData(0).slice(0, 200)), 0);
  assert.ok(Math.abs(output.getChannelData(0)[200] - 0.22) < 1e-6);
  assert.ok(Math.abs(output.getChannelData(0)[201] - 0.22) < 1e-6);
  assert.equal(peak(output.getChannelData(1)), 0);
});
test('PCM zero paths stays silent, dry ignores room paths, gain is not normalized', async () => {
  const silent = await renderPcm(impulse(), { paths: [] });
  assert.equal(peak(silent.getChannelData(0)), 0);
  const loud = await renderPcm(impulse(), { paths: [{ delay: 0, gain: 0.8, pan: 0 }] });
  const quiet = await renderPcm(impulse(), { paths: [{ delay: 0, gain: 0.2, pan: 0 }] });
  assert.ok(Math.abs(peak(loud.getChannelData(0)) / peak(quiet.getChannelData(0)) - 4) < 1e-5);
  const dry = await renderPcm(impulse(), { paths: [] }, { dry: true });
  assert.ok(dry.getChannelData(0)[0] > 0);
  assert.equal(dry.getChannelData(0)[0], dry.getChannelData(1)[0]);
});
test('PCM cancellation interrupts multi-path work and limiter keeps WAV within range', async () => {
  let cancelled = false;
  await assert.rejects(
    renderPcm(
      impulse(),
      { paths: Array.from({ length: 40 }, () => ({ delay: 0, gain: 1, pan: 0 })) },
      {
        cancelled: () => cancelled,
        yieldTask: async () => {
          cancelled = true;
        },
      },
    ),
    { name: 'AbortError' },
  );
  const loud = await renderPcm(impulse(), { paths: [{ delay: 0, gain: 100, pan: 0 }] });
  assert.ok(peak(loud.getChannelData(0)) < 1);
  const wav = new DataView(encodeWavBytes(loud));
  assert.equal(wav.getUint16(22, true), 2);
  assert.equal(wav.getUint32(24, true), 1000);
  assert.equal(wav.getUint32(40, true), loud.length * 4);
});
test('shared builtins are deterministic and custom clips keep 15 seconds with a fade', () => {
  const context = pcmContext(1000);
  for (const name of ['clap', 'kick', 'chime']) {
    const a = builtinBuffer(context, name).buffer;
    assert.deepEqual(a.getChannelData(0), builtinBuffer(context, name).buffer.getChannelData(0));
    assert.ok(peak(a.getChannelData(0)) > 0);
  }
  const input = createPcmBuffer(2, 16000, 1000);
  input.getChannelData(0).fill(1);
  input.getChannelData(1).fill(0.5);
  const mono = monoClip(context, input);
  assert.equal(mono.duration, 15);
  assert.equal(mono.getChannelData(0)[0], 0.75);
  assert.equal(mono.getChannelData(0)[mono.length - 1], 0);
});
