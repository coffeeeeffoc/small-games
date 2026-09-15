import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

const output = new URL('../../../../.scratch/night-merge-combat/', import.meta.url);
await mkdir(output, { recursive: true });
const server = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)),
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
});
await server.listen();
const url = `http://127.0.0.1:${server.httpServer.address().port}/`;
const executablePath =
  process.env.PLAYWRIGHT_EXECUTABLE_PATH ??
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(existsSync);
const browser = await chromium.launch({ executablePath, headless: true });
const errors = [];
const results = [];
const files = [];
function watch(page) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
}
async function capture(page, name) {
  const path = fileURLToPath(new URL(name, output));
  await page.screenshot({ path, fullPage: true });
  files.push(path);
}
const slot = (page, area, index) => page.locator(`[data-area="${area}"][data-slot="${index}"]`);
async function waitAttack(page, phase) {
  for (let i = 0; i < 700; i++) {
    if ((await slot(page, 'field', 1).getAttribute('data-attack')) === phase) return;
    await page.clock.runFor(20);
  }
  assert.fail(`UI never reached ${phase}`);
}
const motion = (page) =>
  slot(page, 'field', 1).evaluate((element) => ({
    phase: element.dataset.attack,
    value: element.style.getPropertyValue('--guard-motion'),
    transform: getComputedStyle(element.querySelector('.unit-portrait')).transform,
  }));

