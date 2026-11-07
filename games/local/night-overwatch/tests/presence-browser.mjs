import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createOwnedRuntime, ownedChild } from '../../../../scripts/h5-taptap-runtime.mjs';
import { acceptanceBuild, snapshot, assertLayout } from './flight-browser.mjs';
import { press, settleVisuals } from './visual-helpers.mjs';

const workspace = fileURLToPath(new URL('../../../../', import.meta.url));
const out = new URL('../reports/2026-11-07-presence/', import.meta.url);
await mkdir(out, { recursive: true });
const evidence = { fixture: 'isolated-real-postgresql-http', checks: [], errors: [] };
let fixture, server, browser;
try {
  fixture = await createOwnedRuntime({ workspace });
  const { api, origin } = fixture.descriptor;
  server = ownedChild(process.execPath, ['games/local/night-overwatch/scripts/serve.mjs'], {
    cwd: workspace, env: { ...process.env, PORT: '43810' },
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  process.env.NIGHT_URL = origin;
  evidence.build = await acceptanceBuild(origin);
  browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11'] });
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true })));
  for (const context of contexts) {
    await context.route('**/game-service-config.js', route => route.fulfill({contentType: 'text/javascript', body:
      'globalThis.__COMPETITION_CONFIG__=Object.freeze(' + JSON.stringify({game: 'night-overwatch', platform: 'h5', competitionEnabled: true, apiUrl: api}) + ');'}));
  }
  const open = async context => {
    const page = await context.newPage(); page.setDefaultTimeout(45000);
    page.on('pageerror', error => evidence.errors.push(error.message));
    await page.goto(origin + '/?dev=0');
    await page.waitForFunction(() => globalThis.__night?.snapshot().online.onlineCount !== null && !document.getElementById('night-startup'));
    return page;
  };
  const count = (page, n) => page.waitForFunction(n => globalThis.__night?.snapshot().online.onlineCount === n, n);
  const a = await open(contexts[0]); await count(a, 1);
  const twin = await open(contexts[0]); await count(twin, 1);
  assert.equal((await snapshot(a)).online.identity.playerId, (await snapshot(twin)).online.identity.playerId);
  const b = await open(contexts[1]); await count(b, 2); await count(twin, 2);
  await a.close(); await count(b, 2);
  evidence.checks.push('Two browser identities count as two; two tabs sharing one identity count as one');
  const capture = async (name, width, height) => {
    await settleVisuals(b); assertLayout(await snapshot(b), width, height);
    await b.screenshot({path: fileURLToPath(new URL(`${name}-${width}.png`, out))});
  };
  for (const [width, height] of [[568,320],[844,390],[1280,720]]) {
    await b.setViewportSize({width, height}); await capture('home', width, height);
    await press(b, 'online:menu', true, false);
    await b.waitForFunction(() => __night.snapshot().online.panel === 'menu');
    await count(b, 2); await capture('lobby', width, height);
    await press(b, 'online:back', true, false);
    evidence.checks.push(`Home and lobby live count, layout and touch navigation ${width}x${height}`);
  }
  await contexts[0].close();
  await count(b, 1);
  evidence.checks.push('Closed identity expires automatically within the 20-second lease plus refresh');
  await contexts[1].setOffline(true); await count(b, null);
  await capture('unavailable', 1280, 720);
  await contexts[1].setOffline(false); await count(b, 1);
  evidence.checks.push('Offline hides stale count; reconnect restores it');
  let legacyCalls = 0;
  b.on('request', r => {if (r.url().endsWith('/presence')) legacyCalls++;});
  await contexts[1].route('**/games/night-overwatch', async route => {
    const response = await route.fetch(), body = await response.json();
    delete body.capabilities.presence;
    await route.fulfill({response, json: body});
  });
  await b.reload();
  await b.waitForFunction(() => globalThis.__night?.snapshot().online.identity.playerId && !document.getElementById('night-startup'));
  const before = legacyCalls;
  await b.waitForTimeout(6000);
  assert.equal(legacyCalls, before); assert.equal((await snapshot(b)).online.onlineCount, null);
  evidence.checks.push('Legacy server advertises no presence; UI stays unavailable without polling nonexistent endpoint');
  assert.deepEqual(evidence.errors, []);
} finally {
  await browser?.close(); await server?.close(); await fixture?.close();
  await writeFile(new URL('evidence.json', out), JSON.stringify(evidence, null, 2));
}
console.log(JSON.stringify(evidence));
