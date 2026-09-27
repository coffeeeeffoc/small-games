import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
if(!process.env.PLAYWRIGHT_PATH) throw new Error('Set PLAYWRIGHT_PATH to an installed Playwright module');
const {chromium}=require(process.env.PLAYWRIGHT_PATH);
const browser=await chromium.launch({headless:true,channel:'chrome'});
const report={browser:'本机 Chrome，Playwright 指针输入，受控浏览器时钟；没有改写游戏状态',desktop:[],mobile:[],errors:[]};
async function prepare(viewport,touch=false){const context=await browser.newContext({viewport,deviceScaleFactor:1,hasTouch:touch,isMobile:touch});const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.clock.install();await page.goto('http://127.0.0.1:4401/');await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now()+100)));const cdp=touch?await context.newCDPSession(page):null;return {page,context,cdp};}
const phase=p=>p.locator('#flight').getAttribute('data-phase');
async function point(page,selector){const b=await page.locator(selector).boundingBox();assert(b,selector+' missing');return {x:b.x+b.width/2,y:b.y+b.height/2};}
async function click(page,selector){await page.locator(selector).evaluate(el=>el.scrollIntoView({block:'nearest'}));await page.clock.runFor(16);const p=await point(page,selector);await page.mouse.click(p.x,p.y);await page.clock.runFor(32);}
async function advanceTo(page,seconds){const t=+(await page.locator('#flight').getAttribute('data-tick'))/120;if(seconds>t)await page.clock.runFor(Math.ceil((seconds-t)*1000));}
async function hold(page,side,duration,cdp){const p=await point(page,'#'+side+'-valve');if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});else {await page.mouse.move(p.x,p.y);await page.mouse.down();}assert.equal(await page.locator('#'+side+'-valve').getAttribute('aria-pressed'),'true');await page.clock.runFor(duration*1000);if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();}
async function play(page,start,duration,unit,cdp){await click(page,'#launch');await advanceTo(page,start);for(let i=0;i<duration/unit;i++)await hold(page,i%2?'right':'left',unit,cdp);for(let i=0;i<65&&await phase(page)==='flying';i++)await page.clock.runFor(1000);return {phase:await phase(page),tick:+(await page.locator('#flight').getAttribute('data-tick')),result:await page.locator('#result-text').textContent()};}
try{
const desktop=await prepare({width:1280,height:800});let page=desktop.page;
// Drag a real inventory balloon to the real furniture ring, then demonstrate an actual underpowered failure.
const source=await point(page,'#supply'),box=await page.locator('#scene').boundingBox();await page.mouse.move(source.x,source.y);await page.mouse.down();await page.mouse.move(box.x+98/760*box.width,box.y+459/620*box.height,{steps:12});await page.mouse.up();assert.equal(await page.locator('#left-count').textContent(),'1');await click(page,'#launch');await page.clock.runFor(6200);assert.equal(await phase(page),'lost');report.desktop.push({flow:'拖拽绑一只→浮力不足→失败',result:await page.locator('#result-text').textContent()});
await click(page,'#again');assert.equal(await page.locator('#left-count').textContent(),'1');await click(page,'#clear');for(const side of ['left','left','right','right'])await click(page,`[data-side="${side}"]`);
const sofa=await play(page,6,15,1);assert.equal(sofa.phase,'won');report.desktop.push({level:'沙发',...sofa});
await click(page,'#next');const fridge=await play(page,18,16,1);assert.equal(fridge.phase,'won');report.desktop.push({level:'冰箱',...fridge});
await click(page,'#next');await click(page,'#launch');await advanceTo(page,18);await page.screenshot({path:'docs/playtest-desktop.png',fullPage:true});for(let i=0;i<24;i++)await hold(page,i%2?'right':'left',.5);for(let i=0;i<60&&await phase(page)==='flying';i++)await page.clock.runFor(1000);assert.equal(await phase(page),'won');report.desktop.push({level:'钢琴',phase:await phase(page),result:await page.locator('#result-text').textContent()});await page.screenshot({path:'docs/playtest-win.png',fullPage:true});
await click(page,'#again');await click(page,'[data-rope="left"]');assert.equal(await page.locator('[data-rope="left"]').textContent(),'长绳');await click(page,'#mute');assert.equal(await page.locator('#mute').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('body').getAttribute('data-audio'),'ready');report.desktop.push({flow:'长短绳切换、Web Audio 初始化、静音按钮通过'});
assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'desktop horizontal overflow');
await desktop.context.close();
const mobile=await prepare({width:390,height:844},true);page=mobile.page;
for(const side of ['left','left','right','right'])await page.locator(`[data-side="${side}"]`).tap({force:true});await page.clock.runFor(32);
await click(page,'#launch');await advanceTo(page,3);const p=await point(page,'#left-valve');await mobile.cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});await page.clock.runFor(100);await mobile.cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert.equal(await page.locator('#left-valve').getAttribute('aria-pressed'),'false');await click(page,'#retry');
await click(page,'#launch');await advanceTo(page,6);for(let i=0;i<15;i++){await hold(page,i%2?'right':'left',1,mobile.cdp);if(i===4)await page.screenshot({path:'docs/playtest-mobile.png',fullPage:true});}for(let i=0;i<60&&await phase(page)==='flying';i++)await page.clock.runFor(1000);assert.equal(await phase(page),'won');report.mobile.push({viewport:'390×844，触摸仿真，非实机',phase:await phase(page),result:await page.locator('#result-text').textContent(),touchCancel:'释放气阀成功'});
await page.setViewportSize({width:360,height:640});await click(page,'#again');await click(page,'#launch');await page.clock.runFor(200);for(const side of ['left','right']){const b=await page.locator('#'+side+'-valve').boundingBox();assert(b.y+b.height<=640,`${side} narrow valve off-screen`);}assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile horizontal overflow');report.mobile.push({viewport:'360×640',controls:'两个气阀均在视口内；无横向溢出'});
assert.equal(report.errors.length,0);await writeFile('docs/playtest-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
