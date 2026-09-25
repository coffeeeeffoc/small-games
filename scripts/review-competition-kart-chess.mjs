import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';

// Run only against the isolated competition_test environment, never production.
const origin = process.env.REVIEW_BASE || 'http://127.0.0.1:43010';
const base = `${origin}/api/competition/v1`;
const directory = new URL('../outputs/independent-kart-chess/', import.meta.url);
await mkdir(directory, { recursive: true });
const evidence = { origin, checkedAt: new Date().toISOString(), checks: [] };
const record = (name, data = {}) => {
  evidence.checks.push({ name, ...data });
  console.log('PASS', name);
};
async function request(path, token, body, status = 200) {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  assert.equal(response.status, status, `${path}: ${text}`);
  return text ? JSON.parse(text) : null;
}
try {
  const [a, b, outsider] = await Promise.all(
    [0, 1, 2].map(() => request('/sessions/guest', null, {})),
  );
  assert.notEqual(a.playerId, b.playerId);
  await request('/me', '0'.repeat(64), undefined, 401);
  await request(
    '/sessions/platform',
    null,
    { platform: 'wechat', appId: 'review-unconfigured', code: 'test' },
    503,
  );
  for (const path of ['/internal/verify', '/internal/kart-results'])
    await request(path, null, {}, 404);
  record('signed sessions, unconfigured platform rejected, gateway internal routes hidden');
  const room = await request('/rooms', a.token, { game: 'xiangqi-five' });
  await request('/rooms/join', b.token, { code: room.code, game: 'letters-words2' }, 409);
  await request('/rooms/join', a.token, { code: room.code });
  await request('/rooms/join', b.token, { code: room.code });
  await request('/rooms/join', outsider.token, { code: room.code }, 409);
  await request(`/rooms/${room.code}`, outsider.token, undefined, 403);
  await request(`/rooms/${room.code}/ready`, a.token, {});
  const playing = await request(`/rooms/${room.code}/ready`, b.token, {});
  assert.equal(playing.status, 'playing');
  assert.equal(
    (await request(`/rooms/${room.code}/ready`, b.token, {})).startedAt,
    playing.startedAt,
  );
  const move = (player, seq, index, status = 200) =>
    request(
      `/rooms/${room.code}/actions`,
      player.token,
      { seq, action: { type: 'deploy-directly', to: index } },
      status,
    );
  await request(
    `/rooms/${room.code}/actions`,
    a.token,
    { seq: 1, action: { type: 'score', score: 999999 } },
    422,
  );
  await request(
    `/rooms/${room.code}/actions`,
    outsider.token,
    { seq: 1, action: { type: 'deploy-directly', to: 0 } },
    403,
  );
  await move(b, 1, 89, 422);
  await move(a, 1, -1, 422);
  await move(a, 2, 0, 409);
  assert.equal((await move(a, 1, 0)).state.ply, 1);
  assert.equal((await move(a, 1, 0)).state.ply, 1);
  await move(a, 1, 1, 409);
  await move(b, 1, 0, 422);
  await request(`/rooms/${room.code}/leave`, b.token, {});
  assert.equal((await request(`/rooms/${room.code}`, a.token)).status, 'abandoned');
  await move(a, 2, 1, 409);
  record(
    'wrong game, duplicate join, full room, outsider, wrong turn, illegal location, seq, duplicate ready, abandonment',
  );

  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${origin}/games/xiangqi-five/`);
    await page.locator('[data-competition-launch]').tap();
    await page.locator('[data-create]').tap();
    await page.locator('[data-room-code]').waitFor({ state: 'visible' });
    const code = (await page.locator('[data-room-code]').innerText()).match(/[A-F0-9]{12}/)[0];
    const identity = await page.evaluate(async () => (await __competition.session()).playerId);
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    await page.locator('[data-share]').tap();
    await page.waitForFunction(() =>
      document.querySelector('[data-status]').textContent.includes('邀请链接已复制'),
    );
    const invitation = await page.evaluate(() => navigator.clipboard.readText());
    assert.equal(new URL(invitation).searchParams.get('pk'), code);
    const inviteeContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    });
    const invitee = await inviteeContext.newPage();
    await invitee.goto(invitation);
    await invitee.locator('[data-join]').tap();
    await invitee.locator('[data-room-code]').waitFor({ state: 'visible' });
    assert.notEqual(
      await invitee.evaluate(async () => (await __competition.session()).playerId),
      identity,
    );
    assert.equal(
      (await page.evaluate((code) => __competition.request(`/rooms/${code}`), code)).players.length,
      2,
    );
    record(
      'real copied H5 invitation opens in a second independent browser identity and joins its room',
      { code },
    );
    await page.locator('dialog[open] [data-game-fullscreen]').tap();
    await page.waitForFunction(() => Boolean(document.fullscreenElement));
    await page.screenshot({ path: fileURLToPath(new URL('xiangqi-fullscreen.png', directory)) });
    await page.evaluate(() => document.exitFullscreen());
    await page.waitForFunction(() => !document.fullscreenElement);
    assert.equal(
      (await page.evaluate((code) => __competition.request(`/rooms/${code}`), code)).status,
      'waiting',
    );
    await page.reload();
    await page.locator('[data-competition-launch]').tap();
    assert.equal(
      await page.evaluate(async () => (await __competition.session()).playerId),
      identity,
    );
    await page.locator('[data-room-code]').waitFor({ state: 'visible' });
    assert((await page.locator('[data-room-code]').innerText()).includes(code));
    assert.equal(
      (await page.evaluate((code) => __competition.request(`/rooms/${code}`), code)).players.length,
      2,
    );
    assert.deepEqual(errors, []);
    record(
      'real Chrome Fullscreen API entry and system exit, persistent identity and room rejoin on reload',
      { code, identity, browser: browser.version() },
    );
    const wrapper = createServer((_request, response) => {
      response.writeHead(200, {
        'content-type': 'text/html',
        'permissions-policy': 'fullscreen=()',
      });
      response.end(
        `<iframe src="${origin}/games/xiangqi-five/" style="width:390px;height:844px;border:0"></iframe>`,
      );
    });
    await new Promise((resolve) => wrapper.listen(0, '127.0.0.1', resolve));
    try {
      const denied = await context.newPage();
      await denied.goto(`http://127.0.0.1:${wrapper.address().port}/`);
      const frame = denied.frameLocator('iframe');
      await frame.locator('[data-competition-launch]').tap();
      await frame.locator('[data-room-code]').waitFor({ state: 'visible' });
      await frame.locator('dialog[open] [data-game-fullscreen]').tap();
      await frame.locator('#game-display-notice').waitFor({ state: 'visible' });
      const feedback = await frame.locator('#game-display-notice').innerText();
      assert.match(feedback, /未允许全屏|不支持网页全屏/);
      assert.equal(
        await frame.locator('body').evaluate(() => Boolean(document.fullscreenElement)),
        false,
      );
      await frame.locator('[data-ready]').tap();
      await frame.locator('[data-ready]:disabled').waitFor();
      await denied.screenshot({
        path: fileURLToPath(new URL('xiangqi-fullscreen-denied.png', directory)),
      });
      record(
        'real Permissions-Policy denial shows accurate feedback and preserves focus controls',
        { feedback },
      );
    } finally {
      await new Promise((resolve) => wrapper.close(resolve));
    }
  } finally {
    await browser.close();
  }
} finally {
  evidence.completedAt = new Date().toISOString();
  await writeFile(new URL('review.json', directory), JSON.stringify(evidence, null, 2));
}
