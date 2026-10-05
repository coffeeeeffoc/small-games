import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getLevels } from '../src/levels.js';
import { escapeCore } from '../src/level-safety.js';
import {
  createGame,
  startGame,
  stepGame,
  commandRobber,
  captureStatus,
  PURSUIT_REPLAN_SECONDS,
} from '../src/engine.js';

const witnesses = JSON.parse(
  await readFile(new URL('./fixtures/runner-witnesses.json', import.meta.url), 'utf8'),
);

for (const mode of ['challenge', 'classic', 'escape']) {
  test(`${mode}: every map has a replayable runner win against the real pursuit AI`, () => {
    const levels = getLevels(mode);
    assert.equal(Object.keys(witnesses[mode]).length, levels.length);
    for (const level of levels) {
      const sides = mode === 'challenge' ? ['simultaneous'] : ['cop', 'robber'];
      for (const side of sides) {
        const label = `${mode}/${level.id}/${side}`;
        const orders = witnesses[mode][level.id][side];
        assert.ok(Array.isArray(orders), `${label}: missing witness`);
        const game = createGame(level, {
          playerRole: 'robber',
          firstRole: side === 'simultaneous' ? null : side,
        });
        assert.ok(
          game.robbers.every((actor) => !captureStatus(game, actor).enclosed),
          `${label}: enclosed at spawn`,
        );
        startGame(game);
        let index = 0;
        for (let tick = 0; game.phase === 'playing' && tick <= level.timeLimit * 10 + 1; tick++) {
          while (orders[index]?.[0] === tick) {
            const [, actor, ...target] = orders[index++];
            const point =
              target.length === 1 ? level.nodes[target[0]] : { x: target[0], y: target[1] };
            assert.ok(
              commandRobber(game, actor, point),
              `${label}: rejected order at ${tick / 10}s`,
            );
          }
          // Match the browser and score verifier's fixed 60 Hz clock.
          for (let frame = 0; frame < 6 && game.phase === 'playing'; frame++)
            stepGame(game, 1 / 60);
          game.events.length = 0;
        }
        assert.equal(game.phase, 'lost', `${label}: runner strategy must win`);
        assert.ok(
          game.robbers.some((actor) => actor.escaped || !actor.caught),
          `${label}: surviving or escaped runner`,
        );
        for (const actor of game.robbers.filter((actor) => actor.escaped)) {
          assert.ok(
            level.exits.includes(actor.exitTarget),
            `${label}: escaped actor needs a real exit for rendering`,
          );
        }
      }
    }
  });
}

test('free maps spawn every runner inside the police-free road core, with a speed advantage', () => {
  for (const mode of ['classic', 'escape'])
    for (const level of getLevels(mode)) {
      const core = escapeCore(level);
      assert.ok(
        level.robbers.every((node) => core.has(node)),
        `${mode}/${level.id}: dead-end spawn`,
      );
      assert.ok(
        level.robberSpeed > level.policeSpeed,
        `${mode}/${level.id}: cannot outrun pursuit`,
      );
    }
  assert.equal(PURSUIT_REPLAN_SECONDS, 1.2);
});

test('a loop behind police roadblocks does not make a terminal spawn safe', () => {
  const level = {
    nodes: Array.from({ length: 6 }, () => ({})),
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [3, 4],
      [4, 5],
    ],
    cops: [4],
  };
  assert.deepEqual([...escapeCore(level)], [0, 1, 2, 3]);
});
