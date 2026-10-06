import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../levels.js', import.meta.url), 'utf8');
const data = await readFile(new URL('../levels-data.js', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../game.js', import.meta.url), 'utf8');

test('the actual share handler removes URL credentials, private query and hash while retaining Pages paths', async () => {
  const copies=[],elements={share:{},'share-status':{},'share-link':{}};
  const context=vm.createContext({URL,location:new URL('https://user:password@example.org//small-games/wulong/?private=secret#room'),s:{id:21,won:false},LEVEL_DATA:{21:{title:'风扇只吹背后的风'}},$:id=>elements[id],navigator:{clipboard:{writeText:async url=>copies.push(url)}}});
  const handler=appSource.split('\n').find(line=>line.includes('async function shareChallenge()'));
  assert.ok(handler);
  vm.runInContext(handler,context);
  await vm.runInContext('shareChallenge()',context);
  assert.deepEqual(copies,['https://example.org//small-games/wulong/?challenge=21']);
  assert.equal(elements.share.disabled,false);
});

// Exercise the original level rules without DOM, rendering, a server or a browser.
function game(id) {
  const levels = {}, hotspots = new Map();
  let state;
  const context = vm.createContext({
    window: {},
    W: {
      ...Object.fromEntries(['rect','line','ellipse','text','poly','face','actor','bird','sign','handle','door','background'].map(name=>[name,()=>{}])),
      C: new Proxy({}, {get:()=> '#abcdef'}),
      ctx: new Proxy({}, {get:()=>()=>{}}),
      hit: (id,label,x,y,w,h,click,drag,up)=>hotspots.set(id,{label,x,y,w,h,click,drag,up}),
      near: (x,range=65)=>Math.abs(state.p.x-x)<range,
      add: (key, level) => { levels[key] = level; },
      clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
      say() {}, tone() {},
      win: () => { state.won = true; },
    },
  });
  vm.runInContext(data, context);
  vm.runInContext(source, context);
  state = { id, t: 0, won: false, p: { x: 65, y: 436, vx: 0, vy: 0, dir: 1, grounded: true }, ...levels[id].init() };
  return {
    state, levels, data: context.window.LEVEL_DATA, scenes: context.window.WULONG_SCENES,
    draw(){hotspots.clear();levels[id].draw(state);return hotspots;},
    tick(seconds) {
      for (let i = 0; i < Math.round(seconds * 60) && !state.won; i++) {
        state.t += 1 / 60;
        levels[id].update?.(state, 1 / 60);
      }
    },
  };
}

test('100 levels have complete content, independent reset state and no immediate win', () => {
  const { levels, data } = game(1);
  assert.deepEqual(Object.keys(levels), Array.from({ length: 100 }, (_, i) => String(i + 1)));
  assert.deepEqual(Object.keys(data), Object.keys(levels));
  for (const id of Object.keys(levels)) {
    for (const field of ['title', 'goal', 'intro', 'joke', 'record']) assert.ok(data[id][field]?.trim(), `L${id} ${field}`);
    assert.equal(data[id].hints.length, 3);
    assert.ok(data[id].hints.every(hint => hint.trim()));
    const level = levels[id], first = level.init(), second = level.init();
    assert.deepEqual(first, second);
    for (const key of Object.keys(first)) {
      if (first[key] && typeof first[key] === 'object') assert.notEqual(first[key], second[key], `L${id} shared ${key}`);
    }
    const run = game(id);
    run.tick(0.1);
    assert.equal(run.state.won, false, `L${id} must require player action`);
  }
});

test('L01: chasing repels the door; facing away opens it; entering completes', () => {
  const run = game(1), s = run.state;
  s.p.x = 220;
  run.tick(1);
  assert.ok(s.doorX > 338);
  assert.equal(s.opened, false);
  s.p.dir = -1;
  run.tick(4);
  assert.equal(s.opened, true);
  assert.equal(s.won, false);
  s.p.x = s.doorX;
  run.tick(0.1);
  assert.equal(s.won, true);
});

test('L02: exposed lift retreats; curtain permits arrival, then player must exit', () => {
  const run = game(2), s = run.state;
  s.liftMode = 'up';
  run.tick(2);
  assert.equal(s.liftMode, 'idle');
  assert.equal(s.liftY, 436);
  assert.equal(s.won, false);
  s.curtain = 1;
  s.liftMode = 'up';
  run.tick(3);
  assert.equal(s.liftMode, 'arrived');
  assert.equal(s.p.y, 252);
  assert.equal(s.manual, false);
  assert.equal(s.locked, false);
  assert.equal(s.won, false);
  s.p.x = 370;
  run.tick(0.1);
  assert.equal(s.won, true);
});

test('L08: meal cannot cross the current wall; expanding the room permits delivery approach', () => {
  const run = game(8), s = run.state;
  s.meal = true;
  s.p.x = 400;
  run.tick(0.1);
  assert.equal(s.p.x, 215);
  assert.equal(s.blocked, true);
  s.wall = 454;
  s.p.x = 400;
  run.tick(0.1);
  assert.equal(s.p.x, 400);
  assert.equal(s.inside, true);
  assert.equal(s.won, false);
});

test('L19: applause loops until a bird turns, then the curtain ends the show', () => {
  const run = game(19), s = run.state;
  run.tick(5);
  assert.ok(s.heard >= 5);
  assert.equal(s.curtain, 0);
  assert.equal(s.won, false);
  s.facing[1] = 1;
  run.tick(5);
  assert.equal(s.echoes.length, 0);
  assert.equal(s.curtain, 1);
  assert.equal(s.won, true);
});

test('L15: cancelling a map drag restores position and releases movement', () => {
  const { levels, state: s } = game(15);
  Object.assign(s, { mapDrag: true, manual: true, locked: true, origin: { x: 130, y: 436 }, mapPreview: { valid: true } });
  s.p.x = 400;
  levels[15].cancel(s);
  assert.equal(s.p.x, 130);
  assert.equal(s.p.y, 436);
  for (const field of ['mapDrag', 'manual', 'locked', 'won']) assert.equal(s[field], false);
  assert.equal(s.mapPreview, null);
});

test('L20: falling recovers; folding alone does not win; walking home does', () => {
  const run = game(20), s = run.state;
  s.p.y = 500;
  run.tick(0.1);
  assert.equal(s.fallen, 1);
  assert.equal(s.p.x, 113);
  assert.equal(s.p.y, 436);
  s.fold = 1;
  run.tick(0.1);
  assert.equal(s.won, false);
  assert.ok(run.levels[20].platforms(s).some(p => p.x === 181 && p.y === 436));
  s.p.x = 265;
  run.tick(0.1);
  assert.equal(s.won, true);
});

test('L21: powered fan blowing away cannot dry the sheet; turning around clears the path but still requires walking', () => {
  const run=game(21),s=run.state;
  run.draw().get('fan-power').click();run.tick(3);assert.equal(s.dry,0);assert.equal(s.won,false);
  run.draw().get('fan-face').click();run.tick(2);assert.equal(s.dry,1);assert.equal(s.won,false);
  assert.equal(run.levels[21].platforms(s).length,0);s.p.x=430;run.tick(.1);assert.equal(s.won,true);
});
test('L22: only the dirty word enters the washer; cleaning, collecting nearby, and leaving are distinct steps', () => {
  const run=game(22),s=run.state;
  run.draw().get('word-wash').click();run.tick(2);assert.equal(s.clean,false);
  let word=run.draw().get('dirty-word');word.drag(250,350);word.up();assert.equal(s.wordIn,false);
  word=run.draw().get('dirty-word');word.drag(112,340);word.up();assert.equal(s.wordIn,true);assert.equal(s.clean,false);
  run.draw().get('word-wash').click();run.tick(1.4);assert.equal(s.clean,true);assert.equal(s.won,false);
  run.draw().get('clean-shirt').click();assert.equal(s.collected,false);s.p.x=310;run.draw().get('clean-shirt').click();assert.equal(s.collected,true);
  s.p.x=440;run.tick(.1);assert.equal(s.won,true);
});
test('L23: short speech cannot be anchored; long speech plus the period creates a continuous bridge', () => {
  const run=game(23),s=run.state;
  let dot=run.draw().get('bridge-period');dot.drag(330,407);dot.up();assert.equal(s.anchored,false);
  run.draw().get('bridge-phrase-2').click();s.p.x=425;run.tick(.1);assert.equal(s.won,false);s.p.x=65;
  dot=run.draw().get('bridge-period');dot.drag(330,407);dot.up();assert.equal(s.anchored,true);
  assert.ok(run.levels[23].platforms(s).some(p=>p.x===185&&p.x+p.w>=340));assert.equal(s.won,false);
  s.p.x=425;run.tick(.1);assert.equal(s.won,true);
});
test('L24: cabinet must open and trophy must reach the viewer slot; cancelled and wrong drops restore it', () => {
  const run=game(24),s=run.state;assert.equal(run.draw().has('viewer-trophy'),false);
  run.draw().get('award-cabinet').click();let trophy=run.draw().get('viewer-trophy');trophy.drag(110,315);trophy.up();assert.equal(s.awarded,false);
  trophy=run.draw().get('viewer-trophy');trophy.drag(240,80);run.levels[24].cancel(s);assert.equal(s.trophyY,325);assert.equal(s.awarded,false);
  trophy=run.draw().get('viewer-trophy');trophy.drag(240,20);trophy.up();run.tick(.1);assert.equal(s.won,true);
});

test('L25: heartache is counted on the scale; parking it, weighing nearby, and leaving are separate actions', () => {
  const run=game(25),s=run.state;
  run.draw().get('worry-weigh').click();assert.equal(s.overloaded,false);assert.equal(s.weighed,false);
  s.p.x=223;run.tick(.1);run.draw().get('worry-weigh').click();assert.equal(s.overloaded,true);assert.equal(s.weighed,false);
  let cloud=run.draw().get('worry-cloud');cloud.drag(240,200);cloud.up();assert.equal(s.cloudParked,false);assert.equal(s.cloudX,223);
  cloud=run.draw().get('worry-cloud');cloud.drag(113,190);run.levels[25].cancel(s);assert.equal(s.cloudDrag,false);assert.equal(s.cloudParked,false);assert.equal(s.cloudX,223);
  cloud=run.draw().get('worry-cloud');cloud.drag(113,190);cloud.up();assert.equal(s.cloudParked,true);assert.equal(s.weighed,false);
  s.p.x=65;run.draw().get('worry-weigh').click();assert.equal(s.weighed,false);
  s.p.x=223;run.draw().get('worry-weigh').click();assert.equal(s.weighed,true);assert.equal(run.levels[25].platforms(s).length,0);run.tick(.1);assert.equal(s.won,false);
  s.p.x=430;run.tick(.1);assert.equal(s.won,true);
});

test('L26: picking up a nearby remote and moving away enables channels; the exit remains open while walking back', () => {
  const run=game(26),s=run.state;
  run.draw().get('far-remote').click();assert.equal(s.remoteHeld,false);
  s.p.x=245;run.draw().get('far-remote').click();assert.equal(s.remoteHeld,true);
  run.draw().get('far-remote').click();assert.equal(s.tooClose,true);assert.equal(s.channel,0);
  s.p.x=160;run.draw().get('far-remote').click();assert.equal(s.channel,1);assert.equal(s.won,false);
  run.draw().get('far-remote').click();assert.equal(s.channel,2);run.tick(3);assert.equal(s.won,false);assert.equal(s.channel,2);
  run.draw().get('far-remote').click();assert.equal(s.channel,0);s.p.x=380;run.tick(.1);assert.equal(s.won,false);
  s.p.x=120;run.draw().get('far-remote').click();run.draw().get('far-remote').click();s.p.x=380;run.tick(.1);assert.equal(s.won,true);
});

// Walk on the real floor and obey each scene's solid gate. This is deliberately
// independent of puzzle state, so interaction solutions must remain reachable.
function walk(run, target) {
  const s=run.state,level=run.levels[s.id];
  for(let frame=0;frame<240&&!s.won;frame++) {
    const delta=target-s.p.x;
    if(Math.abs(delta)<2.5) { s.p.x=target;s.p.vx=0;return; }
    const direction=Math.sign(delta),before=s.p.x;
    s.p.vx=direction*145;s.p.dir=direction;s.p.x+=s.p.vx/60;
    for(const q of level.platforms?.(s)||[]) {
      if(q.solid&&s.p.y>q.y+7&&s.p.y-52<q.y+q.h&&s.p.x+12>q.x&&s.p.x-12<q.x+q.w) s.p.x=direction>0?q.x-12:q.x+q.w+12;
    }
    run.tick(1/60);
    if(s.p.x===before) { s.p.vx=0;return; }
  }
  s.p.vx=0;
}

function solveObject(run,step,index,{checkMistakes=true}={}) {
  const s=run.state,q=s.puzzle[index],key=step.key;
  if(step.type==='drag') {
    if(checkMistakes) {
      let zone=run.draw().get(key);zone.drag(350,130);zone.up();
      assert.equal(q.done,false,'wrong socket must not accept an object');
      assert.equal(q.x,step.x-27);assert.equal(q.y,step.y-10);
      zone=run.draw().get(key);zone.drag(step.slotX,step.slotY);run.levels[s.id].cancel(s);
      assert.equal(q.dragging,false);assert.equal(q.done,false,'cancelled placement must not complete');
      assert.equal(q.x,step.x-27);assert.equal(q.y,step.y-10);
    }
    const zone=run.draw().get(key);zone.drag(step.slotX,step.slotY);zone.up();
  } else if(step.type==='turn') {
    for(let i=0;i<step.answer;i++) {
      run.draw().get(key).click();
      if(i+1<step.answer)assert.equal(q.done,false,'intermediate rotation must not complete');
    }
  } else if(step.type==='sequence') {
    if(checkMistakes) {
      const wrong=(step.order[0]+1)%step.notes.length;
      run.draw().get(key+'-note-'+wrong).click();
      assert.equal(q.done,false);assert.equal(q.cursor,0,'wrong note resets the visible sequence');
    }
    for(const note of step.order)run.draw().get(key+'-note-'+note).click();
  } else if(step.type==='collect'||step.type==='use'||step.type==='remote') {
    if(checkMistakes) {
      walk(run,step.type==='remote'?step.x:step.x<180?360:22);
      run.draw().get(key).click();
      assert.equal(q.done,false,step.type==='remote'?'near control is not remote control':'far player cannot reach the object');
    }
    walk(run,step.type==='remote'?step.x<190?365:22:step.x);
    assert.ok(step.type==='remote'?Math.abs(s.p.x-step.x)>=step.distance:Math.abs(s.p.x-step.x)<48,'required operating position is reachable');
    run.draw().get(key).click();
  } else if(step.type==='observe') {
    walk(run,step.x);s.p.dir=-step.direction;s.p.vx=0;run.tick(step.seconds+.1);
    assert.equal(q.done,false,'watching the observer cannot complete a back-facing request');
    s.p.dir=step.direction;s.p.vx=145*step.direction;run.tick(step.seconds+.1);
    assert.equal(q.done,false,'moving cannot complete a settled observation');
    s.p.vx=0;run.tick(step.seconds+.1);
  } else if(step.type==='wait') {
    run.tick(step.seconds+.1);
  }
  assert.equal(q.done,true,`${s.id} ${step.label} must be completable with its actual hotspot`);
}

const expanded=game(27).scenes;
for(const [id,scene] of Object.entries(expanded)) {
  test(`L${id}: ${scene.title} — causal objects, wrong actions, cancellation, reachable exit`,()=>{
    const run=game(Number(id)),s=run.state;
    walk(run,430);
    assert.equal(s.won,false);assert.equal(s.p.x,371,'closed gate must physically stop the player');
    // Dependencies cannot be bypassed by directly tapping a later prop.
    scene.steps.forEach((step,index)=>{
      if(!step.needs.length)return;
      if(step.type==='drag') {const z=run.draw().get(step.key);z.drag(step.slotX,step.slotY);z.up();}
      else if(step.type==='turn'||step.type==='collect'||step.type==='use'||step.type==='remote') {
        walk(run,step.type==='remote'?step.x<190?365:22:step.x);run.draw().get(step.key).click();
      } else if(step.type==='sequence') for(const note of step.order)run.draw().get(step.key+'-note-'+note).click();
      else {walk(run,step.x);s.p.dir=step.direction||-1;s.p.vx=0;run.tick((step.seconds||1)+.1);}
      assert.equal(s.puzzle[index].done,false,'missing prerequisite must block the downstream object');
    });
    for(const [index,step] of scene.steps.entries()) {
      solveObject(run,step,index);
      assert.equal(s.won,false,'preparing objects is not entering the exit');
    }
    run.tick(.1);
    assert.equal(s.exitOpen,true);assert.equal(run.levels[id].platforms(s).length,0);
    walk(run,430);
    assert.equal(s.won,true,'the prepared exit must be reachable by ordinary walking');
    // Fresh runs own every nested object and reset all progress.
    const fresh=game(Number(id));
    assert.equal(fresh.state.exitOpen,false);
    assert.ok(fresh.state.puzzle.every(q=>!q.done&&q.progress===0&&q.cursor===0));
    assert.notEqual(fresh.state.puzzle[0],s.puzzle[0]);
  });
}

test('expanded catalog mixes eight reusable mechanics and has visible clue data',()=>{
  assert.equal(Object.keys(expanded).length,74);
  assert.equal(new Set(Object.values(expanded).map(scene=>scene.title)).size,74);
  assert.equal(new Set(Object.values(expanded).flatMap(scene=>scene.steps.map(step=>step.type))).size,8);
  for(const scene of Object.values(expanded)) {
    for(const [index,step] of scene.steps.entries()) {
      assert.ok(step.needs.every(dependency=>dependency<index),'dependency graph is acyclic');
      if(step.type==='sequence')assert.ok(step.order.every(note=>step.notes[note]),'sequence is explained by named notes');
    }
  }
});
