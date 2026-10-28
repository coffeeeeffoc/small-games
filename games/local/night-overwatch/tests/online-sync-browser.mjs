import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '@coffeeeeffoc/service-kit';
import { sql } from 'drizzle-orm';
import { acceptanceBuild, snapshot, assertLayout } from './flight-browser.mjs';
import { press, settleVisuals } from './visual-helpers.mjs';

const base=process.env.NIGHT_URL, api=process.env.NIGHT_LOBBY_URL, databaseUrl=process.env.COMPETITION_TEST_DATABASE_URL;
assert(base&&api&&databaseUrl,'Use the isolated local HTTP/PostgreSQL fixture');
for(const value of [base,api,databaseUrl])assert(['127.0.0.1','localhost','[::1]'].includes(new URL(value).hostname));
assert.equal(new URL(databaseUrl).pathname,'/competition_test');
const build=await acceptanceBuild(base), database=openDatabase(databaseUrl,'runtime');
const out=new URL(process.env.NIGHT_REPORT_URL||'../reports/online-sync/',import.meta.url);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
const evidence={build,environment:'Local HTTP/PostgreSQL; settlement accelerated by eliminating fixture units, not a natural gameplay capture',checks:[],errors:[]};
const labels=page=>page.evaluate(async()=>{
  const {director,Label}=await System.import('cc');
  return director.getScene().getComponentsInChildren(Label).filter(l=>l.node.activeInHierarchy).map(l=>({text:l.string,color:l.color.toHEX('#rrggbb')}));
});
try {
  await database.db.execute(sql`delete from runtime.competition_actions where room_code in (select code from runtime.competition_rooms where data->>'game'='night-overwatch')`);
  await database.db.execute(sql`delete from runtime.competition_rooms where data->>'game'='night-overwatch'`);
  for(const [width,height] of [[568,320],[844,390],[1280,720]]) {
    const contexts=[];
    const make=async()=>{
      const context=await browser.newContext({viewport:{width,height},hasTouch:width<1000,isMobile:width<1000}); contexts.push(context);
      await context.addInitScript(()=>localStorage.setItem('night-overwatch-coach-v2','done'));
      const page=await context.newPage(); page.setDefaultTimeout(60000);
      page.on('pageerror',error=>evidence.errors.push(error.message));
      await page.route('**/game-service-config.js',route=>route.fulfill({contentType:'text/javascript',body:'globalThis.__COMPETITION_CONFIG__='+JSON.stringify({game:'night-overwatch',platform:'h5',competitionEnabled:true,apiUrl:api})}));
      await page.goto(base+'?dev=0');
      await page.waitForFunction(()=>globalThis.__night?.snapshot().online?.identity.playerId&&!document.getElementById('night-startup'));
      await settleVisuals(page);return page;
    };
    const a=await make(), b=await make(), hit=(p,id)=>press(p,id,width<1000);
    const shot=async(p,name)=>{await settleVisuals(p);const s=await snapshot(p);assertLayout(s,width,height);assert(!s.buttons.some(x=>x.id==='settings'));await p.screenshot({path:fileURLToPath(new URL(name+'-'+width+'.png',out))});};
    try {
      await hit(a,'online:menu');await hit(a,'online:friend');await hit(a,'online:createConfirm');
      await a.waitForFunction(()=>__night.snapshot().online.room?.status==='waiting');
      const code=(await snapshot(a)).online.room.code;
      await hit(b,'online:menu');await b.waitForFunction(code=>__night.snapshot().buttons.some(x=>x.id==='online:joinCode:'+code),code);await hit(b,'online:joinCode:'+code);
      await a.waitForFunction(()=>__night.snapshot().online.room?.players.length===2);
      await hit(a,'online:ready');await a.waitForFunction(()=>__night.snapshot().online.room.players[0].ready);
      assert((await labels(a)).some(l=>l.text==='取消准备'));assert(!(await labels(a)).some(l=>l.text.includes('正在连接')));
      await shot(a,'ready'); await hit(a,'online:ready');await a.waitForFunction(()=>!__night.snapshot().online.room.players[0].ready);
      await hit(b,'online:ready');await b.waitForFunction(()=>__night.snapshot().online.room.players[1].ready);
      assert.equal((await snapshot(b)).online.room.status,'waiting');
      await hit(a,'online:backLobby');await b.waitForFunction(()=>__night.snapshot().online.room.players.length===1);
      assert.equal((await snapshot(b)).online.room.code,code);assert(!(await snapshot(b)).online.room.players[0].ready);await shot(b,'one-player');
      await a.waitForFunction(code=>__night.snapshot().buttons.some(x=>x.id==='online:joinCode:'+code),code);await hit(a,'online:joinCode:'+code);
      await a.waitForFunction(()=>__night.snapshot().online.room?.players.length===2);
      const id=(await snapshot(a)).online.identity.playerId;
      await a.evaluate(async()=>{await globalThis.SmallGamesServices.services.updateProfile({nickname:'同步后的新昵称'});});
      await b.waitForFunction(id=>__night.snapshot().online.room.players.some(p=>(p.playerId||p.userId||p.id)===id&&p.nickname==='同步后的新昵称'),id);
      await hit(a,'online:ready');await hit(b,'online:ready');
      for(const p of [a,b])await p.waitForFunction(()=>__night.snapshot().phase==='playing'&&__night.snapshot().modal==='');
      await hit(a,'settings');
      const ownSeat=(await snapshot(a)).online.room.you;
      const rows=await database.db.execute(sql`select data from runtime.competition_rooms where code=${code} and data->>'game'='night-overwatch'`);
      const room=rows[0].data;assert(room.players.some(p=>p.id===id));
      for(const unit of room.players[0].state.simulation.units)if(unit.group===1-ownSeat)unit.hp=0;
      await database.db.execute(sql`update runtime.competition_rooms set data=${JSON.stringify(room)}::jsonb where code=${code}`);
      for(const p of [a,b])await p.waitForFunction(()=>__night.snapshot().modal==='duelResult');
      assert((await labels(a)).some(l=>l.text==='战斗胜利'));assert((await labels(b)).some(l=>l.text==='战斗失败'));
      assert.equal((await snapshot(a)).online.room.settlement.outcome,'win');assert.equal((await snapshot(b)).online.room.settlement.outcome,'loss');
      await shot(a,'victory');await shot(b,'defeat');
      await hit(a,'online:backLobby');await hit(a,'online:bot');await a.waitForFunction(()=>__night.snapshot().phase==='playing'&&__night.snapshot().modal==='');
      const botCode=(await snapshot(a)).online.room.code;
      await hit(a,'settings');await hit(a,'home');await hit(a,'exitConfirm');
      await a.waitForFunction(()=>__night.snapshot().modal.startsWith('online:menu'));await hit(a,'online:match');
      await a.waitForFunction(()=>__night.snapshot().online.room?.status==='waiting');
      const matched=(await snapshot(a)).online.room;assert.notEqual(matched.code,botCode);assert.notEqual(matched.mode,'bot');assert.equal(matched.state,null);
      await shot(a,'human-match');await hit(a,'online:backLobby');await hit(a,'online:back');
      await hit(a,'online:ranking');await a.waitForFunction(()=>!!__night.snapshot().online.ranking);await shot(a,'ranking');
      await hit(a,'online:board:level');await a.waitForFunction(()=>!!__night.snapshot().online.ranking);await shot(a,'level-navigation');
      evidence.checks.push({width,height,readyCancel:true,hostLeave:true,renameFromOtherPlayer:true,settlementOverSettings:true,winLoss:true,botToHuman:true});
    } finally {for(const context of contexts)await context.close();}
  }
  assert.deepEqual(evidence.errors,[]);
  await writeFile(new URL('evidence.json',out),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
} finally {await browser.close();await database.close();}
