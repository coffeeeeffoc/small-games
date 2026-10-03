/**
 * Real Canvas 2D late-wave mechanism stress regression. Uses a separate canvas and imported
 * renderer/simulation; never mutates the running game's state or public debug API.
 * Each measured render is followed by getImageData to flush queued raster work.
 * Timings are machine-specific evidence, not a device-independent FPS promise.
 *
 * PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_PATH=/usr/bin/chromium \
 *   node tests/rendering.mjs
 * Optional: GAME_URL, QA_OUTPUT, RENDERER_BASELINE=/path/to/old-renderer.mjs,
 * RENDER_BASELINE_ONLY=1 (collect before-change evidence without new assertions).
 */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : '@playwright/test');
const origin = process.env.GAME_URL || 'http://127.0.0.1:4410';
const output = process.env.QA_OUTPUT || '/tmp/bullet-garden-mechanisms-rendering';
const baselineOnly = process.env.RENDER_BASELINE_ONLY === '1';
const baselineSource = process.env.RENDERER_BASELINE
  ? await readFile(process.env.RENDERER_BASELINE, 'utf8')
  : null;
assert.ok(!baselineOnly || baselineSource, 'baseline-only mode needs RENDERER_BASELINE');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const report = {
  date: new Date().toISOString(),
  browser: await browser.version(),
  timing: 'Real performance.now; getImageData raster flush after each measured render',
  contextLoss:
    'Synthetic contextlost/contextrestored events test recovery handlers; no real GPU loss induced',
  fixture:
    'Four passive terrains, five active effects at the 12-effect cap, 48 enemies with seven statuses, 120 mixed elemental/reflected/split projectiles, and 40 explosion/spawn telegraphs; legacy baseline uses its original terrain fixture',
  baselineComparison:
    'An optional legacy baseline lacks the new mechanisms; its timing is separate historical evidence, not an equivalent-load speedup claim',
  profiles: [],
  errors: [],
};
const profiles = [
  { name: 'phone-portrait', width: 390, height: 844, dpr: 3 },
  { name: 'phone-landscape', width: 844, height: 390, dpr: 3 },
  { name: 'desktop', width: 1440, height: 900, dpr: 2 },
  { name: 'large-desktop', width: 2560, height: 1440, dpr: 3 },
];

