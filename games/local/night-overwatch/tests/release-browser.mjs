import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { createOwnedRuntime, ownedChild } from '../../../../scripts/h5-taptap-runtime.mjs';
import { acceptanceBuild, snapshot, press, settleVisuals, assertLayout } from './flight-browser.mjs';

const workspace = fileURLToPath(new URL('../../../../', import.meta.url));
const out = new URL('../reports/versioned-release/', import.meta.url);
await mkdir(out, { recursive: true });
const configSource = await readFile(new URL('../dist/game-service-config.js', import.meta.url), 'utf8');
const config = JSON.parse(configSource.match(/Object\.freeze\((\{[^]*\})\);/)?.[1]);
const { buildId, ranked, multiplayer } = config.release;
const policy = { schemaVersion: 1, builds: [
  { buildId, channel: 'web-h5', ranked, multiplayer },
  { buildId: 'next-browser-fixture', channel: 'web-h5', ranked, multiplayer },
], channels: [{ channel: 'web-h5', latestBuildId: 'next-browser-fixture' }], legacy: { channel: 'web-h5', ranked, multiplayer }, allowNew: { ranked: [ranked], multiplayer: [multiplayer] } };
const evidence = { fixture: 'real-runtime-postgresql-with-fixture-release-policy-and-local-api-override', passed: false, checks: [], errors: [] };
// Local Docker disk fsync is slow; a fresh tmpfs volume keeps PostgreSQL checks deterministic.
const docker = (args, input) => {
  if (args[0] === 'volume' && args[1] === 'create') args = [...args.slice(0, 2), '--opt', 'type=tmpfs', '--opt', 'device=tmpfs', '--opt', 'o=size=192m', ...args.slice(2)];
  return execFileSync('docker', args, { input, encoding: 'utf8', windowsHide: true, timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
};
let fixture, server, browser;
try {
  fixture = await createOwnedRuntime({ workspace, docker, startChild: (command, args, options) => ownedChild(command, args, { ...options, env: { ...options.env, NIGHT_RELEASE_CONFIG: JSON.stringify(policy) } }) });
  const { api, origin } = fixture.descriptor;
  server = ownedChild(process.execPath, ['games/local/night-overwatch/scripts/serve.mjs'], { cwd: workspace, env: { ...process.env, PORT: '43810' } });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(origin)).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 200)); }
  process.env.NIGHT_URL = origin;
  evidence.build = await acceptanceBuild(origin); evidence.release = config.release;
  browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11'] });
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
  await context.route('**/game-service-config.js', route => route.fulfill({ contentType: 'text/javascript', body: `globalThis.__COMPETITION_CONFIG__=Object.freeze(${JSON.stringify({ ...config, competitionEnabled: true, apiUrl: api })});` }));
  const page = await context.newPage(); page.setDefaultTimeout(45000);
  page.on('pageerror', error => evidence.errors.push(error.message));
  let navigations = 0;
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
  await page.goto(origin + '/?dev=0');
  await page.waitForFunction(() => globalThis.__night?.snapshot().online.release?.update === 'optional' && !document.getElementById('night-startup'));
  const capture = async (name, width, height) => { await settleVisuals(page); assertLayout(await snapshot(page), width, height); await page.screenshot({ path: fileURLToPath(new URL(`${name}-${width}.png`, out)) }); };
  for (const [width, height] of [[568,320],[844,390],[1280,720]]) {
    await page.setViewportSize({ width, height }); await capture('home', width, height);
    await press(page, 'online:version', true, false);
    await page.waitForFunction(() => __night.snapshot().online.panel === 'version');
    await capture('version', width, height);
    assert(!(await snapshot(page)).buttons.some(b=>b.id==='online:releaseSave'));
    assert.equal((await snapshot(page)).online.releaseIssue,undefined);
    await press(page, 'online:releaseCheck', true, false);
    await press(page, 'online:back', true, false);
    evidence.checks.push(`Update notice without manual saving or false incompatibility at ${width}x${height}`);
  }
  await press(page, 'qm:modes'); await press(page, 'mode:enter'); await press(page, 'start');
  await page.waitForFunction(() => __night.snapshot().phase === 'playing');
  const before = (await snapshot(page)).time;
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
  await page.waitForTimeout(1500);
  const playing = await snapshot(page);
  assert.equal(playing.phase, 'playing'); assert.equal(playing.online.panel, ''); assert(playing.time > before);
  assert.equal(playing.online.rankStatus, 'recording'); assert.equal(playing.operationPractice, false);
  assert.equal(navigations, 1); assert.equal(playing.online.release.update, 'optional');
  evidence.checks.push('New-version policy preserves the active real single-player run without reload or forced modal');
  await press(page, 'settings', true, false);
  await page.waitForFunction(() => __night.snapshot().buttons.some(b => b.id === 'home'));
  await press(page, 'home', true, false); await press(page, 'exitConfirm', true, false);
  await page.waitForFunction(() => __night.snapshot().phase === 'briefing');
  await press(page, 'online:version');
  assert.equal((await snapshot(page)).online.releaseIssue,undefined);
  evidence.checks.push('Compatible old client continues normally after an actual match');
  assert.deepEqual(evidence.errors, []);
  evidence.passed = true;
} finally {
  await browser?.close(); await server?.close(); await fixture?.close();
  await writeFile(new URL('evidence.json', out), JSON.stringify(evidence, null, 2));
}
console.log(JSON.stringify(evidence));
