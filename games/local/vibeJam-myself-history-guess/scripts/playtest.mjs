import { readScenes } from "./check-catalog.mjs";
import { chromium, devices } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const scenes = readScenes();
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
  assert.match(await page.title(), /此时/);
  await noOverflow(page);
  await page.screenshot({
    animations: "disabled",
    path: "artifacts/home-desktop.png",
    fullPage: true,
  });
  await page.locator(".display-button").click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  await page.getByRole("button", { name: "玩法指南" }).click();
  assert.ok(
    (await page.locator("dialog").innerText()).includes("没有公元 0 年"),
  );
  await page.locator("dialog [data-game-fullscreen]").click();
  await page.waitForFunction(() => !document.fullscreenElement);
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
    (y) => Number(document.querySelector("#panorama").dataset.yaw) === y,
    yaw,
  );
  await page.locator("#hint").click();
  assert.equal(await page.locator("#hint-text").isVisible(), true);
  await pick(page);
  await visibleMap(page);
  await page.locator("#year-number").fill("0");
  assert.equal(await page.locator("#submit").isDisabled(), true);
  await page.locator("#year-number").fill("1420");
  const firstClue = await page.locator("#clue").innerText();
  const beforeDisplay = await page.evaluate(() => localStorage.getItem("here-and-then.v1"));
  await page.locator(".display-button").click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  await page.locator("#game-help").click();
  assert.match(await page.locator("dialog").innerText(), /切到后台继续计时/);
  await page.getByRole("button", { name: "关闭弹窗", exact: true }).click();
  await page.locator(".display-button").click();
  await page.waitForFunction(() => !document.fullscreenElement);
  assert.equal(await page.evaluate(() => localStorage.getItem("here-and-then.v1")), beforeDisplay);
  assert.equal(await page.locator("#year-number").inputValue(), "1420");
  await page.reload();
  await page.locator("#resume").click();
  await ready(page);
  assert.equal(await page.locator("#clue").innerText(), firstClue);
  assert.equal(await page.locator("#year-number").inputValue(), "1420");
  assert.ok((await page.locator("#location-status").innerText()).includes("北京"));
  assert.equal(await page.locator("#submit").isDisabled(), false);
  await page.screenshot({
    animations: "disabled",
    path: "artifacts/game-desktop.png",
  });
  await page.locator("#submit").dblclick();
  await page.locator("#result-overlay").waitFor({ state: "visible" });
  assert.equal(await page.locator(".result-card").count(), 1);
  const firstScore = await page.locator("#total-score").innerText();
  await page.reload();
  await page.locator("#resume").click();
  await page.locator("#next").waitFor();
  assert.equal(await page.locator("#total-score").innerText(), firstScore);
  assert.equal(await page.locator(".reasoning .detail-list li").count(), 3);
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
  assert.match(await page.locator(".summary-best").innerText(), /^本机五幕最佳/);
  assert.match(await page.locator("#again").innerText(), /再赴一场相遇/);
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
  assert.equal(saved.journey, null);
  await page.locator("#again").click();
  await ready(page);
  const newJourney = await page.evaluate(() => JSON.parse(localStorage.getItem("here-and-then.v1")).journey);
  assert.ok(newJourney.deck.every((id) => !saved.visited.includes(id)), "new trip prefers unseen scenes");
  await page.reload();
  await page.locator("#journal").click();
  assert.equal(await page.locator("button.journal-card").count(), 5);
  assert.match(await page.locator("dialog .muted").innerText(), /本机五幕最佳/);
  await page.keyboard.press("Escape");
  results.push(
    "Desktop: 5 rounds, camera drag, hint, invalid year, refresh/continue before and after reveal without duplicate score, clue review, answer map, summary, unseen next deck and persisted journal.",
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
  await phone.reload();
  await phone.locator("#resume").tap();
  await ready(phone);
  assert.equal(await phone.locator("#era-select").inputValue(), "bce");
  assert.equal(await phone.locator("#year-number").inputValue(), "221");
  await phone.locator("#map-tab").tap();
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
  await phone.setViewportSize({ width: 305, height: 740 });
  const fullscreenBounds = await phone.locator(".display-button").boundingBox();
  assert.ok(fullscreenBounds.width >= 44 && fullscreenBounds.height >= 44);
  assert.ok(fullscreenBounds.x >= 0 && fullscreenBounds.x + fullscreenBounds.width <= 305);
  await phone.locator(".display-button").tap();
  await phone.waitForFunction(() => !!document.fullscreenElement);
  await phone.locator(".display-button").tap();
  await phone.waitForFunction(() => !document.fullscreenElement);
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
  assert.equal(chinaVisited.length, 5);
  assert.ok(
    chinaVisited.every((id) =>
      scenes.some((s) => s.id === id && s.region === "china"),
    ),
  );
  results.push(
    "Phone: full 5 China rounds; real single-finger pan, two-finger panorama zoom, touch cancellation, map tap and pinch, BCE input, 305px portrait and landscape controls.",
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
  await timerPage.locator(".display-button").click();
  await timerPage.waitForFunction(() => !!document.fullscreenElement);
  await timerPage.locator("#game-help").click();
  await timerPage.clock.fastForward(30000);
  await timerPage.getByRole("button", { name: "关闭弹窗", exact: true }).click();
  assert.match(await timerPage.locator("#timer").innerText(), /60 秒/);
  await timerPage.reload();
  await timerPage.clock.fastForward(62000);
  await timerPage.locator(".display-button").click();
  await timerPage.waitForFunction(() => !!document.fullscreenElement);
  await timerPage.locator("#resume").click();
  await timerPage.locator("#next").waitFor();
  assert.ok(
    (await timerPage.locator(".result-top").innerText()).includes("时间到"),
  );
  assert.equal(await timerPage.locator(".score-stamp strong").innerText(), "0");
  await timerPage.locator("#next").click();
  await ready(timerPage);
  assert.ok((await timerPage.locator("#timer").innerText()).includes("90"));
  await noOverflow(timerPage);
  await timerPage.locator(".display-button").click();
  await timerPage.waitForFunction(() => !document.fullscreenElement);
  results.push(
    "Timed mode: refreshing and waiting on home does not reset the deadline; resume auto-reveals expired unanswered round as 0, then next round gets a fresh timer.",
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
  for (const unavailable of ["unsupported", "rejected"]) {
    const fallbackContext = await browser.newContext({ viewport: { width: 305, height: 740 }, hasTouch: true });
    await watch(fallbackContext);
    await fallbackContext.addInitScript((mode) => {
      Element.prototype.requestFullscreen = mode === "unsupported" ? undefined : () => Promise.reject(new Error("test denial"));
      Element.prototype.webkitRequestFullscreen = undefined;
    }, unavailable);
    const fallback = await fallbackContext.newPage();
    await fallback.goto(url);
    await noOverflow(fallback);
    await fallback.locator(".display-button").click();
    await fallback.locator("#game-display-notice").waitFor({ state: "visible" });
    assert.match(await fallback.locator("#game-display-notice").innerText(), unavailable === "unsupported" ? /不支持网页全屏/ : /未允许全屏/);
    await fallback.locator("#scene-select").selectOption("yinxu");
    await fallback.locator("#start").click();
    await ready(fallback);
    await fallback.locator("#game-help").click();
    await fallback.getByRole("button", { name: "关闭弹窗", exact: true }).click();
    await pick(fallback, "安阳");
    await fallback.locator("#era-select").selectOption("bce");
    await fallback.locator("#year-number").fill("1200");
    await noOverflow(fallback);
    await fallback.locator("#submit").click();
    await fallback.locator("#next").click();
    assert.match(await fallback.locator(".final-score").innerText(), /5,000/);
    await noOverflow(fallback);
    const summaryControl = await fallback.locator(".display-button").boundingBox();
    assert.ok(summaryControl.width >= 44 && summaryControl.height >= 44);
    await fallbackContext.close();
  }
  results.push("Fullscreen: real desktop Chrome API at home/in-game/dialog and 305px touch emulation; input/save retained, timed help keeps clock running, timeout/next inside fullscreen; unsupported/rejected API simulations remain playable through single-round summary. Physical Android/iOS unverified.");
  const catalogContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await watch(catalogContext);
  const catalogPage = await catalogContext.newPage();
  await catalogPage.goto(url);
  const options = await catalogPage
    .locator("#scene-select option")
    .evaluateAll((nodes) => nodes.map((n) => n.value).filter(Boolean));
  assert.deepEqual(
    options.sort(),
    scenes.map((s) => s.id).sort(),
    "all files automatically appear in the practice picker",
  );
  await catalogPage.getByRole("button", { name: "玩法指南" }).click();
  assert.ok(
    (await catalogPage.locator("dialog").innerText()).includes(
      `${scenes.length} 幕场景`,
    ),
  );
  await catalogPage.keyboard.press("Escape");
  const imageUrls = new Set();
  for (const scene of scenes) {
    await catalogPage.locator("#scene-select").selectOption(scene.id);
    await catalogPage.locator("#start").click();
    await ready(catalogPage);
    assert.equal(
      await catalogPage.locator("#round-label").innerText(),
      "第 1 幕 / 1",
    );
    assert.equal(await catalogPage.locator("#clue").innerText(), scene.clue);
    const asset = await catalogPage
      .locator("#panorama")
      .getAttribute("data-image");
    assert.ok(asset.endsWith(scene.image));
    const dimensions = await catalogPage.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      return [img.naturalWidth, img.naturalHeight];
    }, asset);
    assert.ok(
      dimensions[0] >= 1600 &&
        Math.abs(dimensions[0] / dimensions[1] - 2) < 0.05,
      `panorama dimensions: ${scene.id}`,
    );
    imageUrls.add(asset);
    await catalogPage.locator("#zoom-in").click();
    await catalogPage.locator("#reset-view").click();
    await catalogPage.waitForFunction(
      (view) => {
        const p = document.querySelector("#panorama");
        return (
          Number(p.dataset.yaw) === view.yaw &&
          Number(p.dataset.fov) === view.fov
        );
      },
      { yaw: 180, fov: 75, ...scene.view },
    );
    if (["yinxu", "quanzhou", "angkor", "new-york"].includes(scene.id))
      await catalogPage.screenshot({ path: `artifacts/scene-${scene.id}.png` });
    await pick(catalogPage, scene.location);
    await catalogPage
      .locator("#era-select")
      .selectOption(scene.year < 0 ? "bce" : "ce");
    await catalogPage
      .locator("#year-number")
      .fill(String(Math.abs(scene.year)));
    await catalogPage.locator("#submit").click();
    await catalogPage.locator("#next").waitFor();
    assert.equal(
      await catalogPage.locator("#result-title").innerText(),
      scene.title,
    );
    assert.equal(
      await catalogPage.locator(".score-stamp strong").innerText(),
      "5,000",
    );
    assert.equal(
      await catalogPage.locator(".source-link").getAttribute("href"),
      scene.source[1],
    );
    await noOverflow(catalogPage);
    await catalogPage.locator("#next").click();
    assert.equal(await catalogPage.locator(".summary-row").count(), 1);
    assert.match(await catalogPage.locator(".summary-best").innerText(), /单幕练习不计入五幕纪录 · 本机五幕最佳 0 分/);
    assert.match(await catalogPage.locator("#again").innerText(), /再练这一幕/);
    await noOverflow(catalogPage);
    assert.ok(
      (await catalogPage.locator(".final-score").innerText()).includes(
        "/ 5,000",
      ),
    );
    if (scene === scenes[0]) {
      await catalogPage.locator("#again").click();
      await ready(catalogPage);
      assert.equal(await catalogPage.locator("#round-label").innerText(), "第 1 幕 / 1");
      assert.equal(await catalogPage.locator("#clue").innerText(), scene.clue);
      assert.equal(await catalogPage.locator("#submit").isDisabled(), true);
      await catalogPage.reload();
    } else await catalogPage.locator("#home").click();
  }
  assert.equal(imageUrls.size, scenes.length);
  const practiceSave = await catalogPage.evaluate(() =>
    JSON.parse(localStorage.getItem("here-and-then.v1")),
  );
  assert.equal(practiceSave.visited.length, scenes.length);
  assert.equal(
    practiceSave.best,
    0,
    "practice does not replace the five-round record",
  );
  await catalogPage.reload();
  await catalogPage.locator("#journal").click();
  assert.equal(
    await catalogPage.locator("button.journal-card").count(),
    scenes.length,
  );
  results.push(
    `Catalog: all ${scenes.length} panoramas decoded and played through real selection, perfect scoring, source, one-round summary and persisted journal on mobile; practice leaves five-round record unchanged.`,
  );
  await catalogContext.close();
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