async function runProfile(profile, baseline) {
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: profile.dpr,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => report.errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') report.errors.push(message.text());
  });
  await page.route('**/__rendering_harness', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><head><link rel="icon" href="data:,"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}canvas{display:block;width:100%;height:100%}</style></head><body><canvas id="test-arena"></canvas></body></html>',
    }),
  );
  if (baseline)
    await page.route('**/src/__renderer_baseline.mjs', (route) =>
      route.fulfill({ contentType: 'text/javascript', body: baselineSource }),
    );
  await page.goto(`${origin}/__rendering_harness`);
  const metrics = await page.evaluate(
    async ({ baseline }) => {
      const { GardenRenderer } = await import(
        baseline ? '/src/__renderer_baseline.mjs' : '/src/renderer.mjs'
      );
      const { createGame } = await import('/src/simulation.mjs');
      const { BOONS, SKILLS, ENEMIES } = await import('/src/config.mjs');
      const canvas = document.getElementById('test-arena');
      const createElement = document.createElement.bind(document);
      const createdCanvases = [];
      document.createElement = function (tag, ...args) {
        const element = createElement(tag, ...args);
        if (String(tag).toLowerCase() === 'canvas') createdCanvases.push(element);
        return element;
      };
      const renderer = new GardenRenderer(canvas);
      const state = createGame('ruins');
      state.phase = 'playing';
      state.wave = 10;
      state.time = 290;
      state.player.x = 720;
      state.player.y = 450;
      const terrainKinds = ['thorn', 'trench', 'frost', 'poison'];
      const skillKinds = ['blast', 'gale', 'cart', 'horse', 'laser'];
      const statusKinds = [
        'frozen',
        'poison',
        'stunned',
        'feared',
        'vulnerable',
        'chillTime',
        'burnTime',
      ];
      const projectileVariants = {
        normal: { kind: 'normal' },
        thorn: { kind: 'thorn' },
        ice: { kind: 'normal', element: 'ice' },
        mushroom: { kind: 'mushroom' },
        enemy: { kind: 'enemy' },
        fire: { kind: 'normal', element: 'fire' },
        explosive: { kind: 'normal', element: 'explosive' },
        split: { kind: 'split' },
        reflected: { kind: 'normal', reflected: true },
        generation: { kind: 'normal', element: 'ice', generation: 1 },
      };
      const projectileKinds = Object.keys(projectileVariants);
      const boonByKind = Object.fromEntries(Object.values(BOONS).map((boon) => [boon.kind, boon]));
      function terrain(kind, x = 720, y = 450, id = 60) {
        const definition = boonByKind[kind];
        return {
          id,
          kind,
          x,
          y,
          radius: definition?.radius || 58,
          hp: 100,
          maxHp: 100,
          age: 5,
          life: definition?.life || 30,
        };
      }
      function effect(kind, x = 720, y = 450, id = 100, overrides = {}) {
        const definition = SKILLS[kind];
        const line = definition.shape === 'line';
        const age = definition.duration * 0.55;
        return {
          id,
          kind,
          x,
          y,
          startX: line ? x - 140 : state.player.x,
          startY: line ? y : state.player.y,
          targetX: line ? x + definition.range - 140 : x,
          targetY: y,
          dx: 1,
          dy: 0,
          age,
          life: definition.duration,
          duration: definition.duration,
          radius: definition.radius,
          width: definition.width,
          length: definition.range,
          hitIds: [],
          delay: definition.delay || 0,
          triggered: kind !== 'blast',
          ...overrides,
        };
      }
      state.loadout = { boon: 'shrub', skills: ['blast', 'gale'] };
      state.boons = Object.keys(BOONS);
      state.selectedSkill = 0;
      state.skillSlots = [
        { kind: 'blast', energy: 100 },
        { kind: 'gale', energy: 100 },
      ];
      state.enemies = Array.from({ length: 48 }, (_, i) => ({
        id: i + 1,
        kind: ['sprout', 'runner', 'brute'][i % 3],
        x: 150 + (i % 8) * 155,
        y: 190 + Math.floor(i / 8) * 104,
        hp: 60,
        maxHp: 100,
        radius: ENEMIES[['sprout', 'runner', 'brute'][i % 3]].radius,
        angle: i % 2 ? Math.PI : 0,
        hit: i % 5 ? 0 : 0.1,
        frozen: 0.9,
        freezeCooldown: 3,
        poison: 3,
        poisonDps: 10,
        stunned: 0.8,
        feared: 1.8,
        fearX: 720,
        fearY: 450,
        vulnerable: 4,
        slow: 0.4,
        chillTime: 2,
        burnTime: 2,
      }));
      state.plants = Array.from({ length: 18 }, (_, i) =>
        terrain(
          baseline ? ['thorn', 'ice', 'mushroom'][i % 3] : terrainKinds[i % 4],
          150 + (i % 6) * 220,
          245 + Math.floor(i / 6) * 205,
          60 + i,
        ),
      );
      state.skillEffects = baseline
        ? []
        : Array.from({ length: 12 }, (_, i) =>
            effect(
              skillKinds[i % skillKinds.length],
              235 + (i % 4) * 295,
              250 + Math.floor(i / 4) * 190,
              100 + i,
            ),
          );
      state.bullets = Array.from({ length: 120 }, (_, i) => ({
        ...(baseline
          ? { kind: ['normal', 'thorn', 'ice', 'mushroom'][i % 4] }
          : projectileVariants[projectileKinds[i % projectileKinds.length]]),
        x: 135 + (i % 24) * 49,
        y: 200 + Math.floor(i / 24) * 100,
        vx: 300 * Math.cos(i),
        vy: 300 * Math.sin(i),
      }));
      state.particles = Array.from({ length: 240 }, (_, i) => ({
        x: 140 + (i % 40) * 29,
        y: 190 + Math.floor(i / 40) * 95,
        size: 2 + (i % 7),
        color: '#edc45e',
        life: 0.3,
        maxLife: 0.5,
      }));
      state.floaters = Array.from({ length: 60 }, (_, i) => ({
        x: 180 + (i % 10) * 120,
        y: 160 + Math.floor(i / 10) * 100,
        life: 0.5,
        text: '10',
      }));
      state.telegraphs = Array.from({ length: baseline ? 6 : 40 }, (_, i) => ({
        x: baseline ? 200 + i * 205 : 180 + (i % 10) * 120,
        y: baseline ? (i % 2 ? 300 : 650) : 210 + Math.floor(i / 10) * 145,
        radius: baseline ? 70 : 40 + (i % 5) * 10,
        life: baseline ? 0.3 : 0.1 + (i % 5) * 0.025,
        kind: baseline ? (i % 2 ? 'explosion' : 'spawn') : i % 8 ? 'explosion' : 'spawn',
      }));
      const c = canvas.getContext('2d');
      function draw(frame) {
        for (const [i, enemy] of state.enemies.entries()) {
          enemy.id = frame * 48 + i;
          enemy.angle = (frame + i) % 2 ? Math.PI : 0;
          enemy.hit = (frame + i) % 5 ? 0 : 0.1;
        }
        for (const [i, item] of state.skillEffects.entries()) {
          const definition = SKILLS[item.kind];
          item.id = frame * 12 + i;
          item.age = (((frame + i * 7) % 60) / 60) * definition.duration;
          item.life = definition.duration;
          item.triggered = item.kind !== 'blast' || item.age >= item.delay;
          if (definition.shape === 'line' && item.kind !== 'laser') {
            const distance = Math.min(item.length, item.age * definition.speed);
            item.x = item.startX + item.dx * distance;
            item.y = item.startY + item.dy * distance;
          }
        }
        if (!baseline) {
          state.skillSlots[0].kind = skillKinds[frame % skillKinds.length];
          state.skillSlots[1].kind = skillKinds[(frame + 1) % skillKinds.length];
        }
        renderer.render(state, { aim: { x: 950, y: 450 }, planting: true, time: frame / 30 + 5 });
      }
      function flush() {
        // Chromium must materialize the canvas backing store for this readback.
        c.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1);
      }
      function canvasStats() {
        return {
          count: createdCanvases.length,
          pixels: createdCanvases.reduce((sum, item) => sum + item.width * item.height, 0),
        };
      }
      function backgroundPixels() {
        const pixels = [];
        for (const [x, y] of [
          [600, 450],
          [750, 450],
          [650, 350],
          [850, 550],
        ]) {
          const point = renderer.worldToScreen(x, y);
          const sx = Math.round(point.x * renderer.dpr);
          const sy = Math.round(point.y * renderer.dpr);
          if (sx < 0 || sx >= canvas.width || sy < 0 || sy >= canvas.height) continue;
          pixels.push([...c.getImageData(sx, sy, 1, 1).data]);
        }
        return pixels;
      }
      let coverage;
      if (!baseline) {
        // The isolated page owns this fixture. The actual game exposes no mutable
        // simulation hook: each image below is rendered from its imported modules.
        const clean = structuredClone(state);
        for (const key of [
          'enemies',
          'plants',
          'skillEffects',
          'bullets',
          'particles',
          'floaters',
          'telegraphs',
        ])
          clean[key] = [];
        const neutralEnemy = {
          id: 1,
          kind: 'sprout',
          x: 720,
          y: 450,
          hp: 100,
          maxHp: 100,
          radius: ENEMIES.sprout.radius,
          angle: Math.PI,
          hit: 0,
          frozen: 0,
          freezeCooldown: 0,
          poison: 0,
          poisonDps: 0,
          stunned: 0,
          feared: 0,
          fearX: 500,
          fearY: 450,
          vulnerable: 0,
          slow: 1,
          chillTime: 0,
          burnTime: 0,
        };
        function renderCase(group, kind, variant = 'active') {
          const fixture = structuredClone(clean);
          const options = { time: 5 };
          if (group === 'terrain') fixture.plants = [terrain(kind)];
          if (group === 'skill') {
            const definition = SKILLS[kind];
            const age = kind === 'blast' ? definition.delay + 0.12 : definition.duration * 0.45;
            fixture.skillEffects = [
              effect(kind, 720, 450, 100, {
                age: variant === 'waiting' ? definition.delay * 0.5 : age,
                triggered: variant !== 'waiting',
              }),
            ];
          }
          if (group === 'status') {
            fixture.player.x = 870;
            fixture.enemies = [{ ...neutralEnemy, [kind]: variant === 'expired' ? 0 : 2 }];
          }
          if (group === 'aim') {
            fixture.skillSlots = [
              { kind, energy: 100 },
              { kind: 'gale', energy: 100 },
            ];
            options.aim = { x: 890, y: 460 };
            options.planting = variant !== 'unarmed';
          }
          if (group === 'projectile')
            fixture.bullets = [
              {
                x: 720,
                y: 450,
                vx: 300,
                vy: 0,
                ...projectileVariants[kind],
              },
            ];
          renderer.render(fixture, options);
          flush();
        }
        function snapshot() {
          const topLeft = renderer.worldToScreen(500, 265);
          const bottomRight = renderer.worldToScreen(955, 630);
          const x = Math.max(0, Math.floor(topLeft.x * renderer.dpr));
          const y = Math.max(0, Math.floor(topLeft.y * renderer.dpr));
          const width = Math.min(canvas.width - x, Math.ceil(bottomRight.x * renderer.dpr) - x);
          const height = Math.min(canvas.height - y, Math.ceil(bottomRight.y * renderer.dpr) - y);
          return c.getImageData(x, y, width, height).data;
        }
        function compare(before, after) {
          if (before.length !== after.length) throw new Error('Coverage camera moved unexpectedly');
          let changedPixels = 0;
          let signature = 2166136261;
          for (let i = 0; i < before.length; i += 4) {
            if (
              Math.abs(before[i] - after[i]) +
                Math.abs(before[i + 1] - after[i + 1]) +
                Math.abs(before[i + 2] - after[i + 2]) >
              8
            ) {
              changedPixels++;
              signature =
                Math.imul(
                  signature ^ i ^ after[i] ^ (after[i + 1] << 8) ^ (after[i + 2] << 16),
                  16777619,
                ) >>> 0;
            }
          }
          return { changedPixels, signature };
        }
        renderCase('empty');
        const empty = snapshot();
        coverage = { terrain: [], skills: [], statuses: [], aiming: [], projectiles: [] };
        for (const kind of terrainKinds) {
          renderCase('terrain', kind);
          coverage.terrain.push({ kind, ...compare(empty, snapshot()) });
        }
        for (const kind of skillKinds) {
          renderCase('skill', kind);
          coverage.skills.push({ kind, phase: 'active', ...compare(empty, snapshot()) });
        }
        renderCase('skill', 'blast', 'waiting');
        coverage.skills.push({ kind: 'blast', phase: 'waiting', ...compare(empty, snapshot()) });
        for (const kind of statusKinds) {
          renderCase('status', kind, 'expired');
          const untreated = snapshot();
          renderCase('status', kind);
          const active = compare(untreated, snapshot());
          renderCase('status', kind, 'expired');
          coverage.statuses.push({
            kind,
            ...active,
            expiredChangedPixels: compare(untreated, snapshot()).changedPixels,
          });
        }
        for (const kind of skillKinds) {
          renderCase('aim', kind, 'unarmed');
          const unarmed = snapshot();
          renderCase('aim', kind);
          coverage.aiming.push({ kind, ...compare(unarmed, snapshot()) });
        }
        for (const kind of projectileKinds) {
          renderCase('projectile', kind);
          coverage.projectiles.push({ kind, ...compare(empty, snapshot()) });
        }
        renderCase('empty');
        coverage.clearedChangedPixels = compare(empty, snapshot()).changedPixels;
        window.__renderingHarness = {
          renderCase,
          gallery(group) {
            const fixture = structuredClone(clean);
            fixture.player.x = 720;
            fixture.player.y = 710;
            if (group === 'terrain') {
              fixture.plants = terrainKinds.map((kind, i) =>
                terrain(kind, 360 + i * 240, 440, 60 + i),
              );
            }
            if (group === 'skills') {
              fixture.skillEffects = [
                effect('blast', 380, 330, 100, { age: SKILLS.blast.delay + 0.12, triggered: true }),
                effect('gale', 900, 330, 101),
                effect('cart', 440, 500, 102),
                effect('horse', 980, 500, 103),
                effect('laser', 280, 680, 104, { startX: 280, targetX: 280 + SKILLS.laser.range }),
              ];
            }
            if (group === 'statuses') {
              fixture.enemies = statusKinds.map((kind, i) => ({
                ...neutralEnemy,
                x: 270 + i * 150,
                [kind]: 2,
              }));
            }
            if (group === 'projectiles') {
              fixture.bullets = projectileKinds.map((kind, i) => ({
                x: 245 + i * 105,
                y: 450,
                vx: 300,
                vy: 0,
                ...projectileVariants[kind],
              }));
            }
            renderer.render(fixture, { time: 5 });
            flush();
          },
        };
      }
      const warmFrames = baseline ? 6 : 180;
      for (let frame = 0; frame < warmFrames; frame++) {
        draw(frame);
        flush();
      }
      const warmedCanvases = canvasStats();
      const timings = [];
      for (let frame = warmFrames; frame < warmFrames + 36; frame++) {
        const start = performance.now();
        draw(frame);
        flush();
        timings.push(performance.now() - start);
      }
      const stressPixels = backgroundPixels();
      for (let frame = warmFrames + 36; frame < warmFrames + (baseline ? 48 : 360); frame++) {
        draw(frame);
        flush();
      }
      const finalCanvases = canvasStats();
      const backingStore = {
        width: canvas.width,
        height: canvas.height,
        pixels: canvas.width * canvas.height,
      };
      const ordered = [...timings].sort((a, b) => a - b);
      const result = {
        entities: {
          enemies: 48,
          plants: 18,
          bullets: 120,
          particles: 240,
          floaters: 60,
          telegraphs: state.telegraphs.length,
          skillEffects: state.skillEffects.length,
        },
        coveredKinds: {
          terrain: [...new Set(state.plants.map((plant) => plant.kind))],
          skills: [...new Set(state.skillEffects.map((item) => item.kind))],
          enemyStatuses: baseline ? [] : statusKinds,
          projectiles: baseline ? ['normal', 'thorn', 'ice', 'mushroom'] : projectileKinds,
        },
        coverage,
        measuredFrames: timings.length,
        totalFrames: warmFrames + (baseline ? 48 : 360),
        meanMs: timings.reduce((sum, value) => sum + value, 0) / timings.length,
        medianMs: ordered[Math.floor(ordered.length / 2)],
        p95Ms: ordered[Math.floor(ordered.length * 0.95)],
        backingStore,
        warmedCanvases,
        finalCanvases,
        stressPixels,
      };
      if (!baseline) {
        // Deterministic lifecycle coverage; dispatching events is not a real GPU loss.
        const beforeRestore = canvasStats().count;
        const lost = new Event('contextlost', { cancelable: true });
        canvas.dispatchEvent(lost);
        const lossDetected = renderer.contextLost;
        // Erase the old backing stores as a real context loss would.
        canvas.width = canvas.width;
        for (const cached of createdCanvases) cached.width = cached.width;
        draw(900);
        canvas.dispatchEvent(new Event('contextrestored'));
        draw(901);
        flush();
        result.syntheticContextRecovery = {
          lossDetected,
          restored: !renderer.contextLost,
          canvasesCreated: canvasStats().count - beforeRestore,
          pixels: backgroundPixels(),
        };
        const beforeArtworkRestore = canvasStats().count;
        renderer.backdrop.width = renderer.backdrop.width;
        renderer.backdrop.dispatchEvent(new Event('contextrestored'));
        draw(902);
        flush();
        result.syntheticArtworkRecovery = {
          canvasesCreated: canvasStats().count - beforeArtworkRestore,
          pixels: backgroundPixels(),
        };
        canvas.style.width = '80vw';
        canvas.style.height = '80vh';
        renderer.resize();
        draw(902);
        flush();
        result.resized = {
          width: canvas.width,
          height: canvas.height,
          pixels: canvas.width * canvas.height,
          background: backgroundPixels(),
        };
        canvas.style.width = '100vw';
        canvas.style.height = '100vh';
        renderer.resize();
        draw(903);
        flush();
      }
      document.createElement = createElement;
      return result;
    },
    { baseline },
  );
  if (!baseline) {
    await page.screenshot({ path: `${output}/${profile.name}.png` });
    if (profile.name === 'desktop') {
      for (const group of ['terrain', 'skills', 'statuses', 'projectiles']) {
        await page.evaluate((kind) => window.__renderingHarness.gallery(kind), group);
        await page.screenshot({ path: `${output}/${group}-gallery.png` });
      }
      for (const kind of ['blast', 'gale', 'cart', 'horse', 'laser']) {
        await page.evaluate((skill) => window.__renderingHarness.renderCase('aim', skill), kind);
        await page.screenshot({ path: `${output}/aim-${kind}.png` });
      }
      await page.evaluate(() => window.__renderingHarness.renderCase('skill', 'blast', 'waiting'));
      await page.screenshot({ path: `${output}/blast-waiting.png` });
    }
  }
  await context.close();
  return metrics;
}

