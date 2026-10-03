/**
 * Optional native-browser regression checks. Playwright is a developer tool,
 * not an application dependency. Run with a separately installed Playwright:
 *   CHROMIUM_EXECUTABLE=/path/to/chrome node tests/audio.browser.js
 * PLAYWRIGHT_MODULE may point at an externally installed Playwright module.
 */
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const code = await readFile(new URL('../src/audio.js', import.meta.url), 'utf8');
const server = createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end('<!doctype html><title>Echo Lab audio regression</title>');
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');

let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
    args: [
      '--no-sandbox',
      '--autoplay-policy=no-user-gesture-required',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
  });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.addScriptTag({
    type: 'module',
    content: `${code}\nglobalThis.Engine=AudioEngine;globalThis.toWav=encodeWav;`,
  });
  await page.waitForFunction(() => Boolean(globalThis.Engine));
  const result = await page.evaluate(async () => {
    const assert = (condition, message) => {
      if (!condition) throw new Error(message);
    };
    const engine = new Engine();
    await engine.init();
    const rate = engine.context.sampleRate;
    engine.buffer = engine.context.createBuffer(1, Math.round(rate * 0.01), rate);
    engine.buffer.getChannelData(0)[0] = 0.5;
    const geometry = {
      paths: [
        { delay: 0.1, relativeDelay: 0, gain: 1, pan: -1 },
        { delay: 0.3, relativeDelay: 0.2, gain: 0.5, pan: 1 },
      ],
    };
    const rendered = await engine.exportWav(geometry, { volume: 1 });
    const wavBytes = await rendered.blob.arrayBuffer();
    const decoded = await engine.context.decodeAudioData(wavBytes.slice(0));
    const peaks = [];
    for (let channel = 0; channel < 2; channel += 1) {
      const samples = decoded.getChannelData(channel);
      let peak = 0;
      let index = 0;
      for (let i = 0; i < samples.length; i += 1) {
        if (Math.abs(samples[i]) > peak) {
          peak = Math.abs(samples[i]);
          index = i;
        }
      }
      peaks.push({ time: index / decoded.sampleRate, peak });
    }
    assert(decoded.numberOfChannels === 2, 'WAV must contain stereo audio');
    assert(
      Math.abs(peaks[0].time - 0.1) < 2 / rate,
      'left tap must retain absolute travel latency',
    );
    assert(
      Math.abs(peaks[1].time - 0.3) < 2 / rate,
      'right tap must retain absolute travel latency',
    );
    assert(
      Math.abs(peaks[0].peak / peaks[1].peak - 2) < 0.01,
      'absorption must halve amplitude without normalization',
    );
    assert(rendered.duration >= 0.36 - 1 / rate, 'export must preserve the final delayed tail');
    const original = await engine.exportWav(geometry, { volume: 1, dry: true });
    const decodedOriginal = await engine.context.decodeAudioData(await original.blob.arrayBuffer());
    assert(
      decodedOriginal.duration < 0.061,
      'dry export must omit every propagation delay and echo tail',
    );
    assert(
      Math.abs(decodedOriginal.getChannelData(0)[0]) > 0.1,
      'original impulse must start at zero',
    );
    assert(
      Math.abs(decodedOriginal.getChannelData(0)[0] - decodedOriginal.getChannelData(1)[0]) <
        0.0001,
      'dry signal must be centered',
    );
    assert(original.peak > 0, 'original must still exist in a blocked room');
    const silence = await engine.exportWav({ paths: [] }, { volume: 1 });
    assert(
      silence.peak === 0,
      'blocked scenes must not introduce a synthetic direct path or reverb',
    );

    const firstClap = engine.useBuiltin('clap').getChannelData(0).slice();
    const secondClap = engine.useBuiltin('clap').getChannelData(0);
    assert(
      firstClap.every((value, i) => value === secondClap[i]),
      'test signals must be deterministic',
    );
    const limited = await engine.exportWav(
      { paths: [{ delay: 0, gain: 100, pan: 0 }] },
      { volume: 1 },
    );
    assert(limited.peak < 0.95, 'master limiter must bound excessively loud summed audio');

    const stereoInput = engine.context.createBuffer(2, Math.round(16 * rate), rate);
    stereoInput.getChannelData(0).fill(0.4);
    stereoInput.getChannelData(1).fill(0.2);
    const imported = await engine.importFile(
      new File([toWav(stereoInput)], 'sixteen-seconds.wav', { type: 'audio/wav' }),
    );
    assert(
      imported.truncated && imported.buffer.duration === 15,
      'long imports must retain only the first 15 seconds',
    );
    assert(
      Math.abs(imported.buffer.getChannelData(0)[100] - 0.3) < 0.0001,
      'stereo source must average into one emitter',
    );
    assert(
      imported.buffer.getChannelData(0).at(-1) === 0,
      'truncation must use a short fade to avoid an artificial click',
    );
    let rejectedLargeFile = false;
    try {
      await engine.importFile({ size: 20 * 1024 * 1024 + 1 });
    } catch {
      rejectedLargeFile = true;
    }
    assert(rejectedLargeFile, 'files over 20 MB must be rejected before decoding');

    const pendingPlayback = engine.play(geometry);
    engine.stop();
    assert(
      (await pendingPlayback) === 0 && !engine._activeGraph,
      'stop during audio initialization must cancel pending playback',
    );

    // Chromium supplies a synthetic microphone; this verifies the real browser
    // MediaRecorder encoding/decoding lifecycle without requesting a human mic.
    let recordingStopped = false;
    engine.onRecordingStop = (event) => {
      assert(!event.error, event.error?.message);
      recordingStopped = true;
    };
    await engine.startRecording();
    const tracks = engine._session.stream.getTracks();
    assert(engine.isRecording, 'recording state must be exposed');
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const recorded = await engine.stopRecording();
    assert(
      recorded.duration > 0.5 && recorded.duration <= 15,
      'microphone clip must decode into a bounded audio buffer',
    );
    assert(
      recordingStopped && !engine.isRecording,
      'recording completion callback must reset the UI',
    );
    assert(
      tracks.every((track) => track.readyState === 'ended'),
      'all microphone tracks must be released',
    );
    await engine.dispose();
    return {
      sampleRate: rate,
      stereoPeaks: peaks,
      exportSeconds: rendered.duration,
      wavBytes: wavBytes.byteLength,
      blockedScenePeak: silence.peak,
      limiterPeak: limited.peak,
      importSeconds: imported.duration,
      recordedSeconds: recorded.duration,
      microphoneTracksReleased: true,
    };
  });
  console.log(
    'PASS: native Web Audio timing, pan, absorption, complete WAV tail, silence, headroom, imports, cancellation and recording',
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
