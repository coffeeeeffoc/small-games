import type { Graphics, Node } from 'cc';
import type { HUD } from './HUD';
import { MODS, STARTER_LOADOUT, type ModId, type Loadout } from './core/Armory.ts';

export interface ArmoryViewState {
  page: 'cover' | 'base' | 'shop' | 'daily' | 'loadout'; mode: 'solo' | 'duel'; selected: ModId;
  owned: Partial<Record<ModId, 0 | 1 | 2>>; kits: { solo: Loadout; duel: Loadout };
  coins: number; coolant: number; checkedIn: boolean; adClaimed: boolean; busy: boolean; message: string;
  available?: boolean; adsAvailable?: boolean; adChoice?: 'coins';
}
export function initialArmoryView(): ArmoryViewState {
  return { page: 'cover', mode: 'solo', selected: 'spread', owned: { power: 1, velocity: 1, duration: 1 },
    kits: { solo: STARTER_LOADOUT, duel: STARTER_LOADOUT }, coins: 0, coolant: 0, checkedIn: false,
    adClaimed: false, busy: false, message: '', available: false, adsAvailable: false };
}
const ids = Object.keys(MODS) as ModId[];
const english = { power: 'Power', velocity: 'Velocity', duration: 'Slow burn', spread: 'Dispersal', emp: 'EMP', coolant: 'Coolant' };
const glyph = { power: '▲', velocity: '»', duration: '◷', spread: '◎', emp: 'ϟ', coolant: '❄' };
const names = (u: HUD, id: ModId) => u.t(MODS[id].name[0], english[id]);
function effect(u: HUD, id: ModId, tier = 1) {
  const high = tier === 2;
  switch (id) {
    case 'power': return u.t('威力 ', 'Damage ') + (high ? '+16%' : '+8%');
    case 'velocity': return u.t('弹速 ', 'Velocity ') + (high ? '+22%' : '+12%');
    case 'duration': return u.t('燃烧 ', 'Burn ') + (high ? '31' : '28') + u.t(' 秒', 's');
    case 'spread': return u.t('面积 ', 'Area ') + (high ? '+44%' : '+25%');
    case 'emp': return u.t('2 发 · 停驶 2.5 秒', '2 shots · halt 2.5s');
    case 'coolant': return u.t('主动清热 1 次', 'Vent heat once');
  }
}
export function renderArmory(u: HUD, n: Node, g: Graphics, profile: string) {
  const a = u.armory, page = a.page, left = u.safe.left + 12, right = u.w - u.safe.right - 12,
    top = u.safe.top + 4, bottom = u.h - u.safe.bottom - 4, w = right - left, h = bottom - top,
    compact = w < 680 || h < 390, gap = compact ? 5 : 10, btnH = compact ? 44 : 50, footer = bottom - btnH;
  const t = (zh: string, en: string) => u.t(zh,en);
  const label = (str: string, x: number, y: number, width: number, height: number, size = 14, color = '#f4e8d1', bold = false) => {
    const l = u.label(n,str,x+width/2,y+height/2,size,width,height,color); l.isBold = bold; return l;
  };
  const box = (x: number,y: number,width: number,height: number,fill = '#0c1925df',edge = '#987c54') =>
    u.rect(g,x,y,width,height,fill,edge,3);
  const button = (id: string,str: string,x: number,y: number,width: number,height = btnH,primary = false,disabled = false) => {
    const l=u.menuButton(n,g,id,str,x,y,width,primary?'primary':'secondary','',height,disabled);
    l.fontSize=compact?12:15; l.lineHeight=l.fontSize*1.15; return l;
  };
  const coin = t('金币 ', 'Gold ') + Math.max(0,a.coins).toLocaleString('en-US');
  const has = (id: ModId) => id==='coolant'?a.coolant>0:!!a.owned[id];
  const tier = (id: ModId) => a.owned[id] || 1;
  const header = (str:string) => {
    box(left,top,w,46,'#0b1b26de');label(str,left+6,top,Math.min(w*.32,250),46,compact?19:26,'#f1d39a',true);
    label(coin,right-(page==='base'? Math.min(w*.38,270):155),top,page==='base'?Math.min(w*.22,145):148,46,compact?13:17);
  };
  const note = (str:string, y:number) => {
    if (!str) return;box(left,y,w,23,'#101f2eea','#52677a');label(str,left+4,y,w-8,23,compact?11:13,'#ffe1a2');
  };
  if (page === 'base') {
    header(t('作战基地','OPERATIONS BASE'));
    const profileX=left+w*.38,profileW=Math.min(145,w*.2);
    button('online:profile',profile,profileX,top,profileW,44);
    const twoRows=w<700, rows=twoRows?2:1, utilTop=bottom-rows*btnH-(rows-1)*gap;
    const entryX=left+w*.23, entryW=(right-entryX-gap)/2,entryY=Math.max(top+56,utilTop-btnH-gap-8);
    button('armory:solo',t('单人模式','SOLO MISSION'),entryX,entryY,entryW,btnH,true);
    button('armory:duel',t('双人对战','DUEL'),entryX+entryW+gap,entryY,entryW,btnH,true);
    const tools=[['armory:shop',t('军需商店','Armory')],['armory:daily',t('每日签到','Check-in')],['armory:ads',t('广告补给','Ad supply')],
      ['online:ranking',t('排行榜','Rankings')],['online:history',t('对战记录','Records')],['help',t('飞行手册','Guide')]];
    const cols=tools.length/rows,cell=(w-(cols-1)*gap)/cols;
    tools.forEach(([id,str],i)=>button(id,str,left+i%cols*(cell+gap),utilTop+Math.floor(i/cols)*(btnH+gap),cell));
    return;
  }
  header(page==='shop'?t('军需商店','QUARTERMASTER'):page==='daily'?t('每日军需','DAILY SUPPLY'):t('出击配置','FLIGHT LOADOUT'));
  button('armory:base',t('返回基地','Base'),left,footer,Math.min(120,w*.2));
  if (page==='daily') {
    const cardY=top+52, cardH=footer-gap-24-cardY, cw=(w-gap)/2, rx=left+cw+gap;
    box(left,cardY,cw,cardH,'#132534da');box(rx,cardY,cw,cardH,'#152537e0');
    label(t('每日签到','DAILY CHECK-IN'),left,cardY+3,cw,32,compact?17:22,'#edcf94',true);
    label(t('60 金币','60 GOLD'),left,cardY+cardH*.30,cw,36,compact?21:30,'#f6d79c',true);
    button('armory:checkin',a.checkedIn?t('今日已领取','Claimed today'):t('免费领取','Claim free'),left+8,cardY+cardH-btnH-6,cw-16,btnH,true,a.busy||a.checkedIn||a.available===false);
    label(t('广告补给 · 每日一次','AD SUPPLY · DAILY'),rx,cardY+3,cw,32,compact?16:21,'#edcf94',true);
    label(t('40 / 80 / 160 金币','40 / 80 / 160 GOLD')+'\n60% / 30% / 10%',rx,cardY+cardH*.26,cw,50,compact?13:17);
    button('armory:watch',a.adClaimed?t('今日已领','Claimed today'):a.adsAvailable===false?t('广告不可用','Unavailable'):t('看广告抽金币','Watch for gold'),rx+8,cardY+cardH-btnH-6,cw-16,btnH,true,a.busy||a.adClaimed||a.available===false||a.adsAvailable===false);
    note(a.message||(a.available===false?t('联网后可领取','Connect to claim'):t('签到免费。广告抽奖只发金币，不计入排行。','Check-in is free. Ad draws award gold only.')),footer-24); return;
  }
  const sel=a.selected, mod=MODS[sel], k=a.kits[a.mode], duel=a.mode==='duel', equipped=k.some(i=>i.id===sel);
  if(page==='shop') {
    const x=left+w*.52, rw=right-x, y=top+54, paneH=footer-27-y;
    const listW=w*.5, cell=(listW-gap)/2, cellH=Math.max(44,Math.min((paneH-2*gap)/3,64));
    ids.forEach((id,i)=>{
      const status=id==='coolant'?t('库存 ','Stock ')+a.coolant:has(id)?tier(id)===2?'II':'I':t('未解锁','Locked');
      button('armory:select:'+id,names(u,id)+'\n'+status,left+i%2*(cell+gap),y+Math.floor(i/2)*(cellH+gap),cell,cellH,sel===id);
    });
    box(x,y,rw,paneH,'#0b1927e0');label(glyph[sel]+'　'+names(u,sel),x+4,y+1,rw-8,32,compact?17:24,'#e3c48f',true);
    label(t('标准：','Standard: ')+effect(u,sel,1)+(mod.tune?'\n'+t('单人精调：','Solo tune: ')+effect(u,sel,2):''),x+4,y+35,rw-8,paneH-39,compact?13:17);
    const price=sel==='coolant'||!has(sel)?mod.price:tier(sel)===1?mod.tune:0;
    const caption=price===0?t('已永久拥有','Permanently owned'):(!has(sel)||sel==='coolant'?t('兑换','Unlock'):t('单人精调','Solo tune'))+' · '+price+t(' 金币',' gold');
    button('armory:buy',caption,x,footer,rw,btnH,true,a.busy||!price||a.coins<price||a.available===false);
    note(a.message||(a.available===false?t('离线 · 商店暂不可用','Offline · shop unavailable'):price>a.coins?t('还差 ','Need ')+(price-a.coins)+t(' 金币',' more gold'):t('购买不会自动替换本局装备','Buying never replaces an equipped module')),footer-24);return;
  }
  const y=top+52,slotW=(w-gap*2)/3,slotH=Math.min(96,Math.max(46,(h-178)*.46));
  for(let i=0;i<3;i++) {
    const item=k[i],x=left+i*(slotW+gap);
    if(item){const actual=duel?1:tier(item.id);button('armory:slot:'+i,'0'+(i+1)+'  '+names(u,item.id)+'\n'+effect(u,item.id,actual),x,y,slotW,slotH,sel===item.id);}
    else { box(x,y,slotW,slotH,'#112638ba','#758497');label('0'+(i+1)+'　＋ '+t('空槽','OPEN'),x,y,slotW,slotH,compact?14:18); }
  }
  const row=y+slotH+gap, col=(w-5*gap)/6;
  ids.forEach((id,i)=>button('armory:select:'+id,names(u,id),left+i*(col+gap),row,col,btnH,sel===id));
  const locked=duel&&sel==='coolant', full=!equipped&&k.length>=3, can=has(sel)&&!locked&&!full;
  const act=equipped?t('卸下','Remove'):locked?t('仅单人','Solo only'):!has(sel)?t('未拥有','Not owned'):full?t('已满三槽','Slots full'):t('装入','Equip');
  const chosen=names(u,sel)+' · '+effect(u,sel,duel?1:tier(sel));
  const infoY=row+btnH+3,infoH=footer-26-infoY;
  if(infoH>14)label(chosen,left,infoY,w,infoH,compact?12:16,'#f2d7a5');
  note(a.message||(duel?t('双人：同款统一标准档 · 对战只发排行积分','Duel: standard tier only · ranking points only'):t('单人使用已购档位 · 点已装备项可选择卸下','Solo uses owned tiers · select a fitted item to remove it')),footer-24);
  button('armory:toggle',act,left+w*.24,footer,w*.24,btnH,false,a.busy||(!equipped&&!can));
  button('armory:next',duel?t('下一步：进入大厅','Next: duel lobby'):t('下一步：选择关卡','Next: missions'),left+w*.52,footer,w*.48,btnH,true,a.busy);
}