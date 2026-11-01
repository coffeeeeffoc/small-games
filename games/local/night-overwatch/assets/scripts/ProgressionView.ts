import { Color, Label, Node, Graphics, Sprite, UITransform, Mask, UIOpacity, tween } from 'cc';
import type { HUD } from './HUD';
import { playerLabel } from './Online';
import { ProgressionArt } from './ProgressionArt';
import { Quartermaster, effectEnglish, wheelLandingAngle } from './Quartermaster';
import { CATALOG, PACKAGES, POOLS, SKILLS, WHEEL_PRIZES, eligibleDrops, attackPreview, type Product, type Effect, type AssetReward } from './core/Progression';
import { formatTime } from './core/BattleRecords';
import { text } from './core/Data';
import type { Simulation } from './core/Simulation';
import { MISSIONS } from './core/MissionCatalog';

const ivory='#f4e9d1',dim='#a7bcc9',cyan='#78e3ff',gold='#e5bd71';
const color=(hex:string)=>new Color().fromHEX(hex);
const names:Record<string,[string,string]>={modes:['开始行动','DEPLOY'],loadout:['作战配置','LOADOUT'],shop:['军需商店','ARMORY'],supply:['礼包·抽奖','SUPPLY & WHEEL'],growth:['等级成长','GROWTH & SKILLS'],tasks:['任务','TASKS'],inbox:['消息中心','MESSAGES'],warehouse:['我的仓库','WAREHOUSE'],receipts:['开包记录','OPENING HISTORY'],checkin:['每日签到','DAILY CHECK-IN'],probability:['概率与内容','CONTENTS & ODDS']};
const rarity=['普通','精良','稀有','史诗'],rarityEn=['Common','Fine','Rare','Epic'],rarityColor=['#b8c0c7','#74cf9c','#69b7ff','#d08aff'];

