import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import rule from '../services/runtime-api/rules/letters.mjs';
import { findSpelling } from '../games/local/letters-words2/engine.js';

const css = await readFile(new URL('../platforms/competition/h5.css', import.meta.url), 'utf8');
const source = (await readFile(new URL('../platforms/competition/h5.js', import.meta.url), 'utf8'))
  .replace("import './client.js';", '')
  .replace("import styles from './h5.css?inline';", `const styles = ${JSON.stringify(css)};`)
  .replace(
    "import { mountStreetCompetition } from './street-pages.js';",
    'const mountStreetCompetition = () => {};',
  );
const files = new Map([
  ['/h5.js', source],
  [
    '/format.js',
    await readFile(new URL('../platforms/competition/format.js', import.meta.url), 'utf8'),
  ],
  [
    '/renderer.js',
    await readFile(
      new URL('../games/local/letters-words2/competition-renderer.js', import.meta.url),
      'utf8',
    ),
  ],
  [
    '/styles.css',
    await readFile(new URL('../games/local/letters-words2/styles.css', import.meta.url), 'utf8'),
  ],
  [
    '/assets/ui/island.svg',
    await readFile(
      new URL('../games/local/letters-words2/assets/ui/island.svg', import.meta.url),
      'utf8',
    ),
  ],
]);
let state, status, seq, elapsed, actions, leaves;
const profile = { playerId: 'player-a', name: '拾词小伙伴' };
const metadata = {
  title: '好友拼词',
  description: rule.description || rule.view(rule.initial('metadata')).rules,
  eligiblePlayers: 2,
  me: null,
  top: [],
};
function reset() {
  state = rule.initial('browser-touch');
  status = 'waiting';
  seq = 0;
  elapsed = 0;
  actions = [];
  leaves = 0;
}
reset();
function room() {
  return {
    code: 'ABCDEF123456',
    status,
    seq,
    you: 0,
    serverNow: 0,
    deadline: 120000,
    pollMs: 60000,
    players: [
      { id: 'player-a', name: profile.name, ready: status !== 'waiting' },
      { id: 'player-b', name: '字母搭子', ready: true },
    ],
    state: rule.view(state),
    results:
      status === 'finished'
        ? [
            {
              playerId: 'player-a',
              result: rule.result(state),
              before: metadata,
              after: {
                ...metadata,
                me: {
                  rank: 1,
                  score: rule.result(state).score,
                  secondary: rule.result(state).secondary,
                },
              },
            },
          ]
        : [],
  };
}
const fixture = `
import { mountCompetition } from '/h5.js';
import { createRenderer } from '/renderer.js';
window.__installCompetition = () => {};
window.__competition = { request: async (path, options = {}) => {
  const response = await fetch('/fixture-api?path=' + encodeURIComponent(path), { method: options.body ? 'POST' : 'GET', body: options.body });
  const value = await response.json(); if (!response.ok) throw new Error(value.error);
  if (value.state) window.lastRoom = value; return value;
} };
mountCompetition('letters-words2', () => window.renderer = createRenderer());
`;
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/fixture-api') {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const body = raw ? JSON.parse(raw) : null,
      path = url.searchParams.get('path');
    response.setHeader('Content-Type', 'application/json');
    try {
      let value;
      if (path === '/me') {
        if (body) profile.name = body.name;
        value = profile;
      } else if (path.startsWith('/boards/')) value = metadata;
      else if (path === '/rooms') {
        reset();
        value = room();
      } else if (path.endsWith('/ready')) {
        status = 'playing';
        value = room();
      } else if (path.endsWith('/actions')) {
        rule.action(state, body.action, (elapsed += 100));
        actions.push(body.action);
        seq++;
        if (state.finished) status = 'finished';
        value = room();
      } else if (path.endsWith('/leave')) {
        leaves++;
        status = 'abandoned';
        value = room();
      } else value = room();
      response.end(JSON.stringify(value));
    } catch (error) {
      response.statusCode = 400;
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  if (url.pathname === '/test-plan') {
    response.setHeader('Content-Type', 'application/json');
    response.end(
      JSON.stringify({
        path: findSpelling(state.game, state.game.activeWordId),
        correct: state.correct,
        actions: actions.length,
        leaves,
      }),
    );
    return;
  }
  if (url.pathname === '/fixture.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(fixture);
    return;
  }
  if (files.has(url.pathname)) {
    response.setHeader(
      'Content-Type',
      url.pathname.endsWith('.svg')
        ? 'image/svg+xml'
        : url.pathname.endsWith('.css')
          ? 'text/css'
          : 'text/javascript',
    );
    response.end(files.get(url.pathname));
    return;
  }
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end(
    '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><style>#friend-button{min-height:44px;margin:24px}</style><button id="friend-button" class="little-link" hidden>好友同题</button><script type="module" src="/fixture.js"></script></html>',
  );
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const directory = new URL(
  '../games/local/letters-words2/docs/design/mobile-2026-10-06/evidence/',
  import.meta.url,
);
await mkdir(directory, { recursive: true });
const report = {
  environment:
    'Chromium touch emulation; real game CSS, shared H5 pages, Canvas renderer and shared letters rules; fixture network/identity',
  checks: [],
  errors: [],
};
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
try {
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [844, 390],
  ]) {
    reset();
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => report.errors.push(error.message));
    await page.goto(base);
    await page.locator('#friend-button').tap();
    await page.locator('[data-profile-name]').filter({ hasText: profile.name }).waitFor();
    assert.equal(
      await page.locator('#friend-button').evaluate((node) => getComputedStyle(node).position),
      'static',
    );
    if (width === 390)
      await page.screenshot({ path: new URL('friend-h5-lobby-390x844.png', directory).pathname });
    await page.locator('[data-create]').tap();
    await page.locator('button[data-ready]').waitFor({ state: 'visible' });
    await page.evaluate(() => {
      history.replaceState(null, '', '?dev=1&token=private#secret');
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value) => {
            window.copiedInvite = value;
          },
        },
      });
    });
    await page.locator('[data-share]').tap();
    await page.waitForFunction(() => !!window.copiedInvite);
    const invitation = new URL(await page.evaluate(() => window.copiedInvite));
    assert.deepEqual([...invitation.searchParams.keys()], ['pk']);
    assert.equal(invitation.hash, '');
    assert.equal(invitation.searchParams.get('pk'), 'ABCDEF123456');
    assert.equal(
      await page.locator('[data-status]').isVisible(),
      true,
      'copy feedback remains visible',
    );
    if (width === 390)
      await page.screenshot({ path: new URL('friend-h5-room-390x844.png', directory).pathname });
    await page.locator('button[data-ready]').tap();
    await page.locator('canvas[data-play]').waitFor({ state: 'visible' });
    await page.waitForFunction(() =>
      renderer.getLayout()?.targets.some((target) => target.kind === 'tile'),
    );
    const point = async (predicate) =>
      page.evaluate((predicate) => {
        const rect = document.querySelector('canvas').getBoundingClientRect();
        const target = renderer.getLayout().targets.find(Function('target', 'return ' + predicate));
        return (
          target && { x: rect.x + target.x + target.w / 2, y: rect.y + target.y + target.h / 2 }
        );
      }, predicate);
    const touch = async (predicate) => {
      const location = await point(predicate);
      assert.ok(location, predicate);
      await page.touchscreen.tap(location.x, location.y);
    };
    const initial = await point('target.action?.type === "select"');
    assert.ok(initial);
    const cdp = await context.newCDPSession(page);
    for (const gesture of ['cancel', 'drag', 'multitouch']) {
      const before = actions.length;
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: initial.x, y: initial.y }],
      });
      if (gesture === 'drag')
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: initial.x + 28, y: initial.y + 28 }],
        });
      if (gesture === 'multitouch')
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [
            { x: initial.x, y: initial.y, id: 1 },
            { x: initial.x + 40, y: initial.y, id: 2 },
          ],
        });
      await cdp.send('Input.dispatchTouchEvent', {
        type: gesture === 'cancel' ? 'touchCancel' : 'touchEnd',
        touchPoints: [],
      });
      await page.waitForTimeout(40);
      assert.equal(actions.length, before, `${gesture} emits no accidental selection`);
    }
    await touch('target.action?.local === "choose"');
    await page.waitForFunction(
      () => !renderer.getLayout().targets.some((target) => target.kind === 'tile'),
    );
    if (width === 390)
      await page.screenshot({
        path: new URL('friend-h5-meanings-390x844.png', directory).pathname,
      });
    await touch('target.action?.local === "close"');
    await page.waitForFunction(() =>
      renderer.getLayout().targets.some((target) => target.kind === 'tile'),
    );
    if (width === 390)
      await page.screenshot({ path: new URL('friend-h5-play-390x844.png', directory).pathname });
    else
      await page.screenshot({
        path: new URL(`friend-h5-play-${width}x${height}.png`, directory).pathname,
      });
    const words = width === 390 ? 18 : 1;
    for (let word = 0; word < words; word++) {
      const plan = await (await fetch(base + '/test-plan')).json();
      assert.ok(plan.path?.length);
      for (const [letterIndex, tileId] of plan.path.entries()) {
        const predicate = `target.action?.tileId === ${JSON.stringify(tileId)}`;
        let target = await point(predicate);
        for (const direction of ['board-down', 'board-up']) {
          for (let step = 0; !target && step < 100; step++) {
            const next = await point(`target.action?.local === ${JSON.stringify(direction)}`);
            if (!next) break;
            const offset = await page.evaluate(() => renderer.getLayout().boardOffset);
            await page.touchscreen.tap(next.x, next.y);
            await page.waitForFunction((old) => renderer.getLayout().boardOffset !== old, offset);
            target = await point(predicate);
          }
        }
        assert.ok(target, `full-size tile reachable: ${tileId}`);
        await page.touchscreen.tap(target.x, target.y);
        await page.waitForFunction((id) => lastRoom.state.selected.includes(id), tileId);
        if (width === 390 && word === 0 && letterIndex === 1)
          await page.screenshot({
            path: new URL('friend-h5-selected-390x844.png', directory).pathname,
          });
      }
      const correct = state.correct;
      await touch('target.action?.type === "submit"');
      await page.waitForFunction((count) => lastRoom.state.correct > count, correct);
    }
    if (width === 390) {
      await page.locator('[data-kind="result"]').waitFor({ state: 'visible' });
      await page.screenshot({ path: new URL('friend-h5-result-390x844.png', directory).pathname });
      await page.locator('[data-dismiss]').tap();
    }
    await page.locator('[data-close]').tap();
    await page.locator('[data-letters-competition]').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.activeElement.id === 'friend-button');
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      'friend-button',
      'leaving restores the home entry focus',
    );
    assert.equal(leaves, width === 390 ? 0 : 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    report.checks.push({
      width,
      height,
      completedWords: words,
      checks: [
        'home entry',
        'create/ready',
        'public invitation/copy feedback',
        '44px paginated Canvas',
        'cancel/drag/multitouch',
        'meaning page',
        'real spelling',
        'return home/focus',
      ],
    });
    console.log(
      `PASS friend H5 touch ${width}×${height}: ${words} real words, paginated letters, canceled gestures, room/meaning/result/return pages`,
    );
    await context.close();
  }
  assert.deepEqual(report.errors, []);
  await writeFile(
    new URL('competition-mobile-report.json', directory),
    JSON.stringify(report, null, 2),
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