try {
  // Real application: all game state comes from player input, never fixture injection.
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion,
    });
    const page = await context.newPage();
    watch(page);
    await page.goto(url);
    await expect(page).toHaveTitle('合成守夜人 · 守到天明');
    await page.locator('#start-night').tap();
    await slot(page, 'board', 0).tap();
    await slot(page, 'board', 1).tap();
    await expect(slot(page, 'board', 1)).toHaveAttribute('aria-label', /2 阶/);
    await slot(page, 'board', 1).tap();
    await slot(page, 'field', 1).tap();
    await expect(slot(page, 'field', 1)).toHaveClass(/occupied/);
    await page.locator('#begin-wave').tap();
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await waitAttack(page, 'windup');
    const windup = await motion(page);
    await capture(page, `ui-${reducedMotion}-windup.png`);
    await page.clock.runFor(40);
    const later = await motion(page);
    if (reducedMotion === 'no-preference') {
      assert.notEqual(windup.value, later.value, 'guard anticipation advances with simulation');
      assert.notEqual(windup.transform, later.transform, 'portrait visibly moves during attack');
    } else {
      assert.equal(windup.value, later.value, 'reduced motion keeps the guard pose still');
      assert.equal(windup.transform, 'matrix(1, 0, 0, 1, 0, 0)');
    }
    await waitAttack(page, 'flight');
    await capture(page, `ui-${reducedMotion}-flight.png`);
    await page.getByRole('button', { name: '暂停游戏', exact: true }).tap();
    const frozen = await motion(page);
    await page.clock.runFor(200);
    assert.deepEqual(await motion(page), frozen, 'pause freezes the attack pose');
    await page.getByRole('button', { name: '继续守夜', exact: true }).tap();
    await page.clock.runFor(280);
    assert.notDeepEqual(await motion(page), frozen, 'resume progresses the attack');
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    assert.equal(
      await page
        .locator('body')
        .innerText()
        .then((text) => text.includes('\ufffd')),
      false,
    );
    results.push({
      test: 'real mobile merge/deploy/attack/pause/resume',
      reducedMotion,
      windup,
      later,
      frozen,
    });
    await context.close();
  }

  // Isolated renderer fixture: deterministic test-only battle state; production has no debug hooks.
  const context = await browser.newContext({ viewport: { width: 1560, height: 1200 } });
  const page = await context.newPage();
  watch(page);
  await page.route('**/combat-fixture', (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><html lang="zh"><meta charset="UTF-8"><title>Night Merge renderer fixture</title><body style="margin:0;background:#102c2d;color:#eee;font:16px sans-serif"></body></html>',
    }),
  );
  await page.goto(`${url}combat-fixture`);
  await page.evaluate(async () => {
    const game = await import('/src/game.ts');
    const art = await import('/src/art.ts');
    const kinds = ['archer', 'shield', 'mage', 'frost'];
    const make = (kind, hp = 160) => {
      const state = game.createGame(0, () => 0.5);
      state.board[0].kind = kind;
      state.board[0].level = 3;
      game.moveUnit(state, { area: 'board', index: 0 }, { area: 'field', index: 1 });
      game.beginWave(state);
      state.spawned = state.spawnTotal;
      state.enemies = [
        {
          id: state.nextId++,
          kind: 'armored',
          x: 0.375,
          y: 0.55,
          hp,
          maxHp: hp,
          speed: 0,
          damage: 0,
          attackTimer: 100,
          slow: 0,
          boss: false,
        },
      ];
      return state;
    };
    const advance = (state, condition) => {
      for (let i = 0; i < 200 && !condition(); i++) game.tick(state, 0.02);
      if (!condition()) throw new Error('Fixture phase not reached');
    };
    const snapshots = {};
    const checks = [];
    for (const kind of kinds) {
      const state = make(kind);
      advance(state, () => state.shots.length > 0);
      game.tick(state, 0.04);
      const hp = state.enemies[0].hp;
      snapshots[`${kind}-windup`] = structuredClone(state);
      advance(state, () => state.shots[0]?.released === true);
      game.tick(state, 0.04);
      snapshots[`${kind}-flight`] = structuredClone(state);
      if (state.enemies[0].hp !== hp) throw new Error(`${kind}: damage before projectile arrival`);
      while (state.shots[0].life > 0.020001) {
        game.tick(state, 0.02);
        if (state.enemies[0].hp !== hp) throw new Error(`${kind}: damage during flight`);
      }
      advance(state, () => state.impacts.length > 0);
      game.tick(state, 0.04);
      snapshots[`${kind}-impact`] = structuredClone(state);
      if (state.enemies[0].hp >= hp) throw new Error(`${kind}: missing impact damage`);
      const dead = make(kind, 1);
      advance(dead, () => dead.impacts.some((impact) => impact.killed));
      game.tick(dead, 0.12);
      if (dead.enemies.length || !dead.impacts.some((impact) => impact.killed))
        throw new Error(`${kind}: death erased impact feedback`);
      snapshots[`${kind}-death`] = structuredClone(dead);
      checks.push({
        kind,
        hpBeforeImpact: hp,
        hpAfterImpact: state.enemies[0].hp,
        attack: state.events.filter((event) =>
          ['attack_start', 'attack_release', 'hit'].includes(event.type),
        ),
        deathFeedback: dead.impacts[0].life,
      });
    }
    for (const kind of ['ogre', 'nightlord']) {
      const state = make('mage', 1);
      state.enemies[0].kind = kind;
      state.enemies[0].boss = true;
      advance(state, () => state.impacts.some((impact) => impact.killed));
      game.tick(state, 0.12);
      if (!state.impacts[0]?.boss) throw new Error(`${kind}: missing boss death feedback`);
      snapshots[`${kind}-death`] = structuredClone(state);
    }
    const crowded = make('mage', 1);
    crowded.enemies = Array.from({ length: 140 }, (_, i) => ({
      ...crowded.enemies[0],
      id: crowded.nextId++,
      x: ((i % 14) + 1) / 16,
      y: 0.2 + Math.floor(i / 14) * 0.04,
    }));
    game.castSkill(crowded);
    if (crowded.impacts.length > 96) throw new Error('Impact feedback exceeded bounded pool');
    game.tick(crowded, 1.2);
    if (crowded.impacts.length) throw new Error('Expired feedback did not clear');
    window.fixture = { game, art, kinds, make, snapshots, checks };
  });
  results.push({
    test: 'deterministic per-kind impact timing and death feedback',
    checks: await page.evaluate(() => window.fixture.checks),
  });
  results.push({
    test: '140 simultaneous skill hits bound impacts to 96 and clear expired effects',
  });
  for (const [width, reducedMotion] of [
    [320, false],
    [390, false],
    [720, false],
    [390, true],
  ]) {
    await page.setViewportSize({ width: width * 4, height: 1240 });
    await page.evaluate(
      ({ width, reducedMotion }) => {
        const { kinds, art, snapshots } = window.fixture;
        document.body.replaceChildren();
        const height = width === 720 ? 340 : 280;
        const sheet = document.createElement('main');
        sheet.style.cssText = `display:grid;grid-template-columns:repeat(4,${width}px)`;
        const samples = kinds.flatMap((kind) =>
          ['windup', 'flight', 'impact', 'death'].map((phase) => ({ kind, phase })),
        );
        samples.push({ kind: 'ogre', phase: 'death' }, { kind: 'nightlord', phase: 'death' });
        for (const { kind, phase } of samples) {
          const card = document.createElement('section');
          const label = document.createElement('div');
          label.textContent = `${kind} · ${phase} · ${width}px${reducedMotion ? ' · reduced' : ''}`;
          label.style.cssText = 'padding:8px;background:#193838';
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const state = snapshots[`${kind}-${phase}`];
          art.drawBattle(
            canvas.getContext('2d'),
            state,
            state.elapsed,
            width,
            height,
            reducedMotion,
          );
          card.append(label, canvas);
          sheet.append(card);
        }
        document.body.append(sheet);
      },
      { width, reducedMotion },
    );
    await capture(page, `contact-${width}${reducedMotion ? '-reduced' : ''}.png`);
  }
  const recording = await page.evaluate(async () => {
    const { game, art, kinds, make } = window.fixture;
    document.body.replaceChildren();
    const canvas = document.createElement('canvas');
    canvas.width = 780;
    canvas.height = 640;
    document.body.append(canvas);
    const context = canvas.getContext('2d');
    const states = kinds.map((kind) => make(kind, 220));
    const stream = canvas.captureStream(30);
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((type) =>
      MediaRecorder.isTypeSupported(type),
    );
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const finished = new Promise((resolve) => (recorder.onstop = resolve));
    recorder.start();
    const started = performance.now();
    let previous = started;
    await new Promise((resolve) => {
      function frame(now) {
        const dt = Math.min(0.05, (now - previous) / 1000);
        previous = now;
        states.forEach((state, i) => {
          game.tick(state, dt);
          context.save();
          context.translate((i % 2) * 390, Math.floor(i / 2) * 320);
          context.beginPath();
          context.rect(0, 0, 390, 320);
          context.clip();
          art.drawBattle(context, state, state.elapsed, 390, 320);
          context.fillStyle = '#f2e7c5';
          context.font = '16px sans-serif';
          context.fillText(kinds[i], 14, 24);
          context.restore();
        });
        if (now - started < 3600) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
    recorder.stop();
    await finished;
    stream.getTracks().forEach((track) => track.stop());
    const bytes = new Uint8Array(await new Blob(chunks, { type: mimeType }).arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 32768)
      binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(binary);
  });
  const videoPath = fileURLToPath(new URL('four-guards.webm', output));
  await writeFile(videoPath, Buffer.from(recording, 'base64'));
  files.push(videoPath);
  await capture(page, 'four-guards-video-final.png');
  await context.close();
  assert.deepEqual(errors, []);
  const report = {
    url,
    results,
    errors,
    files,
    note: 'Chromium mobile emulation via real UI plus separate deterministic renderer fixtures. Contact sheets and video require visual review; this does not establish physical-device performance.',
  };
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await server.close();
}
