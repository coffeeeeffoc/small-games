import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import { verifyArtifact } from './build.mjs';
import { root } from './config.mjs';
import { levels } from '../../local/cops-robbers/src/levels.js';
import { legalTargets } from '../../local/cops-robbers/src/engine.js';

const { values } = parseArgs({
  options: { directory: { type: 'string' }, receipt: { type: 'string' } },
});
assert(
  values.directory && values.receipt,
  'Supply a real Creator web-mobile --directory and --receipt',
);
const directory = path.resolve(values.directory);
const receipt = await verifyArtifact(directory, path.resolve(values.receipt));
assert.equal(receipt.config.platform, 'web-preview');
const game = receipt.config.game,
  evidence = path.join(root, 'test-results', game);
await mkdir(evidence, { recursive: true });
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
};
const server = createServer(async (request, response) => {
  try {
    let file = path.resolve(
      directory,
      '.' + decodeURIComponent(new URL(request.url, 'http://local').pathname),
    );
    assert(file === directory || file.startsWith(directory + path.sep));
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    response.setHeader('content-type', mime[path.extname(file)] || 'application/octet-stream');
    response.end(await readFile(file));
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const checks = [];
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    channel: 'chromium',
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    args: [
      '--enable-webgl',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });

  for (const touch of [false, true]) {
    const viewport =
      game === 'cops-robbers-realtime' ? { width: 844, height: 390 } : { width: 390, height: 844 };
    const context = await browser.newContext({ viewport, hasTouch: touch, deviceScaleFactor: 1 });
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.waitForFunction(
        () => globalThis.__cocosMiniGame?.getState()?.uploads > 0,
        {},
        { timeout: 45000 },
      );
      const snapshot = () => page.evaluate(() => globalThis.__cocosMiniGame.getState());
      const waitPage = (expected) =>
        page.waitForFunction(
          (expected) => globalThis.__cocosMiniGame.getState().state.page === expected,
          expected,
        );
      const click = async (key) => {
        const data = await snapshot(),
          layout = data.layout || data.state,
          hits = layout.hits || [];
        const hit = hits.find(
          (hit) =>
            hit.id === key ||
            hit.label === key ||
            (key.endsWith('*') && hit.label?.startsWith(key.slice(0, -1))),
        );
        assert(
          hit,
          `Missing ${key} on ${data.state.page}; available ${hits.map((h) => h.id || h.label).join(', ')}`,
        );
        const x =
          ((hit.x + hit.w / 2 + (layout.originX || 0)) * viewport.width) /
          data.viewport.windowWidth;
        const y =
          ((hit.y + hit.h / 2 + (layout.originY || 0)) * viewport.height) /
          data.viewport.windowHeight;
        assert(
          x >= 0 && y >= 0 && x < viewport.width && y < viewport.height,
          `Hit outside screen: ${key}`,
        );
        await page.waitForTimeout(150);
        if (touch) await page.touchscreen.tap(x, y);
        else await page.mouse.click(x, y);
      };
      await waitPage('home');
      await page.waitForTimeout(400);
      const png = await page.screenshot({
        path: path.join(evidence, `${touch ? 'touch' : 'mouse'}-home.png`),
      });
      const colors = await page.evaluate(async (base64) => {
        const bitmap = await createImageBitmap(
          await (await fetch('data:image/png;base64,' + base64)).blob(),
        );
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height),
          colors = new Set();
        for (let i = 0; i < data.length; i += 64)
          colors.add(`${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`);
        return colors.size;
      }, png.toString('base64'));
      assert(colors > 24, 'Creator display is blank or missing its game texture');
      if (game === 'cops-robbers') {
        await click('start');
        await waitPage('play');
        const before = (await snapshot()).state;
        const target = legalTargets(
          levels.find((l) => l.id === before.levelId),
          before.board,
          0,
        ).find((n) => n !== before.board.cops[0]);
        assert(target !== undefined);
        await click(`node${target}`);
        assert(
          (await snapshot()).state.board.turn > before.board.turn,
          'Real Cocos touch did not move the officer',
        );
        await click('pause');
        await waitPage('pause');
        await click('home');
        await waitPage('home');
        await click('modes');
        await waitPage('modes');
        await click('mode:escape');
        await waitPage('setup');
        await click('start');
        await waitPage('play');
      } else if (game === 'cops-robbers-realtime') {
        await click('开始游戏 →');
        await waitPage('levels');
        await click('开始行动 →');
        await waitPage('game');
        await page.waitForFunction(() => globalThis.__cocosMiniGame.getState().state.ticks > 3);
        await click('');
        await waitPage('pause');
        const ticks = (await snapshot()).state.ticks;
        await page.waitForTimeout(100);
        assert.equal((await snapshot()).state.ticks, ticks, 'Paused simulation still advances');
        await click('继续行动');
        await waitPage('game');
      } else {
        await click('同屏双人');
        await waitPage('play');
        await click('棋格0');
        assert.equal((await snapshot()).state.game.ply, 1);
        await click('暂停');
        await waitPage('pause');
        await click('返回首页');
        await waitPage('home');
        await click('战术练习');
        await waitPage('training');
        await click('01 一车架桥*');
        await waitPage('play');
        await click('棋格14');
        await click('棋格41');
        await waitPage('result');
        assert.equal((await snapshot()).state.game.result, 'red');
      }
      await page.screenshot({ path: path.join(evidence, `${touch ? 'touch' : 'mouse'}-play.png`) });
      await page.evaluate(() => globalThis.__cocosMiniGame.hide());
      assert.equal((await snapshot()).hidden, true);
      await page.evaluate(() => globalThis.__cocosMiniGame.show());
      assert.equal((await snapshot()).hidden, false);
      assert.deepEqual(errors, [], 'Creator runtime raised errors');
      checks.push({ input: touch ? 'touch' : 'mouse', colors, passed: true });
    } finally {
      await context.close();
    }
  }
  await writeFile(
    path.join(evidence, 'report.json'),
    JSON.stringify(
      {
        game,
        gitSha: receipt.gitSha,
        creator: receipt.creator,
        sourceHash: receipt.sourceHash,
        browser: await browser.version(),
        checks,
        realDeviceVerified: false,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`${game}: real Creator rendering, mouse and touch flows passed`);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
