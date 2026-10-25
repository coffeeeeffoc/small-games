import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { getLevel } from '../src/levels.mjs';
import { STORAGE_KEY } from '../src/progress.mjs';
import { nativeHarnessHtml } from './browser-harness.mjs';

const gameRoot = fileURLToPath(new URL('../', import.meta.url));
const artifact = path.resolve(gameRoot, '../../../apps/shell-minigame/dist/wechat/three-choose-two');
const output = path.join(gameRoot, 'docs/design/refresh-2026-10-07');
const report = { environment: 'Built native Canvas bundle; Chromium touch emulation with a mock wx SDK',
  actualDevice: false, platformLoginVerified: false, screenshots: [], checks: [], errors: [] };
const harness = nativeHarnessHtml();
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
const activeTouches = new Map();
page.on('pageerror', error => report.errors.push(error.message));
const url = `http://127.0.0.1:${server.address().port}/`;
const labels = () => page.evaluate(() => nativeHarness.labels());
const tap = async label => {
  const point = await page.evaluate(label => nativeHarness.position(label), label);
  assert.ok(point, `Missing native action: ${label}`);
  await page.touchscreen.tap(point.x, point.y);
};
const saved = () => page.evaluate(() => nativeHarness.saved());
const record = name => { report.checks.push(name); console.log(`PASS ${name}`); };
const capture = async name => { const filename = `native-${name}.png`; await page.screenshot({ path: path.join(output, filename) }); report.screenshots.push({ filename, viewport: page.viewportSize() }); };
const touch = async (phase, x, y, id = 1) => {
  if (phase === 'start' || phase === 'move') activeTouches.set(id, { x, y, id, radiusX: 3, radiusY: 3, force: 1 });
  else if (phase === 'cancel') activeTouches.clear();
  else activeTouches.delete(id);
  await cdp.send('Input.dispatchTouchEvent', { type: ({ start: 'touchStart', move: 'touchMove', end: 'touchEnd', cancel: 'touchCancel' })[phase], touchPoints: [...activeTouches.values()] });
};
function boardMetrics(width = 390, height = 844) {
  const h = Math.max(700, Math.min(1000, height * 390 / width));
  const scale = Math.min(width / 390, height / h), left = (width - 390 * scale) / 2, top = (height - h * scale) / 2;
  const size = Math.min(352, 352 - Math.max(0, 844 - h) * .36), y = 219 - Math.max(0, 844 - h) * .34;
  return { scale, left, top, h, size, innerX: (390 - size) / 2 + 8, innerY: y + 8, pitch: (size - 16) / 8,
    slotY: y + size + 52, slotHeight: Math.min(119, h - 82 - (y + size + 52)) };
}
async function dragMove(move, phase = 'end', previewName) {
  const viewport = page.viewportSize(), b = boardMetrics(viewport.width, viewport.height);
  const sx = b.left + (74 + move.slot * 121) * b.scale;
  const sy = b.top + (b.slotY + b.slotHeight / 2) * b.scale;
  const tx = b.left + (b.innerX + (move.x + .5) * b.pitch) * b.scale;
  const ty = b.top + (b.innerY + (move.y + .5) * b.pitch + 54) * b.scale;
  await touch('start', sx, sy, 20);
  await touch('move', (sx + tx) / 2, (sy + ty) / 2, 20);
  await touch('move', tx, ty, 20);
  if (previewName) await capture(previewName);
  await touch(phase, tx, ty, 20);
  await page.waitForTimeout(350);
}
try {
  await page.goto(url); await page.evaluate(() => exports.ready);
  assert.ok((await labels()).includes('继续闯关')); await capture('home');
  const homeStart = await page.evaluate(() => nativeHarness.position('继续闯关'));
  const homeLevels = await page.evaluate(() => nativeHarness.position('选关'));
  assert.equal(homeStart.y, homeLevels.y); assert.ok(homeStart.x < homeLevels.x);
  record('home places the main action and level selection together with visible settings and endless entry');
  await tap('玩法提示'); await page.evaluate(() => nativeHarness.hide()); await page.evaluate(() => nativeHarness.show());
  assert.ok((await labels()).includes('玩法提示')); await tap('返回首页');
  record('home help survives backgrounding without an active game and returns to its source page');
  await tap('选关'); await capture('levels');
  await tap('02'); assert.ok((await labels()).includes('选择关卡')); record('normal player locked levels remain locked');
  await tap('01'); await capture('game');
  const opening = await saved();
  await dragMove(getLevel(1).solution[0], 'cancel', 'game-preview');
  assert.deepEqual((await saved()).currentGame, opening.currentGame); record('drag preview and pointer cancel do not place a piece');
  await touch('start', 74, 683, 20); await touch('start', 195, 683, 21);
  await touch('move', 195, 302, 21); await touch('end', 195, 302, 21); await touch('cancel', 74, 683, 20);
  assert.deepEqual((await saved()).currentGame, opening.currentGame); record('second pointer cannot consume or replace the held piece');
  await dragMove(getLevel(1).solution[0]);
  assert.ok((await page.evaluate(() => nativeHarness.vibrations())).length > 0);
  assert.ok((await labels()).includes('好选择，漂亮！')); await capture('result');
  assert.equal((await saved()).records[1].stars, 3); assert.equal((await saved()).unlocked, 2);
  record('real touch solution wins first level and saves three stars plus next unlock');
  await tap('下一关');
  const level2Opening = (await saved()).currentGame;
  await dragMove(getLevel(2).solution[0]);
  await tap('撤销 · 3');
  const undone = (await saved()).currentGame;
  assert.deepEqual(undone.board, level2Opening.board); assert.deepEqual(undone.candidates, level2Opening.candidates);
  assert.equal(undone.undoRemaining, 2); assert.equal(undone.canUndo, false); record('undo restores board, candidates and bounded single-step history');
  await page.evaluate(() => nativeHarness.hide()); await capture('pause');
  await page.waitForTimeout(500); await page.evaluate(() => nativeHarness.show());
  assert.ok((await labels()).includes('继续游戏')); await tap('继续游戏');
  assert.deepEqual((await saved()).currentGame.board, undone.board); record('hide and show cancel input and retain the paused puzzle');
  await tap('暂停'); await tap('返回首页'); await tap('继续闯关');
  assert.deepEqual((await saved()).currentGame.board, undone.board); record('home and resume retain the active puzzle');
  await page.reload(); await page.evaluate(() => exports.ready); await tap('继续闯关');
  assert.deepEqual((await saved()).currentGame.board, undone.board); assert.equal((await saved()).currentGame.undoRemaining, 2);
  record('host storage restores the exact active puzzle across a new mount');
  const beforeHome = await saved(); await tap('首页');
  assert.ok((await labels()).includes('选关')); assert.deepEqual((await saved()).currentGame, beforeHome.currentGame);
  await tap('玩法提示'); await tap('返回首页');
  assert.ok((await labels()).includes('选关')); assert.deepEqual((await saved()).currentGame, beforeHome.currentGame);
  await tap('继续闯关'); assert.deepEqual((await saved()).currentGame, beforeHome.currentGame);
  record('the game header directly returns home and retains the exact resumable puzzle');
  const queuedOnline = { id: 'native-navigation-recovery-fixture', seq: 2,
    pendingActions: [{ seq: 3, group: 2, slot: 0, x: 0, y: 0 }], pendingFinish: true };
  await page.evaluate(({ key, value }) => {
    const entries = JSON.parse(localStorage.getItem('native-check-storage'));
    const entry = entries.find(([name]) => name.endsWith(key));
    const record = JSON.parse(entry[1]); record.value.native.online = value;
    record.value.currentGame.config = { ...record.value.currentGame.config,
      title: '旧局快照', hint: '旧局提示，优先留空。', goal: { lines: 7 }, maxGroups: 9, discardBudget: 13 };
    entry[1] = JSON.stringify(record); localStorage.setItem('native-check-storage', JSON.stringify(entries));
  }, { key: STORAGE_KEY, value: queuedOnline });
  await page.reload(); await page.evaluate(() => exports.ready);
  assert.ok((await labels()).includes('第 02 关 · 旧局快照')); await tap('继续闯关');
  const snapshotLabels = await labels(); assert.ok(['/ 7', '1 / 9', '弃格 0 / 13'].every(value => snapshotLabels.includes(value)));
  await tap('提示'); assert.ok((await labels()).includes('旧局提示，优先留空。')); await tap('回去试试');
  await tap('暂停'); await tap('退出关卡');
  const afterExit = await saved();
  assert.equal(afterExit.currentGame, null); assert.equal(afterExit.native.runId, ''); assert.equal(afterExit.native.pendingReward, null);
  assert.deepEqual(afterExit.records, beforeHome.records); assert.equal(afterExit.unlocked, beforeHome.unlocked);
  assert.deepEqual(afterExit.native.online, queuedOnline);
  await page.reload(); await page.evaluate(() => exports.ready);
  assert.equal((await saved()).currentGame, null); await tap('继续闯关');
  assert.equal((await saved()).currentGame.levelId, 2); assert.equal((await saved()).currentGame.stats.placements, 0);
  assert.equal((await saved()).currentGame.undoRemaining, 3);
  assert.equal((await saved()).currentGame.config.title, getLevel(2).title);
  record('old snapshot titles, goals, limits and hints stay consistent; explicit exit preserves progress and starts the current catalog afresh');
  record('local level exit preserves an independent online recovery sequence, queued moves and finish intent');
  await tap('提示'); await capture('help'); await tap('回去试试'); await tap('暂停'); await tap('返回首页');
  await tap('设置');
  const settingsLabels = await labels();
  assert.ok(['音效', '音乐', '振动', '高对比色', '减少闪光'].every(label => settingsLabels.includes(label)));
  await capture('settings'); await tap('玩法说明'); await tap('返回设置');
  assert.ok((await labels()).includes('音乐')); await tap('返回首页');
  await tap('排行榜'); assert.ok((await labels()).includes('原生排位未配置')); await capture('ranking-unconfigured'); await tap('返回首页');
  await tap('无尽练习'); await capture('endless'); await tap('开始无尽练习');
  assert.equal((await saved()).currentGame.score, 0); assert.equal((await saved()).currentGame.ranked, false);
  const beforePracticeExit = await saved(); await tap('暂停'); await tap('退出练习');
  assert.equal((await saved()).currentGame, null); assert.equal((await saved()).practiceBest, beforePracticeExit.practiceBest);
  assert.deepEqual((await saved()).records, beforePracticeExit.records);
  await tap('无尽练习'); await tap('开始无尽练习');
  record('explicit practice exit discards only the local run while normal practice settlement remains available');
  await tap('暂停'); await tap('结束练习'); await capture('practice-result');
  assert.ok((await labels()).includes('离线练习成绩不参与排位')); record('offline endless starts at zero and cannot enter the public leaderboard');
  await tap('分享成绩');
  const shares = await page.evaluate(() => nativeHarness.shares());
  assert.equal(shares.length, 1); assert.ok(shares[0].title.includes('离线练习'));
  assert.ok(!JSON.stringify(shares[0]).match(/token|session|seed/)); record('native sharing includes honest practice metrics and no private session data');
  await tap('返回首页'); await page.setViewportSize({ width: 320, height: 640 }); await page.waitForTimeout(250);
  await capture('home-small'); await tap('继续闯关'); await capture('game-small'); await tap('暂停'); await capture('pause-small');
  record('320 by 640 portrait viewport keeps full controls and uniform touch scaling');
  const sounds = await page.evaluate(() => nativeHarness.sounds());
  assert.equal(sounds.length, 7); assert.ok(sounds.some(sound => sound.played > 0));
  await page.evaluate(async () => (await exports.ready).dispose());
  assert.equal(await page.evaluate(() => nativeHarness.timerCount() + nativeHarness.listenerCount()), 0);
  assert.ok((await page.evaluate(() => nativeHarness.sounds())).every(sound => sound.destroyed));
  record('dispose releases every listener, timer and local sound');
  assert.deepEqual(report.errors, []); report.status = 'passed';
} catch (error) { report.status = 'failed'; report.failure = error.stack; throw error; }
finally {
  await writeFile(path.join(output, 'native-verification.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
