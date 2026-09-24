import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { chooseDuelAction } from '../games/local/cops-robbers/src/duel.js';
import { getDuelLevel } from '../games/local/cops-robbers/src/duel-levels.js';

const base = process.env.REVIEW_BASE || 'http://127.0.0.1:43030';
const output = new URL('../outputs/chase-update/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const report = { base, checks: [], errors: [] };
async function player(game, label) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const page = await context.newPage(),
    result = { page, context, game, label, room: null };
  page.on('pageerror', (error) => report.errors.push(error.message));
  page.on('response', async (response) => {
    if (response.url().includes('/api/competition/v1/rooms') && !response.ok())
      console.log('room request failed', await response.json().catch(() => response.status()));
    if (response.url().includes('/api/competition/v1/rooms') && response.ok()) {
      const value = await response.json().catch(() => null);
      if (value?.players) result.room = value;
    }
  });
  await page.goto(`${base}/games/${game}/`);
  await page.getByRole('button', { name: '好友 PK · 全站榜', exact: true }).click();
  await expect(page.locator('[data-match-mode] option')).toHaveCount(2);
  return result;
}
async function canvasHits(person) {
  return person.page.locator('[data-play]').evaluate(async (canvas, state) => {
    const { createRenderer } = await import('./src/competition-renderer.js');
    const rect = canvas.getBoundingClientRect(),
      surface = document.createElement('canvas');
    return createRenderer().draw(surface.getContext('2d'), rect.width, rect.height, state);
  }, person.room.state);
}
async function hit(person, item) {
  assert.ok(item, 'expected game control exists');
  const rect = await person.page.locator('[data-play]').boundingBox();
  const x = item.x + item.w / 2,
    y = item.y + item.h / 2;
  assert.ok(
    x >= 0 && x < rect.width && y >= 0 && y < rect.height,
    'control is within visible canvas',
  );
  await person.page.touchscreen.tap(rect.x + x, rect.y + y);
}
async function start(game, mode) {
  const a = await player(game, 'a'),
    b = await player(game, 'b');
  await a.page.selectOption('[data-match-mode]', mode);
  await a.page.selectOption('[data-match-role]', 'runner');
  await a.page.selectOption('[data-match-initiative]', 'runner');
  await a.page.locator('[data-create]').click();
  await expect.poll(() => a.room?.code).toBeTruthy();
  await b.page.locator('[data-code]').fill(a.room.code);
  await b.page.locator('[data-join]').click();
  await expect.poll(() => b.room?.players.length).toBe(2);
  assert.notEqual(a.room.players[0].id, b.room.players[1].id);
  await a.page.locator('[data-ready]').click();
  await b.page.locator('[data-role="runner"]').click();
  await expect.poll(() => b.room?.players[b.room.you].role).toBe('runner');
  await expect.poll(() => a.room?.players[a.room.you].role).toBe('pursuer');
  assert.equal(
    a.room.players.some((p) => p.ready),
    false,
    'role exchange clears readiness',
  );
  await a.page.selectOption('[data-room-initiative]', 'pursuer');
  await expect.poll(() => a.room?.initiative).toBe('pursuer');
  await a.page.locator('[data-ready]').click();
  await b.page.locator('[data-ready]').click();
  await expect.poll(() => a.room?.status).toBe('playing');
  await expect.poll(() => b.room?.status).toBe('playing');
  assert.equal(a.room.firstRole, 'pursuer');
  await a.page.screenshot({
    path: new URL(`${game}-friend.png`, output).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  });
  report.checks.push(
    `${game}: two identities, mode selection, exchange roles, readiness reset, explicit opening side`,
  );
  return [a, b];
}
try {
  if (process.env.REVIEW_GAME !== 'realtime') {
    const team = await start('cops-robbers', 'survival');
    let moves = 0;
    while (team[0].room.status === 'playing' && moves < 150) {
      const current = team[0].room.state.board;
      const person = team.find((p) => p.room.state.role === current.side);
      await expect.poll(() => person.room.state.board.turn).toBe(current.turn);
      const level = getDuelLevel(person.room.state.mode, person.room.state.levelId);
      const action = chooseDuelAction(level, current),
        hits = await canvasHits(person);
      await hit(
        person,
        hits.find((item) => item.action?.local === action.actor),
      );
      await hit(
        person,
        action.target ===
          (current.side === 'pursuer' ? current.cops : current.robbers)[action.actor]
          ? hits.find((item) => item.label === '留守一步')
          : hits.find((item) => item.label === `${action.target + 1} 号路口`),
      );
      await expect
        .poll(() => person.room.state.board.turn, { timeout: 12000 })
        .toBe(current.turn + 1);
      await expect
        .poll(() => team[0].room.state.board.turn, { timeout: 12000 })
        .toBe(current.turn + 1);
      moves++;
    }
    await expect.poll(() => team[0].room.status).toBe('finished');
    await expect.poll(() => team[1].room.status).toBe('finished');
    assert.deepEqual(team[0].room.results, team[1].room.results);
    for (const person of team) await expect(person.page.locator('[data-details]')).toBeVisible();
    report.checks.push(
      `turn-based: ${moves} real Canvas touch commands, opposing turns, complete match and identical settlement`,
    );
    await team[0].page.getByRole('button', { name: '再次挑战', exact: true }).click();
    await expect.poll(() => team[0].room.status).toBe('waiting');
    assert.equal(team[0].room.mode, 'survival');
    for (const person of team) await person.context.close();
  }

  const realtime = await start('cops-robbers-realtime', 'classic');
  for (const person of realtime) {
    await expect.poll(() => person.room.state.openingRemainingMs).toBe(0);
    const before = person.room.seq,
      hits = await canvasHits(person);
    const own =
      person.room.state.role === 'pursuer' ? person.room.state.cops : person.room.state.robbers;
    const target = hits
      .filter(
        (item) =>
          item.action?.type === 'move' &&
          own.every(
            (actor) => Math.hypot(actor.x - item.action.x, actor.y - item.action.y) > 100,
          ) &&
          person.room.state.cops.every(
            (actor) => Math.hypot(actor.x - item.action.x, actor.y - item.action.y) > 70,
          ),
      )
      .sort(
        (a, b) =>
          Math.hypot(own[0].x - a.action.x, own[0].y - a.action.y) -
          Math.hypot(own[0].x - b.action.x, own[0].y - b.action.y),
      )[0];
    await expect(person.page.locator('.competition-dialog')).not.toHaveAttribute(
      'aria-busy',
      'true',
    );
    await hit(person, target);
    try {
      await expect.poll(() => person.room.seq, { timeout: 12000 }).toBeGreaterThan(before);
    } catch (error) {
      console.log({
        role: person.room.state.role,
        phase: person.room.status,
        target,
        status: await person.page.locator('[data-status]').innerText(),
      });
      await person.page.screenshot({
        path: new URL('realtime-action-failure.png', output).pathname.replace(
          /^\/([A-Za-z]:)/,
          '$1',
        ),
      });
      throw error;
    }
  }
  await realtime[0].page.locator('[data-rules]').click();
  await realtime[0].page.locator('[data-dismiss]').click();
  await realtime[0].page.locator('.competition-dialog [data-game-fullscreen]').click();
  await expect
    .poll(() => realtime[0].page.evaluate(() => Boolean(document.fullscreenElement)))
    .toBe(true);
  await realtime[0].page.evaluate(() => document.exitFullscreen());
  await realtime[0].page.locator('.competition-dialog [data-close]').click();
  await expect(realtime[0].page.locator('.competition-dialog')).not.toBeVisible();
  report.checks.push(
    'realtime: both roles send real Canvas movement, rules return, actual fullscreen enter/exit, leave',
  );
  for (const person of realtime) await person.context.close();
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile(new URL('browser-review.json', output), JSON.stringify(report, null, 2));
  await browser.close();
}
