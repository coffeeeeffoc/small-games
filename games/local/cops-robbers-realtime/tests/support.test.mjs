import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startGame, stepGame, pauseGame, resumeGame, commandCop, commandRobber } from '../src/engine.js';
import { startSupport, starterRuns, sprintRemaining, useSprint, useRewind, canRefill, grantSupport } from '../src/support.js';
const definition = { id: 1, nodes: [0, 1000, 2000, 3000, 4000].map(x => ({ x, y: 300 })),
  edges: [[0,1],[1,2],[2,3],[3,4]], cops: [0,4], robbers: [2], policeSpeed:100, robberSpeed:120 };
function run(game, seconds) { for (let i=0; i < Math.round(seconds*60); i++) stepGame(game, 1/60); }
function begin(extra = {}, options = {}) {
  const game = createGame({ ...definition, ...extra }, { ai: false, ...options });
  startGame(game); startSupport(game, 0); return game;
}
test('only new formal runs consume the five persistent starter grants', () => {
  let started = 0;
  for (let ordinal=1; ordinal<=7; ordinal++) {
    const game = createGame(definition);
    startGame(game);
    started = startSupport(game, started);
    assert.equal(game.support.sprint, ordinal <= 5 ? 1 : 0);
    assert.equal(game.support.rewind, ordinal <= 5 ? 1 : 0);
    pauseGame(game); resumeGame(game);
    assert.equal(startSupport(game, started), started);
    assert.equal(startSupport(createGame({ ...definition, id:0 }), started), started);
    started = starterRuns(JSON.parse(JSON.stringify({ started })).started);
  }
  for (const invalid of [-1, 2.5, '5', null, Infinity]) assert.equal(starterRuns(invalid), 0);
});
test('sprint really speeds only the selected actor, expires and freezes with pause', () => {
  const game = begin();
  commandCop(game,0,{ x:1000,y:300 }); commandCop(game,1,{ x:3000,y:300 });
  assert.equal(useSprint(game,0),true); assert.equal(useSprint(game,1),false);
  run(game,1);
  assert.ok(Math.abs(game.cops[0].x-120)<1e-6);
  assert.ok(Math.abs(game.cops[1].x-3900)<1e-6);
  const remaining = sprintRemaining(game), position=game.cops[0].x;
  pauseGame(game); run(game,2);
  assert.equal(game.cops[0].x,position); assert.equal(sprintRemaining(game),remaining);
  resumeGame(game); run(game,4);
  assert.equal(sprintRemaining(game),0);
  const x=game.cops[0].x; run(game,1); assert.ok(Math.abs(game.cops[0].x-x-100)<1e-6);
  assert.equal(game.support.assisted,true);
});
test('robber sprint respects the waiting opening and does not change capture conditions', () => {
  const game=begin({}, { playerRole:'robber', firstRole:'cop' });
  assert.equal(useSprint(game,0),false);
  run(game,2.1); commandRobber(game,0,{x:3000,y:300});
  assert.equal(useSprint(game,0),true);
  run(game,1); assert.ok(Math.abs(game.robbers[0].x-2144)<1e-6);
  assert.equal(game.robbers[0].caught,false);
});
test('only completed ads refill once per ability after the free charge is consumed', () => {
  const game=begin(); useSprint(game,0);
  assert.equal(canRefill(game,'sprint'),false);
  run(game,4.1);
  for (const status of ['dismissed','failed','unavailable']) {
    assert.equal(grantSupport(game,'sprint',{status}),false);
    assert.equal(game.support.refilled.sprint,false);
  }
  assert.equal(grantSupport(game,'sprint',{status:'completed'}),true);
  assert.equal(grantSupport(game,'sprint',{status:'completed'}),false);
  assert.equal(useSprint(game,0),true); run(game,4.1);
  assert.equal(canRefill(game,'sprint'),false);
});
test('a real timeout rewinds full dynamic state without refunding abilities or retaining future history', () => {
  const game=begin({ timeLimit:8 });
  commandCop(game,0,{x:1000,y:300});
  run(game,1); useSprint(game,0); run(game,7.1);
  assert.equal(game.phase,'lost');
  const target=Math.max(0,game.time-5);
  const checkpoint=game.support.history.filter(item=>item.time<=target+1e-7).at(-1);
  const before=JSON.parse(JSON.stringify(checkpoint));
  game.aiTarget = 'future-target';
  assert.equal(useRewind(game),true);
  for (const field of ['time','cops','robbers','aiRethink','aiTarget','seed','lastOrder']) assert.deepEqual(game[field],before[field]);
  assert.equal(game.phase,'playing');
  assert.equal(game.support.sprint,0); assert.equal(game.support.rewind,0);
  assert.ok(game.support.history.every(item=>item.time<=game.time));
  run(game,6); assert.equal(game.phase,'lost');
  assert.equal(grantSupport(game,'rewind',{status:'completed'}),true);
  assert.equal(useRewind(game),true);
  run(game,6); assert.equal(canRefill(game,'rewind'),false);
});
test('an early failure restores the start and a robber loss can also rewind', () => {
  for (const role of ['cop','robber']) {
    const game=begin({}, { playerRole:role });
    run(game,.3);
    game.phase=role==='cop'?'lost':'won';
    assert.equal(useRewind(game),true); assert.equal(game.time,0);
    assert.equal(game.robbers[0].caught,false); assert.equal(game.robbers[0].escaped,false);
    assert.deepEqual(game.events,[]);
  }
});
