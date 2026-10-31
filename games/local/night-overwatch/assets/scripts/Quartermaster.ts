import { MODS, STARTER_OWNED, LOTTERY, SHOP_IDS, priceFor, trialKey, migrateOwned, resolvedLoadout,
  type Loadout, type ModId, type Owned, type Tier, type TrialStock } from './core/Armory.ts';
import { initialArmoryView, type ArmoryViewState } from './ArmoryView.ts';
import { readMissionProgress } from './core/MissionProgress.ts';
import { missionCoins } from './core/MissionCatalog.ts';

type Mode = ArmoryViewState['mode'];
export type WalletSnapshot = { playerId:string; revision:number; coins:number; inventory:{coolant:number};
  owned:Owned; trials:TrialStock; signedDays:string[]; day:string; signedToday:boolean;
  challenge?:string; reward?:number; prize?:{id:ModId;tier:Tier} };
type Command = {kind:'buy'|'checkin'|'lottery-start'|'lottery-claim';item?:ModId;tier?:number;challenge?:string;requestId:string;playerId:string};
export type WalletPort={nightWallet():Promise<WalletSnapshot>;nightWalletAction(cmd:Command):Promise<WalletSnapshot>};
type Store=Pick<Storage,'getItem'|'setItem'>;
type Local={coinMigration?:true;version:2;coins:number;owned:Owned;coolant:number;signed:string;signedDays:string[];trials:TrialStock;clears:string[];battles:string[]};
const fresh=():Local=>({version:2,coins:0,owned:{...STARTER_OWNED},coolant:0,signed:'',signedDays:[],trials:{},clears:[],battles:[]});
const today=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const uuid=()=>globalThis.crypto?.randomUUID?.()??'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
  const r=Math.floor(Math.random()*16);return(c==='x'?r:(r&3)|8).toString(16);
});
const read=<T>(store:Store,key:string,fallback:T):T=>{try{return JSON.parse(store.getItem(key)||'null')??fallback;}catch{return fallback;}};
export class Quartermaster {
  view=initialArmoryView();
  private local=fresh();
  private revision=-1;
  private day='';
  private epoch=0;
  private cloud=false;
  private port?:WalletPort;
  private pending?:Command;
  private config:{extraWeapons:ModId[];trialChoices:Owned}={extraWeapons:[],trialChoices:{}};
  owner='';
  private store:Store; private paint:(v:ArmoryViewState)=>void; private watch:()=>Promise<boolean>; private changedAccount?:()=>void;
  constructor(store:Store,paint:(v:ArmoryViewState)=>void,watch:()=>Promise<boolean>,changedAccount?:()=>void){
    this.store=store;this.paint=paint;this.watch=watch;this.changedAccount=changedAccount;
  }
  private key(s:string){return 'night-armory-v1:'+this.owner+':'+s;}
  private save(s:string,v:unknown){try{this.store.setItem(this.key(s),JSON.stringify(v));return true;}catch{return false;}}
  set(v:Partial<ArmoryViewState>){this.view={...this.view,...v};this.paint(this.view);}
  dispose(){++this.epoch;this.port=undefined;this.paint=()=>{};this.changedAccount=undefined;}
  private hideWallet(){
    const clean=initialArmoryView();this.view={...this.view,owned:clean.owned,coins:0,coolant:0,trials:{},checkedIn:false,available:false,message:'正在确认账户'};
    this.fit();this.changedAccount?.();
  }
  bind(player:string,cloud:boolean,port:WalletPort|undefined,ads:boolean){
    const owner=(cloud?'account:':'local:')+player;
    if(owner===this.owner&&port===this.port){if(ads!==this.view.adsAvailable)this.set({adsAvailable:ads});return false;}
    ++this.epoch;this.owner=owner;this.cloud=cloud;this.port=port;this.revision=-1;this.day='';
    const oldKits=read<{solo?:Loadout}>(this.store,this.key('kits'),{});
    this.config=read(this.store,this.key('config-v2'),{extraWeapons:oldKits.solo?.some(s=>s.id==='emp')?['emp']:[],trialChoices:{}});
    if(!Array.isArray(this.config.extraWeapons)||!this.config.trialChoices||typeof this.config.trialChoices!=='object')
      this.config={extraWeapons:[],trialChoices:{}};
    this.pending=cloud?read<Command|undefined>(this.store,this.key('pending'),undefined):undefined;
    if(this.pending&&(!['buy','checkin','lottery-start','lottery-claim'].includes(this.pending.kind)||(this.pending.kind==='buy'&&!SHOP_IDS.includes(this.pending.item as typeof SHOP_IDS[number])))){this.pending=undefined;this.save('pending',null);}
    const old=this.view;this.view={...initialArmoryView(),page:old.page,mode:old.mode,adsAvailable:ads};
    if(!cloud){
      const saved=read<Local|undefined>(this.store,this.key('wallet'),undefined);
      this.local=saved||fresh();
      if(this.local.version!==2){this.local={...fresh(),...this.local,version:2,owned:migrateOwned(this.local.owned),
        signedDays:this.local.signed?[this.local.signed]:[],trials:{},battles:[]};}
      if(!saved?.coinMigration){
        let previous:string[]=[];try{previous=readMissionProgress(this.store.getItem('night-overwatch-progress-v1')).cleared;}catch{/* Local progress may be unavailable. */}
        const paid=[...new Set(saved?.clears||[])].filter(id=>missionCoins(id)>0),clears=[...new Set([...paid,...previous])];
        const coins=clears.reduce((sum,id)=>sum+missionCoins(id),0)-paid.length*300;
        const next={...this.local,coinMigration:true as const,clears,coins:this.local.coins+Math.max(0,coins)};
        this.local=next;this.save('wallet',next);
      }
      this.showLocal();
    }else{this.fit();void this.refresh();}
    return true;
  }
  private fit(){
    const owned=this.view.owned,stock=this.view.trials,choices:Owned={};
    for(const id of SHOP_IDS){
      const tier=this.config.trialChoices[id];
      if(tier&&tier>(owned[id]||0)&&(stock[trialKey(id,tier)]||0)>0)choices[id]=tier;
    }
    if(this.view.available&&JSON.stringify(choices)!==JSON.stringify(this.config.trialChoices)){
      this.config={...this.config,trialChoices:choices};this.save('config-v2',this.config);
    }
    const extra=[...new Set(this.config.extraWeapons)].filter(id=>MODS[id]?.kind==='weapon'&&(owned[id]||choices[id])).slice(0,3);
    const kit=resolvedLoadout(owned,this.view.coolant,extra,choices,stock);
    this.set({extraWeapons:extra,trialChoices:choices,kits:{solo:kit,duel:kit.filter(s=>s.id!=='coolant')}});
  }
  private showLocal(){
    const w=this.local;this.day=today();this.view={...this.view,coins:w.coins,owned:w.owned,coolant:w.coolant,trials:w.trials,
      signedDays:w.signedDays,day:this.day,checkedIn:w.signed===this.day,adClaimed:false,available:true};this.fit();
  }
  private accept(w:WalletSnapshot,epoch:number){
    if(epoch!==this.epoch||!w)return false;
    if(this.owner!=='account:'+w.playerId){this.hideWallet();return false;}
    if(w.revision<this.revision||w.day<this.day)return false;
    this.day=w.day;this.revision=w.revision;this.view={...this.view,available:true,coins:w.coins,owned:migrateOwned(w.owned),
      coolant:w.inventory.coolant,trials:w.trials||{},signedDays:w.signedDays||[],day:w.day,checkedIn:w.signedToday,adClaimed:false};
    this.fit();return true;
  }
  async refresh(){
    if(!this.cloud){this.showLocal();return;}
    const epoch=this.epoch,port=this.port;if(!port)return;
    try{const w=await port.nightWallet();if(this.accept(w,epoch)&&this.pending&&!this.view.busy)await this.transact('recover');}
    catch{if(this.epoch===epoch)this.set({available:false,message:'钱包暂不可用，请稍后重试'});}
  }
  toggleWeapon(id:ModId=this.view.selected){
    if(this.view.busy||MODS[id].kind!=='weapon')return;
    const extra=this.view.extraWeapons,has=extra.includes(id);
    if(!has&&(!this.view.owned[id]&&!this.view.trialChoices[id]||extra.length>=3))return;
    this.config={...this.config,extraWeapons:has?extra.filter(x=>x!==id):[...extra,id]};
    this.save('config-v2',this.config);this.fit();
  }
  toggle(){this.toggleWeapon();}
  selectTrial(id:ModId,tier:Tier|0){
    if(this.view.busy||!SHOP_IDS.includes(id as typeof SHOP_IDS[number]))return;
    if(tier&&(!(this.view.trials[trialKey(id,tier)]!>0)||tier<=(this.view.owned[id]||0)))return;
    const choices={...this.config.trialChoices};
    if(!tier||choices[id]===tier)delete choices[id];else choices[id]=tier;
    this.config={...this.config,trialChoices:choices};this.save('config-v2',this.config);this.fit();
  }
  private writeLocal(next:Local){if(!this.save('wallet',next))throw Error('无法保存本机钱包');this.local=next;this.showLocal();}
  beginLocalBattle(owner:string,battleId:string,mode:Mode='solo',kit:Loadout=this.view.kits[mode]){
    if(owner!==this.owner)return false;if(this.cloud)return true;
    if(!kit.some(x=>x.trial))return true;
    if(this.local.battles.includes(battleId))return true;
    const trials={...this.local.trials};
    for(const item of kit.filter(x=>x.trial)){const key=trialKey(item.id,item.tier);if(!(trials[key]!>0))return false;trials[key]!--;}
    try{this.writeLocal({...this.local,trials,battles:[...this.local.battles.slice(-255),battleId]});return true;}catch{return false;}
  }
  localClear(owner:string,mission:string){
    if(this.cloud||this.owner!==owner)return undefined;
    const first=!this.local.clears.includes(mission),coins=missionCoins(mission,first);
    try{this.writeLocal({...this.local,coins:this.local.coins+coins,clears:first?[...this.local.clears,mission]:this.local.clears});return coins;}catch{return undefined;}
  }
  useCoolant(owner:string,apply:()=>boolean){
    if(owner!==this.owner||!this.view.coolant)return false;if(this.cloud)return apply();
    const previous=this.local,next={...previous,coolant:previous.coolant-1};
    if(!this.save('wallet',next))return false;
    if(!apply()){this.save('wallet',previous);return false;}
    this.local=next;this.showLocal();return true;
  }
  private async send(cmd:Command,epoch:number,durable:boolean){
    if(epoch!==this.epoch||!this.port)return;
    if(durable){if(!this.save('pending',cmd))throw Error('无法保存交易');this.pending=cmd;}
    try{const w=await this.port.nightWalletAction(cmd);if(!this.accept(w,epoch))return;
      if(durable){this.pending=undefined;this.save('pending',null);}return w;
    }catch(e){
      const code=(e as {code?:string})?.code||'';
      if(epoch===this.epoch&&code==='IDENTITY_CHANGED')this.hideWallet();
      if(epoch===this.epoch&&durable&&['ITEM_UNAVAILABLE','INSUFFICIENT_COINS','ALREADY_CLAIMED','INVALID_AD_CHALLENGE','REQUEST_ID_CONFLICT'].includes(code)){
        this.pending=undefined;this.save('pending',null);
      }throw e;
    }
  }
  async transact(kind:'buy'|'checkin'|'watch'|'recover'){
    if(this.view.busy||!this.view.available)return;
    if(!this.cloud&&this.day!==today())this.showLocal();
    const epoch=this.epoch,{selected:item,owned}=this.view,tier=(owned[item]||0)+1,price=priceFor(item,tier);
    const cmd=(k:Command['kind']):Command=>({kind:k,playerId:this.owner.slice(8),requestId:uuid()});
    this.set({busy:true,message:''});
    try{
      if(this.pending){const w=await this.send(this.pending,epoch,true);if(w)this.set({message:'上次交易已确认',prize:w.prize});return;}
      if(kind==='recover')return;
      if(kind==='buy'&&(!price||this.view.coins<price)||kind==='checkin'&&this.view.checkedIn||kind==='watch'&&!this.view.adsAvailable)return;
      let reward=0,prize:WalletSnapshot['prize'];
      if(kind==='watch'){
        const ticket=this.cloud?(await this.send(cmd('lottery-start'),epoch,false))?.challenge:'local';
        if(!ticket||epoch!==this.epoch)return;
        const done=await this.watch();if(epoch!==this.epoch)return;
        if(!done){this.set({message:'广告未完成，未获得抽奖商品'});return;}
        if(this.cloud){const w=await this.send({...cmd('lottery-claim'),challenge:ticket},epoch,true);if(!w)return;prize=w.prize;}
        else{
          const drawn=LOTTERY[Math.floor(Math.random()*LOTTERY.length)];prize={id:drawn.id,tier:drawn.tier};
          const key=trialKey(prize.id,prize.tier);this.writeLocal({...this.local,trials:{...this.local.trials,[key]:(this.local.trials[key]||0)+1}});
        }
      }else if(this.cloud){
        const w=await this.send(kind==='buy'?{...cmd('buy'),item,tier}:cmd('checkin'),epoch,true);if(!w)return;reward=w.reward||0;
      }else if(kind==='buy'){
        this.writeLocal({...this.local,coins:this.local.coins-price,owned:{...owned,[item]:tier as Tier}});
      }else{
        reward=60;this.writeLocal({...this.local,signed:today(),signedDays:[...this.local.signedDays,today()],coins:this.local.coins+reward});
      }
      if(epoch===this.epoch)this.set({prize,message:prize?'已获得 '+MODS[prize.id].name[0]+' '+prize.tier+' 档 · 单场有效':kind==='buy'?(MODS[item].kind==='weapon'?'兑换成功，请在基地装入额外武器槽':'兑换成功，能力自动生效'):reward?'已领取 '+reward+' 金币':'今日已领取'});
    }catch{if(epoch===this.epoch)this.set({message:this.pending?'交易尚未确认，请稍后重试':'暂未完成，请稍后重试'});}
    finally{if(epoch===this.epoch)this.set({busy:false});}
  }
}
