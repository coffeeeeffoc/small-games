import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import rules from '../../../../services/runtime-api/rules/cops.mjs';
import { getDuelLevel } from '../src/duel-levels.js';
import { duelActions } from '../src/duel.js';
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge'});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto(process.env.BASE_URL||'http://127.0.0.1:43441');await page.waitForSelector('#start-mode');
 for(const mode of ['escape','survival'])for(const side of ['pursuer','runner']){
  const seat=side==='pursuer'?0:1, authoritative=rules.initial(99,mode,side), state=rules.view(authoritative,seat), level=getDuelLevel(mode,100);
  const action=duelActions(level,state.board).find(action=>action.target!==(side==='pursuer'?state.board.cops:state.board.robbers)[action.actor]);
  let hits=await page.evaluate(async state=>{
   const {createRenderer}=await import('/src/competition-renderer.js');const canvas=document.createElement('canvas');canvas.width=390;canvas.height=560;document.body.replaceChildren(canvas);document.body.style.margin='0';
   const renderer=createRenderer(),ctx=canvas.getContext('2d');window.actions=[];window.draw=()=>renderer.draw(ctx,390,560,state);
   canvas.addEventListener('click',event=>{const bounds=canvas.getBoundingClientRect(),action=renderer.tap(event.clientX-bounds.x,event.clientY-bounds.y,state);if(action)window.actions.push(action);window.draw();});
   return window.draw();
  },state);
  const selection=hits.find(hit=>hit.action.local===action.actor);await page.mouse.click(selection.x+selection.w/2,selection.y+selection.h/2);
  assert.equal((await page.evaluate(()=>window.actions)).length,0);
  hits=await page.evaluate(()=>window.draw());const target=hits.find(hit=>hit.action.target===action.target);
  await page.mouse.click(target.x+target.w/2,target.y+target.h/2);
  assert.deepEqual(await page.evaluate(()=>window.actions),[action]);
  assert.equal(rules.action(authoritative,action,1000,seat).board.turn,1);
 }
 await page.screenshot({path:'outputs/competition-canvas.png'});console.log('PASS Canvas real selection + role-specific move intents, both roles/modes, legal server execution');
}finally{await browser.close();}
