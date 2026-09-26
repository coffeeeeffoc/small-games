import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levels } from '../src/levels';
import { Puzzle } from '../src/game';
import { routes, runAction } from './routes';
import { HintGuide, plans } from '../src/hints';
import { STEP } from '../src/physics';
for (const [index, level] of levels.entries()) test(`Route ${index+1}: ${level.title}`, () => {
  const game = new Puzzle(level);
  const guide = new HintGuide(plans[index]);
  assert.deepEqual(plans[index].operations,routes[index].filter(a=>a.kind==='fold'||a.kind==='unfold').map(a=>a.kind==='fold'?{crease:a.crease,direction:a.direction}:null));
  assert.equal(plans[index].phases.length,plans[index].operations.length+1);
  for(let i=0;i<10;i++)game.tick(STEP,{axis:0,jump:false});
  for(const action of routes[index]){
    runAction(game,action);guide.update(game);
    const before=JSON.stringify(game);
    for(let tier=0;tier<3;tier++){
      const hint=guide.get(game,tier);assert.match(hint.text,/[\u4e00-\u9fff]/);assert.ok(!hint.recovery);
      if(hint.marker){assert.ok(hint.marker.x>=0&&hint.marker.x<=1200);assert.ok(hint.marker.y>=0&&hint.marker.y<=600);}
    }
    assert.equal(JSON.stringify(game),before,'Hints must not change gameplay');
  }
  assert.equal(game.mode,'COMPLETED');
  assert.equal(game.deaths,0);
  assert.equal(game.folds,routes[index].filter(a=>a.kind==='fold').length);
  assert.equal(game.collected.size,level.entities.filter(e=>e.kind==='key').length);
  assert.equal(guide.stage,plans[index].operations.length);
});
test('hint phases ignore cancelled/rejected folds and recover on restart',()=>{
  const game=new Puzzle(levels[2]),guide=new HintGuide(plans[2]);for(let i=0;i<10;i++)game.tick(STEP,{axis:0,jump:false});
  const first=guide.get(game,0);assert.equal(first.marker,null);
  game.beginPreview({crease:'B',direction:'right-to-left'});game.preview=.8;game.cancelPreview();assert.equal(guide.get(game,2).stage,0);
  assert.ok(!game.request({crease:'missing',direction:'right-to-left'}));assert.equal(guide.get(game,2).stage,0);
  runAction(game,{kind:'fold',crease:'A',direction:'right-to-left'});assert.ok(guide.get(game,0).recovery);
  game.restart();assert.equal(guide.get(game,0).recovery,false);assert.equal(guide.stage,0);
});
test('key guidance follows transformed keys and moves to fixed ground after collection',()=>{
  const game=new Puzzle(levels[5]),guide=new HintGuide(plans[5]);for(let i=0;i<10;i++)game.tick(STEP,{axis:0,jump:false});
  runAction(game,{kind:'fold',crease:'A',direction:'right-to-left'});
  assert.equal(guide.get(game,1).marker?.x,392);
  runAction(game,{kind:'walk',x:405});assert.equal(guide.get(game,1).marker?.x,113);
});
test('unfolding before collecting the required key cannot falsely advance the guide',()=>{
  const game=new Puzzle(levels[7]),guide=new HintGuide(plans[7]);
  runAction(game,routes[7][0]);guide.update(game);
  runAction(game,{kind:'unfold'});
  assert.equal(guide.get(game,2).recovery,true);assert.equal(guide.stage,1);
  assert.equal(game.collected.size,0);assert.equal(game.mode,'PLAYING');
});
