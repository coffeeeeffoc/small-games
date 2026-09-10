import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const shellRoot = fileURLToPath(new URL('..', import.meta.url));
const gameRoot = fileURLToPath(new URL('../../game-cultivation', import.meta.url));
const cultivationManifest = JSON.parse(
  await readFile(
    fileURLToPath(import.meta.resolve('@coffeeeeffoc/game-cultivation/manifest')),
    'utf8',
  ),
);
let artifactBytes;
let policy;
let artifactRequests = 0;
const artifactServer = createHttpServer((_request, response) => {
  artifactRequests += 1;
  response.writeHead(200, {
    'Content-Type': 'text/javascript',
    'Content-Security-Policy': policy,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': 'Content-Security-Policy',
  });
  response.end(artifactBytes);
});
await new Promise((resolve) => artifactServer.listen(0, '127.0.0.1', resolve));
const artifactUrl = `http://127.0.0.1:${artifactServer.address().port}/remote-entry.js`;
const server = await createServer({
  root: shellRoot,
  server: { port: 0, host: '127.0.0.1' },
  define: {
    'import.meta.env.VITE_CULTIVATION_ARTIFACT_URL': JSON.stringify(artifactUrl),
    'import.meta.env.VITE_CULTIVATION_ARTIFACT_VERSION': JSON.stringify(
      cultivationManifest.version,
    ),
    'import.meta.env.VITE_CULTIVATION_ARTIFACT_INTEGRITY': 'globalThis.__artifactIntegrity',
  },
});
let browser;
try {
  await server.listen();
  const shellOrigin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const viteCli = fileURLToPath(new URL('../../bin/vite.js', import.meta.resolve('vite')));
  execFileSync(process.execPath, [viteCli, 'build', '--config', 'vite.iframe.config.ts'], {
    cwd: gameRoot,
    env: { ...process.env, NODE_ENV: 'production', VITE_SHELL_ORIGIN: shellOrigin },
    stdio: 'inherit',
    windowsHide: true,
  });
  artifactBytes = await readFile(`${gameRoot}/dist-iframe/remote-entry.js`);
  const integrity = `sha256-${createHash('sha256').update(artifactBytes).digest('base64')}`;
  policy = `default-src 'none'; script-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors ${shellOrigin}`;
  browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {}),
    headless: true,
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(15_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript((value) => {
    globalThis.__artifactIntegrity = value;
  }, integrity);
  await page.goto(shellOrigin);
  await page.getByRole('button', { name: '进入游戏' }).first().click();
  const frame = page.frameLocator('iframe');
  await frame
    .getByRole('heading', { name: '三分钟修仙', exact: true })
    .waitFor()
    .catch(async (error) => {
      console.error(await page.locator('body').innerText());
      console.error(
        'Frames:',
        page.frames().map((entry) => entry.url()),
      );
      throw error;
    });
  assert.equal(artifactRequests, 1, 'Executed bytes must not require a second artifact fetch');
  const isolated = await page.frames()[1].evaluate(() => {
    let parentBlocked = false;
    let cookieBlocked = false;
    try {
      void globalThis.parent.document.body;
    } catch {
      parentBlocked = true;
    }
    try {
      void globalThis.document.cookie;
    } catch {
      cookieBlocked = true;
    }
    return { parentBlocked, cookieBlocked };
  });
  assert.deepEqual(isolated, { parentBlocked: true, cookieBlocked: true });
  await page.evaluate(() => {
    Object.defineProperty(globalThis.document, 'hidden', { configurable: true, value: true });
    globalThis.document.dispatchEvent(new globalThis.Event('visibilitychange'));
  });
  await frame.getByText('修行已暂停', { exact: true }).waitFor();
  await page.evaluate(() => {
    Object.defineProperty(globalThis.document, 'hidden', { configurable: true, value: false });
    globalThis.document.dispatchEvent(new globalThis.Event('visibilitychange'));
  });
  await frame.getByRole('heading', { name: '三分钟修仙', exact: true }).waitFor();
  await frame.getByRole('button', { name: /照着练/ }).click();
  await frame.getByText('气走岔了，却意外打通一处经脉。', { exact: true }).waitFor();
  await page.getByRole('button', { name: '返回目录', exact: false }).click();
  await page.getByRole('button', { name: '进入游戏' }).first().waitFor();
  assert.equal(await page.locator('iframe').count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    'Real browser remote launch, isolation, pause/resume, gameplay, and disposal passed.',
  );
} finally {
  await browser?.close();
  await server.close();
  await new Promise((resolve) => artifactServer.close(resolve));
}
