import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseShot } from '../src/core.mjs';
import {
  createMultiplayerMatch, applyMultiplayerShot, skipMultiplayerTurn, resolveFriendsShot,
  placeFriendsStriker, shootFriends, stepFriends, remainingFriends, friendsScore,
  worldToSeat, seatToWorld, baselinePoint, MAX_SHOT_STEPS,
} from '../src/friends-core.mjs';
import {
  FRIEND_LEVELS, ORDINARY_FRIEND_BOARD, validateFriendLevels, selectFriendLevel,
} from '../src/friends-content.mjs';

const players = (count) => Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `棋友 ${i + 1}` }));
const match = (count, options = {}) => createMultiplayerMatch({ players: players(count), ...options });
function pocket(game, owners, foul = false) {
  game.shotPots = [];
  for (const owner of owners) {
    const coin = game.coins.find((coin) => !coin.pocketed && (owner === 'queen' ? coin.kind === 'queen' : coin.owner === owner));
    assert(coin, `missing coin ${owner}`);
    coin.pocketed = true;
    game.shotPots.push(coin.id);
  }
  game.shotFoul = foul;
  resolveFriendsShot(game);
}
function shotInput(game, power = 0.025) {
  const start = baselinePoint(game.players[game.turn].seat, 235);
  return { playerId: game.players[game.turn].id, position: 235, dx: 500 - start.x, dy: 500 - start.y, power };
}

test('classic singles and doubles assign opening side white and opposite teammates', () => {
  const single = match(2, { mode: 'singles' });
  assert.deepEqual(single.players.map((player) => [player.seat, player.team, player.color]), [[0, 0, 'white'], [2, 1, 'black']]);
  const double = match(4, { mode: 'doubles' });
  assert.deepEqual(double.players.map((player) => player.team), [0, 1, 0, 1]);
  assert.deepEqual(double.totals, [9, 9]);
  assert.equal(double.coins.filter((coin) => coin.kind === 'queen').length, 1);
  const second = match(4, { mode: 'doubles', round: 2 });
  assert.equal(second.turn, 1);
  assert.equal(second.players[1].color, 'white');
  assert.equal(second.players[3].color, 'white');
  assert.equal(second.players[0].color, 'black');
});

test('every ordinary and level layout has equal ownership, no overlaps, and a legal baseline at every count', () => {
  assert(validateFriendLevels());
  assert.throws(() => validateFriendLevels([ORDINARY_FRIEND_BOARD, ORDINARY_FRIEND_BOARD]));
  assert.throws(() => validateFriendLevels([{ ...ORDINARY_FRIEND_BOARD, layouts: { ...ORDINARY_FRIEND_BOARD.layouts, 2: [{ radius: 5, count: 8 }] } }]));
  for (const count of [2, 3, 4]) {
    for (const levelId of [null, ...FRIEND_LEVELS.map((level) => level.id)]) {
      const game = match(count, { board: levelId ? 'level' : 'ordinary', levelId });
      assert.equal(game.queen, 'none');
      assert.equal(new Set(game.players.map((player) => player.color)).size, count);
      assert.equal(new Set(game.players.map((player) => player.symbol)).size, count);
      assert(game.totals.every((total) => total === game.totals[0]));
      for (let player = 0; player < count; player++) {
        game.turn = player;
        assert(placeFriendsStriker(game, 500));
      }
    }
  }
});

test('three-player rounds rotate who faces the vacant edge, then rotate the vacant edge itself', () => {
  const facedEmpty = [new Set(), new Set(), new Set()];
  const emptySeats = [];
  for (let round = 1; round <= 12; round++) {
    const game = match(3, { round });
    assert.equal(game.turn, (round - 1) % 3);
    assert.deepEqual(game.players.map((player) => player.team), [0, 1, 2]);
    const empty = [0, 1, 2, 3].find((seat) => !game.players.some((player) => player.seat === seat));
    emptySeats.push(empty);
    game.players.forEach((player, index) => {
      if ((player.seat + 2) % 4 === empty) facedEmpty[index].add(empty);
    });
  }
  assert.deepEqual(emptySeats, [3, 3, 3, 0, 0, 0, 1, 1, 1, 2, 2, 2]);
  assert(facedEmpty.every((seats) => seats.size === 4));
});

test('seat transforms invert exactly and place all four strikers on their own baseline', () => {
  for (const seat of [0, 1, 2, 3]) {
    for (const point of [{ x: 235, y: 790 }, { x: 500, y: 500 }, { x: 765, y: 390 }])
      assert.deepEqual(worldToSeat(seatToWorld(point, seat), seat), point);
    assert.deepEqual(worldToSeat(baselinePoint(seat, 320), seat), { x: 320, y: 790 });
    const game = match(4);
    game.turn = seat;
    assert(placeFriendsStriker(game, 320));
    const before = { x: game.striker.x, y: game.striker.y };
    assert(shootFriends(game, 500 - before.x, 500 - before.y, 0.1));
    stepFriends(game);
    assert(Math.hypot(game.striker.x - 500, game.striker.y - 500) < Math.hypot(before.x - 500, before.y - 500));
  }
});

