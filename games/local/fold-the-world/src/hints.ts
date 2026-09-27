import type { Puzzle } from './game';
import type { Fold } from './geometry';
import type { Plan } from './level-kit';
import { chapterPlans as chapter0 } from './chapters/01-25';
import { chapterPlans as chapter1 } from './chapters/26-50';
import { chapterPlans as chapter2 } from './chapters/51-75';
import { chapterPlans as chapter3 } from './chapters/76-100';
export interface Hint { text: string; marker: {x:number;y:number} | null; stage: number; stages: number; recovery: boolean }
export const plans: readonly Plan[] = [...chapter0,...chapter1,...chapter2,...chapter3];
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
    if(this.recovery)return {text:'你正在探索另一条路线，已经找到的钥匙会保留。可以继续尝试；需要从头跟随这条参考路线时，再选择重来。',marker:null,stage:this.stage,stages:this.plan.phases.length,recovery:true};
    const p=this.plan.phases[this.stage];
    const target=p.keys.map(id=>game.world.find(e=>e.kind==='key'&&e.id===id)).find(Boolean);
    const point=p.point;
    return {text:[p.clue,p.action,p.route][Math.max(0,Math.min(2,tier))],marker:tier>0?(target?{x:target.x+target.w/2,y:target.y+target.h/2}:point):null,stage:this.stage,stages:this.plan.phases.length,recovery:false};
  }
}
