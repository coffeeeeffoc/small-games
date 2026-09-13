import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.env.PLAYTEST_URL || 'http://127.0.0.1:4176';
const executablePath = process.env.PLAYTEST_BROWSER || [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find(existsSync);
const output = path.resolve('test-results');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const findings = { url, browser: executablePath || 'Playwright Chromium', routes: [], errors: [] };
const answers = { culprit: 'lin', time: '20:26', method: 'paperweight', motive: 'ledger', lie: 'camera-lin', access: 'lock' };
const pairs = [['message', 'schedule'], ['body', 'watch'], ['lock', 'camera-lin'], ['ledger', 'threat'], ['livestream', 'watch']];
const labels = { body: '遗体与腕表', weapon: '铜镇纸', lock: '指纹门锁', window: '内扣窗', ledger: '修复原账', cup: '冷掉的茶', clock: '停摆的钟', livestream: '直播原始缓存', maintenance: '设备维护日志' };
const questionLabels = { 'lin-where': '20:20 到 20:40，你在哪里？', 'zhou-where': '20:10 以后，你在哪里？', 'xu-money': '那晚送茶、主持和账款的情况呢？' };
const names = { lin: '林岑', zhou: '周屿', xu: '许曼', shen: '沈砚' };

async function state(page) { return page.evaluate(() => JSON.parse(localStorage.getItem('rain-case-v1'))); }
async function saved(page, field, item) {
  await page.waitForFunction(({ field, item }) => JSON.parse(localStorage.getItem('rain-case-v1'))?.[field]?.includes(item), { field, item });
}
async function click(page, name, exact = true) { await page.getByRole('button', { name, exact }).click(); }
async function close(page) { await click(page, '关闭弹窗'); await page.locator('dialog').waitFor({ state: 'detached' }); }
async function nav(page, name) {
  await page.getByRole('navigation', { name: '主要导航' }).getByRole('button', { name: new RegExp(`^${name}`) }).click();
}
async function shot(page, file) { await page.screenshot({ path: path.join(output, file), fullPage: true, animations: 'disabled' }); }
async function noOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ inner: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert(dimensions.document <= dimensions.inner + 1 && dimensions.body <= dimensions.inner + 1, `${label}: horizontal overflow ${JSON.stringify(dimensions)}`);
}
async function collect(page, id, useList = false) {
  if (useList) {
    if (await page.getByRole('button', { name: '调查清单', exact: true }).count()) await click(page, '调查清单');
    await page.locator('.scene-list').getByRole('button', { name: new RegExp(labels[id]) }).click();
  } else await click(page, `调查${labels[id]}`);
  const button = page.getByRole('button', { name: '收集证据', exact: true });
  if (await button.count()) await button.click();
  await saved(page, 'evidence', id);
  if (id === 'body') {
    await click(page, '进一步检查 · 遗体腕表');
    await click(page, '收集证据');
    await saved(page, 'evidence', 'watch');
  }
  await close(page);
}
async function submit(page, grade, values = answers) {
  await nav(page, '推理');
  for (const [name, value] of Object.entries(values)) await page.locator(`select[name="${name}"]`).selectOption(value);
  await click(page, '提交完整推理');
  await page.locator(`.report.grade-${grade}`).waitFor();
  assert.equal((await state(page)).report.grade, grade);
  assert((await page.locator('.report-grade').innerText()).startsWith(grade));
}
async function ask(page, suspect, question) {
  await nav(page, '嫌疑人');
  await page.getByRole('group', { name: '选择嫌疑人' }).getByRole('button', { name: new RegExp(names[suspect]) }).click();
  await page.locator('.topic-list').getByRole('button', { name: new RegExp(questionLabels[question].replace(/[？?]/g, '[？?]')) }).click();
  await saved(page, 'asked', question);
}
async function challenge(page, question, id, success = true) {
  await click(page, '质疑这句话', false);
  await page.locator(`[data-challenge-evidence="${id}"]`).click();
  if (success) {
    await saved(page, 'challenged', question);
    await page.locator('dialog').waitFor({ state: 'detached' });
  } else {
    await saved(page, 'mistakes', `${question}:${id}`);
    await close(page);
  }
}
async function touchDrag(page, handle, target) {
  await handle.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  assert(from && to);
  const x = from.x + from.width / 2;
  const start = from.y + from.height / 2;
  const end = to.y + to.height / 2;
  const session = await page.context().newCDPSession(page);
  const touch = y => [{ x, y, id: 0, radiusX: 3, radiusY: 3, force: 1 }];
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touch(start) });
  for (let step = 1; step <= 10; step++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touch(start + (end - start) * step / 10) });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
}
async function pinch(page) {
  const area = page.locator('.pz-photo-viewport');
  await area.scrollIntoViewIfNeeded();
  const rect = await area.boundingBox();
  assert(rect);
  const session = await page.context().newCDPSession(page);
  const points = distance => [
    { x: rect.x + rect.width / 2 - distance, y: rect.y + rect.height / 2, id: 0, radiusX: 3, radiusY: 3, force: 1 },
    { x: rect.x + rect.width / 2 + distance, y: rect.y + rect.height / 2, id: 1, radiusX: 3, radiusY: 3, force: 1 },
  ];
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(30) });
  for (let distance = 35; distance <= 72; distance += 5) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(distance) });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
  assert(Number.parseFloat(await page.locator('.pz-zoom-readout').innerText()) >= 1.7, 'Real two-finger pinch must zoom the photo');
}
async function photo(page, touch) {
  await click(page, '调查馆庆合照');
  assert(await page.getByRole('button', { name: '检查铭牌', exact: true }).isDisabled());
  if (touch) await pinch(page);
  else { await click(page, '放大照片'); await click(page, '放大照片'); }
  await click(page, '检查铭牌');
  await saved(page, 'evidence', 'photo');
  await noOverflow(page, 'photo dialog');
  await close(page);
}
async function phone(page, { touch = false, errors = false }) {
  await click(page, '调查死者手机');
  const input = page.locator('input[aria-label="四位手机密码"]');
  if (errors) {
    await input.fill('0000'); await click(page, '解锁手机');
    assert((await page.locator('.pz-error').innerText()).includes('密码不正确'));
    assert(!(await state(page)).evidence.includes('phone'));
  }
  await input.fill('0917'); await click(page, '解锁手机');
  await saved(page, 'puzzles', 'unlock');
  await page.locator('.pz-app-grid').getByRole('button', { name: '聊天', exact: true }).click();
  await page.locator('.pz-chat > .pz-record-collect').nth(0).click(); await saved(page, 'evidence', 'message');
  await page.locator('.pz-chat > .pz-record-collect').nth(1).click(); await saved(page, 'evidence', 'threat');
  await page.getByRole('navigation', { name: '手机应用' }).getByRole('button', { name: '已删除', exact: true }).click();
  if (errors) {
    await click(page, '校验并恢复');
    assert((await page.locator('.pz-restore .pz-feedback').innerText()).includes('结构不完整'));
    assert(!(await state(page)).puzzles.includes('restore'));
  }
  if (touch) {
    await touchDrag(page, page.getByRole('button', { name: '拖动碎片：类型：预约消息' }), page.locator('.pz-fragments li').nth(0));
    assert((await page.locator('.pz-fragments li').first().innerText()).includes('类型：预约消息'));
    await touchDrag(page, page.getByRole('button', { name: '拖动碎片：创建：19:48' }), page.locator('.pz-fragments li').nth(1));
  } else {
    await click(page, '上移类型：预约消息'); await click(page, '上移类型：预约消息');
    await click(page, '上移创建：19:48'); await click(page, '上移创建：19:48');
  }
  await click(page, '校验并恢复'); await saved(page, 'puzzles', 'restore');
  await noOverflow(page, 'phone recovery dialog');
  await close(page);
}
async function camera(page, { both = true, errors = false }) {
  await click(page, '02 一楼 · 控制台');
  await saved(page, 'visited', 'console');
  await click(page, '调查主楼梯监控');
  if (errors) {
    await click(page, '截取当前画面');
    assert((await page.locator('.pz-camera .pz-feedback').innerText()).includes('没有足够清晰'));
  }
  const range = page.getByRole('slider', { name: '拖动回放时间轴', exact: false });
  await range.focus();
  await page.keyboard.press('Home');
  for (let minute = 10; minute < 27; minute++) await page.keyboard.press('ArrowRight');
  assert.equal(await range.inputValue(), '27');
  await click(page, '截取当前画面'); await saved(page, 'evidence', 'camera-lin');
  if (both) {
    for (let i = 0; i < 5; i++) await click(page, '监控前进一分钟');
    assert.equal(await range.inputValue(), '32');
    await click(page, '截取当前画面'); await saved(page, 'evidence', 'camera-zhou');
  }
  await noOverflow(page, 'camera dialog');
  await close(page);
  await collect(page, 'livestream');
}
async function board(page, invalid = false) {
  await nav(page, '证据');
  await click(page, '建立关联');
  if (invalid) {
    const before = (await state(page)).deductions.length;
    await page.locator('[data-evidence="body"]').click();
    await page.locator('[data-evidence="window"]').click();
    await click(page, '验证关联');
    assert.equal((await state(page)).deductions.length, before);
    assert((await page.locator('.toast').innerText()).includes('不能形成'));
    await page.locator('[data-evidence="body"]').click();
    await page.locator('[data-evidence="window"]').click();
  }
  for (const [first, second] of pairs) {
    await page.locator(`[data-evidence="${first}"]`).click();
    await page.locator(`[data-evidence="${second}"]`).click();
    await click(page, '验证关联');
  }
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('rain-case-v1')).deductions.length === 5);
  await click(page, '结束关联');
}
async function preserveReset(page) {
  const before = await state(page);
  await click(page, '案件设置'); await click(page, '重新开始案件');
  await click(page, '保留当前进度'); await close(page);
  assert.deepEqual(await state(page), before);
}
async function responsive(page, originalWidth) {
  for (const width of [375, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const name of ['现场', '嫌疑人', '证据', '时间线', '推理']) {
      await nav(page, name); await noOverflow(page, `${name} at ${width}px`);
    }
  }
  await page.setViewportSize({ width: originalWidth, height: 844 });
}

