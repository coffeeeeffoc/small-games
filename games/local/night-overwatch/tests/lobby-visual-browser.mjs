import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { acceptanceBuild, snapshot, assertLayout } from './flight-browser.mjs';
import { press, settleVisuals } from './visual-helpers.mjs';

const base = process.env.NIGHT_URL, build = await acceptanceBuild(base);
const apiUrl = process.env.NIGHT_LOBBY_URL;
assert(apiUrl && ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(apiUrl).hostname), 'Use an isolated local room service');
const out = new URL('../reports/2026-10-28-visual-rebuild/lobby/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
  args: process.platform === 'win32' ? ['--use-angle=d3d11'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const evidence = { build, backend: 'Isolated in-memory storage with production HTTP routes; no production accounts, database or matches', checks: [], errors: [] };
try {
  for (const [width,height] of [[568,320],[844,390],[1280,720]]) {
    const touch=width<1000, context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch});
    const page=await context.newPage(); page.on('pageerror',error=>evidence.errors.push(error.message));
    await page.route('**/game-service-config.js',route=>route.fulfill({status:200,contentType:'text/javascript',body:
      'globalThis.__COMPETITION_CONFIG__ = Object.freeze('+JSON.stringify({game:'night-overwatch',platform:'h5',competitionEnabled:true,apiUrl})+');'}));
    await page.goto(base+'?dev=0');
    await page.waitForFunction(()=>globalThis.__night?.snapshot().ui.homeArtworkReady && __night.snapshot().ui.interfaceArtworkReady&&__night.snapshot().online.identity.playerId);
    await page.waitForFunction(() => !document.getElementById('night-startup'));
    await page.waitForTimeout(800);
    const hit=id=>press(page,id,touch,false);
    const capture=async name=>{await settleVisuals(page);assertLayout(await snapshot(page),width,height);
      await page.screenshot({path:fileURLToPath(new URL(name+'-'+width+'.png',out))});};
    await hit('online:menu'); await page.waitForFunction(()=>__night.snapshot().online.rooms.length>=4);
    let state=await snapshot(page);
    assert(state.online.rooms.some(room=>room.canJoin));
    await capture('populated-lobby');
    const roomButtons = state => state.buttons.filter(b => /^online:(joinCode|watchCode):/.test(b.id)).map(b => b.id);
    const firstPage = roomButtons(state);
    await hit('online:roomNext'); await capture('lobby-next-page');
    assert.notDeepEqual(roomButtons(await snapshot(page)), firstPage, 'Next shows different actual rooms');
    await hit('online:roomPrev'); assert.deepEqual(roomButtons(await snapshot(page)), firstPage);
    state=await snapshot(page);
    const join=state.buttons.find(button=>button.id.startsWith('online:joinCode:'));assert(join);
    const roomCode=join.id.split(':').at(-1);await hit(join.id);
    await page.waitForFunction(code=>__night.snapshot().online.room?.code===code,roomCode);
    assert.equal((await snapshot(page)).online.room.players.length,2);
    await capture('joined-waiting-room');
    const left = page.waitForResponse(response => response.url().endsWith('/rooms/' + roomCode + '/leave') && response.ok());
    await hit('online:backLobby');
    assert.equal((await (await left).json()).status, 'abandoned', 'Leaving a waiting room closes it under the existing server contract');
    await page.waitForFunction(()=>!__night.snapshot().online.room&&__night.snapshot().online.panel==='menu');
    await hit('online:roomsRefresh');
    await page.waitForFunction(code => !__night.snapshot().online.rooms.some(room => room.code === code), roomCode);
    evidence.checks.push({width,height,roomCode,realHttpList:true,pagination:true,joined:true,left:true});
    await context.close();
  }
  assert.deepEqual(evidence.errors,[]);
} finally {await browser.close();await writeFile(new URL('lobby-evidence.json',out),JSON.stringify(evidence,null,2));}
console.log(JSON.stringify(evidence));
