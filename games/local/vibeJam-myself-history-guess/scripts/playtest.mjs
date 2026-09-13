import { chromium, devices } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const url = process.env.PLAYTEST_URL || "http://127.0.0.1:4175/";
const browser = await chromium.launch({ channel: "chrome", headless: true });
await mkdir("artifacts", { recursive: true });
const errors = [],
  requests = [],
  results = [];
async function watch(context) {
  context.on("page", (page) => {
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("requestfailed", (request) => {
      if (!request.failure()?.errorText.includes("ERR_ABORTED"))
        errors.push(`${request.url()} ${request.failure()?.errorText}`);
    });
    page.on("request", (request) => requests.push(request.url()));
  });
}
async function ready(page) {
  await page.locator("#load-cover").waitFor({ state: "hidden" });
  await page.locator("#panorama").getAttribute("data-yaw");
}
async function noOverflow(page) {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "horizontal overflow",
  );
}
async function visibleMap(page) {
  const svg = page.locator(".leaflet-overlay-pane > svg");
  const bounds = await svg.boundingBox();
  assert.ok(
    bounds.width > 150 && bounds.height > 100,
    "map SVG was collapsed by icon CSS",
  );
  assert.ok(
    (await svg.locator("path").count()) > 170,
    "country geometries are missing",
  );
}
async function pick(page, city = "北京") {
  const mapTab = page.locator("#map-tab");
  if (await mapTab.isVisible()) await mapTab.click();
  await page.locator("#city-search").fill(city);
  await page.locator("#search-results button").first().click();
}
try {
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await watch(desktop);
  const page = await desktop.newPage();
  await page.goto(url);
  await noOverflow(page);
  await page.screenshot({
    animations: "disabled",
    path: "artifacts/home-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "玩法指南" }).click();
  assert.ok(
    (await page.locator("dialog").innerText()).includes("没有公元 0 年"),
  );
  await page.keyboard.press("Escape");
  await page.locator("#start").click();
  await ready(page);
  assert.equal(await page.locator("#submit").isDisabled(), true);
  const box = await page.locator("#panorama").boundingBox();
  const yaw = Number(await page.locator("#panorama").getAttribute("data-yaw"));
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.45, {
    steps: 12,
  });
  await page.mouse.up();
  await page.waitForFunction(
    (y) =>
      Math.abs(Number(document.querySelector("#panorama").dataset.yaw) - y) > 5,
    yaw,
  );
  await page.locator("#reset-view").click();
  await page.waitForFunction(
    () => Number(document.querySelector("#panorama").dataset.yaw) === 180,
  );
  await page.locator("#hint").click();
  assert.equal(await page.locator("#hint-text").isVisible(), true);
  await pick(page);
  await visibleMap(page);
  await page.locator("#year-number").fill("0");
  assert.equal(await page.locator("#submit").isDisabled(), true);
  await page.locator("#year-number").fill("1420");
  await page.screenshot({
    animations: "disabled",
    path: "artifacts/game-desktop.png",
  });
  await page.locator("#submit").dblclick();
  await page.locator("#result-overlay").waitFor({ state: "visible" });
  assert.equal(await page.locator(".result-card").count(), 1);
  await page.locator("#compare-map").click();
  assert.equal(await page.locator(".answer-pin").count(), 1);
  await page.locator("#submit").click();
  await page.screenshot({
    animations: "disabled",
    path: "artifacts/result-desktop.png",
  });
  for (let i = 1; i < 5; i++) {
    await page.locator("#next").click();
    await ready(page);
    await pick(page, "开封");
    await page.locator('[data-year="1100"]').click();
    await page.locator("#submit").click();
    await page.locator("#next").waitFor();
  }
  await page.locator("#next").click();
  await page.locator(".summary-row").first().waitFor();
  assert.equal(await page.locator(".summary-row").count(), 5);
  await page.screenshot({
    animations: "disabled",
    path: "artifacts/summary-desktop.png",
    fullPage: true,
  });
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("here-and-then.v1")),
  );
  assert.equal(saved.visited.length, 5);
  assert.ok(saved.best >= 0 && saved.best <= 25000);
  await page.reload();
  await page.locator("#journal").click();
  assert.equal(await page.locator("button.journal-card").count(), 5);
  await page.keyboard.press("Escape");
  results.push(
    "Desktop: 5 rounds, actual camera drag, hint, invalid year, scoring, answer map, summary, persisted journal.",
  );
  await desktop.close();

  const mobile = await browser.newContext({ ...devices["iPhone 13"] });
  await watch(mobile);
  const phone = await mobile.newPage();
  await phone.goto(url);
  await phone.screenshot({
    animations: "disabled",
    path: "artifacts/home-mobile.png",
    fullPage: true,
  });
  await noOverflow(phone);
  await phone.locator('input[value="china"]').check();
  await phone.locator("#start").tap();
  await ready(phone);
  const cdp = await mobile.newCDPSession(phone);
  let bounds = await phone.locator("#panorama").boundingBox();
  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height * 0.45,
  };
  const beforeYaw = Number(
    await phone.locator("#panorama").getAttribute("data-yaw"),
  );
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...center, id: 1 }],
  });
  for (let i = 1; i <= 6; i++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: center.x - i * 15, y: center.y, id: 1 }],
    });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await phone.waitForFunction(
    (y) =>
      Math.abs(Number(document.querySelector("#panorama").dataset.yaw) - y) > 5,
    beforeYaw,
  );
  await phone.locator("#reset-view").tap();
  const beforeFov = Number(
    await phone.locator("#panorama").getAttribute("data-fov"),
  );
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: center.x - 35, y: center.y, id: 1 },
      { x: center.x + 35, y: center.y, id: 2 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: center.x - 80, y: center.y, id: 1 },
      { x: center.x + 80, y: center.y, id: 2 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await phone.waitForFunction(
    (f) => Number(document.querySelector("#panorama").dataset.fov) < f - 5,
    beforeFov,
  );
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...center, id: 1 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await phone.locator("#reset-view").tap();
  await phone.screenshot({
    animations: "disabled",
    path: "artifacts/game-mobile.png",
  });
  await phone.locator("#map-tab").tap();
  let mapBounds = await phone.locator("#guess-map").boundingBox();
  await phone.touchscreen.tap(
    mapBounds.x + mapBounds.width * 0.6,
    mapBounds.y + mapBounds.height * 0.5,
  );
  assert.ok(
    (await phone.locator("#location-status").innerText()).includes("已标记"),
  );
  // Real multi-touch zoom on Leaflet; pan/zoom must not submit a new guess.
  await visibleMap(phone);
  const mapCenter = {
    x: mapBounds.x + mapBounds.width / 2,
    y: mapBounds.y + mapBounds.height / 2,
  };
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: mapCenter.x - 30, y: mapCenter.y, id: 1 },
      { x: mapCenter.x + 30, y: mapCenter.y, id: 2 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: mapCenter.x - 80, y: mapCenter.y, id: 1 },
      { x: mapCenter.x + 80, y: mapCenter.y, id: 2 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await pick(phone, "长安");
  await phone.locator("#era-select").selectOption("bce");
  await phone.locator("#year-number").fill("221");
  assert.equal(await phone.locator("#year-range").inputValue(), "-221");
  await noOverflow(phone);
  await phone.screenshot({
    animations: "disabled",
    path: "artifacts/map-mobile.png",
  });
  await phone.locator("#submit").tap();
  await phone.locator("#next").waitFor();
  await phone.screenshot({
    animations: "disabled",
    path: "artifacts/result-mobile.png",
  });
  await phone.locator("#next").tap();
  await ready(phone);
  assert.equal(await phone.locator("#submit").isDisabled(), true);
  await phone.setViewportSize({ width: 844, height: 390 });
  await phone.locator("#map-tab").tap();
  await pick(phone, "北京");
  await phone.locator('[data-year="1600"]').tap();
  await noOverflow(phone);
  const submitBounds = await phone.locator("#submit").boundingBox();
  assert.ok(
    submitBounds.y + submitBounds.height <= 390,
    "landscape submit below viewport",
  );
  await phone.screenshot({
    animations: "disabled",
    path: "artifacts/landscape-mobile.png",
  });
  await phone.locator("#scene-tab").tap();
  bounds = await phone.locator("#panorama").boundingBox();
  assert.ok(bounds.height > 120);
  await phone.screenshot({
    animations: "disabled",
    path: "artifacts/landscape-scene.png",
  });
  await phone.locator("#submit").tap();
  await phone.locator("#next").waitFor();
  await phone.setViewportSize({ width: 360, height: 740 });
  for (let i = 2; i < 5; i++) {
    await phone.locator("#next").tap();
    await ready(phone);
    await pick(phone, "上海");
    await phone.locator('[data-year="1900"]').tap();
    await noOverflow(phone);
    await phone.locator("#submit").tap();
    await phone.locator("#next").waitFor();
  }
  await phone.locator("#next").tap();
  await phone.locator(".summary-row").first().waitFor();
  assert.equal(await phone.locator(".summary-row").count(), 5);
  await phone.screenshot({
    animations: "disabled",
    path: "artifacts/summary-mobile.png",
    fullPage: true,
  });
  const chinaVisited = await phone.evaluate(
    () => JSON.parse(localStorage.getItem("here-and-then.v1")).visited,
  );
  assert.deepEqual(chinaVisited.sort(), [
    "beijing",
    "changan",
    "dunhuang",
    "kaifeng",
    "shanghai",
  ]);
  results.push(
    "Phone: full 5 China rounds; real single-finger pan, two-finger panorama zoom, touch cancellation, map tap and pinch, BCE input, 360px portrait and landscape controls.",
  );
  await mobile.close();

  const timed = await browser.newContext({
    viewport: { width: 360, height: 740 },
    isMobile: true,
    hasTouch: true,
  });
  await watch(timed);
  const timerPage = await timed.newPage();
  await timerPage.clock.install();
  await timerPage.goto(url);
  await timerPage.locator(".timed-option").click();
  assert.equal(await timerPage.locator("#timed").isChecked(), true);
  await timerPage.locator("#start").click();
  await ready(timerPage);
  await timerPage.clock.fastForward(91000);
  await timerPage.locator("#next").waitFor();
  assert.ok(
    (await timerPage.locator(".result-top").innerText()).includes("时间到"),
  );
  assert.equal(await timerPage.locator(".score-stamp strong").innerText(), "0");
  await timerPage.locator("#next").click();
  await ready(timerPage);
  assert.ok((await timerPage.locator("#timer").innerText()).includes("90"));
  await noOverflow(timerPage);
  results.push(
    "Timed mode: deadline auto-reveals unanswered round as 0; next round receives a fresh timer.",
  );
  await timed.close();

  const recovery = await browser.newContext({
    viewport: { width: 390, height: 740 },
  });
  await watch(recovery);
  const recoveryPage = await recovery.newPage();
  await recoveryPage.goto(url);
  let failed = false;
  await recoveryPage.route("**/assets/*.webp", (route) => {
    if (!failed) {
      failed = true;
      return route.fulfill({ status: 503, body: "Temporarily unavailable" });
    }
    return route.continue();
  });
  await recoveryPage.locator("#start").click();
  await recoveryPage.locator("#retry").waitFor();
  await recoveryPage.locator("#retry").click();
  await ready(recoveryPage);
  await recoveryPage.locator("#map-tab").click();
  await visibleMap(recoveryPage);
  await recoveryPage.locator("#leave").click();
  await recoveryPage.locator("#exit").click();
  await recoveryPage.locator("#start").click();
  await ready(recoveryPage);
  assert.equal(await recoveryPage.locator("#panorama canvas").count(), 1);
  results.push(
    "Recovery: missing panorama presents a retry, recovers the current round, and leaving/restarting creates one viewer.",
  );
  await recovery.close();
  assert.deepEqual(errors, []);
  assert.ok(
    requests.every(
      (request) => new URL(request).origin === new URL(url).origin,
    ),
    "unexpected external runtime dependency",
  );
  await writeFile(
    "artifacts/playtest.json",
    JSON.stringify(
      {
        url,
        results,
        errors,
        externalRequests: [],
        testedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(results.join("\n"));
  console.log("No page errors; all runtime resources are same-origin.");
} finally {
  await browser.close();
}
