import { test, expect, type Page } from '@playwright/test';
import type { CourseScene } from '../src/scene';
import { writeFile } from 'node:fs/promises';
import { levels } from '../src/levels';
import { routeInputs, runReference } from './replay';
declare global { interface Window { __course: CourseScene } }
async function boot(page: Page){await page.goto('/?test');await page.waitForFunction(()=>!!window.__course?.course);}
async function replay(page: Page,index: number,alternate=false,naive=false){
  const actions=structuredClone(routeInputs[levels[index].id]);
  if(alternate&&index===5)actions[1].after=34/120;
  if(alternate&&index===4){actions[0].x=520;actions[1].after=30/120;}
  return page.evaluate(runReference,{index,alternate,naive,actions});
}

test('结算自动聚焦主按钮，回车重试、空格下一关，刷新不抢焦点',async({page})=>{
  await boot(page);await replay(page,2,false,true);
  await expect(page.locator('#retry')).toBeFocused();await expect(page.locator('#retry')).toHaveClass('primary');
  await page.keyboard.press('Tab');await page.waitForTimeout(240);
  await expect(page.locator('#result-redraw')).toBeFocused();
  await page.keyboard.press('Shift+Tab');await page.keyboard.press('Enter');
  await expect(page.locator('#result-panel')).toBeHidden();
  expect(await page.evaluate(()=>window.__course.phase)).toBe('running');
  await page.evaluate(()=>{const s=window.__course;for(let i=0;i<600&&s.phase==='running';i++)s.fixedTick(1,false);});
  await expect(page.locator('#retry')).toBeFocused();
  await replay(page,0);
  await expect(page.locator('#next')).toBeFocused();await expect(page.locator('#next')).toHaveClass('primary');
  await expect(page.locator('#retry')).not.toHaveClass('primary');
  await page.keyboard.press('Space');await expect(page.locator('#result-panel')).toBeHidden();
  expect(await page.evaluate(()=>window.__course.levelIndex)).toBe(1);
  await replay(page,levels.length-1);
  await expect(page.locator('#next')).toBeHidden();await expect(page.locator('#retry')).toBeFocused();
  await expect(page.locator('#retry')).toHaveClass('primary');
});

test('画出部分笔画后醒目提示重画，桌面和横屏画布不被挤动',async({page})=>{
  for(const viewport of [{width:1280,height:800},{width:844,height:390}]){
    await page.setViewportSize(viewport);await boot(page);
    await expect(page.locator('#redraw-inline')).toBeHidden();
    const r=(await page.locator('canvas').boundingBox())!,x=(v:number)=>r.x+v*r.width/1100,y=r.y+410*r.height/560;
    await page.mouse.move(x(155),y);await page.mouse.down();await page.mouse.move(x(500),y,{steps:35});
    await expect(page.locator('#redraw-inline')).toBeVisible();
    expect(await page.locator('canvas').boundingBox()).toEqual(r);
    await page.mouse.up();await expect(page.locator('#start')).toBeDisabled();
    await expect(page.locator('.message-row')).toHaveClass(/has-stroke/);
    await expect(page.locator('#message')).toContainText('还没连到终点');
    const button=(await page.locator('#redraw-inline').boundingBox())!;
    expect(button.height).toBeGreaterThanOrEqual(40);expect(button.x+button.width).toBeLessThanOrEqual(viewport.width);expect(button.y+button.height).toBeLessThanOrEqual(viewport.height);
    if(viewport.width===844)await page.screenshot({path:'docs/redraw-hint-mobile.png'});
    await page.locator('#redraw-inline').click();await expect(page.locator('#redraw-inline')).toBeHidden();
    expect(await page.evaluate(()=>window.__course.preview.length+window.__course.points.length)).toBe(0);
    await page.locator('#example').click();await expect(page.locator('#redraw-inline')).toBeVisible();
    await page.locator('#start').click();await expect(page.locator('#redraw-inline')).toBeHidden();
  }
});

