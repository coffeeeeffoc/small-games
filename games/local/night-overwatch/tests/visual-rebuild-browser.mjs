import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { acceptanceBuild, snapshot, assertLayout, navigateMap, aimAt, waitForImpact, predictUnit } from './flight-browser.mjs';
import { press, settleVisuals } from './visual-helpers.mjs';

const base = process.env.NIGHT_URL, build = await acceptanceBuild(base);
const out = new URL('../reports/2026-10-28-visual-rebuild/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
  args: ['--autoplay-policy=no-user-gesture-required', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])] });
const evidence = { build, errors: [], checks: [], screens: [], fixtures: 'Offline services. Day/dusk/night review uses saved unlocks only; victory uses fresh progress and real input.' };
let currentPage;
const observe = page => {
  currentPage = page;
  page.on('pageerror', error => evidence.errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !/Failed to load resource: net::ERR_FAILED|404 \(Not Found\)/.test(message.text())) evidence.errors.push(message.text());
  });
  page.on('requestfailed', request => { if (!request.url().includes('/api/competition/')) evidence.errors.push(request.url() + ': ' + request.failure()?.errorText); });
};
const ready = async page => {
  await page.route('**/api/competition/**', route => route.abort());
  await page.goto(base + '?dev=0');
  await page.waitForFunction(() => globalThis.__night?.snapshot().ui.homeArtworkReady && __night.snapshot().buttons.some(b => b.id === 'online:profile'));
  await page.waitForFunction(() => !document.getElementById('night-startup'));
  await page.waitForFunction(() => __night.snapshot().visualMaterialStatus !== 'loading');
  assert.equal((await snapshot(page)).visualMaterialStatus, 'ready', (await snapshot(page)).visualMaterialError);
  await page.waitForTimeout(1000);
};
const capture = async (page, name) => {
  await settleVisuals(page);
  await page.waitForFunction(() => __night.snapshot().visualMaterialStatus !== 'loading');
  const state = await snapshot(page);
  assert.equal(state.visualMaterialStatus, 'ready', state.visualMaterialError);
  assertLayout(state, state.ui.width, state.ui.height);
  await page.screenshot({ path: fileURLToPath(new URL(name + '.png', out)) });
  evidence.screens.push({ name, viewport: page.viewportSize(), light: state.light, modal: state.modal, time: state.time });
};
try {
  // Fresh ordinary progress: a real single-player victory, with no score/state injection.
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: fileURLToPath(out), size: { width: 1280, height: 720 } } });
  const page = await context.newPage(), videoStarted = Date.now(); observe(page); await ready(page);
  evidence.clips = {};
  const mark = name => { evidence.clips[name] = (Date.now() - videoStarted) / 1000; };
  mark('home'); await capture(page, 'home-1280');
  await press(page, 'missions'); await capture(page, 'missions-1280');
  await press(page, 'start'); await page.waitForFunction(() => __night.snapshot().phase === 'playing');
  await press(page, 'weapon2'); mark('gameplay');
  let shots = 0;
  for (let attempt = 0; attempt < 20; attempt++) {
    const state = await snapshot(page); if (!state.threatsRemaining || state.phase !== 'playing') break;
    const enemy = state.units.find(unit => !unit.friendly && unit.hp > 0);
    if (!enemy) { await page.waitForTimeout(300); continue; }
    await navigateMap(page, enemy); await aimAt(page, enemy);
    await page.waitForFunction(() => __night.snapshot().guns[2].cooldown === 0);
    await page.keyboard.press('Space');
    const firing = await snapshot(page), shell = firing.shots.at(-1);
    assert(shell && firing.fired > state.fired, 'Real input launches a projectile');
    if (shots < 3) await capture(page, 'single-fire-' + shots);
    shots++; await waitForImpact(page, shell);
  }
  await page.waitForFunction(() => __night.snapshot().phase === 'success', null, { timeout: 20000 });
  const won = await snapshot(page); mark('soloResult');
  const friendlyLosses = won.units.filter(unit => unit.friendly && unit.hp <= 0).length;
  assert(won.fired > 0 && won.threatsRemaining === 0 && friendlyLosses === 0);
  evidence.solo = { time: won.time, fired: won.fired, kills: won.kills, friendlyLosses, completionTime: won.completionTime };
  for (const [width, height] of [[1280, 720], [844, 390], [568, 320]]) {
    await page.setViewportSize({ width, height }); await capture(page, 'solo-result-' + width);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await press(page, 'home');
  await press(page, 'online:menu'); await capture(page, 'lobby-offline-1280');
  await press(page, 'online:bot'); await page.waitForFunction(() => __night.snapshot().online.active && !__night.snapshot().modal);
  // Local bot practice has no public server settlement and must not invent one.
  await press(page, 'weapon3');
  let state = await snapshot(page), target = state.units.find(unit => !unit.friendly && unit.kind === 'turret' && unit.hp > 0);
  assert(target); await navigateMap(page, target); await aimAt(page, target);
  await page.mouse.down(); await page.waitForTimeout(100); await page.mouse.up();
  await page.waitForFunction(() => __night.snapshot().fireZones.length > 0);
  await capture(page, 'incendiary-fire');
  await press(page, 'weapon2');
  const deadline = Date.now() + 360000;
  while (Date.now() < deadline) {
    state = await snapshot(page); if (state.phase !== 'playing') break;
    target = state.units.filter(unit => !unit.friendly && unit.hp > 0).sort((a,b) => a.hp-b.hp)[0];
    if (!target) { await page.waitForTimeout(300); continue; }
    let lead = target;
    for (let i=0;i<3;i++) lead = predictUnit(state,target,await page.evaluate(p=>__night.flightTime(p,2),lead)+.2);
    await navigateMap(page, lead); await aimAt(page, lead);
    await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up();
  }
  await page.waitForFunction(() => __night.snapshot().modal === 'duelResult', null, { timeout: 10000 });
  state = await snapshot(page); assert.equal(state.phase, 'success');
  assert(!state.online.room?.settlement, 'Offline practice has no invented public score');
  evidence.bot = { time: state.time, phase: state.phase, localPractice: true };
  for (const [width,height] of [[1280,720],[844,390],[568,320]]) {
    await page.setViewportSize({width,height}); await capture(page,'bot-result-'+width);
    assert.equal((await snapshot(page)).time,state.time,'The result screen does not advance simulation');
  }
  await press(page,'online:backLobby');
  await page.waitForFunction(()=>__night.snapshot().online.panel==='menu'&&!__night.snapshot().online.active);
  evidence.checks.push('Fresh solo victory and offline bot victory through real aiming and fire; both result panels at three widths');
  const video=page.video(); await context.close(); await video.saveAs(fileURLToPath(new URL('victory-source.webm',out)));

  for (const [width,height,touch] of [[1280,720,false],[844,390,true],[568,320,true],[390,844,true]]) {
    const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch});
    await context.addInitScript(()=>localStorage.setItem('night-overwatch-progress-v1',JSON.stringify({version:1,cleared:['corridor-01','ambush-02','patrol-03','operation-004','operation-005']})));
    const page=await context.newPage(); observe(page); await ready(page);
    const hit=id=>press(page,id,touch,false);
    await capture(page,'home-'+width+'x'+height);
    await hit('missions'); await capture(page,'mission-cards-'+width+'x'+height);
    await hit('start'); await page.waitForFunction(()=>__night.snapshot().phase==='playing');
    assert.equal((await snapshot(page)).light,'day'); await capture(page,'day-'+width+'x'+height);
    for (const [id,light] of [['operation-004','dusk'],['operation-006','night']]) {
      await hit('settings'); await hit('home'); await hit('exitConfirm'); await hit('missions');
      if (!(await snapshot(page)).buttons.some(b=>b.id==='mission:'+id)) await hit('missionsNext');
      await hit('mission:'+id); await hit('start');
      await page.waitForFunction(()=>__night.snapshot().phase==='playing');
      assert.equal((await snapshot(page)).light,light); await capture(page,light+'-'+width+'x'+height);
    }
    await hit('settings'); await hit('zoomControls'); await hit('sensor'); await hit('close'); await hit('close');
    assert.equal((await snapshot(page)).thermal,true); await capture(page,'thermal-'+width+'x'+height);
    if (height > width) {
      const before = await snapshot(page);
      assert(before.ui.width > before.ui.height && !before.modal && !before.pauses.includes('orientation'));
      await page.waitForTimeout(400);
      assert((await snapshot(page)).time > before.time, 'Portrait fallback continues real gameplay');
    }
    evidence.checks.push({width,height,touch,lighting:true,portraitFallback:height>width}); await context.close();
  }
  assert.deepEqual(evidence.errors,[]); await acceptanceBuild(base);
} catch(error) {
  evidence.failure=error.message;
  if(currentPage&&!currentPage.isClosed()) {evidence.last=await snapshot(currentPage);await currentPage.screenshot({path:fileURLToPath(new URL('failure.png',out))});}
  throw error;
} finally {await browser.close();await writeFile(new URL('review-evidence.json',out),JSON.stringify(evidence,null,2));}
console.log(JSON.stringify(evidence));
