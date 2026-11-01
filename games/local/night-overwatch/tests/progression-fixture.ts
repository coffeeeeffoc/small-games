import { CATALOG, PACKAGES, POOLS, WHEEL_PRIZES, emptyLoadout, levelProgress, type AssetSnapshot } from '../assets/scripts/core/Progression.ts';

// QA data only. Browser fixtures never write these balances to a real account.
export function assetFixture(playerId='qa-pilot'):AssetSnapshot {
  const now=Date.now(),day='2026-11-01',xp=13520;
  const inventory=Object.fromEntries(CATALOG.filter(p=>p.term!=='permanent').map(p=>[p.id,5]));
  for(let i=0;i<4;i++)inventory['pack:general:'+i]=3;
  return {playerId,version:3,coins:12480,xp,...levelProgress(xp),revision:1,inventory,available:{...inventory},permanent:['tracking','emp','power'],active:{},
    loadouts:{solo:{mods:['burst-match','twin-match'],weapon:'drone-match',skill:'tracking-permanent'},duel:emptyLoadout()},
    tasks:[['checkin','完成今日签到',1,1],['solo','完成2次单人任务',2,1],['duel','完成2次双人对战',2,0],['open','打开1个礼包',1,0]].map(([event,name,target,progress])=>({id:'task-'+event,day,event:String(event),name:String(name),target:Number(target),progress:Number(progress),reward:{coins:100,xp:40},claimed:false})),
    achievements:[{id:'sorties-10',name:'十次出动',event:'complete',target:10,progress:4,claimed:false,reward:{coins:300,xp:150,packs:2}}],
    mail:Array.from({length:4},(_,i)=>({id:'mail-'+i,title:i?'补给通知 '+i:'夜航回归补偿',body:'旧积分和进度保持不变。金币与经验独立累计，本次补偿只可领取一次。',createdAt:now-i*1000,read:false,claimed:false,reward:{coins:200,xp:80,packs:3}})),
    announcements:[{id:'news',title:'成长与军需更新',body:'单人和双人独立配装。主动技能可冷却后重复使用。',createdAt:now}],
    videoOrders:[{id:'video-order',purpose:'packs',quantity:5,required:3,completed:1,delivered:false,version:'night-growth-v1',createdAt:now}],
    wheelTickets:1,wheelVideosToday:0,wheelDailyLimit:5,wheelPrizes:WHEEL_PRIZES,
    openReceipts:[{requestId:'qa-opening',at:now,item:'pack:general:3',quantity:5,drops:[{item:'twin-match'},{item:'twin-match'},{coins:800},{item:'laser-match'},{coins:800}]}],signedDays:['2026-10-31'],signedToday:false,day,serverNow:now,videoDailyLimit:12,videosToday:1,catalog:CATALOG,packages:PACKAGES,pools:POOLS,quoteVersion:'night-growth-v1',adVerification:'limited-client-callback',legacyPreserved:true};
}