test('十二关：使用与玩家相同的力和物理步进，参考路线均可三颗星满分通关',async({page})=>{
  const errors: string[]=[];page.on('pageerror',e=>errors.push(e.message));await boot(page);
  const results=[];for(let i=0;i<levels.length-1;i++)results.push(await replay(page,i));
  console.log('REFERENCE RUNS',JSON.stringify(results.map(r=>({id:r.level,phase:r.phase,time:r.elapsed,ink:r.usedInk,stars:r.stars,score:r.score,position:r.ball,maxSpeed:r.maxSpeed}))));
  for(const result of results){expect(result.phase,result.level).toBe('success');expect(result.stars,result.level).toBe(3);expect(result.score?.total,result.level).toBe(100);}
  expect(errors).toEqual([]);
});

test('全部挑战参考线盲冲失败，数字按键操作成功；第二画法也可解',async({page})=>{
  await boot(page);const records=[];
  for(let index=1;index<levels.length-1;index++)for(const alternate of levels[index].alternate?[false,true]:[false]){
    const naive=await replay(page,index,alternate,true),played=await replay(page,index,alternate);
    if(!alternate){expect(naive.phase,naive.level).toBe('failure');expect(naive.score).toBeNull();}
    expect(played.phase,played.level).toBe('success');
    if(index===1){expect(played.keyTaken).toBe(true);expect(played.jumps).toBe(1);}
    if(index===5)expect(played.holdSeconds).toBeGreaterThanOrEqual(.6);
    expect(played.inputs.every(i=>[-1,0,1].includes(i.axis))).toBe(true);
    records.push({level:played.level,alternate,naive:{time:naive.elapsed,reason:naive.failure},played:{time:played.elapsed,stars:played.stars,score:played.score,ink:played.usedInk,inputs:played.inputs}});
  }
  await writeFile('docs/challenge-validation.json',JSON.stringify(records,null,2));
});

test('新机关重试 20 次不累积，暂停冻结压门，失败轨迹可见',async({page})=>{
  await boot(page);
  const result=await page.evaluate(()=>{
    const s=window.__course;s.manual=true;const records=[];
    for(let index=1;index<12;index++){
      s.select(index);s.example();s.start();const base=s.snapshot();
      for(let n=0;n<20;n++){
        for(let i=0;i<500&&s.phase==='running';i++)s.fixedTick(1,false);
        if(s.phase!=='failure')throw new Error('盲冲应该失败');
        s.start();const reset=s.snapshot();
        if(reset.bodies!==base.bodies||reset.listeners!==base.listeners||reset.keyTaken||reset.holdSeconds!==0||reset.elapsed!==0)throw new Error('机关复位错误');
        if(reset.ghostPoints===0)throw new Error('缺少失败轨迹');
      }
      records.push(s.snapshot());
    }
    s.select(3);s.example();s.start();for(let i=0;i<305;i++)s.fixedTick(0,false);s.pause();const before=s.snapshot();
    for(let i=0;i<500;i++)s.fixedTick(1,true);const after=s.snapshot();
    s.select(1);return {records,before,after,cleared:s.snapshot()};
  });
  expect(result.before.gateBottom).toBeLessThan(515);expect(result.after.gateBottom).toBe(result.before.gateBottom);
  expect(result.after.elapsed).toBe(result.before.elapsed);expect(result.cleared.ghostPoints).toBe(0);
});

test('停车要整球入框且低速接地；跳着穿过终点不能过关',async({page})=>{
  await boot(page);
  const result=await page.evaluate(()=>{
    const s=window.__course;s.manual=true;s.select(5);s.example();s.start();
    s.matter.body.setPosition(s.course.ball,{x:1010,y:390});s.matter.body.setVelocity(s.course.ball,{x:0,y:-3});
    for(let i=0;i<12;i++)s.fixedTick(0,false);return s.snapshot();
  });
  expect(result.phase).toBe('running');expect(result.holdSeconds).toBe(0);
});

