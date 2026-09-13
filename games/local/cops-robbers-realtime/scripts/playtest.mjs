import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { LEVELS } from "../src/levels.js";

const base = process.env.GAME_URL || "http://127.0.0.1:43690";
const channel = process.env.BROWSER_CHANNEL || "chrome";
const browser = await chromium.launch({
  channel: channel === "bundled" ? undefined : channel,
  headless: true,
});
const errors = [],
  checks = [];
await mkdir("artifacts", { recursive: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const snapshot = (p = page) =>
  p.evaluate(async () => (await import("./src/main.js")).getSnapshot());
const screen = (point, p = page) =>
  p.evaluate(
    async (point) => (await import("./src/main.js")).worldToScreen(point),
    point,
  );
const waitPhase = (phase, p = page) =>
  p.waitForFunction((phase) => document.body.dataset.phase === phase, phase, {
    timeout: 25000,
  });
async function waitState(predicate, p = page) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    if (predicate(await snapshot(p))) return;
    await p.waitForTimeout(80);
  }
  throw new Error("Timed out waiting for simulation state");
}
async function point(point, p = page, touch = false) {
  const pos = await screen(point, p);
  if (touch) await p.touchscreen.tap(pos.x, pos.y);
  else await p.mouse.click(pos.x, pos.y);
}
async function order(cop, destination, p = page, touch = false) {
  const button = p.locator(".cop-card").nth(cop);
  if (touch) await button.tap();
  else await button.click();
  await point(destination, p, touch);
}
async function guards(level, p = page, touch = false) {
  for (const { cop, node } of level.solution)
    await order(cop, level.nodes[node], p, touch);
}
try {
  await page.goto(base);
  assert.match(await page.title(), /别跑.*实时/);
  await waitPhase("ready");
  assert.equal((await snapshot()).level, 1);
  assert.ok((await snapshot()).exits.length > 0);
  assert.equal(await page.locator(".cop-card").count(), LEVELS[0].cops.length);
  await page.screenshot({
    path: "artifacts/desktop-ready.png",
    fullPage: true,
  });
  const roster = await page.locator("#cop-roster").boundingBox();
  assert.ok(roster.y + roster.height < 900);
  await page.locator("#start-button").click();
  const initial = await snapshot();
  await page.waitForTimeout(500);
  const moving = await snapshot();
  assert.ok(moving.time > 0.3);
  assert.ok(
    Math.hypot(
      moving.robbers[0].x - initial.robbers[0].x,
      moving.robbers[0].y - initial.robbers[0].y,
    ) > 10,
  );
  checks.push(
    "Robbers actively run toward a real exit while the player is idle",
  );
  await waitState((state) => state.robbers.some((r) => r.escapeProgress > 0.1));
  await page.waitForTimeout(140);
  assert.match(await page.locator("#exit-status").textContent(), /翻越/);
  await page.screenshot({
    path: "artifacts/escape-warning.png",
    fullPage: true,
  });
  await page.locator("#pause-button").click();
  const paused = await snapshot();
  await page.waitForTimeout(400);
  assert.equal(
    (await snapshot()).robbers[0].escapeProgress,
    paused.robbers[0].escapeProgress,
  );
  assert.equal((await snapshot()).time, paused.time);
  await page.locator("#resume-button").click();
  await waitPhase("lost");
  await page.waitForSelector("#lose-dialog[open]");
  const escaped = await snapshot();
  assert.ok(escaped.robbers.some((r) => r.escaped));
  assert.equal(escaped.unlocked, 1, "loss cannot unlock the next map");
  assert.match(await page.locator("#lose-title").textContent(), /出口 A/);
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("neighborhood-patrol-v1") || "{}")
          .escapeBest?.[1],
    ),
    undefined,
  );
  await page.screenshot({
    path: "artifacts/escape-failure.png",
    fullPage: true,
  });
  checks.push(
    "Visible climbing warning, pause-safe escape timer, actual loss without progression",
  );
  await page.locator("#lose-review").click();
  await page.locator("#start-button").click();
  await waitPhase("ready");
  checks.push("Failure review retains the board and offers a working retry");
  const first = LEVELS[0];
  await page.locator("#start-button").click();
  await guards(first);
  const hunter = first.cops.findIndex(
    (_, i) => !first.solution.some((g) => g.cop === i),
  );
  const destination = first.nodes[first.exits[0]];
  await order(hunter, destination);
  await page.waitForTimeout(800);
  const outbound = await snapshot();
  const originalPoint = first.nodes[first.cops[hunter]];
  assert.ok(
    Math.hypot(
      outbound.cops[hunter].x - originalPoint.x,
      outbound.cops[hunter].y - originalPoint.y,
    ) > 50,
  );
  await point(originalPoint);
  await page.waitForTimeout(350);
  const reversed = await snapshot();
  assert.ok(
    Math.hypot(
      reversed.cops[hunter].x - originalPoint.x,
      reversed.cops[hunter].y - originalPoint.y,
    ) <
      Math.hypot(
        outbound.cops[hunter].x - originalPoint.x,
        outbound.cops[hunter].y - originalPoint.y,
      ),
  );
  await page.locator("#hold-button").click();
  assert.equal((await snapshot()).cops[hunter].destination, null);
  checks.push(
    "Continuous road reversal and hold still work under escape pressure",
  );
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  assert.ok((await snapshot()).cops[hunter].destination);
  await page.locator("#hold-button").click();
  checks.push("Keyboard orders work after roster selection");
  const beforeCancel = await snapshot(),
    dragStart = await screen(beforeCancel.cops[hunter]),
    dragEnd = await screen(destination);
  await page.mouse.move(dragStart.x, dragStart.y - 8);
  await page.mouse.down();
  await page.mouse.move(dragEnd.x, dragEnd.y, { steps: 8 });
  await page.keyboard.press("1");
  await page.mouse.up();
  assert.equal((await snapshot()).cops[hunter].destination, null);
  checks.push(
    "Officer switching cancels a drag without dispatching the wrong officer",
  );
  const pursuitStart = await screen((await snapshot()).cops[hunter]);
  const pursuitEnd = await screen(destination);
  await page.mouse.move(pursuitStart.x, pursuitStart.y - 8);
  await page.mouse.down();
  await page.mouse.move(pursuitEnd.x, pursuitEnd.y, { steps: 8 });
  await page.mouse.up();
  await waitState((state) => state.exits.some((e) => e.blocked));
  await page.waitForFunction(() =>
    document.getElementById("exit-status").textContent.includes("0/1"),
  );
  await page.screenshot({
    path: "artifacts/desktop-interception.png",
    fullPage: true,
  });
  await waitPhase("won");
  await page.waitForSelector("#win-dialog[open]");
  assert.equal((await snapshot()).unlocked, 2);
  assert.ok(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("neighborhood-patrol-v1"))
          .escapeBest[1] > 0,
    ),
  );
  checks.push(
    "Timely exit interception and pursuit genuinely win and save the new score",
  );
  await page.locator("#next-button").click();
  assert.equal((await snapshot()).level, 2);
  await page.reload();
  await page.waitForSelector('body[data-level="2"]');
  checks.push("New difficulty scores and progression survive reload");
  const second = LEVELS[1];
  await page.locator("#start-button").click();
  await guards(second);
  const secondHunter = second.cops.findIndex(
    (_, i) => !second.solution.some((g) => g.cop === i),
  );
  const secondState = await snapshot(),
    from = await screen(secondState.cops[secondHunter]),
    to = await screen(second.nodes[second.exits[0]]);
  await page.mouse.move(from.x, from.y - 8);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await waitPhase("won");
  await page.waitForSelector("#win-dialog[open]");
  await page.keyboard.press("Escape");
  await page.locator("#start-button").click();
  assert.equal((await snapshot()).level, 3);
  checks.push(
    "Drag pursuit plus an exit guard wins the second map; dismissed victory keeps next action",
  );
  await page.locator("#levels-button").click();
  assert.equal(await page.locator(".chapter-tab").count(), 8);
  assert.equal(await page.locator(".level-tile:disabled").count(), 3);
  await page.locator(".chapter-tab").last().click();
  assert.equal(await page.locator(".level-tile:disabled").count(), 6);
  await page.screenshot({ path: "artifacts/level-select.png", fullPage: true });
  await page.locator("#levels-dialog [data-close]").click();
  checks.push("All eight districts remain selectable with correct unlocks");
  const touchContext = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const touch = await touchContext.newPage();
  touch.on("pageerror", (e) => errors.push(e.message));
  await touch.goto(base);
  await waitPhase("ready", touch);
  assert.equal(
    await touch.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await touch.screenshot({
    path: "artifacts/mobile-landscape.png",
    fullPage: true,
  });
  await touch.locator("#start-button").tap();
  await guards(first, touch, true);
  await order(hunter, destination, touch, true);
  await waitPhase("won", touch);
  await touch.waitForSelector("#win-dialog[open]");
  checks.push(
    "844×390 real touch commands intercept an exit and capture the robber",
  );
  await touch.setViewportSize({ width: 390, height: 844 });
  await touch.locator("#next-button").tap();
  await touch.waitForTimeout(250);
  await touch.screenshot({
    path: "artifacts/mobile-portrait.png",
    fullPage: true,
  });
  assert.equal(
    await touch.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  checks.push("Portrait layout fits and shows the new escape objective");
  await touchContext.close();
  assert.deepEqual(errors, []);
  const report = {
    url: base,
    checks,
    errors,
    testedAt: new Date().toISOString(),
  };
  await writeFile(
    "artifacts/browser-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page
    .screenshot({ path: "artifacts/browser-failure.png", fullPage: true })
    .catch(() => {});
  console.error({ checks, state: await snapshot().catch(() => null) });
  throw error;
} finally {
  await browser.close();
}
