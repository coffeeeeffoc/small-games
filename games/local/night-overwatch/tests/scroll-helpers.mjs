import assert from 'node:assert/strict';
import {snapshot,settleVisuals} from './flight-browser.mjs';
const touchSessions=new WeakMap();
// Real pointer input only; telemetry selects a visible scroll region, never mutates game state.
export async function scrollPage(page,key,amount){
 const state=await snapshot(page),area=key?state.scrollLists?.find(a=>a.key===key):state.scrollLists?.find(a=>a.max>0&&a.key!=='chat');
 assert(area,'Visible scroll region '+(key||''));const delta=amount??area.h*.7,x=area.x+area.w*.55,y=area.y+area.h*.75;
 if(await page.evaluate(()=>navigator.maxTouchPoints>0)){
  let cdp=touchSessions.get(page);if(!cdp){cdp=await page.context().newCDPSession(page);touchSessions.set(page,cdp);}const distance=Math.min(Math.abs(delta),area.h*.6)*(delta<0?-1:1),startY=delta<0?area.y+area.h*.2:y;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:startY}]});
  for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:startY-distance*i/8}]});
  // Chromium detaching a CDP input session resets touch emulation globally; keep it until context.close().
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }else{await page.mouse.move(x,y);await page.mouse.wheel(0,delta);}
 await settleVisuals(page);return snapshot(page);
}
export async function scrollToButton(page,id,key){
 for(let i=0;i<100;i++){const s=await snapshot(page),button=s.buttons.find(b=>b.id===id&&b.h>=32&&!b.disabled);if(button)return button;const area=key?s.scrollLists?.find(a=>a.key===key):s.scrollLists?.find(a=>a.max>0&&a.key!=='chat');assert(area,'Scroll region for '+id);if(area.offset>=area.max-1)await scrollPage(page,area.key,-area.max);else await scrollPage(page,area.key);}
 throw Error('Target not found by scrolling: '+id);
}
