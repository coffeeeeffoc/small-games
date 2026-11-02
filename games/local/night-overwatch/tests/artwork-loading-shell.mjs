import assert from 'node:assert/strict';
import { cp, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { sourceHash } from '../scripts/artifact.mjs';
import { settleVisuals } from './flight-browser.mjs';
const game=fileURLToPath(new URL('../',import.meta.url)),root=path.resolve(game,'../../../apps/shell-web');
const require=createRequire(path.join(root,'package.json'));
const {preview}=await import(pathToFileURL(require.resolve('vite')));
const build=JSON.parse(await readFile(path.join(game,'dist/build-info.json'),'utf8'));
assert.equal(build.sourceHash,await sourceHash());
await cp(path.join(game,'dist'),path.join(root,'dist/games/night-overwatch'),{recursive:true,force:true});
const server=await preview({root,base:'/',preview:{host:'127.0.0.1',port:0}});
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
const errors=[],consoleErrors=[];
try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  await page.route('**/game-bootstrap.js',route=>route.fulfill({contentType:'text/javascript',body:"globalThis.SmallGamesServices={ready:Promise.resolve({identity:{playerId:'qa-embedded',nickname:'嵌入检查'},capabilities:{}}),services:{},createRecorder:()=>({start:async()=>null,record(){},finish:async()=>null,invalidate(){}})};"}));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/#/games/night-overwatch`);
  await page.locator('iframe').waitFor();
  const frame=await (await page.locator('iframe').elementHandle()).contentFrame();
  await frame.waitForFunction(()=>globalThis.__night?.snapshot().ui.interfaceArtworkReady&&!document.getElementById('night-startup'),null,{timeout:60000}).catch(async error=>{
    console.log(JSON.stringify({url:frame.url(),state:await frame.evaluate(()=>({status:document.getElementById('night-status')?.textContent,hint:document.getElementById('night-hint')?.textContent,hasSnapshot:!!globalThis.__night,body:document.body.innerText.slice(0,500)})),errors,consoleErrors}));throw error;
  });
  const info=await frame.evaluate(async()=>await (await fetch('./build-info.json')).json());assert.equal(info.sourceHash,build.sourceHash);
  const button=await frame.evaluate(()=>{const s=__night.snapshot(),b=s.buttons.find(b=>b.id==='qm:modes'),r=document.querySelector('canvas').getBoundingClientRect();return {x:(b.x+b.w/2)/s.ui.width*r.width,y:(b.y+b.h/2)/s.ui.height*r.height};});
  await frame.locator('canvas').click({position:button});
  await frame.waitForFunction(()=>__night.snapshot().buttons.some(b=>b.id==='mode:enter'));
  await settleVisuals(frame);
  await page.screenshot({path:path.join(game,'reports/artwork-loading/shell-1280.png')});
  assert.deepEqual(errors,[]);
  const evidence={build,entry:'existing Shell static build with current Night artifact',iframe:true,homeReady:true,modeNavigation:true,fixture:true,errors};
  await writeFile(path.join(game,'reports/artwork-loading/shell-evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await browser.close();server.httpServer.closeAllConnections();await new Promise(resolve=>server.httpServer.close(resolve));}
