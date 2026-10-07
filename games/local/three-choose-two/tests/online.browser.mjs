import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { canPlace, previewPlacement } from '../src/engine.mjs';
import { getLevel } from '../src/levels.mjs';

// This test starts the actual Runtime Service and writes only isolated identity
// fixtures. Every game move uses ordinary CDP touch input; snapshots are read-only.
const databaseUrl = process.env.THREE_CHOOSE_TWO_TEST_DATABASE_URL;
if (!databaseUrl || new URL(databaseUrl).pathname !== '/competition_test')
  throw new Error('Set THREE_CHOOSE_TWO_TEST_DATABASE_URL to isolated competition_test');
const workspace = fileURLToPath(new URL('../../../../', import.meta.url));
const output = fileURLToPath(new URL('../docs/design/actual/', import.meta.url));
const baseURL = process.env.THREE_CHOOSE_TWO_ONLINE_BROWSER_URL || 'http://localhost:4422/dist/';
const port = Number(process.env.THREE_CHOOSE_TWO_ONLINE_API_PORT || 4424);
const apiURL = `http://127.0.0.1:${port}/api/competition/v1`;
const configuredPsql = process.env.PSQL_PATH || 'psql';
const psql = await access(configuredPsql).then(() => configuredPsql, () => 'psql');
let apiProcess, browser;
let apiErrors = '';
let releaseDelayedFinish;
const fixtureIds = [];
const contexts = [];
const report = {
  startedAt: new Date().toISOString(), actualDevice: false, status: 'running',
  environment: 'Production dist, Chromium 390×844 with real CDP touch, actual Runtime Service TCP HTTP and PostgreSQL 17',
  identityBoundary: 'H5 guest uses the real guest API. WeChat/B站 credentials are isolated SQL test identities; official login and device SDKs are not exercised.',
  checks: [], screenshots: [], errors: [],
};
await mkdir(output, { recursive: true });
function record(name, detail) { report.checks.push({ name, status: 'passed', ...(detail ? { detail } : {}) }); console.log('PASS ' + name); }
async function sql(query) {
  return new Promise((resolve, reject) => {
    const child = spawn(psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-At', databaseUrl], { stdio: ['pipe', 'pipe', 'pipe'] });
    let result = '', errors = '';
    child.stdout.on('data', data => { result += data; });
    child.stderr.on('data', data => { errors += data; });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve(result.trim()) : reject(new Error('Test SQL failed: ' + errors)));
    child.stdin.end(query);
  });
}
async function identity(platform, name) {
  const playerId = randomUUID(), token = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 180 * 86400_000;
  fixtureIds.push(playerId);
  await sql(`insert into runtime.competition_players(id,platform,app_id,subject,created_at,display_name) values('${playerId}','${platform}','browser-fixture','${randomUUID()}',${Date.now()},'${name}'); insert into runtime.competition_sessions values('${createHash('sha256').update(token).digest('hex')}','${playerId}',${expiresAt});`);
  return { playerId, token, expiresAt };
}
async function api(path, credential, body) {
  const response = await fetch(apiURL + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(credential ? { authorization: 'Bearer ' + credential.token } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  assert.equal(response.status, 200, `${path}: ${JSON.stringify(data)}`);
  return data;
}
async function startAPI() {
  apiProcess = spawn(process.execPath, ['services/runtime-api/dist/main.js'], {
    cwd: workspace,
    env: { ...process.env, RUNTIME_DATABASE_URL: databaseUrl, COMPETITION_ENABLED: 'true', COMPETITION_ORIGINS: new URL(baseURL).origin, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  apiProcess.stderr.on('data', data => { apiErrors += data; });
  apiProcess.stdout.on('data', data => { apiErrors += data; });
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (apiProcess.exitCode !== null) throw new Error('Runtime exited: ' + apiErrors);
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).status === 200) return; } catch { /* Service startup pending. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Runtime did not become ready: ' + apiErrors);
}
async function phone(credential) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  contexts.push(context);
  await context.addInitScript(({ apiURL, credential }) => {
    globalThis.__COMPETITION_CONFIG__ = { apiUrl: apiURL };
    if (credential) localStorage.setItem('competition-session-v1:h5', JSON.stringify(credential));
    Object.defineProperty(navigator, 'share', { configurable: true, value: async payload => { window.__onlineSharedPayload = payload; } });
  }, { apiURL, credential });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(baseURL);
  await expect(page.locator('#game')).toHaveAttribute('data-ready', 'true');
  const cdp = await context.newCDPSession(page);
  return { context, page, cdp };
}
async function snapshot(page) { return page.evaluate(() => window.getThreeChooseTwoSnapshot()); }
async function screen(page, name) { await expect(page.locator('#game')).toHaveAttribute('data-screen', name); }
async function action(page, name) {
  const button = page.locator(`[data-action="${name}"]`).first();
  await expect(button).toBeVisible();
  await button.tap();
}
async function startOnline(page) { await action(page, 'endless'); await screen(page, 'endless'); await action(page, 'online-start'); await screen(page, 'playing'); }
function legalNoClear(state) {
  for (let slot = 0; slot < 3; slot++) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++)
    if (canPlace(state, slot, x, y) && previewPlacement(state, slot, x, y).lines === 0) return { slot, x, y };
  throw new Error('Current fixture has no legal non-scoring placement');
}
async function drag(page, cdp, move) {
  const candidate = page.locator(`[data-slot="${move.slot}"]`);
  const [boardBox, candidateBox, shape] = await Promise.all([
    page.locator('#board').boundingBox(), candidate.boundingBox(),
    candidate.evaluate(node => ({ width: Number(node.dataset.width), height: Number(node.dataset.height) })),
  ]);
  assert(boardBox && candidateBox);
  const pitch = boardBox.width * 40 / 360, pad = boardBox.width * 20 / 360;
  const start = { x: candidateBox.x + candidateBox.width / 2, y: candidateBox.y + candidateBox.height / 2 };
  const target = { x: boardBox.x + pad + (move.x + shape.width / 2) * pitch, y: boardBox.y + pad + (move.y + shape.height) * pitch + 46 };
  const touch = (type, points = []) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(point => ({ id: 1, radiusX: 3, radiusY: 3, force: 1, ...point })) });
  await touch('touchStart', [start]);
  for (let i = 1; i <= 6; i++) await touch('touchMove', [{ x: start.x + (target.x - start.x) * i / 6, y: start.y + (target.y - start.y) * i / 6 }]);
  await touch('touchEnd');
  await page.waitForTimeout(340);
}
async function capture(page, name) {
  const filename = 'online-' + name + '.png';
  await page.screenshot({ path: output + '/' + filename });
  report.screenshots.push({ filename, viewport: page.viewportSize() });
}
async function finish(page) {
  await action(page, 'pause'); await screen(page, 'pause'); await action(page, 'end-run'); await screen(page, 'result');
  await expect.poll(async () => (await snapshot(page)).online.status).toBe('finished');
}
async function recordedCredential(page) { return page.evaluate(() => JSON.parse(localStorage.getItem('competition-session-v1:h5'))); }
try {
  await startAPI();
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  const suffix = randomUUID().slice(0, 4);
  const a = await identity('wechat', '触屏甲' + suffix), b = await identity('bilibili', '触屏乙' + suffix);
  const first = await phone(a);
  await startOnline(first.page);
  assert.equal((await snapshot(first.page)).online.eligible, true);
  await capture(first.page, 'ranked-start');
  const id = (await snapshot(first.page)).online.id;
  for (let count = 1; count <= 2; count++) {
    const move = legalNoClear((await snapshot(first.page)).state);
    await drag(first.page, first.cdp, move);
    await expect.poll(async () => (await snapshot(first.page)).online.seq).toBe(count);
  }
  assert.equal((await snapshot(first.page)).state.group, 2);
  record('Real touch placements receive canonical server confirmations');
  await first.context.setOffline(true);
  for (let count = 3; count <= 4; count++) {
    const move = legalNoClear((await snapshot(first.page)).state);
    await drag(first.page, first.cdp, move);
    await expect.poll(async () => (await snapshot(first.page)).state.stats.placements).toBe(count);
  }
  const offline = await snapshot(first.page);
  assert.equal(offline.online.seq, 2);
  assert.equal(offline.state.group, 2);
  assert.equal(offline.state.waitingNextGroup, true);
  assert.equal(offline.state.placedInGroup, 2);
  const waiting = offline.state.stats.placements;
  const unused = [0, 1, 2].find(slot => !offline.state.used.includes(slot));
  await drag(first.page, first.cdp, { slot: unused, x: 5, y: 5 });
  assert.equal((await snapshot(first.page)).state.stats.placements, waiting);
  assert.equal((await api('/three-choose-two/session/' + id, a)).seq, 2);
  await capture(first.page, 'offline-issued-group');
  record('Offline play completes only the issued group and locks undisclosed future candidates');
  await first.context.setOffline(false);
  await action(first.page, 'online-retry');
  await expect.poll(async () => (await snapshot(first.page)).online.seq).toBe(4);
  await expect.poll(async () => (await snapshot(first.page)).state.group).toBe(3);
  const canonical = await api('/three-choose-two/session/' + id, a);
  assert.deepEqual((await snapshot(first.page)).state.board, canonical.state.board);
  assert.equal(canonical.state.stats.placements, 4);
  await capture(first.page, 'reconnected');
  record('Reconnect flushes ordered actions once and restores exactly server seq 4');
  await first.page.reload();
  await screen(first.page, 'home');
  await startOnline(first.page);
  const restored = await snapshot(first.page);
  assert.equal(restored.online.id, id);
  assert.equal(restored.online.seq, 4);
  assert.deepEqual(restored.state.board, canonical.state.board);
  await capture(first.page, 'reload-restored');
  record('Reload resumes the same server session and confirmed board');
  await finish(first.page);
  await expect(first.page.locator('.result-status')).toContainText('成绩已校验');
  const ended = await api('/three-choose-two/session/' + id, a);
  assert.equal(ended.settlement.status, 'verified');
  assert.equal(ended.state.score, 0);
  await capture(first.page, 'verified-result');
  await action(first.page, 'share');
  const shared = await first.page.evaluate(() => window.__onlineSharedPayload);
  assert.match(shared.text, new RegExp('全站第 ' + ended.settlement.rank + ' 名'));
  assert.doesNotMatch(shared.text, /击败|超过.*%|种子|dev=/);
  assert.equal(new URL(shared.url).search, '');
  record('Sharing uses the actual verified score and rank with no invented percentage');
  const second = await phone(b);
  await startOnline(second.page);
  await finish(second.page);
  const board = await api('/three-choose-two/board', b);
  const rowA = board.top.find(row => row.playerId === a.playerId), rowB = board.top.find(row => row.playerId === b.playerId);
  assert(rowA && rowB);
  assert.equal(rowA.score, rowB.score);
  assert.equal(rowA.rank, rowB.rank);
  assert(rowA.position < rowB.position);
  await action(first.page, 'leaderboard');
  await screen(first.page, 'leaderboard');
  await expect(first.page.locator('.ranking-player').filter({ hasText: '触屏甲' + suffix }).first()).toBeVisible();
  await expect(first.page.locator('.ranking-player').filter({ hasText: '触屏乙' + suffix }).first()).toBeVisible();
  await capture(first.page, 'real-tied-board');
  record('WeChat and B站 fixture identities appear in one real board with tied competition rank');
  const guest = await phone();
  await startOnline(guest.page);
  const guestCredential = await recordedCredential(guest.page);
  fixtureIds.push(guestCredential.playerId);
  assert.equal((await snapshot(guest.page)).online.eligible, false);
  await expect(guest.page.locator('.screen-header h2')).toContainText('不入榜');
  await capture(guest.page, 'guest-ineligible');
  await finish(guest.page);
  await expect(guest.page.locator('.result-status')).toContainText('登录');
  const guestBoard = await api('/three-choose-two/board', guestCredential);
  assert.equal(guestBoard.me, null);
  assert.equal(guestBoard.top.some(row => row.playerId === guestCredential.playerId), false);
  await action(guest.page, 'share');
  const guestShared = await guest.page.evaluate(() => window.__onlineSharedPayload);
  assert.doesNotMatch(guestShared.text, /全站第|击败|超过.*%/);
  await capture(guest.page, 'guest-result');
  record('Actual H5 guest session remains ineligible and never invents rank in UI or sharing');
  const recovery = await phone();
  await action(recovery.page, 'start');
  await screen(recovery.page, 'brief');
  await action(recovery.page, 'begin');
  await screen(recovery.page, 'playing');
  for (const move of getLevel(1).solution) await drag(recovery.page, recovery.cdp, move);
  await screen(recovery.page, 'result');
  await action(recovery.page, 'next');
  await screen(recovery.page, 'brief');
  await action(recovery.page, 'begin');
  await screen(recovery.page, 'playing');
  await drag(recovery.page, recovery.cdp, getLevel(2).solution[0]);
  const savedLocal = (await snapshot(recovery.page)).state;
  assert.equal(savedLocal.mode, 'level');
  assert.equal(savedLocal.levelId, 2);
  assert.equal(savedLocal.status, 'playing');
  assert.equal(savedLocal.stats.placements, 1);
  await action(recovery.page, 'pause');
  await screen(recovery.page, 'pause');
  await action(recovery.page, 'home');
  await screen(recovery.page, 'home');
  await startOnline(recovery.page);
  const recoveryCredential = await recordedCredential(recovery.page);
  fixtureIds.push(recoveryCredential.playerId);
  const abandonedOnlineId = (await snapshot(recovery.page)).online.id;
  await recovery.context.setOffline(true);
  await action(recovery.page, 'pause');
  await screen(recovery.page, 'pause');
  await action(recovery.page, 'end-run');
  await screen(recovery.page, 'result');
  await expect.poll(() => recovery.page.evaluate(() => JSON.parse(localStorage.getItem('three-choose-two-online-v1')).finish)).toBe(true);
  await expect(recovery.page.locator('.result-status')).toContainText('网络');
  await capture(recovery.page, 'pending-finish');
  // Hold an actual successful server reply to verify it cannot overwrite a later local game.
  let finishedOnServer;
  const backendFinished = new Promise(resolve => { finishedOnServer = resolve; });
  const finishGate = new Promise(resolve => { releaseDelayedFinish = resolve; });
  await recovery.page.route('**/api/competition/v1/three-choose-two/session/*/finish', async route => {
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    finishedOnServer();
    await finishGate;
    await route.fulfill({ response });
  });
  await recovery.context.setOffline(false);
  await action(recovery.page, 'online-retry');
  await backendFinished;
  assert.equal((await api('/three-choose-two/session/' + abandonedOnlineId, recoveryCredential)).status, 'finished');
  await action(recovery.page, 'home');
  await screen(recovery.page, 'home');
  await action(recovery.page, 'start');
  await screen(recovery.page, 'playing');
  const localRestored = await snapshot(recovery.page);
  assert.equal(localRestored.online, null);
  assert.equal(localRestored.state.levelId, 2);
  assert.deepEqual(localRestored.state.board, savedLocal.board);
  await drag(recovery.page, recovery.cdp, getLevel(2).solution[1]);
  await expect.poll(async () => (await snapshot(recovery.page)).state.stats.placements).toBe(2);
  const localAfterTouch = await snapshot(recovery.page);
  releaseDelayedFinish();
  releaseDelayedFinish = null;
  await recovery.page.waitForTimeout(500);
  const afterOldReply = await snapshot(recovery.page);
  assert.equal(afterOldReply.screen, 'playing');
  assert.equal(afterOldReply.online, null);
  assert.equal(afterOldReply.state.mode, 'level');
  assert.equal(afterOldReply.state.levelId, 2);
  assert.deepEqual(afterOldReply.state.board, localAfterTouch.state.board);
  assert.equal(afterOldReply.state.stats.placements, 2);
  await capture(recovery.page, 'local-resume-after-pending-finish');
  record('Pending online finish does not lock a resumed local save, and a delayed server reply cannot overwrite it');
  assert.deepEqual(report.errors, []);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = error.stack || error.message;
  console.error(error.stack || error);
  process.exitCode = 1;
} finally {
  releaseDelayedFinish?.();
  await Promise.allSettled(contexts.map(context => context.close()));
  await browser?.close();
  if (apiProcess) { apiProcess.kill('SIGTERM'); await new Promise(resolve => { if (apiProcess.exitCode !== null) resolve(); else apiProcess.once('exit', resolve); }); }
  if (fixtureIds.length) {
    const list = fixtureIds.map(id => `'${id}'`).join(',');
    await sql(`delete from runtime.three_choose_two_best where player_id in (${list}); delete from runtime.three_choose_two_results where player_id in (${list}); delete from runtime.three_choose_two_actions where session_id in (select id from runtime.three_choose_two_sessions where player_id in (${list})); delete from runtime.three_choose_two_sessions where player_id in (${list}); delete from runtime.competition_sessions where player_id in (${list}); delete from runtime.competition_players where id in (${list});`);
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(output + '/online-browser-report.json', JSON.stringify(report, null, 2) + '\n');
}