try {
  for (const route of [{ id: 'efficient', width: 390, grade: 'S' }, { id: 'mistakes', width: 375, grade: 'A' }, { id: 'optional-skipped', width: 430, grade: 'S' }]) {
    const context = await browser.newContext({ viewport: { width: route.width, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    console.log(`Route ${route.id}: opening ${url} at ${route.width}px`);
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      assert((await page.title()).includes('雨停之前'));
      assert(!(await state(page)).started);
      await noOverflow(page, 'cover');
      if (route.id === 'efficient') await shot(page, 'cover390.png');
      await click(page, '开启档案'); await click(page, '进入现场');
      assert((await state(page)).started);
      if (route.id === 'efficient') {
        await shot(page, 'scene390.png');
        await page.setViewportSize({ width: 768, height: 844 }); await shot(page, 'scene768.png');
        await page.setViewportSize({ width: 390, height: 844 });
        await click(page, '调查提示'); await click(page, '再给我一点提示'); await click(page, '再给我一点提示');
        assert.equal(await page.locator('.hint-step').count(), 3); await close(page);
        await nav(page, '嫌疑人'); assert.equal(await page.locator('.topic:disabled').count(), 1);
        assert.equal(await page.locator('.testimony blockquote').count(), 0);
        await nav(page, '时间线'); assert((await page.locator('.timeline-event.unknown').count()) > 0);
        await nav(page, '证据'); assert.equal(await page.locator('[data-evidence^="statement:"]').count(), 0);
        await submit(page, 'B'); await close(page); await nav(page, '现场');
      }
      if (route.id === 'mistakes') {
        await collect(page, 'cup'); await collect(page, 'clock');
        await ask(page, 'zhou', 'zhou-where');
        await challenge(page, 'zhou-where', 'cup', false);
        const once = (await state(page)).score;
        await challenge(page, 'zhou-where', 'cup', false);
        assert.equal((await state(page)).score, once);
        await challenge(page, 'zhou-where', 'clock', false);
        await ask(page, 'xu', 'xu-money'); await challenge(page, 'xu-money', 'cup', false);
        assert.equal((await state(page)).score, 85);
        await submit(page, 'C', { ...answers, culprit: 'zhou' });
        await shot(page, 'result-C375.png'); await close(page); await nav(page, '现场');
      }
      for (const id of route.id === 'optional-skipped' ? ['window', 'lock', 'ledger', 'weapon', 'body'] : ['body', 'weapon', 'lock', 'window', 'ledger']) await collect(page, id, route.id === 'optional-skipped');
      console.log(`Route ${route.id}: physical evidence collected; verifying refresh`);
      const beforeReload = await state(page);
      await page.reload({ waitUntil: 'networkidle' });
      assert.deepEqual(await state(page), beforeReload);
      assert.equal(await page.getByRole('button', { name: '开启档案', exact: true }).count(), 0);
      await photo(page, route.id === 'efficient');
      await phone(page, { touch: route.id === 'efficient', errors: route.id === 'mistakes' });
      await nav(page, '嫌疑人');
      await page.getByRole('group', { name: '选择嫌疑人' }).getByRole('button', { name: /林岑/ }).click();
      assert.equal(await page.locator('.topic:disabled').count(), 0);
      await nav(page, '现场');
      await camera(page, { both: route.id !== 'optional-skipped', errors: route.id === 'mistakes' });
      if (route.id === 'mistakes') {
        await ask(page, 'zhou', 'zhou-where'); await challenge(page, 'zhou-where', 'camera-zhou');
        assert((await state(page)).evidence.includes('note-zhou'));
      }
      await ask(page, 'lin', 'lin-where');
      if (route.id === 'efficient') await shot(page, 'suspects390.png');
      await challenge(page, 'lin-where', 'camera-lin');
      assert((await page.locator('.testimony').innerText()).includes('改口'));
      await nav(page, '证据');
      assert.equal(await page.locator('[data-evidence="statement:lin-where"]').count(), 1);
      await board(page, route.id !== 'optional-skipped');
      if (route.id === 'efficient') await shot(page, 'evidence390.png');
      await preserveReset(page);
      console.log(`Route ${route.id}: complete chain, checking responsive pages and submitting`);
      if (route.id === 'efficient') await responsive(page, route.width);
      else for (const name of ['现场', '嫌疑人', '证据', '时间线', '推理']) { await nav(page, name); await noOverflow(page, `${route.id} ${name}`); }
      await submit(page, route.grade);
      const final = await state(page);
      assert.equal(final.report.correct, 6);
      assert.equal(final.deductions.length, 5);
      assert.deepEqual(final.report.missing, []);
      assert.equal(final.score, route.id === 'mistakes' ? 85 : 100);
      if (route.id === 'optional-skipped') for (const id of ['clock', 'cup', 'transfer', 'maintenance', 'camera-zhou', 'note-zhou', 'note-xu', 'note-shen']) assert(!final.evidence.includes(id), `${id} must remain optional`);
      await noOverflow(page, `${route.grade} result dialog`);
      await shot(page, `result-${route.grade}${route.width}.png`);
      await click(page, route.grade === 'S' ? '返回案卷 · 继续查看' : '返回调查 · 补全推理');
      await page.reload({ waitUntil: 'networkidle' });
      assert.deepEqual((await state(page)).report, final.report);
      if (route.id === 'optional-skipped') {
        await click(page, '案件设置'); await click(page, '重新开始案件'); await click(page, '确认清空并重开');
        await page.getByRole('button', { name: '开启档案', exact: true }).waitFor();
        assert.deepEqual((await state(page)).evidence, []);
        assert.equal((await state(page)).report, null);
      }
      assert.deepEqual(errors, [], 'No browser console or runtime errors');
      findings.routes.push({ ...route, score: final.score, evidence: final.evidence, deductions: final.deductions, report: final.report, browserErrors: errors, status: 'passed' });
      console.log(`PASS ${route.id}: ${final.report.grade}, score ${final.score}, ${final.evidence.length} evidence, 5 deductions`);
    } catch (error) {
      await shot(page, `failure-${route.id}.png`);
      findings.errors.push({ route: route.id, error: error.stack || String(error), browserErrors: errors });
      throw error;
    } finally { await context.close(); }
  }
} finally {
  await writeFile(path.join(output, 'playtest-report.json'), JSON.stringify(findings, null, 2));
  await browser.close();
}
console.log('Passed: three UI-only routes; real touch pinch and reorder; responsive widths; save/reload; B/C recovery; S/A; reset; zero runtime errors.');
