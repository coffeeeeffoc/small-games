import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { acceptanceBuild, snapshot, assertLayout, navigateMap, aimAt } from './flight-browser.mjs';
import { press, settleVisuals } from './visual-helpers.mjs';

const base = process.env.NIGHT_URL, build = await acceptanceBuild(base);
const out = new URL(process.env.NIGHT_REPORT_URL || '../reports/2026-10-29-rankings/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
  args: process.platform === 'win32' ? ['--use-angle=d3d11'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const evidence = { build, environment: 'Creator Web-mobile / Chromium; synthetic leaderboard bridge, real UI input; no production scores', checks: [], errors: [] };
const fixtureSource = `
const identity = { playerId: '11111111-1111-4111-8111-111111111111', nickname: '当前飞行员' };
const metadata = { identity, capabilities: { multiplayer: false, leaderboards: true } };
globalThis.__rankingFixture = { mode: 'full', requests: [] };
globalThis.SmallGamesServices = {
  ready: Promise.resolve(metadata), refresh: async () => metadata,
  services: {
    updateProfile: async ({ nickname }) => { identity.nickname = nickname; return { ...identity }; },
    leaderboard: async ({ boardId }) => {
      const fixture = globalThis.__rankingFixture; fixture.requests.push(boardId);
      if (fixture.mode === 'error') throw Error('fixture network failure');
      const top = fixture.mode === 'empty' ? [] : Array.from({ length: 100 }, (_, i) => ({
        playerId: String(i + 1).padStart(8, '0'), nickname: '飞行员' + (i + 1), rank: i + 1,
        score: boardId === 'clears' ? 120 - i : 1000 - i, secondary: 45000 + i * 100, wins: 100 - i, games: 100
      }));
      return { top, me: fixture.mode === 'empty' ? null : { ...identity, rank: 105, score: 12, secondary: 65000, wins: 1, games: 10 } };
    }
  },
  createRecorder: (_version, { onStatus }) => ({ start: async () => onStatus('practice'), record() {}, finish: async () => {}, invalidate() {} })
};`;
const labels = page => page.evaluate(async () => {
  const { director, Label } = await System.import('cc');
  return director.getScene().getComponentsInChildren(Label).filter(l => l.node.activeInHierarchy).map(l => l.string);
});
const listState = page => page.evaluate(async () => {
  const { director, Label, UITransform } = await System.import('cc');
  const walk = node => [node, ...node.children.flatMap(walk)];
  const nodes = walk(director.getScene()), viewport = nodes.find(n => n.name === 'RankingViewport' && n.activeInHierarchy);
  if (!viewport) return null;
  const rows = viewport.getChildByName('RankingRows'), bounds = viewport.getComponent(UITransform).getBoundingBoxToWorld();
  const rankLabels = rows.getComponentsInChildren(Label).filter(l => /^第\d+名$/.test(l.string));
  const last = rankLabels.find(l => l.string === '第100名')?.node.getComponent(UITransform).getBoundingBoxToWorld();
  return { scroll: rows.position.y, count: rankLabels.length, medals: rows.children.filter(n => n.name.startsWith('RankMedal:')).map(n => n.name),
    area: { x: bounds.x, y: __night.snapshot().ui.height - bounds.y - bounds.height, w: bounds.width, h: bounds.height },
    lastVisible: !!last && last.y >= bounds.y - 1 && last.y + last.height <= bounds.y + bounds.height + 1 };
});
let activePage;
try {
  for (const [width, height] of [[568, 320], [844, 390], [1280, 720]]) {
    const touch = width < 1000, record = width === 1280;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch,
      ...(record ? { recordVideo: { dir: fileURLToPath(out), size: { width, height } } } : {}) });
    await context.addInitScript(() => localStorage.setItem('night-overwatch-coach-v2', 'done'));
    const page = await context.newPage(), started = Date.now(); activePage = page;
    page.setDefaultTimeout(60000);
    page.on('pageerror', error => evidence.errors.push(error.message));
    await page.route('**/api/competition/**', route => route.abort());
    await page.route('**/small-games/v1/**', route => route.abort());
    await page.route('**/game-services/game-bootstrap.js', route => route.fulfill({ contentType: 'text/javascript', body: fixtureSource }));
    await page.goto(base + '?dev=0&mission=corridor-01');
    await page.waitForFunction(() => globalThis.__night?.snapshot().ui.interfaceArtworkReady && __night.snapshot().online.identity.nickname === '当前飞行员' && !document.getElementById('night-startup'));
    await page.waitForFunction(() => __night.snapshot().visualMaterialStatus === 'ready');
    const click = id => press(page, id, touch);
    const capture = async name => {
      await settleVisuals(page); assertLayout(await snapshot(page), width, height);
      await page.screenshot({ path: fileURLToPath(new URL(`${name}-${width}.png`, out)) });
    };
    await capture('home');
    await click('online:ranking');
    await page.waitForFunction(() => __night.snapshot().online.ranking?.top.length === 100);
    const boardButtons = async () => (await snapshot(page)).buttons.filter(b => b.id.startsWith('online:board:')).map(b => b.id);
    assert.deepEqual(await boardButtons(), ['online:board:clears', 'online:board:level']);
    const initial = await listState(page);
    assert.equal(initial.count, 100); assert.equal(initial.scroll, 0);
    assert.deepEqual(initial.medals, ['RankMedal:1', 'RankMedal:2', 'RankMedal:3']);
    assert((await labels(page)).some(text => text.startsWith('我的排名 第105名')));
    await capture('solo-clears');
    const footer = (await snapshot(page)).buttons.find(b => b.id === 'online:back');
    const callsBeforeScroll = await page.evaluate(() => __rankingFixture.requests.length);
    if (touch) {
      const cdp = await context.newCDPSession(page), area = initial.area;
      const start = { id: 1, x: area.x + area.w / 2, y: area.y + area.h - 8 }, endY = 20;
      for (let gesture = 0; gesture < 60 && !(await listState(page)).lastVisible; gesture++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
        for (let step = 1; step <= 4; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...start, y: start.y + (endY - start.y) * step / 4 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await settleVisuals(page);
      }
      await cdp.detach();
    } else {
      await page.mouse.move(initial.area.x + initial.area.w / 2, initial.area.y + initial.area.h / 2);
      await page.mouse.wheel(0, 30000); await settleVisuals(page);
    }
    const scrolled = await listState(page); assert(scrolled.scroll > 0 && scrolled.lastVisible, JSON.stringify(scrolled));
    const footerAfter = (await snapshot(page)).buttons.find(b => b.id === 'online:back');
    for (const key of ['x', 'y', 'w', 'h']) assert.equal(footerAfter[key], footer[key], 'footer remains fixed');
    assert.equal(await page.evaluate(() => __rankingFixture.requests.length), callsBeforeScroll, 'scrolling uses the already-loaded 100 rows');
    await capture('rank-100');
    for (const board of ['level', 'points', 'win-rate']) {
      if (board === 'points') await click('online:category:duel'); else await click('online:board:' + board);
      await page.waitForFunction(board => __night.snapshot().online.board === board && __night.snapshot().online.ranking?.top.length === 100, board);
      assert.equal((await listState(page)).scroll, 0);
      assert.deepEqual(await boardButtons(), board === 'level' ? ['online:board:clears', 'online:board:level'] : ['online:board:points', 'online:board:win-rate']);
      await capture('board-' + board);
    }
    await click('online:category:solo');
    await page.waitForFunction(() => __night.snapshot().online.board === 'clears' && __night.snapshot().online.ranking?.top.length === 100);
    await page.evaluate(() => { __rankingFixture.mode = 'empty'; }); await click('online:refresh');
    await page.waitForFunction(() => __night.snapshot().online.ranking?.top.length === 0);
    assert.equal((await listState(page)).count, 0); assert((await labels(page)).includes('暂无成绩，等你创造纪录'));
    await capture('empty');
    await page.evaluate(() => { __rankingFixture.mode = 'error'; }); await click('online:refresh');
    await page.waitForFunction(() => __night.snapshot().online.message.includes('读取失败'));
    assert.equal((await listState(page)).count, 0); await capture('load-error');
    await page.evaluate(() => { __rankingFixture.mode = 'full'; }); await click('online:refresh');
    await page.waitForFunction(() => __night.snapshot().online.ranking?.top.length === 100);
    assert.equal((await listState(page)).scroll, 0); await click('online:back');

    const nickname = () => page.evaluate(async () => {
      const { director, EditBox, UITransform } = await System.import('cc');
      const edit = director.getScene().getComponentsInChildren(EditBox).find(e => e.node.name === 'draftName' && e.node.activeInHierarchy);
      const box = edit.node.getComponent(UITransform).getBoundingBoxToWorld();
      return { value: edit.string, x: box.x + box.width / 2, y: __night.snapshot().ui.height - box.y - box.height / 2 };
    });
    await click('online:profile'); const field = await nickname(); assert.equal(field.value, '当前飞行员');
    if (touch) await page.touchscreen.tap(field.x, field.y); else await page.mouse.click(field.x, field.y);
    await page.locator('input:visible').fill('没有确认的昵称'); await page.keyboard.press('Enter');
    assert.equal((await nickname()).value, '没有确认的昵称');
    await click('online:dismiss'); await click('online:profile');
    assert.equal((await nickname()).value, '当前飞行员'); await capture('nickname-reopened');
    const savedField = await nickname();
    if (touch) await page.touchscreen.tap(savedField.x, savedField.y); else await page.mouse.click(savedField.x, savedField.y);
    await page.locator('input:visible').fill('保存后的昵称'); await page.keyboard.press('Enter');
    await click('online:saveName'); await page.waitForFunction(() => __night.snapshot().online.panel === '');
    await click('online:profile'); assert.equal((await nickname()).value, '保存后的昵称'); await click('online:dismiss');
    await click('missions'); await click('start');
    await page.waitForFunction(() => __night.snapshot().phase === 'playing');
    assert((await labels(page)).some(text => text.startsWith('第 1 关\n'))); await capture('level-1');
    if (record) {
      await page.waitForTimeout(5500); // Let the intentional local-fixture notice clear before publishing capture.
      await click('weapon0'); const firedBefore = (await snapshot(page)).fired;
      evidence.gameplay = { start: (Date.now() - started) / 1000, duration: 15, environment: '1280x720 Chromium; real mouse aiming/firing, synthetic recorder disabled from public ranking' };
      const until = Date.now() + 18000; let shots = 0;
      while (Date.now() < until) {
        const state = await snapshot(page), target = state.units.find(unit => !unit.friendly && unit.hp > 0);
        assert(target && state.phase === 'playing', 'continuous core gameplay capture');
        await navigateMap(page, target); await aimAt(page, target);
        await page.mouse.down(); await page.waitForTimeout(120); await page.mouse.up();
        if (shots < 3) await capture('gameplay-' + ++shots);
        await page.waitForTimeout(900);
      }
      assert((await snapshot(page)).fired > firedBefore); evidence.video = await page.video().path();
    }
    evidence.checks.push({ width, height, full100: true, groupedBoards: true, medals: true, scrollTo100: true,
      fixedFooter: true, emptyAndFailure: true, nicknameReopened: true, nicknameSuccessCloses: true, campaignLevel: 1,
      requests: await page.evaluate(() => __rankingFixture.requests) });
    await context.close();
  }
  assert.deepEqual(evidence.errors, []);
} catch (error) {
  evidence.failure = error.message;
  if (activePage && !activePage.isClosed()) {
    evidence.last = await snapshot(activePage); await activePage.screenshot({ path: fileURLToPath(new URL('failure.png', out)) });
  }
  throw error;
} finally {
  await browser.close(); await writeFile(new URL('evidence.json', out), JSON.stringify(evidence, null, 2) + '\n');
}
console.log(JSON.stringify(evidence));