test('双钥必须全部收集，充能离台会中断，逆风实际改变运动',async({page})=>{
  await boot(page);
  for(const jumpX of [260,630]){
    const r=await page.evaluate(runReference,{index:6,actions:[{x:jumpX,jump:true}]});
    expect(r.phase).toBe('failure');expect(r.keyCount).toBe(1);expect(r.failure).toContain('钥匙');
  }
  const result=await page.evaluate(()=>{
    const s=window.__course;s.manual=true;s.select(4);s.example();s.start();
    let braking=false,brakeTicks=0;
    for(let i=0;i<1000&&s.challenge.holdSeconds===0;i++){
      if(s.course.ball.position.x>=500)braking=true;
      s.fixedTick(braking?(brakeTicks++<22?-1:0):1,false);
    }
    const partial=s.challenge.holdSeconds;
    s.fixedTick(0,true);for(let i=0;i<8;i++)s.fixedTick(0,false);
    const reset=s.challenge.holdSeconds,locked=s.challenge.locked;
    s.select(10);const config=s.level.challenges,positions=[];
    try{for(const wind of [true,false]){
      s.level.challenges=wind?config:config.filter(c=>c.kind!=='wind');s.example();s.start();
      for(let i=0;i<180;i++)s.fixedTick(1,false);positions.push(s.course.ball.position.x);
    }}finally{s.level.challenges=config;}
    s.select(2);s.example();s.start();for(let i=0;i<40;i++)s.fixedTick(0,false);s.pause();
    const before=s.matter.world.getAllBodies().find(b=>b.label==='saw')!.position.y;
    for(let i=0;i<300;i++)s.fixedTick(1,true);
    const after=s.matter.world.getAllBodies().find(b=>b.label==='saw')!.position.y;
    return {partial,reset,locked,positions,before,after};
  });
  expect(result.partial).toBeGreaterThan(0);expect(result.partial).toBeLessThan(.5);
  expect(result.reset).toBe(0);expect(result.locked).toBe(true);
  expect(result.positions[0]).toBeLessThan(result.positions[1]-20);expect(result.after).toBe(result.before);
});

test('真实键盘和 RAF：连续两跳、刹车充能后重新出发',async({page})=>{
  await boot(page);await page.locator('[data-level="6"]').click();await page.locator('#example').click();await page.locator('#start').click();
  await page.keyboard.down('ArrowRight');
  for(const x of [260,630]){await page.waitForFunction(x=>window.__course.course.ball.position.x>=x,x);await page.keyboard.press('Space');}
  await expect(page.locator('#result-title')).toHaveText('这条路，你跑通了！');await page.keyboard.up('ArrowRight');
  expect(await page.evaluate(()=>window.__course.course.jumps)).toBe(2);
  await page.locator('[data-level="4"]').click();await page.locator('#example').click();await page.locator('#start').click();
  await page.keyboard.down('ArrowRight');await page.waitForFunction(()=>window.__course.course.ball.position.x>=500);
  await page.keyboard.up('ArrowRight');await page.keyboard.down('ArrowLeft');
  await page.waitForFunction(()=>window.__course.course.ball.velocity.x<=.4);await page.keyboard.up('ArrowLeft');
  await page.waitForFunction(()=>!window.__course.challenge.locked);await page.keyboard.down('ArrowRight');
  await expect(page.locator('#result-title')).toHaveText('这条路，你跑通了！');await page.keyboard.up('ArrowRight');
});

test('新增关卡导航和下一关：手机能选择终章，通关可进入自由实验',async({browser})=>{
  const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const page=await context.newPage();await boot(page);
  for(const index of [2,4,7,10,11]){
    await page.locator(`[data-level="${index}"]`).click();await page.locator('#example').click();
    for(const selector of ['canvas','#start',`[data-level="${index}"]`]){
      const r=(await page.locator(selector).boundingBox())!;expect(r.x).toBeGreaterThanOrEqual(0);expect(r.x+r.width).toBeLessThanOrEqual(845);expect(r.y+r.height).toBeLessThanOrEqual(391);
    }
  }
  await page.screenshot({path:'docs/final-exam-mobile.png'});
  await replay(page,11);await page.locator('#next').click();
  expect(await page.evaluate(()=>window.__course.level.id)).toBe('free');await expect(page.locator('[data-level="12"]')).toHaveAttribute('aria-current','true');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(844);
  await context.close();
});

