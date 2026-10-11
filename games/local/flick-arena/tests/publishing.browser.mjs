import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { createMatch, chooseBot, seeded } from '../src/core.mjs';
import { layouts } from '../src/layouts.mjs';
import { W, H, arena } from '../src/render.mjs';
const server = spawn(process.execPath, ['server.mjs', '--dist', '--port', '4537'], { cwd: new URL('../', import.meta.url), stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/usr/bin/chromium' });
const output = new URL('../docs/design/publishing-2026-10-11/', import.meta.url);
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { window.SmallGamesPublishingConfig = { publicUrl: 'https://games.example/flick-arena/' }; window.__shares = []; navigator.share = async (request) => { window.__shares.push(request); }; });
  await page.clock.install({ time: new Date('2026-10-11T04:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-11T04:00:01Z'));
  await page.goto('http://127.0.0.1:4537/?seed=3&layout=chain&targetShots=8&dev=0&token=private');
  await expect(page.getByRole('button', { name: '接受同擂台挑战' })).toBeVisible();
  await page.screenshot({ path: fileURLToPath(new URL('actual-invite-390x844.png', output)) });
  await page.locator('#start').tap(); await page.clock.runFor(1400);
  const canvas = page.locator('#game');
  assert.equal(await canvas.getAttribute('data-seed'), '3');
  assert.equal(await canvas.getAttribute('data-target-shots'), '8');
  const initial = await canvas.getAttribute('data-discs');
  const cdp = await page.context().newCDPSession(page);
  const map = ([x,y]) => canvas.evaluate((c,{x,y,W,H}) => { const b=c.getBoundingClientRect(),s=Math.min(b.width/W,b.height/H);return {x:b.x+(b.width-W*s)/2+x*s,y:b.y+(b.height-H*s)/2+y*s,id:1}; },{x,y,W,H});
  const gesture = async (from,to,cancel=false) => {
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[await map(from)]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[await map(to)]});
    await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
  };
  const originalDisc=JSON.parse(initial)[0], start=[arena.x+originalDisc.x*arena.scale,arena.y+originalDisc.y*arena.scale];
  await gesture(start,[start[0],start[1]+80],true);
  assert.equal(await canvas.getAttribute('data-shots'),'0');
  await page.screenshot({ path: fileURLToPath(new URL('actual-play-390x844.png', output)) });
  for(let iteration=0;iteration<40 && await page.locator('body').getAttribute('data-phase')!=='result';iteration++) {
    if(await canvas.getAttribute('data-active')==='0' && await canvas.getAttribute('data-physics-phase')==='aim') {
      const state=createMatch(layouts.find(layout=>layout.id==='chain'),3);
      state.discs=JSON.parse(await canvas.getAttribute('data-discs')).map(d=>({...d,vx:0,vy:0,fall:d.alive?0:1}));
      state.turn=Number(await canvas.getAttribute('data-turn'));state.shots=Number(await canvas.getAttribute('data-shots'));state.playerShots=Number(await canvas.getAttribute('data-player-shots'));state.radius=Number(await canvas.getAttribute('data-radius'));
      const move=chooseBot(state,seeded(state.playerShots+18)), disc=state.discs[0], point=[arena.x+disc.x*arena.scale,arena.y+disc.y*arena.scale];
      await gesture(point,[point[0]-move.x*move.power*115,point[1]-move.y*move.power*115]);
    }
    await page.clock.runFor(5500);
  }
  await expect(page.locator('body')).toHaveAttribute('data-phase','result');
  await page.locator('#share').tap();
  const shared=await page.evaluate(()=>window.__shares[0]),url=new URL(shared.url);
  assert.equal(url.origin,'https://games.example');
  assert.equal(url.searchParams.get('seed'),'3');assert.equal(url.searchParams.get('layout'),'chain');
  assert.equal(url.searchParams.get('targetShots'),'4','A real touch win carries its actual four-shot score');
  assert.equal(url.searchParams.has('dev'),false);assert.equal(url.searchParams.has('token'),false);
  await page.screenshot({ path: fileURLToPath(new URL('actual-result-390x844.png', output)) });
  await page.setViewportSize({width:320,height:568});
  for(const button of await page.locator('#controls button').all()){const box=await button.boundingBox();assert(box.height>=43.9);}
  await page.screenshot({ path: fileURLToPath(new URL('actual-result-320x568.png', output)) });
  await page.locator('#rematch').tap();await page.clock.runFor(1400);
  assert.equal(await canvas.getAttribute('data-seed'),'3');assert.equal(await canvas.getAttribute('data-discs'),initial);
  assert.equal(await canvas.getAttribute('data-target-shots'),'8');
  assert.deepEqual(errors,[]);
  await writeFile(new URL('publishing-browser.json',output),JSON.stringify({status:'passed',environment:'Chromium desktop mobile simulation; actual CDP touch; not physical hardware',checks:['received seed/layout/target invitation','cancelled touch','four-shot real touch win','safe score-carrying share','same-seed rematch','390×844 / 320×568 screenshots and 44px controls'],errors},null,2));
  console.log('flick-arena publishing: 6 checks passed');
} finally { await browser.close();server.kill(); }
