import { resources, Texture2D, SpriteFrame, Rect, TTFFont, isValid } from 'cc';
import type { HUD } from './HUD';
import type { ProgressionPage } from './Quartermaster';

// Rectangles sample only the approved illustrations; prices and UI text are rendered live.
const cuts: Record<string, [string, number, number, number, number]> = {
  closedCrate:['reward-atlas',0,165,790,530],openCrate:['reward-atlas',790,0,720,724],wheel:['reward-atlas',1510,30,662,662],
  powerGear:['gear-atlas-v2',60,0,510,440],rateGear:['gear-atlas-v2',610,0,560,440],radiusGear:['gear-atlas-v2',1240,0,510,440],droneGear:['gear-atlas-v2',0,440,720,440],coolingGear:['gear-atlas-v2',760,440,370,440],coinPile:['gear-atlas-v2',1140,440,634,440],burstGear:['gear-atlas-v2',60,0,510,440],
  homeBadge:['01-home',34,24,120,72],coin:['01-home',1137,27,46,47],homeCrate:['01-home',90,404,94,94],homeCompass:['01-home',59,547,123,98],calendar:['01-home',1390,454,53,52],gift:['01-home',1390,551,60,59],
  loadoutBurst:['02-loadout',146,283,206,86],loadoutTwin:['02-loadout',418,284,217,88],loadoutTracking:['02-loadout',1060,500,195,108],loadoutEmp:['02-loadout',145,676,258,89],
  homeShop:['01-home',31,716,390,111],homeGrowth:['01-home',446,716,380,111],homeTasks:['01-home',849,716,379,111],homeWarehouse:['01-home',1253,716,388,111],
  drone:['02-loadout',143,483,353,87],power:['02-loadout',1067,699,194,104],combo:['02-loadout',1055,138,585,125],
  solo:['03-mode-selection',84,153,480,420],duel:['03-mode-selection',606,154,466,419],training:['03-mode-selection',1118,154,470,419],
  burst:['04-shop',49,252,400,178],twin:['04-shop',475,252,400,178],laser:['04-shop',49,576,400,170],trackingDevice:['04-shop',475,576,400,170],
  supply:['05-supply',45,282,546,373],pack1:['05-supply',662,333,153,114],pack3:['05-supply',853,337,165,113],pack5:['05-supply',1052,337,169,113],pack10:['05-supply',1248,337,164,112],pack20:['05-supply',1441,334,174,116],
  tracking:['06-growth-skills',530,332,515,253],emp:['06-growth-skills',1079,332,546,253],emblem:['06-growth-skills',62,100,390,183],
  checkin:['07-tasks',66,230,352,108],taskSolo:['07-tasks',66,360,352,111],taskDuel:['07-tasks',66,495,352,111],taskSupply:['07-tasks',66,629,352,106],
  envelope:['08-inbox',38,116,158,116],mailAircraft:['08-inbox',1040,120,594,244],coins:['08-inbox',743,461,379,181],rewardSupply:['08-inbox',1148,461,378,181],
  resultEmblem:['09-settlement',600,21,470,148],
  gold:['skins',51,126,1154,244],blue:['skins',51,439,1154,251],panel:['skins',46,744,1163,414],
};
const homeAssets = ['home','title','skins','01-home','night-ui-serif'];
const equipmentAssets = ['gear-atlas-v2','04-shop','06-growth-skills'];
const pageAssets: Record<ProgressionPage,string[]> = {
  '': ['home','title','01-home'], modes: ['base','03-mode-selection'],
  shop: ['base',...equipmentAssets], loadout: ['hangar',...equipmentAssets],
  supply: ['base','reward-atlas'], growth: ['base','06-growth-skills','gear-atlas-v2'],
  tasks: ['hangar','07-tasks'], inbox: ['base','08-inbox'],
  craft: ['hangar',...equipmentAssets],
  warehouse: ['hangar','reward-atlas',...equipmentAssets,'01-home'],
  receipts: ['base','reward-atlas'], checkin: ['hangar','05-supply','08-inbox',...equipmentAssets], probability: ['base'],
};
const warmAssets = ['base','hangar','03-mode-selection',...equipmentAssets,'reward-atlas','07-tasks','08-inbox','05-supply','resultBadge'];

export class ProgressionArt {
  frames = new Map<string, SpriteFrame>();
  private loading = new Map<string,Promise<void>>();
  private disposed = false;
  private warming = false;
  failed = new Set<string>();
  font?: TTFFont;
  private hud:HUD;
  constructor(hud: HUD) {
    this.hud=hud;
    this.ensure(homeAssets);
  }
  private has(name:string){return name==='night-ui-serif'?!!this.font:this.frames.has(name);}
  load(name:string):Promise<void> {
    if(this.disposed||this.has(name)||this.failed.has(name))return Promise.resolve();
    const pending=this.loading.get(name);if(pending)return pending;
    const request=new Promise<void>(resolve=>{
      const finish=(error:Error|null)=>{
        this.loading.delete(name);
        if(!this.disposed&&isValid(this.hud.root)){
          if(error)this.failed.add(name);
          if(!this.hud.editing)this.hud.modalKey='rebuild';
        }
        resolve();
      };
      if(name==='night-ui-serif'){
        resources.load('ui/progression/'+name,TTFFont,(error,font)=>{
          if(!error&&!this.disposed&&isValid(this.hud.root))this.font=font;
          finish(error);
        });
        return;
      }
      resources.load('ui/progression/'+name+'/texture',Texture2D,(error,texture)=>{
        if(!error&&!this.disposed&&isValid(this.hud.root)){
          const frame=new SpriteFrame();frame.texture=texture;this.frames.set(name,frame);
          for(const [key,[source,x,y,w,h]] of Object.entries(cuts))if(source===name){
            const crop=new SpriteFrame();crop.texture=texture;crop.rect=new Rect(x,y,w,h);
            if(['gold','blue','panel'].includes(key))crop.insetLeft=crop.insetRight=crop.insetTop=crop.insetBottom=48;
            this.frames.set(key,crop);
          }
        }
        finish(error);
      });
    });
    this.loading.set(name,request);
    void request.then(()=>{if(this.loading.get(name)===request)this.loading.delete(name);});
    return request;
  }
  ensure(names:string[]){for(const name of names)void this.load(name);return names.every(name=>this.has(name));}
  required(page:ProgressionPage,result=false,gift=false){return ['skins','night-ui-serif',...(result?['resultBadge']:pageAssets[page]),...(gift?['base','reward-atlas',...equipmentAssets]:[])];}
  retry(){const names=Array.from(this.failed);this.failed.clear();this.ensure(names);this.hud.modalKey='rebuild';}
  warm(){
    if(this.warming||!this.homeReady||this.disposed)return;
    this.warming=true;
    const queue=[...warmAssets];
    const next=async()=>{while(queue.length&&!this.disposed)await this.load(queue.shift()!);};
    void next();void next();
  }
  get(key:string) {
    if(!this.frames.has(key))this.load(cuts[key]?.[0]||key);
    return this.frames.get(key);
  }
  get homeReady(){return homeAssets.every(name=>this.has(name));}
  get homeFailed(){return homeAssets.some(name=>this.failed.has(name));}
  get loadingAssets(){return Array.from(this.loading.keys());}
  destroy(){this.disposed=true;for(const frame of this.frames.values())frame.destroy();this.frames.clear();this.font=undefined;}
}
