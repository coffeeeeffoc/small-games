import type { Graphics, Node } from 'cc';
import type { HUD } from './HUD';
import { MODS, STARTER_LOADOUT, SHOP_IDS, LOTTERY, empDuration, trialKey, priceFor, type ModId, type Loadout, type Owned, type Tier, type TrialStock } from './core/Armory.ts';

export interface ArmoryViewState {
  page: 'cover' | 'base' | 'shop' | 'daily' | 'loadout' | 'lottery' | 'trials'; mode: 'solo' | 'duel'; selected: ModId;
  owned: Owned; kits: { solo: Loadout; duel: Loadout };
  coins: number; coolant: number; checkedIn: boolean; adClaimed: boolean; busy: boolean; message: string;
  available?: boolean; adsAvailable?: boolean; adChoice?: 'coins';
  trials:TrialStock; trialChoices:Owned; extraWeapons:ModId[]; signedDays:string[]; day:string; selectedTier:Tier; prize?:{id:ModId;tier:Tier};
}
export function initialArmoryView(): ArmoryViewState {
  return { page: 'base', mode: 'solo', selected: 'hePower', owned: { hePower: 1, heVelocity: 1, heavyPower: 1 },
    kits: { solo: STARTER_LOADOUT, duel: STARTER_LOADOUT }, coins: 0, coolant: 0, checkedIn: false,
    adClaimed: false, busy: false, message: '', available: false, adsAvailable: false,
    trials:{},trialChoices:{},extraWeapons:[],signedDays:[],day:new Date(Date.now()+8*3600000).toISOString().slice(0,10),selectedTier:1 };
}