test('鼠标画线 → 操控通关 → 再跑 → 重画，实际 RAF 和键盘输入',async({page})=>{
  await boot(page);
  const rect=await page.locator('canvas').boundingBox();expect(rect).not.toBeNull();
  const r=rect!,xy=(x: number,y: number)=>({x:r.x+x*r.width/1100,y:r.y+y*r.height/560});
  const a=xy(155,410),b=xy(955,410);
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:90});await page.mouse.up();
  await expect(page.locator('#start')).toBeEnabled();
  expect(await page.evaluate(()=>window.__course.snapshot().usedInk)).toBeCloseTo(800,0);
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y-80,{steps:30});await page.mouse.up();
  expect(await page.evaluate(()=>window.__course.snapshot().usedInk)).toBeCloseTo(800,0);
  await page.locator('#start').click();await page.keyboard.down('ArrowRight');
  await expect(page.locator('#result-title')).toHaveText('这条路，你跑通了！',{timeout:12000});await page.keyboard.up('ArrowRight');
  await expect(page.locator('#result-score')).toHaveText('100 分');
  await page.locator('#retry').click();expect(await page.evaluate(()=>window.__course.collected.size)).toBe(0);
  await page.locator('#pause-button').click();await expect(page.locator('#pause-panel')).toBeVisible();
  await page.evaluate(()=>window.__course.redraw());await expect(page.locator('#start')).toBeDisabled();
  expect(await page.evaluate(()=>window.__course.draft)).toBeNull();
});

test('同一模板两种画法都通关，星星和墨水有取舍',async({page})=>{
  await boot(page);const short=await replay(page,1,true),hill=await replay(page,1);
  expect(short.phase).toBe('success');expect(hill.phase).toBe('success');
  expect(short.stars).toBeLessThan(hill.stars);expect(short.usedInk).toBeLessThan(hill.usedInk);
});

test('失败原因可见、无通关分；向左掉落后可立即重试',async({page})=>{
  await boot(page);
  await page.evaluate(()=>{const s=window.__course;s.manual=true;s.example();s.start();for(let i=0;i<400&&s.phase==='running';i++)s.fixedTick(-1,false);});
  await expect(page.locator('#result-panel')).toBeVisible();
  const s=await page.evaluate(()=>window.__course.snapshot());expect(s.phase).toBe('failure');expect(s.score).toBeNull();expect(s.failure).toMatch(/区域|深坑/);
  await page.locator('#retry').click();
  const reset=await page.evaluate(()=>window.__course.snapshot());expect(reset.phase).toBe('running');expect(reset.elapsed).toBe(0);expect(reset.stars).toBe(0);expect(reset.ball.x).toBe(100);
});

test('连续 20 次重试 + 切关：刚体、监听、计时和星星正确复位',async({page})=>{
  await boot(page);
  const result=await page.evaluate(()=>{
    const s=window.__course;s.manual=true;s.example();s.start();const initial=s.snapshot(),counts=[];
    for(let n=0;n<20;n++){
      for(let i=0;i<1000&&s.phase==='running';i++)s.fixedTick(1,false);
      if(s.phase!=='success')throw new Error('参考路线未通关');s.start();counts.push(s.snapshot());
    }
    for(let i=0;i<20;i++){s.select(i%6);s.example();}s.select(0);s.example();s.start();
    return {initial,counts,final:s.snapshot()};
  });
  for(const s of [...result.counts,result.final]){expect(s.bodies).toBe(result.initial.bodies);expect(s.listeners).toBe(result.initial.listeners);expect(s.elapsed).toBe(0);expect(s.stars).toBe(0);expect(s.ball.x).toBe(100);}
});

