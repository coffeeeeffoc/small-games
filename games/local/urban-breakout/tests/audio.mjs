import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(process.env.URBAN_URL || 'http://127.0.0.1:4330');
  const measurements = await page.evaluate(async () => {
    const { Sound } = await import('/src/client/audio.ts');
    const base = { id: 1, tick: 0, x: 2, z: -3, fromX: 0, fromZ: 7 };
    const cases = [
      ['rifle', { kind: 'shot', weapon: 'rifle' }],
      ['shotgun', { kind: 'shot', weapon: 'shotgun' }],
      ['grenade', { kind: 'shot', weapon: 'grenade' }],
      ['flesh', { kind: 'hit', surface: 'flesh' }],
      ['armor', { kind: 'hit', surface: 'armor' }],
      ['death', { kind: 'death', enemyKind: 'walker' }],
      ['blast', { kind: 'blast' }],
      ['reward', { kind: 'reward' }],
      ['warning', { kind: 'warning', enemyKind: 'boss' }],
      ['music', null],
      ['mix', null],
      ['muted', { kind: 'blast' }],
    ];
    const results = [];
    for (const [name, effect] of cases) {
      const ctx = new OfflineAudioContext(2, 48000 * 2, 48000),
        sound = new Sound(ctx);
      sound.muted = name === 'muted';
      if (effect) sound.cue({ ...base, ...effect }, 0.02);
      else for (let i = 0; i < 6; i++) sound.musicStep(0.02 + (i * 60) / 116 / 2, i, 0.8);
      if (name === 'mix') {
        for (let i = 0; i < 4; i++) {
          sound.cue({ ...base, id: i + 2, kind: 'shot', weapon: 'shotgun' }, 0.02);
          sound.cue({ ...base, id: i + 10, kind: 'blast' }, 0.02);
        }
      }
      const buffer = await ctx.startRendering();
      const data = buffer.getChannelData(0);
      let energy = 0,
        peak = 0,
        crossings = 0,
        finite = true;
      for (let i = 0; i < data.length; i++) {
        energy += data[i] ** 2;
        peak = Math.max(peak, Math.abs(data[i]));
        if (!Number.isFinite(data[i])) finite = false;
        if (i && data[i - 1] * data[i] < 0) crossings++;
      }
      results.push({ name, rms: Math.sqrt(energy / data.length), peak, crossings, finite });
      sound.dispose();
    }
    const ctx = new OfflineAudioContext(2, 48000, 48000),
      sound = new Sound(ctx);
    sound.muted = false;
    sound.setPlaying(true);
    sound.consume([{ ...base, kind: 'shot', weapon: 'rifle' }]);
    const cues = sound.cues;
    sound.consume([{ ...base, kind: 'shot', weapon: 'rifle' }]);
    const deduplicated = sound.cues === cues;
    for (let i = 0; i < 100; i++) sound.cue({ ...base, id: i + 2, kind: 'blast' });
    const peakVoices = sound.peakVoices;
    sound.setPlaying(false);
    const pausedVoices = sound.voices.size;
    sound.dispose();
    const native = window.AudioContext;
    window.AudioContext = undefined;
    const unavailable = new Sound();
    unavailable.unlock();
    const fallback = unavailable.unavailable;
    unavailable.dispose();
    window.AudioContext = native;
    localStorage.removeItem('urban-breakout:muted');
    return { results, deduplicated, peakVoices, pausedVoices, fallback };
  });
  for (const sample of measurements.results) {
    assert.ok(sample.finite && sample.peak < 0.98, `${sample.name}: finite, no clipped samples`);
    if (sample.name === 'muted') assert.equal(sample.peak, 0);
    else
      assert.ok(
        sample.rms > 0.0001 && sample.peak > 0.01,
        `${sample.name}: non-silent synthesized cue`,
      );
  }
  assert.equal(
    new Set(measurements.results.slice(0, 3).map((s) => s.crossings)).size,
    3,
    'weapons have different waveforms',
  );
  assert.ok(measurements.deduplicated && measurements.fallback);
  assert.equal(measurements.peakVoices, 48);
  assert.equal(measurements.pausedVoices, 0);
  await page.locator('#start').click();
  await page.waitForFunction(
    () => window.urbanSnapshot().audio.musicSteps >= 4 && window.urbanSnapshot().audio.cues > 2,
  );
  await page.locator('#pause').click();
  const paused = await page.evaluate(() => window.urbanSnapshot());
  assert.equal(paused.audio.voices, 0);
  assert.equal(paused.audio.playing, false);
  await page.getByRole('slider', { name: '背景音乐音量' }).focus();
  await page.keyboard.press('Home');
  assert.equal(await page.evaluate(() => window.urbanSnapshot().audio.music), 0);
  await page.getByRole('button', { name: '关闭声音', exact: true }).click();
  await page.locator('#resume').click();
  await page.waitForFunction((tick) => window.urbanSnapshot().tick > tick + 20, paused.tick);
  const silent = await page.evaluate(() => window.urbanSnapshot());
  assert.equal(silent.audio.voices, 0);
  assert.equal(silent.audio.musicSteps, paused.audio.musicSteps);
  await page.locator('#pause').click();
  await page.getByRole('button', { name: '打开声音', exact: true }).click();
  await page.getByRole('slider', { name: '背景音乐音量' }).focus();
  for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => window.urbanSnapshot().audio.music), 0.35);
  await page.screenshot({ path: 'docs/evidence/audio-settings.png' });
  await page.getByRole('button', { name: '重新开始', exact: true }).click();
  await page.waitForFunction(() => window.urbanSnapshot().audio.musicSteps >= 2);
  const restarted = await page.evaluate(() => window.urbanSnapshot());
  assert.equal(restarted.activeLoops, 1);
  assert.ok(restarted.audio.peakVoices <= 48);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal(await page.evaluate(() => window.urbanSnapshot().audio.voices), 0);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForFunction(() => window.urbanSnapshot().audio.context === 'closed');
  assert.equal(await page.evaluate(() => window.urbanSnapshot().activeLoops), 0);
  assert.deepEqual(errors, []);
  await writeFile(
    'docs/evidence/audio.json',
    JSON.stringify(
      {
        passed: true,
        browser: browser.version(),
        measurements,
        paused: paused.audio,
        restarted: restarted.audio,
        errors,
        note: 'Measured synthesized waveforms and browser lifecycle; not a subjective listening test or physical-device audio validation.',
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      { passed: true, measurements, lifecycle: 'pause, mute, sliders, restart, blur, dispose' },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
