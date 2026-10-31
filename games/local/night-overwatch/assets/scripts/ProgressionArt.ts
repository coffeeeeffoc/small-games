import { resources, Texture2D, SpriteFrame, Rect, TTFFont, isValid } from 'cc';
import type { HUD } from './HUD';

// Rectangles sample only the approved illustrations; prices and UI text are rendered live.
const cuts: Record<string, [string, number, number, number, number]> = {
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
export class ProgressionArt {
  frames = new Map<string, SpriteFrame>();
  private loading = new Set<string>();
  failed = new Set<string>();
  font?: TTFFont;
  private hud:HUD;
  constructor(hud: HUD) {
    this.hud=hud;
    for (const name of ['home','title','skins','01-home']) this.load(name);
    resources.load('ui/progression/night-ui-serif',TTFFont,(error,font)=>{
      if (!error && isValid(hud.root)) { this.font=font; hud.modalKey='rebuild'; }
    });
  }
  load(name:string) {
    if(this.loading.has(name))return;
    this.loading.add(name);
    resources.load('ui/progression/'+name+'/texture',Texture2D,(error,texture)=>{
      if(!isValid(this.hud.root))return;
      if(error){this.failed.add(name);return;}
      const frame=new SpriteFrame();frame.texture=texture;this.frames.set(name,frame);
      for(const [key,[source,x,y,w,h]] of Object.entries(cuts))if(source===name){
        const crop=new SpriteFrame();crop.texture=texture;crop.rect=new Rect(x,y,w,h);
        if(['gold','blue','panel'].includes(key))crop.insetLeft=crop.insetRight=crop.insetTop=crop.insetBottom=48;
        this.frames.set(key,crop);
      }
      this.hud.modalKey='rebuild';
    });
  }
  get(key:string) {
    if(!this.frames.has(key))this.load(cuts[key]?.[0]||key);
    return this.frames.get(key);
  }
  get homeReady(){return ['home','title','gold','homeShop'].every(key=>this.frames.has(key))&&!!this.font;}
  destroy(){for(const frame of this.frames.values())frame.destroy();this.frames.clear();}
}