/** One responsive Cocos presentation for the approved nine screens, with live text and touch targets. */
export class ProgressionView {
  private h:HUD;private q:Quartermaster;private a:ProgressionArt;private n:Node;private g:Graphics;private surfaces:Node;
  private w:number;private height:number;private left:number;private right:number;private top:number;private bottom:number;private scale:number;
  constructor(h:HUD,q:Quartermaster,a:ProgressionArt,n:Node,g:Graphics,surfaces:Node){
    this.h=h;this.q=q;this.a=a;this.n=n;this.g=g;this.surfaces=surfaces;this.w=h.w;this.height=h.h;
    this.left=h.safe.left+Math.max(12,h.w*.016);this.right=h.w-h.safe.right-Math.max(12,h.w*.016);
    this.top=h.safe.top+Math.max(52,h.h*.1);this.bottom=h.h-h.safe.bottom-12;this.scale=Math.min(h.w/1672,h.h/941);
  }
  private t(zh:string,en:string){return this.h.t(zh,en);}
  private get narrow(){return this.right-this.left<660;}
  private get low(){return this.height<500;}
  private font(size:number,min=12){return Math.max(min,size*this.scale);}
  private label(value:string,x:number,y:number,w:number,h:number,size=26,tone=ivory,serif=false,left=false){
    const money=/^● [\d—]/.test(value);if(money){const d=Math.min(24,h-4);this.coin(x,y+(h-d)/2,d);value=value.slice(2);x+=d+5;w-=d+5;}
    const l=this.h.label(this.n,value,x+w/2,y+h/2,this.font(size),w,h,tone);
    l.lineHeight=l.fontSize*1.23;l.isBold=serif;if(money){l.enableWrapText=false;l.overflow=Label.Overflow.SHRINK;}
    if(serif&&this.h.lang==='zh'&&this.a.font){l.font=this.a.font;l.useSystemFont=false;}
    if(left)l.horizontalAlign=Label.HorizontalAlign.LEFT;
    return l;
  }
  private coin(x:number,y:number,d:number){
    const g=this.g,cx=x+d/2-this.w/2,cy=this.height/2-y-d/2;
    g.fillColor=color('#d59a2d');g.strokeColor=color('#ffe8a1');g.lineWidth=1;g.circle(cx,cy,d*.44);g.fill();g.stroke();
    g.fillColor=color('#f4c85d');g.circle(cx-d*.04,cy+d*.04,d*.32);g.fill();
    g.strokeColor=color('#9d6519');g.lineWidth=Math.max(1,d*.07);g.circle(cx,cy,d*.30);g.stroke();
    g.moveTo(cx,cy+d*.17);g.lineTo(cx,cy-d*.17);g.moveTo(cx-d*.1,cy+d*.08);g.lineTo(cx+d*.1,cy+d*.08);g.moveTo(cx-d*.1,cy-d*.08);g.lineTo(cx+d*.1,cy-d*.08);g.stroke();
  }
  private picture(key:string,x:number,y:number,w:number,h:number,cover=true){
    const frame=this.a.get(key);if(!frame)return;
    if(cover&&!['closedCrate','openCrate','powerGear','rateGear','radiusGear','droneGear','coolingGear','burstGear','coinPile'].includes(key))this.h.coverImage(this.surfaces,'Illustration:'+key,frame,x,y,w,h);
    else {const ratio=frame.rect.width/frame.rect.height,iw=Math.min(w,h*ratio),ih=iw/ratio;this.h.image(this.surfaces,'Illustration:'+key,frame,x+(w-iw)/2,y+(h-ih)/2,iw,ih);}
  }
  private skin(key:string,x:number,y:number,w:number,h:number){
    const frame=this.a.get(key);if(!frame){this.h.rect(this.g,x,y,w,h,'#07121fec','#638091',3);return;}
    const node=this.h.node('ProgressionSkin:'+key,this.surfaces),sprite=node.addComponent(Sprite);
    const scale=key==='panel'?Math.max(.12,.24*this.scale):Math.max(.12,Math.min(.5*this.scale,h/230));
    node.setPosition(x+w/2-this.w/2,this.height/2-y-h/2);node.setScale(scale,scale,1);
    node.getComponent(UITransform)!.setContentSize(w/scale,h/scale);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.type=Sprite.Type.SLICED;sprite.spriteFrame=frame;
  }
  private panel(x:number,y:number,w:number,h:number,selected=false){
    this.skin('panel',x,y,w,h);
    if(selected){const outline=this.h.node('SelectedOutline',this.n).addComponent(Graphics);outline.strokeColor=color(cyan);outline.lineWidth=Math.max(2,3*this.scale);outline.roundRect(x+2-this.w/2,this.height/2-y-h+2,w-4,h-4,3);outline.stroke();}
  }
  private button(id:string,caption:string,x:number,y:number,w:number,h=44,kind:'gold'|'blue'|'panel'='panel',disabled=false){
    h=Math.max(44,h);this.skin(kind,x+2,y+2,w-4,h-4);
    const l=this.h.button(id,caption,x,y,w,h,this.n),b=this.h.buttons.at(-1)!;
    const units=Array.from(caption).reduce((n,c)=>n+(/[^\x00-\x7f]/.test(c)?1:.56),0);
    b.disabled=disabled;b.visual={x:x+2,y:y+2,w:w-4,h:h-4};l.fontSize=Math.max(12,Math.min(this.font(kind==='gold'?48:43,14),h*.56,(w-22)/Math.max(1,units)));l.lineHeight=l.fontSize*1.15;
    l.color=color(disabled?'#75828b':ivory);l.isBold=true;
    if(this.h.lang==='zh'&&this.a.font){l.font=this.a.font;l.useSystemFont=false;}
    if(disabled)this.h.rect(this.g,x+3,y+3,w-6,h-6,'#08121c77');
    return l;
  }
  private tab(id:string,caption:string,x:number,y:number,w:number,selected:boolean){this.button(id,caption,x,y,w,44,selected?'blue':'panel');if(selected)this.h.rect(this.g,x+3,y+3,w-6,38,'#78e3ff18',cyan,3);}
  private bar(x:number,y:number,w:number,h:number,ratio:number,tone=cyan){
    this.h.rect(this.g,x,y,w,h,'#06121a','#64808d',h/2);if(ratio>0)this.h.gradient(this.g,x+2,y+2,Math.max(0,(w-4)*Math.min(1,ratio)),h-4,tone,'#4887a7',Math.min(4,h/2));
  }
  private productName(p:Product){return this.t(p.name,effectEnglish[p.effect]);}
  private productArt(effect:Effect){return ({rate:'rateGear',radius:'radiusGear',power:'powerGear',drone:'droneGear',burst:'burstGear',cooling:'coolingGear',twin:'burstGear'} as Partial<Record<Effect,string>>)[effect]||effect;}
  private term(term:Product['term']){return this.t(term==='match'?'单场':term==='24h'?'24小时':'永久',term==='match'?'One match':term==='24h'?'24 hours':'Permanent');}
  private reward(r:AssetReward){return `${this.t('金币','Coins')} +${r.coins}   XP +${r.xp}${r.packs?`   ${this.t('礼包','Crates')} ×${r.packs}`:''}`;}
  private header(title:string){
    const y=this.h.safe.top,h=this.top-y-6;this.h.rect(this.g,0,y,this.w,h,'#03101dda','#566872');
    this.button('qm:back','‹',this.left,y+3,48,Math.max(44,h-6));
    const q=this.q,status=q.page==='loadout'&&!this.low?'':q.busy?this.t('正在同步…','Synchronizing…'):q.message[this.h.lang==='zh'?0:1];
    this.label(status||title,this.left+60,y+4,q.page==='loadout'&&!this.low&&!status?this.w*.15:this.right-this.left-(q.pending?160:200),h-8,status?23:52,status?cyan:ivory,!status,true);
    if(q.pending)this.button('qm:retry',this.t('重试','Retry'),this.right-92,y+3,92,Math.max(44,h-6),'blue',q.busy);
    else this.label(`● ${q.assets?.coins.toLocaleString()??'—'}`,this.right-148,y+6,148,h-12,34,gold,false);
  }
  private footer(){
    if(this.q.info)this.infoDialog();
    else if(this.q.confirmation)this.confirm();
    else if(this.q.leaveTo!==undefined)this.leaveDialog();
    else if(this.q.gift)this.giftDialog();
  }
  private brief(p:Product){return this.h.lang==='zh'?({power:'普通武器威力 +15%',rate:'攻击间隔 −12%',burst:'追加一枚60%威力副弹',twin:'追加一枚侧向副弹',radius:'爆炸范围 +15%',cooling:'普通武器热量 −15%',drone:'自动攻击并减速敌人',laser:'视线内即时命中',tracking:'追踪60秒 · 冷却90秒',emp:'定身4秒 · 冷却45秒'})[p.effect]:p.description;}
  private infoButton(id:string,x:number,y:number){this.h.button('info:'+id,'ⓘ',x,y,44,44,this.n).fontSize=22;}
  private list(key:string,x:number,y:number,w:number,h:number,total:number,draw:(offset:number)=>void){
    const old={n:this.n,surfaces:this.surfaces,g:this.g},list=this.h.listViewport(this.n,'qm:'+key,{x,y,w,h},total);
    this.n=list.n;this.surfaces=list.surfaces;this.g=list.g;draw(list.offset);list.finish();Object.assign(this,old);
  }
  render(s:Simulation,result=false){
    if(result){this.settlement(s);this.footer();return;}
    if(!this.q.page){this.home();this.footer();return;}
    const page=this.q.page;this.header(this.t(...names[page]));
    if(page==='modes')this.modes();else if(page==='shop')this.shop();else if(page==='loadout')this.loadout();
    else if(page==='supply')this.supply();else if(page==='growth')this.growth();else if(page==='tasks')this.tasks();
    else if(page==='inbox')this.inbox();else if(page==='warehouse')this.warehouse();else if(page==='checkin')this.checkin();else if(page==='receipts')this.receipts();else this.probability();
    if(!this.q.assets&&!this.q.busy&&!this.q.pending&&page!=='modes')this.button('qm:refresh',this.t('连接','Connect'),this.right-104,this.h.safe.top+3,104,44,'blue');
    this.footer();
  }
  private home(){
    const h=this.height,w=this.w,l=this.left,r=this.right,q=this.q,top=this.h.safe.top,bar=Math.max(48,h*.115);
    this.h.rect(this.g,0,top,w,bar,'#020e19c9','#61707c');
    const compactHeader=w<1000,profileW=compactHeader?160:w*.29;
    if(!compactHeader)this.picture('homeBadge',l,top+bar*.2,bar*1.15,bar*.69);
    const px=l+(compactHeader?0:bar*1.3),pw=profileW-(px-l);
    this.h.button('online:profile','',px,top,pw,Math.max(44,bar),this.n);
    this.label(playerLabel(this.h.online?.identity||{}).split(' #')[0],px+8,top+3,pw-16,bar*.48,32,ivory,true,true);
    this.label(`Lv.${q.assets?.level??1}`,px+8,top+bar*.53,48,20,20,ivory);
    this.bar(px+62,top+bar*.67,Math.max(25,pw-(compactHeader?76:178)),Math.max(5,bar*.09),(q.assets?.current??0)/(q.assets?.required||200));
    if(!compactHeader)this.label(`${q.assets?.current??0}/${q.assets?.required??200}`,px+pw-112,top+bar*.53,104,25,18,dim);
    const recordX=l+profileW+8;
    this.h.button('online:ranking',this.t('战绩','Records'),recordX,top+3,compactHeader?50:75,Math.max(44,bar-6),this.n).fontSize=this.font(24,13);
    if(!compactHeader)this.h.controlIcon(this.g,'ranking',recordX+37,top+bar*.26,25,ivory);
    const settingsX=this.h.buttons.find(b=>b.id==='settings')?.x??r-44;
    const inboxW=compactHeader?46:132,coinW=compactHeader?112:170;
    this.h.button('qm:inbox',this.t('信箱','Inbox'),settingsX-inboxW-6,top+3,inboxW,Math.max(44,bar-6),this.n).fontSize=this.font(26,13);
    const noticeX=settingsX-inboxW*2-12;
    if(!compactHeader)this.h.button('qm:announcements',this.t('公告','News'),noticeX,top+3,inboxW,Math.max(44,bar-6),this.n).fontSize=this.font(26,13);
    const coinX=(compactHeader?settingsX-inboxW-6:noticeX)-coinW-8;
    this.label('● '+(q.assets?.coins.toLocaleString()??'—'),coinX,top+8,coinW,bar-16,30,gold);
    if(q.unread){this.g.fillColor=color('#ec4940');this.g.circle(settingsX-11-w/2,h/2-top-10,4);this.g.fill();}
    const titleW=w*(this.low?.29:.33),titleY=top+bar+h*.045;
    this.picture('title',l+8,titleY,titleW,titleW/3,false);
    const bw=w*.30,bh=Math.max(46,h*.133),by=Math.max(titleY+titleW/3+8,h*.405);
    for(const [i,id]of ['loadout','modes'].entries()){
      const yy=by+i*(bh+Math.max(5,h*.014)),label=this.button('qm:'+id,this.t(i?'开始行动  ›':'作战配置  ›',i?'DEPLOY  ›':'LOADOUT  ›'),l+8,yy,bw,bh,i?'gold':'blue');
      if(!this.narrow){this.picture(i?'homeCompass':'homeCrate',l+bw*.07,yy+bh*.18,bw*.22,bh*.64,false);label.fontSize=this.font(49,16);label.node.setPosition(l+8+bw*.64-w/2,h/2-yy-bh/2);label.node.getComponent(UITransform)!.setContentSize(bw*.65,bh-10);}
    }
    const fw=Math.max(128,w*.175),fy=h*.452,fh=Math.max(44,h*.11);
    this.panel(r-fw,fy,fw,fh*2+6);this.button('qm:checkin',this.t('每日签到','CHECK IN'),r-fw+5,fy+3,fw-10,fh);
    this.button('qm:supply',this.t('礼包·抽奖','SUPPLY & WHEEL'),r-fw+5,fy+fh+3,fw-10,fh);
    const cy=h*.755,ch=Math.min(h*.19,this.bottom-cy),gap=Math.max(6,w*.009),cw=(r-l-gap*3)/4;
    for(const [i,[id,key,zh,en]]of [['shop','homeShop','军需商店','ARMORY'],['growth','homeGrowth','等级成长','GROWTH'],['tasks','homeTasks','任务','TASKS'],['warehouse','homeWarehouse','我的仓库','WAREHOUSE']].entries()){
      const x=l+i*(cw+gap);this.panel(x,cy,cw,ch);this.picture(key,x+4,cy+4,cw-8,Math.max(12,ch-24));
      this.h.gradient(this.g,x+4,cy+ch*.55,cw-8,ch*.42,'#020a1200','#020a12ef');
      const label=this.h.button('qm:'+id,zh,x,cy,cw,Math.max(44,ch),this.n);label.string=this.t(zh,en);label.fontSize=this.font(31,13);label.isBold=true;
      label.node.setPosition(x+cw/2-w/2,h/2-cy-ch+Math.min(21,ch*.28));label.node.getComponent(UITransform)!.setContentSize(cw-8,Math.min(40,ch*.45));
      if(this.h.lang==='zh'&&this.a.font){label.font=this.a.font;label.useSystemFont=false;}
    }
  }
  private modes(){
    const q=this.q,l=this.left,r=this.right,y=this.top+Math.max(12,this.height*.04),bottom=this.bottom-58,gap=Math.max(8,this.w*.016),cw=(r-l-gap*2)/3,ch=bottom-y-12;
    for(const [i,[id,zh,en,desc,edesc]]of [['solo','单人任务','SOLO','护送车队 · 推进关卡','Escort · Campaign'],['duel','双人对战','DUEL','好友房间 · 在线匹配','Friends · Matchmaking'],['training','火控训练','TRAINING','试用军需 · 熟悉操作','Try gear · Practice']].entries()){
      const x=l+i*(cw+gap),selected=q.actionMode===id;this.panel(x,y,cw,ch,selected);this.picture(id,x+5,y+5,cw-10,ch*.73);
      this.h.gradient(this.g,x+5,y+ch*.65,cw-10,ch*.33,'#06111b88','#06111bf5');
      const b=this.h.button('mode:'+id,'',x,y,cw,ch,this.n);b.string=this.t(zh,en);b.fontSize=this.font(52,19);b.isBold=true;
      b.node.setPosition(x+cw/2-this.w/2,this.height/2-y-ch*.82);b.node.getComponent(UITransform)!.setContentSize(cw-12,Math.max(28,ch*.14));
      if(this.h.lang==='zh'&&this.a.font){b.font=this.a.font;b.useSystemFont=false;}
      this.label(this.t(desc,edesc),x+6,y+ch*.9,cw-12,ch*.08,27,dim);
    }
    const summary=q.assets?.loadouts[q.actionMode==='duel'?'duel':'solo'];const equipped=summary?[...summary.mods,summary.weapon,summary.skill].filter(Boolean).map(id=>this.catalogName(id!)).join(' · '):this.t('基础方案','Basic loadout');
    const bw=Math.max(168,(r-l)*.27);this.button('qm:loadout',this.t('当前方案','Loadout')+'  ›',l,this.bottom-48,this.narrow?144:190,44);
    if(!this.narrow)this.label(equipped,l+198,this.bottom-48,r-l-bw-210,44,22,dim);
    this.button('mode:enter',this.t(q.actionMode==='solo'?'进入选关':q.actionMode==='duel'?'进入大厅':'开始训练',q.actionMode==='solo'?'MISSION MAP':q.actionMode==='duel'?'ENTER LOBBY':'START TRAINING'),r-bw,this.bottom-48,bw,48,'gold');
  }
  private catalogName(id:string){const p=this.q.catalog.find(p=>p.id===id);return p?this.productName(p):id;}
  private productDetail(p:Product,x:number,y:number,w:number,h:number,shop:boolean){
    const details=(this.q.assets?.level??1)<p.unlockLevel?this.t(`Lv.${p.unlockLevel}解锁。${p.description}`,`Unlock at Lv.${p.unlockLevel}.`):this.h.lang==='zh'?p.description:({power:'Regular weapon damage +15%.',rate:'Regular attack interval −12%.',burst:'One ammo and heat charge: primary 100%, delayed secondary 60%. Secondary fire lasts 15s.',twin:'One ammo: primary 100%, side round 60%; with burst, three secondaries at 60% (280% total). Secondary fire lasts 15s.',radius:'HE / incendiary blast radius +15%.',cooling:'Weapon heat −15%. Skill cooldown is unchanged.',drone:'Limited lifetime and damage budget. Slows enemies.',laser:'Instant line-of-sight hit. Limited ammo, long cooldown.',tracking:'Tracks for 60s; then 90s cooldown. Repeatable.',emp:'Ground enemies stop for 4s; then 45s cooldown.'})[p.effect];
    if(this.low){
      this.panel(x,y,w,h);const iw=w*.31,tx=x+iw+12,tw=w-iw-24;
      this.picture(this.productArt(p.effect),x+6,y+6,iw-6,h-12);
      this.label(this.productName(p)+' · '+this.term(p.term),tx,y+4,tw,24,32,ivory,true,true);
      this.label(details,tx,y+29,tw,Math.max(28,h-108),23,dim,false,true);
      this.label(this.q.assets?.permanent.includes(p.effect)?this.t('已永久拥有','Permanently owned'):`● ${p.price.toLocaleString()}`,tx,y+h-76,tw,24,29,gold);
      const bw=(tw-8)/2;
      this.button(shop?'qm:buy':'qm:equip',this.t(shop?'购买1件':'装备 / 取消',shop?'BUY 1':'EQUIP / REMOVE'),tx,y+h-48,bw,44,'gold',this.q.busy||!this.q.assets||!!(shop&&((this.q.assets.level<p.unlockLevel)||(p.term==='permanent'&&this.q.assets.permanent.includes(p.effect)))));
      this.button('qm:trial',this.t('训练试用','TRY'),tx+bw+8,y+h-48,bw,44);return;
    }
    this.panel(x,y,w,h);this.picture(this.productArt(p.effect),x+7,y+7,w-14,h*.47);
    this.h.gradient(this.g,x+7,y+h*.22,w-14,h*.26,'#06131b00','#06131bf2');
    this.label(this.productName(p),x+16,y+10,w-32,Math.max(30,h*.1),46,ivory,true,true);

    this.label(`${this.term(p.term)} · ${this.t(rarity[p.rarity],rarityEn[p.rarity])}`,x+16,y+h*.42,w-32,26,23,rarityColor[p.rarity],false,true);
    this.label(details,x+16,y+h*.51,w-32,this.low?42:70,27,ivory,false,true);
    const owned=this.q.assets?.permanent.includes(p.effect),price=shop?`● ${p.price.toLocaleString()}`:this.t(`可用库存 ${this.q.assets?.available[p.id]??0}`,`Available ${this.q.assets?.available[p.id]??0}`);
    this.label(owned?this.t('已永久拥有','Permanently owned'):price,x+16,y+h*.7,w-32,Math.max(25,h*.09),38,gold,true);
    const by=y+h-54,bw=(w-36)/2;
    this.button(shop?'qm:buy':'qm:equip',this.t(shop?'购买1件':'装备 / 取消',shop?'BUY 1':'EQUIP / REMOVE'),x+12,by,bw,44,'gold',this.q.busy||!this.q.assets||!!(shop&&((this.q.assets?.level??1)<p.unlockLevel||p.term==='permanent'&&owned)));
    this.button('qm:trial',this.t('训练试用','TRY IN TRAINING'),x+24+bw,by,bw,44,'panel',this.q.busy);
  }
  private shop(){
    const q=this.q,l=this.left,r=this.right,y=this.top,leftW=this.narrow?(r-l):(r-l)*.57,tabW=leftW/3;
    (['match','24h','permanent'] as const).forEach((term,i)=>this.tab('term:'+term,this.term(term),l+i*tabW,y,tabW-4,q.term===term));
    const products=q.catalog.filter(p=>p.term===q.term),current=products.find(p=>p.id===q.selected)||products[0];if(!current)return;
    const top=y+52,bottom=this.bottom,cols=2,cw=(leftW-20)/2,ch=this.low?138:200;
    if(this.narrow&&q.detail){this.productDetail(current,l,top,r-l,bottom-top-50,true);this.button('qm:list',this.t('商品列表','ITEM LIST'),l,bottom-46,144);return;}
    this.list('shop:'+q.term,l,top,leftW,bottom-top,Math.ceil(products.length/cols)*(ch+10),offset=>products.forEach((p,i)=>{const x=l+i%2*(cw+10),yy=top+Math.floor(i/2)*(ch+10)-offset;if(yy+ch<top||yy>bottom)return;const locked=(q.assets?.level??1)<p.unlockLevel;this.panel(x,yy,cw,ch,p.id===q.selected);this.picture(this.productArt(p.effect),x+5,yy+5,cw-10,ch*.6);this.h.gradient(this.g,x+5,yy+ch*.45,cw-10,ch*.51,'#06121a22','#06121aff');
      const b=this.h.button('product:'+p.id,'',x,yy,cw,ch,this.n);b.string=this.productName(p);b.fontSize=this.font(32,14);b.node.setPosition(x+cw/2-this.w/2,this.height/2-yy-ch*.64);b.node.getComponent(UITransform)!.setContentSize(cw-14,26);
      this.label(this.brief(p),x+8,yy+ch*.74,cw-16,ch*.12,22,dim);this.label(locked?this.t(`Lv.${p.unlockLevel} 解锁`,`UNLOCK Lv.${p.unlockLevel}`):`● ${p.price.toLocaleString()}`,x+8,yy+ch*.87,cw-16,ch*.12,23,locked?dim:gold);
    }));if(!this.narrow)this.productDetail(current,l+leftW+14,top,r-l-leftW-14,bottom-top,true);
  }
  private loadout(){
    const q=this.q,l=this.left,r=this.right,y=this.top,load=q.loadout,width=r-l;
    const tabW=Math.min(180,width*.22);
    this.tab('loadout:solo',this.t('单人方案','SOLO')+(q.dirtyModes.includes('solo')?' •':''),l,y,tabW,q.mode==='solo');
    this.tab('loadout:duel',this.t('双人方案','DUEL')+(q.dirtyModes.includes('duel')?' •':''),l+tabW+6,y,tabW,q.mode==='duel');
    this.label(this.t(q.dirty?'有未保存的修改':'当前已保存方案',q.dirty?'UNSAVED CHANGES':'SAVED LOADOUT'),l+tabW*2+16,y,width-tabW*2-16,44,23,q.dirty?gold:dim,false,true);
    const top=y+52,bottom=this.bottom-52,lw=width*(this.narrow?.47:.55),rx=l+lw+14,rw=r-rx;
    const selected=q.slotCategory,selectedName=this.t(selected==='mod'?'武器增益':selected==='weapon'?'特种武器':'主动技能',selected==='mod'?'WEAPON MOD':selected==='weapon'?'SPECIAL WEAPON':'ACTIVE SKILL');
    const heading=20,gh=(bottom-top-8)/2,cw=(lw-8)/2;
    const slots=[['mod:0',q.modSlots[0]],['mod:1',q.modSlots[1]],['weapon',load.weapon],['skill',load.skill]] as const;
    slots.forEach(([slot,id],i)=>{
      const x=l+(i%2)*(cw+8),yy=top+Math.floor(i/2)*(gh+8),p=q.catalog.find(p=>p.id===id),hh=gh-heading;
      const type=this.t(i<2?`武器增益 ${i+1}`:i===2?'特种武器':'主动技能',i<2?`MOD ${i+1}`:i===2?'WEAPON':'SKILL');
      this.label(type,x,yy,cw,heading,25,q.slot===slot?cyan:gold,true,true);
      this.panel(x,yy+heading,cw,hh,q.slot===slot);
      if(p){this.picture(this.productArt(p.effect),x+5,yy+heading+5,cw-10,hh-10);this.h.gradient(this.g,x+5,yy+heading+hh*.45,cw-10,hh*.5,'#07131b33','#07131bf2');}
      const label=this.h.button('slot:'+slot,p?this.productName(p):this.t('＋ 选择装配','＋ Choose'),x,yy+heading,cw,Math.max(44,hh),this.n);
      label.fontSize=this.font(30,12);label.enableWrapText=false;label.overflow=Label.Overflow.SHRINK;
      label.node.setPosition(x+cw/2-this.w/2,this.height/2-yy-heading-hh+16);label.node.getComponent(UITransform)!.setContentSize(cw-12,28);
      if(p)this.infoButton(p.id,x+cw-46,yy+heading+2);
      if(q.slot===slot)this.label('✓',x+cw-28,yy+heading+4,22,22,25,cyan,true);
      if(q.drag?.target===slot)this.h.rect(this.g,x+2,yy+heading+2,cw-4,hh-4,'#78e3ff22',cyan,4);
    });
    const preview=attackPreview([...load.mods,load.weapon,load.skill].map(id=>q.catalog.find(p=>p.id===id)?.effect||'')),previewH=this.low?48:74;
    this.panel(rx,top,rw,previewH);
    const title=this.label(this.t(`每轮 ${preview.shots} 弹 · 只耗 1 发`,`PROJECTILES ${preview.shots} · AMMO 1`),rx+10,top+5,rw-20,previewH*.46,38,ivory,true);title.enableWrapText=false;title.overflow=Label.Overflow.SHRINK;
    const detail=this.label(this.t(`主弹100%${preview.shots>1?`＋${preview.shots-1}×${preview.secondaryStrength*100}%`:''} · 热量×${preview.heatMultiplier}`,`Primary 100%${preview.shots>1?` + ${preview.shots-1}×${preview.secondaryStrength*100}%`:''} · heat ×${preview.heatMultiplier}`),rx+10,top+previewH*.52,rw-20,previewH*.36,23,dim);detail.enableWrapText=false;detail.overflow=Label.Overflow.SHRINK;
    const listTop=top+previewH+25,listH=Math.max(44,bottom-listTop),rowH=this.low?64:104;
    this.label(selectedName+this.t(' · 上下滑动选择',' · SCROLL TO CHOOSE'),rx,top+previewH+4,rw,20,23,cyan,false,true);
    q.loadoutArea={x:rx,y:listTop,w:rw,h:listH};q.loadoutScrollMax=Math.max(0,q.availableGear.length*(rowH+7)-7-listH);q.loadoutScroll=Math.min(q.loadoutScroll,q.loadoutScrollMax);
    const parent=this.n,surfaces=this.surfaces,g=this.g,viewport=this.h.node('LoadoutViewport',parent),maskX=rx+rw/2-this.w/2,maskY=this.height/2-listTop-listH/2;
    viewport.setPosition(maskX,maskY);viewport.getComponent(UITransform)!.setContentSize(rw,listH);viewport.addComponent(Mask).type=Mask.Type.GRAPHICS_RECT;
    const content=this.h.node('LoadoutItems',viewport);content.setPosition(-maskX,-maskY);
    this.n=content;this.surfaces=this.h.node('ItemSurfaces',content);this.g=this.h.node('ItemInk',content).addComponent(Graphics);
    q.availableGear.forEach((p,i)=>{
      const py=listTop+i*(rowH+7)-q.loadoutScroll;if(py+rowH<listTop||py>bottom)return;
      const equipped=q.equipped(p.effect);this.panel(rx,py,rw-7,rowH);
      const iw=this.narrow?42:Math.min(100,rw*.23);this.picture(this.productArt(p.effect),rx+5,py+5,iw,rowH-10);
      const tx=rx+iw+12,tw=rw-iw-82;
      this.label(this.productName(p),tx,py+6,tw,Math.max(21,rowH*.34),30,equipped?dim:ivory,true,true).overflow=Label.Overflow.SHRINK;
      this.label(this.brief(p)+' · '+this.term(p.term),tx,py+rowH*.44,tw,rowH*.42,20,gold,false,true).overflow=Label.Overflow.SHRINK;
      this.button('equip:'+p.id,this.t(equipped?'已装配':'装配',equipped?'USED':'EQUIP'),rx+rw-72,py+(rowH-44)/2,62,44,equipped?'panel':'blue',q.busy||!!q.pending||equipped);
      const button=this.h.buttons.at(-1)!;button.clip=q.loadoutArea;
      // The whole card is draggable; the button remains the explicit tap action.
      const card=this.h.button('gear:'+p.id,'',rx,py,rw-78,rowH,this.n);const hit=this.h.buttons.at(-1)!;hit.disabled=equipped||q.busy||!!q.pending;hit.clip=q.loadoutArea;
    });
    this.n=parent;this.surfaces=surfaces;this.g=g;
    if(!q.availableGear.length)this.label(this.t('此插槽暂无可用装配\n可前往商店或领取礼包','No compatible gear\nVisit the armory or claim a crate'),rx+8,listTop+8,rw-16,listH-16,25,dim);
    if(q.loadoutScrollMax){this.h.rect(this.g,r-4,listTop,3,listH,'#162a38');this.h.rect(this.g,r-4,listTop+(listH-28)*q.loadoutScroll/q.loadoutScrollMax,3,28,cyan);}
    const fy=this.bottom-48,unloadW=Math.min(132,lw*.42);
    this.button('qm:unequip',this.t('卸载所选','UNEQUIP'),l,fy,unloadW,44,'panel',!q.slotItem||q.busy||!!q.pending);
    this.button('qm:shop',this.t('商店','ARMORY'),l+unloadW+8,fy,Math.min(100,lw-unloadW-8),44,'blue');
    this.button('qm:save',this.t(q.busy?'保存中…':'确定保存',q.busy?'SAVING…':'CONFIRM SAVE'),rx,fy,rw,44,'gold',q.busy||!q.dirty||!!q.pending);
    if(q.drag){const p=q.catalog.find(p=>p.id===q.drag!.item);this.panel(q.drag.x-60,q.drag.y-25,120,50,true);this.label(p?this.productName(p):'',q.drag.x-56,q.drag.y-20,112,40,26,cyan,true);}
  }
  private supply(){
    const q=this.q,l=this.left,r=this.right,y=this.top,b=this.bottom,gap=12,lw=(r-l-gap)*.53,rx=l+lw+gap,rw=r-rx,h=b-y;
    this.panel(l,y,lw,h);this.panel(rx,y,rw,h);
    this.label(this.t('统一补给箱','SUPPLY CRATE'),l+12,y+3,lw-65,32,45,ivory,true,true);this.infoButton('pool',l+lw-50,y);
    this.label(this.t('幸运转盘','LUCKY WHEEL'),rx+12,y+3,rw-62,32,42,ivory,true,true);this.infoButton('wheel',r-50,y);
    const by=b-54,packY=by-(this.low?80:138),heroY=y+35,heroH=Math.max(52,packY-heroY-6);
    this.picture('closedCrate',l+lw*.08,heroY,lw*.84,heroH,false);
    const pw=(lw-24)/5;q.packages.forEach((p,i)=>this.tab('package:'+p.quantity,`${p.quantity}个`,l+10+i*pw,packY,pw-3,q.quantity===p.quantity));
    const quote=q.packages.find(p=>p.quantity===q.quantity)!,order=q.pendingOrder,cw=(lw-28)/2,cy=packY+48;
    if(!this.low){this.panel(l+8,cy,cw,b-cy-8);this.panel(l+20+cw,cy,cw,b-cy-8);}
    this.label(`● ${quote.coins}`,l+12,cy,cw-4,this.low?24:34,37,gold,true);
    this.label(this.t(`视频 ${order?.completed??0}/${order?.required??quote.videos}`,`VIDEO ${order?.completed??0}/${order?.required??quote.videos}`),l+20+cw,cy,cw,this.low?24:34,30,ivory,true);
    if(!this.low){this.label(this.t('单场物资 · 随等级解锁','ONE MATCH · LEVEL UNLOCKS'),l+12,cy+35,lw-24,24,23,dim);}
    this.button('qm:buyPacks',this.t(`购买${quote.quantity}个`,`BUY ${quote.quantity}`),l+10,by,cw,44,'gold',q.busy||!q.assets||!!q.pending||!!q.wheel&&!q.wheel.shown);
    this.button('qm:watch',q.viewing?this.t('观看中','WATCHING'):this.t(order?'继续观看':'观看视频',order?'CONTINUE':'WATCH'),l+20+cw,by,cw,44,'blue',q.busy||q.viewing||!q.assets||!!q.pending||!!q.wheel&&!q.wheel.shown);
    const diameter=Math.min(rw-20,h-(this.low?100:140)),cx=rx+rw/2,cyWheel=y+35+diameter/2;
    const wheel=this.h.node('LuckyWheel',this.n);wheel.setPosition(cx-this.w/2,this.height/2-cyWheel);
    const frame=this.a.get('wheel');if(frame){const sprite=wheel.addComponent(Sprite);sprite.spriteFrame=frame;sprite.sizeMode=Sprite.SizeMode.CUSTOM;wheel.getComponent(UITransform)!.setContentSize(diameter,diameter);}
    const prizes=q.assets?.wheelPrizes||WHEEL_PRIZES;
    prizes.forEach((p,i)=>{const angle=(30+i*60)*Math.PI/180,rr=diameter*.31,xx=Math.sin(angle)*rr,yy=Math.cos(angle)*rr;
      const icon=this.a.get(p.coins?'coinPile':'closedCrate');if(icon)this.h.image(wheel,'WheelPrize:'+i,icon,this.w/2+xx-diameter*.095,this.height/2-yy-diameter*.125,diameter*.19,diameter*.13);
      const label=this.h.label(wheel,(p.coins?`${p.coins}${this.low?'':' '+this.t('金币','coins')}`:this.t(rarity[p.tier]+(this.low?'':'礼包'),rarityEn[p.tier]))+`\n${p.weight}%`,this.w/2+xx,this.height/2-yy+diameter*.035,Math.max(12,diameter*.044),diameter*.31,diameter*.20,p.tier>=0?rarityColor[p.tier]:gold);label.isBold=true;label.lineHeight=label.fontSize*1.25;
    });
    const badge=this.a.get('homeBadge');if(badge)this.h.image(wheel,'WheelBadge',badge,this.w/2-diameter*.09,this.height/2-diameter*.06,diameter*.18,diameter*.12);
    const motion=q.wheel,end=motion?wheelLandingAngle(motion.index,motion.startAngle):0,elapsed=motion?Math.min(1,(Date.now()-motion.started)/motion.duration):1;
    wheel.angle=motion?motion.startAngle+(end-motion.startAngle)*(1-Math.pow(1-elapsed,4)):0;
    if(motion&&elapsed<1&&!this.h.reducedEffects)tween(wheel).to((motion.duration/1000)*(1-elapsed),{angle:end},{easing:'quartOut'}).start();
    this.label('▼',cx-16,cyWheel-diameter/2-7,32,32,42,gold,true);
    this.label(this.t(`剩余次数 ${q.assets?.wheelTickets??0} · 今日视频 ${q.assets?.wheelVideosToday??0}/${q.assets?.wheelDailyLimit??5}`,`SPINS ${q.assets?.wheelTickets??0} · VIDEOS ${q.assets?.wheelVideosToday??0}/${q.assets?.wheelDailyLimit??5}`),rx+8,by-34,rw-16,30,26,gold,true);
    const spinning=!!motion&&!motion.shown,bw=(rw-26)/2;
    this.button(spinning?'qm:wheelSkip':'qm:wheelSpin',this.t(spinning?'跳过动画':'抽一次',spinning?'SKIP':'SPIN'),rx+9,by,bw,44,'gold',q.busy||(!spinning&&!(q.assets?.wheelTickets))||!!q.pending);
    this.button('qm:wheelWatch',this.t('视频+1次','VIDEO +1'),rx+17+bw,by,bw,44,'blue',q.busy||q.viewing||spinning||!q.assets||!!q.pending||(q.assets.wheelVideosToday??0)>=(q.assets.wheelDailyLimit??5)||q.assets.videosToday>=q.assets.videoDailyLimit);
  }
  private growth(){
    const q=this.q,l=this.left,r=this.right,y=this.top,b=this.bottom,lw=(r-l)*.27,rx=l+lw+14,rw=r-rx,h=b-y;
    this.panel(l,y,lw,h);this.picture('emblem',l+8,y+6,lw-16,h*.28);this.label(`Lv.${q.assets?.level??1}`,l+8,y+h*.29,lw-16,30,48,gold,true);
    this.bar(l+14,y+h*.43,lw-28,10,(q.assets?.current??0)/(q.assets?.required||200));this.label(`${q.assets?.current??0} / ${q.assets?.required??200}`,l+8,y+h*.48,lw-16,25,24,dim);
    const milestones=[[3,'基础强化','BASE STRENGTH'],[6,'追踪资格','TRACKING'],[10,'电磁干扰','EMP'],[15,'火控精修','PRECISION']] as const;
    milestones.forEach(([level,zh,en],i)=>this.label(`${(q.assets?.level??1)>=level?'✓':'○'} Lv.${level} ${this.t(zh,en)}`,l+8,y+h*.61+i*h*.085,lw-16,Math.max(18,h*.08),25,(q.assets?.level??1)>=level?gold:dim,false,true));
    const tw=Math.min(185,(rw-6)/2);this.tab('growth:base',this.t('成长加成','GROWTH'),rx,y,tw,q.section!=='skills');this.tab('growth:skills',this.t('主动技能','SKILLS'),rx+tw+6,y,tw,q.section==='skills');
    const top=y+52,bottom=b-54;
    if(q.section!=='skills'){
      const level=q.assets?.level??1,next=milestones.find(m=>m[0]>level);this.panel(rx,top,rw,52,true);this.label(this.t(`基础威力 +${level>=3?5:0}%`,`BASE DAMAGE +${level>=3?5:0}%`),rx+12,top+3,rw-24,25,34,cyan,true,true);this.label(next?this.t(`下一成长 Lv.${next[0]} · ${next[0]===3?'基础威力提升5%':next[0]===15?'攻击间隔缩短5%':next[1]}`,`NEXT Lv.${next[0]} · ${next[2]}`):this.t('火控精修已生效 · 攻击间隔缩短5%','PRECISION ACTIVE · Attack interval −5%'),rx+12,top+28,rw-24,21,22,dim,false,true);
      const listTop=top+60,rowH=this.low?68:90;
      this.list('growth',rx,listTop,rw,bottom-listTop,rowH*4,offset=>milestones.forEach(([level,zh,en],i)=>{const yy=listTop+i*rowH-offset;this.panel(rx,yy,rw-10,rowH-6,(q.assets?.level??1)>=level);
        const desc=i===0?this.t('普通武器伤害 +5%','Regular weapon damage +5%'):i===3?this.t('攻击间隔缩短5%','Attack interval −5%'):this.t('永久解锁主动技能','Permanent active skill');
        this.picture(i===1?'tracking':i===2?'emp':i===0?'powerGear':'coolingGear',rx+8,yy+8,48,rowH-16,false);this.label(`Lv.${level}  ${this.t(zh,en)}`,rx+64,yy+6,rw*.57-52,24,32,ivory,true,true);this.label(desc,rx+64,yy+30,rw*.7-52,rowH-36,23,dim,false,true);this.label((q.assets?.level??1)>=level?this.t('✓ 已生效','✓ ACTIVE'):this.t('未解锁','LOCKED'),rx+rw*.72,yy+6,rw*.24,rowH-18,25,(q.assets?.level??1)>=level?gold:dim);
      }));
    }else{
      const cw=(rw-10)/2,ch=bottom-top;
      (['tracking','emp'] as const).forEach((effect,i)=>{const x=rx+i*(cw+10),skill=SKILLS[effect],owned=q.assets?.permanent.includes(effect);this.panel(x,top,cw,ch,owned&&q.loadout.skill?.startsWith(effect));this.picture(effect,x+5,top+5,cw-10,ch*.58);this.h.gradient(this.g,x+5,top+ch*.4,cw-10,ch*.2,'#07131b00','#07131bff');
        this.label(this.t(effect==='tracking'?'追踪':'电磁干扰',effectEnglish[effect]),x+10,top+8,cw-54,28,39,ivory,true,true);this.infoButton(effect+'-permanent',x+cw-48,top+3);
        this.label(this.t(effect==='tracking'?'锁定目标，持续追踪射击':'释放电磁波，使敌方地面单位定身',effect==='tracking'?'Lock and track targets':'Immobilize enemy ground units'),x+10,bottom-85,cw-20,36,25,ivory,false,true);
        this.label(this.t(`持续 ${skill.duration}秒 · 冷却 ${skill.cooldown}秒`,`ACTIVE ${skill.duration}s · CD ${skill.cooldown}s`),x+8,bottom-46,cw-16,22,23,gold);
        this.label(owned?this.t('永久拥有','PERMANENT'):this.t(`Lv.${skill.level}解锁`,`UNLOCK Lv.${skill.level}`),x+8,bottom-24,cw-16,21,22,owned?cyan:dim);
      });
    }
    this.button('qm:loadout',this.t('作战配置  ›','LOADOUT  ›'),r-Math.min(220,rw),b-48,Math.min(220,rw),44,'gold');
  }
  private tasks(){
    const q=this.q,l=this.left,r=this.right,y=this.top;this.tab('tasks:daily',this.t('每日任务','DAILY'),l,y,Math.min(230,(r-l)*.3),q.section!=='achievements');this.tab('tasks:achievements',this.t('长期成就','ACHIEVEMENTS'),l+Math.min(240,(r-l)*.31),y,Math.min(230,(r-l)*.34),q.section==='achievements');
    const achievements=q.section==='achievements',tasks=achievements?q.assets?.achievements||[]:(q.assets?.tasks||[]).filter(t=>t.day===q.assets?.day||!t.claimed&&t.progress>=t.target);
    const top=y+53,bottom=this.bottom-54,size=this.low?2:4,rowH=this.low?92:130;
    this.list('tasks:'+q.section,l,top,r-l,bottom-top,tasks.length*rowH,offset=>tasks.forEach((task,i)=>{
      const yy=top+i*rowH-offset;this.panel(l,yy,r-l,rowH-7);
      const art=task.event==='checkin'?'checkin':task.event==='open'?'taskSupply':task.event==='duel'?'taskDuel':'taskSolo',iw=this.narrow?0:(r-l)*.23;
      if(iw)this.picture(art,l+5,yy+5,iw,rowH-17);
      const alternate=!achievements&&task.event==='duel'&&!task.claimed&&task.progress<task.target;
      const tx=l+iw+12,buttonW=this.narrow?66:Math.min(180,(r-l)*.15),bx=r-buttonW-12,contentW=bx-tx-12-(alternate?buttonW+6:0);
      const title=this.h.lang==='zh'?task.name:task.event==='checkin'?'Check in today':task.event==='open'?'Open a supply crate':task.event==='solo'?`Complete ${task.target} solo operations`:task.event==='duel'?`Complete ${task.target} duels`:task.event==='win'?`Win ${task.target} operations`:`Complete ${task.target} operations`;
      this.label(title,tx,yy+5,contentW,rowH*.32,32,ivory,true,true);
      const barW=contentW*.65;this.bar(tx,yy+rowH*.45,barW,Math.max(7,rowH*.09),task.progress/task.target);
      this.label(`${task.progress}/${task.target}`,tx+barW+6,yy+rowH*.34,contentW-barW-6,25,24,dim);
      this.label(this.reward(task.reward),tx,yy+rowH*.63,contentW,rowH*.25,24,gold,false,true);
      const ready=task.progress>=task.target&&!task.claimed;
      this.button((achievements?'achievement:':'task:')+task.id,this.t(task.claimed?'已领取':ready?'领取':'前往',task.claimed?'Claimed':ready?'Claim':'Go'),bx,yy+(rowH-51)/2,buttonW,44,ready?'blue':'panel',task.claimed||q.busy);
      if(alternate)this.button('taskalt:'+task.id,this.t('替代','Replace'),bx-buttonW-6,yy+(rowH-51)/2,buttonW,44,'panel',q.busy);
    }));
    if(!tasks.length)this.label(this.t('连接后获取今日目标','Connect to load today’s objectives'),l,top,r-l,80,30,dim);

    if(!achievements)this.button('qm:claimAll',this.t('一键领取','CLAIM ALL'),r-Math.max(160,(r-l)*.24),this.bottom-48,Math.max(160,(r-l)*.24),48,'gold',q.busy||!q.claimable);
  }
  private inbox(){
    const q=this.q,l=this.left,r=this.right,y=this.top;this.tab('inbox:mail',this.t('信箱','INBOX'),l,y,Math.min(200,(r-l)*.25),q.section!=='news');this.tab('inbox:news',this.t('公告','NEWS'),l+Math.min(208,(r-l)*.26),y,Math.min(200,(r-l)*.25),q.section==='news');
    const news=q.section==='news',entries=news?q.assets?.announcements||[]:q.assets?.mail||[],selected=entries.find(m=>m.id===q.selectedMail);
    if(selected)q.selectedMail=selected.id;
    const top=y+53,bottom=this.bottom-54,lw=this.narrow?(r-l)*.32:(r-l)*.35,rx=l+lw+14,rw=r-rx,size=this.low?2:3,rowH=Math.min(this.low?68:112,(bottom-top-(size-1)*8)/size);
    this.list('inbox:'+q.section,l,top,lw,bottom-top,entries.length*(rowH+8),offset=>entries.forEach((m,i)=>{
      const yy=top+i*(rowH+8)-offset;this.panel(l,yy,lw,rowH,m.id===q.selectedMail);if(!this.narrow)this.picture('envelope',l+6,yy+6,rowH-12,rowH-12);
      const tx=l+(this.narrow?7:rowH),title=this.h.lang==='zh'?m.title:m.id.startsWith('night-return')?'Welcome / return compensation':'Night Overwatch update';
      const b=this.h.button('mail:'+m.id,title,l,yy,lw,rowH,this.n);b.fontSize=this.font(29,13);b.node.setPosition(tx+(lw-(tx-l))/2-this.w/2,this.height/2-yy-rowH*.38);b.node.getComponent(UITransform)!.setContentSize(lw-(tx-l)-12,rowH*.55);
      const mail=!news?q.assets?.mail.find(x=>x.id===m.id):undefined;
      this.label(mail?this.t(mail.claimed?'已领取':mail.read?'附件待领取':'未读',mail.claimed?'Claimed':mail.read?'Attachment pending':'Unread'):this.t('公告','News'),tx,yy+rowH*.64,lw-(tx-l)-8,rowH*.28,19,mail?.claimed?dim:cyan);
    }));
    this.panel(rx,top,rw,bottom-top);
    if(!selected){this.label(this.t(entries.length?'请选择本页消息':'暂无消息',entries.length?'Select a message on this page':'No messages'),rx+12,top+30,rw-24,60,35,dim);return;}
    const title=this.h.lang==='zh'?selected.title:news?'Growth & supplies update':'Welcome / return compensation';
    this.picture('mailAircraft',rx+5,top+5,rw-10,(bottom-top)*.33);this.h.gradient(this.g,rx+5,top+5,rw-10,(bottom-top)*.33,'#03101c88','#03101cb0');
    this.label(title,rx+18,top+(this.low?6:15),rw-36,this.low?30:Math.max(34,(bottom-top)*.14),45,ivory,true,true);
    const body=this.h.lang==='zh'?selected.body:news?'Points retain their original rules. Coins and XP are separate. Save solo and duel loadouts independently. Skills can be reused after cooldown.':'Your previous points, progress and verified assets are preserved. The attachment can be claimed once.';
    const bodyLabel=this.label(body,rx+18,top+(this.low?38:(bottom-top)*.33),rw-36,this.low?bottom-top-90:(bottom-top)*.19,25,ivory,false,true);
    if(this.low)bodyLabel.overflow=Label.Overflow.SHRINK;
    const mail=!news?q.assets?.mail.find(m=>m.id===selected.id):undefined;
    if(mail&&this.low){this.button('qm:claimMail',this.t(mail.claimed?'附件已领取':`领取 · ${mail.reward.coins}金币 / ${mail.reward.packs||0}礼包`,mail.claimed?'CLAIMED':`CLAIM · ${mail.reward.coins} COINS / ${mail.reward.packs||0} CRATES`),rx+8,bottom-48,rw-16,44,'gold',mail.claimed||q.busy);}
    else if(mail){const cy=top+(bottom-top)*.53,cw=(rw-40)/2,ch=(bottom-top)*.26;this.picture('coins',rx+14,cy,cw,ch);this.picture('rewardSupply',rx+26+cw,cy,cw,ch);
      this.label(`● ${mail.reward.coins}   XP ${mail.reward.xp}`,rx+14,cy+ch-26,cw,24,25,gold);this.label(this.t(`礼包 ×${mail.reward.packs||0}`,`CRATES ×${mail.reward.packs||0}`),rx+26+cw,cy+ch-26,cw,24,25,ivory);
      this.button('qm:claimMail',this.t(mail.claimed?'已领取':'领取附件',mail.claimed?'CLAIMED':'CLAIM ATTACHMENT'),rx+rw*.28,bottom-54,rw*.66,44,'gold',mail.claimed||q.busy);
      if(!this.narrow)this.label(this.t(mail.read?'已读':'未读',mail.read?'Read':'Unread'),rx+14,bottom-52,rw*.22,40,21,dim);
    }
  }
  private inventoryName(id:string){
    const p=this.q.catalog.find(p=>p.id===id),pack=/^pack:(general|gold):([0-3])$/.exec(id);
    if(pack)return this.t('补给箱 · '+rarity[Number(pack[2])],'Crate · '+rarityEn[Number(pack[2])]);
    return p?this.productName(p)+' · '+this.term(p.term):this.t('旧版物资','Legacy item');
  }
  private warehouse(){
    const q=this.q,l=this.left,r=this.right,top=this.top,bottom=this.bottom-52,items=q.inventory,lw=(r-l)*.62,rx=l+lw+12,rw=r-rx;
    if(!items.some(([id])=>id===q.item)){q.item=items[0]?.[0]||'';q.amount=1;}
    const cols=this.narrow?2:3,cw=(lw-26-(cols-1)*8)/cols,ch=this.low?126:Math.max(170,(bottom-top-12)/2),rowH=ch+8;
    this.panel(l,top,lw,bottom-top);this.list('warehouse',l+6,top+6,lw-12,bottom-top-12,Math.ceil(items.length/cols)*rowH,offset=>items.forEach(([id,count],i)=>{const x=l+6+(i%cols)*(cw+8),y=top+6+Math.floor(i/cols)*rowH-offset;if(y+ch<top||y>bottom)return;
      const p=q.catalog.find(p=>p.id===id),pack=id.startsWith('pack:'),tier=pack?Number(id.split(':')[2]):p?.rarity??0;this.panel(x,y,cw,ch,id===q.item);this.picture(pack?'closedCrate':p?this.productArt(p.effect):'homeWarehouse',x+5,y+5,cw-10,ch*.58,pack?false:true);
      const label=this.h.button('inventory:'+id,'',x,y,cw,ch,this.n);label.string=(p?this.productName(p):this.t('补给箱','CRATE'))+` ×${count}`;label.fontSize=this.font(29,13);label.node.setPosition(x+cw/2-this.w/2,this.height/2-y-ch*.65);label.node.getComponent(UITransform)!.setContentSize(cw-10,26);
      this.label(p?this.brief(p):this.t('打开获得金币或物资','Coins or supplies'),x+6,y+ch*.75,cw-12,ch*.13,20,dim);this.label(this.t(rarity[tier],rarityEn[tier])+(p?' · '+this.term(p.term):''),x+6,y+ch*.88,cw-12,ch*.1,20,rarityColor[tier]);
    }));
    this.panel(rx,top,rw,bottom-top);
    if(q.item){const id=q.item,p=q.catalog.find(p=>p.id===id),pack=id.startsWith('pack:'),available=q.assets?.available[id]??0;q.amount=Math.max(1,Math.min(q.amount,available||1));
      this.label(p?this.productName(p):this.t('补给箱','CRATE'),rx+8,top+5,rw-50,26,34,ivory,true,true);this.infoButton(id,r-48,top);
      const bodyH=bottom-top,artH=Math.max(0,bodyH-224);if(artH>30)this.picture(pack?'closedCrate':p?this.productArt(p.effect):'homeWarehouse',rx+10,top+34,rw-20,artH,false);
      const yy=bottom-154;this.label(p?this.brief(p):this.t('金币或单场物资','Coins or one-match supplies'),rx+8,yy-32,rw-16,28,22,dim);
      this.label((p?this.term(p.term)+' · ':this.t(rarity[Number(id.split(':')[2])],rarityEn[Number(id.split(':')[2])])+' · ')+this.t(`可用 ${available}`,`${available} available`),rx+8,yy-9,rw-16,22,21,dim);
      this.button('qm:minus','−',rx+8,yy+15,44,44,'panel',q.amount<=1);this.label(String(q.amount),rx+52,yy+15,rw-104,44,32,ivory);this.button('qm:plus','+',r-52,yy+15,44,44,'panel',q.amount>=Math.min(100,available));
      this.label(this.t('可得  ','GAIN  ')+`● ${q.sellPrice(id)*q.amount}`,rx+8,bottom-85,rw-16,30,31,gold,true);
      const bw=(rw-24)/2,owned=!!(p?.term==='24h'&&q.assets?.permanent.includes(p.effect));this.button(pack?'qm:open':p?.term==='24h'?'qm:activate':'qm:loadout',this.t(pack?'打开':p?.term==='24h'?'激活':'配装',pack?'OPEN':p?.term==='24h'?'USE':'EQUIP'),rx+8,bottom-49,bw,44,'gold',q.busy||available<1||owned);
      this.button('qm:sell',this.t('出售','SELL'),rx+16+bw,bottom-49,bw,44,'blue',q.busy||available<1||q.sellPrice(id)===0);
    }else this.label(this.t('仓库暂无物资','No supplies yet'),rx+8,top+30,rw-16,65,28,dim);
    this.button('qm:receipts',this.t('开包记录','HISTORY'),r-240,this.bottom-46,112,44);this.button('qm:supply',this.t('获取礼包','SUPPLIES'),r-120,this.bottom-46,120,44,'gold');
  }
  private receipts(){
    const q=this.q,l=this.left,r=this.right,y=this.top,bottom=this.bottom,entries=q.assets?.openReceipts||[],rowH=this.low?82:112;
    this.panel(l,y,r-l,bottom-y);this.list('receipts',l+8,y+8,r-l-16,bottom-y-16,entries.length*(rowH+8),offset=>entries.forEach((entry,i)=>{const yy=y+8+i*(rowH+8)-offset;if(yy+rowH<y||yy>bottom)return;
      const tier=Number(entry.item.split(':')[2]),date=new Date(entry.at),stamp=`${date.getMonth()+1}/${date.getDate()} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;this.panel(l+8,yy,r-l-28,rowH);this.picture('closedCrate',l+16,yy+8,70,rowH-16,false);
      this.label(stamp+' · '+this.t(rarity[tier]||'补给',rarityEn[tier]||'Supply')+` ×${entry.quantity}`,l+94,yy+6,r-l-124,27,29,rarityColor[tier]||gold,true,true);
      const counts=new Map<string,number>();let coins=0;for(const d of entry.drops){if(d.item)counts.set(d.item,(counts.get(d.item)||0)+1);else coins+=d.coins||0;}
      this.label([...(coins?[this.t(`金币 +${coins}`,`Coins +${coins}`)]:[]),...Array.from(counts,([id,n])=>`${this.catalogName(id)} ×${n}`)].join(' · '),l+94,yy+37,r-l-124,rowH-42,25,ivory,false,true);
    }));if(!entries.length)this.label(this.t('暂无开包记录','No opening history'),l+20,y+40,r-l-40,60,32,dim);
  }
  private checkin(){
    const q=this.q,l=this.left,r=this.right,top=this.top+8,bottom=this.bottom-58;this.panel(l,top,r-l,bottom-top);
    this.label(this.t('累计签到，漏签不清零','CUMULATIVE CHECK-IN · MISSING A DAY NEVER RESETS'),l+12,top+8,r-l-24,36,38,gold,true);
    const cols=this.narrow?4:7,gap=8,cw=(r-l-32-(cols-1)*gap)/cols,rows=this.narrow?2:1,cy=top+50,ch=(bottom-cy-12-(rows-1)*8)/rows,count=q.assets?.signedDays.length??0;
    const currentDay=Math.max(1,count+(q.assets?.signedToday?0:1)),groupStart=Math.floor((currentDay-1)/7)*7;
    for(let i=0;i<7;i++){const x=l+16+(i%cols)*(cw+gap),yy=cy+Math.floor(i/cols)*(ch+8),day=groupStart+i+1,done=day<=count;this.panel(x,yy,cw,ch,day===currentDay);this.picture(i===6?'supply':'coins',x+4,yy+25,cw-8,Math.max(12,ch-52));this.label(this.t(`第 ${day} 天`,`DAY ${day}`),x+4,yy+3,cw-8,24,28,done?dim:gold,true);this.label(done?'✓':`● ${i===6?200:100} + XP40`,x+3,yy+ch-25,cw-6,22,20,done?dim:ivory);}
    this.button('qm:checkinClaim',this.t(q.assets?.signedToday?'今日已签到':'今日签到',q.assets?.signedToday?'CHECKED IN':'CHECK IN TODAY'),r-220,this.bottom-48,220,48,'gold',q.busy||!q.assets||q.assets.signedToday);
    this.label(this.t('每日额外获得1个普通礼包','Includes 1 common general crate daily'),l,this.bottom-48,r-l-240,44,22,dim,false,true);
  }
  private probability(){this.q.info='pool';}
  private infoDialog(){
    const q=this.q,p=q.catalog.find(p=>p.id===q.info),{x,y,pw,ph}=this.dialog(p?this.productName(p):this.t(q.info==='wheel'?'转盘概率':'补给箱概率与内容',q.info==='wheel'?'WHEEL ODDS':'CRATE CONTENTS & ODDS'));
    let lines:string[]=[];
    if(p)lines=[p.description,this.t(`使用期限：${this.term(p.term)} · Lv.${p.unlockLevel}解锁`,`TERM: ${this.term(p.term)} · UNLOCK Lv.${p.unlockLevel}`),this.t('同效果不可重复装配。单场资格在正式出动时消耗；训练不消耗。','Duplicate effects cannot stack. One-match gear is consumed on deployment, not in training.')];
    else if(q.info==='wheel')lines=(q.assets?.wheelPrizes||WHEEL_PRIZES).map(p=>(p.coins?`${p.coins} ${this.t('金币','coins')}`:this.t(rarity[p.tier]+'礼包',rarityEn[p.tier]+' crate'))+`：${p.weight}%`).concat(this.t('完整观看1段视频获得1次；每日最多5段，与礼包共用每日12段。次数跨天保留。','One completed video grants one saved spin. 5 wheel videos/day, sharing 12 total videos/day.'));
    else {const pool=q.pools.general,pack=/^pack:(general|gold):([0-3])$/.exec(q.info),tier=pack?Number(pack[2]):-1;lines=[this.t(pack?'此箱档位已确定，开启不重新抽取档位。':'以下是获取随机礼包时的档位概率。已持有的箱子档位已确定，开启不重新抽档。',pack?'This crate’s tier is fixed. Opening does not reroll its tier.':'These are random crate acquisition odds. Owned crates keep their existing tier.')];lines.push(...pool.weights.flatMap((weight,i)=>{if(tier>=0&&tier!==i)return [];const eligible=eligibleDrops(q.catalog,i,q.assets?.level||1,q.assets?.permanent||[]),content=i===0?this.t('获得40金币','Receive 40 coins'):eligible.length?eligible.map(p=>this.productName(p)).join(' / ')+this.t(`（每种${(100/eligible.length).toFixed(1)}%，档内等概率）`,` (equal odds within tier)`):this.t(`本档当前无可用装备，获得${pool.coinDrops[i]}金币`,`No eligible item: ${pool.coinDrops[i]} coins`);return [this.t(rarity[i],rarityEn[i])+(tier<0?` ${weight}%`:'')+'\n'+content];}));lines.push(this.t('仅抽取已解锁、未永久拥有的单场武器或增益；主动技能在Lv.6/10永久解锁。各数量套餐概率相同。','Only unlocked, unowned one-match gear. Active skills unlock permanently at Lv.6/10. All package sizes share odds.'));const locked=q.catalog.filter(p=>p.term==='match'&&p.category!=='skill'&&p.unlockLevel>(q.assets?.level||1));if(locked.length){lines.push(this.t('尚未进入当前奖池（达到等级后解锁）：','NOT IN THE CURRENT POOL (unlock by level):'));lines.push(...locked.map(p=>`${this.productName(p)} · Lv.${p.unlockLevel}`));}}
    const rowH=p?92:70;this.list('info',x+18,y+53,pw-36,ph-118,lines.length*rowH,offset=>lines.forEach((line,i)=>this.label(line,x+22,y+55+i*rowH-offset,pw-52,rowH-6,27,ivory,false,true)));
    this.button('qm:infoClose',this.t('知道了','CLOSE'),x+pw/2-70,y+ph-57,140,44,'blue');
  }
  private dialog(title:string){
    const pw=Math.min(650,this.right-this.left),ph=Math.min(390,this.height-24),x=(this.w-pw)/2,y=(this.height-ph)/2;
    for(const b of this.h.buttons)if(this.h.inModal(b.label.node))b.disabled=true;this.h.listAreas=[];
    const overlay=this.h.node('RewardDialog',this.n);this.n=overlay;this.surfaces=this.h.node('DialogSurfaces',overlay);this.g=this.h.node('DialogInk',overlay).addComponent(Graphics);
    this.h.rect(this.g,0,0,this.w,this.height,'#01070cdd');this.panel(x,y,pw,ph);
    this.label(title,x+16,y+10,pw-32,34,38,gold,true);
    return {x,y,pw,ph};
  }
  private leaveDialog(){
    const pending=this.q.pending?.kind==='loadout',{x,y,pw,ph}=this.dialog(this.t(pending?'保存结果待确认':'方案尚未保存',pending?'SAVE RESULT PENDING':'UNSAVED LOADOUT'));
    const modes=this.q.dirtyModes.map(mode=>this.t(mode==='solo'?'单人方案':'双人方案',mode==='solo'?'Solo':'Duel')).join('、');
    this.label(pending?this.t('保存请求已发送，结果尚未确认。\n离开不会取消请求；草稿与交易编号会保留，稍后可重试确认。','The save was sent but is not yet confirmed.\nLeaving keeps the request and draft. Retry later to confirm.'):this.t(`${modes}有未保存的修改。\n返回编辑并确定保存，或放弃修改后离开。`,`${modes} has unsaved changes.\nContinue editing to save, or discard and leave.`),x+22,y+55,pw-44,ph-126,29,ivory);
    this.button('qm:keepEditing',this.t(pending?'继续确认':'返回编辑',pending?'CONTINUE':'KEEP EDITING'),x+20,y+ph-60,(pw-52)/2,44,'blue');
    this.button(pending?'qm:leavePending':'qm:discard',this.t(pending?'保留请求并离开':'放弃修改',pending?'KEEP REQUEST & LEAVE':'DISCARD'),x+32+(pw-52)/2,y+ph-60,(pw-52)/2,44,'panel');
  }
  private giftDialog(){
    const q=this.q,gift=q.gift!,opening=!!gift.started;
    for(const b of this.h.buttons)if(this.h.inModal(b.label.node))b.disabled=true;this.h.listAreas=[];
    const overlay=this.h.node('GiftPresentation',this.n);this.n=overlay;const background=this.a.get('base');if(background)this.h.coverImage(overlay,'GiftAirfield',background,0,0,this.w,this.height);const shade=this.h.node('GiftShade',overlay).addComponent(Graphics);this.h.rect(shade,0,0,this.w,this.height,'#03101b55');this.surfaces=this.h.node('GiftArt',overlay);this.g=this.h.node('GiftInk',overlay).addComponent(Graphics);
    const l=this.left,r=this.right,top=this.h.safe.top+8,b=this.bottom;this.label(this.t(opening?'礼包开启':gift.opened?'获得物资':'获得礼包',opening?'OPENING':gift.opened?'REWARDS':'SUPPLIES RECEIVED'),l+12,top,r-l-140,42,53,gold,true,true);
    if(opening){
      const elapsed=(Date.now()-gift.started!)/(gift.duration||1600),key=elapsed<.3?'closedCrate':'openCrate',size=Math.min(this.w*.6,this.height*.9);this.picture(key,(this.w-size)/2,top+43,size,b-top-50,false);
      const glow=this.h.node('CrateGlow',overlay).addComponent(Graphics);glow.fillColor=color('#ffc35a22');glow.circle(0,0,size*.27);glow.fill();const opacity=glow.node.addComponent(UIOpacity);if(!this.h.reducedEffects)tween(opacity).to(.35,{opacity:80}).to(.35,{opacity:230}).union().repeatForever().start();const chest=this.surfaces.children.find(n=>n.name.includes(key));if(chest&&!this.h.reducedEffects){const fade=chest.addComponent(UIOpacity);fade.opacity=elapsed<.3?180:80;tween(fade).to(.22,{opacity:255}).start();}
      this.button('qm:giftSkip',this.t('跳过 ›','SKIP ›'),r-105,top,105,44);return;
    }
    const heroW=(r-l)*.29,rx=l+heroW+14,rw=r-rx,cy=top+52,bottom=b-54;this.picture(gift.opened?'openCrate':'closedCrate',l,cy,heroW,bottom-cy,false);this.panel(rx,cy,rw,bottom-cy);
    const counts=new Map<string,number>();let coins=0;for(const d of gift.drops){if(d.item)counts.set(d.item,(counts.get(d.item)||0)+1);else coins+=d.coins||0;}
    const entries:Array<{id:string;n:number}>=gift.opened?[...(coins?[{id:'coins',n:coins}]:[]),...Array.from(counts,([id,n])=>({id,n}))]:Object.entries(gift.packs).map(([id,n])=>({id,n}));
    const cols=this.narrow?2:3,cw=(rw-26-(cols-1)*9)/cols,ch=this.low?150:Math.max(220,bottom-cy-22);
    this.list('gifts',rx+8,cy+8,rw-16,bottom-cy-16,Math.ceil(entries.length/cols)*(ch+9),offset=>entries.forEach(({id,n},i)=>{const x=rx+10+i%cols*(cw+9),y=cy+10+Math.floor(i/cols)*(ch+9)-offset,p=q.catalog.find(p=>p.id===id),money=id==='coins',tier=p?.rarity??(id.startsWith('pack:')?Number(id.split(':')[2]):0);this.panel(x,y,cw,ch);this.h.rect(this.g,x+2,y+2,cw-4,ch-4,'#00000000',money?gold:rarityColor[tier],3);this.picture(money?'coinPile':p?this.productArt(p.effect):'closedCrate',x+5,y+25,cw-10,ch*.54,!id.startsWith('pack:'));this.label(money?this.t('金币','COINS'):this.t(rarity[tier],rarityEn[tier])+(p?' · '+this.term(p.term):''),x+8,y+4,cw-16,24,25,money?gold:rarityColor[tier],true,true);if(p)this.infoButton(id,x+cw-44,y+1);
      this.label((money?this.t('金币 +','COINS +'):p?this.productName(p)+' ×':this.t('补给箱 ×','CRATES ×'))+n,x+8,y+ch*.66,cw-16,36,32,money?gold:ivory,true);this.label(p?this.brief(p):money?this.t('已存入金币余额','Added to your balance'):this.t('点击一键打开查看物资','Open to reveal supplies'),x+8,y+ch*.84,cw-16,ch*.13,22,dim);
    }));
    const bw=(rw-12)/2;this.button('qm:giftClose',this.t(gift.opened?'完成':'稍后打开',gift.opened?'DONE':'LATER'),rx,b-48,bw,44,'gold',q.busy);this.button(gift.opened?'qm:giftWarehouse':'qm:giftOpen',this.t(gift.opened?'查看仓库':q.pending?'重试打开':'一键打开',gift.opened?'INVENTORY':q.pending?'RETRY':'OPEN ALL'),rx+bw+12,b-48,bw,44,'blue',q.busy);
  }
  private confirm(){
    const q=this.q,intent=q.confirmation!,pw=Math.min(590,this.right-this.left),ph=Math.min(260,this.height-24),x=(this.w-pw)/2,y=(this.height-ph)/2;
    // The confirmation gets its own top layer so it blocks both pictures and older touch targets.
    const overlay=this.h.node('Confirmation',this.n);const g=overlay.addComponent(Graphics);this.h.rect(g,0,0,this.w,this.height,'#01070cce');
    this.h.rect(g,x,y,pw,ph,'#071723','#c4a268',8);
    for(const b of this.h.buttons)if(this.h.inModal(b.label.node)){b.disabled=true;}this.h.listAreas=[];
    const text=intent.kind==='sell'?this.t(`出售 ${this.inventoryName(intent.item)} ×${intent.quantity}？\n总计 ${q.sellPrice(intent.item)*intent.quantity} 金币`,`Sell ${this.inventoryName(intent.item)} ×${intent.quantity}?\nTotal ${q.sellPrice(intent.item)*intent.quantity} coins`):intent.kind==='activate'?this.t(`激活 ${this.inventoryName(intent.item)}？\n连续24小时；再次激活只续期，不叠加强度。`,`Activate ${this.inventoryName(intent.item)}?\nLasts 24 continuous hours. Renewal extends time, not strength.`):q.message[this.h.lang==='zh'?0:1];
    const label=this.label(text,x+24,y+20,pw-48,ph-95,30,ivory,true);label.node.setSiblingIndex(this.n.children.length-1);
    const left=this.h.button('qm:cancel',this.t('取消','CANCEL'),x+20,y+ph-62,(pw-52)/2,44,this.n);left.node.setSiblingIndex(this.n.children.length-1);
    const right=this.h.button('qm:confirm',this.t('确认','CONFIRM'),x+32+(pw-52)/2,y+ph-62,(pw-52)/2,44,this.n);right.color=color(gold);right.node.setSiblingIndex(this.n.children.length-1);
    this.h.rect(g,x+20,y+ph-62,(pw-52)/2,44,'#193348','#708b9b',4);this.h.rect(g,x+32+(pw-52)/2,y+ph-62,(pw-52)/2,44,'#634a27','#e2bb74',4);
  }
  private settlement(s:Simulation){
    const q=this.q,online=this.h.online,reward=s.duelMode?online?.room?.settlement:online?.battleReward,training=s.mission.mode==='training',success=s.phase==='success';
    const duel=s.duelMode,outcome=reward?.outcome||(online?.view?.winner===null?'draw':online?.view?.winner===(online?.room?.you??0)?'win':'loss');
    const title=duel?online?.spectator?this.t('观战结束','MATCH ENDED'):this.t(outcome==='win'?'战斗胜利':outcome==='draw'?'战斗平局':'战斗失败',outcome==='win'?'VICTORY':outcome==='draw'?'DRAW':'DEFEAT'):training?this.t(success?'训练完成':'训练结束',success?'TRAINING COMPLETE':'TRAINING ENDED'):this.t(success?'任务完成':'行动结束',success?'MISSION COMPLETE':'OPERATION ENDED');
    const reason=success?this.t(`评价 ${s.rating} · 友伤 ${Math.round(s.friendlyDamage)}`,`RATING ${s.rating} · FRIENDLY DAMAGE ${Math.round(s.friendlyDamage)}`):s.failedGroup?this.t(`第 ${s.failedGroup} 据点全灭`,`OUTPOST ${s.failedGroup} LOST`):s.failure==='vehicle'?this.t('救援车被毁','RESCUE VEHICLE LOST'):this.t('整备后再战','REGROUP AND RETRY');
    const subtitle=duel?this.t('对手：','OPPONENT: ')+playerLabel(online?.opponent||{}):text(s.mission.name,this.h.lang)+' · '+reason;
    const pw=Math.min(this.w-this.h.safe.left-this.h.safe.right-24,this.low?this.w*.79+80:this.w*.78),ph=Math.min(this.height-this.h.safe.top-this.h.safe.bottom-24,this.height*.84+(this.low?20:0)),x=(this.w-pw)/2,y=(this.height-ph)/2;
    this.h.rect(this.g,0,0,this.w,this.height,'#030c1766');this.panel(x,y,pw,ph);
    const banner=this.low?57:ph*.34;
    if(!this.low)this.picture('resultBadge',x+pw*.32,y-52*this.scale,pw*.36,pw*.36/3,false);
    this.label(title,x+18,y+(this.low?6:banner*.34),pw-36,this.low?32:banner*.4,82,gold,true);
    this.label(subtitle,x+18,y+banner-22,pw-36,22,26,ivory);
    const sy=y+banner+8,gap=8,cw=(pw-40-gap*3)/4,sh=this.low?65:ph*.21;
    const credited=reward?.status==='credited',values=[formatTime(Math.round((s.completionTime??s.time)*1000)),training?'—':`+${reward?.points??(!duel&&(online?.rankStatus==='finished'||online?.rankStatus==='assisted')?100:0)}`,credited?`+${reward?.coins??0}`:'—',credited?`+${reward?.xp??0}`:'—'];
    ['作战用时','本局积分','获得金币','获得经验'].forEach((zh,i)=>{const xx=x+20+i*(cw+gap);this.panel(xx,sy,cw,sh);this.label(this.t(zh,['TIME','POINTS','COINS','XP'][i]),xx+4,sy+5,cw-8,sh*.35,28,dim);this.label(values[i],xx+4,sy+sh*.35,cw-8,sh*.6,61,i===2?gold:i===3?'#b8e3a5':ivory,true);});
    const py=sy+sh+(this.low?10:20*this.scale);if(!this.low)this.panel(x+20,py,pw-40,76*this.scale);
    this.label(`Lv.${q.assets?.level??1}`,x+20,py+(this.low?0:16*this.scale),this.low?75:150*this.scale,this.low?28:42*this.scale,this.low?29:39,gold,true);
    this.bar(x+(this.low?98:184*this.scale),py+(this.low?8:29*this.scale),pw-(this.low?220:380*this.scale),this.low?11:18*this.scale,(q.assets?.current??0)/(q.assets?.required||200));this.label(`${q.assets?.current??0}/${q.assets?.required??200}`,x+pw-(this.low?117:185*this.scale),py+(this.low?0:16*this.scale),this.low?98:160*this.scale,this.low?28:42*this.scale,26,dim);
    const next=!duel&&!training&&success&&s.mission.id!==MISSIONS.at(-1)!.id;
    if(!this.low){const task=q.assets?.tasks.find(t=>t.event===(duel?'duel':'solo')||t.event==='complete'),ty=py+90*this.scale;this.panel(x+20,ty,pw-40,72*this.scale);this.label(task?`${this.t('每日任务','DAILY TASK')}  ${task.progress}/${task.target}`:this.t('查看每日任务与奖励','VIEW DAILY TASKS & REWARDS'),x+30,ty+7,pw*(next?.46:.59),44,31,ivory,false,true);this.button('qm:tasks',this.t('查看奖励','REWARDS'),x+pw*(next?.51:.69),ty+7,pw*(next?.22:.27),44);if(next)this.button('missionNext',this.t('下一任务 ›','NEXT ›'),x+pw*.75,ty+7,pw*.21,44);}
    const pending=['pending-sync','syncing','recording'].includes(online?.rankStatus||'');
    const status=training||online?.bot?this.t('训练不消耗库存，不产出正式资产','Practice: no stock consumed or assets earned'):online?.spectator?this.t('观战不计收益','SPECTATING · NO REWARDS'):credited?this.t('✓ 收益已到账','✓ REWARDS CREDITED'):duel||pending?this.t('待同步 · 联网后确认收益','PENDING SYNC · awaiting confirmation'):this.t('本局仅本地记录，不产出正式资产','LOCAL RESULT · NO ASSET REWARDS');
    const comparison=this.h.timeComparison,record=duel?'':training?this.h.trainingBest?this.t(`最佳 ${this.h.trainingBest.time.toFixed(1)} 秒`,`BEST ${this.h.trainingBest.time.toFixed(1)}s`):'':comparison?this.t(`${comparison.newRecord?'新纪录 · ':''}个人最佳 ${formatTime(comparison.bestMs)}`,`${comparison.newRecord?'NEW RECORD · ':''}PERSONAL BEST ${formatTime(comparison.bestMs)}`):!success&&s.failureCause==='friendly'?this.t('致命伤来自己方火力，开火前检查友军','FRIENDLY FIRE · CHECK ALLIES BEFORE FIRING'):'';
    this.label(status+(record?'\n'+record:''),x+20,y+ph-(this.low?104:172*this.scale),pw-40,this.low?42:60*this.scale,23,credited?'#94da90':dim);
    const bw=this.low?(pw-(next?88:76))/(next?3:2):pw*.36,by=y+ph-(this.low?58:105*this.scale),bh=this.low?48:80*this.scale;
    this.button('home',this.t('返回基地','RETURN TO BASE'),this.low?x+24:x+pw*.07,by,bw,bh,'blue');
    this.button(s.duelMode?'online:backLobby':'retry',this.t(s.duelMode?'返回大厅':'再次出动',s.duelMode?'BACK TO LOBBY':'DEPLOY AGAIN'),this.low?x+52+bw:x+pw*.57,by,bw,bh,'gold');
    if(this.low&&next)this.button('missionNext',this.t('下一任务','NEXT'),x+64+bw*2,y+ph-58,bw,48,'gold');
  }
}