const names = (u: HUD, id: ModId) => u.t(MODS[id].name[0], MODS[id].name[1]);
const ranks = ['','I','II','III'];
function effect(u:HUD,id:ModId,tier:number) {
  if(id==='emp')return u.t('停驶 ','Halt ')+empDuration(tier as Tier)+u.t('秒','s');
  if(id==='spread')return u.t('面积 ','Area ')+[0,25,44,69][tier]+'%';
  if(id==='duration')return u.t('燃烧 ','Burn ')+(tier===2?31:28)+u.t('秒','s');
  if(id==='coolant')return u.t('清热一次','Vent once');
  return (id.toLowerCase().includes('velocity')?u.t('弹速 +','Speed +')+[0,12,22,32][tier]:u.t('威力 +','Damage +')+[0,8,16,24][tier])+'%';
}
export function renderArmory(u:HUD,n:Node,g:Graphics,profile:string) {
  const a=u.armory,page=a.page,left=u.safe.left+12,right=u.w-u.safe.right-12,
    top=u.safe.top+4,bottom=u.h-u.safe.bottom-4,w=right-left,h=bottom-top,
    compact=w<680||h<390,gap=compact?5:10,bh=44,foot=bottom-bh;
  const t=(zh:string,en:string)=>u.t(zh,en);
  const label=(str:string,x:number,y:number,width:number,height:number,size=14,color='#efe4cf',bold=false)=>{
    const l=u.label(n,str,x+width/2,y+height/2,size,width,height,color);l.isBold=bold;return l;
  };
  const box=(x:number,y:number,width:number,height:number,fill='#0b1b29df',edge='#647581')=>
    u.rect(g,x,y,width,height,fill,edge,3);
  const button=(id:string,str:string,x:number,y:number,width:number,height=bh,primary=false,disabled=false)=>{
    if(disabled&&!primary)box(x+2,y+4,width-4,height-8,'#0b1b29f2','#536675');
    const l=u.menuButton(n,g,id,str,x,y,width,primary?'primary':'secondary','',height,disabled);
    l.fontSize=compact?11:15;l.lineHeight=l.fontSize*1.25;return l;
  };
  const note=(text:string,y=foot-24)=>label(text,left,y,w,22,compact?10:13,'#f3d28e');
  const coin=t('金币 ','Gold ')+Math.max(0,a.coins).toLocaleString('en-US');
  const header=(str:string)=>{
    box(left,top,w,46,'#091a25e8','#63798b');
    label(str,left+6,top,w*.53,46,compact?19:26,'#f1d39a',true);
    const coinX=page==='base'?(u.touch?right-82:right-146):right-146;
    label(coin,coinX,top,page==='base'&&u.touch?80:140,46,compact?12:17);
  };
  if(page==='base'||page==='loadout'||page==='cover') {
    header(t('夜航守望 · 作战基地','NIGHT OVERWATCH'));
    const side=Math.max(100,Math.min(210,w*.23)),main=w-side-gap,sx=right-side,y=top+53;
    const cardW=(main-3*gap)/4,cardH=Math.min(82,Math.max(48,h*.22));
    const kit=a.kits.solo, tier=(id:ModId)=>kit.find(x=>x.id===id)?.tier||0;
    const stats=(ids:ModId[])=>ids.filter(id=>tier(id)).map(id=>effect(u,id,tier(id))).join(' · ')||t('标准配置','Standard');
    [t('速射炮','RAPID'),t('榴弹炮','HE CANNON'),t('重炮','HEAVY'),t('燃烧弹','INCENDIARY')].forEach((name,i)=>{
      const x=left+i*(cardW+gap);box(x,y,cardW,cardH,'#102b3be9','#647b8c');
      label(name,x+2,y+3,cardW-4,23,compact?13:18,'#cce5ec',true);
      label([t('常驻武器','Always carried'),stats(['hePower','heVelocity']),stats(['heavyPower','heavyVelocity']),stats(['spread','duration'])][i],
        x+3,y+26,cardW-6,cardH-28,compact?10:12);
    });
    const sy=y+cardH+25,sh=Math.min(76,Math.max(44,h*.18)),slotW=(main-2*gap)/3;
    label(t('额外挂载 · 三个新武器槽','EXTRA RACK · THREE NEW WEAPON SLOTS'),left,y+cardH+3,main,22,compact?11:14,'#e4bf78');
    for(let i=0;i<3;i++){
      const id=a.extraWeapons[i],x=left+i*(slotW+gap);
      if(id)button('armory:slot:'+i,names(u,id)+'\n'+t('已装载 · 点击卸下','Fitted · remove'),x,sy,slotW,sh,true,a.busy);
      else if(i===a.extraWeapons.length&&!a.extraWeapons.includes('emp'))
        button('armory:weapon:emp',t('＋ 电磁打击','＋ EMP strike')+'\n'+(a.owned.emp||a.trialChoices.emp?t('点击装载','Fit weapon'):t('商店解锁 / 抽奖试用','Unlock / trial')),x,sy,slotW,sh,false,a.busy||!a.owned.emp&&!a.trialChoices.emp);
      else{box(x,sy,slotW,sh,'#0b1b29ce','#6e695d');label(t('额外槽 ','EXTRA ')+(i+1)+'\n'+t('空置','Empty'),x,sy,slotW,sh,compact?11:15,'#a7bac3');}
    }
    const iy=Math.min(foot-49,sy+sh+8),iw=Math.min(150,main*.43);
    button('armory:trials',t('一次性库存','Trial inventory'),left,iy,iw);
    label(t('强化自动生效，不占槽','Upgrades apply without using slots')+'\n'+t('本次试用 ','Trials selected ')+kit.filter(x=>x.trial).length,
      left+iw+gap,iy,main-iw-gap,44,compact?10:13,'#e1c691');
    const sideGap=Math.max(4,Math.min(18,(foot-y-4*44)/3));
    [['armory:shop',t('军需商店','Armory')],['armory:daily',a.checkedIn?t('签到 · 已领取','Checked in'):t('每日签到','Check-in')],
      ['online:ranking',t('战绩 · 排行与记录','Rankings & records')],['online:profile',profile]].forEach(([id,str],i)=>
      button(id,str,sx,y+i*(bh+sideGap),side,bh,id==='armory:shop'));
    const mw=(main-gap)/2;
    button('armory:solo',t('单人模式','SOLO'),left,foot,mw,bh,true,a.busy);
    button('armory:duel',t('双人对战','DUEL'),left+mw+gap,foot,mw,bh,true,a.busy);
    button('help',t('飞行手册','Guide'),sx,foot,side);
    return;
  }
  header(page==='shop'?t('军需商店','QUARTERMASTER'):page==='daily'?t('每日签到','CHECK-IN CALENDAR'):page==='lottery'?t('抽奖活动','REWARD DRAW'):t('一次性库存','TRIAL INVENTORY'));
  button('armory:base',t('返回基地','Base'),left,foot,Math.min(124,w*.23));
  if(page==='daily') {
    const valid=/^\d{4}-\d\d-\d\d$/.test(a.day)?a.day:new Date(Date.now()+8*3600000).toISOString().slice(0,10);
    const year=Number(valid.slice(0,4)),month=Number(valid.slice(5,7)),first=(new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7,
      days=new Date(Date.UTC(year,month,0)).getUTCDate(),rows=Math.ceil((first+days)/7);
    const side=Math.min(230,w*.3),cw=w-side-gap,x=left+cw+gap,cy=top+81,ch=foot-8-cy,cellW=cw/7,cellH=(ch-19)/rows;
    box(left,top+50,cw,50,'#0b1b29ef','#41596a');
    label(year+t(' 年 ',' / ')+month+t(' 月',''),left,top+50,cw,28,compact?16:22,'#eac78a',true);
    ['一','二','三','四','五','六','日'].forEach((day,i)=>label(u.lang==='zh'?day:['M','T','W','T','F','S','S'][i],left+i*cellW+2,cy,cellW-4,18,11,'#9fb5c1'));
    for(let d=1;d<=days;d++){
      const at=first+d-1,dx=left+at%7*cellW,dy=cy+19+Math.floor(at/7)*cellH,key=valid.slice(0,8)+String(d).padStart(2,'0'),signed=a.signedDays.includes(key),today=key===valid;
      box(dx+2,dy+1,cellW-4,cellH-2,signed?'#244c42ed':today?'#514124ef':'#102333d9',today?'#eac888':'#355063');
      label(String(d)+(signed?' ✓':''),dx+2,dy+1,cellW-4,cellH-2,compact?11:16,signed?'#a8ead0':today?'#ffe1a1':'#d8e1e6',today);
    }
    box(x,top+56,side,foot-8-(top+56),'#122735e8');
    label(t('每日可领','DAILY REWARD')+'\n60 '+t('金币','GOLD'),x+4,top+66,side-8,70,compact?18:25,'#f4d497',true);
    label(a.checkedIn?t('今天已签到','Claimed today'):t('点击签到领取金币','Tap to collect today'),x+5,top+141,side-10,42,compact?11:14);
    button('armory:checkin',a.checkedIn?t('已签到','Claimed'):t('签到 · 领取60金币','Check in · 60 gold'),x+5,foot-58,side-10,bh,true,a.busy||a.checkedIn||a.available===false);
    box(left+Math.min(124,w*.23)+gap,foot,w-Math.min(124,w*.23)-gap,44,'#0b1b29ef','#41596a');
    label(a.message||t('北京时间每日更新','Resets daily · UTC+8'),left+Math.min(124,w*.23)+gap,foot,w-Math.min(124,w*.23)-gap,44,compact?11:13,'#ebc989');return;
  }
  if(page==='lottery') {
    const y=top+57,cardW=(w-2*gap)/3,cardH=Math.max(44,(foot-57-y-gap)/2);
    SHOP_IDS.forEach((id,i)=>{
      const x=left+i%3*(cardW+gap),yy=y+Math.floor(i/3)*(cardH+gap);
      box(x,yy,cardW,cardH,'#132c3bdd',id===a.prize?.id?'#edc778':'#607989');
      label(names(u,id),x+3,yy+3,cardW-6,22,compact?13:19,'#f1d69b',true);
      label(t('I / II / III · 每档约','I / II / III · ~')+(100/LOTTERY.length).toFixed(2)+'%',x+3,yy+27,cardW-6,cardH-30,compact?10:13);
    });
    note(a.message||t('每看完一次广告抽一次，无每日上限；商品入库存，仅一场有效。','One completed ad, one trial. Unlimited daily draws. Use in one battle.'),foot-51);
    button('armory:shop',t('返回商店','Shop'),left+Math.min(124,w*.23)+gap,foot,Math.min(110,w*.2));
    button('armory:watch',a.busy?t('正在处理…','Please wait…'):a.adsAvailable===false?t('广告暂不可用','Ad unavailable'):t('看广告 · 抽取一次','Watch ad · draw once'),left+w*.51,foot,w*.49,bh,true,a.busy||a.available===false||a.adsAvailable===false);
    label(a.prize?names(u,a.prize.id)+' '+ranks[a.prize.tier]+t(' 已存入库存',' saved to inventory'):t('中奖商品不会自动启用','Select prizes from inventory before battle'),left,foot-28,w,22,compact?11:14,'#e9d1a4');
    return;
  }
  const columns=6,col=(w-gap*(columns-1))/columns,headY=top+49,gridY=headY+27,
    rowH=Math.max(44,Math.min(86,(foot-28-gridY-2*gap)/3));
  SHOP_IDS.forEach((id,i)=>{
    const x=left+i*(col+gap),title=names(u,id);
    box(x,headY,col,27,'#152c3ce8','#67818e');label(title,x,headY,col,27,compact?11:16,'#efd3a2',true);
    MODS[id].prices.forEach((_price,j)=>{
      const tier=(j+1) as Tier,yy=gridY+j*(rowH+gap),own=a.owned[id]||0,stock=a.trials[trialKey(id,tier)]||0,
        chosen=a.trialChoices[id]===tier,shop=page==='shop',selected=shop&&a.selected===id&&a.selectedTier===tier;
      const state=shop?own>=tier?t('已拥有','Owned'):priceFor(id,tier)+t(' 金币',' gold'):chosen?t('本次启用','Selected'):t('库存 ×','Stock ×')+stock;
      button(shop?'armory:offer:'+id+':'+tier:'armory:trial:'+id+':'+tier,
        (ranks[tier]+' · '+effect(u,id,tier))+'\n'+state,x,yy,col,rowH,shop?selected:chosen,
        a.busy||(!shop&&(!stock||tier<=own)));
    });
  });
  if(page==='shop'){
    const own=a.owned[a.selected]||0,price=priceFor(a.selected,a.selectedTier),next=a.selectedTier===own+1,can=price>0&&next&&a.coins>=price&&a.available!==false;
    note(a.message||t('逐档兑换，强化自动生效。新武器解锁后可装入额外槽。','Upgrade in order. Enhancements apply automatically; fit new weapons separately.'));
    button('armory:lottery',t('抽奖活动','Reward draw'),left+Math.min(124,w*.23)+gap,foot,Math.min(110,w*.2));
    button('armory:buy',own>=a.selectedTier?t('已拥有此档','Already owned'):!next?t('请先兑换上一档','Unlock the previous tier first'):t('兑换 · ','Buy · ')+price+t(' 金币',' gold'),
      left+w*.52,foot,w*.48,bh,true,a.busy||!can);
  } else {
    note(a.message||t('点选试用品；实际开战扣除。新武器试用还需装入额外槽。','Select trials. Consume on battle start. Trial weapons also need an extra slot.'));
    button('armory:shop',t('前往商店','Shop'),right-Math.min(150,w*.3),foot,Math.min(150,w*.3));
  }
}
