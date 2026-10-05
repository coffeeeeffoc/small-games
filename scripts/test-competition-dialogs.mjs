import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { chromium, expect } from '@playwright/test';

// Serve the real shared UI; only the service client and Vite CSS loader are fixtures.
const css = await readFile(new URL('../platforms/competition/h5.css', import.meta.url), 'utf8');
const source = (await readFile(new URL('../platforms/competition/h5.js', import.meta.url), 'utf8'))
  .replace("import './client.js';", '')
  .replace("import styles from './h5.css?inline';", `const styles = ${JSON.stringify(css)};`);
const format = await readFile(
  new URL('../platforms/competition/format.js', import.meta.url),
  'utf8',
);
const streetCss = await readFile(
  new URL('../platforms/competition/street.css', import.meta.url),
  'utf8',
);
const streetSource = (
  await readFile(new URL('../platforms/competition/street-pages.js', import.meta.url), 'utf8')
)
  .replace("import './client.js';", '')
  .replace(
    "import styles from './street.css?inline';",
    `const styles = ${JSON.stringify(streetCss)};`,
  );
const roleAppearance = await readFile(
  new URL('../games/local/cops-robbers-realtime/src/role-appearance.js', import.meta.url),
  'utf8',
);
const characterImage = await readFile(
  new URL('../games/local/cops-robbers-realtime/src/assets/characters.png', import.meta.url),
);
const cityImage = await readFile(
  new URL('../games/local/cops-robbers-realtime/src/assets/home-city.png', import.meta.url),
);
const fixture = `
import { mountCompetition } from '/h5.js';
globalThis.__installCompetition = () => {};
globalThis.fixture = { status: 'waiting', calls: [], visibility: [] };
addEventListener('competition-visibility', event => fixture.visibility.push(event.detail.open));
const streetGame = new URL(location.href).searchParams.get('game') === 'cops-robbers-realtime';
const board = { title: '测试榜单', description: '双方准备后开始。独立操作；服务端确认结果。', eligiblePlayers: 0, me: null, top: [], ...(streetGame ? { roles: ['pursuer', 'runner'], modes: [{ id: 'classic', title: '自由追逐' }, { id: 'escape', title: '出口竞速' }] } : {}) };
const profile = { playerId: 'player-a', name: '玩家甲' };
function room() {
  return { code: 'ABCDEF123456', status: fixture.status, you: 0, seq: 0,
    serverNow: Date.now(), deadline: Date.now() + 60000, pollMs: 60000,
    players: [{ id: 'player-a', name: profile.name, ready: false, role: 'pursuer' }], roles: board.roles, mode: 'classic', initiative: 'random',
    state: { rules: board.description },
    results: [{ playerId: 'player-a', result: { eligible: true, score: 10, secondary: 2000 }, before: board, after: board }] };
}
globalThis.__competition = { request: async (url, options) => {
  fixture.calls.push(url);
  if (url === '/me') {
    if (options?.body) profile.name = JSON.parse(options.body).name;
    return profile;
  }
  if (url.startsWith('/boards/')) return board;
  return room();
}};
mountCompetition(new URL(location.href).searchParams.get('game'), () => ({ draw() {}, tap() {} }));
`;
const server = createServer((request, response) => {
  if (request.url === '/src/assets/characters.png' || request.url === '/src/assets/home-city.png') {
    response.setHeader('Content-Type', 'image/png');
    response.end(request.url.endsWith('/characters.png') ? characterImage : cityImage);
    return;
  }
  response.setHeader(
    'Content-Type',
    request.url.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8',
  );
  const xiangqiPage =
    new URL(request.url, 'http://localhost').searchParams.get('game') === 'xiangqi-five';
  response.end(
    request.url === '/h5.js'
      ? source
      : request.url === '/street-pages.js'
        ? streetSource
        : request.url.endsWith('/role-appearance.js')
          ? roleAppearance
          : request.url === '/format.js'
            ? format
            : request.url === '/fixture.js'
              ? fixture
              : `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body${xiangqiPage ? ' data-screen="modes"' : ''}><button data-game-fullscreen>全屏</button>${xiangqiPage ? '<main class="page"><section data-screen="modes"><button id="mode-online" hidden style="min-height:48px;margin:24px"><strong>好友对弈</strong><small>邀请朋友一起玩</small></button></section></main>' : ''}<script type="module" src="/fixture.js"></script></body></html>`,
  );
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || undefined,
    executablePath:
      process.env.BROWSER_EXECUTABLE_PATH ||
      process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
      undefined,
    args: ['--no-sandbox'],
    headless: true,
  });
  for (const game of [
    'cops-robbers',
    'cops-robbers-realtime',
    'letters-words2',
    'vibeJam-myself-history-guess',
    'xiangqi-five',
  ]) {
    for (const touch of [false, true]) {
      const context = await browser.newContext({
        viewport: touch ? { width: 390, height: 844 } : { width: 1280, height: 900 },
        hasTouch: touch,
        isMobile: touch,
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/?game=${game}`);
      const press = (locator) => (touch ? locator.tap() : locator.click());
      if (game === 'cops-robbers-realtime') {
        const surface = page.locator('[data-street-competition]');
        const route = (name) => surface.locator(`[data-page="${name}"]`);
        await press(page.locator('[data-competition-launch]'));
        await expect(surface).toBeVisible();
        await expect(surface).toHaveJSProperty('open', true);
        await expect(page.locator('dialog:modal')).toHaveCount(0);
        await expect(surface.locator('select:visible')).toHaveCount(0);
        await expect(route('lobby')).toBeVisible();
        for (const [selector, name] of [
          ['[data-rules]', 'rules'],
          ['[data-profile]', 'nickname'],
          ['[data-board]', 'board'],
        ]) {
          await press(surface.locator(selector).filter({ visible: true }).first());
          await expect(route(name)).toBeVisible();
          await expect(route('lobby')).toBeHidden();
          await press(surface.locator('[data-page-back]'));
          await expect(route('lobby')).toBeVisible();
        }
        await press(surface.locator('[data-profile]'));
        await route('nickname').getByRole('textbox', { name: '你的昵称' }).fill('玩家乙');
        await press(surface.locator('[data-save-name]'));
        await expect(route('lobby')).toBeVisible();
        await expect(surface.locator('[data-profile-name]')).toHaveText('玩家乙');
        await press(surface.locator('[data-go="join"]'));
        await expect(route('join')).toBeVisible();
        await surface.locator('[data-code]').fill('abcdef123456');
        await expect(surface.locator('[data-code]')).toHaveValue('ABCDEF123456');
        await press(surface.locator('[data-join]'));
        await expect(route('room')).toBeVisible();
        await expect(surface.locator('[data-room-code]')).toHaveText('ABCDEF123456');
        await press(surface.locator('[data-invite]').filter({ visible: true }).first());
        await expect(route('invite')).toBeVisible();
        await expect(surface.locator('[data-invite-code]')).toHaveText('ABCDEF123456');
        await press(surface.locator('[data-page-back]'));
        await expect(route('room')).toBeVisible();
        await press(route('room').locator('[data-close]'));
        await expect(surface).toBeHidden();
        await expect
          .poll(() =>
            page.evaluate(() => fixture.calls.filter((url) => url.endsWith('/leave')).length),
          )
          .toBe(1);
        await page.evaluate(() => {
          fixture.status = 'playing';
        });
        await press(page.locator('[data-competition-launch]'));
        await press(route('lobby').locator('[data-go="create"]'));
        await expect(route('create')).toBeVisible();
        await press(route('create').locator('[data-match-role="runner"]'));
        await expect(route('create').locator('[data-match-role="runner"]')).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        await press(route('create').locator('[data-match-mode="escape"]'));
        await press(route('create').locator('[data-initiative="runner"]'));
        await press(surface.locator('[data-create]'));
        await expect(route('play')).toBeVisible();
        await expect(surface.locator('canvas')).toBeVisible();
        await press(route('play').locator('[data-rules]'));
        await expect(route('rules')).toBeVisible();
        await press(surface.locator('[data-page-back]'));
        await expect(route('play')).toBeVisible();
        await press(route('play').locator('[data-close]'));
        await expect(surface).toBeHidden();
        await page.evaluate(() => {
          fixture.status = 'finished';
        });
        await press(page.locator('[data-competition-launch]'));
        await press(route('lobby').locator('[data-go="create"]'));
        await press(surface.locator('[data-create]'));
        await expect(route('results')).toBeVisible();
        await press(route('results').locator('[data-close]'));
        await expect(surface).toBeHidden();
        for (let cycle = 0; cycle < 2; cycle++) {
          await press(page.locator('[data-competition-launch]'));
          await press(surface.locator('[data-rules]').filter({ visible: true }).first());
          await page.keyboard.press('Escape');
          await expect(route('lobby')).toBeVisible();
          await page.keyboard.press('Escape');
          await expect(surface).toBeHidden();
        }
        assert.deepEqual(errors, []);
        await expect
          .poll(() => page.evaluate(() => fixture.visibility))
          .toEqual([true, false, true, false, true, false, true, false, true, false]);
        console.log(
          `${game}: ${touch ? 'touch 390x844' : 'desktop 1280x900'} full-page lobby/create/join/room/invite/nickname/rules/board/result and history back passed`,
        );
        await context.close();
        continue;
      }
      const dialog = page.locator('.competition-dialog');
      const launch = page.locator('[data-competition-launch]');
      const details = dialog.locator('[data-details]');
      const exit = dialog.locator('[data-close]');
      const xiangqi = game === 'xiangqi-five';
      if (xiangqi) {
        assert.deepEqual(
          await page.evaluate(() => fixture.calls),
          [],
          'mode card does not eagerly call the service',
        );
        await expect(page.locator('#mode-online[data-competition-launch]')).toHaveCount(1);
        assert.equal(
          await launch.evaluate((element) => getComputedStyle(element).position),
          'static',
        );
      }
      await press(launch);
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('[data-game-fullscreen]')).toHaveCount(0);
      await expect(dialog.getByRole('button', { name: '×', exact: true })).toHaveCount(0);
      await expect(dialog.locator('.pk-header [data-close]')).toHaveCount(xiangqi ? 1 : 0);
      if (xiangqi) {
        await expect(page.locator('dialog')).toHaveCount(0);
        await expect(page.locator('body')).toHaveClass(/competition-active/);
        await expect(page.locator('.page')).toBeHidden();
        await expect(page.locator('section[data-screen]')).toHaveJSProperty('inert', true);
      }
      await expect(page.locator('body > [data-game-fullscreen]')).toHaveCount(1);
      await expect(exit).toBeInViewport();
      for (const selector of ['[data-rules]', '[data-profile]', '[data-board]']) {
        await press(dialog.locator(selector));
        await expect(details).toBeVisible();
        await expect(details.locator('.pk-sheet-head button')).toHaveCount(0);
        if (xiangqi) {
          await expect(dialog.locator('.pk-shell')).toBeHidden();
          assert.equal(
            await details.evaluate((element) => getComputedStyle(element).position),
            'static',
            'details are a page',
          );
        } else await expect(dialog.locator('.pk-exit')).toHaveJSProperty('inert', true);
        const back = details.locator('[data-dismiss]');
        await expect(back).toHaveText('返回游戏');
        await back.scrollIntoViewIfNeeded();
        const positions = await details.evaluate((element) => {
          const content = element.querySelector('.pk-sheet-content').getBoundingClientRect();
          const actions = element.querySelector('.pk-sheet-actions').getBoundingClientRect();
          return { contentBottom: content.bottom, actionsTop: actions.top };
        });
        assert(
          positions.actionsTop >= positions.contentBottom,
          'return action must follow dialog content',
        );
        await press(back);
        await expect(details).toBeHidden();
        if (xiangqi) await expect(dialog.locator('.pk-shell')).toBeVisible();
        else await expect(dialog.locator('.pk-exit')).toHaveJSProperty('inert', false);
      }
      await press(dialog.locator('[data-profile]'));
      await details.getByRole('textbox', { name: '你的昵称' }).fill('玩家乙');
      await press(details.getByRole('button', { name: '保存昵称' }));
      await expect(details).toBeHidden();
      await expect(dialog.locator('[data-profile-name]')).toHaveText('玩家乙');
      // Start a match, return from details, and leave through the persistent return action.
      await page.evaluate(() => {
        fixture.status = 'playing';
      });
      await press(dialog.locator('[data-create]'));
      await expect(dialog.locator('canvas')).toBeVisible();
      await expect(exit).toBeInViewport();
      await press(dialog.locator('[data-rules]'));
      await press(details.locator('[data-dismiss]'));
      await press(exit);
      await expect(dialog).toBeHidden();
      if (xiangqi) {
        await expect(page.locator('.page')).toBeVisible();
        await expect(page.locator('section[data-screen]')).toHaveJSProperty('inert', false);
        await expect(page.locator('#mode-online strong')).toHaveText('好友对弈');
      }
      await expect
        .poll(() =>
          page.evaluate(() => fixture.calls.filter((url) => url.endsWith('/leave')).length),
        )
        .toBe(1);
      await page.evaluate(() => {
        fixture.status = 'finished';
      });
      await press(launch);
      await press(dialog.locator('[data-create]'));
      await expect(details.locator('[data-kind="result"]')).toBeVisible();
      await press(details.locator('[data-dismiss]'));
      await press(exit);
      // Repeated opening/closing and Escape dismiss the correct layer without trapping the player.
      for (let cycle = 0; cycle < 2; cycle++) {
        await press(launch);
        await press(dialog.locator('[data-rules]'));
        await page.keyboard.press('Escape');
        await expect(details).toBeHidden();
        await expect(dialog).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
      }
      assert.deepEqual(errors, []);
      await expect
        .poll(() => page.evaluate(() => fixture.visibility))
        .toEqual([true, false, true, false, true, false, true, false]);
      console.log(
        `${game}: ${touch ? 'touch 390x844' : 'desktop 1280x900'} lobby, rules, profile, board, result, playing exit and repeated nested dismissal passed`,
      );
      await context.close();
    }
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
