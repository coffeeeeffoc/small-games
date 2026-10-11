import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { browserEvidence, touchPath } from './browser-evidence.mjs';
import { LEVELS } from '../src/levels.ts';
import { findHint, normalizeAngle } from '../src/core.ts';
import { pickTouchRing } from '../src/touch.ts';
const env=await browserEvidence();const {page,base,shot}=env;
const action=name=>page.locator(`[data-action="${name}"]`).first();
const snap=()=>page.evaluate(()=>window.SmallGamesDev.inspect().game);
async function release(cancel=false) {
  const before=await snap(),hint=findHint(before.state),ring=before.state.rings.find(r=>r.id===hint.ringId);
  let angle;
  for(let i=0;i<80;i++) {const a=i*Math.PI*2/80,p={x:ring.x+ring.r*Math.cos(a),y:ring.y+ring.r*Math.sin(a)};if(Math.abs(normalizeAngle(a-ring.angle))>ring.gap/2+0.2&&pickTouchRing(before.state,p,1,before.selectedRingId)?.id===ring.id){angle=a;break;}}
  assert.notEqual(angle,undefined);
  const matrix=await page.locator('[data-scene]').evaluate(g=>{const m=g.getScreenCTM();return [m.a,m.b,m.c,m.d,m.e,m.f];});
  const [a,b,c,d,e,f]=matrix,delta=normalizeAngle(hint.angle-ring.angle),count=Math.max(2,Math.ceil(Math.abs(delta)/0.07));
  const points=Array.from({length:count+1},(_,i)=>{const t=angle+delta*i/count,x=ring.x+ring.r*Math.cos(t),y=ring.y+ring.r*Math.sin(t);return{x:a*x+c*y+e,y:b*x+d*y+f};});
  await touchPath(page,points,cancel);
  if(cancel) assert.deepEqual((await snap()).state,before.state);
  else await expect.poll(async()=>(await snap()).state.releasedCount).toBe(before.state.releasedCount+1);
  await page.waitForTimeout(360);
}
try {
  await page.goto(base+'?dev=1'); await action('start').tap();
  await release(true); await release();
  const normal=await page.evaluate(()=>localStorage.getItem('orbit-atelier.v1'));
  const invited=LEVELS[1].id;
  await page.goto(base+`?dev=1&challenge=${invited}&token=private`);
  assert.equal((await snap()).challenge,true);
  assert.equal(await page.evaluate(()=>localStorage.getItem('orbit-atelier.v1')),normal);
  await shot('challenge-playing');
  await action('hint').tap();
  await release();
  await action('undo').tap();
  assert.equal((await snap()).hints,1,'undo cannot erase the clue already seen');
  await action('pause').tap(); await shot('challenge-paused');await action('resume').tap();
  for(let i=0;i<10&&(await snap()).screen!=='result';i++) await release();
  await expect(page.locator('#orbit-app')).toHaveAttribute('data-screen','result');
  await shot('challenge-result');
  assert.equal(await page.evaluate(()=>localStorage.getItem('orbit-atelier.v1')),normal,'challenge settlement never grants mainline progress');
  await action('share').tap();
  await expect(page.locator('#share-status')).toContainText('已复制');
  const publicLink=await page.evaluate(()=>window.__copies.at(-1));
  assert.deepEqual([...new URL(publicLink).searchParams], [['challenge',invited]]);
  await page.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw new DOMException('cancel','AbortError');}}));
  await action('share').tap(); await expect(page.locator('#share-status')).toContainText('已取消');
  assert.equal(await page.evaluate(()=>window.__copies.length),1);
  await action('home').tap();await action('start').tap();
  assert.equal((await snap()).challenge,false);assert.equal((await snap()).state.levelId,LEVELS[0].id);assert.equal((await snap()).state.releasedCount,1);
  await page.setViewportSize({width:320,height:568});await action('pause').tap();await shot('challenge-return-small');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.addInitScript(()=>{window.SmallGamesPublishingConfig={adMode:'off',publicUrl:'https://play.example.test/orbit/?private=secret'};});
  await page.goto(base+'?dev=1');await action('start').tap();
  for(let round=0;round<3;round++) {
    for(let i=0;i<10&&(await snap()).screen!=='result';i++) await release();
    await expect(page.locator('#orbit-app')).toHaveAttribute('data-screen','result');
    await expect(page.locator('[data-game-ad]')).toHaveCount(0);
    if(round<2) await action('retry').tap();
  }
  await action('share').tap();await expect(page.locator('#share-status')).toContainText('已复制');
  const configured=new URL(await page.evaluate(()=>window.__copies.at(-1)));
  assert.equal(configured.origin,'https://play.example.test');assert.deepEqual([...configured.searchParams],[['challenge','orbit-01']]);
  assert.deepEqual(env.errors,[]);
  console.log('PASS orbit publishing: real touch cancel/clear/undo; clue count cannot be undone; isolated same-board share; sanitized/cancelled links; mainline recovery; 320px pause.');
} finally {await env.close();}
