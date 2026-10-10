import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createGame,
  shoot,
  step,
  placeStriker,
  remaining,
  resolveShot,
  chooseShot,
  aimPreview,
  starsFor,
} from '../src/core.mjs';
import { LEVELS, validateLevels } from '../src/content.mjs';
import { freshSave, readSave, writeSave, validMatch, unlocked } from '../src/storage.mjs';

function settle(game) {
  for (let i = 0; i < 4000 && game.phase === 'moving'; i++) step(game);
  assert.notEqual(game.phase, 'moving', 'shot must settle');
  for (const c of game.coins) assert(Number.isFinite(c.x) && Number.isFinite(c.y));
}
function pocket(game, kinds, foul = false) {
  game.shotPots = [];
  for (const kind of kinds) {
    const c = game.coins.find((c) => c.kind === kind && !c.pocketed);
    assert(c);
    c.pocketed = true;
    game.shotPots.push(c.id);
  }
  game.shotFoul = foul;
  resolveShot(game);
}
test('rack, content validation and stable ids', () => {
  validateLevels();
  const game = createGame();
  assert.equal(remaining(game, 0), 9);
  assert.equal(remaining(game, 1), 9);
  assert.equal(game.coins.length, 19);
  assert.throws(() => validateLevels([LEVELS[0], LEVELS[0]]));
  assert.throws(() => validateLevels([{ ...LEVELS[0], coins: [['white', NaN, 50]] }]));
});
test('full-strength shot collides without tunnelling and ends at rest', () => {
  const game = createGame();
  assert(shoot(game, 0, -1, 1));
  settle(game);
  assert(game.coins.filter((c) => Math.hypot(c.x - 500, c.y - 500) > 100).length > 3);
  assert(game.coins.every((c) => c.pocketed || (c.vx === 0 && c.vy === 0)));
  assert(game.events.some((e) => e.type === 'collision'));
  assert(game.events.some((e) => e.type === 'wall'));
});
test('collision preview uses the first body and striker placement avoids overlap', () => {
  const game = createGame('first-touch');
  game.coins[0].x = 500;
  game.coins[0].y = 500;
  const preview = aimPreview(game, 0, -1);
  assert.equal(preview.hit.id, game.coins[0].id);
  assert.equal(preview.y, 542);
  game.coins[0].y = 790;
  assert(placeStriker(game, 500));
  assert(Math.abs(game.striker.x - 500) >= 43);
  assert.equal(shoot(game, NaN, -1, 1), false);
  assert.equal(shoot(game, 0, 0, 0.5), false);
  assert.equal(shoot(game, 1, 1, 2), false);
});
test('own coin continues turn, miss switches turn, opponents coin does not grant a turn', () => {
  const game = createGame();
  pocket(game, ['white']);
  assert.equal(game.turn, 0);
  pocket(game, ['black']);
  assert.equal(game.turn, 1);
  pocket(game, []);
  assert.equal(game.turn, 0);
});
test('queen needs a cover and returns without overlap on a miss', () => {
  const game = createGame();
  pocket(game, ['queen']);
  assert.equal(game.queen, 'pending-0');
  assert.equal(game.turn, 0);
  pocket(game, []);
  assert.equal(game.queen, 'board');
  assert.equal(game.turn, 1);
  const queen = game.coins.find((c) => c.kind === 'queen');
  assert(!queen.pocketed);
  assert(
    !game.coins.some(
      (c) => c !== queen && !c.pocketed && Math.hypot(c.x - queen.x, c.y - queen.y) < 36,
    ),
  );
  pocket(game, ['queen', 'black']);
  assert.equal(game.queen, 'covered');
  assert.equal(game.queenOwner, 1);
});
test('striker foul returns current own pots and a prior coin; debt is paid later', () => {
  const game = createGame();
  pocket(game, ['white']);
  pocket(game, ['white'], true);
  assert.equal(remaining(game, 0), 9);
  assert.equal(game.turn, 1);
  pocket(game, [], true);
  assert.equal(game.debt[1], 1);
  assert.equal(game.turn, 0);
  pocket(game, []);
  pocket(game, ['black']);
  assert.equal(remaining(game, 1), 9);
  assert.equal(game.debt[1], 0);
});
test('queen and current own coins return on foul; uncovered queen prevents premature win', () => {
  const game = createGame('queen');
  pocket(game, ['queen', 'white'], true);
  assert.equal(game.queen, 'board');
  assert.equal(remaining(game, 0), 2);
  game.debt[0] = 0;
  pocket(game, ['white', 'white']);
  assert.equal(game.phase, 'ready');
  assert.equal(remaining(game, 0), 1);
});
test('all six levels can be won through the same shot physics within their budgets', () => {
  for (const level of LEVELS) {
    const game = createGame(level.id);
    while (game.phase !== 'over' && game.shots < level.shots) {
      const shot = chooseShot(game);
      assert(placeStriker(game, shot.x));
      assert(shoot(game, shot.dx, shot.dy, shot.power));
      settle(game);
    }
    assert.equal(game.winner, 0, level.id);
    assert(starsFor(game) >= 1);
  }
});
test('computer makes legal physical shots and a full computer-versus-computer match terminates', () => {
  const game = createGame();
  for (let turn = 0; turn < 200 && game.phase !== 'over'; turn++) {
    const shot = chooseShot(game);
    assert(placeStriker(game, shot.x));
    assert(shoot(game, shot.dx, shot.dy, shot.power));
    settle(game);
  }
  assert.equal(game.phase, 'over');
  assert([0, 1].includes(game.winner));
});
test('save validation, no-storage fallback and sequential progression', () => {
  const save = freshSave();
  assert(unlocked(save, 0));
  assert(!unlocked(save, 1));
  save.stars[LEVELS[0].id] = 3;
  assert(unlocked(save, 1));
  assert(!unlocked(save, 2));
  save.match = createGame();
  const encoded = JSON.stringify(save);
  const memory = { getItem: () => encoded, setItem: () => {} };
  assert(readSave(memory).match);
  assert(writeSave(memory, save));
  assert(!writeSave(undefined, save));
  assert.deepEqual(readSave(undefined), freshSave());
  const bad = createGame();
  bad.coins[0].x = Infinity;
  assert.equal(validMatch(bad), null);
  const moving = createGame();
  shoot(moving, 0, -1, 1);
  assert.equal(validMatch(moving), null);
  const mass = createGame();
  mass.coins[0].mass = -100;
  assert.equal(validMatch(mass).coins[0].mass, 1);
});
