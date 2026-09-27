import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { steer } from '../verify.mjs';
import { LEVELS } from '../sim.mjs';
if(!process.argv[2])throw new Error('Pass the temporary @playwright/test entry path as argument; runtime has no Playwright dependency.');
const {chromium}=await import(pathToFileURL(process.argv[2]));
const browser=await chromium.launch({headless:true,channel:"chrome"});
const evidence={started:new Date().toISOString(),desktop:[],mobile:[],errors:[]};
async function snap(page){return page.evaluate(()=>window.__arena.snapshot());}
async function play(page,mobile,lastLevel){
  const cdp=mobile?await page.context().newCDPSession(page):null;
  let active=false,lastRound='',failureDone=false,replacementDone=false,captured=false;
  const bounds=async()=>{
    const joy=await page.locator('#joystick').boundingBox(),fire=await page.locator('#fire').boundingBox();
    return {x:joy.x+joy.width/2,y:joy.y+(joy.width<100?46:51),fx:fire.x+fire.width/2,fy:fire.y+fire.height/2};
  };
  let b=await bounds();
  const release=async()=>{
    if(mobile && active)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    else if(!mobile){await page.mouse.up();await page.keyboard.up('Space');}
    active=false;
  };
  const control=async command=>{
    const x=b.x+command[0]/127*34,y=b.y+command[1]/127*34;
    if(mobile){
      await cdp.send('Input.dispatchTouchEvent',{type:active?'touchMove':'touchStart',touchPoints:[{id:1,x,y,radiusX:5,radiusY:5},{id:2,x:b.fx,y:b.fy,radiusX:5,radiusY:5}]});
    }else{
      if(!active){await page.mouse.move(b.x,b.y);await page.mouse.down();await page.keyboard.down('Space');}
      await page.mouse.move(x,y);
    }
    active=true;
  };
  const started=Date.now();let progress=0;
  while(Date.now()-started<320000){
    let s=await snap(page);
    if(s.mode==='paused'){await release();await page.getByRole('button',{name:'继续这一轮',exact:true}).click();continue;}
    if(s.mode==='lost')throw new Error(`Unplanned browser loss: ${JSON.stringify(s)}`);
    if(s.mode==='won'){
      await release();evidence[mobile?'mobile':'desktop'].push({level:s.level+1,status:'won',round:s.round,tick:s.tick,remainingLife:s.actors.at(-1).hp});
      console.log(`${mobile?'mobile':'desktop'} level ${s.level+1} WON at ${s.tick/60}s`);
      if(s.level===lastLevel)break;
      await page.getByRole('button',{name:'进入下一关',exact:true}).click();b=await bounds();continue;
    }
    if(s.mode!=='playing'){if(active)await release();await page.waitForTimeout(120);continue;}
    const key=`${s.level}-${s.round}-${s.replacement}`;
    if(key!==lastRound){await release();lastRound=key;b=await bounds();console.log(`${mobile?'mobile':'desktop'} level ${s.level+1} round ${s.round} bank ${s.bank.length}`);}
    if(!mobile&&s.level===0&&s.bank.length===1&&!replacementDone){
      await release();const bank=JSON.stringify(s.bank);
      await page.getByRole('button',{name:'重录①',exact:true}).click();
      const replacing=await snap(page);assert.equal(replacing.replacement,0);assert.equal(replacing.actors.length,1);assert.equal(JSON.stringify(replacing.bank),bank);
      await page.getByRole('button',{name:'取消重录',exact:true}).click();assert.equal(JSON.stringify((await snap(page)).bank),bank);
      replacementDone=true;evidence.desktop.push({visibleReplacementAndCancel:'passed',bankPreserved:true});continue;
    }
    if(!mobile&&s.level===0&&s.bank.length===1&&!failureDone){
      await release();const saved=JSON.stringify(s.bank);
      await page.waitForFunction(()=>window.__arena.snapshot().mode==='lost',null,{timeout:20000});
      const lost=await snap(page);assert.equal(JSON.stringify(lost.bank),saved);
      await page.getByRole('button',{name:'重试当前轮',exact:true}).first().click();
      assert.equal(JSON.stringify((await snap(page)).bank),saved);
      evidence.desktop.push({failureAt:lost.tick/60,retryPreservedBank:true});failureDone=true;continue;
    }
    if(!captured&&s.level===lastLevel&&s.bank.length===LEVELS[s.level].seals.length&&s.tick>550&&s.hp<40){
      await release(); await page.screenshot({path:`docs/playtest-${mobile?'mobile':'desktop'}.png`,fullPage:false}); b=await bounds(); captured=true;
    }
    const target=s.bank.length<LEVELS[s.level].seals.length?LEVELS[s.level].seals[s.bank.length]:LEVELS[s.level].core;
    await control(steer(s,target,0.025*Math.sin(s.tick/100)));
    if(Date.now()-started>progress+25000){progress=Date.now()-started;console.log(`progress ${mobile?'mobile':'desktop'} ${Math.round(progress/1000)}s hp=${s.hp} life=${s.actors.at(-1).hp}`);}
    await page.waitForTimeout(140);
  }
  assert.equal((await snap(page)).mode,'won','browser flow timed out');
  assert.ok(captured,'missing gameplay screenshot');
  await release();
}
try{
  if(process.argv[3]!=='mobile'){
  const context=await browser.newContext({viewport:{width:1280,height:960}}),page=await context.newPage();
  page.on('pageerror',e=>evidence.errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)evidence.errors.push(`${r.status()} ${r.url()}`);});
  await page.goto('http://127.0.0.1:4406/');
  await page.getByRole('button',{name:'开始第一段记录',exact:true}).click();
  await page.getByRole('button',{name:'声音 开',exact:true}).click();assert.equal((await snap(page)).muted,true);
  await page.getByRole('button',{name:'声音 关',exact:true}).click();assert.equal((await snap(page)).audioState,'running');
  await page.getByRole('button',{name:'暂停',exact:true}).click();const paused=(await snap(page)).tick;await page.waitForTimeout(300);assert.equal((await snap(page)).tick,paused);
  await page.getByRole('button',{name:'继续这一轮',exact:true}).click();
  await play(page,false,2);
  evidence.desktop.push({url:page.url(),audioAndMute:'passed',pauseFreezesTicks:'passed'});
  await context.close(); await writeFile('docs/playtest-desktop-results.json',JSON.stringify(evidence,null,2));
  }
  const mobileContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1}),phone=await mobileContext.newPage();
  phone.on('pageerror',e=>evidence.errors.push(e.message));
  await phone.goto('http://127.0.0.1:4406/');
  await phone.getByRole('button',{name:'开始第一段记录',exact:true}).tap();
  await play(phone,true,0);
  for(const viewport of [{width:360,height:740},{width:844,height:390}]){
    await phone.setViewportSize(viewport);
    evidence.mobile.push({viewport,layout:await phone.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,width:innerWidth,fire:document.getElementById('fire').getBoundingClientRect().toJSON()}))});
  }
  evidence.mobile.push({input:'CDP two simultaneous real touch contacts',url:phone.url(),physicalDevice:false});
  assert.deepEqual(evidence.errors,[]);
  evidence.completed=new Date().toISOString();await writeFile('docs/playtest-results.json',JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence,null,2));
}finally{await browser.close();}