test('friend settings reject incompatible counts, unknown boards and duplicate identities', () => {
  for (const count of [0, 1, 5]) assert.throws(() => match(count));
  assert.throws(() => match(3, { mode: 'singles' }));
  assert.throws(() => match(2, { mode: 'doubles' }));
  assert.throws(() => match(2, { mode: 'singles', board: 'level', levelId: 'open-circle' }));
  assert.throws(() => match(2, { board: 'level', levelId: 'queen' }));
  assert.throws(() => match(2, { board: 'level' }));
  assert.throws(() => match(2, { board: 'oops' }));
  assert.throws(() => match(2, { round: 0 }));
  assert.throws(() => match(2, { firstPlayer: 2 }));
  assert.throws(() => createMultiplayerMatch({ players: [{ id: 'same' }, { id: 'same' }] }));
});

test('random board is deterministic and honors the already previewed room selection', () => {
  const id = selectFriendLevel({ board: 'random', seed: 12 });
  assert.equal(selectFriendLevel({ board: 'random', seed: 12 }), id);
  assert(FRIEND_LEVELS.some((level) => level.id === id));
  const game = match(3, { board: 'random', levelId: id, seed: 999 });
  assert.equal(game.levelId, id);
  assert.throws(() => selectFriendLevel({ board: 'random', seed: NaN }));
});

test('own colors keep the turn, wrong colors return and force a switch even when own color also falls', () => {
  const game = match(3);
  pocket(game, [0]);
  assert.equal(game.turn, 0);
  assert.equal(friendsScore(game, 0), 1);
  pocket(game, [1, 0]);
  assert.equal(game.turn, 1);
  assert.equal(friendsScore(game, 0), 2);
  assert.equal(friendsScore(game, 1), 0);
  assert.equal(remainingFriends(game, 1), game.totals[1]);
  pocket(game, []);
  assert.equal(game.turn, 2);
  pocket(game, []);
  assert.equal(game.turn, 0);
  const returned = game.coins.filter((coin) => !coin.pocketed);
  for (const [index, coin] of returned.entries())
    assert(returned.slice(0, index).every((other) => Math.hypot(coin.x - other.x, coin.y - other.y) >= 36));
});

test('fouls return current pots and one previous pot; unpaid debt consumes later credited pots', () => {
  const game = match(2);
  pocket(game, [0]);
  pocket(game, [0, 1], true);
  assert.equal(friendsScore(game, 0), 0);
  assert.equal(friendsScore(game, 1), 0);
  assert.equal(game.foulsByPlayer[0], 1);
  assert.equal(game.turn, 1);
  pocket(game, [], true);
  assert.equal(game.debt[1], 1);
  pocket(game, []);
  pocket(game, [1]);
  assert.equal(game.debt[1], 0);
  assert.equal(friendsScore(game, 1), 0);
  assert.equal(game.turn, 0);
});

test('double teammates share points and queen coverage; uncovered queen blocks a finish', () => {
  const game = match(4, { mode: 'doubles' });
  pocket(game, ['queen']);
  assert.equal(game.queen, 'pending-0');
  assert.equal(game.turn, 0);
  pocket(game, [0]);
  assert.equal(game.queen, 'covered');
  assert.equal(friendsScore(game, 0), 4);
  assert.equal(friendsScore(game, 2), 4);
  pocket(game, []);
  pocket(game, []);
  assert.equal(game.turn, 2);
  pocket(game, [0]);
  assert.equal(friendsScore(game, 0), 5);
  assert.equal(game.turn, 2);
  const uncovered = match(2, { mode: 'singles' });
  pocket(uncovered, Array(9).fill(0));
  assert.equal(uncovered.phase, 'ready');
  assert.equal(remainingFriends(uncovered, 0), 1);
});

test('classic matches preserve point scoring: queen owner may beat the first team to clear', () => {
  const game = match(4, { mode: 'doubles' });
  pocket(game, ['queen', ...Array(7).fill(0)]);
  pocket(game, []);
  pocket(game, Array(9).fill(1));
  assert.equal(game.phase, 'over');
  assert.equal(game.finisher, 1);
  assert.equal(game.winnerTeam, 0);
  assert.equal(friendsScore(game, game.winner), 10);
  assert.deepEqual(game.ranking.map((entry) => entry.points), [3, 0, 3, 0]);
});

