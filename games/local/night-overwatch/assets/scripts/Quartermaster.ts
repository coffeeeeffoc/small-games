import { MODS, STARTER_LOADOUT, validLoadout, type Loadout, type ModId } from './core/Armory.ts';
import { initialArmoryView, type ArmoryViewState } from './ArmoryView.ts';

type Owned = ArmoryViewState['owned'];
type Mode = ArmoryViewState['mode'];
export type WalletSnapshot = { playerId:string; revision:number; coins:number; inventory:{coolant:number};
  owned:Owned; day:string; signedToday:boolean; drawnToday:boolean; challenge?:string; reward?:number };
type Command = { kind:'buy'|'checkin'|'ad-start'|'ad-claim'; item?:ModId; tier?:number; challenge?:string; requestId:string; playerId:string };
export type WalletPort = { nightWallet():Promise<WalletSnapshot>; nightWalletAction(cmd:Command):Promise<WalletSnapshot> };
type Store = Pick<Storage,'getItem'|'setItem'>;
type Local = { coins:number; owned:Owned; coolant:number; signed:string; drawn:string; clears:string[] };
const fresh = ():Local => ({coins:0,owned:{power:1,velocity:1,duration:1},coolant:0,signed:'',drawn:'',clears:[]});
const today = () => new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const uuid = () => globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
  const r=Math.floor(Math.random()*16);return (c==='x'?r:(r&3)|8).toString(16);
});
const read = <T>(store:Store,key:string,fallback:T):T => {try{return JSON.parse(store.getItem(key)||'null')??fallback;}catch{return fallback;}};
export class Quartermaster {
  view = initialArmoryView();
  private local = fresh();
  private revision = -1;
  private day = '';
  private epoch = 0;
  private cloud = false;
  private port?:WalletPort;
  private pending?:Command;
  private saved:{solo:Loadout;duel:Loadout} = {solo:STARTER_LOADOUT,duel:STARTER_LOADOUT};
  owner = '';
  private store:Store;
  private paint:(v:ArmoryViewState)=>void;
  private watch:()=>Promise<boolean>;
  private changedAccount?:()=>void;
  private hideWallet(){
    const clean=initialArmoryView();
    this.view={...this.view,owned:clean.owned,coins:0,coolant:0,checkedIn:false,adClaimed:false,available:false,message:'正在确认账户'};
    this.fit();this.changedAccount?.();
  }
  constructor(store:Store, paint:(v:ArmoryViewState)=>void, watch:()=>Promise<boolean>,changedAccount?:()=>void) {
    this.store=store;this.paint=paint;this.watch=watch;this.changedAccount=changedAccount;
  }
  dispose(){++this.epoch;this.port=undefined;this.paint=()=>{};this.changedAccount=undefined;}
  private key(s:string) { return 'night-armory-v1:'+this.owner+':'+s; }
  private save(s:string,value:unknown) { try{this.store.setItem(this.key(s),JSON.stringify(value));return true;}catch{return false;} }
  set(v:Partial<ArmoryViewState>) {this.view={...this.view,...v};this.paint(this.view);}
  bind(player:string, cloud:boolean, port:WalletPort|undefined, ads:boolean) {
    const owner=(cloud?'account:':'local:')+player;
    if(owner===this.owner && port===this.port){if(ads!==this.view.adsAvailable)this.set({adsAvailable:ads});return false;}
    ++this.epoch;this.owner=owner;this.cloud=cloud;this.port=port;this.revision=-1;this.day='';
    this.saved=read(this.store,this.key('kits'),{solo:STARTER_LOADOUT,duel:STARTER_LOADOUT});
    this.pending=cloud?read(this.store,this.key('pending'),undefined):undefined;
    const old=this.view;this.view={...initialArmoryView(),page:old.page,mode:old.mode,adsAvailable:ads};
    if(!cloud){this.local=read(this.store,this.key('wallet'),fresh());this.showLocal();}
    else {this.fit();void this.refresh();}
    return true;
  }
  private fit() {
    const pick=(mode:Mode):Loadout=>{
      const kit=this.saved[mode];
      return (validLoadout(kit)?kit:STARTER_LOADOUT).flatMap(({id})=>{
        const tier=id==='coolant'?mode==='solo'&&this.view.coolant>0?1:0:this.view.owned[id]||0;
        return tier ? [{id,tier:mode==='duel'?1:tier}] : [];
      });
    };
    this.set({kits:{solo:pick('solo'),duel:pick('duel')}});
  }
  private showLocal(){const w=this.local;this.day=today();this.view={...this.view,coins:w.coins,owned:w.owned,coolant:w.coolant,
    checkedIn:w.signed===this.day,adClaimed:w.drawn===this.day,available:true};this.fit();}
  private accept(w:WalletSnapshot,epoch:number){
    if(epoch!==this.epoch||!w)return false;
    if(this.owner!=='account:'+w.playerId){this.hideWallet();return false;}
    if(w.revision<this.revision||w.day<this.day)return false;
    this.day=w.day;this.revision=w.revision;this.view={...this.view,available:true,coins:w.coins,owned:w.owned,
      coolant:w.inventory.coolant,checkedIn:w.signedToday,adClaimed:w.drawnToday};this.fit();return true;
  }
  async refresh(){
    if(!this.cloud){this.showLocal();return;}
    const epoch=this.epoch,port=this.port;if(!port)return;
    try{const w=await port.nightWallet();if(this.accept(w,epoch)&&this.pending&&!this.view.busy) await this.transact('recover');}
    catch{if(this.epoch===epoch)this.set({available:false,message:'钱包暂不可用，请稍后重试'});}
  }
  toggle(){
    const {mode,selected:id,kits,coolant,owned}=this.view,kit=kits[mode],has=kit.some(x=>x.id===id);
    const tier=id==='coolant' ? mode==='solo'&&coolant>0?1:0 : owned[id]||0;
    if(this.view.busy||(!has&&(!tier||kit.length>=3)))return;
    this.saved={...this.saved,[mode]:has?kit.filter(x=>x.id!==id):[...kit,{id,tier:mode==='duel'?1:tier}]};
    this.save('kits',this.saved);this.fit();
  }
  private writeLocal(next:Local){if(!this.save('wallet',next))throw Error('无法保存本机钱包');this.local=next;this.showLocal();}
  localClear(owner:string,mission:string){if(this.cloud||this.owner!==owner)return undefined;
    const first=!this.local.clears.includes(mission),coins=first?300:80;
    try{this.writeLocal({...this.local,coins:this.local.coins+coins,clears:first?[...this.local.clears,mission]:this.local.clears});return coins;}catch{return undefined;}}
  useCoolant(owner:string,apply:()=>boolean){
    if(owner!==this.owner||!this.view.coolant)return false;
    if(this.cloud)return apply(); // The ranked replay command consumes stock in the account transaction.
    const previous=this.local,next={...previous,coolant:previous.coolant-1};
    // Reserve durably before changing the simulation. A rejected use restores the same unit.
    if(!this.save('wallet',next))return false;
    if(!apply()){this.save('wallet',previous);return false;}
    this.local=next;this.showLocal();return true;
  }
  private async send(cmd:Command,epoch:number,durable:boolean){
    if(epoch!==this.epoch||!this.port)return;
    if(durable){if(!this.save('pending',cmd))throw Error('无法保存交易');this.pending=cmd;}
    try{const w=await this.port.nightWalletAction(cmd);
      if(!this.accept(w,epoch))return;
      if(durable){this.pending=undefined;this.save('pending',null);}return w;
    }catch(e){
      const code=(e as {code?:string})?.code||'';
      if(epoch===this.epoch && code==='IDENTITY_CHANGED')this.hideWallet();
      if(epoch===this.epoch && durable && ['ITEM_UNAVAILABLE','INSUFFICIENT_COINS','ALREADY_CLAIMED','INVALID_AD_CHALLENGE','REQUEST_ID_CONFLICT'].includes(code)){
        this.pending=undefined;this.save('pending',null);
      }
      throw e;
    }
  }
  async transact(kind:'buy'|'checkin'|'watch'|'recover'){
    if(this.view.busy || !this.view.available)return;
    if(!this.cloud && this.day!==today())this.showLocal();
    const epoch=this.epoch,{selected:item,owned}=this.view,tier=item==='coolant'?1:(owned[item]||0)+1;
    const price=tier===1?MODS[item].price:tier===2?MODS[item].tune:0;
    const cmd=(k:Command['kind']):Command=>({kind:k,playerId:this.owner.slice(8),requestId:uuid()});
    this.set({busy:true,message:''});
    try{
      if(this.pending){const w=await this.send(this.pending,epoch,true);if(w)this.set({message:'上次交易已确认'});return;}
      if(kind==='recover')return;
      if(kind==='buy' && (!price||this.view.coins<price) || kind==='checkin' && this.view.checkedIn ||
        kind==='watch' && (this.view.adClaimed||!this.view.adsAvailable))return;
      let reward=0;
      if(kind==='watch'){
        const day=today(),ticket=this.cloud?(await this.send(cmd('ad-start'),epoch,false))?.challenge:'local';
        if(!ticket||epoch!==this.epoch)return;
        const done=await this.watch();
        if(this.epoch!==epoch)return;
        if(!done){this.set({message:'广告未完成，未领取金币'});return;}
        if(this.cloud){const w=await this.send({...cmd('ad-claim'),challenge:ticket},epoch,true);if(!w)return;reward=w.reward||0;}
        else if(day===today()&&this.local.drawn!==day){const r=Math.random();reward=r<.6?40:r<.9?80:160;
          this.writeLocal({...this.local,coins:this.local.coins+reward,drawn:day});}
      }else if(this.cloud){
        const w=await this.send(kind==='buy'?{...cmd('buy'),item,tier}:cmd('checkin'),epoch,true);
        if(!w)return;reward=w.reward||0;
      }else if(kind==='buy'){
        this.writeLocal({...this.local,coins:this.local.coins-price,owned:item==='coolant'?owned:{...owned,[item]:tier},
          coolant:this.local.coolant+(item==='coolant'?1:0)});
      }else{reward=60;this.writeLocal({...this.local,signed:today(),coins:this.local.coins+reward});}
      if(epoch===this.epoch)this.set({message:kind==='buy'?'兑换成功':reward?'已领取 '+reward+' 金币':'今日已领取'});
    }catch{if(this.epoch===epoch)this.set({message:this.pending?'交易尚未确认，请稍后重试':'暂未完成，请稍后重试'});}
    finally{if(this.epoch===epoch)this.set({busy:false});}
  }
}
