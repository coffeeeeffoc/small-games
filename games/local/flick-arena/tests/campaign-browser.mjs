import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { createMatch, chooseBot, seeded } from '../src/core.mjs';
import { levels } from '../src/levels.mjs';
import { W, H, arena } from '../src/render.mjs';
import { saveKey } from '../src/progress.mjs';

// This test drives the built game with CDP touch input. Displayed state is read-only;
// it never changes the game's state, grants progress, or substitutes a room service.
const root = new URL('../', import.meta.url);
const out = new URL(
  process.env.FLICK_VALIDATION_DIR ?? '../docs/design/campaign-friends-2026-10-11/',
  import.meta.url,
);
const origin = 'http://127.0.0.1:4428/';
const api = process.env.FLICK_COMPETITION_API;
const focus = Number(process.env.FLICK_FOCUS_ONLINE || 0);
assert([0, 2, 3, 4].includes(focus), 'FLICK_FOCUS_ONLINE must be 2, 3 or 4');
assert(!focus || api, 'Focused online checks need a real FLICK_COMPETITION_API');
const errors = [];
const records = {
  environment: 'Chromium desktop emulation, 390×844 touch, DPR 1',
  realDevice: false,
  stateWasManuallyReplaced: false,
  online: api
    ? { transport: 'real runtime HTTP API and PostgreSQL' }
    : { skipped: 'Set FLICK_COMPETITION_API to a real runtime API.' },
};
await mkdir(out, { recursive: true });
const server = spawn(process.execPath, ['server.mjs', '--dist', '--port', '4428'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve, reject) => {
  server.stdout.once('data', resolve);
  server.once('error', reject);
  server.once('exit', (code) => reject(new Error(`Game server exited ${code}`)));
});
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
async function client({ clock = false, suffix = '' } = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  if (api)
    await context.addInitScript((apiUrl) => {
      globalThis.__COMPETITION_CONFIG__ = { apiUrl, game: 'flick-arena' };
    }, api);
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  if (clock) {
    await page.clock.install({ time: new Date('2026-10-11T15:00:00Z') });
    await page.clock.pauseAt(new Date('2026-10-11T15:00:01Z'));
  }
  await page.goto(origin + suffix);
  const session = await context.newCDPSession(page);
  const advance = (ms) => (clock ? page.clock.runFor(ms) : page.waitForTimeout(ms));
  const phase = () => page.locator('body').getAttribute('data-phase');
  const screenshot = (name) =>
    page.screenshot({ path: new URL(`actual-${name}.png`, out).pathname });
  const touch = (type, points) =>
    session.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map(([x, y, id], index) => ({ x, y, id: id ?? index })),
    });
  const map = ([x, y]) =>
    page.locator('#game').evaluate(
      (canvas, { x, y, W, H }) => {
        const box = canvas.getBoundingClientRect();
        const scale = Math.min(box.width / W, box.height / H);
        return [
          box.x + (box.width - W * scale) / 2 + x * scale,
          box.y + (box.height - H * scale) / 2 + y * scale,
        ];
      },
      { x, y, W, H },
    );
  const position = (disc) => [arena.x + disc.x * arena.scale, arena.y + disc.y * arena.scale];
  const visible = () =>
    page.locator('#game').evaluate((canvas) => ({
      ...canvas.dataset,
      discs: JSON.parse(canvas.dataset.discs || '[]'),
      state: JSON.parse(canvas.dataset.visibleState || 'null'),
      series: JSON.parse(canvas.dataset.series || 'null'),
      room: JSON.parse(canvas.dataset.room || 'null'),
    }));
  const stored = () =>
    page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), saveKey);
  async function flick(disc, move, { cancel = false } = {}) {
    const from = position(disc);
    const magnitude = Math.hypot(move.x, move.y);
    const to = [
      from[0] - (move.x / magnitude) * move.power * 115,
      from[1] - (move.y / magnitude) * move.power * 115,
    ];
    await touch('touchStart', [await map(from)]);
    await advance(20);
    await touch('touchMove', [await map(to)]);
    await advance(20);
    await touch(cancel ? 'touchCancel' : 'touchEnd', []);
    await advance(32);
  }
  function predict(displayed, layout = levels[0]) {
    if (displayed.state) return chooseBot(displayed.state, seeded(Number(displayed.shots) + 80));
    const match = createMatch(layout, 200);
    match.discs = displayed.discs.map((disc) => ({
      ...disc,
      vx: 0,
      vy: 0,
      fall: disc.alive ? 0 : 1,
    }));
    match.turn = Number(displayed.turn);
    match.shots = Number(displayed.shots);
    match.active = Number(displayed.active);
    match.radius = Number(displayed.radius);
    return chooseBot(match, seeded(match.shots + 80));
  }
  return {
    context,
    page,
    advance,
    phase,
    screenshot,
    touch,
    map,
    position,
    visible,
    stored,
    flick,
    predict,
  };
}

