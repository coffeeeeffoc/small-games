import assert from 'node:assert/strict';
import { mkdtemp, copyFile, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
// Optional browser audit tooling only; npm start and npm test use no dependencies.
if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE to a local Playwright module file URL');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const root=process.cwd(), docs=resolve(root,'docs');
const temp=await mkdtemp(resolve(docs,'standalone-'));
assert.ok(temp.startsWith(docs+sep));
let server,browser;
const result={runtimeFiles:[],checks:[]};
try {
 for(const name of ['index.html','style.css','game.mjs','art.mjs','logic.mjs','server.mjs','package.json','check.mjs']) {await copyFile(resolve(root,name),resolve(temp,name));result.runtimeFiles.push(name);}
 server=spawn(process.execPath,['server.mjs','--port','4403'],{cwd:temp,stdio:['ignore','pipe','pipe'],windowsHide:true});
 await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('server timeout')),6000);server.stdout.once('data',d=>{clearTimeout(t);res();});server.once('exit',code=>{clearTimeout(t);rej(new Error(`server exited ${code}`));});});
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();
 for(const base of ['http://127.0.0.1:4403/','http://127.0.0.1:4403/off-camera/']) {
  await page.goto(base);await page.getByRole('button',{name:'添加搬走椅子',exact:true}).click();await page.getByRole('button',{name:'添加坐下休息',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('#confirm').disabled);await page.locator('#confirm').click();assert.equal(await page.locator('#feedback').getAttribute('data-status'),'won');result.checks.push(`${base}: clean copied project wins first case without parent or sibling files`);
 }
 assert.equal((await fetch('http://127.0.0.1:4403/not-present.js')).status,404);
 assert.equal((await fetch('http://127.0.0.1:4403/%2e%2e%5cpackage.json')).status,403);
 const child=spawn(process.execPath,['check.mjs'],{cwd:temp,stdio:'pipe',windowsHide:true});
 assert.equal(await new Promise(r=>child.once('exit',r)),0);result.checks.push('copied rule checks exit 0; missing files 404; Windows path traversal 403');
 result.passed=true;
}finally{
 if(browser)await browser.close();
 if(server&&server.exitCode===null){const exit=new Promise(r=>server.once('exit',r));server.kill();await exit;}
 // Delete only our verified per-run directory inside this project/docs.
 assert.ok(resolve(temp).startsWith(docs+sep+'standalone-'));
 await rm(temp,{recursive:true,force:true});
 await writeFile(resolve(docs,'standalone-report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}
