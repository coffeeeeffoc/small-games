import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { startAdminCaddy } from '../../../scripts/admin-caddy-fixture.mjs';
import { controlBrowserChecks } from './control-browser.mjs';
import { collectBrowserErrors } from './control.fixture.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const repository = new URL('../../../', import.meta.url);
const sha256 = async (path) =>
  createHash('sha256')
    .update(await readFile(new URL(path, repository)))
    .digest('hex');
const sourceFiles = [
  ...(await files('apps/admin-web/src')),
  'apps/admin-web/index.html',
  'apps/admin-web/vite.config.ts',
  'apps/admin-web/package.json',
  'apps/admin-web/tsconfig.json',
  'apps/admin-web/tests/browser.mjs',
  'apps/admin-web/tests/control.fixture.mjs',
  'apps/admin-web/tests/control-browser.mjs',
  'scripts/admin-caddy-fixture.mjs',
  'scripts/admin-csp.mjs',
  'scripts/competition-ingress.mjs',
];
const sourceHashes = Object.fromEntries(
  await Promise.all(sourceFiles.map(async (path) => [path, await sha256(path)])),
);
async function files(path) {
  const entries = await readdir(new URL(path, repository), { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory() ? files(`${path}/${entry.name}`) : [`${path}/${entry.name}`],
      ),
    )
  ).flat();
}
const buildHashes = Object.fromEntries(
  await Promise.all(
    (await files('apps/admin-web/dist')).map(async (path) => [path, await sha256(path)]),
  ),
);
const server = await startAdminCaddy(root + '/dist');
const browser = await chromium
  .launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {}),
  })
  .catch(async (error) => {
    await server.close();
    throw error;
  });
// Retain the original candidate's six screenshots as provenance; these are HTTP-fixture UI checks.
const evidence = fileURLToPath(
  new URL('../../../docs/admin-console/qa/control-ui-current/', import.meta.url),
);
await mkdir(evidence, { recursive: true });
try {
  const diagnostic = process.argv.includes('--diagnose-roles')
    ? 'roles'
    : process.argv.includes('--diagnose-control')
      ? 'navigation'
      : false;
  for (const viewport of diagnostic
    ? []
    : [
        { width: 1360, height: 900 },
        { width: 390, height: 844 },
        { width: 320, height: 740 },
      ]) {
    const context = await browser.newContext({
      viewport,
      isMobile: viewport.width < 500,
      hasTouch: viewport.width < 500,
    });
    const page = await context.newPage();
    const clean = await collectBrowserErrors(page);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    let status = 401;
    let logout = false;
    await page.route('**/api/session', (route) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body:
          status === 200
            ? JSON.stringify({ user: { login: 'creator' }, csrfToken: 'c'.repeat(43) })
            : JSON.stringify({ error: status === 401 ? 'authentication_required' : 'forbidden' }),
      }),
    );
    await page.route('**/api/logout', (route) => {
      assert.equal(route.request().headers()['x-csrf-token'], 'c'.repeat(43));
      logout = true;
      status = 401;
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    for (const state of ['login', 'welcome', 'forbidden']) {
      status = state === 'welcome' ? 200 : 401;
      await page.goto(
        `${server.url}/${state === 'welcome' ? '' : state === 'forbidden' ? 'forbidden' : 'login'}`,
      );
      await page.getByRole('heading', { level: 1 }).waitFor();
      const button =
        state === 'welcome'
          ? page.getByRole('button', { name: '退出登录' })
          : page.getByRole('link', {
              name: state === 'forbidden' ? '换个 GitHub 账号' : '使用 GitHub 继续',
            });
      await button.waitFor();
      assert.ok(await button.isVisible());
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `Overflow ${state}/${viewport.width}`,
      );
      const box = await button.boundingBox();
      assert.ok(box.height >= 44);
      if (state !== 'welcome') assert.equal(await button.getAttribute('href'), '/api/auth/github');
      await page.screenshot({
        path: `${evidence}/legacy-${state}-${viewport.width}.png`,
        fullPage: true,
        animations: 'disabled',
      });
      if (state === 'welcome') {
        assert.ok(await page.getByText('@creator', { exact: true }).isVisible());
        if (viewport.width < 500) await button.tap();
        else await button.click();
        await page.getByRole('link', { name: '使用 GitHub 继续' }).waitFor();
        assert.ok(logout);
      }
    }
    status = 403;
    await page.goto(server.url + '/');
    await page.waitForURL('**/forbidden');
    status = 503;
    await page.goto(server.url + '/');
    await page.getByRole('button', { name: '重新连接' }).waitFor();
    status = 401;
    await page.getByRole('button', { name: '重新连接' }).click();
    await page.waitForURL('**/login');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(
      await page.locator('.orbit-block').evaluate((el) => getComputedStyle(el).animationName),
      'none',
    );
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => document.activeElement !== document.body));
    assert.deepEqual(errors, []);
    await clean();
    await context.close();
  }
  const controlChecks = await controlBrowserChecks(browser, server.url, evidence, diagnostic);
  if (diagnostic)
    console.log(`DIAGNOSTIC ONLY: ${diagnostic} completed; no full acceptance receipt`);
  else {
    console.log(
      `PASS: 9 legacy scenes + ${controlChecks} control groups; actual Caddy, permissions/CAS/revocation/CSP/nonce; 320/390/1360, touch, reduced motion`,
    );
    for (const [path, hash] of Object.entries(sourceHashes))
      assert.equal(await sha256(path), hash, `Source changed during browser proof: ${path}`);
    const screenshots = Object.fromEntries(
      await Promise.all(
        (await files('docs/admin-console/qa/control-ui-current'))
          .filter((path) => path.endsWith('.png'))
          .filter((path) => !path.includes('/diagnostics/'))
          .map(async (path) => [path, await sha256(path)]),
      ),
    );
    await writeFile(
      `${evidence}/receipt.json`,
      JSON.stringify(
        {
          testedAt: new Date().toISOString(),
          node: process.version,
          browser: browser.version(),
          viewportWidths: [320, 390, 1360],
          fixtureResponses: true,
          actualCaddy: server.runtime,
          controlChecks,
          legitimateCspViolations: 0,
          intentionalUnnoncedStyleBlocked: true,
          realGithubVerified: false,
          realDeviceVerified: false,
          sourceHashes,
          buildHashes,
          screenshots,
        },
        null,
        2,
      ) + '\n',
    );
  }
} finally {
  try {
    await browser.close();
  } finally {
    await server.close();
  }
}
