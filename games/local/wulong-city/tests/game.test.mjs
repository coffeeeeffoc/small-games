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
      hit: (id,label,x,y,w,h,click,drag,up)=>hotspots.set(id,{click,drag,up}),
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
    state, levels, data: context.window.LEVEL_DATA,
    draw(){hotspots.clear();levels[id].draw(state);return hotspots;},
    tick(seconds) {
      for (let i = 0; i < Math.round(seconds * 60) && !state.won; i++) {
        state.t += 1 / 60;
        levels[id].update?.(state, 1 / 60);
      }
    },
  };
}

test('24 levels have complete content, independent reset state and no immediate win', () => {
  const { levels, data } = game(1);
  assert.deepEqual(Object.keys(levels), Array.from({ length: 24 }, (_, i) => String(i + 1)));
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
