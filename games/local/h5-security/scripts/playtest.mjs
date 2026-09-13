import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.GAME_URL || 'http://127.0.0.1:4173';
await mkdir('artifacts', { recursive: true });
const engine = process.env.TEST_BROWSER === 'webkit' ? 'webkit' : 'chrome';
const browser = engine === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const checks = [];
const storage = page => page.evaluate(() => JSON.parse(localStorage.getItem('between-calls-v1'))?.game);
const action = (page, name) => page.locator(`.phone [data-action="${name}"]`).first();
async function dismiss(page) { const el = action(page, 'dismiss-notification'); if (await el.isVisible()) await el.click(); }
async function navigate(page, target) {
  if (await page.locator('.call-overlay.ringing').isVisible()) await action(page, 'decline').click();
  await page.locator('.bottom-nav [aria-label="返回桌面"]').click();
  await dismiss(page);
  await page.locator(`.app-grid [data-page="${target}"]`).click();
}
async function newGame(viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 600, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.clock.install();
  await page.goto(base);
  await page.getByRole('button', { name: /拿起手机/ }).waitFor();
  return page;
}
async function start(page) { await action(page, 'start').click(); await page.locator('.home-screen').waitFor(); await dismiss(page); }
async function noOverflow(page, name) {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, doc: document.documentElement.scrollWidth, phone: document.querySelector('.phone').getBoundingClientRect().toJSON() }));
  assert(dimensions.doc <= dimensions.width + 1, `${name}: document overflow`);
  assert(dimensions.phone.x >= -1 && dimensions.phone.right <= dimensions.width + 1, `${name}: phone outside viewport`);
  checks.push(`${name}: no horizontal overflow`);
}
try {
  const desktop = await newGame({ width: 1440, height: 1000 });
  await desktop.screenshot({ path: 'artifacts/welcome-desktop.png', fullPage: true });
  await noOverflow(desktop, 'desktop welcome');
  await desktop.context().close();

  const page = await newGame();
  await page.screenshot({ path: 'artifacts/welcome-mobile.png' });
  await start(page);
  await page.screenshot({ path: 'artifacts/home-mobile.png' });
  await noOverflow(page, 'mobile home');

  // A real message exchange and copying the household number from existing records.
  await navigate(page, 'messages');
  await page.locator('.thread-list [data-id="landlord"]').click();
  await page.getByRole('textbox', { name: '消息内容' }).fill('我再核对一下电费户号');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await page.clock.runFor(3100);
  const chat = await page.locator('.chat-scroll').innerText();
  assert(chat.includes('3301060826'));
  assert(chat.includes('我再核对一下电费户号'));
  await page.screenshot({ path: 'artifacts/chat-mobile.png' });

  // Work on a parcel, get interrupted, inspect the original order while on a call.
  await navigate(page, 'shop');
  await page.locator('.order-card').click();
  await page.clock.runFor(2100);
  await page.locator('.call-overlay.ringing').waitFor();
  await page.screenshot({ path: 'artifacts/incoming-mobile.png' });
  await action(page, 'answer').click();
  assert((await page.locator('.call-transcript').innerText()).includes('路由器'));
  await action(page, 'call-reply').click();
  await action(page, 'minimize-call').click();
  assert(await page.locator('.active-call-strip').isVisible());
  await page.locator('.app-grid [data-page="shop"]').click();
  await page.locator('.order-card').click();
  await page.locator('[data-action="verify"][data-topic="parcel"]').click();
  assert((await page.locator('.chat-scroll').innerText()).includes('已核实'));
  await action(page, 'expand-call').click();
  await action(page, 'hangup').click();
  await navigate(page, 'shop');
  await page.locator('.order-card').click();
  await page.locator('[data-page="delivery"]').click();
  await page.getByLabel('给派件员留言（选填）').fill('到站后请发短信，谢谢');
  await page.getByLabel('梧桐里便民驿站', { exact: false }).check();
  await page.getByRole('button', { name: /确认修改/ }).click();
  assert.equal((await storage(page)).tasks.delivery, '梧桐里便民驿站');
  checks.push('Call interruption, order verification, redirection via UI');

  await navigate(page, 'network');
  await page.locator('[data-page="installation"]').click();
  await page.getByLabel('今天的可预约时段').selectOption({ index: 1 });
  await page.getByLabel('上门备注（选填）').fill('请提前十分钟联系');
  await page.getByRole('button', { name: /确认预约/ }).click();
  await page.clock.runFor(3100);
  await action(page, 'decline').click();
  await page.locator('[data-action="verify"][data-topic="install"]').click();
  assert((await page.locator('.chat-scroll').innerText()).includes('不收取'));

  await navigate(page, 'bill');
  await page.getByLabel('缴费户号').fill('123');
  await page.getByRole('button', { name: /查询账单/ }).click();
  assert((await page.locator('#toast-message').innerText()).includes('户号'));
  await page.getByLabel('缴费户号').fill('3301060826');
  await page.getByRole('button', { name: /查询账单/ }).click();
  await page.getByRole('button', { name: '核对并缴费' }).click();
  await page.getByRole('button', { name: '获取付款验证码', exact: true }).click();
  await dismiss(page);
  await page.getByRole('button', { name: '打开短信查看验证码' }).click();
  const code = (await page.locator('.chat-scroll').innerText()).match(/验证码 (\d{6})/)[1];
  await page.locator('.app-header [data-action="back"]').click();
  await page.getByLabel('付款验证码', { exact: true }).fill(code);
  await page.getByRole('button', { name: '确认支付 ¥ 128.60' }).click();
  let state = await storage(page);
  assert.equal(state.tasks.bill, true);
  assert.equal(state.balance, 355140);
  assert.equal(state.transactions.length, 1);
  await page.reload();
  await page.locator('.success-card').waitFor();
  assert.equal((await storage(page)).balance, 355140);
  await navigate(page, 'notes');
  await action(page, 'finish-confirm').click();
  await action(page, 'finish').click();
  assert.equal((await storage(page)).ended, true);
  assert((await page.locator('.review-hero').innerText()).includes('守住'));
  await page.screenshot({ path: 'artifacts/safe-review-mobile.png' });
  checks.push('Three tasks, correct OTP, exact debit, saved reload, safe review');
  await page.context().close();

  // The two fraud branches are reached through received messages, without editing game state.
  const fraud = await newGame();
  await start(fraud);
  await navigate(fraud, 'shop');
  await fraud.locator('.order-card').click();
  await fraud.clock.runFor(2100);
  await action(fraud, 'decline').click();
  await navigate(fraud, 'messages');
  await fraud.locator('.thread-list [data-id="parcel"]').click();
  await action(fraud, 'web').click();
  assert.equal((await storage(fraud)).balance, 368000);
  assert.equal((await storage(fraud)).leaks.length, 0);
  await action(fraud, 'request-code').click();
  await navigate(fraud, 'messages');
  await fraud.locator('.thread-list [data-id="wallet"]').click();
  assert((await fraud.locator('.chat-scroll').innerText()).includes('新设备登录'));
  await navigate(fraud, 'messages');
  await fraud.locator('.thread-list [data-id="parcel"]').click();
  await action(fraud, 'web').click();
  await fraud.getByLabel('短信验证码', { exact: true }).fill('743018');
  await fraud.getByRole('button', { name: '提交赔付申请' }).click();
  assert.equal((await storage(fraud)).leaks.length, 1);
  assert.equal((await storage(fraud)).balance, 368000);
  await navigate(fraud, 'wallet');
  await action(fraud, 'account').click();
  await action(fraud, 'secure').click();
  assert.equal((await storage(fraud)).flags.accountSecured, true);

  await navigate(fraud, 'network');
  await fraud.locator('[data-page="installation"]').click();
  await fraud.getByRole('button', { name: /确认预约/ }).click();
  await fraud.clock.runFor(3100);
  await action(fraud, 'decline').click();
  await navigate(fraud, 'messages');
  await fraud.locator('.thread-list [data-id="supervisor"]').click();
  await action(fraud, 'web').click();
  await action(fraud, 'deposit-confirm').click();
  assert((await fraud.locator('.modal').innerText()).includes('林某'));
  await action(fraud, 'pay-deposit').click();
  assert.equal((await storage(fraud)).balance, 318100);
  assert.equal((await storage(fraud)).transactions.length, 1);
  await navigate(fraud, 'notes');
  await action(fraud, 'finish-confirm').click();
  await action(fraud, 'finish').click();
  assert((await fraud.locator('.review-stats').innerText()).includes('499.00'));
  await fraud.screenshot({ path: 'artifacts/fraud-review-mobile.png' });
  await action(fraud, 'retry-confirm').click();
  await action(fraud, 'retry').click();
  assert.equal((await storage(fraud)).balance, 368000);
  assert.equal((await storage(fraud)).leaks.length, 1);
  checks.push('Both scam branches, access alone safe, distinct OTP, protection, debit, checkpoint rollback');
  await fraud.context().close();

  // An unsent edit survives a call and a reload; background time does not advance the story.
  const interrupted = await newGame();
  await start(interrupted);
  await navigate(interrupted, 'network');
  await interrupted.locator('[data-page="installation"]').click();
  await interrupted.getByLabel('今天的可预约时段').selectOption({ index: 2 });
  await interrupted.getByRole('button', { name: /确认预约/ }).click();
  await interrupted.getByLabel('今天的可预约时段').selectOption({ index: 0 });
  await interrupted.getByLabel('上门备注（选填）').fill('请不要清掉这条草稿');
  await interrupted.clock.runFor(3100);
  await action(interrupted, 'answer').click();
  await action(interrupted, 'call-continue').click();
  assert((await interrupted.locator('.call-transcript').innerText()).includes('四百九十九'));
  await action(interrupted, 'hangup').click();
  assert.equal(await interrupted.getByLabel('今天的可预约时段').inputValue(), '今天 14:00—15:00');
  assert.equal(await interrupted.getByLabel('上门备注（选填）').inputValue(), '请不要清掉这条草稿');
  await interrupted.reload();
  assert.equal(await interrupted.getByLabel('今天的可预约时段').inputValue(), '今天 14:00—15:00');
  assert.equal(await interrupted.getByLabel('上门备注（选填）').inputValue(), '请不要清掉这条草稿');
  const beforePause = (await storage(interrupted)).time;
  await interrupted.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await interrupted.clock.runFor(6000);
  assert.equal((await storage(interrupted)).time, beforePause);
  await interrupted.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await interrupted.clock.runFor(1000);
  assert((await storage(interrupted)).time > beforePause);
  await interrupted.evaluate(() => { const saved = JSON.parse(localStorage.getItem('between-calls-v1')); saved.ui.scrolls = null; saved.ui.history = [null, { page: 'not-a-page' }]; localStorage.setItem('between-calls-v1', JSON.stringify(saved)); });
  await interrupted.reload();
  await interrupted.locator('.phone').waitFor();
  assert.equal((await storage(interrupted)).tasks.installation, '今天 16:00—17:00');
  checks.push('Call progression, unsent selected slot/note survives reload, simulated background pause, corrupt UI save recovery');
  await interrupted.context().close();

  const small = await newGame({ width: 360, height: 640 });
  await start(small);
  await noOverflow(small, '360x640 home');
  await small.screenshot({ path: 'artifacts/home-small.png' });
  await navigate(small, 'notes');
  await action(small, 'finish-confirm').click();
  await action(small, 'finish').click();
  assert((await small.locator('.review-hero').innerText()).includes('没办完'));
  checks.push('Ignoring everything never passes');
  await small.context().close();
  assert.deepEqual(errors, []);
  await writeFile(`artifacts/playtest-result-${engine}.json`, JSON.stringify({ base, engine, checks, errors, passed: true }, null, 2));
  console.log(`${engine} browser playtest passed: ${checks.length} checks, no page/resource errors.`);
} catch (error) {
  await writeFile(`artifacts/playtest-result-${engine}.json`, JSON.stringify({ base, engine, checks, errors, passed: false, failure: error.message }, null, 2));
  throw error;
} finally { await browser.close(); }
