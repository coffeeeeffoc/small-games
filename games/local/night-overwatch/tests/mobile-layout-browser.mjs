import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { acceptanceBuild, snapshot, press, settleVisuals } from './flight-browser.mjs';

const base=process.env.NIGHT_URL,build=await acceptanceBuild(base);
const out=process.env.NIGHT_REPORT_DIR||new URL('../reports/mobile-layout/',import.meta.url).pathname.replace(/^\/(\w:)/,'$1');
await mkdir(out,{recursive:true});
const evidence={build,environment:'Chromium; ordinary offline first mission; CSS/Tap geometry fixtures, not device validation',checks:[],screens:[],errors:[]};
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
const geometry=b=>({x:b.x,y:b.y,w:b.w,h:b.h});
try{
 for(const [width,height,host] of [[568,320,'css'],[844,390,'tap'],[1280,720,'none']]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,deviceScaleFactor:1});
  await context.addInitScript(host=>{
   localStorage.setItem('night-overwatch-coach-v2','done');
   if(host==='tap')globalThis.tap={getWindowInfo:()=>({windowWidth:innerWidth,windowHeight:innerHeight,statusBarHeight:24,safeArea:{left:0,right:innerWidth,top:24,bottom:innerHeight-12}}),getMenuButtonBoundingClientRect:()=>({left:innerWidth-96,right:innerWidth-12,top:16,bottom:52})};
  },host);
  const page=await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>evidence.errors.push(e.message));
  await page.route('**/game-bootstrap.js',route=>route.fulfill({contentType:'text/javascript',body:'globalThis.__COMPETITION_CONFIG__={competitionEnabled:false};'}));
  await page.route('**/api/competition/**',route=>route.abort());
  const ready=async()=>{await page.waitForFunction(()=>globalThis.__night?.snapshot().ui.homeArtworkReady&&!document.getElementById('night-startup'));await settleVisuals(page);};
  const click=async id=>{await press(page,id,true,false);await settleVisuals(page);};
  const shot=async name=>{const file=`${name}-${width}.png`;await page.screenshot({path:`${out}/${file}`});evidence.screens.push(file);return snapshot(page);};
  const css=async()=>{await page.addStyleTag({content:':root{--safe-top:52px!important;--safe-bottom:12px!important}'});await page.evaluate(()=>window.dispatchEvent(new Event('resize')));await page.waitForFunction(()=>__night.snapshot().safe.top===52);await settleVisuals(page);};
  const start=async()=>{await click('qm:modes');await click('mode:solo');await click('mode:enter');await click('start');await page.waitForFunction(()=>__night.snapshot().phase==='playing'&&!__night.snapshot().modal);};
  await page.goto(base+'?dev=0');await ready();if(host==='css')await css();
  let s=await shot('home');
  const deploy=s.buttons.find(b=>b.id==='qm:modes'),cards=s.buttons.filter(b=>['qm:shop','qm:growth','qm:tasks','qm:warehouse'].includes(b.id));
  assert(cards.length===4&&cards.every(b=>!overlap(deploy,b)),'deploy remains above bottom cards');
  if(host==='tap'){assert.equal(s.safe.top,0,'a hidden landscape status bar reserves no top band');assert(s.buttons.find(b=>b.id==='settings').x+44<=width-96);}
  await start();const initial=await shot('battle');
  await click('settings');await shot('settings');
  await click('help');s=await snapshot(page);assert(s.modal.startsWith('help:')&&s.scrollMax>0&&s.lastHelpLine);
  const guideArea=await page.evaluate(async()=>{const {director}=await System.import('cc');return director.getScene().getComponentsInChildren('Overwatch')[0].hud.scrollArea;});
  await page.mouse.move(guideArea.x+guideArea.w*.5,guideArea.y+guideArea.h*.5);await page.mouse.wheel(0,10000);await settleVisuals(page);
  s=await shot('guide-scrolled');assert(s.scroll>0&&s.scroll<=s.scrollMax,'guide content scrolls while footer remains reachable');
  for(const group of ['advanced','rules','basic']){await click('tab:'+group);s=await snapshot(page);assert(s.modal.startsWith('help:'+group)&&s.lastHelpLine);}
  await click('close');assert((await snapshot(page)).modal.startsWith('settings'));
  for(const id of ['flightControls','zoomControls','buttonControls'])assert(!(await snapshot(page)).buttons.find(b=>b.id===id).bold,'navigation is not simultaneously selected');
  await click('zoomControls');s=await shot('zoom-settings');
  const resume=s.buttons.find(b=>b.id==='resume');assert(s.buttons.filter(b=>b.id!=='resume'&&b.id!=='close').every(b=>!overlap(b,resume)),'zoom rows stay above footer');
  await click('close');await click('buttonControls');await shot('button-settings');
  for(const id of ['fireScale:up','controlScale:up'])for(let i=0;i<5;i++)await click(id);
  s=await shot('size-max');assert(s.buttons.find(b=>b.id==='fireScale:up').disabled&&s.buttons.find(b=>b.id==='controlScale:up').disabled);
  await click('layoutEdit');s=await shot('layout-max');const pausedTime=s.time,pausedFired=s.fired;
  assert(s.buttons.find(b=>b.id==='fire').w>initial.buttons.find(b=>b.id==='fire').w);
  const cdp=await context.newCDPSession(page);
  const drag=async(id,x,y,cancel=false)=>{
   const b=(await snapshot(page)).buttons.find(b=>b.id===id);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.w/2,y:b.y+b.h/2,id:1}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y,id:1}]});
   await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});await settleVisuals(page);
  };
  const originalFire=geometry(s.buttons.find(b=>b.id==='fire'));
  await drag('fire',55,height/2);s=await shot('fire-left');const moved=geometry(s.buttons.find(b=>b.id==='fire'));
  assert.notDeepEqual(moved,originalFire,'fire drag changes its position');
  assert(moved.x>=s.safe.left&&moved.x+moved.w<width/2,'fire reaches the left side inside the safe area');
  assert.equal(s.time,pausedTime);assert.equal(s.fired,pausedFired);
  await drag('fire',width/2,height/2,true);assert.deepEqual(geometry((await snapshot(page)).buttons.find(b=>b.id==='fire')),moved,'cancel restores fire position');
  if(host==='tap'){
   await drag('fire',width-10,20);s=await shot('fire-capsule');assert(!overlap(s.buttons.find(b=>b.id==='fire'),{x:width-96,y:16,w:84,h:36}));
  }
  await click('layoutDone');await click('resume');s=await snapshot(page);assert(!s.modal&&!s.pauses.length);
  let fire=s.buttons.find(b=>b.id==='fire');
  await page.evaluate(async()=>{
   const {director}=await System.import('cc'),g=director.getScene().getComponentsInChildren('Overwatch')[0].hud.globalGraphics;
   globalThis.__fireFeedback=[];
   for(const name of ['circle','rect','roundRect']){const original=g[name];g[name]=function(...args){globalThis.__fireFeedback.push({name,args});return original.apply(this,args);};}
  });
  const directOrigin=geometry(fire);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:fire.x+fire.w/2,y:fire.y+fire.h/2,id:1}]});
  await page.waitForFunction(()=>__night.snapshot().held.length>0);await page.waitForTimeout(150);await shot('fire-pressed');
  const feedback=await page.evaluate(()=>globalThis.__fireFeedback),cx=fire.x+fire.w/2-width/2,cy=height/2-fire.y-fire.h/2;
  assert(feedback.some(p=>p.name==='circle'&&Math.hypot(p.args[0]-cx,p.args[1]-cy)<1&&p.args[2]>fire.w*.35),'fire press uses its circular outline');
  assert(!feedback.some(p=>p.name!=='circle'&&Math.hypot(p.args[0]+p.args[2]/2-cx,p.args[1]+p.args[3]/2-cy)<3),'fire press has no rectangular overlay');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:width*.4,y:height*.52,id:1}]});await settleVisuals(page);
  s=await shot('fire-direct-drag');const directMoved=geometry(s.buttons.find(b=>b.id==='fire')),stopped=s.fired;
  assert.notDeepEqual(directMoved,directOrigin);assert.deepEqual(s.held,[]);assert(!s.modal&&!s.pauses.length);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(200);assert.equal((await snapshot(page)).fired,stopped,'drag release never adds a shot');
  await drag('fire',width*.6,height*.6,true);assert.deepEqual(geometry((await snapshot(page)).buttons.find(b=>b.id==='fire')),directMoved,'direct drag cancel restores position');
  fire=(await snapshot(page)).buttons.find(b=>b.id==='fire');
  const finger={x:fire.x+fire.w/2,y:fire.y+fire.h/2,id:1},aimFinger={x:width*.25,y:height*.4,id:2};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[finger]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[finger,aimFinger]});
  assert((await snapshot(page)).held.length>0,'second aim finger does not cancel fire');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[finger,{...aimFinger,x:aimFinger.x+20}]});
  assert((await snapshot(page)).held.length>0);await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert.deepEqual((await snapshot(page)).held,[]);
  await click('settings');await click('buttonControls');for(const id of ['fireScale:down','controlScale:down'])for(let i=0;i<7;i++)await click(id);
  s=await shot('size-min');assert(s.buttons.find(b=>b.id==='fireScale:down').disabled&&s.buttons.find(b=>b.id==='controlScale:down').disabled);
  await click('layoutEdit');s=await snapshot(page);assert(s.buttons.filter(b=>/^(weapon|fire)/.test(b.id)).every(b=>b.w>=44&&b.h>=44));
  await click('layoutDone');await click('layoutReset');await click('resume');
  await page.reload();await ready();if(host==='css')await css();await start();s=await snapshot(page);
  assert.equal(await page.evaluate(()=>localStorage.getItem('night-overwatch-fireScale')),'0.8');
  assert.equal(await page.evaluate(()=>localStorage.getItem('night-overwatch-controlScale')),'0.8');
  assert(s.buttons.find(b=>b.id==='fire').x>width*.7,'reload restores default position');
  if(host==='none'){
   await click('settings');await click('buttonControls');for(const id of ['fireScale:up','controlScale:up'])for(let i=0;i<2;i++)await click(id);
   await click('resume');await shot('battle-default');
   await page.evaluate(async()=>{
    const {Graphics,director,Director,view}=await System.import('cc');let path=[],diamonds=[];
    for(const name of ['moveTo','lineTo','close','rect']){const original=Graphics.prototype[name];Graphics.prototype[name]=function(...args){if(this.node.name==='Telemetry')path.push({name,args});return original.apply(this,args);};}
    const clear=Graphics.prototype.clear,stroke=Graphics.prototype.stroke;
    Graphics.prototype.clear=function(...args){if(this.node.name==='Telemetry'){path=[];diamonds=[];}return clear.apply(this,args);};
    Graphics.prototype.stroke=function(...args){if(this.node.name==='Telemetry'){
     if(this.strokeColor.r===255&&this.strokeColor.g===82&&this.strokeColor.b===91&&path.map(p=>p.name).join(',')==='moveTo,lineTo,lineTo,lineTo,close')diamonds.push({x:(path[0].args[0]+path[2].args[0])/2,y:(path[0].args[1]+path[2].args[1])/2});path=[];
    }return stroke.apply(this,args);};
    globalThis.__markerProbe={frames:0,contacts:0,covered:0,minZoom:Infinity,maxZoom:0,missing:[]};
    director.on(Director.EVENT_AFTER_DRAW,()=>{
     const game=director.getScene().getComponentsInChildren('Overwatch')[0];if(!game||game.hud.modal||game.sim.paused)return;
     const h=game.hud,probe=globalThis.__markerProbe,map=h.minimapLayout;probe.frames++;probe.minZoom=Math.min(probe.minZoom,game.world.zoom);probe.maxZoom=Math.max(probe.maxZoom,game.world.zoom);
     for(const u of game.sim.units){if(u.friendly||u.hp<=0)continue;const p=game.world.project(u,.8),x=p.x/view.getScaleX(),y=h.h-p.y/view.getScaleY();
      if(![p.x,p.y,p.z].every(Number.isFinite)||p.z<0||p.z>1||x<6||x>h.w-6||y<6||y>h.h-6||x>=map.x&&x<=map.x+map.w&&y>=map.y&&y<=map.y+map.h)continue;
      probe.contacts++;if(h.buttons.some(b=>/^weapon/.test(b.id)&&b.label.node.activeInHierarchy&&x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h))probe.covered++;
      if(!diamonds.some(d=>Math.hypot(d.x-(x-h.w/2),d.y-(h.h/2-y))<.75)&&probe.missing.length<20)probe.missing.push({id:u.id,zoom:game.world.zoom,x,y});
     }
    });
   });
   await click('settings');await click('buttonControls');await click('layoutEdit');
   const target=await page.evaluate(async()=>{const {director,view}=await System.import('cc'),g=director.getScene().getComponentsInChildren('Overwatch')[0];return g.sim.units.filter(u=>!u.friendly&&u.hp>0).map(u=>g.world.project(u,.8)).map(p=>({x:p.x/view.getScaleX(),y:g.hud.h-p.y/view.getScaleY()})).find(p=>p.x>80&&p.x<g.hud.w-220&&p.y>100&&p.y<g.hud.h-120);});
   assert(target);await drag('weapon0',target.x,target.y);await click('layoutDone');await click('resume');await shot('marker-under-control');
   await page.mouse.move(width*.55,height*.45);
   for(const direction of [-1,1])for(let i=0;i<65;i++){await page.mouse.wheel(0,direction*18);await page.waitForTimeout(35);}
   await shot('marker-zoom');const probe=await page.evaluate(()=>globalThis.__markerProbe);
   assert(probe.frames>50&&probe.contacts>100&&probe.covered>0,JSON.stringify(probe));assert(probe.maxZoom/probe.minZoom>3,JSON.stringify(probe));assert.deepEqual(probe.missing,[]);evidence.markers=probe;
  }
  evidence.checks.push({width,height,host,homeClear:true,guideScrollAndTabs:true,sizeLimits:true,sizePersisted:true,dragFire:true,directFireDrag:true,circularFireFeedback:true,aimAndFire:true,cancelRestores:true,layoutPaused:true,resume:true,touchCancel:true});
  await context.close();
 }
 assert.deepEqual(evidence.errors,[]);await acceptanceBuild(base);await writeFile(`${out}/evidence.json`,JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{await browser.close();}