try {
  assert.equal(levels.length, 120);
  if (!focus) {
    const solo = await client({ clock: true });
    const { page } = solo;
    await solo.screenshot('home');
    assert.equal(await page.evaluate(() => typeof window.__flickArena), 'undefined');
    await page.locator('#levels').tap();
    await solo.screenshot('levels');
    assert(await page.locator(`#level-${levels[1].id}`).isDisabled(), 'later levels begin locked');
    await page.locator('#home').tap();
    await page.locator('#start').tap();
    await solo.screenshot('briefing');
    await page.locator('#play-level').tap();
    await solo.advance(1400);
    assert.equal(await solo.phase(), 'playing');
    await solo.screenshot('play');
    const initial = await solo.visible();
    const initialMove = solo.predict(initial);
    await solo.flick(initial.discs[0], initialMove, { cancel: true });
    assert.equal((await solo.visible()).shots, '0', 'cancelled touch cannot spend a shot');
    await page.locator('#pause').tap();
    const paused = (await solo.visible()).state;
    await solo.advance(4000);
    assert.deepEqual((await solo.visible()).state, paused, 'pause freezes the complete match');
    await solo.screenshot('pause');
    await page.locator('#resume').tap();
    let campaignShots = 0;
    let attempts = 0;
    let unlocked = false;
    while (!unlocked && attempts++ < 5) {
      for (let step = 0; step < 100 && (await solo.phase()) === 'playing'; step++) {
        const displayed = await solo.visible();
        if (displayed.physicsPhase === 'aim' && Number(displayed.active) === 0) {
          await solo.flick(displayed.discs[0], solo.predict(displayed));
          campaignShots++;
        }
        await solo.advance(3000);
      }
      assert.equal(await solo.phase(), 'result', 'real touch play reaches campaign settlement');
      const save = await solo.stored();
      unlocked = Boolean(save?.campaign?.levels?.[levels[0].id]?.stars);
      if (!unlocked) {
        await page.locator('#retry').tap();
        await solo.advance(1400);
      }
    }
    assert(unlocked, 'first campaign level is won through touch inputs');
    await solo.screenshot('campaign-result');
    const campaignSave = await solo.stored();
    if (await page.locator('#replay').count()) {
      await page.locator('#replay').tap();
      await solo.advance(300);
      await solo.screenshot('replay');
      await page.locator('#result').tap();
      assert.deepEqual(await solo.stored(), campaignSave, 'replay does not award twice');
    }
    await page.locator('#next-level').tap();
    await page.locator('#play-level').tap();
    await solo.advance(1400);
    assert.equal((await solo.visible()).levelId, levels[1].id);
    await page.locator('#pause').tap();
    await page.locator('#home').tap();
    await page.reload();
    await page.locator('#levels').tap();
    assert.equal(
      await page.locator(`#level-${levels[1].id}`).isDisabled(),
      false,
      'reload restores next level unlock',
    );
    assert.equal(
      await page.locator(`#level-${levels[2].id}`).isDisabled(),
      true,
      'unplayed later level stays locked',
    );
    await solo.screenshot('progress-restored');
    await page.locator('#home').tap();
    records.campaign = {
      attempts,
      touchShots: campaignShots,
      firstLevelStars: campaignSave.campaign.levels[levels[0].id].stars,
      nextLevelUnlocked: true,
      restoredAfterReload: true,
    };

    console.log('Campaign touch flow passed:', records.campaign);
    await page.locator('#friends').tap();
    await solo.screenshot('friends');
    await page.locator('#local2').tap();
    await solo.advance(1400);
    await solo.screenshot('local-duel');
    let localShots = 0;
    const firstPlayers = new Map();
    for (let loop = 0; loop < 80; loop++) {
      const displayed = await solo.visible();
      if (displayed.series)
        firstPlayers.set(displayed.series.current.roundId, displayed.series.current.firstPlayerId);
      if (displayed.series?.phase === 'finished') break;
      if (displayed.series?.phase === 'round-result') {
        await solo.screenshot('local-round-result');
        await page.locator('#next-round').tap();
        await solo.advance(1400);
        continue;
      }
      if (displayed.physicsPhase === 'aim') {
        const disc = displayed.discs[Number(displayed.active)];
        const move =
          disc.id === 0
            ? { x: disc.x, y: disc.y, power: 1 }
            : { x: -disc.x || 1, y: -disc.y, power: 0.24 };
        await solo.flick(disc, move);
        localShots++;
      }
      await solo.advance(1800);
    }
    const localFinal = await solo.visible();
    assert.equal(
      localFinal.series?.phase,
      'finished',
      'same-device best-of-three reaches champion',
    );
    assert.equal(Math.max(...Object.values(localFinal.series.wins)), 2);
    assert.deepEqual(
      [...firstPlayers.values()],
      ['player-1', 'player-2'],
      'each local round swaps the first player',
    );
    assert(localShots >= 2, 'both rounds use real touch gestures');
    await solo.screenshot('local-champion');
    assert.deepEqual(
      await solo.stored(),
      campaignSave,
      'friend series never advances campaign saves',
    );
    records.local = {
      rounds: localFinal.series.history.length,
      touchShots: localShots,
      winnerId: localFinal.series.winnerId,
      wins: localFinal.series.wins,
      firstPlayers: [...firstPlayers.values()],
    };
    console.log('Same-device touch series passed:', records.local);
    await page.locator('#rematch').tap();
    await solo.advance(1400);
    assert.equal((await solo.visible()).series.history.length, 0, 'rematch resets series scores');
    await page.locator('#pause').tap();
    await page.locator('#home').tap();
    await page.setViewportSize({ width: 320, height: 568 });
    await page.locator('#levels').tap();
    await solo.screenshot('small-screen-levels');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin + '?dev=1');
    const terrainChecks = [];
    for (const index of [10, 12, 15, 19]) {
      await page.getByRole('button', { name: '开发者调试', exact: true }).tap();
      await page.locator(`[data-dev-action="level-${levels[index].id}"]`).tap();
      await page.locator('[data-close]').tap();
      await solo.advance(100);
      const displayed = await solo.visible();
      assert.equal(displayed.levelId, levels[index].id);
      for (const field of ['obstacles', 'ice', 'gaps']) {
        assert.equal(displayed.state[field].length, levels[index][field].length);
      }
      await solo.screenshot(`terrain-${index + 1}`);
      await solo.flick(displayed.discs[0], solo.predict(displayed, levels[index]));
      assert.equal(
        Number((await solo.visible()).shots),
        1,
        'terrain level accepts one real touch shot',
      );
      await solo.advance(1800);
      terrainChecks.push(levels[index].id);
    }
    assert.deepEqual(
      await solo.stored(),
      campaignSave,
      'developer terrain play preserves normal progress',
    );
    records.terrain = { developerMenuOnly: true, realTouchLevels: terrainChecks };
    await solo.context.close();
  }

  if (api) {
    for (const count of focus ? [focus] : [2, 3, 4]) {
      const players = [];
      for (let index = 0; index < count; index++) players.push(await client());
      const host = players[0];
      await host.page.locator('#friends').tap();
      await host.page.locator('#online-create').tap();
      await host.page.locator(`#room-size-${count}`).tap();
      await host.page.locator('#create-room').tap();
      await host.page.locator('#ready').waitFor();
      const code = (await host.visible()).room.code;
      assert.match(code, /^[A-F0-9]{12}$/);
      for (const player of players.slice(1)) {
        await player.page.locator('#friends').tap();
        await player.page.locator('#online-join').tap();
        await player.page.locator('#room-code').fill(code);
        await player.page.locator('#join-room').tap();
        await player.page.locator('#ready').waitFor();
      }
      await host.screenshot(`online-${count}-room`);
      const ids = await Promise.all(
        players.map((player) =>
          player.page.evaluate(async () => (await window.__competition.session()).playerId),
        ),
      );
      assert.equal(
        new Set(ids).size,
        count,
        'every browser has an independent server-issued identity',
      );
      for (const player of players) await player.page.locator('#ready').tap();
      for (const player of players)
        await player.page.locator('body[data-phase="playing"]').waitFor();
      if (count === 2) {
        await host.page.reload();
        await host.page.locator('body[data-phase="playing"]').waitFor();
        assert.equal(
          (await host.visible()).room.code,
          code,
          'reload restores the same online room',
        );
        assert.equal(
          await host.page.evaluate(async () => (await window.__competition.session()).playerId),
          ids[0],
          'reload preserves the server identity',
        );
      }
      await host.screenshot(`online-${count}-play`);
      let touchShots = 0;
      let observedRound = 0;
      const started = Date.now();
      while (Date.now() - started < 150000) {
        const view = await host.visible();
        const room = view.room;
        const series = room?.state?.series;
        if (series?.phase === 'finished') break;
        if (!room || !series) {
          await host.advance(100);
          continue;
        }
        if (series.phase === 'round-result') {
          if (observedRound !== series.history.length) {
            observedRound = series.history.length;
            await host.screenshot(`online-${count}-round-result`);
          }
          for (const player of players)
            if (
              await player.page
                .locator('#next-round')
                .isEnabled()
                .catch(() => false)
            )
              await player.page.locator('#next-round').tap();
          await host.advance(200);
          continue;
        }
        const match = room.state.match;
        const seat = Number(match.seats[match.active].split('-').at(-1)) - 1;
        const player = players[seat];
        const current = await player.visible();
        if (
          current.room?.state?.revision !== room.state.revision ||
          current.physicsPhase !== 'aim' ||
          current.canAim !== 'true'
        ) {
          await host.advance(100);
          continue;
        }
        const disc = current.discs[Number(current.active)];
        if (!disc?.alive) {
          await host.advance(100);
          continue;
        }
        // Deliberate legal self-eliminations make this a short reproducible flow test;
        // the final seat stays near the center, so each series has a clear champion.
        const move =
          seat === count - 1
            ? { x: -disc.x || 1, y: -disc.y, power: 0.24 }
            : { x: disc.x || 1, y: disc.y, power: 1 };
        const revision = room.state.revision;
        await player.flick(disc, move);
        await player.page.waitForFunction(
          (previous) => {
            const room = JSON.parse(document.querySelector('#game').dataset.room || 'null');
            return (
              room?.seq > previous.seq &&
              room.state.lastShot?.revision > previous.revision &&
              room.state.lastShot?.seat === previous.seat
            );
          },
          { revision, seq: current.room.seq, seat },
          { timeout: 12000 },
        );
        touchShots++;
        await host.advance(1100);
      }
      const final = (await host.visible()).room;
      assert.equal(
        final.state.series.phase,
        'finished',
        `${count}-player room reaches final settlement`,
      );
      assert.equal(final.state.series.winnerId, `player-${count}`);
      const canonical = final.state.series;
      for (const player of players)
        await player.page.waitForFunction((winner) => {
          const room = JSON.parse(document.querySelector('#game').dataset.room || 'null');
          return room?.state?.series?.phase === 'finished' && room.state.series.winnerId === winner;
        }, canonical.winnerId);
      for (const player of players)
        assert.deepEqual(
          (await player.visible()).room.state.series.scores,
          canonical.scores,
          'all devices agree on server scores',
        );
      await host.screenshot(`online-${count}-champion`);
      records.online[count] = {
        independentIdentities: count,
        touchShots,
        completedRounds: canonical.history.length,
        scores: canonical.scores,
        champion: canonical.winnerId,
        wallSeconds: Math.round((Date.now() - started) / 1000),
      };
      if (count === 2) {
        for (const player of players) {
          await player.page.locator('#rematch').tap();
          await player.page.locator('#ready').waitFor();
        }
        const rematchCode = (await host.visible()).room.code;
        assert.notEqual(rematchCode, code, 'online rematch creates a new series room');
        for (const player of players) {
          assert.equal((await player.visible()).room.code, rematchCode);
          await player.page.locator('#ready').tap();
        }
        for (const player of players)
          await player.page.locator('body[data-phase="playing"]').waitFor();
        await host.page.waitForFunction(
          () => {
            const room = JSON.parse(document.querySelector('#game').dataset.room || 'null');
            return room?.state?.lastTimeout?.seat === 0;
          },
          undefined,
          { timeout: 16000 },
        );
        const resumed = (await host.visible()).room;
        assert.deepEqual(resumed.state.series.scores, { 'player-1': 0, 'player-2': 0 });
        assert.equal(
          resumed.state.match.active,
          1,
          'server skips an absent player after the real turn deadline',
        );
        records.online[count].reloadRestored = true;
        records.online[count].rematchVerified = true;
        records.online[count].serverTimeoutVerified = true;
      }
      console.log(`${count}-player touch series passed:`, records.online[count]);
      for (const player of players) await player.context.close();
    }
  }
  assert.deepEqual(errors, []);
  records.pageErrors = errors;
  await writeFile(
    new URL(focus ? 'browser-online-focused.json' : 'browser-validation.json', out),
    JSON.stringify(records, null, 2) + '\n',
  );
} finally {
  await browser.close();
  server.kill();
}
