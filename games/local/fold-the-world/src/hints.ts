import type { Puzzle } from './game';
import type { Fold } from './geometry';
import { creaseName } from './strings';
export interface Hint { text: string; marker: {x:number;y:number} | null; stage: number; stages: number; recovery: boolean }
interface Phase { clue: string; action: string; route: string; point: {x:number;y:number}; keys: string[] }
interface Plan { operations: (Fold|null)[]; phases: Phase[] }
const A:Fold={crease:'A',direction:'right-to-left'}, B:Fold={crease:'B',direction:'right-to-left'}, C:Fold={crease:'C',direction:'right-to-left'}, L:Fold={crease:'B',direction:'left-to-right'};
const step=(clue:string,action:string,route:string,x:number,y:number,...keys:string[]):Phase=>({clue,action,route,point:{x,y},keys});
const fold=(name:string,direction:'←'|'→',x:number,y:number):Phase=>step('换一道折痕，就能折出不同的道路。',`在标记的固定平台上站稳，选${creaseName(name)} ${direction}，再折叠。`,`松开移动键，选择${creaseName(name)} ${direction}，点击“折叠”或按 F。也可以在${direction==='←'?'右':'左'}侧空白处向内滑动。`,x,y);
const finish=(x:number,y:number):Phase=>step('出口已经为你准备好了。','走到标记的出口。','带着找到的钥匙，沿接通的道路走到出口。',x,y);
const across=step('原来的缺口太宽，跳不过去。','把远处的纸面折向你的起点。','站在起点的平台上，在右侧空白处向左滑。也可以直接点击“折叠”或按 F。',150,430);
const crossAndOpen=(x:number,y:number,...keys:string[]):Phase=>step('折入的道路通向一块不会移动的平台。',keys.length?'拿到标记的钥匙，走到固定落脚点，再展开。':'沿路走到固定落脚点，再展开。','沿带斜线的桥向右走，有钥匙就拿上。在右侧带点纹的平台上站稳，点击“展开”或在空白处向外滑动。',x,y,...keys);
const rightApproach=step('展开的道路，现在通向了另一边。','沿右侧道路走，跳过尖刺，再登上实心台阶。','在尖刺前停一下，跳过整排尖刺，再跳上最右侧的高台。站稳后选折痕二向右折，也可以在左侧空白处向右滑动。',960,410);
const balcony=step('左侧的高台，现在从右边也能跳上去了。','向左跳上折入的高台，再跳到固定阳台。','从右侧高台向左跳到带斜线的平台。有钥匙就拿上，走近它的左边缘，再向左跳到更高的点纹阳台。',775,300,'balcony-key');
const middle=(x:number,y:number,...keys:string[]):Phase=>step('第二次折出的，是通向高处的台阶。','先跳上固定小台，再跳到折入的中层平台。','从小岛向右跳上点纹小台，再向左跳到斜线平台。拿到钥匙后靠近右端，向右跳上高处的固定平台，在那里展开。',x,y,...keys);
const cloud=step('站得更高，第三道折痕就有了用处。','向左跳上折入的高台，拿到最后的钥匙。','左侧斜线平台比你高一阶，跳上去拿钥匙。下一次展开，要回到旁边带点纹的固定平台。',485,290,'cloud-key','key');
export const plans: readonly Plan[] = [
  {operations:[A],phases:[across,finish(447,430)]},
  {operations:[{crease:'A',direction:'left-to-right'}],phases:[fold('A','→',1050,430),finish(747,430)]},
  {operations:[B],phases:[fold('B','←',150,430),finish(533,430)]},
  {operations:[A],phases:[across,step('折过来的是一级台阶。','向右跳到带斜线的平台上。','走近起点平台的边缘，留一点助跑距离，向右跳上高一阶的平台，再走到出口。',310,410)]},
  {operations:[A],phases:[across,step('尖刺也跟着道路移动了。','跳过折入桥上的尖刺。','走近尖刺，向右跳过整排，落在另一边，再继续走到出口。',390,430)]},
  {operations:[A],phases:[across,step('出口还在家里，把钥匙带回去。','拿到折过来的钥匙，再向左返回。','沿斜线桥走过去拿钥匙，然后转身，一直向左走回起点的门。这次不用展开。',113,430,'key')]},
  {operations:[A,null],phases:[across,crossAndOpen(461,470),step('展开后，挡在出口前的柱子移走了。','跳到固定的上层平台。','从小岛向右跳到带点纹的高台上，出口就在上面。',543,408)]},
  {operations:[A,null],phases:[across,step('路可以收走，找到的钥匙不会丢。','拿到钥匙，回到起点的固定平台，再展开。','沿斜线桥向右拿钥匙，然后返回起点平台中间。展开纸面，移开家门口的遮挡，再走到门前。',181,470,'key'),finish(105,470)]},
  {operations:[A,null,B],phases:[across,crossAndOpen(526,470),fold('B','←',526,470),step('要上高台，需要换第二道折痕。','先向左登高，再向右跳到出口。','从小岛向左跳到固定小台，走近左端，再向左跳上斜线高台。靠近它的右端，向右跳到最高的点纹平台，走进出口。',503,300)]},
  {operations:[A,null,L],phases:[across,step('高出的实心台阶，是安全的起跳点。','越过尖刺、拿到钥匙，到小岛上展开。','向右跳上实心台阶，走近右端，从这里跳过尖刺，落到下方的桥上。拿到钥匙，继续走到宽阔的点纹平台，再展开。',561,470,'key'),rightApproach,balcony]},
  {operations:[A,null,B,null],phases:[across,crossAndOpen(521,480,'lower-key'),fold('B','←',521,480),step('第二把钥匙在高处，出口的遮挡可以移走。','拿上层钥匙，落到遮挡左侧的固定平台上。','先向左跳上固定小台，再向左跳上斜线高台拿钥匙。向右跳到最高点纹平台未被遮住的左端，站稳后展开。',385,300,'upper-key'),finish(453,300)]},
  {operations:[A,null,L,null],phases:[across,step('两把钥匙，可以分两趟拿。','拿到桥上的钥匙，走到中央固定平台。','跳上折入的实心台阶，从上面跃过尖刺，拿到桥上的钥匙，继续走到固定平台再展开。',561,470,'road-key'),rightApproach,step('阳台会留下，挡路的纸可以展开。','拿到高处的钥匙，在阳台未被遮住的右端展开。','向左跳上斜线高台拿第二把钥匙，走近左端，再向左跳到点纹阳台的右端。站稳展开，再向左走向出口。',786,300,'balcony-key'),finish(723,300)]},
  {operations:[A,null,B,null,C],phases:[across,crossAndOpen(491,520),fold('B','←',491,520),middle(576,350),fold('C','←',576,350),step('最后一道折痕，补上了最高的一级台阶。','拿到高处钥匙，再向右跳到最后的平台。','从固定落脚点向左跳到斜线高台拿钥匙。走到它的右半边，再向右跳上最高的点纹平台，走到出口。',613,230,'key')]},
  {operations:[A,null,B,null,A],phases:[across,crossAndOpen(491,520,'road-key'),fold('B','←',491,520),step('高处的钥匙，是你的返程凭证。','拿到高处钥匙，再回到固定小台。','先跳上固定小台，再向左跳到斜线高台。向左走拿钥匙，返回高台右端，再向右跳回点纹小台，站稳后展开。',551,460,'return-key'),fold('A','←',551,460),step('最初的桥，通向了已经解锁的出口。','向左落回小岛，再沿折入的桥向左走。','从小台向左跳到下方小岛，再向左走过斜线桥，进入桥上的出口。',337,520)]},
  {operations:[A,null,B,null,C,null,A,null],phases:[across,crossAndOpen(491,520,'road-key'),fold('B','←',491,520),middle(576,350,'middle-key'),fold('C','←',576,350),step(cloud.clue,'拿到第三把钥匙，再向右回到固定平台。',`${cloud.route} 向右跳回下方宽阔的点纹平台，站稳后展开。`,631,350,'cloud-key'),fold('A','←',561,350),step('最后一次架桥，是为了回家。','向左下到小岛，返回起点，再展开一次。','从高处固定平台向左走下，经过小台落回小岛。沿斜线桥向左回到起点，在平台中间站稳，展开，移开门前的遮挡。',181,520),finish(113,520)]},
  {operations:[A,null,L,null,C,null,A],phases:[across,step('先找到桥上的钥匙和永久落脚点。','越过折入的台阶与尖刺，到固定平台上展开。','跳上实心台阶，从右端跃过尖刺。拿到桥上钥匙，走到宽阔的固定平台，再展开。',561,470,'road-key'),rightApproach,step('高台让你能继续越过阳台。','拿到阳台钥匙，再到左侧上层固定平台。','向左跳上斜线高台拿钥匙，再向左跳到固定阳台。走近阳台左端，向左跨过缺口，落到长条点纹平台上，再展开。',641,300,'balcony-key'),fold('C','←',641,300),step('中央平台上方，还有最后一把钥匙。','拿到高处钥匙，向右返回固定平台，再展开。','向左跳上斜线高台拿最后一把钥匙，再向右跳回下方点纹平台，站稳展开。',641,300,'cloud-key'),fold('A','←',561,300),step('三把钥匙，都要带回最初的门前。','落回中央道路，沿第一座桥回家。','从上层平台向左走入缺口，落到下方道路。走近尖刺，从右向左跳过去，再跳上实心台阶，向左落回起点，走到家门口。',113,470)]},
];
const same=(a:Fold|null,b:Fold|null):boolean=>a?.crease===b?.crease&&a?.direction===b?.direction;
// Tracks successful commits only. No input replay, path solver, or game-state mutation.
export class HintGuide {
  stage=0; private seen=0; private deaths=0; private recovery=false;
  constructor(readonly plan:Plan) {}
  update(game:Puzzle):void {
    const count=game.folds+game.unfolds;
    if(count<this.seen||game.deaths!==this.deaths){this.stage=0;this.seen=0;this.recovery=false;this.deaths=game.deaths;}
    if(count>this.seen) {
      const missedKey=this.plan.phases[this.stage]?.keys.some(id=>game.level.entities.some(e=>e.kind==='key'&&e.id===id)&&!game.collected.has(id));
      if(missedKey||count!==this.seen+1||this.stage>=this.plan.operations.length||!same(game.fold,this.plan.operations[this.stage]))this.recovery=true;
      if(!this.recovery)this.stage++;
      this.seen=count;
    }
  }
  get(game:Puzzle,tier:number):Hint {
    this.update(game);
    if(this.recovery)return {text:game.fold?'你换了折法，或漏拿了钥匙。请先回固定平台再展开；想跟随标记路线，可以重新开始本关。':'你换了折法，或漏拿了钥匙。重新开始本关，就能跟随标记路线。',marker:null,stage:this.stage,stages:this.plan.phases.length,recovery:true};
    const p=this.plan.phases[this.stage];
    const target=p.keys.map(id=>game.world.find(e=>e.kind==='key'&&e.id===id)).find(Boolean);
    const point=this.stage===0?{x:game.level.spawn.x+11,y:game.level.spawn.y+28}:p.point;
    return {text:[p.clue,p.action,p.route][Math.max(0,Math.min(2,tier))],marker:tier>0?(target?{x:target.x+target.w/2,y:target.y+target.h/2}:point):null,stage:this.stage,stages:this.plan.phases.length,recovery:false};
  }
}
