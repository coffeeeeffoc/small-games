import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { canPlace, previewPlacement, placeIssuedGroup } from '../src/engine.mjs';
import { SHAPE_BY_ID } from '../src/shapes.mjs';
import { nativeHarnessHtml } from './browser-harness.mjs';

// Only the official code exchange is mocked. Login persistence, authentication,
// replay, settlement and ranking use the real Runtime Service and isolated PG.
const databaseURL = process.env.THREE_CHOOSE_TWO_TEST_DATABASE_URL;
const ownerURL = process.env.THREE_CHOOSE_TWO_TEST_OWNER_DATABASE_URL;
for (const value of [databaseURL, ownerURL])
  assert.equal(value && new URL(value).pathname, '/competition_test', 'Use only the isolated competition_test database');
const workspace = fileURLToPath(new URL('../../../../', import.meta.url));
const output = fileURLToPath(new URL('../docs/design/native-actual/', import.meta.url));
const apiPort = Number(process.env.THREE_CHOOSE_TWO_NATIVE_API_PORT || 4426);
const apiURL = `http://127.0.0.1:${apiPort}/api/competition/v1`;
const fixture = randomUUID(), testSecret = randomBytes(24).toString('hex');
const prelude = path.join(workspace, '.scratch/three-choose-two', `native-official-${process.pid}.mjs`);
const report = { environment: 'Built WeChat and B站 native bundles; Chromium CDP touch; actual Runtime HTTP and PostgreSQL',
  actualDevice: false, officialPlatformVerified: false,
  identityBoundary: 'SDK login code is a fixture; only the official WeChat/B站 code-to-openid HTTP exchange is mocked. Our identity, token, moves, replay and leaderboard use the real service and database.',
  checks: [], screenshots: [], errors: [] };