test('接缝和速度上限：微起伏路线不中断，最大落速不穿透',async({page})=>{
  await boot(page);
  const result=await page.evaluate(()=>{
    const s=window.__course;s.manual=true;
    s.finishDrawing([s.level.start,...Array.from({length:24},(_,i)=>({x:180+i*32,y:410+(i%2?4:-4)})),s.level.end]);s.start();
    let max=0;for(let i=0;i<1500&&s.phase==='running';i++){s.fixedTick(1,false);max=Math.max(max,Math.abs(s.course.ball.velocity.x));}
    const seams=s.snapshot();s.redraw();s.example();s.start();
    s.matter.body.setPosition(s.course.ball,{x:500,y:200});s.matter.body.setVelocity(s.course.ball,{x:0,y:12});
    let deepest=0;for(let i=0;i<200;i++){s.fixedTick(0,false);deepest=Math.max(deepest,s.course.ball.position.y);}
    return {seams,max,deepest,fall:s.snapshot()};
  });
  expect(result.seams.phase).toBe('success');expect(result.max).toBeLessThanOrEqual(6.201);expect(result.deepest).toBeLessThan(392);expect(result.fall.grounded).toBe(true);
});

test('墙面不是地面：贴墙连续按跳跃不能刷新跳跃',async({page})=>{
  await boot(page);
  const result=await page.evaluate(()=>{
    const s=window.__course;s.manual=true;s.example();s.start();
    const wall=s.matter.add.rectangle(410,270,20,220,{isStatic:true});s.course.solids.push(wall);
    s.matter.body.setPosition(s.course.ball,{x:385,y:210});
    let grounds=0;
    for(let i=0;i<75;i++){s.fixedTick(1,i%5===0);if(s.course.grounded)grounds++;}
    return {grounds,...s.snapshot()};
  });
  expect(result.grounds).toBe(0);expect(result.jumps).toBe(0);expect(result.ball.y).toBeGreaterThan(250);
});

test('跳跃缓冲与土狼时间生效，空中不会二段跳',async({page})=>{
  await boot(page);
  const result=await page.evaluate(()=>{
    const s=window.__course;s.manual=true;s.example();s.start();
    s.matter.body.setPosition(s.course.ball,{x:300,y:370});s.matter.body.setVelocity(s.course.ball,{x:0,y:2});
    for(let i=0;i<30;i++)s.fixedTick(0,i===0);const buffered=s.snapshot();
    for(let i=0;i<20;i++)s.fixedTick(0,true);const noDouble=s.snapshot();
    s.redraw();s.example();s.start();for(let i=0;i<15;i++)s.fixedTick(0,false);
    const supported=s.course.grounded;s.matter.world.remove(s.course.solids);s.course.solids=[];
    for(let i=0;i<5;i++)s.fixedTick(1,false);s.fixedTick(1,true);const coyote=s.snapshot();
    return {buffered,noDouble,supported,coyote};
  });
  expect(result.buffered.jumps).toBe(1);expect(result.noDouble.jumps).toBe(1);expect(result.supported).toBe(true);expect(result.coyote.jumps).toBe(1);expect(result.coyote.ball.vy).toBeLessThan(0);
});

test('失焦暂停清空键位，暂停不计时，继续后不自动移动',async({page})=>{
  await boot(page);await page.locator('#example').click();await page.locator('#start').click();await page.keyboard.down('ArrowRight');
  await expect.poll(()=>page.evaluate(()=>window.__course.elapsed)).toBeGreaterThan(.1);
  const before=await page.evaluate(()=>{window.dispatchEvent(new Event('blur'));return window.__course.snapshot();});
  await expect(page.locator('#pause-panel')).toBeVisible();
  const stopped=await page.evaluate(()=>{const s=window.__course;for(let i=0;i<240;i++)s.fixedTick(1,true);return {state:s.snapshot(),axis:s.controls.axis};});
  expect(stopped.state.elapsed).toBe(before.elapsed);expect(stopped.state.ball.x).toBe(before.ball.x);expect(stopped.axis).toBe(0);
  await page.keyboard.up('ArrowRight');await page.locator('#resume').click();expect(await page.evaluate(()=>window.__course.paused)).toBe(false);
});

