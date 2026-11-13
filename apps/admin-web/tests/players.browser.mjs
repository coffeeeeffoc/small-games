import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { startAdminCaddy } from '../../../scripts/admin-caddy-fixture.mjs';
import { installControlFixture, collectBrowserErrors } from './control.fixture.mjs';

const site = fileURLToPath(new URL('../dist', import.meta.url));
const server = await startAdminCaddy(site);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
    : {}),
});
const player = {
  id: 'c3f58a3a-1111-4111-8111-111111111111',
  shortId: '#c3f58a3a',
  nickname: '夜航测试玩家',
  platform: 'guest',
  createdAt: 1,
  observedFrom: null,
  observedTo: null,
  coins: 50,
  xp: 80,
};
let checks = 0;
try {
  for (const width of [1360, 390, 320]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      hasTouch: width < 500,
      isMobile: width < 500,
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    try {
      const page = await context.newPage(),
        clean = await collectBrowserErrors(page);
      const fixture = await installControlFixture(page, ['control.read']);
      const requests = [];
      let mode = 'normal',
        release;
      await page.route('**/api/control/night-players/**', async (route) => {
        const input = route.request().postDataJSON();
        requests.push(input);
        assert.equal(route.request().headers()['x-csrf-token'], 'c'.repeat(43));
        if (mode === 'hold')
          await new Promise((resolve) => {
            release = resolve;
          });
        if (mode === 'error')
          return route.fulfill({ status: 503, json: { error: 'NIGHT_PLAYERS_UNAVAILABLE' } });
        if (mode === 'oversize')
          return route.fulfill({ status: 413, json: { error: 'NIGHT_PLAYER_DATA_TOO_LARGE' } });
        if (route.request().url().endsWith('/query'))
          return route.fulfill({
            json: {
              items:
                mode === 'empty'
                  ? []
                  : [{ ...player, nickname: input.page === 2 ? '第二页玩家' : player.nickname }],
              total: mode === 'empty' ? 0 : 51,
              page: input.page,
              pageSize: 50,
              nextPage: mode === 'empty' || input.page === 2 ? null : 2,
            },
          });
        return route.fulfill({
          json: {
            player,
            section: input.section,
            page: input.page,
            pageSize: input.pageSize,
            total: 21,
            nextPage: input.page === 1 ? 2 : null,
            items: [
              {
                data: {
                  mail: Array.from({ length: 130 }, (_, i) => ({
                    id: `mail-${i}`,
                    body: '完整长正文'.repeat(1000),
                  })),
                },
              },
            ],
            truncated: false,
            truncatedPaths: [],
            coverage: { wallet: '当前及旧钱包业务字段', results: '逐场成绩' },
            excluded: ['认证凭据', '原始仿真快照'],
            observation: { source: 'night-assets.visits', retentionDays: 120 },
          },
        });
      });
      const button = (name) => page.getByRole('button', { name, exact: true });
      const activate = (locator) => (width < 500 ? locator.tap() : locator.click());
      const response = await page.goto(server.url + '/players');
      assert.equal(response.status(), 200);
      await page.getByRole('heading', { name: '夜航守望 · 玩家查询' }).waitFor();
      assert.equal(requests.length, 0, 'no automatic unfiltered query');
      await page.reload();
      await page.getByRole('heading', { name: '夜航守望 · 玩家查询' }).waitFor();
      assert.equal(requests.length, 0);
      mode = 'hold';
      await activate(button('查询玩家'));
      await page.waitForFunction(
        () =>
          document.querySelector('[aria-label="查询玩家"]')?.getAttribute('aria-busy') === 'true',
      );
      while (!release) await new Promise((resolve) => setTimeout(resolve, 20));
      mode = 'normal';
      release();
      await page.getByText('夜航测试玩家', { exact: true }).waitFor();
      assert(requests[0].from && requests[0].to);
      await activate(button('下一页'));
      await page.getByText('第二页玩家', { exact: true }).waitFor();
      assert.equal(requests.at(-1).page, 2);
      await activate(button('上一页'));
      await page.getByText('夜航测试玩家', { exact: true }).waitFor();
      await activate(button('清空筛选'));
      assert(await button('查询玩家').isDisabled());
      await page.getByRole('textbox', { name: '短 ID', exact: true }).fill('#c3f58a3a');
      await activate(button('查询玩家'));
      await page.getByText('夜航测试玩家', { exact: true }).waitFor();
      assert.deepEqual(requests.at(-1), { shortId: '#c3f58a3a', page: 1 });
      await page.screenshot({ path: `${site}/players-${width}.png`, fullPage: true });
      await activate(button('查看 JSON'));
      await page.getByText('当前页业务记录未截断', { exact: true }).waitFor();
      const json = page.getByLabel('玩家业务 JSON', { exact: true });
      const detail = JSON.parse(await json.innerText());
      assert.equal(detail.items[0].data.mail.length, 130);
      await activate(button('复制 JSON'));
      await page.getByText('已复制当前分类 / 当前页 JSON', { exact: true }).waitFor();
      assert.equal(
        JSON.parse(await page.evaluate(() => navigator.clipboard.readText())).items[0].data.mail
          .length,
        130,
      );
      await activate(button('详情下一页'));
      await page.waitForFunction(() =>
        document
          .querySelector('pre[aria-label="玩家业务 JSON"]')
          ?.textContent.includes('"page": 2'),
      );
      await page.getByRole('combobox', { name: '业务分类' }).click();
      await page.getByTitle('逐场成绩', { exact: true }).click();
      await page.waitForFunction(() =>
        document
          .querySelector('pre[aria-label="玩家业务 JSON"]')
          ?.textContent.includes('"section": "results"'),
      );
      mode = 'oversize';
      await activate(button('重新读取详情'));
      await page
        .getByText(/当前响应超过 4 MiB/)
        .first()
        .waitFor();
      await page.getByRole('combobox', { name: '每页记录数' }).click();
      mode = 'normal';
      await page.getByText('每页 1 条', { exact: true }).click();
      await page.getByText('当前页业务记录未截断', { exact: true }).waitFor();
      assert.equal(requests.at(-1).pageSize, 1);
      await activate(button('关闭详情'));
      mode = 'empty';
      await activate(button('查询玩家'));
      await page.getByText('暂无记录', { exact: true }).waitFor();
      mode = 'error';
      await activate(button('查询玩家'));
      await page
        .getByText(/玩家数据暂时无法读取/)
        .first()
        .waitFor();
      fixture.permissions = [];
      await page.reload();
      await page.getByText('你没有此页面的访问权限。', { exact: true }).waitFor();
      assert.equal(await page.getByRole('link', { name: '玩家查询', exact: true }).count(), 0);
      await clean();
      checks += 15;
    } finally {
      await context.close();
    }
  }
  console.log(
    JSON.stringify({
      checks,
      widths: [1360, 390, 320],
      evidence: 'apps/admin-web/dist/players-*.png',
      backend: 'HTTP fixtures; PostgreSQL and authentication tested separately',
    }),
  );
} finally {
  await browser.close();
  await server.close();
}
