import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.GAME_URL || "http://127.0.0.1:43690";
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL === "bundled" ? undefined : "chrome" });
const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
const errors = [], checks = [];
page.on("pageerror", error => errors.push(error.message));
const snapshot = () => page.evaluate(async () => (await import("./src/main.js")).getSnapshot());
async function order(cop, point) {
  await page.locator(".cop-card").nth(cop).tap();
  const screen = await page.evaluate(async point => (await import("./src/main.js")).worldToScreen(point), point);
  await page.touchscreen.tap(screen.x, screen.y);
}
const phase = value => page.waitForFunction(value => document.body.dataset.phase === value, value);
try {
  await page.goto(base);
  await page.locator("#start-button").tap();
  const initial = await snapshot();
  await order(2, initial.nodes[0]);
  await page.waitForTimeout(450);
  await page.locator("#pause-button").tap();
  const before = await snapshot();
  await page.locator("#pause-practice").tap();
  await phase("playing");
  await page.locator("#practice-exit").tap();
  const restored = await snapshot();
  assert.equal(restored.phase, "paused", "Returning from a refresher must offer explicit resume, not restart the round");
  for (const key of ["level", "time", "selected", "cops", "robbers", "exits"])
    assert.deepEqual(restored[key], before[key], `Refresher preserves ${key}`);
  await page.waitForTimeout(500);
  assert.equal((await snapshot()).time, before.time);
  await page.locator("#resume-button").tap();
  await page.waitForTimeout(250);
  assert.ok((await snapshot()).time > before.time);
  checks.push("Touch refresher restores paused round, positions, pending orders, selected officer and elapsed time; explicit resume continues");

  await page.locator("#pause-button").tap();
  await page.locator("#pause-practice").tap();
  await order(0, { x: 500, y: 300 });
  await page.waitForTimeout(4500);
  await order(1, (await snapshot()).robbers[0]);
  await page.locator("#hold-button").tap(); // A premature hold must explain how to recover, not leave an inert drill.
  await page.waitForTimeout(200);
  assert.equal((await snapshot()).phase, "playing");
  assert.match(await page.locator("#capture-message").textContent(), /到点会停.*选 [12] 号.*突围队/);
  for (let retry = 0; retry < 4 && (await snapshot()).phase === "playing"; retry++) {
    const hint = await page.locator("#capture-message").textContent();
    const officer = hint.match(/选 ([12]) 号/);
    if (officer) await order(Number(officer[1]) - 1, (await snapshot()).robbers[0]);
    await page.waitForTimeout(2000);
  }
  await phase("won");
  await page.locator("#start-button").tap();
  assert.equal((await snapshot()).phase, "paused", "Finishing practice also preserves the interrupted challenge");
  checks.push("Slow input and a premature hold get actionable repeat-order coaching; following it wins with real touch input");

  await page.locator("#pause-restart").tap();
  for (const width of [305, 320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const button = await page.locator("#fullscreen-button").boundingBox();
    assert.ok(button.width >= 44 && button.height >= 44);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator("#help-button").scrollIntoViewIfNeeded();
    const visible = await page.locator("#fullscreen-button").boundingBox();
    assert.ok(visible.y >= 0 && visible.y + visible.height <= 844, "Fullscreen stays available while scrolling to controls");
  }
  checks.push("305/320/390px portrait has no horizontal overflow and keeps a labelled 44px fullscreen control reachable");
  await page.locator("#practice-button").tap();
  await page.locator("#fullscreen-button").tap();
  await page.waitForFunction(() => document.fullscreenElement === document.documentElement);
  await order(0, { x: 500, y: 300 });
  await page.locator("#pause-button").tap();
  const fullscreenPaused = await snapshot();
  await page.locator("#pause-dialog [data-game-fullscreen]").tap();
  await page.waitForFunction(() => !document.fullscreenElement);
  assert.equal((await snapshot()).time, fullscreenPaused.time);
  assert.deepEqual((await snapshot()).cops, fullscreenPaused.cops);
  await page.locator("#resume-button").tap();
  await page.waitForTimeout(200);
  assert.ok((await snapshot()).time > fullscreenPaused.time);
  checks.push("Chromium enters actual HTML fullscreen, accepts touch orders, pauses, exits via modal control and continues the same round");
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/guided-390.png", fullPage: true });
  assert.deepEqual(errors, []);
  const report = { url: base, testedAt: new Date().toISOString(), checks, errors };
  await writeFile("artifacts/guided-report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
