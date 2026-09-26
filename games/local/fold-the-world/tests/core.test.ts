import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levels } from '../src/levels';
import { Puzzle, FixedClock } from '../src/game';
import { STEP, makeBody, stepBody, MOTION } from '../src/physics';
import { reflectPoint, reflectRect, connections, buildWorld, defineLevel, movingSide, splitPlatforms, overlaps, type Fold, type Entity } from '../src/geometry';
import { runAction } from './routes';
import { TEXT } from '../src/strings';
import { freshProgress, readProgress, recordWin, saveProgress } from '../src/progress';
import { blankPaper, gestureTarget, swipeProgress } from '../src/gestures';
const A: Fold = {crease:'A',direction:'right-to-left'};
const idle = (g: Puzzle, n=90): void => {for(let i=0;i<n;i++)g.tick(STEP,{axis:0,jump:false});};
const settle = (i=0): Puzzle => {const g=new Puzzle(levels[i]);idle(g,10);return g;};
test('paper swipes infer only allowed sides and prefer the chosen crease',()=>{
  assert.deepEqual(gestureTarget(levels[0],A,null,900,-80,3),{target:A,sign:-1});
  assert.equal(gestureTarget(levels[0],A,null,900,80,0),null);
  assert.equal(gestureTarget(levels[0],A,null,300,-80,0),null);
  assert.equal(gestureTarget(levels[0],A,null,900,-9,0),null);
  assert.equal(gestureTarget(levels[0],A,null,900,-40,80),null);
  const B:Fold={crease:'B',direction:'left-to-right'};
  assert.deepEqual(gestureTarget(levels[9],A,null,300,80,0),{target:B,sign:1});
  const selected:Fold={crease:'B',direction:'right-to-left'};
  assert.deepEqual(gestureTarget(levels[2],selected,null,1000,-80,0),{target:selected,sign:-1});
  for(const sign of [-1,1])assert.deepEqual(gestureTarget(levels[0],A,A,300,sign*80,0),{target:null,sign});
});
test('blank-paper input excludes objects; a 60 CSS pixel swipe commits at any scale',()=>{
  const g=settle();assert.ok(blankPaper(900,300,g.world,g.body));
  assert.ok(!blankPaper(g.body.x,g.body.y,g.world,g.body));
  for(const r of g.world)assert.ok(!blankPaper(r.x+r.w/2,r.y+r.h/2,g.world,g.body));
  for(const scale of [.4,1,1.6])assert.equal(swipeProgress((-60/scale)*scale,-1),.5);
  assert.equal(swipeProgress(-30,-1),.25);assert.equal(swipeProgress(0,-1),0);assert.equal(swipeProgress(70,-1),0);assert.equal(swipeProgress(-200,-1),1);
  const before={...g.body};const intent=gestureTarget(g.level,A,null,900,-80,0)!;
  assert.ok(g.beginPreview(intent.target));g.preview=swipeProgress(-80,intent.sign);g.releasePreview();idle(g);
  assert.equal(g.folds,1);assert.ok(g.fold);assert.deepEqual(g.body,before);
  assert.ok(g.beginPreview(gestureTarget(g.level,A,g.fold,300,80,0)!.target));g.preview=swipeProgress(80,1);g.releasePreview();idle(g);
  assert.equal(g.fold,null);assert.equal(g.unfolds,1);assert.deepEqual(g.body,before);
});
test('point and rectangle reflection use the far edge', () => {
  assert.equal(reflectPoint(reflectPoint(827,600),600),827);
  assert.deepEqual(reflectRect({x:800,y:400,w:100,h:20},600),{x:300,y:400,w:100,h:20});
});
test('reflection preserves dimensions and direction boundaries',()=>{
  for(const c of [300,600,700]) for(const x of [c-100,c,c+80]) {
    const r={x,y:40,w:50,h:20};assert.deepEqual(reflectRect(reflectRect(r,c),c),r);
  }
  assert.ok(movingSide({x:600,y:0,w:20,h:20},600,'right-to-left'));
  assert.ok(movingSide({x:580,y:0,w:20,h:20},600,'left-to-right'));
  assert.ok(!movingSide({x:590,y:0,w:20,h:20},600,'left-to-right'));
  assert.ok(!movingSide({x:600,y:0,w:20,h:20},600,'left-to-right'));
});
test('split solids, reject crossing keys and out-of-bounds fold combinations',()=>{
  const c=levels[0].creases;
  const platform:Entity={id:'p',kind:'platform',x:580,y:450,w:40,h:20};
  assert.deepEqual(splitPlatforms([platform],c).map(e=>[e.x,e.w]),[[580,20],[600,20]]);
  assert.throws(()=>splitPlatforms([{...platform,kind:'key'}],c),/crosses/);
  assert.throws(()=>defineLevel({...levels[0],creases:[{id:'A',x:300,directions:['right-to-left']}]}),/Out of paper/);
  assert.throws(()=>defineLevel({...levels[0],entities:[...levels[0].entities,{...platform,w:-1}]}));
  assert.throws(()=>buildWorld(levels[0],{crease:'missing',direction:'right-to-left'}));
  assert.ok(Object.isFrozen(levels[0].entities));
});
test('preview freezes simulation; cancellation and springback preserve world/counts',()=>{
  const g=settle(), world=JSON.stringify(g.world), body={...g.body};
  assert.ok(g.beginPreview(A));g.preview=.8;
  for(let i=0;i<30;i++)g.tick(STEP,{axis:1,jump:true});
  assert.deepEqual(g.body,body);g.cancelPreview();
  assert.equal(JSON.stringify(g.world),world);assert.equal(g.folds,0);assert.equal(g.mode,'PLAYING');
  assert.ok(g.beginPreview(A));g.preview=.2;g.releasePreview();idle(g);assert.equal(g.fold,null);assert.equal(g.folds,0);
});
test('atomic animation commit; duplicate/nested requests refused',()=>{
  const g=settle();assert.ok(g.request(A));assert.ok(!g.request(A));
  idle(g,15);assert.equal(g.folds,0);assert.equal(g.world.find(e=>e.id==='bridge')?.x,720);
  idle(g);assert.equal(g.folds,1);assert.ok(!g.request(A));assert.equal(g.message,TEXT.nested);
});
test('airborne, moving, wrong-side and safety-band operations are rejected',()=>{
  const g=settle();g.tick(STEP,{axis:1,jump:true});assert.ok(!g.request(A));assert.equal(g.folds,0);
  const moving=settle();moving.tick(STEP,{axis:1,jump:false});assert.ok(!moving.request(A));
  const wrong=defineLevel({...levels[0],spawn:{x:800,y:402}}), onWrong=new Puzzle(wrong);idle(onWrong,10);assert.ok(!onWrong.request(A));assert.equal(onWrong.message,TEXT.side);
  const near=defineLevel({...levels[0],spawn:{x:570,y:402},entities:[{id:'home',kind:'platform',x:540,y:430,w:60,h:20},levels[0].entities[2]]});
  const g2=new Puzzle(near);idle(g2,10);assert.ok(!g2.request(A));assert.equal(g2.folds,0);
});
test('target solid or spike on player rejects without repositioning',()=>{
  for(const kind of ['platform','spike'] as const) {
    const l=defineLevel({...levels[0],entities:[...levels[0].entities,{id:'crusher',x:1040,y:400,w:20,h:30,kind}]});
    const g=new Puzzle(l);idle(g,10);const before={...g.body};
    assert.ok(!g.request(A));assert.equal(g.message,TEXT.blocked);assert.deepEqual(g.body,before);assert.equal(g.folds,0);
  }
});
test('unfold needs fixed ground and restores world without teleporting',()=>{
  const g=settle();runAction(g,{kind:'fold',...A});runAction(g,{kind:'walk',x:350});idle(g,20);
  assert.ok(!g.request(null));assert.equal(g.message,TEXT.fixed);assert.equal(g.folds,1);
  runAction(g,{kind:'walk',x:200});idle(g,20);const before={...g.body};assert.ok(g.request(null));idle(g);
  assert.equal(g.fold,null);assert.equal(g.body.x,before.x);assert.equal(g.body.y,before.y);
  assert.deepEqual(g.world,buildWorld(g.level,null));assert.equal(g.unfolds,1);
});
test('collected keys survive unfold/refold; restart restores original state',()=>{
  const g=settle(5);runAction(g,{kind:'fold',...A});runAction(g,{kind:'walk',x:405});runAction(g,{kind:'walk',x:170});
  assert.equal(g.collected.size,1);runAction(g,{kind:'unfold'});assert.ok(!g.world.some(e=>e.kind==='key'));
  runAction(g,{kind:'fold',...A});assert.ok(!g.world.some(e=>e.kind==='key'));
  g.restart();assert.equal(g.fold,null);assert.equal(g.collected.size,0);assert.equal(g.folds,0);assert.equal(g.body.x,160);assert.ok(g.world.some(e=>e.kind==='key'));
});
test('50 cycles have no drift or entity growth',()=>{
  const g=settle();const original=JSON.stringify(g.level);const count=g.world.length;
  for(let i=0;i<50;i++){assert.ok(g.request(A));idle(g);assert.equal(g.world.length,count);assert.ok(g.request(null));idle(g);assert.equal(g.world.length,count);assert.deepEqual(g.world,buildWorld(g.level,null));}
  assert.equal(JSON.stringify(g.level),original);assert.equal(g.folds,50);assert.equal(g.unfolds,50);assert.equal(g.body.x,140);
});
test('overlapping collision union has stable seams and is order independent',()=>{
  const solids=[{x:0,y:400,w:240,h:30},{x:120,y:400,w:240,h:30},{x:360,y:400,w:100,h:30}];
  const a=makeBody({x:100,y:300}),b=makeBody({x:100,y:300});
  for(let i=0;i<200;i++){stepBody(a,solids,{axis:1,jump:false});stepBody(b,[...solids].reverse(),{axis:1,jump:false});}
  assert.deepEqual(a,b);assert.equal(a.y,372);assert.ok(a.grounded);assert.ok(solids.every(s=>!overlaps(a,s)));
});
test('adjacent fixed fragments together support a fold; old moving location is empty',()=>{
  const l=defineLevel({...levels[0],spawn:{x:150,y:402},entities:[{id:'a',kind:'platform',x:80,y:430,w:80,h:20},{id:'b',kind:'platform',x:160,y:430,w:120,h:20},...levels[0].entities.slice(1)]});
  const g=new Puzzle(l);idle(g,10);assert.ok(g.request(A));idle(g);
  const b=makeBody({x:800,y:402});for(let i=0;i<30;i++)stepBody(b,g.world.filter(e=>e.kind==='platform'),{axis:0,jump:false});
  assert.ok(b.y>440);assert.ok(!b.grounded);
  const world=JSON.stringify(g.world);assert.ok(g.beginPreview(null));g.preview=.75;g.cancelPreview();assert.equal(JSON.stringify(g.world),world);assert.equal(g.folds,1);assert.equal(g.unfolds,0);
});
test('walls cannot give infinite jumps; ceilings stop rising motion',()=>{
  const wall=[{x:200,y:0,w:30,h:600}];const b=makeBody({x:178,y:200});
  for(let i=0;i<20;i++)stepBody(b,wall,{axis:1,jump:true});assert.ok(b.vy>0);assert.ok(!b.grounded);assert.equal(b.x,178);
  const head=makeBody({x:100,y:372});head.grounded=true;
  const room=[{x:0,y:400,w:300,h:20},{x:0,y:320,w:300,h:20}];
  for(let i=0;i<30;i++){stepBody(head,room,{axis:0,jump:i===0});assert.ok(head.y>=340);}
});
test('jump buffer and finite coyote window',()=>{
  const floor=[{x:0,y:400,w:300,h:20}];const b=makeBody({x:100,y:370});b.vy=100;
  stepBody(b,floor,{axis:0,jump:true});stepBody(b,floor,{axis:0,jump:false});stepBody(b,floor,{axis:0,jump:false});assert.ok(b.vy<0);
  const c=makeBody({x:100,y:200});c.coyote=MOTION.coyote;stepBody(c,[],{axis:0,jump:true});assert.ok(c.vy<0);
  const d=makeBody({x:100,y:200});d.coyote=MOTION.coyote;for(let i=0;i<20;i++)stepBody(d,[],{axis:0,jump:false});stepBody(d,[],{axis:0,jump:true});assert.ok(d.vy>0);
});
test('measured full-speed/coyote jump cannot span a 200px critical gap',()=>{
  const b=makeBody({x:198,y:402});b.grounded=true;b.vx=MOTION.speed;
  const floor=[{x:0,y:430,w:220,h:20}];let off=0,launched=false,landingX=0;
  for(let i=0;i<160;i++) {
    if(!b.grounded&&!launched)off++;
    const jump=off===9;if(jump)launched=true;stepBody(b,floor,{axis:1,jump});
    if(launched&&b.vy>0&&b.y+b.h>=430){landingX=b.x+b.w;break;}
  }
  assert.ok(landingX>300);assert.ok(landingX-220<160,`max reach ${landingX-220}`);
});
test('falling and a real spike collision enter DEAD then quickly restart',()=>{
  for(const hazard of ['fall','spike']) {
    const g=settle(hazard==='spike'?4:0);
    if(hazard==='spike'){g.request(A);idle(g);}
    for(let i=0;i<500&&g.mode!=='DEAD';i++)g.tick(STEP,{axis:1,jump:false});
    assert.equal(g.mode,'DEAD');assert.equal(g.deaths,1);idle(g,50);
    assert.equal(g.mode,'PLAYING');assert.equal(g.body.x,g.level.spawn.x);assert.equal(g.fold,null);assert.equal(g.folds,0);
  }
});
test('fixed clock discards huge frames; pause freezes folding animation',()=>{
  const c=new FixedClock();let steps=0;assert.equal(c.advance(1000,()=>steps++),0);assert.equal(c.advance(NaN,()=>steps++),0);
  c.advance(100,()=>steps++);assert.equal(steps,12);c.reset();c.advance(4,()=>steps++);assert.equal(steps,12);
  const g=settle();g.request(A);idle(g,15);g.pause();const p=g.preview;idle(g,200);assert.equal(g.preview,p);assert.equal(g.folds,0);g.resume();idle(g);assert.equal(g.folds,1);
});
test('corrupt/blocked storage degrades safely; best scores and unlocks persist',()=>{
  assert.deepEqual(readProgress({getItem:()=>'{oops'}),freshProgress());
  assert.deepEqual(readProgress({getItem:()=>JSON.stringify({unlocked:99,best:{'1':3,'2':-1,'99':2},muted:true})}),{unlocked:levels.length,best:{'1':3},muted:true});
  const old=readProgress({getItem:()=>JSON.stringify({unlocked:10,best:{'1':1,'10':2},muted:true})});
  assert.equal(old.unlocked,11);assert.equal(old.best['10'],2);assert.equal(old.muted,true);
  const p=freshProgress();recordWin(p,0,2);recordWin(p,0,3);recordWin(p,0,1);assert.equal(p.best['1'],1);assert.equal(p.unlocked,2);
  assert.equal(saveProgress({setItem:()=>{throw Error('denied');}},p),false);
});
test('First Fold: real input crosses the new collision bridge and reaches the exit', () => {
  const game = new Puzzle(levels[0]);
  for(let i=0;i<30;i++) game.tick(STEP,{axis:0,jump:false});
  assert.equal(game.request({crease:'A',direction:'right-to-left'}),true);
  for(let i=0;i<80;i++) game.tick(STEP,{axis:0,jump:false});
  assert.equal(game.folds,1);
  assert.ok(connections(game.world).length);
  assert.ok(!game.world.some(e=>e.kind==='platform' && e.x===720));
  for(let i=0;i<250 && game.mode!=='COMPLETED';i++) game.tick(STEP,{axis:1,jump:false});
  assert.equal(game.mode,'COMPLETED');
  assert.ok(game.body.x>400); assert.equal(game.body.y,402);
});
