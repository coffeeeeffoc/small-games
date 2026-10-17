import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { prepareH5Service } from './competition-h5-service.mjs';
import { serviceGames } from './competition-service-config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, '.scratch/competition-service-browser');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const game of serviceGames) {
  execFileSync(
    process.execPath,
    ['scripts/competition-game.mjs', '--game', game, '--without-service'],
    { cwd: root, stdio: 'inherit' },
  );
  const directory = path.join(
    root,
    game === 'xiangqi-five' ? 'games/submodules/xiangqi-five' : `games/local/${game}`,
    'dist',
  );
  for (const mode of ['offline', 'online']) {
    const destination = path.join(output, mode, game);
    await cp(directory, destination, { recursive: true });
    await prepareH5Service(game, destination, {
      env: {
        COMPETITION_SERVICE_ENABLED: mode === 'online' ? '1' : '0',
        COMPETITION_PUBLIC_API_URL: 'https://fixture.example/api/competition/v1',
      },
    });
  }
}
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const filename = path.resolve(
      output,
      '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''),
    );
    assert(filename.startsWith(output + path.sep));
    const content = await readFile(filename);
    res.writeHead(200, {
      'Content-Type': mime[path.extname(filename)] || 'application/octet-stream',
    });
    res.end(content);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
    : {}),
});
const report = [];
try {
  for (const game of serviceGames)
    for (const mode of ['offline', 'online']) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      const requests = [],
        errors = [];
      await context.addInitScript(() =>
        sessionStorage.setItem(
          'xiangqi-room',
          JSON.stringify({
            server: 'https://legacy.invalid',
            code: 'ABCDEF12',
            token: 'a'.repeat(48),
            side: 'red',
          }),
        ),
      );
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (req) => {
        if (/\/api\//.test(req.url())) requests.push(req.url());
      });
      let issued = 0;
      const player = {
        userId: '00000000-0000-4000-8000-000000000001',
        playerId: '00000000-0000-4000-8000-000000000001',
        sessionId: '10000000-0000-4000-8000-000000000001',
        game,
        identityKind: 'guest',
        identityMode: 'persistent',
        name: '快乐熊猫',
        nickname: '快乐熊猫',
        avatarId: 'panda',
        avatarUrl: '',
        region: null,
        profileUpdatedAt: 1,
        token: 'a'.repeat(64),
        refreshToken: 'b'.repeat(64),
        expiresAt: Date.now() + 900000,
        refreshExpiresAt: Date.now() + 86400000,
        avatarPolicy: {
          presets: ['cat', 'fox', 'panda', 'rabbit', 'bear', 'owl', 'koala', 'tiger'],
          origins: [],
          maxBytes: 1048576,
        },
      };
      await page.route('https://fixture.example/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        let result = player;
        if (path.endsWith('/sessions/guest')) {
          issued++;
          assert.deepEqual(route.request().postDataJSON(), { game });
        } else {
          assert.equal(route.request().headers().authorization, 'Bearer ' + player.token);
          if (path.endsWith('/me') && route.request().method() === 'POST') {
            Object.assign(player, route.request().postDataJSON());
            player.nickname = player.name;
            player.profileUpdatedAt++;
          }
          if (path.includes('/boards/'))
            result = {
              game,
              total: 2,
              eligiblePlayers: 2,
              version:
                game === 'cops-robbers' ? 'roles-initiative-duel-v2' : 'street-roles-initiative-v3',
              roles: ['pursuer', 'runner'],
              modes: (game === 'cops-robbers' ? ['escape', 'survival'] : ['classic', 'escape']).map(
                (id) => ({ id, title: id }),
              ),
              top: [
                { ...player, rank: 1, score: 30, secondary: 1000 },
                {
                  ...player,
                  playerId: '00000000-0000-4000-8000-000000000002',
                  rank: 2,
                  score: 20,
                  secondary: 2000,
                },
              ],
              me: { ...player, rank: 1, score: 30, secondary: 1000 },
              gap: null,
            };
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(result),
        });
      });
      await page.goto(
        `${origin}/${mode}/${game}/?server=https://legacy.invalid#room=ABCDEF12&server=https://legacy.invalid`,
      );
      if (game === 'xiangqi-five') await page.locator('#home-start').tap();
      const selector = {
        'cops-robbers': '#friend-duel',
        'cops-robbers-realtime': '#friends-button',
        'xiangqi-five': '#mode-online',
      }[game];
      if (mode === 'offline') {
        await expect(page.locator(selector)).toBeHidden();
        if (game === 'xiangqi-five') await expect(page.locator('#room-open')).toBeHidden();
        await page.waitForTimeout(1200); // Covers the old room's one-second automatic poll.
        assert.deepEqual(requests, [], `${game}: disabled mode must make no API requests`);
      } else {
        await expect(page.locator(selector)).toBeVisible();
        await page.locator(selector).tap();
        await expect(page.locator('[data-profile-name]')).toHaveText('快乐熊猫');
        assert.equal(issued, 1);
        await page.locator('[data-profile]').tap();
        await expect(page.locator('[data-avatar-id]')).toHaveCount(8);
        await page.locator('[data-avatar-id="fox"]').tap();
        await page.locator('[name="name"]').fill('机灵狐狸');
        await page.screenshot({ path: path.join(output, `${game}-profile.png`) });
        await page
          .locator(
            game === 'cops-robbers-realtime'
              ? '[data-save-name]'
              : '.pk-profile-form button[type="submit"]',
          )
          .tap();
        await expect(page.locator('[data-profile-name]')).toHaveText('机灵狐狸');
        await page.locator('[data-board]:visible').first().tap();
        await expect(page.locator('[data-preset="fox"]:visible').first()).toBeVisible();
        const visible = await page.locator('body').innerText();
        assert(!visible.includes(player.userId));
        assert(!visible.includes('#000000'));
        assert(!/注册|密码|退出登录/.test(visible));
        await page.screenshot({ path: path.join(output, `${game}-board.png`) });
        await page.reload();
        if (game === 'xiangqi-five') await page.locator('#home-start').tap();
        await page.locator(selector).tap();
        await expect(page.locator('[data-profile-name]')).toHaveText('机灵狐狸');
        assert.equal(issued, 1, 'reload must retain the same identity');
        await expect(page.locator('[data-avatar][data-preset="fox"]')).toBeVisible();
        assert(
          requests.every((url) => url.startsWith('https://fixture.example/api/competition/v1/')),
        );
      }
      assert.deepEqual(errors, [], `${game}/${mode}: JavaScript errors`);
      await page.screenshot({ path: path.join(output, `${game}-${mode}.png`) });
      report.push({ game, mode, requests, errors });
      await context.close();
    }
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(
    'Three games: offline zero requests and online configured-address touch entries passed.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
