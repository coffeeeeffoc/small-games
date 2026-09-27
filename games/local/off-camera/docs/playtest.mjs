import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
// Optional browser audit tooling only; npm start and npm test use no dependencies.
if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE to a local Playwright module file URL');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const browser=await chromium.launch({headless:true,channel:'msedge'});
const report={started:new Date().toISOString(),browser:'Microsoft Edge (headless Chromium)',base:'http://127.0.0.1:4403/',checks:[],errors:[]};
async function setup(options){
 const context=await browser.newContext(options), page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400)report.errors.push(`${r.status()} ${r.url()}`);});
 await page.goto(report.base);await page.locator('.scene-svg').first().waitFor();
 return {context,page};
}
const click=async(page,name)=>page.getByRole('button',{name,exact:true}).click();
async function fill(page,names,touch=false){for(const name of names){const el=page.getByRole('button',{name:'添加'+name,exact:true});if(touch)await el.tap();else await el.click();}}
async function ready(page){await page.waitForFunction(()=>!document.querySelector('#confirm').disabled,{timeout:12000});}
async function confirm(page,status){await ready(page);await page.locator('#confirm').click();await page.waitForFunction(w=>document.querySelector('#feedback').dataset.status===w,status);}
async function drag(page,from,to){const a=await from.boundingBox(),b=await to.boundingBox();await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:15});await page.mouse.up();}
try{
 const {page}=await setup({viewport:{width:1365,height:900}});
 await click(page,'之前');assert.match(await page.locator('#frame-caption').innerText(),/进入/);
 await click(page,'之后');
 await fill(page,['坐下休息','搬走椅子']);
 const during1=await page.locator('#stage').innerHTML();await page.waitForTimeout(300);const during2=await page.locator('#stage').innerHTML();assert.notEqual(during1,during2);
 await confirm(page,'wrong');assert.match(await page.locator('#feedback').innerText(),/一起走/);assert.equal(await page.locator('.compare figure').count(),2);
 await page.screenshot({path:'docs/playtest-failure.png',fullPage:true});
 await drag(page,page.locator('[data-slot="1"] [data-card]'),page.locator('[data-slot="0"]'));
 assert.equal(await page.locator('[data-slot="0"] [data-card]').getAttribute('data-card'),'move');
 await confirm(page,'won');report.checks.push('desktop: chair wrong → visible contradiction → drag swap → win; animation changes rendered SVG');
 await page.locator('#confirm').click();
 await fill(page,['蛋糕飞来','挡住脸','拿开纸盘']);await confirm(page,'wrong');assert.match(await page.locator('#feedback').innerText(),/整张脸/);
 await page.screenshot({path:'docs/playtest-desktop.png',fullPage:true});
 await click(page,'重新排');await fill(page,['挡住脸','蛋糕飞来','拿开纸盘']);await confirm(page,'won');report.checks.push('desktop: cream full-face failure → retry → clean centre + cream on paper win');
 await page.locator('#confirm').click();
 await fill(page,['小狗偷吃','交换餐盘','盖左餐罩']);await confirm(page,'wrong');assert.match(await page.locator('#feedback').innerText(),/香肠/);
 await click(page,'重新排');await fill(page,['交换餐盘','小狗偷吃','盖左餐罩']);await confirm(page,'won');
 await page.screenshot({path:'docs/playtest-victory.png',fullPage:true});
 await page.locator('#confirm').click();assert.match(await page.locator('#feedback').innerText(),/3 \/ 3/);report.checks.push('desktop: lunch wrong food → retry → broccoli + covered empty left plate win; full 3/3 completion');
 await click(page,'静音');assert.equal(await page.locator('#mute').getAttribute('aria-pressed'),'true');await page.reload();assert.equal(await page.locator('#mute').getAttribute('aria-pressed'),'true');report.checks.push('mute toggles and persists after reload');
 await page.getByRole('button',{name:'添加搬走椅子',exact:true}).focus();await page.keyboard.press('Enter');await page.getByRole('button',{name:'添加坐下休息',exact:true}).focus();await page.keyboard.press('Enter');await confirm(page,'won');report.checks.push('keyboard-only card entry reaches a win');
 const mobile=await setup({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 const p=mobile.page;
 await fill(p,['坐下休息','搬走椅子'],true);await confirm(p,'wrong');await click(p,'重新排');await fill(p,['搬走椅子','坐下休息'],true);await confirm(p,'won');
 await p.locator('#confirm').tap();await fill(p,['挡住脸','蛋糕飞来','拿开纸盘'],true);await confirm(p,'won');
 await p.locator('#confirm').tap();await fill(p,['交换餐盘','小狗偷吃','盖左餐罩'],true);await confirm(p,'won');
 await p.screenshot({path:'docs/playtest-mobile.png',fullPage:true});
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 report.checks.push('390x844 mobile emulation: real touch taps, failure/retry and all three wins; no horizontal overflow');
 const small=await setup({viewport:{width:360,height:640},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 assert.equal(await small.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await fill(small.page,['搬走椅子','坐下休息'],true);await confirm(small.page,'won');report.checks.push('360x640: touch path wins; no horizontal overflow');
 assert.deepEqual(report.errors,[]);
 report.passed=true;
} catch(e){report.passed=false;report.failure=e.stack;throw e;}
finally{report.finished=new Date().toISOString();await writeFile('docs/playtest-report.json',JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report,null,2));}
