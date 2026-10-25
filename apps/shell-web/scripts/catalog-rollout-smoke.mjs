// Real browser coverage of the catalog; the game iframe is a navigation fixture.
// Run after building shared workspace contracts: CHROMIUM_PATH=/usr/bin/chromium node scripts/catalog-rollout-smoke.mjs
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

const data = JSON.parse(await readFile(new URL('../src/game-assessments.json', import.meta.url)));
const output = new URL(
  process.env.CAPTURE_GAME_EVIDENCE === '1'
    ? '../../../docs/plans/2026-10-11-catalog-complete-verification/'
    : '../../../outputs/catalog-rollout/',
  import.meta.url,
);
await mkdir(output, { recursive: true });
const server = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)),
  base: '/small-games/',
  mode: 'pages',
  server: { host: '127.0.0.1', port: 0 },
});
let browser;
const report = [];
try {
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}/small-games/`;
  browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ||
      process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
      (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
  });
  for (const width of [320, 390, 1280]) {
    const touch = width < 500;
    const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: touch });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/games/tiny-signals/index.html?*', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><meta charset="utf-8"><p>目录往返导航验证</p>',
      }),
    );
    const activate = (locator) => (touch ? locator.tap() : locator.click());
    const tabs = page.getByRole('group', { name: '评估分组' });
    const tab = (label) => tabs.getByRole('button', { name: new RegExp(`^${label}`) });
    const articles = page.locator('article[data-game-id]');
    const ids = async () =>
      (await articles.evaluateAll((items) => items.map((item) => item.dataset.gameId))).sort();
    await page.goto(`${base}?dev=0`);
    await expect(articles).toHaveCount(39);
    assert.deepEqual(await ids(), data.games.map((game) => game.id).sort());
    for (const [schedule, label, count] of [
      ['previous', '上轮已改造', 7],
      ['current', '本轮改造', 15],
      ['later', '有潜力 · 后续改造', 17],
      ['hold', '暂缓投入', 0],
    ]) {
      await activate(tab(label));
      await expect(articles).toHaveCount(count);
      assert.deepEqual(
        await ids(),
        data.games
          .filter((game) => game.schedule === schedule)
          .map((game) => game.id)
          .sort(),
      );
      assert(
        await articles.evaluateAll((items) =>
          items.every((item) => {
            const status = item.querySelector('.game-rollout');
            return (
              status?.querySelector('strong')?.textContent &&
              status?.querySelector('span')?.textContent &&
              !status.closest('details')
            );
          }),
        ),
        'every card exposes both scheduling and implementation status',
      );
    }
    await activate(tab('全部游戏'));
    await activate(page.locator('.catalog-facet').getByRole('button', { name: /^有潜力/ }));
    await expect(articles).toHaveCount(39);
    await expect(tab('暂缓投入')).toContainText('0');
    await activate(tab('清空筛选'));
    await activate(tab('全部游戏'));
    await activate(page.locator('.catalog-facet').getByRole('button', { name: /^毫无潜力/ }));
    await expect(articles).toHaveCount(0);
    assert.deepEqual(await ids(), []);
    await activate(tab('清空筛选'));
    await activate(tab('本轮改造'));
    await activate(page.locator('.catalog-facet').getByRole('button', { name: /^移动端小游戏/ }));
    await expect(articles).toHaveCount(13);
    await expect(tab('本轮改造')).toContainText('13 / 15');
    await activate(page.getByRole('button', { name: '详情卡片', exact: true }));
    const selectedIds = await ids();
    const savedUrl = page.url();
    await page.reload();
    await expect(articles).toHaveCount(13);
    assert.deepEqual(await ids(), selectedIds);
    assert.equal(new URL(page.url()).searchParams.get('catalogTab'), 'current');
    assert.equal(new URL(page.url()).searchParams.get('catalog_platforms'), 'mobile');
    await expect(page.locator('.catalog-list')).toHaveCount(0);
    const chase = page.locator('[data-game-id="tiny-signals"]');
    await activate(chase.locator('summary'));
    await expect(chase.locator('details')).toHaveAttribute('open', '');
    await expect(chase.locator('details')).toContainText('排期理由');
    await activate(chase.locator('summary'));
    await chase.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(chase.locator('details')).toHaveAttribute('open', '');
    await page.keyboard.press('Space');
    await expect(chase.locator('details')).not.toHaveAttribute('open');
    await activate(chase.getByRole('link', { name: '进入游戏', exact: true }));
    await expect(page.frameLocator('iframe').getByText('目录往返导航验证')).toBeVisible();
    await activate(page.getByRole('button', { name: '返回目录', exact: true }));
    await expect(articles).toHaveCount(13);
    assert.deepEqual(await ids(), selectedIds);
    await page.goBack(); // Return to the game entry in browser history.
    await expect(page.locator('iframe')).toHaveCount(1);
    await page.goBack(); // Return to the filtered catalog before launch.
    await expect(articles).toHaveCount(13);
    assert.deepEqual(await ids(), selectedIds);
    assert.equal(page.url(), savedUrl);
    assert(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1,
      ),
      'no horizontal overflow',
    );
    const controlSizes = await page
      .locator('.catalog-filters button')
      .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
    assert(
      controlSizes.every((height) => height >= 44),
      'all filter controls retain 44px touch height',
    );
    await page.evaluate(() => globalThis.scrollTo(0, 0));
    await page.screenshot({
      path: fileURLToPath(new URL(`rollout-${width}.png`, output)),
      fullPage: false,
    });
    if (width === 390)
      await chase.screenshot({ path: fileURLToPath(new URL('card-390.png', output)) });
    await page.goto(`${base}?catalogTab=focus`);
    await expect(articles).toHaveCount(7);
    await expect(tab('上轮已改造')).toHaveAttribute('aria-pressed', 'true');
    assert.deepEqual(
      await ids(),
      data.games
        .filter((game) => game.schedule === 'previous')
        .map((game) => game.id)
        .sort(),
    );
    assert.deepEqual(errors, []);
    report.push({
      width,
      input: touch ? 'Chromium touch emulation' : 'mouse',
      all: 39,
      potential: 39,
      previous: 7,
      current: 15,
      later: 17,
      hold: 0,
      mobileCurrent: 13,
      checks: [
        'all exact IDs',
        'exclusive schedule groups',
        'visible implementation status',
        'touch and keyboard assessment expansion',
        'facet intersections and total counts',
        'reload',
        'game return',
        'browser back',
        'legacy focus URL',
        'no horizontal overflow',
        '44px filters',
        'no page errors',
      ],
    });
    await page.close();
  }
  await writeFile(
    new URL('browser-report.json', output),
    JSON.stringify(
      {
        environment: 'Linux Chromium; mobile input is emulated, not a native-device validation',
        source:
          'Shell source served by Vite; iframe uses a navigation fixture, not gameplay validation',
        results: report,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  await server.close();
}
