import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createGameServer } from '../server.mjs';
import { newAttempt, start, tick, pause } from '../src/core.mjs';
import { levelAt } from '../src/content.mjs';
import { emptySave } from '../src/storage.mjs';
const output = fileURLToPath(new URL('../docs/design/verification/', import.meta.url));
await mkdir(output, { recursive: true });
const server = createGameServer({ directory: fileURLToPath(new URL('../dist/', import.meta.url)) });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});
const errors = [],
  checks = [];
let pageCount = 0;
async function pageOf({
  width = 390,
  height = 844,
  fixture,
  ads,
  dev = false,
  offline = false,
} = {}) {
  const capture = process.env.PUBLISHING_CAPTURE === '1' && pageCount++ === 0;
  const context = await browser.newContext({
    ...(capture ? { recordVideo: { dir: '/tmp/porcelain-capture', size: { width, height } } } : {}),
    viewport: { width, height },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });
  if (fixture)
    await context.addInitScript((value) => {
      localStorage.setItem('porcelain-puzzle.save.v1', JSON.stringify(value));
    }, fixture);
  if (ads)
    await context.addInitScript(() => {
      globalThis.PorcelainHost = {
        ads: { available: true, offer: async () => ({ status: 'completed' }), cancel() {} },
      };
    });
  const page = await context.newPage();
  if (offline)
    await page.route('**/api/porcelain/health', (route) =>
      route.fulfill({ status: 503, body: '{}' }),
    );
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + (dev ? '/?dev=1' : ''));
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'home', { timeout: 30000 });
  return page;
}
async function playing(page) {
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'playing', { timeout: 20000 });
  await page.waitForFunction(() => PorcelainGame.snapshot?.phase === 'playing');
}
async function touchDrag(page, from, to, cancel = false) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...from, id: 1 }],
    });
    for (let i = 1; i <= 5; i++)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x: from.x + ((to.x - from.x) * i) / 5, y: from.y + ((to.y - from.y) * i) / 5, id: 1 },
        ],
      });
    await cdp.send('Input.dispatchTouchEvent', {
      type: cancel ? 'touchCancel' : 'touchEnd',
      touchPoints: [],
    });
  } finally {
    await cdp.detach();
  }
}
async function gesture(page, { anchor, moveOnly = false } = {}) {
  return page.evaluate(
    ({ anchor, moveOnly }) => {
      const s = PorcelainGame.snapshot,
        p = PorcelainGame.puzzle,
        { origin, scale } = PorcelainGame.board,
        r = document.querySelector('canvas').getBoundingClientRect();
      const inside = (point, poly) => {
        let z = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const a = poly[i],
            b = poly[j];
          if (
            a.y > point.y !== b.y > point.y &&
            point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
          )
            z = !z;
        }
        return z;
      };
      const project = (x, y) => ({
        x: r.x + ((origin.x + x * scale) * r.width) / 390,
        y: r.y + ((origin.y + y * scale) * r.width) / 390,
      });
      const target = anchor === undefined ? null : s.groups.find((g) => g.pieces.includes(anchor));
      let candidates = target
        ? s.groups.filter(
            (g) =>
              g !== target &&
              g.pieces.some((id) => p.pieces[id].neighbors.some((n) => target.pieces.includes(n))),
          )
        : [...s.groups].reverse();
      for (const g of candidates) {
        for (const id of g.pieces) {
          const piece = p.pieces[id],
            points = [
              piece.center,
              ...piece.polygon.map((q) => ({
                x: q.x * 0.3 + piece.center.x * 0.7,
                y: q.y * 0.3 + piece.center.y * 0.7,
              })),
            ];
          for (const point of points) {
            if (!inside(point, p.silhouette) || !inside(point, piece.polygon)) continue;
            const board = { x: point.x + g.x, y: point.y + g.y };
            const index = s.groups.indexOf(g);
            if (
              s.groups.slice(index + 1).some((other) =>
                other.pieces.some((oid) => {
                  const q = { x: board.x - other.x, y: board.y - other.y };
                  return inside(q, p.silhouette) && inside(q, p.pieces[oid].polygon);
                }),
              )
            )
              continue;
            const to = moveOnly
              ? project(board.x + 14, board.y + 12)
              : project(point.x + (target?.x ?? 55), point.y + (target?.y ?? 95));
            return {
              from: project(board.x, board.y),
              to,
              anchor: id,
              group: g.id,
              count: s.groups.length,
              position: { x: g.x, y: g.y },
            };
          }
        }
      }
      return null;
    },
    { anchor, moveOnly },
  );
}
try {
  const page = await pageOf();
  await page.screenshot({ path: output + 'home.png' });
  await page.getByRole('button', { name: '器物长廊', exact: true }).tap();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'gallery');
  await page.screenshot({ path: output + 'gallery.png' });
  await expect(page.locator('[data-action="level:2"]')).toBeDisabled();
  await page.getByRole('button', { name: '返回', exact: true }).tap();
  await page.getByRole('button', { name: '开始闯关', exact: true }).tap();
  await playing(page);
  await page.screenshot({ path: output + 'playing.png' });
  const cancelled = await gesture(page, { moveOnly: true });
  assert.ok(cancelled);
  await touchDrag(page, cancelled.from, cancelled.to, true);
  assert.deepEqual(
    await page.evaluate((id) => {
      const g = PorcelainGame.snapshot.groups.find((g) => g.id === id);
      return { x: g.x, y: g.y };
    }, cancelled.group),
    cancelled.position,
  );
  checks.push('real touch cancellation preserves fragment position');
  await page.locator('[data-action="zoom"]').tap();
  await page.getByRole('button', { name: '暂停', exact: true }).tap();
  const frozen = await page.evaluate(() => PorcelainGame.snapshot.remainingMs);
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => PorcelainGame.snapshot.remainingMs), frozen);
  await page.screenshot({ path: output + 'paused.png' });
  await page.getByRole('button', { name: '继续拼合', exact: true }).tap();
  await playing(page);
  assert.equal(await page.evaluate(() => PorcelainGame.board.scale), 1);
  checks.push('pause freezes clock and resume restores board transform');
  let drag = await gesture(page);
  await touchDrag(page, drag.from, drag.to);
  let anchor = drag.anchor;
  for (let i = 0; i < 12; i++) {
    if (await page.evaluate(() => PorcelainGame.snapshot.phase === 'won')) break;
    drag = await gesture(page, { anchor });
    assert.ok(drag, 'a neighboring visible shard is available');
    await touchDrag(page, drag.from, drag.to);
    await expect
      .poll(() => page.evaluate(() => PorcelainGame.snapshot.groups.length))
      .toBeLessThan(drag.count);
    anchor = drag.anchor;
  }
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'result');
  await page.screenshot({ path: output + 'completed.png' });
  checks.push('complete level entirely by touch, with rigid group-to-group snapping');
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('porcelain-puzzle.save.v1')),
  );
  assert.equal(saved.unlocked, 2);
  assert.equal(saved.collection.length, 1);
  // The result automatically travels to the next vessel without another selection.
  await playing(page);
  assert.equal(await page.evaluate(() => PorcelainGame.snapshot.number), 2);
  checks.push('celebration, travel, next vessel smash and next challenge');
  const recording = page.video();
  await page.context().close();
  if (recording)
    await recording.saveAs(
      fileURLToPath(
        new URL('../publishing/gameplay/videos/mobile-touch-390x844.webm', import.meta.url),
      ),
    );

  const offline = await pageOf({ offline: true });
  await expect(offline.locator('[data-action="friends"]')).toHaveCount(0);
  await offline.getByRole('button', { name: '开始闯关', exact: true }).tap();
  await playing(offline);
  await offline.context().close();
  checks.push('unavailable room service hides multiplayer entry and leaves solo playable');

  const state = newAttempt(levelAt(1), 'timeout-fixture');
  start(state);
  tick(state, state.remainingMs - 500);
  pause(state);
  const fixture = emptySave();
  fixture.attempt = state;
  const adPage = await pageOf({ fixture, ads: true });
  await adPage.getByRole('button', { name: '继续这份时光', exact: true }).tap();
  await expect(adPage.locator('body')).toHaveAttribute('data-screen', 'timeout');
  await adPage.screenshot({ path: output + 'timeout.png' });
  const before = await adPage.evaluate(() => PorcelainGame.snapshot.groups);
  await adPage.getByRole('button', { name: '看广告 · 再添 45 秒', exact: true }).tap();
  await playing(adPage);
  assert.equal(await adPage.evaluate(() => PorcelainGame.snapshot.revives), 1);
  assert.deepEqual(await adPage.evaluate(() => PorcelainGame.snapshot.groups), before);
  checks.push(
    'reward-port fixture resumes preserved fragments with 45 seconds; no live advertising claimed',
  );
  await adPage.context().close();

  const a = await pageOf(),
    b = await pageOf();
  for (const p of [a, b]) await p.getByRole('button', { name: '好友闯关', exact: true }).tap();
  await a.getByRole('button', { name: '邀请好友闯关', exact: true }).tap();
  await expect(a.locator('body')).toHaveAttribute('data-screen', 'room');
  const code = await a.locator('.room-code').textContent();
  await b.locator('#room-code').fill(code);
  await b.getByRole('button', { name: '加入这段旅程', exact: true }).tap();
  await expect(b.locator('body')).toHaveAttribute('data-screen', 'room');
  await a.screenshot({ path: output + 'friends.png' });
  await a.getByRole('button', { name: '准备好了', exact: true }).tap();
  await b.getByRole('button', { name: '准备好了', exact: true }).tap();
  await playing(a);
  await playing(b);
  assert.equal(await a.evaluate(() => PorcelainGame.room.round), 1);
  assert.equal(await b.evaluate(() => PorcelainGame.room.round), 1);
  await a.locator('[data-action="organize"]').tap();
  await a.waitForTimeout(1100);
  const arranged = await a.evaluate(() => PorcelainGame.snapshot.groups);
  await a.waitForTimeout(1100);
  assert.deepEqual(await a.evaluate(() => PorcelainGame.snapshot.groups), arranged);
  await a.getByRole('button', { name: '暂停', exact: true }).tap();
  await a.getByRole('button', { name: '离开房间', exact: true }).tap();
  await expect(a.locator('body')).toHaveAttribute('data-screen', 'home');
  await expect.poll(() => b.evaluate(() => PorcelainGame.room.players.length)).toBe(1);
  await b.getByRole('button', { name: '暂停', exact: true }).tap();
  await b.getByRole('button', { name: '跳过这一关', exact: true }).tap();
  await expect(b.locator('body')).toHaveAttribute('data-screen', 'room-result');
  await expect
    .poll(() => b.evaluate(() => PorcelainGame.snapshot.number), { timeout: 15000 })
    .toBe(2);
  checks.push(
    'two independent browser players: ready together, authoritative organize, host exit, remaining player advances',
  );
  await a.context().close();
  await b.context().close();

  const small = await pageOf({ width: 320, height: 568 });
  await small.screenshot({ path: output + 'home-320.png' });
  await small.getByRole('button', { name: '开始闯关', exact: true }).tap();
  await playing(small);
  await small.screenshot({ path: output + 'playing-320.png' });
  await small.getByRole('button', { name: '暂停', exact: true }).tap();
  await small.getByRole('button', { name: '返回长廊', exact: true }).tap();
  await small.screenshot({ path: output + 'gallery-320.png' });
  await small.context().close();
  checks.push('320x568 and 390x844 mobile layouts');
  const unlocked = emptySave();
  unlocked.unlocked = 100;
  const late = await pageOf({ fixture: unlocked });
  await late.getByRole('button', { name: '开始闯关', exact: true }).tap();
  await playing(late);
  assert.equal(await late.evaluate(() => PorcelainGame.snapshot.number), 100);
  assert.equal(await late.evaluate(() => PorcelainGame.puzzle.pieces.length), 40);
  await late.screenshot({ path: output + 'playing-level100.png' });
  const first = await gesture(late);
  assert.ok(first);
  await touchDrag(late, first.from, first.to);
  let lateAnchor = first.anchor;
  for (let i = 0; i < 3; i++) {
    const next = await gesture(late, { anchor: lateAnchor });
    assert.ok(next, 'late-game neighboring shard remains touchable');
    await touchDrag(late, next.from, next.to);
    await expect
      .poll(() => late.evaluate(() => PorcelainGame.snapshot.groups.length))
      .toBeLessThan(next.count);
    lateAnchor = next.anchor;
  }
  await late.context().close();
  checks.push('level 100: 40 visible shards, touchable small pieces and rigid group joins');

  assert.deepEqual(errors, []);
  await writeFile(
    output + 'browser-results.json',
    JSON.stringify(
      {
        at: new Date().toISOString(),
        browser: 'Chromium 140, Linux, mobile touch emulation, software WebGL',
        checks,
        errors,
        limits: [
          'Not a physical device test',
          'Reward completion uses a test provider, not a live ad',
          'Room service runs locally, no public deployment',
        ],
      },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify({ checks, errors }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
