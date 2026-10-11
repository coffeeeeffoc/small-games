import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTournament,
  createTournamentMatch,
  recordTournamentRound,
  nextTournamentRound,
  tournamentPlayerForDisc,
  tournamentStandings,
} from '../src/tournament.mjs';
import { physics, skipTurn, step } from '../src/core.mjs';

function outcome(series, match, batches) {
  const dead = batches.flat();
  match.discs.forEach((disc) => {
    disc.alive = !dead.includes(disc.id);
    disc.vx = 0;
    disc.vy = 0;
  });
  match.eliminationBatches = batches.map((ids, index) => ({
    key: `shot:${index + 1}`,
    ids,
    reason: 'shot',
    shot: index + 1,
    turn: index + 1,
  }));
  match.phase = 'over';
  match.winner = match.discs.find((disc) => disc.alive)?.id ?? -1;
  return recordTournamentRound(series, match);
}

function nextMatch(series) {
  assert.equal(nextTournamentRound(series), true);
  return createTournamentMatch(series);
}

test('friend series validates configuration and survives JSON round trips', () => {
  for (const players of [2, 3, 4]) {
    const series = createTournament({ players, seed: 123, turnSeconds: 15 });
    assert.equal(series.roundLimit, players === 2 ? 3 : players);
    assert.equal(series.phase, 'ready');
    assert.deepEqual(JSON.parse(JSON.stringify(series)), series);
    assert.equal(series.players.length, players);
    const restored = JSON.parse(JSON.stringify(series));
    assert.deepEqual(createTournamentMatch(restored), createTournamentMatch(series));
    assert.equal(createTournamentMatch(series), null, 'a running round cannot restart');
  }
  for (const players of [0, 1, 5, 10000000, NaN, '3', [], [{ id: 'one' }]])
    assert.throws(() => createTournament({ players }));
  for (const turnSeconds of [0, 8, 20, Infinity, '10'])
    assert.throws(() => createTournament({ turnSeconds }));
  for (const seed of [-1, 0x100000000, 0.5, NaN, '1'])
    assert.throws(() => createTournament({ seed }));
  assert.throws(() => createTournament(null));
  assert.throws(() => createTournament({ players: [{ id: 'same' }, { id: 'same' }] }));
  assert.throws(() => createTournament({ players: [{ id: '__proto__' }, { id: 'two' }] }));
  assert.throws(() => createTournament({ players: [{ id: 'one', name: ' ' }, { id: 'two' }] }));
});

test('duel draws replay the same initiative; two wins finish without an extra match', () => {
  const series = createTournament({ players: 2, seed: 7 });
  let match = createTournamentMatch(series);
  const firstPoints = match.discs.map(({ x, y }) => [x, y]);
  const draw = outcome(series, match, [[0, 1]]);
  assert.equal(draw.draw, true);
  assert.equal(draw.needsReplay, true);
  assert.equal(series.round, 1);
  assert.deepEqual(series.scores, { 'player-1': 0, 'player-2': 0 });
  assert.equal(createTournamentMatch(series), null, 'result requires explicit next');
  match = nextMatch(series);
  assert.equal(series.round, 1);
  assert.equal(series.attempt, 2);
  assert.equal(match.active, 0);
  assert.deepEqual(
    match.discs.map(({ x, y }) => [x, y]),
    firstPoints,
  );
  outcome(series, match, [[1]]);
  match = nextMatch(series);
  assert.equal(series.round, 2);
  assert.equal(series.attempt, 1);
  assert.equal(match.active, 1);
  assert.deepEqual(match.order, [1, 0]);
  assert.deepEqual(
    match.discs.map(({ x, y }) => [x, y]),
    firstPoints.toReversed(),
  );
  outcome(series, match, [[1]]);
  assert.equal(series.phase, 'finished');
  assert.equal(series.winnerId, 'player-1');
  assert.equal(series.wins['player-1'], 2);
  assert.equal(nextTournamentRound(series), false);
});

