// Full production Scene: observe cost, never equate software rendering with device acceptance.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';
const server=await preview({root:fileURLToPath(new URL('../',import.meta.url)),preview:{host:'127.0.0.1',port:0}});
const url=`http://127.0.0.1:${server.httpServer.address().port}/`;
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=swiftshader']});
const output=new URL('../../../../.scratch/travel-bund-performance/',import.meta.url);await mkdir(output,{recursive:true});
const label=(process.env.PROFILE_LABEL||'current').replace(/[^a-z0-9-]/gi,'-');
const errors=[],requests=new Set(),samples=[],checks=[];
try {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(/\/world\/.*\.glb/.test(request.url()))requests.add(request.url().split('/').at(-1));});
  await page.goto(url+'?debug=1'+(process.env.PROFILE_DETAIL?'&renderDetail='+encodeURIComponent(process.env.PROFILE_DETAIL):''));await expect(page.locator('main')).toHaveAttribute('data-ready','true',{timeout:120000});
  await page.locator('#enter-world').tap();await expect(page.locator('main')).toHaveAttribute('data-quality','0');
  if(process.env.PROFILE_DETAIL)await expect(page.locator('main')).toHaveAttribute('data-render-detail',process.env.PROFILE_DETAIL);
  for(let index=0;index<(process.env.SMOKE_ONLY==='1'?0:6);index++) {
    await page.waitForTimeout(8000);
    const state=await page.locator('main').evaluate(element=>({...element.dataset}));
    samples.push({seconds:(index+1)*8,triangles:Number(state.triangles),calls:Number(state.calls),fps:Number(state.fps),x:Number(state.x),y:Number(state.y),z:Number(state.z),grounded:state.grounded,requestedModels:requests.size});
    console.log(label,JSON.stringify(samples.at(-1)));
  }
  assert.deepEqual(errors,[]);if(samples.length){assert(samples.every(sample=>sample.triangles>0&&sample.calls>0));assert.equal(samples.at(-1).grounded,'true');}
  await page.screenshot({path:fileURLToPath(new URL(label+'.png',output))});
  if(process.env.CHECK_WALK==='1') {
    await page.getByRole('button',{name:'打开地图'}).tap();await page.getByRole('button',{name:/钟楼与旧石墙/}).tap();
    await expect.poll(async()=>Number(await page.locator('main').getAttribute('data-yaw')),{timeout:30000}).toBeGreaterThan(1.5);
    await page.waitForTimeout(6000);await page.screenshot({path:fileURLToPath(new URL(label+'-clock-route.png',output))});
    const before=Number(await page.locator('main').getAttribute('data-x'));
    const box=await page.getByRole('group',{name:'移动摇杆'}).boundingBox(),cdp=await context.newCDPSession(page);
    const finger={id:1,x:box.x+box.width/2,y:box.y+box.height/2};
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[finger]});finger.y-=35;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[finger]});
    await expect.poll(async()=>Number(await page.locator('main').getAttribute('data-x')),{timeout:30000}).toBeLessThan(before-.4);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    await expect(page.locator('main')).toHaveAttribute('data-speed','0.00',{timeout:30000});
    assert(Number(await page.locator('main').getAttribute('data-y'))>.8);
    await page.getByRole('button',{name:'认识 江海关大楼'}).tap();await page.getByRole('button',{name:'收入旅行手记'}).tap();await page.getByRole('button',{name:'返回漫游'}).tap();
    await expect(page.getByRole('button',{name:'查看探索路线'})).toContainText('1 / 3');
    checks.push('Full 3D clock route faces the real landmark; CDP touch walks on the original safe ground; cancellation releases movement; actual nearby story collection earns one stop.');
    for(const name of ['03 外白渡桥','05 上海中心']) {
      await page.getByRole('button',{name:'打开地图'}).tap();await page.getByRole('button',{name:new RegExp(name)}).tap();
      await page.waitForTimeout(6000);
      const y=Number(await page.locator('main').getAttribute('data-y'));assert(y>.8&&y<8);
      await page.screenshot({path:fileURLToPath(new URL(label+'-'+name.slice(0,2)+'.png',output))});
      checks.push(`Full Scene ${name} uses the existing safe landing; y=${y}.`);
    }
    assert.deepEqual(errors,[]);
  }
  await writeFile(new URL(label+'.json',output),JSON.stringify({label,viewport:{width:390,height:844},renderer:'Chromium ANGLE SwiftShader; full production Scene; all render passes',samples,checks,requestedModels:[...requests],errors,limitations:'Shared cloud CPU may affect FPS; no physical device or Safari acceptance.'},null,2));
  await context.close();
} finally {await browser.close();await server.close();}
