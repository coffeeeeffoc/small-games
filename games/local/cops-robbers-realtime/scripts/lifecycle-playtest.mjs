import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { LEVELS } from "../src/levels.js";
import { createGame, roadTarget, roadDistance } from "../src/engine.js";

const base = process.env.GAME_URL || "http://127.0.0.1:43690";
const channel = process.env.BROWSER_CHANNEL || "chrome";
assert.ok(
  LEVELS.every((level) => level.exits.length > 0),
  "all 48 escape maps must be ready before running this regression",
);
const browser = await chromium.launch({
  channel: channel === "bundled" ? undefined : channel,
  headless: true,
  ignoreDefaultArgs: ["--disable-back-forward-cache"],
});
const context = await browser.newContext({
  viewport: { width: 844, height: 390 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 2,
});
const page = await context.newPage();
const errors = [],
  checks = [],
  samples = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const snapshot = () =>
  page.evaluate(async () => (await import("./src/main.js")).getSnapshot());
const screen = (point) =>
  page.evaluate(
    async (point) => (await import("./src/main.js")).worldToScreen(point),
    point,
  );
const tap = async (point) => {
  const p = await screen(point);
  await page.touchscreen.tap(p.x, p.y);
};
try {
  await mkdir("artifacts", { recursive: true });
  await page.goto(base);
  assert.match(
    await page.title(),
    /别跑.*实时/,
    "the server serves the realtime game",
  );
  await page.waitForSelector('body[data-phase="ready"]');
  await page.evaluate(() =>
    localStorage.setItem("neighborhood-patrol-v1", "{broken"),
  );
  await page.reload();
  await page.waitForSelector('body[data-phase="ready"]');
  assert.equal((await snapshot()).level, 1);
  await page.locator("#levels-button").tap();
  assert.equal(await page.locator(".level-map").count(), 6);
  await page.locator("#levels-dialog [data-close]").tap();
  checks.push("Corrupt storage recovers to a playable first level");
  await page.locator("#sound-button").tap();
  await page.reload();
  await page.waitForSelector('body[data-phase="ready"]');
  assert.equal((await snapshot()).audio, false);
  checks.push("Mute preference persists");
  await page.locator("#sound-button").tap();
  await page.locator("#start-button").tap();
  const firstLevel = LEVELS[0];
  for (const { cop, node } of firstLevel.solution) {
    await page.locator(".cop-card").nth(cop).tap();
    await tap(firstLevel.nodes[node]);
  }
  const hunter = firstLevel.cops.findIndex(
    (_, index) => !firstLevel.solution.some(({ cop }) => cop === index),
  );
  assert.ok(hunter >= 0, "the first map has an officer available for pursuit");
  await page.locator(".cop-card").nth(hunter).tap();
  const origin = await snapshot();
  const target = firstLevel.nodes[firstLevel.exits[0]];
  const from = await screen(origin.cops[hunter]),
    to = await screen(target);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: from.x, y: from.y - 8 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: to.x, y: to.y }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  assert.equal((await snapshot()).cops[hunter].destination, null);
  await tap(target);
  assert.ok((await snapshot()).cops[hunter].destination);
  checks.push("Native touch cancellation emits no order, next gesture works");
  const previous = (await snapshot()).cops[hunter].destination;
  await tap({ x: 100, y: 100 });
  assert.deepEqual((await snapshot()).cops[hunter].destination, previous);
  checks.push("Invalid target preserves the current route");
  await page.locator("#hold-button").tap();
  // Headless tabs remain focused, so exercise the application's blur boundary explicitly.
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.waitForTimeout(200);
  const paused = await snapshot();
  assert.equal(paused.phase, "paused");
  await page.waitForTimeout(300);
  assert.equal((await snapshot()).time, paused.time);
  await page.locator("#resume-button").tap();
  await page.waitForTimeout(200);
  assert.ok((await snapshot()).time > paused.time);
  checks.push(
    "Window blur lifecycle handler pauses and explicit resume restores motion",
  );

  await page.evaluate(() =>
    window.addEventListener("pageshow", (event) => {
      window.returnedFromCache = event.persisted;
    }),
  );
  await page.goto(new URL("?navigation-test=1", base).href);
  await page.goBack({ waitUntil: "commit", timeout: 5000 });
  assert.equal(await page.evaluate(() => window.returnedFromCache), true);
  assert.equal((await snapshot()).phase, "paused");
  await page.locator("#resume-button").tap();
  const restoredTime = (await snapshot()).time;
  await page.waitForTimeout(400);
  assert.ok((await snapshot()).time > restoredTime + 0.2);
  checks.push(
    "Real back-forward cache navigation restores a paused, resumable simulation",
  );

  // This legacy-save fixture unlocks map 48; it does not claim browser wins on maps 1-47.
  // The new street maps have no recorded victories until the touch-driven final-map win below.
  await page.evaluate(() =>
    localStorage.setItem(
      "neighborhood-patrol-v1",
      JSON.stringify({
        sound: true,
        best: Object.fromEntries(
          Array.from({ length: 47 }, (_, i) => [i + 1, 100]),
        ),
        streetBest: {},
      }),
    ),
  );
  await page.reload();
  await page.waitForSelector('body[data-level="48"]');
  assert.equal((await snapshot()).cops.length, 5);
  assert.equal((await snapshot()).robbers.length, 6);
  assert.equal((await snapshot()).exits.length, LEVELS.at(-1).exits.length);
  assert.deepEqual(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("neighborhood-patrol-v1")).streetBest,
    ),
    {},
  );
  checks.push(
    "Legacy campaign progress unlocks map 48 without inventing new street-map best times",
  );
  await context.setOffline(true);
  for (const button of await page.locator(".cop-card").all()) {
    const box = await button.boundingBox();
    assert.ok(
      box.height >= 40 &&
        box.width >= 40 &&
        box.x >= 0 &&
        box.x + box.width <= 844 &&
        box.y >= 0 &&
        box.y + box.height <= 390,
      "all five officer targets fit landscape",
    );
  }
  await page.screenshot({
    path: "artifacts/final-level-mobile.png",
    fullPage: true,
  });
  await page.locator("#start-button").tap();
  const level = LEVELS.at(-1),
    model = createGame(level);
  for (const { cop, node } of level.solution) {
    await page.locator(".cop-card").nth(cop).tap();
    await tap(level.nodes[node]);
  }
  const hunters = level.cops
    .map((_, i) => i)
    .filter((i) => !level.solution.some((g) => g.cop === i));
  const assignments = new Map();
  const deadline = Date.now() + 240000;
  for (
    let round = 0;
    Date.now() < deadline && (await snapshot()).phase === "playing";
    round++
  ) {
    const state = await snapshot();
    const active = state.robbers.filter((r) => !r.caught && !r.escaped);
    const reserved = new Set();
    for (const cop of hunters) {
      let target = active.find(
        (r) => r.id === assignments.get(cop) && !reserved.has(r.id),
      );
      if (!target) {
        const free = active.filter((r) => !reserved.has(r.id));
        const origin = roadTarget(model, state.cops[cop]);
        target = (free.length ? free : active).sort(
          (a, b) =>
            roadDistance(model, origin, roadTarget(model, a)) -
            roadDistance(model, origin, roadTarget(model, b)),
        )[0];
      }
      if (target) {
        assignments.set(cop, target.id);
        reserved.add(target.id);
        await page.locator(".cop-card").nth(cop).tap();
        await tap(target);
      }
    }
    if (round === 3)
      await page.screenshot({
        path: "artifacts/final-level-playing.png",
        fullPage: true,
      });
    if (state.fps > 0) samples.push(state.fps);
    await page.waitForTimeout(600);
  }
  const end = await snapshot();
  assert.equal(
    end.phase,
    "won",
    "four guards and one pursuer can catch all six robbers with touch orders",
  );
  assert.equal(end.robbers.filter((r) => r.caught).length, 6);
  assert.equal(
    end.robbers.some((r) => r.escaped),
    false,
  );
  await page.waitForSelector("#win-dialog[open]");
  assert.match(await page.locator("#win-title").textContent(), /全城围捕/);
  await page.screenshot({
    path: "artifacts/final-level-win.png",
    fullPage: true,
  });
  checks.push(
    "Final 5-police / 6-robber map wins through actual mobile touch orders",
  );
  checks.push("The fully loaded final map remains playable offline");
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("neighborhood-patrol-v1")),
  );
  assert.deepEqual(Object.keys(saved.streetBest), ["48"]);
  assert.ok(
    saved.streetBest[48] > 0 &&
      Math.abs(saved.streetBest[48] - end.time) < 0.01,
  );
  checks.push(
    "Only the real map-48 victory is saved under the new street maps",
  );
  const median = samples.sort((a, b) => a - b)[Math.floor(samples.length / 2)];
  assert.ok(median > 30, "late-game median frame rate exceeds 30 FPS");
  assert.deepEqual(errors, []);
  const report = {
    checks,
    finalMapAccess:
      "A legacy-save fixture unlocks map 48; maps 1-47 were not completed in this browser regression.",
    input:
      "Actual mobile touchscreen orders; simulation time, coordinates, speed and result are never injected.",
    finalCaptureSeconds: end.time,
    mobileEmulationMedianFps: Math.round(median),
    errors,
    testedAt: new Date().toISOString(),
  };
  await writeFile(
    "artifacts/lifecycle-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page
    .screenshot({ path: "artifacts/lifecycle-failure.png", fullPage: true })
    .catch(() => {});
  console.error({ checks, state: await snapshot().catch(() => null) });
  throw error;
} finally {
  await browser.close();
}
