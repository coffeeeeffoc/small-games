import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from 'playwright/test';

const gameRoot = fileURLToPath(new URL('../', import.meta.url));
const dist = resolve(gameRoot, 'dist');
const output = resolve(gameRoot, 'docs/design/home-polish-2026-10-18/actual');
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml' };
const server = createServer(async (request,response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/fixture') {
      response.writeHead(200,{'Content-Type':'text/html'}).end('<iframe src="/?dev=0&pk=obsolete-invite" allow="fullscreen" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>');
      return;
    }
    const path = resolve(dist, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    const suffix = relative(dist,path);
    assert(!suffix.startsWith('..'+sep) && suffix!=='..' && !suffix.startsWith(sep));
    const body=await readFile(path);
    response.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'}).end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({ ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
  ? {executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH} : {}) });
const errors=[], requests=[], checks=[], rewardEvents=[];
await mkdir(output,{recursive:true});
const state=page=>page.evaluate(async()=>(await import('./src/main.js')).getSnapshot());
async function shot(page,name) {
  await page.screenshot({path:resolve(output,name+'.png')});
}
async function setup(page,quick=true) {
  await page.locator('#levels-button').tap();
  if(quick) await page.locator('[data-choice-for="mode-select"][data-value="quick"]').tap();
  await page.locator('#start-button').tap();
  await expect.poll(async()=>(await state(page)).phase).toBe('playing');
}
async function tapActor(page,index,target) {
  const current=await state(page);
  const origin=await page.evaluate(async point=>(await import('./src/main.js')).worldToScreen(point),current.cops[index]);
  await page.touchscreen.tap(origin.x,origin.y);
  const destination=await page.evaluate(async point=>(await import('./src/main.js')).worldToScreen(point),target);
  await page.touchscreen.tap(destination.x,destination.y);
  assert((await state(page)).cops[index].destination,'touch issues a real movement order');
}
async function context(viewport,host=false,started=0) {
  const ctx=await browser.newContext({viewport,isMobile:true,hasTouch:true});
  await ctx.addInitScript(({host,started})=>{
    window.SmallGamesPublishingConfig = { adMode: 'host' };
    try {
      if(!localStorage.getItem('neighborhood-patrol-v1'))
        localStorage.setItem('neighborhood-patrol-v1',JSON.stringify({startedRuns:started}));
    } catch { /* about:blank has no storage origin before navigation. */ }
    if(host) {
      const resume = window.AudioContext.prototype.resume;
      window.AudioContext.prototype.resume = function() {
        window.__audioResumes = (window.__audioResumes || 0) + 1;
        return resume.call(this);
      };
      window.__adFixture={shows:0,close:null,error:null};
      window.tap={createRewardedVideoAd:()=>({
        show:async()=>{window.__adFixture.shows++;},load:async()=>{},
        onClose:fn=>window.__adFixture.close=fn,offClose:fn=>{if(window.__adFixture.close===fn)window.__adFixture.close=null;},
        onError:fn=>window.__adFixture.error=fn,offError:fn=>{if(window.__adFixture.error===fn)window.__adFixture.error=null;},
      })};
      window.SmallGamesPublishingConfig={adMode:'host',rewardedAdUnitId:'fixture-only'};
    }
  },{host,started});
  ctx.on('page',page=>{
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{if(/\/api\/competition|\/rooms|\/runs\/cops/.test(request.url()))requests.push(request.url());});
  });
  return ctx;
}
try {
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => {
      localStorage.setItem('neighborhood-patrol-v1', JSON.stringify({ startedRuns: 5 }));
      window.__configuredAd = { options: null, close: null };
      window.tap = { createRewardedVideoAd: options => {
        window.__configuredAd.options = options;
        return { show: async () => {}, load: async () => {},
          onClose: fn => window.__configuredAd.close = fn,
          offClose: fn => { if (window.__configuredAd.close === fn) window.__configuredAd.close = null; },
          onError() {}, offError() {} };
      } };
    });
    const page = await ctx.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.text().startsWith('[TapTapReward] '))
        rewardEvents.push(JSON.parse(message.text().slice('[TapTapReward] '.length)));
    });
    await page.goto(base); await setup(page);
    assert.equal((await state(page)).support.sprint, 0);
    await page.clock.install();
    await page.locator('#sprint-button').tap();
    await expect.poll(() => page.evaluate(() => window.__configuredAd.options?.adUnitId)).toBe('1054324');
    assert.equal((await state(page)).support.sprint, 0, 'opening the configured ad does not reward');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.fastForward(60000);
    assert.equal(await page.evaluate(() => typeof window.__configuredAd.close), 'function', 'a displayed 60-second native ad must retain its reward callback while backgrounded');
    assert.equal((await state(page)).support.sprint, 0, 'elapsed viewing time alone never grants a reward');
    await page.evaluate(() => window.__configuredAd.close({ isEnded: true }));
    await expect.poll(async () => (await state(page)).support.sprint).toBe(1);
    assert.equal((await state(page)).phase, 'paused', 'completion in background keeps the game paused');
    await expect(page.locator('#support-page')).toHaveCount(0);
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await expect.poll(async () => (await state(page)).phase).toBe('playing');
    assert.equal((await state(page)).support.refilled.sprint, true);
    assert.equal((await state(page)).support.remaining, 0, 'a granted sprint waits for the next player tap');
    checks.push('production platform-config: ad unit 1054324; 60-second background playback retains callback and grants one sprint only on explicit completion');
    await ctx.close();
  }
  for(const viewport of [{width:320,height:740},{width:390,height:844},{width:844,height:390}]) {
    console.log('Touch flow '+viewport.width+'x'+viewport.height);
    const ctx=await context(viewport),page=await ctx.newPage();
    await page.goto(base+'/?dev=0&pk=obsolete-invite',{waitUntil:'domcontentloaded',timeout:30000});
    await expect(page.locator('#home-screen')).toBeVisible();
    await expect(page.locator('#friends-button')).toBeHidden();
    await expect(page.locator('#records-button')).toBeHidden();
    await page.locator('#home-share').tap();
    assert.equal(await page.locator('#share-url').inputValue(), base + '/');
    await page.locator('#share-dialog [data-close]').tap();
    await expect(page.locator('#home-screen')).toBeVisible();
    await shot(page,'home-'+viewport.width);
    await expect(page.locator('[data-game-fullscreen]')).toHaveCount(0);
    await page.locator('#levels-button').tap();
    await expect(page.locator('#starter-support')).toHaveText(/本局赠/);
    await page.locator('[data-choice-for="mode-select"][data-value="quick"]').tap();
    await shot(page,'setup-'+viewport.width);
    await page.locator('#start-button').tap();
    await expect.poll(async()=>(await state(page)).phase).toBe('playing');
    const initial=await state(page);
    const actorPoint=await page.evaluate(async point=>(await import('./src/main.js')).worldToScreen(point),initial.cops[0]);
    const touch=await page.context().newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:actorPoint.x,y:actorPoint.y}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:actorPoint.x+20,y:actorPoint.y+20}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    await touch.detach();
    assert.equal((await state(page)).cops[0].destination,null,'cancelled gesture does not issue a movement order');
    const button=await page.locator('#sprint-button').boundingBox();
    assert(button.height>=44 && button.width>=44,'sprint touch target is at least 44 px');
    assert(button.x>=0 && button.x+button.width<=viewport.width+1,'sprint fits viewport');
    await page.locator('#sprint-button').tap();
    assert.equal((await state(page)).support.sprint,0);
    assert((await state(page)).support.remaining>3.4);
    await shot(page,'sprint-'+viewport.width);
    await page.locator('#pause-button').tap();
    const paused=await state(page); await page.waitForTimeout(450);
    assert.equal((await state(page)).time,paused.time);
    assert.equal((await state(page)).support.remaining,paused.support.remaining);
    assert.equal(await page.locator('#i-pause rect').count(),2);
    await shot(page,'pause-'+viewport.width);
    await page.locator('#pause-dialog [data-share-level]').tap();
    const shared = new URL(await page.locator('#share-url').inputValue());
    assert.equal(shared.searchParams.get('mode'), 'quick');
    assert.equal(shared.searchParams.get('level'), '1');
    assert.equal(shared.searchParams.has('dev'), false);
    assert.equal(shared.searchParams.has('pk'), false);
    await page.locator('#share-dialog [data-close]').tap();
    await expect(page.locator('#pause-dialog')).toBeVisible();
    assert.equal((await state(page)).time, paused.time, 'sharing preserves pause');
    await page.locator('#resume-button').tap();
    await tapActor(page,0,{x:500,y:300}); await tapActor(page,1,{x:500,y:300});
    await expect(page.locator('#win-dialog')).toBeVisible({timeout:12000});
    await expect(page.locator('#record-status')).toHaveText(/辅助通关/);
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('neighborhood-patrol-v1')));
    assert.equal(Object.keys(saved.modeBest).length,0,'assisted run never replaces normal best');
    assert.equal(Object.keys(saved.assistedBest).length,1);
    await shot(page,'win-'+viewport.width);
    await page.locator('#win-dialog [data-share-level]').tap();
    await page.goBack();
    await expect(page.locator('#win-dialog')).toBeVisible();
    await page.locator('#win-dialog [data-home]').tap();
    await page.reload();
    assert.equal((await state(page)).startedRuns,1,'refresh retains the starter counter');
    if(viewport.width===390) {
      for(let ordinal=2;ordinal<=6;ordinal++) {
        await setup(page);
        assert.equal((await state(page)).support.sprint,ordinal<=5?1:0);
        assert.equal((await state(page)).support.rewind,ordinal<=5?1:0);
        await page.locator('#pause-button').tap();
        await page.locator('#pause-restart').tap();
        // Restart starts the next actual run, not another grant in the same run.
        if(ordinal<6) ordinal++;
        assert.equal((await state(page)).startedRuns,Math.min(ordinal,6));
        assert.equal((await state(page)).support.sprint,ordinal<=5?1:0);
        await page.locator('#game-screen [data-home]').tap();
      }
      await page.reload(); await setup(page);
      assert.equal((await state(page)).support.sprint,0);
      await page.locator('#sprint-button').tap();
      await expect(page.locator('#support-page')).toHaveCount(0);
      await expect(page.locator('#board-toast')).toContainText('广告暂不可用');
      assert.equal((await state(page)).support.refilled.sprint,false);
      await expect.poll(async()=>(await state(page)).phase).toBe('playing');
      await page.locator('#pause-button').tap();
      await page.locator('#pause-dialog [data-home]').tap();
      await page.locator('#help-button').tap();
      const before=(await state(page)).startedRuns;
      await page.locator('#practice-button').tap();
      assert.equal((await state(page)).startedRuns,before,'practice does not consume starter eligibility');
      assert.equal((await state(page)).support,undefined);
    }
    checks.push(viewport.width+'x'+viewport.height+': real touch sprint, pause, assisted capture, home/reload and hidden online entry');
    await ctx.close();
  }
  {
    const ctx=await context({width:390,height:844}),page=await ctx.newPage();
    await page.goto(base+'/?dev=0&token=private');
    await page.locator('#home-share').tap();
    await page.locator('#share-dialog [data-close]').tap();
    await setup(page);
    await page.locator('#pause-button').tap();
    await page.locator('#pause-dialog [data-share-level]').tap();
    await page.locator('#share-dialog [data-close]').tap();
    for(let i=0;i<10;i++) {
      await page.goBack();
      if(await page.evaluate(()=>history.state?.patrolShare?.returnState.screen==='home')) break;
    }
    await expect(page.locator('#share-dialog')).toBeVisible();
    assert.equal(await page.locator('#share-url').inputValue(), base+'/');
    await page.locator('#share-dialog [data-close]').tap();
    await expect(page.locator('#home-screen')).toBeVisible();
    checks.push('history: earlier home share restores its own link and home return');
    await ctx.close();
  }
  {
    const ctx=await context({width:390,height:844}),page=await ctx.newPage();
    await page.addInitScript(()=>{
      Storage.prototype.getItem=()=>{throw new Error('storage fixture denied');};
      Storage.prototype.setItem=()=>{throw new Error('storage fixture denied');};
    });
    await page.goto(base); await setup(page);
    await page.locator('#sprint-button').tap();
    assert.equal((await state(page)).support.assisted,true);
    assert.equal((await state(page)).startedRuns,1);
    checks.push('blocked storage: local play and abilities remain usable for the session');
    await ctx.close();
  }
  {
    const ctx=await context({width:390,height:844},false,4);
    const pages=await Promise.all([ctx.newPage(),ctx.newPage()]);
    await Promise.all(pages.map(page=>page.goto(base)));
    for (const page of pages) { await page.bringToFront(); await setup(page); }
    assert.deepEqual((await Promise.all(pages.map(state))).map(snapshot=>snapshot.support.ordinal).sort(),[5,6],
      'stale tabs receive the fifth grant once and no sixth grant');
    for(const page of pages) { await page.bringToFront(); await page.locator('#pause-button').tap(); await page.locator('#pause-dialog [data-home]').tap(); }
    assert.equal(await pages[0].evaluate(()=>JSON.parse(localStorage.getItem('neighborhood-patrol-v1')).startedRuns),6);
    checks.push('same-origin stale tabs: starter count is monotonic and the fifth grant is issued once');
    await ctx.close();
  }
  {
    const ctx=await context({width:844,height:390}),page=await ctx.newPage();
    await page.goto(base);
    await page.evaluate(()=>localStorage.setItem('neighborhood-patrol-v1',JSON.stringify({modeBest:{'quick-cop-1:simultaneous':1.9}})));
    await page.reload(); await setup(page);
    await tapActor(page,0,{x:500,y:300}); await tapActor(page,1,{x:500,y:300});
    await expect(page.locator('#win-dialog')).toBeVisible({timeout:20000});
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('neighborhood-patrol-v1')).modeBest['quick-cop-1:simultaneous:street-solo-v2']),1.9);
    checks.push('legacy personal best survives a slower normal win');
    await ctx.close();
  }
  // A real timeout supplies the failure state; no test injects a victory or loss.
  {
    const ctx=await context({width:390,height:844},true),page=await ctx.newPage();
    await page.goto(base); await setup(page);
    await expect(page.locator('#lose-dialog')).toBeVisible({timeout:60000});
    const failed=await state(page); await shot(page,'failure-390');
    await page.locator('#rewind-button').tap();
    await expect.poll(async()=>(await state(page)).phase).toBe('playing');
    const rewound=await state(page);
    assert(failed.time-rewound.time>=4.7 && failed.time-rewound.time<=5.3);
    assert.equal(rewound.support.rewind,0);
    await shot(page,'rewind-390');
    await expect(page.locator('#lose-dialog')).toBeVisible({timeout:20000});
    await page.locator('#rewind-button').tap();
    await expect.poll(()=>page.evaluate(()=>window.__adFixture.shows)).toBe(1);
    const frozen=await state(page); await page.waitForTimeout(500);
    assert.equal((await state(page)).time,frozen.time);
    for (const selector of ['#lose-retry', '#lose-review', '#lose-dialog [data-levels]', '#lose-dialog [data-home]']) {
      await page.locator(selector).tap();
      const pending = await state(page);
      assert.equal(pending.screen, frozen.screen, 'loading ad blocks failure-page navigation');
      assert.equal(pending.phase, frozen.phase, 'loading ad blocks retry/review');
      assert.equal(pending.startedRuns, frozen.startedRuns);
      assert.equal(pending.support.busy, true);
    }
    await page.evaluate(()=>window.__adFixture.close({isEnded:true}));
    await expect.poll(async () => (await state(page)).support.rewind).toBe(1);
    await expect(page.locator('#lose-dialog')).toBeVisible();
    await expect(page.locator('#support-page')).toHaveCount(0);
    await shot(page,'rewind-ad-ready-390');
    await page.locator('#rewind-button').tap();
    assert.equal((await state(page)).support.refilled.rewind,true);
    assert.equal((await state(page)).support.rewind,0);
    await expect(page.locator('#lose-dialog')).toBeVisible({timeout:20000});
    await expect(page.locator('#rewind-button')).toBeDisabled();
    checks.push('real timeout: free 5-second rewind, direct ad refill to stored charge, frozen failure and per-run cap');
    await ctx.close();
  }
  for(const outcome of ['completed','dismissed','failed','cached-page']) {
    const ctx=await context({width:844,height:390},true,5),page=await ctx.newPage();
    await page.goto(base); await setup(page);
    assert.equal((await state(page)).support.sprint,0);
    await page.locator('#sprint-button').tap();
    await expect.poll(()=>page.evaluate(()=>window.__adFixture.shows)).toBe(1);
    await expect(page.locator('#support-page')).toHaveCount(0);
    const paused=await state(page); await page.waitForTimeout(450);
    assert.equal((await state(page)).time,paused.time);
    assert.equal((await state(page)).phase,'paused');
    await page.goBack();
    assert.equal((await state(page)).screen,'game');
    await page.evaluate(()=>document.getElementById('resume-button').click());
    assert.equal((await state(page)).phase,'paused','back navigation and resume cannot bypass an active ad');
    const resumes = await page.evaluate(()=>window.__audioResumes || 0);
    await page.evaluate(outcome=>{
      Object.defineProperty(document,'hidden',{configurable:true,value:true});
      document.dispatchEvent(new Event('visibilitychange'));
      if(outcome==='cached-page') window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
    },outcome);
    assert.equal(await page.evaluate(()=>typeof window.__adFixture.close),'function');
    const completed=['completed','cached-page'].includes(outcome);
    await page.evaluate(({outcome,completed})=>{
      if(outcome==='failed')window.__adFixture.error();
      else window.__adFixture.close({isEnded:completed});
    },{outcome,completed});
    await expect.poll(async()=>(await state(page)).support.busy).toBe(false);
    assert.equal(await page.evaluate(()=>window.__audioResumes || 0),resumes,'background completion keeps audio suspended');
    assert.equal((await state(page)).support.sprint,completed?1:0);
    assert.equal((await state(page)).support.refilled.sprint,completed);
    assert.equal((await state(page)).time,paused.time,'background completion keeps simulation frozen');
    await page.evaluate(outcome=>{
      delete document.hidden;
      if(outcome==='cached-page') window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
      else document.dispatchEvent(new Event('visibilitychange'));
    },outcome);
    await expect.poll(async()=>(await state(page)).phase).toBe('playing');
    await shot(page,'ad-'+outcome+'-844');
    await expect.poll(()=>page.evaluate(()=>window.__audioResumes || 0)).toBeGreaterThan(resumes);
    if(completed) {
      assert.equal((await state(page)).support.remaining,0,'earned sprint is not consumed automatically');
      await page.locator('#sprint-button').tap();
      assert.equal((await state(page)).support.sprint,0);
      assert((await state(page)).support.remaining>3.6);
    }
    checks.push('simulated TapTap SDK '+outcome+': no support page, hide/show preserves callback, only completed rewards, player tap consumes sprint');
    await ctx.close();
  }
  {
    const ctx=await context({width:390,height:844}),page=await ctx.newPage();
    await page.goto(base+'/fixture');
    const frame=page.frames().find(frame=>frame.url().includes('obsolete-invite'));
    assert(frame);
    await expect(frame.locator('#home-screen')).toBeVisible();
    await frame.locator('#levels-button').tap();
    await frame.locator('#start-button').tap();
    await expect(frame.locator('#sprint-button')).toBeVisible();
    await frame.locator('#sprint-button').tap();
    assert.equal((await state(frame)).support.assisted,true);
    checks.push('iframe: normal home/start and touch support; obsolete invite cannot open PK');
    await ctx.close();
  }
  assert.deepEqual(requests,[],'offline edition never requests online competition services');
  assert.deepEqual(errors,[]);
  await writeFile(resolve(output,'verification.json'),JSON.stringify({
    date:new Date().toISOString(),environment:'desktop Chrome with mobile touch emulation',
    sdk:'explicit simulated TapTap callback fixture; no real ad playback',checks,errors,onlineRequests:requests,rewardEvents,
  },null,2)+'\n');
  console.log(checks.join('\n'));
} finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
