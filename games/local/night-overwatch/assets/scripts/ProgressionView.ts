import { Color, Label, Node, Graphics, Sprite, UITransform } from 'cc';
import type { HUD } from './HUD';
import { playerLabel } from './Online';
import { ProgressionArt } from './ProgressionArt';
import { Quartermaster, effectEnglish } from './Quartermaster';
import { CATALOG, PACKAGES, POOLS, SKILLS, attackPreview, type Product, type Effect, type AssetReward } from './core/Progression';
import { formatTime } from './core/BattleRecords';
import { text } from './core/Data';
import type { Simulation } from './core/Simulation';
import { MISSIONS } from './core/MissionCatalog';

const ivory='#f4e9d1',dim='#a7bcc9',cyan='#78e3ff',gold='#e5bd71';
const color=(hex:string)=>new Color().fromHEX(hex);
const names:Record<string,[string,string]>={modes:['开始行动','DEPLOY'],loadout:['军需配置','LOADOUT'],shop:['军需商店','ARMORY'],supply:['礼包','SUPPLY'],growth:['成长与技能','GROWTH & SKILLS'],tasks:['任务','TASKS'],inbox:['消息中心','MESSAGES'],warehouse:['补给仓库','WAREHOUSE'],receipts:['开包记录','OPENING HISTORY'],checkin:['每日签到','DAILY CHECK-IN'],probability:['概率与内容','CONTENTS & ODDS']};
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
    const l=this.h.label(this.n,value,x+w/2,y+h/2,this.font(size),w,h,tone);
    l.lineHeight=l.fontSize*1.23;l.isBold=serif;
    if(serif&&this.h.lang==='zh'&&this.a.font){l.font=this.a.font;l.useSystemFont=false;}
    if(left)l.horizontalAlign=Label.HorizontalAlign.LEFT;
    return l;
  }
  private picture(key:string,x:number,y:number,w:number,h:number,cover=true){
    const frame=this.a.get(key);if(!frame)return;
    if(cover)this.h.coverImage(this.surfaces,'Illustration:'+key,frame,x,y,w,h);
    else this.h.image(this.surfaces,'Illustration:'+key,frame,x,y,w,h);
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
  private tab(id:string,caption:string,x:number,y:number,w:number,selected:boolean){this.button(id,caption,x,y,w,44,selected?'blue':'panel');}
  private bar(x:number,y:number,w:number,h:number,ratio:number,tone=cyan){
    this.h.rect(this.g,x,y,w,h,'#06121a','#64808d',h/2);if(ratio>0)this.h.gradient(this.g,x+2,y+2,Math.max(0,(w-4)*Math.min(1,ratio)),h-4,tone,'#4887a7',Math.min(4,h/2));
  }
  private productName(p:Product){return this.t(p.name,effectEnglish[p.effect]);}
  private productArt(effect:Effect){return ({rate:'burst',radius:'twin',cooling:'trackingDevice'} as Partial<Record<Effect,string>>)[effect]||effect;}
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
    if(this.q.confirmation)this.confirm();
  }
  private pager(total:number,size:number,y:number){
    const pages=Math.max(1,Math.ceil(total/size));this.q.index=Math.min(this.q.index,pages-1);
    const x=this.left;this.button('qm:prev','‹',x,y,48,44,'panel',!this.q.index);
    this.label(`${this.q.index+1} / ${pages}`,x+54,y,90,44,24,dim);
    this.button('qm:next','›',x+150,y,48,44,'panel',this.q.index>=pages-1);
  }
  render(s:Simulation,result=false){
    if(result){this.settlement(s);return;}
    if(!this.q.page){this.home();return;}
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
    const inboxW=compactHeader?46:132,coinW=compactHeader?56:170;
    this.h.button('qm:inbox',this.t('信箱','Inbox'),settingsX-inboxW-6,top+3,inboxW,Math.max(44,bar-6),this.n).fontSize=this.font(26,13);
    const noticeX=settingsX-inboxW*2-12;
    if(!compactHeader)this.h.button('qm:announcements',this.t('公告','News'),noticeX,top+3,inboxW,Math.max(44,bar-6),this.n).fontSize=this.font(26,13);
    const coinX=(compactHeader?settingsX-inboxW-6:noticeX)-coinW-8;
    if(!compactHeader)this.picture('coin',coinX,top+bar*.29,bar*.43,bar*.44);
    this.label((compactHeader?'● ':'')+(q.assets?.coins.toLocaleString()??'—'),coinX+(compactHeader?0:bar*.5),top+8,coinW-(compactHeader?0:bar*.5),bar-16,30,ivory);
    if(q.unread){this.g.fillColor=color('#ec4940');this.g.circle(settingsX-11-w/2,h/2-top-10,4);this.g.fill();}
    const titleW=w*(this.low?.29:.33),titleY=top+bar+h*.045;
    this.picture('title',l+8,titleY,titleW,titleW/3,false);
    const bw=w*.30,bh=Math.max(46,h*.133),by=Math.max(titleY+titleW/3+8,h*.405);
    for(const [i,id]of ['loadout','modes'].entries()){
      const yy=by+i*(bh+Math.max(5,h*.014)),label=this.button('qm:'+id,this.t(i?'开始行动  ›':'军需配置  ›',i?'DEPLOY  ›':'LOADOUT  ›'),l+8,yy,bw,bh,i?'gold':'blue');
      if(!this.narrow){this.picture(i?'homeCompass':'homeCrate',l+bw*.07,yy+bh*.18,bw*.22,bh*.64,false);label.fontSize=this.font(49,16);label.node.setPosition(l+8+bw*.64-w/2,h/2-yy-bh/2);label.node.getComponent(UITransform)!.setContentSize(bw*.65,bh-10);}
    }
    const fw=Math.max(128,w*.175),fy=h*.452,fh=Math.max(44,h*.11);
    this.panel(r-fw,fy,fw,fh*2+6);this.button('qm:checkin',this.t('每日签到','CHECK IN'),r-fw+5,fy+3,fw-10,fh);
    this.button('qm:supply',this.t('礼包','SUPPLY'),r-fw+5,fy+fh+3,fw-10,fh);
    const cy=h*.755,ch=Math.min(h*.19,this.bottom-cy),gap=Math.max(6,w*.009),cw=(r-l-gap*3)/4;
    for(const [i,[id,key,zh,en]]of [['shop','homeShop','军需商店','ARMORY'],['growth','homeGrowth','成长技能','GROWTH'],['tasks','homeTasks','任务','TASKS'],['warehouse','homeWarehouse','补给仓库','WAREHOUSE']].entries()){
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
    const details=this.h.lang==='zh'?p.description:({power:'Regular weapon damage +15%.',rate:'Regular attack interval −12%.',burst:'Fire twice. Each shot uses ammunition and heat.',twin:'Two trajectories. Combines with double burst.',radius:'HE / incendiary blast radius +15%.',cooling:'Weapon heat −15%. Skill cooldown is unchanged.',drone:'Limited lifetime and damage budget. Slows enemies.',laser:'Instant line-of-sight hit. Limited ammo, long cooldown.',tracking:'Tracks for 60s; then 90s cooldown. Repeatable.',emp:'Ground enemies stop for 4s; then 45s cooldown.'})[p.effect];
    if(this.low){
      this.panel(x,y,w,h);const iw=w*.31,tx=x+iw+12,tw=w-iw-24;
      this.picture(this.productArt(p.effect),x+6,y+6,iw-6,h-12);
      this.label(this.productName(p)+' · '+this.term(p.term),tx,y+4,tw,24,32,ivory,true,true);
      this.label(details,tx,y+29,tw,Math.max(28,h-108),23,dim,false,true);
      this.label(this.q.assets?.permanent.includes(p.effect)?this.t('已永久拥有','Permanently owned'):`● ${p.price.toLocaleString()}`,tx,y+h-76,tw,24,29,gold);
      const bw=(tw-8)/2;
      this.button(shop?'qm:buy':'qm:equip',this.t(shop?'购买1件':'装备 / 取消',shop?'BUY 1':'EQUIP / REMOVE'),tx,y+h-48,bw,44,'gold',this.q.busy||!this.q.assets||!!(shop&&p.term==='permanent'&&this.q.assets.permanent.includes(p.effect)));
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
    this.button(shop?'qm:buy':'qm:equip',this.t(shop?'购买1件':'装备 / 取消',shop?'BUY 1':'EQUIP / REMOVE'),x+12,by,bw,44,'gold',this.q.busy||!this.q.assets||!!(shop&&p.term==='permanent'&&owned));
    this.button('qm:trial',this.t('训练试用','TRY IN TRAINING'),x+24+bw,by,bw,44,'panel',this.q.busy);
  }
  private shop(){
    const q=this.q,l=this.left,r=this.right,y=this.top,terms=['match','24h','permanent'] as const;
    const leftW=this.narrow?r-l:(r-l)*.53,tabW=leftW/3;
    terms.forEach((term,i)=>this.tab('term:'+term,this.term(term),l+i*tabW,y,tabW-4,q.term===term));
    const order=['burst','twin','laser','tracking'];const products=q.catalog.filter(p=>p.term===q.term).sort((a,b)=>(order.includes(a.effect)?order.indexOf(a.effect):10)-(order.includes(b.effect)?order.indexOf(b.effect):10));
    const current=products.find(p=>p.id===q.selected)||products[0];if(!current)return;q.selected=current.id;
    const top=y+52,bottom=this.bottom-54;
    if(this.narrow&&q.detail){this.productDetail(current,l,top,r-l,bottom-top,true);this.button('qm:list',this.t('商品列表','ITEM LIST'),l,this.bottom-48,144);return;}
    const pageSize=this.low?2:4,rows=pageSize/2,cw=(leftW-12)/2,ch=(bottom-top-(rows-1)*12)/rows;
    products.slice(q.index*pageSize,q.index*pageSize+pageSize).forEach((p,i)=>{
      const x=l+(i%2)*(cw+12),yy=top+Math.floor(i/2)*(ch+12);this.panel(x,yy,cw,ch,p.id===q.selected);
      this.picture(this.productArt(p.effect),x+5,yy+5,cw-10,ch*.72);this.h.gradient(this.g,x+5,yy+ch*.59,cw-10,ch*.38,'#06121a44','#06121af5');
      const b=this.h.button('product:'+p.id,'',x,yy,cw,ch,this.n);b.string=this.productName(p);b.fontSize=this.font(33,15);b.isBold=true;b.node.setPosition(x+cw/2-this.w/2,this.height/2-yy-ch*.77);b.node.getComponent(UITransform)!.setContentSize(cw-14,30);
      this.label(`● ${p.price.toLocaleString()}  ·  ${this.term(p.term)}`,x+8,yy+ch-30,cw-16,26,23,gold);
    });
    this.pager(products.length,pageSize,this.bottom-48);
    if(!this.narrow)this.productDetail(current,l+leftW+18,top,r-l-leftW-18,bottom-top,true);
  }
  private loadout(){
    if(!this.low){this.hangarLoadout();return;}
    const q=this.q,l=this.left,r=this.right,y=this.top,load=q.loadout;
    this.tab('loadout:solo',this.t('单人方案','SOLO'),l,y,Math.min(170,(r-l)*.23),q.mode==='solo');
    this.tab('loadout:duel',this.t('双人方案','DUEL'),l+Math.min(178,(r-l)*.24),y,Math.min(170,(r-l)*.23),q.mode==='duel');
    if(!this.narrow)this.label(this.t('方案自动保存 · 每场自动应用','Auto-saved · used next match'),l+(r-l)*.48,y,(r-l)*.5,44,23,dim);
    const top=y+(this.low?48:53),bottom=this.bottom-(this.low?50:54),lw=this.narrow?(r-l)*.46:(r-l)*.59,rw=r-l-lw-16,rx=l+lw+16;
    const groups:[string,string,string[],number][]=[['武器改装','MODIFICATIONS',load.mods,2],['特种武器','SPECIAL WEAPON',load.weapon?[load.weapon]:[],1],['主动技能','ACTIVE SKILL',load.skill?[load.skill]:[],1]];
    const gh=this.low?(bottom-top-8)/2:(bottom-top-16)/3;
    groups.forEach(([zh,en,ids,limit],i)=>{
      const yy=top+(this.low?Math.min(i,1):i)*(gh+8),heading=this.low?18:24,groupL=this.low&&i>0?l+(i-1)*(lw+8)/2:l,groupW=this.low&&i>0?(lw-8)/2:lw;
      this.label(`${this.t(zh,this.low?['MODS','WEAPON','SKILL'][i]:en)}  ${ids.length}/${limit}`,groupL,yy,groupW,heading,26,gold,true,true);
      const cw=(groupW-(limit-1)*8)/limit,hh=gh-heading;
      for(let j=0;j<limit;j++){
        const x=groupL+j*(cw+8),id=ids[j],p=q.catalog.find(p=>p.id===id);this.panel(x,yy+heading,cw,hh);
        if(p&&!this.narrow){this.picture(this.productArt(p.effect),x+4,yy+heading+4,cw-8,hh-8);this.h.gradient(this.g,x+4,yy+heading+hh-28,cw-8,24,'#07131b88','#07131bee');}
        const caption=p?this.productName(p)+' ×':this.low?this.t(zh,en)+' ＋':this.t('＋ 选择','＋ Select');
        const b=this.h.button(id?'slot:'+id:`qm:choose:${i}:${j}`,caption,x,yy+heading,cw,Math.max(44,hh),this.n);
        b.fontSize=this.font(27,12);if(!this.narrow){b.node.setPosition(x+cw/2-this.w/2,this.height/2-yy-heading-hh+15);b.node.getComponent(UITransform)!.setContentSize(cw-8,28);}
      }
    });
    const equipped=[...load.mods,load.weapon,load.skill].filter(Boolean).map(id=>q.catalog.find(p=>p.id===id)?.effect||''),preview=attackPreview(equipped),previewH=this.low?30:(bottom-top)*.34;
    this.panel(rx,top,rw,previewH);if(!this.low)this.picture('combo',rx+5,top+5,rw-10,previewH*.58);
    this.label(this.t(`每次攻击 ${preview.shots} 发`,`SHOTS PER ATTACK: ${preview.shots}`),rx+8,top+(this.low?0:previewH*.48),rw-16,this.low?17:30,36,ivory,true);
    this.label(this.t(`弹药 ×${preview.shots} · 热量按发数计算`,`Ammo ×${preview.shots} · heat per shot`),rx+8,top+previewH-(this.low?17:26),rw-16,this.low?17:23,20,dim);
    const available=q.catalog.filter(p=>(q.assets?.available[p.id]??0)>0||q.assets?.permanent.includes(p.effect)&&p.term==='permanent'||(q.assets?.active[p.effect]??0)>(q.assets?.serverNow??Date.now())&&p.term==='24h');
    const size=this.low?1:3,yy=top+previewH+6,rowH=(bottom-yy-48)/size;
    available.slice(q.index*size,q.index*size+size).forEach((p,i)=>{
      const py=yy+i*rowH;this.panel(rx,py,rw,rowH-5);if(!this.narrow)this.picture(this.productArt(p.effect),rx+5,py+5,rw*.3,rowH-15);
      const tx=rx+(this.narrow?8:rw*.33),tw=rw-(tx-rx)-72;
      this.label(this.productName(p),tx,py+4,tw,rowH*.48,27,ivory,true,true);
      this.label(q.assets?.permanent.includes(p.effect)?this.t('永久资格','Permanent'):this.term(p.term)+` ×${q.assets?.available[p.id]??0}`,tx,py+rowH*.48,tw,rowH*.4,19,gold,false,true);
      this.button('equip:'+p.id,this.t('选择','Select'),rx+rw-70,py+Math.max(0,(rowH-49)/2),66,44,'panel',q.busy);
    });
      if(!available.length)this.label(this.t('还没有可用军需\n前往商店或领取签到礼包','No gear yet.\nVisit the armory or check in.'),rx,yy,rw,Math.max(44,bottom-yy-44),25,dim);
    this.button('qm:choosePrev','‹',rx,bottom-44,46,44,'panel',q.index===0);this.button('qm:chooseNext','›',rx+52,bottom-44,46,44,'panel',(q.index+1)*size>=available.length);
    this.button('qm:shop',this.t('前往商店','ARMORY'),rx+rw-130,bottom-44,130,44,'blue');
    this.label(this.t('基础成长自动生效，不占军需槽','Base growth is automatic; no slot required'),l,this.bottom-48,lw,44,21,dim,false,true);
    this.button('qm:home',this.t('返回基地','BASE'),r-152,this.bottom-48,152,44,'gold');
  }
  private hangarLoadout(){
    const q=this.q,l=this.left,r=this.right,w=this.w,h=this.height,load=q.loadout,rx=w*.62,rw=r-rx,sy=this.h.safe.top+Math.max(4,h*.02),tabW=w*.115;
    this.button('loadout:solo',this.t('单人方案','SOLO'),w*.21,sy,tabW,Math.max(44,h*.055),q.mode==='solo'?'blue':'panel');
    this.button('loadout:duel',this.t('双人方案','DUEL'),w*.33,sy,tabW,Math.max(44,h*.055),q.mode==='duel'?'blue':'panel');
    this.label(this.t('方案自动保存 · 每场自动应用','Auto-saved · used next match'),w*.455,sy,w*.36,Math.max(44,h*.055),23,dim,false,true);
    const gx=w*.083,gw=w*.32,gy=h*.255,gh=h*.21,cardH=h*.14;
    const groups:[string,string,string[],number][]=[['武器改装','MODIFICATIONS',load.mods,2],['特种武器','SPECIAL WEAPON',load.weapon?[load.weapon]:[],1],['主动技能','ACTIVE SKILL',load.skill?[load.skill]:[],1]];
    groups.forEach(([zh,en,ids,limit],i)=>{
      const yy=gy+i*gh,cw=limit===2?(gw-12)/2:gw*.75;
      this.label(`${this.t(zh,en)}  ${ids.length}/${limit}`,gx,yy,gw,Math.max(24,h*.035),27,ivory,true,true);
      for(let j=0;j<limit;j++){
        const x=gx+j*(cw+12),cy=yy+h*.04,id=ids[j],p=q.catalog.find(p=>p.id===id);this.panel(x,cy,cw,cardH);
        if(p){const key=({burst:'loadoutBurst',twin:'loadoutTwin',tracking:'loadoutTracking',emp:'loadoutEmp'} as Partial<Record<Effect,string>>)[p.effect]||this.productArt(p.effect);this.picture(key,x+4,cy+4,cw-8,cardH-8);this.h.gradient(this.g,x+4,cy+cardH*.6,cw-8,cardH*.36,'#04101a00','#04101aee');}
        const label=this.h.button(id?'slot:'+id:`qm:choose:${i}:${j}`,p?this.productName(p):this.t('＋ 选择','＋ Select'),x,cy,cw,cardH,this.n);label.fontSize=this.font(28,15);label.node.setPosition(x+cw/2-w/2,h/2-cy-cardH+18);label.node.getComponent(UITransform)!.setContentSize(cw-12,32);
        if(p)this.label('⊗',x+cw-40,cy+5,32,32,31,ivory);
      }
    });
    const top=this.top,previewH=h*.36,preview=attackPreview([...load.mods,load.weapon,load.skill].filter(Boolean).map(id=>q.catalog.find(p=>p.id===id)?.effect||''));
    this.panel(rx,top,rw,previewH);this.label(this.t('组合效果预览','COMBINATION PREVIEW'),rx+14,top+5,rw-28,h*.035,26,cyan,false,true);
    this.picture('combo',rx+8,top+h*.044,rw-16,previewH*.53);this.h.gradient(this.g,rx+8,top+previewH*.4,rw-16,previewH*.58,'#06131b00','#06131bf5');
    this.label(load.mods.map(id=>this.catalogName(id)).join(' × ')||this.t('基础火控','STANDARD FIRE CONTROL'),rx+20,top+previewH*.5,rw-40,h*.05,36,ivory,true,true);
    this.label(this.t(`每次攻击 ${preview.shots} 发`,`SHOTS PER ATTACK: ${preview.shots}`),rx+20,top+previewH*.64,rw-40,h*.07,56,ivory,true,true);
    this.label(this.t(`弹药 ×${preview.shots} · 热量按发数计算`,`Ammo ×${preview.shots} · heat per shot`),rx+20,top+previewH*.87,rw-40,h*.04,26,dim,false,true);
    const available=q.catalog.filter(p=>q.assets?.permanent.includes(p.effect)?p.term==='permanent':(q.assets?.active[p.effect]??0)>(q.assets?.serverNow??Date.now())?p.term==='24h':(q.assets?.available[p.id]??0)>0),size=2,yy=top+previewH+12,rowH=h*.19;
    available.slice(q.index*size,q.index*size+size).forEach((p,i)=>{
      const py=yy+i*(rowH+8);this.panel(rx,py,rw,rowH);this.label(this.t(p.category==='skill'?'可选技能':p.category==='weapon'?'可选武器':'可选改装',p.category==='skill'?'AVAILABLE SKILL':'AVAILABLE EQUIPMENT'),rx+14,py+3,rw-28,h*.032,25,cyan,false,true);
      const key=p.effect==='tracking'?'loadoutTracking':p.effect==='emp'?'loadoutEmp':this.productArt(p.effect);this.picture(key,rx+8,py+h*.045,rw*.35,rowH-h*.052);
      const tx=rx+rw*.38,tw=rw*.59;this.label(this.productName(p),tx,py+h*.045,tw,h*.047,36,ivory,true,true);
      this.label(q.assets?.permanent.includes(p.effect)?this.t('永久资格','Permanent'):this.term(p.term)+` ×${q.assets?.available[p.id]??0}`,tx,py+h*.092,tw,h*.032,23,gold,false,true);
      this.button('equip:'+p.id,this.t('选择','Select'),rx+rw-Math.max(90,rw*.20)-12,py+rowH-Math.max(44,h*.054)-8,Math.max(90,rw*.20),Math.max(44,h*.054),'blue',q.busy);
    });
    if(!available.length)this.label(this.t('还没有可用军需\n前往商店或领取签到礼包','No gear yet.\nVisit the armory or check in.'),rx,yy,rw,rowH,25,dim);
    this.panel(l,this.bottom-h*.08,rx-l-12,h*.08);this.label(q.busy?this.t('正在保存…','Saving…'):q.message[this.h.lang==='zh'?0:1]||this.t('基础成长自动生效，不占军需槽','Base growth is automatic; no slot required'),l+20,this.bottom-h*.08,rx-l-40,h*.08,25,dim,false,true);
    const fy=this.bottom-Math.max(48,h*.075);this.button('qm:choosePrev','‹',rx,fy,44,44,'panel',!q.index);this.button('qm:chooseNext','›',rx+50,fy,44,44,'panel',(q.index+1)*size>=available.length);
    this.button('qm:shop',this.t('商店','ARMORY'),rx+102,fy,Math.max(76,rw*.17),44,'blue');this.button('qm:home',this.t('返回基地','RETURN TO BASE'),r-rw*.53,fy,rw*.53,Math.max(48,h*.075),'gold');
  }
  private supply(){
    const q=this.q,l=this.left,r=this.right,y=this.low?this.top:this.height*.13,width=r-l;
    [['supply','礼包套餐','PACKAGES'],['checkin','每日签到','CHECK IN'],['warehouse','我的仓库','WAREHOUSE']].forEach(([id,zh,en],i)=>this.button('qm:'+id,this.t(zh,en),l+i*Math.min(this.w*.15,width/3),y,Math.min(this.w*.147,width/3-4),this.low?44:this.height*.065,q.page===id?'blue':'panel'));
    const top=y+(this.low?52:this.height*.074),bottom=this.bottom-(this.low?54:this.height*.08),heroW=this.narrow?0:width*.36,rx=l+(heroW?heroW+14:0),rw=r-rx;
    if(heroW){this.panel(l,top,heroW,bottom-top);this.picture('supply',l+7,top+45,heroW-14,(bottom-top)*.66);this.label(this.t(q.pool==='gold'?'金币军需箱':'通用补给箱',q.pool==='gold'?'GOLD ARMORY CRATE':'GENERAL SUPPLY CRATE'),l+16,top+10,heroW-32,36,43,ivory,true,true);
      if(!this.low){rarity.forEach((name,i)=>this.label('● '+this.t(name,rarityEn[i]),l+8+i*(heroW-16)/4,top+(bottom-top)*.74,(heroW-16)/4,34,24,rarityColor[i]));this.label(this.t('武器、增益、技能资格均为单场','ONE-MATCH WEAPONS, MODS & SKILLS'),l+12,bottom-52,heroW-24,34,25,ivory);}
      this.button('qm:probability',this.t('概率与内容  ›','CONTENTS & ODDS  ›'),l+12,bottom-(this.low?55:110*this.scale),heroW-24,44,'panel');}
    const packageH=this.low?44:this.height*.24,gap=6,px=rx+(this.low?0:18*this.scale),cardsY=top+(this.low?0:this.height*.09),pw=(rw-(px-rx)*2-4*gap)/5;
    if(!this.low){this.panel(rx,top,rw,cardsY-top+packageH+14);this.label(this.t('选择礼包数量','CHOOSE QUANTITY'),rx+24*this.scale,top+12,rw-48*this.scale,this.height*.06,43,ivory,true,true);}
    q.packages.forEach((p,i)=>{const x=px+i*(pw+gap);this.panel(x,cardsY,pw,packageH,p.quantity===q.quantity);if(!this.low)this.picture('pack'+p.quantity,x+4,cardsY+packageH*.24,pw-8,packageH*.57);
      const b=this.h.button('package:'+p.quantity,`${p.quantity} ${this.t('个','crates')}`,x,cardsY,pw,packageH,this.n);b.fontSize=this.font(36,14);b.node.setPosition(x+pw/2-this.w/2,this.height/2-cardsY-(this.low?14:packageH*.15));b.node.getComponent(UITransform)!.setContentSize(pw-4,this.low?24:44);
      this.label(p.quantity===1?this.t('原价','Full price'):this.t(`${p.coins/(p.quantity*q.packages[0].coins)*10}折`,`${Math.round((1-p.coins/(p.quantity*q.packages[0].coins))*100)}% OFF`),x+4,cardsY+packageH-(this.low?18:35*this.scale),pw-8,this.low?16:30*this.scale,25,p.quantity===q.quantity?gold:dim);
    });
    const quote=q.packages.find(p=>p.quantity===q.quantity)!,cy=cardsY+packageH+(this.low?10:28*this.scale),cw=(rw-10)/2,ch=bottom-cy;
    this.panel(rx,cy,cw,ch);this.panel(rx+cw+10,cy,cw,ch);
    if(this.low){
      const order=q.pendingOrder,required=order?.required??quote.videos;
      this.label(this.t(`金币购买 · ${quote.coins}`,`BUY · ${quote.coins} COINS`),rx+8,cy+3,cw-16,21,30,gold,true);
      if(ch>90)this.label(this.t(`单价 ${quote.coins/quote.quantity} · 节省 ${quote.quantity*q.packages[0].coins-quote.coins}`,`${quote.coins/quote.quantity}/crate · Save ${quote.quantity*q.packages[0].coins-quote.coins}`),rx+8,cy+25,cw-16,18,21,dim);
      this.button('qm:buyPacks',this.t(`购买 ${quote.quantity} 个`,`BUY ${quote.quantity}`),rx+8,bottom-48,cw-16,44,'gold',q.busy||!q.assets);
      const vx=rx+cw+10;this.label(this.t(`视频兑换 · ${order?.completed??0}/${required} 段`,`VIDEO · ${order?.completed??0}/${required}`),vx+8,cy+3,cw-16,21,29,ivory,true);
      if(ch>90)this.label(this.t(q.pool==='gold'?'金币限定物资不进入视频池':'已确认进度保留 · 每日限12段',q.pool==='gold'?'Gold-only gear is excluded':'Progress saved · 12 videos/day'),vx+8,cy+25,cw-16,18,20,dim);
      this.button('qm:watch',q.viewing?this.t('观看中…','WATCHING…'):this.t(order?'继续观看':'开始观看',order?'CONTINUE':'WATCH'),vx+8,bottom-48,cw-16,44,'blue',q.viewing||q.busy||!q.assets||q.pool==='gold');
    }else{
    this.label(this.t('金币购买','COIN PURCHASE'),rx+8,cy+ch*.025,cw-16,ch*.17,42,gold,true);
    this.picture('coin',rx+cw*.19,cy+ch*.28,cw*.12,cw*.12,false);this.label(quote.coins.toLocaleString(),rx+cw*.34,cy+ch*.21,cw*.56,ch*.25,66,gold,true);
    this.label(this.t(`单个 ${quote.coins/quote.quantity} 金币 · 节省 ${quote.quantity*q.packages[0].coins-quote.coins}`,`${quote.coins/quote.quantity}/crate · Save ${quote.quantity*q.packages[0].coins-quote.coins}`),rx+8,cy+ch*.5,cw-16,ch*.12,26,dim);
    this.button('qm:buyPacks',this.t(`购买 ${quote.quantity} 个`,`BUY ${quote.quantity}`),rx+cw*.07,cy+ch*.68,cw*.86,ch*.23,'gold',q.busy||!q.assets);
    const vx=rx+cw+10,order=q.pendingOrder;
    this.label(this.t('视频兑换','VIDEO EXCHANGE'),vx+8,cy+ch*.025,cw-16,ch*.17,42,ivory,true);
    this.label(this.t(`观看 ${order?.required??quote.videos} 段 · 兑换 ${quote.quantity} 个`,`${order?.required??quote.videos} full videos → ${quote.quantity} crates`),vx+8,cy+ch*.23,cw-16,ch*.12,28,dim);
    this.bar(vx+cw*.08,cy+ch*.4,cw*.84,18*this.scale,(order?.completed??0)/(order?.required??quote.videos));this.label(`${order?.completed??0} / ${order?.required??quote.videos} · ${this.t('进度保留','progress saved')}`,vx+8,cy+ch*.49,cw-16,ch*.12,26,cyan);
    this.button('qm:watch',q.viewing?this.t('观看中…','WATCHING…'):this.t(order?'继续观看':'开始观看',order?'CONTINUE':'WATCH'),vx+cw*.07,cy+ch*.64,cw*.86,ch*.23,'blue',q.viewing||q.busy||!q.assets||q.pool==='gold');
    this.label(this.t(q.pool==='gold'?'金币限定物资不进入视频池':'进度保留，可稍后继续',q.pool==='gold'?'Gold-only gear is excluded':'Progress saved · continue later'),vx+8,cy+ch*.89,cw-16,ch*.09,23,dim);
    }
    this.button('pool:'+(q.pool==='general'?'gold':'general'),this.t(q.pool==='general'?'通用池 · 切金币军需':'金币军需 · 切通用池',q.pool==='general'?'GENERAL · GOLD POOL ›':'GOLD · GENERAL POOL ›'),l,this.bottom-48,this.narrow?200:270,44);
    if(this.narrow)this.button('qm:probability',this.t('概率','ODDS'),l+206,this.bottom-48,72);
    this.button('qm:warehouseGo',this.t('前往仓库  ›','WAREHOUSE  ›'),r-180,this.bottom-48,180,44,'panel');
  }
  private growth(){
    const q=this.q,l=this.left,r=this.right,y=this.top,bottom=this.bottom-58,lw=(r-l)*(this.narrow?.28:.29),rx=l+lw+14,rw=r-rx;
    this.panel(l,y,lw,bottom-y);this.picture('emblem',l+8,y+6,lw-16,(bottom-y)*.27);
    this.label(`Lv.${q.assets?.level??1}`,l+8,y+(bottom-y)*.29,lw-16,this.low?24:40,48,gold,true);
    this.bar(l+12,y+(bottom-y)*.45,lw-24,10,(q.assets?.current??0)/(q.assets?.required||200));
    this.label(`${q.assets?.current??0} / ${q.assets?.required??200}`,l+8,y+(bottom-y)*.5,lw-16,25,24,dim);
    const milestones=[[3,'基础强化','Base strength'],[6,'追踪资格','Tracking'],[10,'电磁干扰','EMP'],[15,'火控精修','Precision']] as const;
    milestones.forEach(([level,zh,en],i)=>this.label(`${(q.assets?.level??1)>=level?'✓':'○'} Lv.${level} ${this.t(zh,en)}`,l+8,y+(bottom-y)*.64+i*((bottom-y)*.078),lw-16,Math.max(17,(bottom-y)*.075),25,(q.assets?.level??1)>=level?gold:dim,false,true));
    const tw=Math.min(200,rw/2);this.tab('growth:base',this.t('等级成长','GROWTH'),rx,y,tw,q.section==='base');this.tab('growth:skills',this.t('主动技能','SKILLS'),rx+tw+6,y,tw,q.section!=='base');
    const cy=y+54,ch=(bottom-cy)*.57,cw=(rw-12)/2;
    for(const [i,effect]of (['tracking','emp'] as const).entries()){
      const x=rx+i*(cw+12);this.panel(x,cy,cw,ch,q.selectedSkill===effect);this.picture(effect,x+5,cy+5,cw-10,ch-10);
      this.h.gradient(this.g,x+5,cy+5,cw-10,Math.min(44,ch*.3),'#06131bdd','#06131b00');
      const b=this.h.button('skill:'+effect,this.t(effect==='tracking'?'追踪':'电磁干扰',effectEnglish[effect]),x,cy,cw,ch,this.n);b.fontSize=this.font(43,17);b.isBold=true;b.node.setPosition(x+cw/2-this.w/2,this.height/2-cy-22);b.node.getComponent(UITransform)!.setContentSize(cw-12,38);
    }
    const skill=SKILLS[q.selectedSkill==='emp'?'emp':'tracking'],owned=q.assets?.permanent.includes(q.selectedSkill);
    const details=q.section==='base'?this.t('Lv.3起基础威力自动成长；Lv.15火控精修。\n不占槽位，单人 / 双人均生效。','Base damage grows from Lv.3. Precision at Lv.15.\nAutomatic, no slots. Applies in solo and duel.'):
      this.t(`${owned?'已永久拥有':`Lv.${skill.level}解锁永久资格`} · 效果持续 ${skill.duration} 秒\n结束后冷却 ${skill.cooldown} 秒 · 当场可反复使用\n单人 / 双人均可用 · 每套装备1个技能`,`${owned?'Permanently owned':`Permanent at Lv.${skill.level}`} · Active ${skill.duration}s\nCooldown ${skill.cooldown}s after effect · reusable\nSolo / duel · 1 skill per loadout`);
    this.panel(rx,cy+ch+8,rw,bottom-cy-ch-8);
    this.label(details,rx+16,cy+ch+12,rw-32,bottom-cy-ch-16,28,ivory,false,true);
    this.button('qm:loadout',this.t('前往军需配置  ›','CONFIGURE LOADOUT  ›'),r-Math.min(290,rw),this.bottom-48,Math.min(290,rw),48,'gold');
  }
  private tasks(){
    const q=this.q,l=this.left,r=this.right,y=this.top;this.tab('tasks:daily',this.t('每日任务','DAILY'),l,y,Math.min(230,(r-l)*.3),q.section!=='achievements');this.tab('tasks:achievements',this.t('长期成就','ACHIEVEMENTS'),l+Math.min(240,(r-l)*.31),y,Math.min(230,(r-l)*.34),q.section==='achievements');
    const achievements=q.section==='achievements',tasks=achievements?q.assets?.achievements||[]:(q.assets?.tasks||[]).filter(t=>t.day===q.assets?.day||!t.claimed&&t.progress>=t.target);
    const top=y+53,bottom=this.bottom-58,size=this.low?2:4,rowH=(bottom-top)/size;
    tasks.slice(q.index*size,q.index*size+size).forEach((task,i)=>{
      const yy=top+i*rowH;this.panel(l,yy,r-l,rowH-7);
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
    });
    if(!tasks.length)this.label(this.t('连接后获取今日目标','Connect to load today’s objectives'),l,top,r-l,80,30,dim);
    this.pager(tasks.length,size,this.bottom-48);
    if(!achievements)this.button('qm:claimAll',this.t('一键领取','CLAIM ALL'),r-Math.max(160,(r-l)*.24),this.bottom-48,Math.max(160,(r-l)*.24),48,'gold',q.busy||!q.claimable);
  }
  private inbox(){
    const q=this.q,l=this.left,r=this.right,y=this.top;this.tab('inbox:mail',this.t('信箱','INBOX'),l,y,Math.min(200,(r-l)*.25),q.section!=='news');this.tab('inbox:news',this.t('公告','NEWS'),l+Math.min(208,(r-l)*.26),y,Math.min(200,(r-l)*.25),q.section==='news');
    const news=q.section==='news',entries=news?q.assets?.announcements||[]:q.assets?.mail||[],selected=entries.slice(q.index*(this.low?2:3),(q.index+1)*(this.low?2:3)).find(m=>m.id===q.selectedMail);
    if(selected)q.selectedMail=selected.id;
    const top=y+53,bottom=this.bottom-54,lw=this.narrow?(r-l)*.32:(r-l)*.35,rx=l+lw+14,rw=r-rx,size=this.low?2:3,rowH=Math.min(this.low?68:112,(bottom-top-(size-1)*8)/size);
    entries.slice(q.index*size,q.index*size+size).forEach((m,i)=>{
      const yy=top+i*(rowH+8);this.panel(l,yy,lw,rowH,m.id===q.selectedMail);if(!this.narrow)this.picture('envelope',l+6,yy+6,rowH-12,rowH-12);
      const tx=l+(this.narrow?7:rowH),title=this.h.lang==='zh'?m.title:m.id.startsWith('night-return')?'Welcome / return compensation':'Night Overwatch update';
      const b=this.h.button('mail:'+m.id,title,l,yy,lw,rowH,this.n);b.fontSize=this.font(29,13);b.node.setPosition(tx+(lw-(tx-l))/2-this.w/2,this.height/2-yy-rowH*.38);b.node.getComponent(UITransform)!.setContentSize(lw-(tx-l)-12,rowH*.55);
      const mail=!news?q.assets?.mail.find(x=>x.id===m.id):undefined;
      this.label(mail?this.t(mail.claimed?'已领取':mail.read?'附件待领取':'未读',mail.claimed?'Claimed':mail.read?'Attachment pending':'Unread'):this.t('公告','News'),tx,yy+rowH*.64,lw-(tx-l)-8,rowH*.28,19,mail?.claimed?dim:cyan);
    });
    this.pager(entries.length,size,this.bottom-48);this.panel(rx,top,rw,bottom-top);
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
    if(pack)return this.t((pack[1]==='gold'?'金币军需':'通用')+' · '+rarity[Number(pack[2])],(pack[1]==='gold'?'Gold':'General')+' · '+rarityEn[Number(pack[2])]);
    return p?this.productName(p)+' · '+this.term(p.term):this.t('旧版物资','Legacy item');
  }
  private warehouse(){
    const q=this.q,l=this.left,r=this.right,y=this.top,items=q.inventory,size=this.low?3:6,cols=3,top=y+8,bottom=this.bottom-58;
    const selected=q.item&&items.some(([id])=>id===q.item)?q.item:items[0]?.[0]||'';q.item=selected;
    const lw=this.narrow?(r-l)*.58:(r-l)*.62,rx=l+lw+12,rw=r-rx,cw=(lw-16)/cols,rows=Math.ceil(size/cols),ch=(bottom-top-10*(rows-1))/rows;
    items.slice(q.index*size,q.index*size+size).forEach(([id,n],i)=>{
      const x=l+i%cols*(cw+8),yy=top+Math.floor(i/cols)*(ch+10),p=q.catalog.find(p=>p.id===id),isPack=id.startsWith('pack:');this.panel(x,yy,cw,ch,id===selected);
      this.picture(isPack?'supply':p?this.productArt(p.effect):'homeWarehouse',x+5,yy+5,cw-10,ch*.7);
      const b=this.h.button('inventory:'+id,'',x,yy,cw,ch,this.n);b.string=this.inventoryName(id)+` ×${n}`;b.fontSize=this.font(27,12);b.overflow=Label.Overflow.SHRINK;b.node.setPosition(x+cw/2-this.w/2,this.height/2-yy-ch*.83);b.node.getComponent(UITransform)!.setContentSize(cw-8,ch*.3);
    });
    this.panel(rx,top,rw,bottom-top);
    if(selected){const p=q.catalog.find(p=>p.id===selected),pack=selected.startsWith('pack:'),available=q.assets?.available[selected]??0;q.amount=Math.max(1,Math.min(q.amount,available||1));
      this.label(this.inventoryName(selected),rx+8,top+5,rw-16,this.low?22:34,30,ivory,true).overflow=Label.Overflow.SHRINK;
      this.label(this.t(`可用 ${available} · 预留 ${(q.assets?.inventory[selected]??0)-available}`,`${available} available · ${(q.assets?.inventory[selected]??0)-available} reserved`),rx+8,top+(this.low?27:44),rw-16,this.low?18:25,23,dim);
      const stepY=top+(this.low?50:Math.min(98,(bottom-top)*.4));this.button('qm:minus','−',rx+8,stepY,44);this.label(String(q.amount),rx+54,stepY,rw-108,44,32,ivory);this.button('qm:plus','+',rx+rw-52,stepY,44);
      const bw=this.low?(rw-24)/2:rw-16,owned24=!!(p?.term==='24h'&&q.assets?.permanent.includes(p.effect));
      this.button(pack?'qm:open':p?.term==='24h'?'qm:activate':'qm:loadout',this.t(pack?'打开':p?.term==='24h'?(owned24?'已永久拥有':'激活 / 续期'):'前往配装',pack?'OPEN':p?.term==='24h'?(owned24?'OWNED':'ACTIVATE'):'LOADOUT'),rx+8,bottom-(this.low?52:104),bw,44,'gold',q.busy||available<1||owned24);
      this.button('qm:sell',this.t(`出售 ${q.sellPrice(selected)*q.amount}`,`SELL ${q.sellPrice(selected)*q.amount}`),rx+8+(this.low?bw+8:0),bottom-52,bw,44,'blue',q.busy||available<1||q.sellPrice(selected)===0);
    }else this.label(this.t('仓库空空\n签到可领取首份补给','Warehouse empty\nCheck in for supplies'),rx+10,top+30,rw-20,100,30,dim);
    this.pager(items.length,size,this.bottom-48);this.button('qm:receipts',this.t('开包记录','HISTORY'),r-300,this.bottom-48,120,44);this.button('qm:supply',this.t('获取礼包','GET SUPPLIES'),r-170,this.bottom-48,170,44,'gold');
  }
  private receipts(){
    const q=this.q,l=this.left,r=this.right,y=this.top+8,bottom=this.bottom-58,entries=q.assets?.openReceipts||[],size=this.low?2:4,rowH=(bottom-y)/size;
    entries.slice(q.index*size,q.index*size+size).forEach((entry,i)=>{
      const yy=y+i*rowH;this.panel(l,yy,r-l,rowH-8);
      const [,,tier]=entry.item.split(':'),date=new Date(entry.at),stamp=`${date.getMonth()+1}/${date.getDate()} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
      this.label(`${stamp} · ${this.t(rarity[Number(tier)]||'补给',rarityEn[Number(tier)]||'Supply')} ×${entry.quantity}`,l+14,yy+5,r-l-28,Math.min(30,rowH*.35),28,gold,true,true);
      const counts=new Map<string,number>();let coins=0;
      for(const drop of entry.drops){if(drop.item)counts.set(drop.item,(counts.get(drop.item)||0)+1);else coins+=drop.coins||0;}
      const summary=[...(coins?[this.t(`金币 +${coins}`,`Coins +${coins}`)]:[]),...Array.from(counts,([id,count])=>`${this.catalogName(id)} ×${count}`)].join(' · ');
      const label=this.label(summary,l+14,yy+rowH*.36,r-l-28,rowH*.56-8,27,ivory,false,true);label.overflow=Label.Overflow.SHRINK;
    });
    if(!entries.length)this.label(this.t('暂无开包记录','No opening history yet'),l,y+30,r-l,60,36,dim);
    this.pager(entries.length,size,this.bottom-48);this.label(this.t('最近20笔 · 服务器回执','Latest 20 · server receipts'),l+210,this.bottom-48,r-l-210,44,23,dim);
  }
  private checkin(){
    const q=this.q,l=this.left,r=this.right,top=this.top+8,bottom=this.bottom-58;this.panel(l,top,r-l,bottom-top);
    this.label(this.t('累计签到，漏签不清零','CUMULATIVE CHECK-IN · MISSING A DAY NEVER RESETS'),l+12,top+8,r-l-24,36,38,gold,true);
    const cols=this.narrow?4:7,gap=8,cw=(r-l-32-(cols-1)*gap)/cols,rows=this.narrow?2:1,cy=top+50,ch=(bottom-cy-12-(rows-1)*8)/rows,count=q.assets?.signedDays.length??0;
    const currentDay=Math.max(1,count+(q.assets?.signedToday?0:1)),groupStart=Math.floor((currentDay-1)/7)*7;
    for(let i=0;i<7;i++){const x=l+16+(i%cols)*(cw+gap),yy=cy+Math.floor(i/cols)*(ch+8),day=groupStart+i+1,done=day<=count;this.panel(x,yy,cw,ch,day===currentDay);this.picture(i===6?'supply':'coins',x+4,yy+25,cw-8,Math.max(12,ch-52));this.label(this.t(`第 ${day} 天`,`DAY ${day}`),x+4,yy+3,cw-8,24,28,done?dim:gold,true);this.label(done?'✓':`● ${i===6?200:100} + XP40`,x+3,yy+ch-25,cw-6,22,20,done?dim:ivory);}
    this.button('qm:checkinClaim',this.t(q.assets?.signedToday?'今日已签到':'今日签到',q.assets?.signedToday?'CHECKED IN':'CHECK IN TODAY'),r-220,this.bottom-48,220,48,'gold',q.busy||!q.assets||q.assets.signedToday);
    this.label(this.t('每日额外获得1个普通通用礼包','Includes 1 common general crate daily'),l,this.bottom-48,r-l-240,44,22,dim,false,true);
  }
  private probability(){
    const l=this.left,r=this.right,y=this.top+8,bottom=this.bottom-58,pool=this.q.pools[this.q.pool];this.panel(l,y,r-l,bottom-y);
    this.label(this.t(pool.name,this.q.pool==='gold'?'GOLD ARMORY CRATE':'GENERAL SUPPLY CRATE'),l+16,y+10,r-l-32,36,40,gold,true,true);
    const rw=(r-l-40)/4;
    pool.weights.forEach((weight,i)=>{const x=l+20+i*rw;this.label(this.t(rarity[i],rarityEn[i]),x,y+60,rw,this.low?20:30,32,rarityColor[i],true);this.label(`${weight}%`,x,y+(this.low?82:95),rw,this.low?26:45,44,ivory,true);
      const products=this.q.catalog.filter(p=>p.term==='match'&&p.rarity===i&&pool.effects.includes(p.effect));this.label(products.map(p=>this.productName(p)).join(' · ')+this.t(`\n金币 ${pool.coinDrops[i]}`,`\nCoins ${pool.coinDrops[i]}`),x+6,y+(this.low?112:150),rw-12,Math.max(35,bottom-y-(this.low?120:158)),24,dim);});
    this.label(this.t('同来源套餐概率相同。仅单场资格，不掉永久权益。','All package sizes share these odds. One-match items only; no permanent drops.'),l,this.bottom-48,r-l,44,23,dim);
  }
  private confirm(){
    const q=this.q,intent=q.confirmation!,pw=Math.min(590,this.right-this.left),ph=Math.min(260,this.height-24),x=(this.w-pw)/2,y=(this.height-ph)/2;
    // The confirmation gets its own top layer so it blocks both pictures and older touch targets.
    const overlay=this.h.node('Confirmation',this.n);const g=overlay.addComponent(Graphics);this.h.rect(g,0,0,this.w,this.height,'#01070cce');
    this.h.rect(g,x,y,pw,ph,'#071723','#c4a268',8);
    for(const b of this.h.buttons)if(b.label.node.parent===this.n){b.disabled=true;b.label.node.active=false;}
    const text=intent.kind==='sell'?this.t(`出售 ${q.amount} 件物资？\n总计 ${q.sellPrice(q.item)*q.amount} 金币`,`Sell ${q.amount} items?\nTotal ${q.sellPrice(q.item)*q.amount} coins`):intent.kind==='activate'?this.t('激活后连续24小时。\n再次激活只续期，不叠加强度。','Lasts 24 continuous hours.\nActivating again extends time, never strength.'):q.message[this.h.lang==='zh'?0:1];
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
    const status=training||online?.bot?this.t('训练不消耗库存，不产出正式资产','Practice: no stock consumed or assets earned'):online?.spectator?this.t('观战不计收益','SPECTATING · NO REWARDS'):credited?this.t('✓ 服务器已到账','✓ SERVER CREDITED'):duel||pending?this.t('待同步 · 联网后确认收益','PENDING SYNC · awaiting confirmation'):this.t('本局仅本地记录，不产出正式资产','LOCAL RESULT · NO ASSET REWARDS');
    const comparison=this.h.timeComparison,record=duel?'':training?this.h.trainingBest?this.t(`最佳 ${this.h.trainingBest.time.toFixed(1)} 秒`,`BEST ${this.h.trainingBest.time.toFixed(1)}s`):'':comparison?this.t(`${comparison.newRecord?'新纪录 · ':''}个人最佳 ${formatTime(comparison.bestMs)}`,`${comparison.newRecord?'NEW RECORD · ':''}PERSONAL BEST ${formatTime(comparison.bestMs)}`):!success&&s.failureCause==='friendly'?this.t('致命伤来自己方火力，开火前检查友军','FRIENDLY FIRE · CHECK ALLIES BEFORE FIRING'):'';
    this.label(status+(record?'\n'+record:''),x+20,y+ph-(this.low?104:172*this.scale),pw-40,this.low?42:60*this.scale,23,credited?'#94da90':dim);
    const bw=this.low?(pw-(next?88:76))/(next?3:2):pw*.36,by=y+ph-(this.low?58:105*this.scale),bh=this.low?48:80*this.scale;
    this.button('home',this.t('返回基地','RETURN TO BASE'),this.low?x+24:x+pw*.07,by,bw,bh,'blue');
    this.button(s.duelMode?'online:backLobby':'retry',this.t(s.duelMode?'返回大厅':'再次出动',s.duelMode?'BACK TO LOBBY':'DEPLOY AGAIN'),this.low?x+52+bw:x+pw*.57,by,bw,bh,'gold');
    if(this.low&&next)this.button('missionNext',this.t('下一任务','NEXT'),x+64+bw*2,y+ph-58,bw,48,'gold');
  }
}