test('本地保存加载、自测及修改失效，坏存档和存储异常不崩溃',async({page})=>{
  await boot(page);
  await page.evaluate(()=>{const s=window.__course;s.manual=true;s.example();s.start();for(let i=0;i<1000&&s.phase==='running';i++)s.fixedTick(1,false);});
  await page.reload();await page.waitForFunction(()=>!!window.__course?.course);await page.locator('#load').click();
  expect(await page.evaluate(()=>window.__course.draft?.tested)).toBe(true);
  await page.locator('#redraw').click();await page.locator('#example').click();expect(await page.evaluate(()=>window.__course.draft?.tested)).toBe(false);
  await page.locator('#save').click();await page.locator('#redraw').click();await page.locator('#load').click();expect(await page.evaluate(()=>window.__course.draft?.best)).toBeNull();
  await page.evaluate(()=>localStorage.setItem('one-stroke:draft:connect','bad'));await page.locator('#load').click();await expect(page.locator('#message')).toContainText('无法加载草稿');
  await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new Error('quota');};});await page.locator('#save').click();await expect(page.locator('#message')).toContainText('保存失败');
});

test('画笔取消、拖出画布、多点干扰后可重新起笔',async({page})=>{
  await boot(page);const r=(await page.locator('canvas').boundingBox())!;
  const a={x:r.x+155*r.width/1100,y:r.y+410*r.height/560},b={x:r.x+955*r.width/1100,y:a.y};
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(a.x+50,a.y);
  await page.locator('canvas').dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();
  await expect(page.locator('#message')).toContainText('中断');await expect(page.locator('#start')).toBeDisabled();
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(r.x-10,a.y);await page.mouse.up();await expect(page.locator('#message')).toContainText('移出画布');
  await page.mouse.move(a.x,a.y);await page.mouse.down();
  await page.locator('canvas').dispatchEvent('pointerdown',{pointerId:99,isPrimary:false,clientX:a.x+80,clientY:a.y,button:0});
  await page.mouse.move(b.x,b.y,{steps:80});await page.mouse.up();await expect(page.locator('#start')).toBeEnabled();
});

test('手机横屏 DPR3：真实触摸画线及双指移动跳跃，竖屏有引导',async({browser})=>{
  const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const page=await context.newPage();await boot(page);
  const cdp=await context.newCDPSession(page),r=(await page.locator('canvas').boundingBox())!;
  const x=(v: number)=>r.x+v*r.width/1100,y=r.y+410*r.height/560;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x(155),y,id:1}]});
  for(let v=165;v<=955;v+=10)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x(v),y,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(page.locator('#start')).toBeEnabled();
  expect(await page.evaluate(()=>window.__course.snapshot().usedInk)).toBeCloseTo(800,0);
  await page.locator('#start').tap();await page.evaluate(()=>{window.__course.manual=true;for(let i=0;i<20;i++)window.__course.fixedTick(0,false);});
  const right=(await page.locator('[data-control=right]').boundingBox())!,jump=(await page.locator('[data-control=jump]').boundingBox())!;
  const finger1={x:right.x+right.width/2,y:right.y+right.height/2,id:1},finger2={x:jump.x+jump.width/2,y:jump.y+jump.height/2,id:2};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[finger1]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[finger1,finger2]});
  const pressed=await page.evaluate(()=>{const s=window.__course;const axis=s.controls.axis;for(let i=0;i<15;i++)s.fixedTick(s.controls.axis,s.controls.consumeJump());return {axis,...s.snapshot()};});
  expect(pressed.axis).toBe(1);expect(pressed.jumps).toBe(1);expect(pressed.ball.x).toBeGreaterThan(100);expect(pressed.ball.y).toBeLessThan(380);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});expect(await page.evaluate(()=>window.__course.controls.axis)).toBe(0);
  for(const rect of [right,jump]){expect(rect.y+rect.height).toBeLessThanOrEqual(390);expect(rect.x+rect.width).toBeLessThanOrEqual(844);}
  await page.screenshot({path:'docs/mobile-landscape.png'});
  await page.evaluate(()=>{const s=window.__course;for(let i=0;i<1000&&s.phase==='running';i++)s.fixedTick(1,false);});
  await expect(page.locator('#result-panel')).toBeVisible();
  const card=(await page.locator('.card.result').boundingBox())!;
  expect(card.y).toBeGreaterThanOrEqual(0);expect(card.y+card.height).toBeLessThanOrEqual(390);
  await page.screenshot({path:'docs/mobile-result.png'});await page.locator('#retry').tap();
  await page.setViewportSize({width:390,height:844});await expect(page.locator('#rotate')).toBeVisible();expect(await page.evaluate(()=>window.__course.paused)).toBe(true);
  await context.close();
});