function assertColored(pixels, label) {
  assert.ok(pixels.length >= 2, `${label}: visible background sample points`);
  assert.ok(
    pixels.every((rgba) => rgba[3] === 255),
    `${label}: opaque backing store`,
  );
  assert.ok(
    pixels.filter(
      ([r, g, b]) => Math.max(r, g, b) > 45 && Math.max(r, g, b) - Math.min(r, g, b) > 8,
    ).length >= 2,
    `${label}: arena remains colored rather than black (${JSON.stringify(pixels)})`,
  );
}
try {
  for (const profile of profiles) {
    const result = { ...profile };
    report.profiles.push(result);
    if (baselineSource) result.baseline = await runProfile(profile, true);
    if (!baselineOnly) {
      result.current = await runProfile(profile, false);
      const current = result.current;
      assertColored(current.stressPixels, `${profile.name} sustained combat`);
      assert.deepEqual(
        current.coveredKinds.terrain,
        ['thorn', 'trench', 'frost', 'poison'],
        `${profile.name}: all terrain types in stress fixture`,
      );
      assert.deepEqual(
        current.coveredKinds.skills,
        ['blast', 'gale', 'cart', 'horse', 'laser'],
        `${profile.name}: all active skills in stress fixture`,
      );
      assert.equal(
        current.entities.skillEffects,
        12,
        `${profile.name}: maximum concurrent active effects`,
      );
      assert.equal(
        current.entities.telegraphs,
        40,
        `${profile.name}: capped explosion/spawn visual pressure`,
      );
      for (const [group, entries] of Object.entries(current.coverage)) {
        if (!Array.isArray(entries)) continue;
        for (const entry of entries) {
          assert.ok(
            entry.changedPixels > 20,
            `${profile.name} ${group}/${entry.kind}/${entry.phase || 'active'}: visible artwork (${entry.changedPixels} changed pixels)`,
          );
          if ('expiredChangedPixels' in entry)
            assert.equal(
              entry.expiredChangedPixels,
              0,
              `${profile.name} ${entry.kind}: expired status leaves no stale pixels`,
            );
        }
        assert.equal(
          new Set(entries.map((entry) => entry.signature)).size,
          entries.length,
          `${profile.name} ${group}: each mechanism and phase has distinct artwork`,
        );
      }
      assert.equal(
        current.coverage.clearedChangedPixels,
        0,
        `${profile.name}: removing mechanisms restores the unaltered field`,
      );
      assert.ok(
        current.backingStore.pixels <= 4_005_000,
        `${profile.name}: 4M backing-store pixel budget`,
      );
      assert.ok(
        current.finalCanvases.pixels <= 4_005_000,
        `${profile.name}: bounded offscreen artwork pixel budget`,
      );
      assert.deepEqual(
        current.finalCanvases,
        current.warmedCanvases,
        `${profile.name}: cache allocation stabilizes despite new entity IDs and animation times`,
      );
      assert.ok(
        current.syntheticContextRecovery.lossDetected,
        `${profile.name}: context loss suspends rendering`,
      );
      assert.ok(
        current.syntheticContextRecovery.restored,
        `${profile.name}: context restore resumes rendering`,
      );
      assert.ok(
        current.syntheticContextRecovery.canvasesCreated > 0,
        `${profile.name}: restore recreates drawable caches`,
      );
      assertColored(
        current.syntheticContextRecovery.pixels,
        `${profile.name} synthetic context restore`,
      );
      assert.ok(
        current.syntheticArtworkRecovery.canvasesCreated > 0,
        `${profile.name}: erased offscreen artwork recreates caches`,
      );
      assertColored(
        current.syntheticArtworkRecovery.pixels,
        `${profile.name} offscreen artwork restore`,
      );
      assert.ok(
        current.resized.pixels <= 4_005_000,
        `${profile.name}: resize respects pixel budget`,
      );
      assertColored(current.resized.background, `${profile.name} resize`);
    }
    const timing = result.current || result.baseline;
    console.log(
      `PASS ${profile.name} ${baselineOnly ? 'baseline' : 'rendering'} median=${timing.medianMs.toFixed(1)}ms p95=${timing.p95Ms.toFixed(1)}ms`,
    );
  }
  assert.deepEqual(report.errors, [], 'no browser JavaScript or console errors');
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = error.stack;
  throw error;
} finally {
  await writeFile(`${output}/rendering-report.json`, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  console.log(`Evidence: ${output}/rendering-report.json`);
}
