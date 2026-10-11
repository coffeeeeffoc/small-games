import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export async function browserEvidence() {
  const root = fileURLToPath(new URL('../dist/', import.meta.url));
  const evidence = new URL('../docs/design/expansion-2026-10-11/actual/', import.meta.url);
  await mkdir(evidence, { recursive: true });
  const mime = {'.js':'text/javascript', '.html':'text/html', '.css':'text/css', '.svg':'image/svg+xml', '.json':'application/json', '.png':'image/png', '.webp':'image/webp', '.wav':'audio/wav'};
  const server = createServer(async (request,response) => {
    try {
      const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
      const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
      if(!target.startsWith(root)) { response.writeHead(403).end(); return; }
      const data=await readFile(target);
      response.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream'}).end(data);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}/`;
  const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  const errors=[];
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
  await context.addInitScript(()=>{
    window.__copies=[];window.__payloads=[];
    Object.defineProperty(navigator,'share',{configurable:true,value:undefined});
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>window.__copies.push(value)}});
  });
  const page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
  return {base,page,context,browser,errors,
    shot:async label=>page.screenshot({path:fileURLToPath(new URL(`${label}.png`,evidence)),fullPage:true,style:'small-games-devtools { visibility:hidden !important; }'}),
    close:async()=>{await browser.close();await new Promise(resolve=>server.close(resolve));},
  };
}
export async function touchPath(page,points,cancel=false) {
  const cdp=await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...points[0],id:1}]});
    for(const point of points.slice(1)) {await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...point,id:1}]});await page.waitForTimeout(12);}
    await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
  }finally{await cdp.detach();}
}
