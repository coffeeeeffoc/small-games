import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL??'chrome',headless:true});
const context = await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});
const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
const cdp=await context.newCDPSession(page);
const snapshot=()=>page.evaluate(()=>window.__acroSnapshot);
async function wait(ms:number){const t=(await snapshot()).time;await page.waitForFunction(t=>window.__acroSnapshot.time>=t,t+ms);}
const point=async(selector:string)=>{const r=await page.locator(selector).boundingBox();assert.ok(r);return{x:r.x+r.width/2,y:r.y+r.height/2,id:1};};
try{
 await mkdir('test-results',{recursive:true});await page.goto(process.env.GAME_URL??'http://localhost:4318/');await page.locator('#start').tap();await wait(700);
 for(const selector of ['#left','#right','#power','#release-left','#release-right','.portrait']){const r=await page.locator(selector).first().boundingBox();assert.ok(r);assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=846&&r.y+r.height<=392,`${selector} fits landscape`);}
 await page.locator('[data-who="2"]').tap();assert.equal((await snapshot()).selected,2);
 const p=await point('#power');await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await wait(450);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...p,x:p.x+55,y:p.y-100}]});await wait(220);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal((await snapshot()).actions.length,1);assert.equal((await snapshot()).charge,null);
 await wait(120);
 await page.screenshot({path:'test-results/touch-landscape.png'});
 await page.locator('#retry').tap();await wait(600);await page.locator('[data-who="2"]').tap();
 const right={...await point('#right'),id:2},power={...await point('#power'),id:3};
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[right]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[right,power]});await wait(230);assert.ok((await snapshot()).charge,'touch charge is active before cancellation');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert.equal((await snapshot()).charge,null);assert.equal((await snapshot()).actions.length,0);
 await page.locator('#fullscreen').tap();await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>!!document.fullscreenElement),true);
 await page.locator('#fullscreen').tap();await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>!!document.fullscreenElement),false);
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(350);
 for(const selector of ['#left','#right','#power','#release-left','#release-right','.portrait']){const r=await page.locator(selector).first().boundingBox();assert.ok(r);assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=392&&r.y+r.height<=846,`${selector} fits portrait`);}
 await page.screenshot({path:'test-results/touch-portrait.png'});
 assert.deepEqual(errors,[]);await writeFile('test-results/touch-report.json',JSON.stringify({errors,checks:['landscape controls','touch selection','drag outside + release exactly once','multi-touch cancellation','real fullscreen entry/exit','portrait controls']},null,2));
 console.log('Touch / cancellation / fullscreen / 390px portrait checks passed.');
}catch(error){await page.screenshot({path:'test-results/touch-failure.png'});throw error;}finally{await browser.close();}