test('全屏进入退出保留笔画和进度，浏览器没有未处理错误',async({page})=>{
  const errors: string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await boot(page);await page.locator('#example').click();
  await page.locator('#fullscreen').click();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
  await page.locator('#start').click();await page.evaluate(()=>{const s=window.__course;s.manual=true;for(let i=0;i<90;i++)s.fixedTick(1,false);});
  const before=await page.evaluate(()=>window.__course.snapshot());await page.locator('#fullscreen').click();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
  const after=await page.evaluate(()=>window.__course.snapshot());expect(after.points).toEqual(before.points);expect(after.stars).toBe(before.stars);expect(after.elapsed).toBe(before.elapsed);
  await page.evaluate(()=>{const s=window.__course;for(let i=0;i<1000&&s.phase==='running';i++)s.fixedTick(1,false);});
  await expect(page.locator('#result-score')).toHaveText('100 分');await page.screenshot({path:'docs/desktop-result.png'});expect(errors).toEqual([]);
});

test('开放轨道下方仍是空的，尖刺触发真实失败；未输入时球不会自动前进',async({page})=>{
  await boot(page);
  const result=await page.evaluate(()=>{
    const s=window.__course;s.manual=true;s.example();s.start();for(let i=0;i<240;i++)s.fixedTick(0,false);const idle=s.snapshot();
    s.matter.body.setPosition(s.course.ball,{x:500,y:460});for(let i=0;i<150&&s.phase==='running';i++)s.fixedTick(0,false);const pit=s.snapshot();
    s.select(0);s.level.hazards.push({x:480,y:430,w:40,h:30});s.example();s.start();s.level.hazards.pop();s.matter.body.setPosition(s.course.ball,{x:500,y:445});s.fixedTick(0,false);const spikes=s.snapshot();
    s.select(12);s.example();s.start();for(let i=0;i<1000&&s.phase==='running';i++)s.fixedTick(1,false);
    return {idle,pit,spikes,free:s.snapshot()};
  });
  expect(Math.abs(result.idle.ball.x-100)).toBeLessThan(.5);expect(result.idle.stars).toBe(0);
  expect(result.pit.failure).toContain('深坑');expect(result.spikes.failure).toContain('尖刺');expect(result.free.phase).toBe('success');
});

test('暂停菜单可以直接重跑或清空重画，几何信息与试跑结果分开',async({page})=>{
  await boot(page);await page.locator('#example').click();await page.locator('#start').click();await page.locator('#pause-button').click();
  await page.locator('#pause-retry').click();expect(await page.evaluate(()=>window.__course.phase)).toBe('running');
  await page.locator('#pause-button').click();await page.locator('#pause-redraw').click();await expect(page.locator('#start')).toBeDisabled();
  expect(await page.evaluate(()=>window.__course.points.length)).toBe(0);
});
