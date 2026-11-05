import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { assetFixture } from './progression-fixture.ts';
import { acceptanceBuild, snapshot, press, settleVisuals, assertLayout } from './flight-browser.mjs';

const base = process.env.NIGHT_URL, build = await acceptanceBuild(base);
const out = process.env.NIGHT_REPORT_DIR || fileURLToPath(new URL('../reports/control-layout/', import.meta.url));
await mkdir(out, { recursive: true });
const evidence = { build, fixture: true, environment: 'Chromium mouse/touch; QA equipment and SDK availability fixture; no ads shown or production assets modified', checks: [], screens: [], errors: [] };
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11'], ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
const row = s => s.buttons.filter(b => ['weapon4', 'skillUse', 'weapon5'].includes(b.id));
const geometry = s => s.buttons.filter(b => /^weapon[0-5]$/.test(b.id) || ['homing','skillUse'].includes(b.id)).map(({ id, x, y, w, h }) => ({ id, x, y, w, h }));
const overlaps = (a,b) => a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
try {
  for (const [width, height] of [[568, 320], [844, 390], [1280, 720]]) for (const weapon of ['drone', 'laser', ...(width===844?['only-emp']:[])]) {
    const touch = width < 1000, assets = assetFixture();
    assets.loadouts.solo = { mods: [], weapon: weapon==='only-emp'?null:weapon + '-match', skill: 'emp-permanent' };
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
    await context.addInitScript(() => {
      globalThis.SmallGamesPublishingConfig={adsEnabled:true,adMode:'host',platform:'taptap-h5',adUnitId:'browser-fixture-slot'};
      globalThis.__layoutAdShows=0;
      // Raw Creator previews omit the channel reward bridge; this fixture tests its available layout only.
      globalThis.SmallGamesRewardAds={available:true,offer:async()=>{globalThis.__layoutAdShows++;throw Error('No ads expected in layout checks');}};
      globalThis.tap={createRewardedVideoAd:()=>({onClose(){},offClose(){},onError(){},offError(){},load:async()=>{},show:async()=>{globalThis.__layoutAdShows++;throw Error('No ads expected in layout checks');},destroy(){}})};
      localStorage.setItem('night-overwatch-coach-v2', 'done'); localStorage.setItem('night-overwatch-view', 'enhanced');
      for(const key of ['night-overwatch-support-position-v1','night-overwatch-control-positions-v2','night-overwatch-control-positions-v3'])
        localStorage.setItem(key,JSON.stringify({x:.5,y:1,weapon4:{x:.5,y:.4},skillUse:{x:.6,y:.4},weapon5:{x:.7,y:.4}}));
    });
    const page = await context.newPage(); page.setDefaultTimeout(60000); page.on('pageerror', e => evidence.errors.push(e.message));
    await page.route('**/game-bootstrap.js', route => route.fulfill({ contentType: 'text/javascript', body: `const assets=${JSON.stringify(assets)},metadata={identity:{playerId:assets.playerId,nickname:'布局测试'},capabilities:{multiplayer:false,leaderboards:false}};globalThis.SmallGamesServices={ready:Promise.resolve(metadata),refresh:async()=>metadata,services:{nightAssets:async()=>structuredClone(assets)},createRecorder:()=>({start:async()=>null,record(){},finish:async()=>null,invalidate(){}})};` }));
    await page.route('**/api/competition/**', route => route.abort());
    const click = async id => { await press(page, id, touch, false); await settleVisuals(page); };
    const ready = async () => { await page.waitForFunction(() => globalThis.__night?.snapshot().ui.homeArtworkReady && __night.snapshot().progression.assets && !document.getElementById('night-startup')); await settleVisuals(page); };
    const start = async () => { await click('qm:modes'); await click('mode:solo'); await click('mode:enter'); await click('training'); await click('start'); await page.waitForFunction(() => __night.snapshot().phase === 'playing' && !__night.snapshot().modal); await settleVisuals(page); };
    const capture = async name => { const s = await snapshot(page); assertLayout(s, s.ui.width, s.ui.height); const file = `${weapon}-${name}-${width}.png`; await page.screenshot({ path: `${out}/${file}` }); evidence.screens.push(file); return s; };
    const cdp = touch ? await context.newCDPSession(page) : undefined;
    const point = b => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
    const drag = async (id, dx, dy, cancel = false) => {
      const s = await snapshot(page), p = point(s.buttons.find(b => b.id === id)), target = { x: p.x + dx, y: p.y + dy };
      if (touch) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, id: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...target, id: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
      } else {
        await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(target.x, target.y, { steps: 8 });
        if (cancel) { await page.keyboard.press('Escape'); await page.mouse.up(); await settleVisuals(page); await click('resume'); }
        else await page.mouse.up();
      }
      await settleVisuals(page);
    };
    await page.goto(base + '?dev=0'); await ready(); assert.equal((await snapshot(page)).viewMode, 'night'); await start();
    const initial = await capture('default'), buttons = row(initial);
    assert(initial.buttons.some(b=>b.id==='homing'),'the complete bottom row includes tracking');
    const regular=geometry(initial).filter(b=>/^weapon[0-3]$/.test(b.id)||b.id==='homing').sort((a,b)=>a.x-b.x),support=[...buttons].sort((a,b)=>a.x-b.x),fire=initial.buttons.find(b=>b.id==='fire');
    assert.equal(buttons.length,weapon==='only-emp'?1:2);assert(buttons.every(b => b.h >= 44&&b.y===regular[0].y));
    assert.equal(support[0].x,regular.at(-1).x+regular.at(-1).w+8,'support follows the last visible normal weapon without empty slots');
    assert(geometry(initial).every(b=>geometry(initial).every(other=>other.id===b.id||!overlaps(b,other))&&(!fire||!overlaps(b,fire))));
    const telemetry=await page.evaluate(async()=>{const {director,Label,UITransform}=await System.import('cc'),s=__night.snapshot(),l=director.getScene().getComponentsInChildren(Label).find(l=>l.node.activeInHierarchy&&l.string.includes('弹着\n热量'));const p=l.node.worldPosition,size=l.node.getComponent(UITransform).contentSize;return{x:p.x-size.width/2,y:s.ui.height-p.y-size.height/2,w:size.width,h:size.height};});
    assert(geometry(initial).every(b=>!overlaps(b,telemetry)));
    assert(row(initial).find(b => b.id === 'skillUse').text.startsWith('电磁干扰\n'));
    await drag('skillUse',-35,-75); let s = await capture('moved'); const moved = geometry(s);
    assert.notDeepEqual(moved, geometry(initial)); assert.equal(s.skill.remaining, 0); assert.equal(s.fired, initial.fired); assert.equal(s.selected, initial.selected);
    assert.deepEqual(moved.filter(b=>b.id!=='skillUse'),geometry(initial).filter(b=>b.id!=='skillUse'),'drag moves only one button');
    await drag('skillUse',-35,-15,true); s = await snapshot(page); assert.deepEqual(geometry(s), moved); assert.equal(s.skill.remaining, 0);
    await click('skillUse'); assert((await snapshot(page)).skill.remaining > 0); await drag('skillUse',-25,10); s = await capture('active-moved');
    assert(s.skill.remaining > 0);
    await click('weapon2');assert.equal((await snapshot(page)).selected,2,'a normal weapon still selects on tap');
    const initialHeavy=initial.buttons.find(b=>b.id==='weapon2');
    if(weapon==='drone')for(const [x,y]of [[0,.5],[1,.5],[.5,0],[initialHeavy.x/(width-initialHeavy.w),1]]){
      const before=await snapshot(page),b=before.buttons.find(b=>b.id==='weapon2');
      await drag('weapon2',(width-b.w)*x-b.x,(height-b.h)*y-b.y);s=await snapshot(page);const after=s.buttons.find(b=>b.id==='weapon2');
      assert(Math.abs(after.x-(width-after.w)*x)<1&&Math.abs(after.y-(height-after.h)*y)<1,'all four safe edges remain reachable');
      assert.deepEqual(geometry(s).filter(b=>b.id!=='weapon2'),geometry(before).filter(b=>b.id!=='weapon2'));assert.equal(s.fired,initial.fired);
    }
    if(weapon==='drone'){
      // Keep the resize fixture away from the bottom row; custom buttons may overlap each other.
      const heavy=(await snapshot(page)).buttons.find(b=>b.id==='weapon2');
      await drag('weapon2',-heavy.x,(height-heavy.h)/2-heavy.y);
    }
    await capture('independent-edge');const saved=geometry(await snapshot(page));
    await click('settings');await click('resume');assert.deepEqual(geometry(await snapshot(page)),saved,'settings resume keeps this match layout');
    await page.setViewportSize({ width: width === 568 ? 844 : 568, height: width === 568 ? 390 : 320 }); await settleVisuals(page);
    s = await capture('resized'); assert(row(s).every(b => b.x >= 0 && b.x + b.w <= s.ui.width && b.y >= 0 && b.y + b.h <= s.ui.height));
    assert.deepEqual(s.held, []);await page.setViewportSize({width,height});await settleVisuals(page);
    if(weapon==='only-emp'){
      await click('settings');await click('home');await click('exitConfirm');await start();assert.deepEqual(geometry(await snapshot(page)),geometry(initial),'starting another match restores defaults');
    }
    assert.equal(await page.evaluate(()=>globalThis.__layoutAdShows),0);
    await page.reload();await ready();assert.equal((await snapshot(page)).viewMode,'night');await start();assert.deepEqual(geometry(await snapshot(page)),geometry(initial),'reload discards temporary layout and ignores old storage');
    evidence.checks.push({ width, height, weapon, touch, independentDrag:true,defaultBottomRow:true,edges:weapon==='drone',cancelled:true,disabledDrag:true,reloadResets:true,newMatchResets:weapon==='only-emp',settingsPreserve:true,resize:true });
    await context.close();
  }
  assert.deepEqual(evidence.errors, []); await acceptanceBuild(base);
  await writeFile(`${out}/evidence.json`, JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence, null, 2));
} finally { await browser.close(); }
