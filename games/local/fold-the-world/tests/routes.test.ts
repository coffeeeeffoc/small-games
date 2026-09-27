import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levels } from '../src/levels';
import { Puzzle } from '../src/game';
import { routes, alternates, runAction } from './routes';
import { HintGuide, plans } from '../src/hints';
import { STEP } from '../src/physics';
test('all campaign levels have a route and three-tier reference plan',()=>{
  assert.equal(routes.length,100);assert.equal(plans.length,100);
  for(const [index,plan] of plans.entries())for(const phase of plan.phases){
    assert.ok(phase.clue.length>5&&phase.action.length>5&&phase.route.length>5,`Missing hint in ${index+1}`);
    for(const id of phase.keys)assert.ok(levels[index].entities.some(e=>e.kind==='key'&&e.id===id),`Unknown key ${id} in ${index+1}`);
  }
});
test('the first hint can mark a staging point away from spawn',()=>{
  const game=new Puzzle(levels[4]),guide=new HintGuide(plans[4]);
  assert.deepEqual(guide.get(game,1).marker,plans[4].phases[0].point);
  assert.notDeepEqual(guide.get(game,1).marker,{x:game.level.spawn.x+11,y:game.level.spawn.y+28});
});
test('the shared chapter-one stair tolerates a continuous 30-pixel takeoff range',()=>{
  for(let x=533;x<=563;x++){
    const game=new Puzzle(levels[24]);
    for(const action of routes[24].slice(0,5))runAction(game,action);
    runAction(game,{kind:'walk',x});runAction(game,{kind:'jump',x:465});
    assert.equal(game.body.y,382,`Takeoff ${x}`);assert.equal(game.deaths,0);
  }
});
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
  const game=new Puzzle(levels[3]),guide=new HintGuide(plans[3]);for(let i=0;i<10;i++)game.tick(STEP,{axis:0,jump:false});
  const first=guide.get(game,0);assert.equal(first.marker,null);
  game.beginPreview({crease:'B',direction:'right-to-left'});game.preview=.8;game.cancelPreview();assert.equal(guide.get(game,2).stage,0);
  assert.ok(!game.request({crease:'missing',direction:'right-to-left'}));assert.equal(guide.get(game,2).stage,0);
  runAction(game,{kind:'fold',crease:'A',direction:'right-to-left'});assert.ok(guide.get(game,0).recovery);
  game.restart();assert.equal(guide.get(game,0).recovery,false);assert.equal(guide.stage,0);
});
test('key guidance follows transformed keys and moves to fixed ground after collection',()=>{
  const game=new Puzzle(levels[2]),guide=new HintGuide(plans[2]);for(let i=0;i<10;i++)game.tick(STEP,{axis:0,jump:false});
  runAction(game,{kind:'fold',crease:'A',direction:'right-to-left'});
  assert.equal(guide.get(game,1).marker?.x,392);
  runAction(game,{kind:'walk',x:405});assert.equal(guide.get(game,1).marker?.x,113);
});
test('unfolding before collecting the required key cannot falsely advance the guide',()=>{
  const game=new Puzzle(levels[6]),guide=new HintGuide(plans[6]);
  runAction(game,routes[6][0]);guide.update(game);
  runAction(game,{kind:'unfold'});
  assert.equal(guide.get(game,2).recovery,true);assert.equal(guide.stage,1);
  assert.equal(game.collected.size,0);assert.equal(game.mode,'PLAYING');
});
for(const alternate of alternates)test(`Alternate ${alternate.level}: ${alternate.name}`,()=>{
  const level=levels[alternate.level-1],game=new Puzzle(level),guide=new HintGuide(plans[alternate.level-1]);
  for(let i=0;i<10;i++)game.tick(STEP,{axis:0,jump:false});
  for(const action of alternate.actions){
    runAction(game,action);
    const before=JSON.stringify(game);
    guide.get(game,2);
    assert.equal(JSON.stringify(game),before);
  }
  assert.equal(game.mode,'COMPLETED');assert.equal(game.deaths,0);
  assert.equal(game.collected.size,level.entities.filter(e=>e.kind==='key').length);
});
