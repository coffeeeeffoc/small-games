import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startGame, commandCop, commandRobber, holdCop, holdRobber, routePreview, canRelayOrder } from '../src/engine.js';
import { readPuzzleLink, puzzleUrl } from '../src/share.js';

const street = { id:1, name:'Relay test', nodes:[{x:100,y:300},{x:300,y:300},{x:500,y:300},{x:700,y:300},{x:900,y:300}], edges:[[0,1],[1,2],[2,3],[3,4]], cops:[0,4], robbers:[2], exits:[] };
function begin(options, definition = street) { const game = createGame(definition, { ai:false, ...options }); startGame(game); return game; }
test('relay requires another real changed destination and preserves existing routes on rejected orders', () => {
  const game = begin({orderRule:'relay'});
  assert.equal(commandCop(game, 0, {x:200,y:300}), true);
  const destination = {...game.cops[0].destination};
  assert.equal(commandCop(game, 0, {x:250,y:300}), false);
  assert.deepEqual(game.cops[0].destination, destination);
  assert.equal(routePreview(game, 0, {x:250,y:300}), null);
  assert.equal(holdCop(game, 1), true);
  assert.equal(game.lastOrder, 0, 'hold does not transfer command');
  assert.equal(commandCop(game, 1, {x:900,y:300}), false, 'current position cannot transfer command');
  assert.equal(commandCop(game, 1, {x:900,y:50}), false);
  assert.equal(game.lastOrder, 0);
  assert.equal(commandCop(game, 1, {x:800,y:300}), true);
  assert.equal(commandCop(game, 0, {x:200,y:300}), false, 'repeating an existing destination does not transfer command');
  assert.equal(game.lastOrder, 1);
  assert.equal(commandCop(game, 0, {x:250,y:300}), true);
  assert.equal(game.lastOrder, 0);
  assert.equal(holdCop(game, 0), true);
  assert.equal(commandCop(game, 0, {x:250,y:300}), false, 'stopping the last actor does not remove the restriction');
});
test('runner relay transfers between active teammates; final survivor and AI remain controllable', () => {
  const game = begin({orderRule:'relay',playerRole:'robber'}, {...street, robbers:[1,3]});
  assert.equal(commandRobber(game, 0, {x:400,y:300}), true);
  assert.equal(commandRobber(game, 0, {x:350,y:300}), false);
  assert.equal(holdRobber(game, 1), true);
  assert.equal(game.lastOrder, 0);
  assert.equal(commandCop(game, 0, {x:200,y:300}), true, 'AI commands are not limited by the human rule');
  assert.equal(game.lastOrder, 0);
  assert.equal(commandRobber(game, 1, {x:600,y:300}), true);
  assert.equal(commandRobber(game, 0, {x:350,y:300}), true);
  game.robbers[1].caught = true;
  assert.equal(canRelayOrder(game, 'robber', 0), true);
  assert.equal(commandRobber(game, 0, {x:400,y:300}), true);
});
test('standard rule and opening authority stay unchanged', () => {
  const standard = begin({});
  assert.equal(standard.orderRule, 'standard');
  assert.equal(commandCop(standard, 0, {x:200,y:300}), true);
  assert.equal(commandCop(standard, 0, {x:250,y:300}), true);
  const game = begin({orderRule:'relay', firstRole:'robber'});
  assert.equal(commandCop(game, 0, {x:200,y:300}), false);
  assert.equal(game.lastOrder, null);
});
test('public same-puzzle links validate bounds and strip credentials/results', () => {
  for (const key of ['mode','level','role','first','rule']) assert.equal(readPuzzleLink(`https://example.test/game?level=1&${key}=x&${key}=y`), null);
  for (const raw of ['0','101','1.1','-1','Infinity','1e1','%20']) assert.equal(readPuzzleLink(`https://example.test/game?level=${raw}`), null);
  assert.equal(readPuzzleLink(`https://example.test/game?level=1&extra=${'x'.repeat(1024)}`), null);
  const puzzle = {mode:'classic',level:100,role:'robber',rule:'relay',first:'cop'};
  const url = puzzleUrl('https://player:private-token@example.test/game?token=secret&score=999#auth', puzzle);
  assert.ok(!/secret|score|auth|player|private-token/.test(url));
  assert.deepEqual(readPuzzleLink(url), puzzle);
  assert.equal(readPuzzleLink('https://example.test/game?level=1&first=robber').first, null, 'challenge starts simultaneously');
});
