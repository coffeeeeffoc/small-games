import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { acceptanceBuild, press, snapshot, assertLayout, navigateMap, aimAt } from './flight-browser.mjs';
const base = process.env.NIGHT_URL;
const build = await acceptanceBuild(base);
const out = new URL('../reports/2026-10-26-combat-online/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11'] });
const evidence = { build, cases: [] };
try {
 for (const [width, height] of [[568,320],[844,390],[1366,768],[1280,720]]) {
  const touch = width < 1000;
  const context = await browser.newContext({ viewport: {width,height}, hasTouch: touch, isMobile: touch });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base + '?dev=0'); await page.waitForFunction(() => globalThis.__night?.snapshot().ui.homeArtworkReady); await page.waitForTimeout(600);
  const shot = async name => { await page.screenshot({path: new URL(`${name}-${width}.png`,out).pathname.replace(/^\/([A-Z]:)/,'$1')}); };
  const check = async () => assertLayout(await snapshot(page), width, height);
  await check(); await shot('home');
  await press(page,'online:ranking',touch); await page.waitForFunction(() => __night.snapshot().online.panel === 'ranking' && __night.snapshot().modal.startsWith('online:ranking')); await check(); await shot('ranking-offline');
  await press(page,'online:back',touch); await page.waitForFunction(() => __night.snapshot().modal === 'home'); await press(page,'online:menu',touch); await page.waitForFunction(() => __night.snapshot().modal.startsWith('online:menu')); await check(); await shot('versus-menu');
  await press(page,'online:bot',touch); await page.waitForFunction(() => __night.snapshot().online.active && !__night.snapshot().modal);
  await check(); let state = await snapshot(page);
  assert.equal(state.units.filter(u=>u.friendly).length,8); assert.equal(state.units.filter(u=>!u.friendly).length,8);
  await press(page,'battleReport',touch); await check(); await shot('duel-report');
  const time = (await snapshot(page)).time; await page.waitForTimeout(650); assert((await snapshot(page)).time > time + .4);
  await press(page,'close',touch); await press(page,'settings',touch); await check();
  const pausedTime = (await snapshot(page)).time; await page.waitForTimeout(650); assert((await snapshot(page)).time > pausedTime + .4);
  await press(page,'resume',touch); await press(page,'weapon3',touch);
  state = await snapshot(page); const target = state.units.find(u=>!u.friendly && u.kind==='turret');
  await navigateMap(page,target,touch); await aimAt(page,target,touch);
  if(touch) await press(page,'fire',true); else { await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up(); }
  await page.waitForFunction(() => __night.snapshot().fireZones.length>0, null, {timeout:15000});
  await page.waitForTimeout(700); await check(); await shot('incendiary');
  state = await snapshot(page); assert.equal(state.guns[3].ammo,11); assert(state.effects.fires?.length>0); assert(Number.isFinite(state.recoil.x));
  await press(page,'settings',touch); await press(page,'home',touch); await press(page,'exitConfirm',touch);
  await press(page,'online:back',touch);
  await press(page,'missions',touch); await press(page,'start',touch);
  await page.waitForFunction(() => __night.snapshot().phase === 'playing');
  await page.waitForFunction(() => __night.snapshot().buttons.some(button => button.id === 'battleReport'));
  await press(page,'battleReport',touch); await check(); await shot('campaign-report');
  assert.equal((await snapshot(page)).online.active,false); assert((await snapshot(page)).battleReport);
  assert.deepEqual(errors,[]);
  evidence.cases.push({width,height,errors,fireZones:state.fireZones,ammo:state.guns.map(g=>g.ammo)});
  await context.close();
 }
} finally { await browser.close(); await writeFile(new URL('evidence.json',out),JSON.stringify(evidence,null,2)); }