test('color clear finishes once and ranks remaining players with tied placement points', () => {
  const game = match(4);
  pocket(game, Array(game.totals[0]).fill(0));
  assert.equal(game.phase, 'over');
  assert.equal(game.winner, 0);
  assert.deepEqual(game.ranking.map((entry) => entry.rank), [1, 2, 2, 2]);
  assert.deepEqual(game.ranking.map((entry) => entry.points), [4, 2, 2, 2]);
  const snapshot = JSON.stringify(game);
  resolveFriendsShot(game);
  assert.equal(JSON.stringify(game), snapshot);
  assert.throws(() => skipMultiplayerTurn(game));
  assert.throws(() => applyMultiplayerShot(game, shotInput(game)));
});

test('authoritative simulation is deterministic, bounded, immutable, and matches browser animation', () => {
  for (const [count, mode] of [[2, 'singles'], [4, 'doubles'], [2, 'colors'], [3, 'colors'], [4, 'colors']]) {
    const game = match(count, { mode });
    const before = JSON.stringify(game);
    const input = shotInput(game, 1);
    const result = applyMultiplayerShot(game, input);
    assert.equal(JSON.stringify(game), before);
    assert(result.steps > 0 && result.steps <= MAX_SHOT_STEPS);
    assert.notEqual(result.state.phase, 'moving');
    const animation = structuredClone(result.initialState);
    for (let index = 0; index < result.steps; index++) stepFriends(animation);
    animation.events = [];
    assert.deepEqual(animation, result.state);
    assert.deepEqual(applyMultiplayerShot(game, input), result);
    assert(result.state.coins.every((coin) => Number.isFinite(coin.x) && Number.isFinite(coin.y)));
  }
});

test('authoritative shots reject spectators, wrong turns and non-finite or out-of-range input', () => {
  const game = match(4);
  const input = shotInput(game);
  for (const bad of [
    { playerId: 'spectator' }, { playerId: 'p1' }, { position: NaN }, { position: 234 },
    { position: 766 }, { power: 0 }, { power: 1.1 }, { dx: Infinity }, { dx: '1' }, { dx: 0, dy: 0 },
  ]) assert.throws(() => applyMultiplayerShot(game, { ...input, ...bad }));
  assert.equal(placeFriendsStriker(game, NaN), false);
  assert.equal(shootFriends(game, 0, -1, NaN), false);
});

test('timeouts restore a pending queen and advance exactly one player without mutating input', () => {
  const game = match(4, { mode: 'doubles' });
  pocket(game, ['queen']);
  const next = skipMultiplayerTurn(game);
  assert.equal(game.queen, 'pending-0');
  assert.equal(next.turn, 1);
  assert.equal(next.queen, 'board');
  assert.equal(next.coins.find((coin) => coin.kind === 'queen').pocketed, false);
  assert.equal(next.players.length, 4);
});

test('fully blocked baselines recover to a legal ready turn instead of deadlocking the room', () => {
  const game = match(2);
  game.coins.forEach((coin, index) => {
    coin.x = 235 + index % 8 * 76;
    coin.y = index < 8 ? 790 : 210;
  });
  assert.equal(placeFriendsStriker(game, 500), false);
  const next = skipMultiplayerTurn(game);
  assert.equal(next.phase, 'ready');
  assert(placeFriendsStriker(next, 500));
  assert(next.coins.every((coin) => !coin.pocketed));
  assert.deepEqual(next.totals, game.totals);
});

test('all multiplayer color layouts can finish through real shot physics for 2, 3 and 4 players', () => {
  for (const count of [2, 3, 4]) {
    for (const levelId of [null, ...FRIEND_LEVELS.map((level) => level.id)]) {
      let game = match(count, { board: levelId ? 'level' : 'ordinary', levelId });
      while (game.phase !== 'over' && game.shots < 120) {
        const player = game.players[game.turn];
        const local = {
          ...game,
          turn: 0,
          coins: game.coins.map((coin) => ({
            ...coin,
            ...worldToSeat(coin, player.seat),
            kind: coin.owner === player.team ? 'white' : 'black',
          })),
          striker: { ...game.striker, ...worldToSeat(game.striker, player.seat) },
        };
        const shot = chooseShot(local);
        const direction = seatToWorld({ x: 500 + shot.dx, y: 500 + shot.dy }, player.seat);
        game = applyMultiplayerShot(game, {
          playerId: player.id,
          position: shot.x,
          dx: direction.x - 500,
          dy: direction.y - 500,
          power: shot.power,
        }).state;
      }
      assert.equal(game.phase, 'over', `${count} players / ${levelId ?? 'ordinary'}`);
      assert.equal(game.ranking.length, count);
      assert.equal(remainingFriends(game, game.winner), 0);
    }
  }
});