test('a split duel goes to a deciding third round', () => {
  const series = createTournament({ seed: 8 });
  let match = createTournamentMatch(series);
  outcome(series, match, [[1]]);
  match = nextMatch(series);
  outcome(series, match, [[0]]);
  match = nextMatch(series);
  assert.equal(series.round, 3);
  assert.equal(match.active, 0);
  outcome(series, match, [[0]]);
  assert.equal(series.phase, 'finished');
  assert.equal(series.winnerId, 'player-2');
});

test('all players receive one first move and every birth position in regular multiplayer rounds', () => {
  for (const count of [3, 4]) {
    const series = createTournament({ players: count, seed: 9 });
    let match = createTournamentMatch(series);
    const first = [],
      positions = Array.from({ length: count }, () => new Set());
    for (let round = 0; round < count; round++) {
      first.push(match.active);
      for (const disc of match.discs) positions[disc.id].add(`${disc.x},${disc.y}`);
      const ranking = Array.from({ length: count - 1 }, (_, i) => [count - 1 - i]);
      outcome(series, match, ranking);
      if (round < count - 1) match = nextMatch(series);
    }
    assert.deepEqual(
      first,
      Array.from({ length: count }, (_, id) => id),
    );
    assert(positions.every((position) => position.size === count));
    assert.equal(series.phase, 'finished');
    assert.equal(series.winnerId, 'player-1');
  }
});

test('four-player points count outlasted opponents and a sole survivor bonus', () => {
  const series = createTournament({ players: 4, seed: 2 });
  const match = createTournamentMatch(series);
  const result = outcome(series, match, [[3], [2], [1]]);
  assert.deepEqual(result.points, { 'player-1': 4, 'player-2': 2, 'player-3': 1, 'player-4': 0 });
  assert.deepEqual(
    result.ranking.map(({ place }) => place),
    [1, 2, 3, 4],
  );
  assert.deepEqual(
    tournamentStandings(series).map(({ rank }) => rank),
    [1, 2, 3, 4],
  );
});

test('same-shot and same-contraction eliminations tie even when the final survivors fall', () => {
  const series = createTournament({ players: 4, seed: 2 });
  let match = createTournamentMatch(series);
  const tiedSecond = outcome(series, match, [[3], [1, 2]]);
  assert.deepEqual(tiedSecond.points, {
    'player-1': 4,
    'player-2': 1,
    'player-3': 1,
    'player-4': 0,
  });
  assert.deepEqual(
    tiedSecond.ranking.map(({ place }) => place),
    [1, 2, 2, 4],
  );
  match = nextMatch(series);
  const tiedFirst = outcome(series, match, [[3], [2], [0, 1]]);
  assert.deepEqual(tiedFirst.points, {
    'player-1': 2,
    'player-2': 2,
    'player-3': 1,
    'player-4': 0,
  });
  assert.equal(tiedFirst.draw, true);
  assert.equal(tiedFirst.needsReplay, false, 'multiplayer draws consume a regular round');
  assert.deepEqual(
    tiedFirst.ranking.map(({ place }) => place),
    [1, 1, 3, 4],
  );
  nextMatch(series);
  assert.equal(series.round, 3);
});

test('settlement is idempotent across retries, JSON restoration and late replay requests', () => {
  const series = createTournament({ players: 3, seed: 3 });
  const match = createTournamentMatch(series);
  const result = outcome(series, match, [[2], [1]]);
  const once = JSON.stringify(series);
  assert.deepEqual(recordTournamentRound(series, match), result);
  assert.equal(JSON.stringify(series), once);
  const restored = JSON.parse(once);
  assert.deepEqual(recordTournamentRound(restored, match), result);
  nextMatch(restored);
  const before = JSON.stringify(restored);
  assert.deepEqual(recordTournamentRound(restored, match), result);
  assert.equal(JSON.stringify(restored), before);
  result.points['player-1'] = 999;
  assert.equal(series.lastResult.points['player-1'], 3, 'caller cannot mutate the stored receipt');
});

