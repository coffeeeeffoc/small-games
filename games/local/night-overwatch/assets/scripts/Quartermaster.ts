import { CATALOG, PACKAGES, POOLS, FRAGMENTS, emptyLoadout, type Fragment, type AssetCommand, type AssetSnapshot, type Effect, type Loadout, type Product } from './core/Progression.ts';
import type { Online } from './Online';
export type AssetIntent = AssetCommand extends infer T ? T extends AssetCommand ? Omit<T,'requestId'> : never : never;
export type LoadoutSlot = 'mod:0'|'mod:1'|'weapon'|'skill';
export type ProgressionPage = ''|'modes'|'loadout'|'shop'|'supply'|'growth'|'tasks'|'inbox'|'warehouse'|'craft'|'receipts'|'checkin'|'probability';
type NavigationState = Pick<Quartermaster,'page'|'section'|'index'|'detail'|'selected'|'item'|'amount'|'term'|'shopCategory'|'mode'|'slot'|'loadoutScroll'|'scrolls'|'selectedMail'|'selectedSkill'>;
type IntentStorage = Pick<Storage,'getItem'|'setItem'|'removeItem'> & {flush?:()=>Promise<void>};
/** Wheel artwork has boundaries at 12 o'clock. A clockwise sector centre is 30 + i*60 degrees. */
export const wheelLandingAngle=(index:number,start=0)=>start+360*5+((30+index*60-start%360+360)%360);
export const effectEnglish:Record<Effect,string>={power:'Power upgrade',rate:'Rapid feed',burst:'Double burst',twin:'Twin trajectory',radius:'Blast radius',cooling:'Cooling system',drone:'Drone swarm',laser:'Laser weapon',tracking:'Tracking',emp:'Electromagnetic pulse'};
const errors:Record<string,[string,string]>={
  DEV_TOOLS_DISABLED:['服务器未启用开发调试，请连接已启用开发能力的测试服','Developer tools are disabled on this server.'],
  INVALID_DEV_BALANCE:['调整后的金币或经验必须是非负安全整数','Adjusted coins and XP must be non-negative safe integers.'],
  INSUFFICIENT_COINS:['金币不足，完成行动或任务可获得金币','Not enough coins. Complete operations or tasks.'],
  INSUFFICIENT_INVENTORY:['库存不足或已被对局预留','Not enough available stock. Some items may be reserved.'],
  INSUFFICIENT_FRAGMENTS:['碎片不足，通关或完成有效对战可获得','Not enough fragments. Complete levels or eligible duels.'],
  ALREADY_OWNED:['已永久拥有此资格','Already permanently owned.'],ALREADY_CLAIMED:['已经领取，请刷新查看','Already claimed. Refresh to see the result.'],
  DAILY_VIDEO_LIMIT:['今日视频额度已用完，明日可继续原订单','Daily video limit reached. Continue this order tomorrow.'],
  INVALID_AD_ATTEMPT:['观看确认已过期，请重新观看本段','Video confirmation expired. Please watch this segment again.'],
  AD_IN_PROGRESS:['已有视频正在播放，请结束后再继续观看','A video is already playing. Finish or close it before continuing.'],
  DAILY_WHEEL_LIMIT:['今日转盘视频已达上限，明日可继续；已有次数仍可使用','Today’s wheel video limit is reached. Saved spins remain available.'],
  NO_WHEEL_TICKETS:['先完整观看一次视频，即可获得一次抽奖','Complete one video to earn a spin.'],
  LEVEL_LOCKED:['等级尚未解锁这件物资','Reach the required level to unlock this item.'],
  NOT_CLAIMABLE:['条件尚未完成或奖励已领取','Not complete or already claimed.'],
  INVALID_LOADOUT:['方案最多2个改装、1个武器、1个技能，同效果不能重复','Use at most 2 mods, 1 weapon and 1 skill, with no duplicate effects.'],
};
/** Stores only pending intentions; balances always come from the authenticated service. */
export class Quartermaster {
  page:ProgressionPage=''; mode:'solo'|'duel'='solo'; actionMode:'solo'|'duel'|'training'='solo';
  term:Product['term']='match'; selected='burst-match'; item=''; amount=1; quantity=5; pool:'general'|'gold'='general';
  section=''; index=0; detail=false; confirmation?:AssetIntent; selectedMail=''; selectedSkill:Effect='tracking';
  shopCategory:Product['category']='mod';
  craftTerm:'match'|'permanent'='match';
  scrolls:Record<string,number>={}; info=''; navigation:NavigationState[]=[]; externalReturn:''|'modes'|'result'='';
  private leavingBack=false;
  wheel?:{index:number;startAngle:number;started:number;duration:number;shown:boolean;coins:number;packs:Record<string,number>};
  slot:LoadoutSlot='mod:0'; loadoutScroll=0; loadoutScrollMax=0;
  loadoutArea={x:0,y:0,w:0,h:0};
  drafts:Partial<Record<'solo'|'duel',Loadout>>={}; private modDrafts:Partial<Record<'solo'|'duel',Array<string|null>>>={}; leaveTo?:ProgressionPage;
  gift?:{packs:Record<string,number>;drops:Array<{item?:string;coins?:number;xp?:number}>;opened:boolean;started?:number;duration?:number;illuminated?:boolean};
  drag?:{item:string;x:number;y:number;target?:LoadoutSlot};
  private openingGift=false;private adReady?:{orderId:string;attemptId:string;startedAt:number};
  busy=false; viewing=false; revision=0; message:[string,string]=['','']; pending?:AssetCommand;
  private owner=''; private disposed=false; private online:Online; private storage:IntentStorage;
  constructor(online:Online,storage:IntentStorage){this.online=online;this.storage=storage;}
  get assets(){return this.online.assets;}
  get catalog(){return this.assets?.catalog||CATALOG;}
  get packages(){return this.assets?.packages||PACKAGES;}
  get pools(){return this.assets?.pools||POOLS;}
  sellPrice(id:string){if(id in FRAGMENTS)return this.assets?.economy?.fragmentSell??0;const pack=/^pack:(general|gold):[0-3]$/.exec(id);return pack?this.pools[pack[1] as 'general'|'gold'].packSell:this.catalog.find(p=>p.id===id)?.sell??(id.startsWith('legacy')?20:0);}
  get loadout(){return this.drafts[this.mode]||this.assets?.loadouts[this.mode]||emptyLoadout();}
  get dirty(){return this.dirtyModes.includes(this.mode);}
  get dirtyModes(){return (['solo','duel'] as const).filter(mode=>{
    const saved=this.assets?.loadouts[mode]||emptyLoadout(),slots=this.modDrafts[mode];
    return this.drafts[mode]&&(JSON.stringify(this.drafts[mode])!==JSON.stringify(saved)||slots&&[0,1].some(i=>(slots[i]??null)!==(saved.mods[i]??null)));
  });}
  get anyDirty(){return this.dirtyModes.length>0;}
  get slotCategory(){return this.slot.startsWith('mod:')?'mod':this.slot as 'weapon'|'skill';}
  get modSlots(){return this.modDrafts[this.mode]||this.loadout.mods;}
  get slotItem(){return this.slotCategory==='mod'?this.modSlots[Number(this.slot.slice(-1))]:this.loadout[this.slotCategory];}
  get availableGear(){return this.catalog.filter(p=>p.category===this.slotCategory&&(this.assets?.permanent.includes(p.effect)?p.term==='permanent':(this.assets?.active[p.effect]??0)>(this.assets?.serverNow??Date.now())?p.term==='24h':p.term==='match'&&(this.assets?.available[p.id]??0)>0));}
  equipped(effect:Effect){return [...this.loadout.mods,this.loadout.weapon,this.loadout.skill].some(id=>this.catalog.find(p=>p.id===id)?.effect===effect);}
  selectSlot(slot:LoadoutSlot){this.slot=slot;this.loadoutScroll=0;this.revision++;}
  selectInventorySlot(){
    const product=this.catalog.find(p=>p.id===this.item);if(!product)return;
    const index=this.modSlots.findIndex(id=>this.catalog.find(p=>p.id===id)?.effect===product.effect);
    this.selectSlot(product.category==='mod'?`mod:${index>=0?index:!this.modSlots[0]?0:!this.modSlots[1]?1:0}` as LoadoutSlot:product.category);
  }
  moveMod(from:LoadoutSlot,to:LoadoutSlot){
    this.syncIdentity();if(this.busy||this.pending||from===to||!from.startsWith('mod:')||!to.startsWith('mod:'))return;
    const slots=[...this.modSlots],a=Number(from.slice(-1)),b=Number(to.slice(-1));if(!slots[a])return;
    [slots[a],slots[b]]=[slots[b]??null,slots[a]];
    this.modDrafts[this.mode]=slots;this.drafts[this.mode]={...this.loadout,mods:slots.filter((id):id is string=>!!id)};this.slot=to;
    this.message=['方案尚未保存，请点击确定保存','Unsaved changes. Confirm to save.'];this.revision++;
  }
  scrollLoadout(amount:number){this.loadoutScroll=Math.max(0,Math.min(this.loadoutScrollMax,this.loadoutScroll+amount));this.revision++;}
  cancelLeave(){this.leaveTo=undefined;this.leavingBack=false;}
  requestLeave(page:ProgressionPage){
    this.leavingBack=false;
    if(this.page==='loadout'&&(this.anyDirty||this.pending?.kind==='loadout')){this.leaveTo=page;this.revision++;return;}this.show(page);
  }
  private capture():NavigationState {return {page:this.page,section:this.section,index:this.index,detail:this.detail,selected:this.selected,item:this.item,amount:this.amount,term:this.term,shopCategory:this.shopCategory,mode:this.mode,slot:this.slot,loadoutScroll:this.loadoutScroll,scrolls:{...this.scrolls},selectedMail:this.selectedMail,selectedSkill:this.selectedSkill};}
  back(){
    if(this.info){this.info='';this.revision++;return;}
    if(this.detail&&this.page==='shop'){this.detail=false;this.revision++;return;}
    if(this.page==='loadout'&&(this.anyDirty||this.pending?.kind==='loadout')){this.leavingBack=true;this.leaveTo=this.navigation.at(-1)?.page??'';this.revision++;return;}
    this.pop();
  }
  private pop(){const previous=this.navigation.pop();this.show(previous?.page??'',false);if(previous)Object.assign(this,previous);this.leavingBack=false;this.revision++;}
  leavePending(){if(this.pending?.kind==='loadout'&&this.leaveTo!==undefined){if(this.leavingBack)this.pop();else this.show(this.leaveTo);}}
  discard(){if(this.pending?.kind==='loadout'){this.requestLeave(this.leaveTo??'');return;}this.drafts={};this.modDrafts={};const page=this.leaveTo;this.leaveTo=undefined;if(this.leavingBack)this.pop();else this.show(page??'');}
  async save(){this.syncIdentity();return this.execute({kind:'loadout',mode:this.mode,loadout:structuredClone(this.loadout)});}
  async openGifts(){
    this.syncIdentity();
    const gift=this.gift,owner=this.owner;if(!gift||this.busy||this.openingGift)return;
    if(this.pending&&this.pending.kind!=='open')return;
    this.openingGift=true;
    try{
      for(const [item,quantity]of Object.entries(gift.packs)){
        if(quantity<1)continue;
        const result=await this.execute(this.pending?undefined:{kind:'open',item,quantity});
        if(this.owner!==owner||this.disposed)return;
        if(!result){this.gift=gift;return;}
        gift.drops.push(...(result.lastReceipt?.drops as Array<{item?:string;coins?:number;xp?:number}>||[]));delete gift.packs[item];
      }
      gift.opened=true;gift.started=Date.now();gift.duration=gift.drops.length>1?2200:1600;this.gift=gift;
    }finally{this.openingGift=false;this.revision++;}
  }
  get unread(){return this.assets?.mail.some(m=>!m.read||!m.claimed)||false;}
  get claimable(){return this.assets?.tasks.some(t=>!t.claimed&&t.progress>=t.target)||false;}
  get pendingOrder(){return this.assets?.videoOrders.find(o=>!o.delivered&&o.purpose!=='wheel'&&o.quantity===this.quantity);}
  get wheelOrder(){return this.assets?.videoOrders.find(o=>!o.delivered&&o.purpose==='wheel');}
  get inventory(){return Object.entries(this.assets?.inventory||{}).filter(([,n])=>n>0).sort(([a],[b])=>Number(!a.startsWith('pack:'))-Number(!b.startsWith('pack:'))||(a.startsWith('pack:')&&b.startsWith('pack:')?Number(a.split(':')[2])-Number(b.split(':')[2]):0));}
  private key(){return 'night-overwatch-asset-intent:'+this.owner;}
  private allowDeveloperIntent(){
    if((globalThis as {__SMALL_GAMES_BUILD__?:{type:string}}).__SMALL_GAMES_BUILD__?.type==='development')return true;
    if(this.pending?.kind==='dev-adjust'){
      this.pending=undefined;try{this.storage.removeItem(this.key());}catch{/* A rejected developer intention is never sent from this package. */}
      this.message=['已清除开发包遗留的调试操作，当前包不会重试','Removed the saved developer operation; this package will not retry it.'];this.revision++;
    }
    return false;
  }
  syncIdentity(){
    const id=this.online.authenticatedId;
    if(id===this.owner)return;
    this.owner=id;this.adReady=undefined;this.pending=undefined;this.drafts={};this.modDrafts={};this.gift=undefined;this.wheel=undefined;this.leaveTo=undefined;this.message=['',''];this.confirmation=undefined;this.selectedMail='';this.info='';this.navigation=[];this.scrolls={};this.externalReturn='';this.revision++;
    if(!id)return;
    try{const value=JSON.parse(this.storage.getItem(this.key())||'null');if(value?.requestId&&value?.kind)this.pending=value;}catch{/* Corrupt local intent cannot alter server assets. */}
    this.allowDeveloperIntent();
  }
  show(page:ProgressionPage,push=true){if(page!=='supply'&&this.wheel&&!this.wheel.shown){this.wheel.shown=true;this.wheel.started=0;}if(push&&page!==this.page)this.navigation.push(this.capture());this.page=page;this.leaveTo=undefined;this.leavingBack=false;this.drag=undefined;this.section=page==='growth'?'base':'';this.index=0;this.detail=false;this.info='';this.scrolls={};this.confirmation=undefined;this.message=['',''];this.revision++;if(page&&page!=='modes')void this.refresh().then(()=>{if(this.page==='inbox'&&this.section!=='news'){const mail=this.assets?.mail.find(m=>m.id===this.selectedMail)||this.assets?.mail[0];if(mail){this.selectedMail=mail.id;this.revision++;if(!mail.read)void this.execute({kind:'read-mail',mailId:mail.id});}}});}
  tickPresentation(reduced=false){
    const now=Date.now();
    if(this.gift?.started&&!this.gift.illuminated&&now-this.gift.started>(this.gift.duration||1600)*.3){this.gift.illuminated=true;this.revision++;}
    if(this.gift?.started&&(reduced||now-this.gift.started>=(this.gift.duration||1600))){this.gift.started=undefined;this.revision++;}
    if(this.wheel&&!this.wheel.shown&&this.page==='supply'&&!this.gift&&(reduced||now-this.wheel.started>=this.wheel.duration)){this.wheel.shown=true;this.gift={packs:this.wheel.packs,drops:this.wheel.coins?[{coins:this.wheel.coins}]:[],opened:!Object.keys(this.wheel.packs).length};this.revision++;}
  }
  async refresh(){
    if(this.busy)return;
    this.busy=true;this.revision++;
    try{await this.online.refreshAssets();this.syncIdentity();this.message=['',''];}
    catch{this.message=['军需服务暂不可用，可继续普通行动','Quartermaster unavailable. Normal operations remain playable.'];}
    finally{this.busy=false;this.revision++;}
  }
  async execute(intent?:AssetIntent):Promise<AssetSnapshot|undefined>{
    this.syncIdentity();if(this.busy||this.disposed)return;
    if(!this.allowDeveloperIntent()&&intent?.kind==='dev-adjust'){this.message=['只有开发测试包可调整资产','Asset adjustment requires a development package.'];this.revision++;return;}
    if(intent?.kind==='craft'&&!this.assets?.economy){this.message=['合成需要新版军需服务','Crafting requires the updated service.'];this.revision++;return;}
    if(!this.owner||!this.assets){this.message=['请先连接军需服务','Connect to the quartermaster first.'];this.revision++;return;}
    if(this.wheel&&!this.wheel.shown&&intent&&intent.kind!=='read-mail'){this.message=['抽奖揭晓后可继续操作','Wait for the wheel to finish.'];this.revision++;return;}
    if(this.pending&&intent){this.message=['上一操作等待确认，请先重试，避免重复扣款','Confirm the pending operation before making another purchase.'];this.revision++;return;}
    if(intent){
      const bytes=new Uint8Array(16);
      if(globalThis.crypto?.getRandomValues)globalThis.crypto.getRandomValues(bytes);
      else for(let i=0;i<16;i++)bytes[i]=Math.floor(Math.random()*256);
      bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
      const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
      this.pending={...intent,requestId:`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`} as AssetCommand;
      try{this.storage.setItem(this.key(),JSON.stringify(this.pending));}
      catch{this.pending=undefined;this.message=['无法保存交易编号，请允许本地存储后重试','Cannot save the transaction ID. Enable local storage and retry.'];this.revision++;return;}
    }
    if(!this.pending)return;
    const command=this.pending,owner=this.owner;this.busy=true;this.revision++;
    try{
      if(this.storage.flush){
        try{await this.storage.flush();}
        catch{this.message=['无法保存交易编号，请重试；尚未发送交易','Cannot save the transaction ID. Retry; no transaction was sent.'];return;}
        if(this.owner!==owner||this.online.authenticatedId!==owner||this.pending!==command||this.disposed)return;
      }
      const snapshot=await this.online.assetCommand(command);
      if(this.owner!==owner||this.disposed)return;
      this.pending=undefined;try{this.storage.removeItem(this.key());}catch{/* Replaying this accepted ID is safe. */}
      this.message=['',''];
      if(command.kind==='loadout'){
        const selected=this.mode===command.mode?this.slotItem:undefined;
        delete this.drafts[command.mode];delete this.modDrafts[command.mode];
        // The server stores mods in order without empty placeholders; show that same order immediately.
        if(selected&&this.mode===command.mode&&this.slotCategory==='mod'){const index=snapshot.loadouts[command.mode].mods.indexOf(selected);if(index>=0)this.slot=`mod:${index}` as LoadoutSlot;}
      }
      const receipt=snapshot.lastReceipt;
      if(command.kind==='ad-start'&&typeof receipt?.attemptId==='string')this.adReady={orderId:command.orderId,attemptId:receipt.attemptId,startedAt:snapshot.videoOrders.find(o=>o.id===command.orderId)?.attempt?.startedAt??snapshot.serverNow};
      if(command.kind==='ad-complete'||command.kind==='ad-cancel')this.adReady=undefined;
      const reward=receipt?.reward as {packs?:number}|undefined;
      const packs=receipt?.packs as Record<string,number>|undefined;
      const items=receipt?.items as Record<string,number>|undefined;
      if(items){
        const grants=Object.entries(items).map(([id,count])=>`${(id in FRAGMENTS?FRAGMENTS[id as Fragment][0]:this.catalog.find(p=>p.id===id)?.name||id)} ×${count}`).join('、');
        const grantsEn=Object.entries(items).map(([id,count])=>`${(id in FRAGMENTS?FRAGMENTS[id as Fragment][1]:effectEnglish[this.catalog.find(p=>p.id===id)?.effect as Effect]||id)} ×${count}`).join(', ');
        this.message=[`已获得：${grants}（装备可在配装使用，碎片存入仓库）`,`Received: ${grantsEn} (Gear: loadout; fragments: warehouse)`];
        this.gift={packs:{},drops:Object.entries(items).flatMap(([item,count])=>Array.from({length:count},()=>({item}))),opened:true};
      }
      if(packs&&Object.keys(packs).length)this.gift={packs:{...packs},drops:[],opened:false};
      else if(reward?.packs)this.gift={packs:{'pack:general:0':reward.packs},drops:[],opened:false};
      if(command.kind==='open'){
        const drops=snapshot.lastReceipt?.drops as Array<{item?:string;coins?:number;xp?:number}>|undefined;
        if(!this.openingGift)this.gift={packs:{},drops:drops||[],opened:true,started:Date.now(),duration:command.quantity>1?2200:1600};
        const coins=(drops||[]).reduce((n,d)=>n+(d.coins||0),0),xp=(drops||[]).reduce((n,d)=>n+(d.xp||0),0),items=(drops||[]).filter(d=>d.item);
        this.message=[`已开 ${command.quantity} 个：金币 +${coins}，EXP +${xp}，物资 ${items.length} 件（见仓库）`,`Opened ${command.quantity}: +${coins} coins, +${xp} EXP, ${items.length} gear items in warehouse`];
      }
      if(command.kind==='wheel-spin'){
        const startAngle=this.wheel?wheelLandingAngle(this.wheel.index,this.wheel.startAngle):0;this.gift=undefined;this.wheel={startAngle,index:Number(receipt?.prizeIndex)||0,started:Date.now(),duration:2800,shown:false,coins:Number(receipt?.coins)||0,packs:packs||{}};
      }
      return snapshot;
    }catch(error){
      const code=(error as {code?:string}).code||'';
      if(code==='IDENTITY_CHANGED'){try{await this.online.refreshAssets();this.syncIdentity();}catch{/* Keep the original account's intent until identity can be confirmed. */}return;}
      const confirmed=!!errors[code]||['INVALID_INPUT','TASK_NOT_FOUND','MAIL_NOT_FOUND','ACHIEVEMENT_NOT_FOUND','INVALID_PACKAGE','INVALID_POOL','ASSET_LIMIT','ASSET_VERSION','ITEM_UNAVAILABLE','ITEM_NOT_PACK','ITEM_NOT_SELLABLE','TASK_NOT_REPLACEABLE','TOO_MANY_ORDERS','ORDER_NOT_FOUND','REQUEST_ID_CONFLICT'].includes(code);
      if(this.owner===owner){
        if(confirmed){this.pending=undefined;try{this.storage.removeItem(this.key());}catch{/* The next successful refresh can retry this rejected ID safely. */}}
        this.message=errors[code]||(confirmed?['操作未完成，请刷新后重试','Operation rejected. Refresh and try again.']:['网络中断，原交易编号已保留，请重试确认','Connection interrupted. Retry the saved transaction.']);
      }
    }finally{this.busy=false;this.revision++;}
  }
  equip(id:string,slot=this.slot){
    this.syncIdentity();if(this.busy||this.pending)return;
    const p=this.catalog.find(p=>p.id===id),category=slot.startsWith('mod:')?'mod':slot;
    if(!p||p.category!==category||this.equipped(p.effect)||!this.availableGear.some(item=>item.id===id)&&category===this.slotCategory)return;
    const available=this.assets?.permanent.includes(p.effect)||(this.assets?.active[p.effect]??0)>(this.assets?.serverNow??Date.now())||p.term==='match'&&(this.assets?.available[p.id]??0)>0;
    if(!available)return;
    const loadout=structuredClone(this.loadout);
    if(category==='mod'){const slots=[...this.modSlots];slots[Number(slot.slice(-1))]=id;this.modDrafts[this.mode]=slots;loadout.mods=slots.filter((item):item is string=>!!item);}
    else loadout[category]=id;
    this.drafts[this.mode]=loadout;this.slot=slot;this.message=['方案尚未保存，请点击确定保存','Unsaved changes. Confirm to save.'];this.revision++;
  }
  unequip(){
    this.syncIdentity();if(this.busy||this.pending)return;const loadout=structuredClone(this.loadout);
    if(this.slotCategory==='mod'){const slots=[...this.modSlots];slots[Number(this.slot.slice(-1))]=null;this.modDrafts[this.mode]=slots;loadout.mods=slots.filter((item):item is string=>!!item);}else loadout[this.slotCategory]=null;
    this.drafts[this.mode]=loadout;this.message=['方案尚未保存，请点击确定保存','Unsaved changes. Confirm to save.'];this.revision++;
  }
  async watch(offer:()=>Promise<string>,purpose:'packs'|'wheel'='packs'){
    if(this.viewing||this.busy||this.pending)return;
    this.viewing=true;const owner=this.online.authenticatedId;this.revision++;
    try{
      let order=purpose==='wheel'?this.wheelOrder:this.pendingOrder;
      if(!order){await this.execute({kind:'ad-order',quantity:purpose==='wheel'?1:this.quantity,purpose});order=purpose==='wheel'?this.wheelOrder:this.pendingOrder;}
      if(!order||owner!==this.online.authenticatedId)return;
      const now=(this.assets?.serverNow??Date.now())+Math.max(0,performance.now()-(this.online.assetsReceivedAt??performance.now()));
      if(this.adReady&&(this.adReady.orderId!==order.id||now-this.adReady.startedAt>=30*60000))this.adReady=undefined;
      if(!this.adReady&&order.attempt&&now>=order.attempt.startedAt&&now-order.attempt.startedAt<30*60000)this.adReady={orderId:order.id,attemptId:order.attempt.id,startedAt:order.attempt.startedAt};
      if(this.adReady?.orderId!==order.id)await this.execute({kind:'ad-start',orderId:order.id});
      const attemptId=this.adReady?.orderId===order.id?this.adReady.attemptId:undefined;
      if(typeof attemptId!=='string')return;
      let result='failed';try{result=await offer();}catch{/* Provider failure releases its account-wide playback slot below. */}
      if(this.disposed||owner!==this.online.authenticatedId)return;
      if(result==='completed'){const completed=await this.execute({kind:'ad-complete',orderId:order.id,attemptId});if(!completed&&!this.pending&&!this.disposed&&owner===this.online.authenticatedId){const message=this.message;await this.execute({kind:'ad-cancel',orderId:order.id,attemptId});this.message=message;}}
      else {await this.execute({kind:'ad-cancel',orderId:order.id,attemptId});this.message=result==='dismissed'?['未完整观看，本次未计入；已确认进度保留','Video not completed. Confirmed progress is kept.']:['视频暂不可用，已确认进度保留，可稍后继续','Video unavailable. Confirmed progress is kept. Try later.'];}
    }finally{this.viewing=false;this.revision++;}
  }
  dispose(){if(!this.disposed&&this.owner===this.online.authenticatedId&&this.adReady&&!this.busy&&!this.pending)void this.execute({kind:'ad-cancel',orderId:this.adReady.orderId,attemptId:this.adReady.attemptId});this.disposed=true;}
}
