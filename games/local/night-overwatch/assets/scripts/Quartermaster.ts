import { CATALOG, PACKAGES, POOLS, emptyLoadout, type AssetCommand, type AssetSnapshot, type Effect, type Loadout, type Product } from './core/Progression.ts';
import type { Online } from './Online';
export type AssetIntent = AssetCommand extends infer T ? T extends AssetCommand ? Omit<T,'requestId'> : never : never;
export type LoadoutSlot = 'mod:0'|'mod:1'|'weapon'|'skill';
export type ProgressionPage = ''|'modes'|'loadout'|'shop'|'supply'|'growth'|'tasks'|'inbox'|'warehouse'|'receipts'|'checkin'|'probability';
export const effectEnglish:Record<Effect,string>={power:'Power upgrade',rate:'Rapid feed',burst:'Double burst',twin:'Twin trajectory',radius:'Blast radius',cooling:'Cooling system',drone:'Drone swarm',laser:'Laser weapon',tracking:'Tracking',emp:'Electromagnetic pulse'};
const errors:Record<string,[string,string]>={
  DEV_TOOLS_DISABLED:['服务器未启用开发调试，请连接已启用开发能力的测试服','Developer tools are disabled on this server.'],
  INVALID_DEV_BALANCE:['调整后的金币或经验必须是非负安全整数','Adjusted coins and XP must be non-negative safe integers.'],
  INSUFFICIENT_COINS:['金币不足，完成行动或任务可获得金币','Not enough coins. Complete operations or tasks.'],
  INSUFFICIENT_INVENTORY:['库存不足或已被对局预留','Not enough available stock. Some items may be reserved.'],
  ALREADY_OWNED:['已永久拥有此资格','Already permanently owned.'],ALREADY_CLAIMED:['已经领取，请刷新查看','Already claimed. Refresh to see the result.'],
  DAILY_VIDEO_LIMIT:['今日视频额度已用完，明日可继续原订单','Daily video limit reached. Continue this order tomorrow.'],
  INVALID_AD_ATTEMPT:['观看确认已过期，请重新观看本段','Video confirmation expired. Please watch this segment again.'],
  NOT_CLAIMABLE:['条件尚未完成或奖励已领取','Not complete or already claimed.'],
  INVALID_LOADOUT:['方案最多2个改装、1个武器、1个技能，同效果不能重复','Use at most 2 mods, 1 weapon and 1 skill, with no duplicate effects.'],
};
/** Stores only pending intentions; balances always come from the authenticated service. */
export class Quartermaster {
  page:ProgressionPage=''; mode:'solo'|'duel'='solo'; actionMode:'solo'|'duel'|'training'='solo';
  term:Product['term']='match'; selected='burst-match'; item=''; amount=1; quantity=5; pool:'general'|'gold'='general';
  section=''; index=0; detail=false; confirmation?:AssetIntent; selectedMail=''; selectedSkill:Effect='tracking';
  slot:LoadoutSlot='mod:0'; loadoutScroll=0; loadoutScrollMax=0;
  loadoutArea={x:0,y:0,w:0,h:0};
  drafts:Partial<Record<'solo'|'duel',Loadout>>={}; private modDrafts:Partial<Record<'solo'|'duel',Array<string|null>>>={}; leaveTo?:ProgressionPage;
  gift?:{packs:Record<string,number>;drops:Array<{item?:string;coins?:number}>;opened:boolean};
  drag?:{item:string;x:number;y:number};
  private openingGift=false;
  busy=false; viewing=false; revision=0; message:[string,string]=['','']; pending?:AssetCommand;
  private owner=''; private disposed=false; private online:Online; private storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>;
  constructor(online:Online,storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>){this.online=online;this.storage=storage;}
  get assets(){return this.online.assets;}
  get catalog(){return this.assets?.catalog||CATALOG;}
  get packages(){return this.assets?.packages||PACKAGES;}
  get pools(){return this.assets?.pools||POOLS;}
  sellPrice(id:string){const pack=/^pack:(general|gold):[0-3]$/.exec(id);return pack?this.pools[pack[1] as 'general'|'gold'].packSell:this.catalog.find(p=>p.id===id)?.sell??(id.startsWith('legacy')?20:0);}
  get loadout(){return this.drafts[this.mode]||this.assets?.loadouts[this.mode]||emptyLoadout();}
  get dirty(){return JSON.stringify(this.loadout)!==JSON.stringify(this.assets?.loadouts[this.mode]||emptyLoadout());}
  get anyDirty(){return (['solo','duel'] as const).some(mode=>this.drafts[mode]&&JSON.stringify(this.drafts[mode])!==JSON.stringify(this.assets?.loadouts[mode]||emptyLoadout()));}
  get slotCategory(){return this.slot.startsWith('mod:')?'mod':this.slot as 'weapon'|'skill';}
  get modSlots(){return this.modDrafts[this.mode]||this.loadout.mods;}
  get slotItem(){return this.slotCategory==='mod'?this.modSlots[Number(this.slot.slice(-1))]:this.loadout[this.slotCategory];}
  get availableGear(){return this.catalog.filter(p=>p.category===this.slotCategory&&(this.assets?.permanent.includes(p.effect)?p.term==='permanent':(this.assets?.active[p.effect]??0)>(this.assets?.serverNow??Date.now())?p.term==='24h':p.term==='match'&&(this.assets?.available[p.id]??0)>0));}
  equipped(effect:Effect){return [...this.loadout.mods,this.loadout.weapon,this.loadout.skill].some(id=>this.catalog.find(p=>p.id===id)?.effect===effect);}
  selectSlot(slot:LoadoutSlot){this.slot=slot;this.loadoutScroll=0;this.revision++;}
  scrollLoadout(amount:number){this.loadoutScroll=Math.max(0,Math.min(this.loadoutScrollMax,this.loadoutScroll+amount));this.revision++;}
  requestLeave(page:ProgressionPage){if(this.page==='loadout'&&this.anyDirty){this.leaveTo=page;this.revision++;return;}this.show(page);}
  discard(){this.drafts={};this.modDrafts={};const page=this.leaveTo;this.leaveTo=undefined;this.show(page??'');}
  async save(){this.syncIdentity();const mode=this.mode,loadout=structuredClone(this.loadout);const result=await this.execute({kind:'loadout',mode,loadout});if(result){delete this.drafts[mode];this.revision++;}return result;}
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
        gift.drops.push(...(result.lastReceipt?.drops as Array<{item?:string;coins?:number}>||[]));delete gift.packs[item];
      }
      gift.opened=true;this.gift=gift;
    }finally{this.openingGift=false;this.revision++;}
  }
  get unread(){return this.assets?.mail.some(m=>!m.read||!m.claimed)||false;}
  get claimable(){return this.assets?.tasks.some(t=>!t.claimed&&t.progress>=t.target)||false;}
  get pendingOrder(){return this.assets?.videoOrders.find(o=>!o.delivered&&o.quantity===this.quantity);}
  get inventory(){return Object.entries(this.assets?.inventory||{}).filter(([,n])=>n>0);}
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
    this.owner=id;this.pending=undefined;this.drafts={};this.modDrafts={};this.gift=undefined;this.leaveTo=undefined;this.message=['',''];this.confirmation=undefined;this.selectedMail='';this.revision++;
    if(!id)return;
    try{const value=JSON.parse(this.storage.getItem(this.key())||'null');if(value?.requestId&&value?.kind)this.pending=value;}catch{/* Corrupt local intent cannot alter server assets. */}
    this.allowDeveloperIntent();
  }
  show(page:ProgressionPage){this.page=page;this.leaveTo=undefined;this.drag=undefined;this.section='';this.index=0;this.detail=false;this.confirmation=undefined;this.message=['',''];this.revision++;if(page&&page!=='modes')void this.refresh().then(()=>{if(this.page==='inbox'&&this.section!=='news'){const mail=this.assets?.mail.find(m=>m.id===this.selectedMail)||this.assets?.mail[0];if(mail){this.selectedMail=mail.id;this.revision++;if(!mail.read)void this.execute({kind:'read-mail',mailId:mail.id});}}});}
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
    if(!this.owner||!this.assets){this.message=['请先连接军需服务','Connect to the quartermaster first.'];this.revision++;return;}
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
      const snapshot=await this.online.assetCommand(command);
      if(this.owner!==owner||this.disposed)return;
      this.pending=undefined;try{this.storage.removeItem(this.key());}catch{/* Replaying this accepted ID is safe. */}
      this.message=command.kind==='loadout'?['已保存 · 以后每场自动应用','Saved · applied automatically next match']:
        command.kind==='read-mail'?['','']:['操作成功，资产已同步','Completed. Assets synchronized.'];
      if(command.kind==='loadout')delete this.drafts[command.mode];
      const receipt=snapshot.lastReceipt;
      const reward=receipt?.reward as {packs?:number}|undefined;
      const packs=receipt?.packs as Record<string,number>|undefined;
      if(packs&&Object.keys(packs).length)this.gift={packs:{...packs},drops:[],opened:false};
      else if(reward?.packs)this.gift={packs:{'pack:general:0':reward.packs},drops:[],opened:false};
      if(command.kind==='open'){
        const drops=snapshot.lastReceipt?.drops as Array<{item?:string;coins?:number}>|undefined;
        if(!this.openingGift)this.gift={packs:{},drops:drops||[],opened:true};
        const coins=(drops||[]).reduce((n,d)=>n+(d.coins||0),0),items=(drops||[]).filter(d=>d.item);
        this.message=[`已开 ${command.quantity} 个：金币 +${coins}，军需 ${items.length} 件（见仓库）`,`Opened ${command.quantity}: +${coins} coins, ${items.length} gear items in warehouse`];
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
  async watch(offer:()=>Promise<string>){
    if(this.viewing||this.busy||this.pending)return;
    this.viewing=true;const owner=this.online.authenticatedId;this.revision++;
    try{
      let order=this.pendingOrder;
      if(!order){await this.execute({kind:'ad-order',quantity:this.quantity});order=this.pendingOrder;}
      if(!order||owner!==this.online.authenticatedId)return;
      const started=await this.execute({kind:'ad-start',orderId:order.id});
      const attemptId=started?.lastReceipt?.attemptId;
      if(typeof attemptId!=='string')return;
      const result=await offer();
      if(this.disposed||owner!==this.online.authenticatedId)return;
      if(result==='completed')await this.execute({kind:'ad-complete',orderId:order.id,attemptId});
      else this.message=result==='dismissed'?['未完整观看，本段未计入；已确认进度保留','Video not completed. Confirmed progress is kept.']:['视频暂不可用，已确认进度保留，可稍后继续','Video unavailable. Confirmed progress is kept. Try later.'];
    }finally{this.viewing=false;this.revision++;}
  }
  dispose(){this.disposed=true;}
}