test('settlement rejects unfinished, foreign and malformed results before changing scores', () => {
  const series = createTournament({ players: 3, seed: 3 });
  const match = createTournamentMatch(series);
  const before = JSON.stringify(series);
  assert.equal(recordTournamentRound(series, match), null);
  assert.equal(recordTournamentRound(series, { ...match, tournamentRoundId: 'foreign' }), null);
  assert.equal(recordTournamentRound(series, { ...match, phase: 'over', winner: 0 }), null);
  assert.equal(JSON.stringify(series), before);
  const bad = structuredClone(match);
  bad.phase = 'over';
  bad.winner = 0;
  bad.discs[1].alive = bad.discs[2].alive = false;
  bad.eliminationBatches = [{ key: 'shot:1', ids: [1, 1, 2] }];
  assert.equal(recordTournamentRound(series, bad), null);
  bad.eliminationBatches = [{ key: 'shot:1', ids: [1] }];
  assert.equal(recordTournamentRound(series, bad), null);
  bad.eliminationBatches = [{ key: 'shot:1', ids: [1, 2] }];
  bad.seats.reverse();
  assert.equal(recordTournamentRound(series, bad), null);
  assert.equal(JSON.stringify(series), before);
});

test('a subset of tied leaders gets contiguous discs, preserves identities and repeats a draw', () => {
  const series = createTournament({
    seed: 10,
    players: [
      { id: 'alice', name: '阿梨' },
      { id: 'bob', name: '小波' },
      { id: 'chen', name: '阿辰' },
    ],
  });
  let match = createTournamentMatch(series);
  outcome(series, match, [[1], [2]]);
  match = nextMatch(series);
  outcome(series, match, [[1], [0]]);
  match = nextMatch(series);
  const finalRegular = outcome(series, match, [[0, 2]]);
  assert.deepEqual(finalRegular.leaders, ['alice', 'chen']);
  assert.deepEqual(series.scores, { alice: 4, bob: 3, chen: 4 });
  match = nextMatch(series);
  assert.equal(series.stage, 'tiebreak');
  assert.deepEqual(match.seats, ['alice', 'chen']);
  assert.deepEqual(
    match.discs.map(({ id }) => id),
    [0, 1],
  );
  assert.equal(tournamentPlayerForDisc(series, 1).id, 'chen');
  assert.equal(tournamentPlayerForDisc(series, 2), null);
  const unchanged = { ...series.scores };
  outcome(series, match, [[0, 1]]);
  assert.deepEqual(series.scores, unchanged);
  match = nextMatch(series);
  assert.deepEqual(match.seats, ['alice', 'chen']);
  assert.equal(series.attempt, 2);
  outcome(series, match, [[0]]);
  assert.equal(series.winnerId, 'chen');
  assert.equal(series.phase, 'finished');
  assert.deepEqual(series.scores, unchanged);
  assert.equal(tournamentStandings(series)[0].id, 'chen');
  assert.deepEqual(JSON.parse(JSON.stringify(series)), series);
});

test('all four tied leaders remain in sudden death until one survives', () => {
  const series = createTournament({ players: 4, seed: 11 });
  let match = createTournamentMatch(series);
  for (let winner = 0; winner < 4; winner++) {
    const order = [3, 2, 1].map((offset) => [(winner + offset) % 4]);
    outcome(series, match, order);
    match = nextMatch(series);
  }
  assert.equal(series.stage, 'tiebreak');
  assert.equal(match.discs.length, 4);
  assert.deepEqual(Object.values(series.scores), [7, 7, 7, 7]);
  outcome(series, match, [[0, 1, 2, 3]]);
  match = nextMatch(series);
  assert.equal(match.discs.length, 4);
  outcome(series, match, [[0, 1, 3]]);
  assert.equal(series.winnerId, 'player-3');
  assert.deepEqual(Object.values(series.scores), [7, 7, 7, 7]);
});

test('friend shrink waits for three complete rounds and timeouts preserve fixed turn order', () => {
  const series = createTournament({ players: 4, seed: 11 });
  const match = createTournamentMatch(series);
  for (let turn = 0; turn < 11; turn++) {
    assert.equal(match.active, turn % 4);
    assert.equal(skipTurn(match), true);
    assert.equal(match.radius, physics.radius);
    assert.equal(match.phase, 'aim');
  }
  assert.equal(match.active, 3);
  assert.equal(skipTurn(match), true);
  assert.equal(match.phase, 'shrinking');
  while (match.phase === 'shrinking') step(match);
  assert.equal(match.radius, physics.radius - 18);
  assert.equal(match.active, 0);
  assert.equal(match.turn, 4);
});
