import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import { canPlace, continueLevel, createLevel, place } from '../src/engine.mjs';
import { createProgress, saveCurrentGame, STORAGE_KEY } from '../src/progress.mjs';
import { nativeHarnessHtml } from './browser-harness.mjs';

const { values } = parseArgs({ options: { platform: { type: 'string', default: 'wechat' }, artifact: { type: 'string' } } });
const platform = values.platform;
assert.ok(['wechat', 'bilibili'].includes(platform));
const gameRoot = fileURLToPath(new URL('../', import.meta.url));
const artifact = values.artifact ? path.resolve(values.artifact)
  : path.resolve(gameRoot, '../../../apps/shell-minigame/dist', platform, 'three-choose-two');
const release = JSON.parse(await readFile(path.join(artifact, 'release.json')));
assert.equal(release.platform, platform);
assert.equal(release.mode, 'preview');
assert.equal(release.advertisingConfigured, true, 'Build the preview with --ad-unit-id native-recovery-fixture');
const output = path.join(gameRoot, 'docs/design/refresh-2026-10-07');
const report = { environment: 'Production native CJS preview; Chromium touch with mock platform ad outcomes',
  platform, actualDevice: false, realAdvertisingVerified: false, checks: [], screenshots: [], errors: [] };

// This fixture is reached entirely by legal rules. The final failure move is
// performed through touch against the running production bundle below.
let failed = createLevel(1);
const failureMoves = [];
const failureStates = [failed];
for (let step = 0; step < 4; step++) {
  let move;
  for (let slot = 0; slot < 3 && !move; slot++) for (let y = 0; y < 8 && !move; y++) for (let x = 0; x < 8 && !move; x++) {
    if (!canPlace(failed, slot, x, y)) continue;
    const next = place(failed, slot, x, y);
    if (!next.lastEvent.lines && (step < 3 ? next.status === 'playing' : next.reason === 'groups-exhausted'))
      move = { slot, x, y, next };
  }
  assert.ok(move, 'The tutorial must allow a legal missed-target route');
  failed = move.next;
  failureMoves.push({ slot: move.slot, x: move.x, y: move.y });
  failureStates.push(failed);
}
const runId = 'native-recovery-legal-fixture';
const progressAt = state => ({ ...saveCurrentGame(createProgress(), state), native: { runId, pendingReward: null, online: null } });
const fixture = state => [[`${platform}:three-choose-two:${STORAGE_KEY}`, JSON.stringify({ version: '1', value: progressAt(state) })]];
const adHarness = `<script>
let adOutcome='dismissed',adShows=0,adDisposals=0,pendingCompletion=null;
Object.assign(wx,{launchSuccess(){},checkScene(options){options.success({isExist:true})},navigateToScene(options){options.success()},addShortcut(options){options.success()},showToast(){}});
wx.createRewardedVideoAd=()=>{const closes=new Set(),errors=new Set();return {
 load:async()=>{},show:async()=>{adShows++;queueMicrotask(()=>{if(adOutcome==='held-completed'){pendingCompletion=()=>{for(const f of closes)f({isEnded:true})};return}if(adOutcome==='failed')for(const f of errors)f({errMsg:'fixture ad failure'});else for(const f of closes)f({isEnded:adOutcome==='completed'})})},
 onClose:f=>closes.add(f),offClose:f=>closes.delete(f),onError:f=>errors.add(f),offError:f=>errors.delete(f),destroy(){adDisposals++}}};
window.recoveryAd={outcome(value){adOutcome=value},complete(){const complete=pendingCompletion;pendingCompletion=null;if(!complete)throw Error('No held SDK ad outcome');complete()},stats:()=>({shows:adShows,disposals:adDisposals})};
</script>`;
const harness = nativeHarnessHtml({ platform }).replace('<script src="/game.js">', `${adHarness}<script src="/game.js">`);
const server = http.createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/') { response.setHeader('content-type', 'text/html; charset=utf-8'); response.end(harness); return; }
    const filename = path.resolve(artifact, '.' + pathname);
    assert.ok(filename.startsWith(artifact + path.sep));
    response.setHeader('content-type', filename.endsWith('.js') ? 'application/javascript' : 'audio/wav');
    response.end(await readFile(filename));
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
await mkdir(output, { recursive: true });
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
page.on('pageerror', error => report.errors.push(error.message));
const url = `http://127.0.0.1:${server.address().port}/`;
const labels = () => page.evaluate(() => nativeHarness.labels());
const saved = () => page.evaluate(() => nativeHarness.saved());
const tap = async label => {
  const point = await page.evaluate(label => nativeHarness.position(label), label);
  assert.ok(point, `Missing native action: ${label}`);
  await page.touchscreen.tap(point.x, point.y);
};
const record = name => { report.checks.push(name); console.log(`PASS ${platform}: ${name}`); };
const capture = async name => {
  const filename = `native-recovery-${platform}-${name}.png`;
  await page.screenshot({ path: path.join(output, filename) });
  report.screenshots.push({ filename, viewport: page.viewportSize() });
};
async function mounted() {
  if (platform === 'bilibili') {
    await page.waitForFunction(() => nativeHarness.labels().includes('开始游戏'));
    await tap('开始游戏');
  }
  await page.evaluate(() => exports.ready);
}
async function loadFixture(records) {
  await page.goto(url); await mounted();
  await page.evaluate(async () => (await exports.ready).dispose());
  await page.evaluate(records => localStorage.setItem('native-check-storage', JSON.stringify(records)), records);
  await page.reload(); await mounted();
}
async function drag(move) {
  const start = { x: 74 + move.slot * 121, y: 682.5, id: 20 };
  const end = { x: 27 + (move.x + .5) * 42, y: 227 + (move.y + .5) * 42 + 54, id: 20 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [end] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(350);
}
try {
  await loadFixture(fixture(failureStates[3]));
  await tap('继续闯关');
  assert.deepEqual((await saved()).currentGame, failureStates[3]);
  await drag(failureMoves[3]);
  await page.waitForFunction(() => nativeHarness.saved().currentGame?.status === 'lost');
  assert.equal((await saved()).currentGame.reason, 'groups-exhausted');
  assert.ok((await labels()).includes('撤销上一步 · 3')); await capture('lost');
  record('a legal final touch creates a missed-target loss with undo and configured continuation');
  await tap('返回首页'); await tap('继续闯关');
  assert.ok((await labels()).includes('留点空间，再来。'));
  await page.reload(); await mounted(); await tap('继续闯关');
  assert.ok((await labels()).includes('留点空间，再来。'));
  assert.deepEqual((await saved()).currentGame, failed);
  record('home and a fresh native mount restore loss to its result screen');
  await tap('撤销上一步 · 3');
  const undone = (await saved()).currentGame;
  assert.equal(undone.status, 'playing'); assert.equal(undone.undoRemaining, 2);
  assert.deepEqual(undone.board, failureStates[3].board);
  assert.deepEqual(undone.candidates, failureStates[3].candidates);
  record('touch undo from loss restores board and candidates with one use consumed');
  await drag(failureMoves[3]);
  for (const outcome of ['dismissed', 'failed']) {
    const before = (await saved()).currentGame;
    await page.evaluate(outcome => recoveryAd.outcome(outcome), outcome);
    await tap('观看广告 · 增加2组');
    await page.waitForFunction(() => !nativeHarness.labels().includes('广告加载中'));
    assert.deepEqual((await saved()).currentGame, before);
    assert.equal((await saved()).native.pendingReward, null);
    record(`${outcome} platform ad outcome preserves the loss and unused continuation`);
  }
  await page.evaluate(() => recoveryAd.outcome('held-completed'));
  await tap('观看广告 · 增加2组');
  await page.waitForFunction(() => nativeHarness.labels().includes('广告加载中'));
  await page.evaluate(() => nativeHarness.hide());
  await page.evaluate(() => recoveryAd.complete());
  await page.waitForFunction(() => nativeHarness.saved().currentGame?.continued === true);
  assert.ok((await labels()).includes('继续游戏'));
  await page.evaluate(() => nativeHarness.show());
  assert.ok((await labels()).includes('继续游戏'));
  await tap('继续游戏');
  record('a confirmed ad result received in the background preserves pause until explicit resume');
  const continued = (await saved()).currentGame;
  assert.equal(continued.status, 'playing'); assert.equal(continued.group, 3);
  assert.equal(continued.canUndo, false); assert.equal(continued.continueRewardId, `three-choose-two:${runId}:continue`);
  assert.deepEqual(continueLevel(continued, continued.continueRewardId), continued);
  assert.equal((await saved()).native.pendingReward, null);
  assert.deepEqual(await page.evaluate(() => recoveryAd.stats()), { shows: 3, disposals: 3 });
  await capture('continued'); record('only explicit SDK completion applies exactly two supplemental groups and clears prior undo');
  await page.reload(); await mounted(); await tap('继续闯关');
  assert.deepEqual((await saved()).currentGame, continued);
  assert.ok(!(await labels()).includes('观看广告 · 增加2组'));
  record('a completed continuation survives remount without a second grant');

  const receipt = progressAt(failed);
  receipt.native.pendingReward = { id: `three-choose-two:${runId}:continue`, runId, completed: true };
  await loadFixture([[`${platform}:three-choose-two:${STORAGE_KEY}`, JSON.stringify({ version: '1', value: receipt })]]);
  await tap('继续闯关');
  await page.waitForFunction(() => nativeHarness.saved().currentGame?.continued === true);
  const recovered = (await saved()).currentGame;
  assert.equal(recovered.group, 3); assert.equal((await saved()).native.pendingReward, null);
  assert.deepEqual(await page.evaluate(() => recoveryAd.stats()), { shows: 0, disposals: 0 });
  await page.reload(); await mounted(); await tap('继续闯关');
  assert.deepEqual((await saved()).currentGame, recovered);
  record('an already confirmed persisted SDK receipt recovers once across interruption');
  await page.evaluate(async () => (await exports.ready).dispose());
  assert.equal(await page.evaluate(() => nativeHarness.timerCount() + nativeHarness.listenerCount()), 0);
  assert.deepEqual(report.errors, []); report.status = 'passed';
} catch (error) { report.status = 'failed'; report.failure = error.stack; throw error; }
finally {
  await writeFile(path.join(output, `native-recovery-${platform}-verification.json`), JSON.stringify(report, null, 2) + '\n');
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