const psql = process.env.PSQL_PATH || '/tmp/three-choose-two-postgres/root/usr/lib/postgresql/17/bin/psql';
let runtime, runtimeOutput = '', browser;
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const platform = url.searchParams.get('platform') === 'bilibili' || url.pathname.startsWith('/bilibili/') ? 'bilibili' : 'wechat';
    if (url.pathname === '/') {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      const html = nativeHarnessHtml({ platform, appId: `mock-${platform}-app`, apiUrl: apiURL, loginCode: `${fixture}-${platform}` });
      response.end(html.replace('src="/game.js"', `src="/${platform}/game.js"`)); return;
    }
    const artifact = path.join(workspace, 'apps/shell-minigame/dist', platform, 'three-choose-two');
    const filename = path.resolve(artifact, '.' + url.pathname.replace(/^\/(wechat|bilibili)/, ''));
    assert.ok(filename.startsWith(artifact + path.sep));
    response.setHeader('content-type', filename.endsWith('.js') ? 'application/javascript' : 'audio/wav');
    response.end(await readFile(filename));
  } catch { response.writeHead(404); response.end(); }
});
const record = name => { report.checks.push(name); console.log(`PASS ${name}`); };
async function sql(query) {
  return new Promise((resolve, reject) => {
    const child = spawn(psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-At', ownerURL], { stdio: ['pipe', 'pipe', 'pipe'] });
    let result = '', errors = '';
    child.stdout.on('data', data => { result += data; }); child.stderr.on('data', data => { errors += data; });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve(result.trim()) : reject(new Error(errors)));
    child.stdin.end(query);
  });
}
async function startRuntime(origin) {
  await mkdir(path.dirname(prelude), { recursive: true });
  await writeFile(prelude, `const realFetch=globalThis.fetch;globalThis.fetch=(input,init)=>{const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);if(['api.weixin.qq.com','miniapp.bilibili.com'].includes(url.hostname)&&url.pathname.endsWith('jscode2session'))return Promise.resolve(new Response(JSON.stringify({openid:'native-fixture-'+url.searchParams.get('js_code')}),{status:200,headers:{'content-type':'application/json'}}));return realFetch(input,init)};\n`);
  runtime = spawn(process.execPath, ['services/runtime-api/dist/main.js'], {
    cwd: workspace, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --import ${prelude}`,
      RUNTIME_DATABASE_URL: databaseURL, COMPETITION_ENABLED: 'true', COMPETITION_ORIGINS: origin, PORT: String(apiPort),
      COMPETITION_PLATFORM_CONFIG: JSON.stringify(['wechat', 'bilibili'].map(platform => ({ platform, appId: `mock-${platform}-app`, secret: testSecret }))) },
  });
  runtime.stdout.on('data', data => { runtimeOutput += data; }); runtime.stderr.on('data', data => { runtimeOutput += data; });
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (runtime.exitCode !== null) throw new Error('Runtime exited: ' + runtimeOutput);
    try { if ((await fetch(`http://127.0.0.1:${apiPort}/health`)).status === 200) return; } catch { /* Pending startup. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Runtime did not become ready: ' + runtimeOutput);
}
function legalMove(state) {
  const moves = [];
  for (let slot = 0; slot < 3; slot++) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (canPlace(state, slot, x, y)) {
    const preview = previewPlacement(state, slot, x, y);
    moves.push({ slot, x, y, value: preview.lines * 100 - SHAPE_BY_ID[state.candidates[slot].shapeId].size - y * .01 - x * .001 });
  }
  return moves.sort((a, b) => b.value - a.value)[0];
}
async function runPlatform(platform, origin) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(), cdp = await context.newCDPSession(page);
  page.on('pageerror', error => report.errors.push(error.message));
  const labels = () => page.evaluate(() => nativeHarness.labels());
  const saved = () => page.evaluate(() => nativeHarness.saved());
  const session = () => page.evaluate(() => nativeHarness.online());
  const waitLabel = value => page.waitForFunction(value => nativeHarness.labels().includes(value), value);
  const tap = async label => {
    await waitLabel(label); const point = await page.evaluate(label => nativeHarness.position(label), label);
    await page.touchscreen.tap(point.x, point.y);
  };
  const capture = async name => {
    const filename = `${platform}-${name}.png`; await page.screenshot({ path: path.join(output, filename) }); report.screenshots.push(filename);
  };
  const drag = async move => {
    const start = { x: 74 + move.slot * 121, y: 682 }, end = { x: 27 + (move.x + .5) * 42, y: 227 + (move.y + .5) * 42 + 54 };
    const point = (x, y) => [{ x, y, id: 22, radiusX: 3, radiusY: 3, force: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(start.x, start.y) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(end.x, end.y) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  try {
    await page.goto(`${origin}/?platform=${platform}`);
    if (platform === 'bilibili') await tap('开始游戏');
    await page.evaluate(() => exports.ready);
    await tap('无尽练习'); await tap('开始在线排位'); await waitLabel('无尽排位');
    assert.equal(await page.evaluate(() => nativeHarness.loginCount()), 1);
    assert.ok((await page.evaluate(() => nativeHarness.requests())).some(request => request.pathname.endsWith('/sessions/platform')));
    assert.equal((await session()).eligible, true); assert.equal((await session()).state.score, 0);
    assert.equal((await saved()).currentGame, null); record(`${platform}: SDK login and mocked official exchange issue a real eligible database identity`);
    await capture('online-game');
    const opening = await session();
    await page.evaluate(() => nativeHarness.dropNextActionResponse()); await drag(legalMove(opening.state));
    await waitLabel('重新连接'); assert.equal((await saved()).native.online.seq, 0);
    assert.equal((await saved()).native.online.pendingActions[0].seq, 1);
    const committed = await session(); assert.equal(committed.seq, 1);
    await capture('online-response-lost'); await tap('重新连接');
    await page.waitForFunction(() => nativeHarness.saved()?.native?.online?.seq === 1 && !nativeHarness.saved()?.native?.online?.pendingActions?.length);
    assert.equal((await page.evaluate(() => nativeHarness.requests())).filter(request => request.pathname.endsWith('/actions')).length, 1);
    record(`${platform}: lost response restores the committed sequence without submitting a duplicate move`);
    await page.waitForTimeout(350);
    await page.evaluate(() => nativeHarness.failNextActionBeforeRequest()); await drag(legalMove((await session()).state));
    await waitLabel('重新连接'); assert.equal((await session()).seq, 1);
    await tap('重新连接');
    await page.waitForFunction(() => nativeHarness.saved()?.native?.online?.seq === 2 && !nativeHarness.saved()?.native?.online?.pendingActions?.length);
    assert.equal((await session()).seq, 2); record(`${platform}: a request lost before transmission is replayed once against the restored group`);
    const beforeReload = await session();
    await page.reload(); if (platform === 'bilibili') await tap('开始游戏'); await page.evaluate(() => exports.ready); await tap('无尽练习'); await tap('恢复在线对局'); await waitLabel('无尽排位');
    assert.equal(await page.evaluate(() => nativeHarness.loginCount()), 0);
    assert.equal((await session()).seq, beforeReload.seq); assert.deepEqual((await session()).state, beforeReload.state);
    record(`${platform}: reload reuses the server credential and exact confirmed session state`);
    for (let count = 0; count < 60 && (await session()).state.status === 'playing' && (await session()).state.score === 0; count++) {
      const current = await session(), move = legalMove(current.state); if (!move) break;
      await drag(move);
      await page.waitForFunction(seq => nativeHarness.saved()?.native?.online?.seq > seq || nativeHarness.labels().includes('重新连接'), current.seq);
      assert.ok(!(await labels()).includes('重新连接')); await page.waitForTimeout(330);
    }
    if ((await session()).state.status === 'playing') { await tap('暂停'); await tap('结束本局'); }
    await waitLabel('排位结束');
    await page.waitForFunction(() => nativeHarness.online()?.settlement?.status === 'verified');
    assert.equal((await session()).settlement.status, 'verified');
    assert.ok((await labels()).some(label => label.startsWith('成绩已校验')));
    assert.equal((await saved()).practiceBest, 0); assert.equal((await saved()).currentGame, null);
    await capture('online-result'); await tap('查看排行榜');
    await page.waitForFunction(() => nativeHarness.board()?.me);
    const board = await page.evaluate(() => nativeHarness.board());
    assert.ok(board.top.some(row => row.playerId === board.me.playerId)); assert.equal(board.me.score, (await session()).state.score);
    await capture('online-ranking'); await tap('附近名次'); await capture('online-ranking-around');
    record(`${platform}: real replay settlement enters the real leaderboard and never changes local practice best`);
    await tap('返回首页'); await tap('无尽练习'); await tap('恢复在线对局'); await waitLabel('排位结束'); await tap('再玩一次'); await waitLabel('无尽排位');
    const nextOpening = await session(), first = legalMove(nextOpening.state);
    await page.evaluate(() => nativeHarness.setOffline(true)); await drag(first); await waitLabel('重新连接');
    const issuedFirst = placeIssuedGroup(nextOpening.state, first.slot, first.x, first.y);
    assert.equal((await saved()).native.online.pendingActions.length, 1); await page.waitForTimeout(350);
    const second = legalMove(issuedFirst); assert.ok(second);
    await drag(second); await waitLabel('本组已完成，等待连接下一组');
    assert.equal((await saved()).native.online.pendingActions.length, 2); assert.equal((await saved()).native.online.seq, 0);
    assert.equal((await session()).state.group, 1); await capture('online-issued-group-offline');
    const remainingSlot = [0, 1, 2].find(slot => slot !== first.slot && slot !== second.slot);
    await page.waitForTimeout(350); await drag({ slot: remainingSlot, x: 0, y: 0 });
    assert.equal((await saved()).native.online.pendingActions.length, 2);
    await page.evaluate(() => nativeHarness.setOffline(false)); await tap('重新连接');
    await page.waitForFunction(() => nativeHarness.saved()?.native?.online?.seq === 2 && !nativeHarness.saved()?.native?.online?.pendingActions?.length);
    assert.equal((await session()).state.group, 2);
    record(`${platform}: a disconnected issued group permits both placements, queues them in order and waits for the actual next server group`);
    await page.waitForTimeout(350);
    await page.evaluate(() => { nativeHarness.conflictNextAction(); nativeHarness.holdNextActionResponse(); });
    await drag(legalMove((await session()).state));
    await page.waitForFunction(() => nativeHarness.heldAction());
    await tap('暂停'); await tap('结束本局');
    assert.equal((await saved()).native.online.pendingFinish, true);
    await page.evaluate(() => nativeHarness.releaseHeldAction());
    await page.waitForFunction(() => nativeHarness.online()?.settlement?.status === 'verified');
    assert.equal((await session()).state.status, 'finished'); assert.equal((await saved()).native.online.pendingFinish, false);
    record(`${platform}: an actual server sequence conflict preserves the queued finish intent and settles canonical state`);
    await tap('再玩一次'); await waitLabel('无尽排位');
    await page.evaluate(() => nativeHarness.holdNextActionResponse());
    const holding = await session(); await drag(legalMove(holding.state));
    await page.waitForFunction(seq => nativeHarness.online()?.seq === seq + 1, holding.seq);
    await tap('暂停'); await tap('返回首页'); await tap('无尽练习'); await tap('开始无尽练习');
    const localPractice = (await saved()).currentGame; assert.equal(localPractice.ranked, false);
    await page.evaluate(() => nativeHarness.releaseHeldAction()); await page.waitForTimeout(200);
    assert.deepEqual((await saved()).currentGame, localPractice); assert.ok((await labels()).includes('无尽练习'));
    record(`${platform}: a delayed ranked response cannot replace a newly started independent local practice game`);
    await page.evaluate(async () => (await exports.ready).dispose());
    assert.equal(await page.evaluate(() => nativeHarness.listenerCount() + nativeHarness.timerCount()), 0);
  } finally { await context.close(); }
}
try {
  await mkdir(output, { recursive: true }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`; await startRuntime(origin);
  const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({ headless: true, executablePath });
  await runPlatform('wechat', origin); await runPlatform('bilibili', origin);
  assert.deepEqual(report.errors, []); report.status = 'passed';
} catch (error) { report.status = 'failed'; report.failure = error.stack; throw error; }
finally {
  await browser?.close(); runtime?.kill('SIGTERM');
  if (runtime && runtime.exitCode === null) await new Promise(resolve => runtime.once('exit', resolve));
  await sql(`delete from runtime.three_choose_two_actions where session_id in (select id from runtime.three_choose_two_sessions where player_id in (select id from runtime.competition_players where subject like 'native-fixture-${fixture}-%')); delete from runtime.three_choose_two_best where player_id in (select id from runtime.competition_players where subject like 'native-fixture-${fixture}-%'); delete from runtime.three_choose_two_results where player_id in (select id from runtime.competition_players where subject like 'native-fixture-${fixture}-%'); delete from runtime.three_choose_two_sessions where player_id in (select id from runtime.competition_players where subject like 'native-fixture-${fixture}-%'); delete from runtime.competition_sessions where player_id in (select id from runtime.competition_players where subject like 'native-fixture-${fixture}-%'); delete from runtime.competition_players where subject like 'native-fixture-${fixture}-%';`);
  await rm(prelude, { force: true });
  await writeFile(path.join(output, 'online-verification.json'), JSON.stringify(report, null, 2) + '\n');
  await new Promise(resolve => server.close(resolve));
}
