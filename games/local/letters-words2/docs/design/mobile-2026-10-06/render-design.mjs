import { chromium } from '/opt/codex/runtimes/cua/lib/node_modules/playwright/index.mjs';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const dir=resolve('docs/design/mobile-2026-10-06');
const server=createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname.slice(1)||'design.html';res.setHeader('Content-Type',name.endsWith('.svg')?'image/svg+xml':'text/html');res.end(await readFile(resolve(dir,name)));}catch{res.statusCode=404;res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/design.html';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));page.on('console',m=>console.log('CONSOLE',m.text()));
for(const name of ['home','islands','learning','play','pause','result','book','custom','help','share','friend','settings']){
 pageErrors.length=0;await page.goto(base+'?page='+name);
 await page.waitForSelector('.screen .top',{timeout:5000});await page.evaluate(()=>document.fonts.ready);if(pageErrors.length)throw new Error(pageErrors.join('\n'));if(!await page.locator('.screen').innerText())throw new Error('Empty screen '+name);await page.screenshot({path:dir+'/'+name+'.png'});
 console.log(name+'.png');
}
await page.setViewportSize({width:720,height:500});await page.goto('http://127.0.0.1:'+server.address().port+'/island.svg');await page.screenshot({path:dir+'/island.png',omitBackground:true});
await page.setViewportSize({width:2176,height:1860});
await page.goto(base+'?page=contact');
await page.waitForTimeout(400);
await page.screenshot({path:dir+'/contact-sheet.png',fullPage:true});
await browser.close();
server.close();
