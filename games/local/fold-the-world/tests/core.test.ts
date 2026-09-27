import { createHash } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levels } from '../src/levels';
import { Puzzle, FixedClock } from '../src/game';
import { STEP, makeBody, stepBody, MOTION } from '../src/physics';
import { reflectPoint, reflectRect, fixedTops, coveredByPlatform, connections, buildWorld, defineLevel, movingSide, splitPlatforms, overlaps, type Fold, type Entity } from '../src/geometry';
import { runAction } from './routes';
import { TEXT } from '../src/strings';
import { legacyStorageKey, freshProgress, readProgress, recordWin, saveProgress } from '../src/progress';
import { blankPaper, gestureTarget, swipeProgress } from '../src/gestures';
const A: Fold = {crease:'A',direction:'right-to-left'};
const idle = (g: Puzzle, n=90): void => {for(let i=0;i<n;i++)g.tick(STEP,{axis:0,jump:false});};
const settle = (i=0): Puzzle => {const g=new Puzzle(levels[i]);idle(g,10);return g;};
test('100 distinct campaign layouts have safe spawns and at most three fold choices',()=>{
  assert.equal(levels.length,100);
  assert.equal(new Set(levels.map(l=>l.title)).size,100);
  const shapes=levels.map(level=>{
    assert.ok(level.creases.flatMap(c=>c.directions).length<=3,level.title);
    assert.ok(buildWorld(level,null).filter(e=>e.kind==='platform'||e.kind==='spike').every(e=>!overlaps(makeBody(level.spawn),e)),level.title);
    return JSON.stringify({spawn:level.spawn,creases:level.creases.map(c=>[c.x,c.directions]),entities:level.entities.map(e=>[e.kind,e.x,e.y,e.w,e.h]).sort()});
  });
  assert.equal(new Set(shapes).size,100,'A different title is not a new layout');
});
test('migrated best scores still refer to byte-identical legacy geometry',()=>{
  const fingerprints = [[1,1,"7de27d0a52e53326396a3b1ba8103fc8d0e919ad4e29b925e585a608b68c2765"],[3,4,"f925a86d1cc03f72c31670ec742c4a63235bf75b75f9609c6ed28728524407fd"],[4,2,"6a29819816472dc26e8d1b45ebbc0cd2af9e5ed8f81d55003be89a0447f1623b"],[6,3,"8135eb12ad7d39b562ef9edee1220eeda03ad22f493963864e5226b07a5b7c0d"],[7,6,"5d1e2e1e2a7e5909a2c5d3d413ed5244208ac577261ac87f61b208d387037b49"],[8,7,"1a099ced440c01d3137738747b39be9f5cfe66b152a4807d00b816cc2bad976b"],[9,11,"2f301d7a67d87d755df66ad7b05730deaf5708dd1d31f84db9c6a1188b8d7ec7"]];
  for(const [old,current,hash] of fingerprints){
    const level=levels[Number(current)-1];
    const geometry={spawn:level.spawn,creases:level.creases.map(c=>({id:c.id,x:c.x,directions:c.directions})),entities:level.entities.map(e=>({id:e.id,kind:e.kind,x:e.x,y:e.y,w:e.w,h:e.h})).sort((a,b)=>a.id.localeCompare(b.id))};
    assert.equal(createHash('sha256').update(JSON.stringify(geometry)).digest('hex'),hash,`Legacy ${old} → ${current} changed; do not migrate its score`);
  }
});
test('fixed support remains visible through same-height paper, but not through solid ceilings',()=>{
  const world=[
    {id:'fixed',kind:'platform' as const,x:100,y:400,w:160,h:20,moved:false},
    {id:'overlay',kind:'platform' as const,x:80,y:400,w:240,h:20,moved:true},
    {id:'wall',kind:'platform' as const,x:150,y:330,w:30,h:80,moved:true},
  ];
  assert.deepEqual(fixedTops(world),[{x:100,y:400,w:50},{x:180,y:400,w:80}]);
  assert.ok(coveredByPlatform({x:155,y:350,w:16,h:22},world));
  assert.ok(!coveredByPlatform({x:175,y:350,w:16,h:22},world),'A partly exposed target can still be collected');
  const pieces=[{...world[0],x:300,y:400,w:50,h:100},{...world[0],x:350,y:400,w:50,h:100}];
  const key={x:344,y:430,w:16,h:22};
  assert.ok(coveredByPlatform(key,pieces),'Crease-split platform union still covers the whole target');
  assert.ok(!coveredByPlatform(key,[pieces[0],{...pieces[1],x:352,w:48}]),'A real gap is not a fully covered target');
});
test('v2 validates 100-level saves, rejects malformed data, and keeps actual best results',()=>{
  const read=(raw:unknown)=>readProgress({getItem:k=>k===TEXT.storageKey?JSON.stringify(raw):null});
  assert.deepEqual(read(null),freshProgress());assert.deepEqual(read([]),freshProgress());
  assert.deepEqual(readProgress({getItem:()=>'{oops'}),freshProgress());
  assert.deepEqual(readProgress({getItem:()=>{throw Error('denied');}}),freshProgress());
  assert.deepEqual(read({unlocked:999,best:{1:3,2:-1,99:2,101:1,'01':1},muted:true}),{unlocked:100,best:{1:3,99:2},muted:true});
  const progress=freshProgress();recordWin(progress,0,2);recordWin(progress,0,3);recordWin(progress,0,1);
  assert.equal(progress.best['1'],1);assert.equal(progress.unlocked,2);
  recordWin(progress,99,4);assert.equal(progress.unlocked,100);assert.equal(progress.best['100'],4);
  assert.equal(saveProgress({setItem:()=>{throw Error('denied');}},progress),false);
});
test('legacy migration preserves v1 and carries best scores only for identical puzzles',()=>{
  const migrate=(raw:unknown)=>readProgress({getItem:k=>k===legacyStorageKey?JSON.stringify(raw):null});
  assert.deepEqual(migrate({unlocked:1,best:{3:2,9:3},muted:true}),{unlocked:12,best:{4:2,11:3},muted:true});
  for(const [old,unlocked] of [[10,16],[11,13],[12,18],[13,21],[14,15],[15,25],[16,26]])assert.deepEqual(migrate({unlocked:1,best:{[old]:4}}),{unlocked,best:{},muted:false});
  assert.deepEqual(migrate({unlocked:16}),{unlocked:16,best:{},muted:false});
  assert.deepEqual(migrate({unlocked:2,best:{2:1}}),{unlocked:3,best:{},muted:false});
  assert.deepEqual(migrate({unlocked:99,best:{99:1,'03':1}}),freshProgress());
  const values:Record<string,string>={[legacyStorageKey]:JSON.stringify({unlocked:16,best:{16:4},muted:true})};
  const original=values[legacyStorageKey];let migrations=0;
  const storage={getItem:(k:string)=>values[k]??null,setItem:(k:string,v:string)=>{values[k]=v;}};
  const first=readProgress(storage,p=>{migrations++;assert.ok(saveProgress(storage,p));});
  assert.deepEqual(readProgress(storage,()=>{migrations++;}),first);
  assert.equal(migrations,1);assert.equal(values[legacyStorageKey],original);
  values[TEXT.storageKey]=JSON.stringify(freshProgress());
  assert.deepEqual(readProgress(storage),freshProgress(),'A valid v2 save always takes priority');
  const recovered=readProgress({getItem:k=>k===legacyStorageKey?original:null},p=>assert.equal(saveProgress({setItem:()=>{throw Error('full');}},p),false));
  assert.equal(recovered.unlocked,26,'Write failure must not discard the migrated session');
});
test('paper swipes infer only allowed sides and prefer the chosen crease',()=>{
  assert.deepEqual(gestureTarget(levels[0],A,null,900,-80,3),{target:A,sign:-1});
  assert.equal(gestureTarget(levels[0],A,null,900,80,0),null);
  assert.equal(gestureTarget(levels[0],A,null,300,-80,0),null);
  assert.equal(gestureTarget(levels[0],A,null,900,-9,0),null);
  assert.equal(gestureTarget(levels[0],A,null,900,-40,80),null);
  const B:Fold={crease:'B',direction:'left-to-right'};
  assert.deepEqual(gestureTarget(levels[15],A,null,300,80,0),{target:B,sign:1});
  const selected:Fold={crease:'B',direction:'right-to-left'};
  assert.deepEqual(gestureTarget(levels[3],selected,null,1000,-80,0),{target:selected,sign:-1});
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
test('a rejected opposite-side gesture retains its actual collision projection',()=>{
  const level=defineLevel({title:'投影回归',hint:'检查手势方向',spawn:{x:700,y:472},creases:[{id:'A',x:600,directions:['right-to-left']},{id:'B',x:400,directions:['left-to-right']}],entities:[{id:'floor',kind:'platform',x:80,y:500,w:1040,h:20},{id:'wall',kind:'platform',x:80,y:440,w:40,h:60},{id:'exit',kind:'exit',x:1000,y:462,w:26,h:38}]});
  const game=new Puzzle(level);idle(game,10);
  const intent=gestureTarget(level,A,null,200,85,0)!;
  assert.equal(game.beginPreview(intent.target),false);assert.equal(game.message,TEXT.blocked);
  assert.deepEqual(game.blockedTarget,{crease:'B',direction:'left-to-right'});
  assert.ok(buildWorld(level,game.blockedTarget).some(e=>e.kind==='platform'&&overlaps(e,game.body)));
  game.restart();assert.equal(game.blockedTarget,undefined);
});
test('unfold needs fixed ground and restores world without teleporting',()=>{
  const g=settle();runAction(g,{kind:'fold',...A});runAction(g,{kind:'walk',x:350});idle(g,20);
  assert.ok(!g.request(null));assert.equal(g.message,TEXT.fixed);assert.equal(g.folds,1);
  runAction(g,{kind:'walk',x:200});idle(g,20);const before={...g.body};assert.ok(g.request(null));idle(g);
  assert.equal(g.fold,null);assert.equal(g.body.x,before.x);assert.equal(g.body.y,before.y);
  assert.deepEqual(g.world,buildWorld(g.level,null));assert.equal(g.unfolds,1);
});
test('collected keys survive unfold/refold; restart restores original state',()=>{
  const g=settle(2);runAction(g,{kind:'fold',...A});runAction(g,{kind:'walk',x:405});runAction(g,{kind:'walk',x:170});
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
    const g=hazard==='spike'?new Puzzle(defineLevel({...levels[0],entities:[...levels[0].entities,{id:'test-spike',kind:'spike',x:240,y:412,w:24,h:18}]})):settle();idle(g,10);
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
