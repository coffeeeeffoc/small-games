import test from 'node:test';
import assert from 'node:assert/strict';
import { createMossGame } from '../src/controller.ts';
import { LEVELS } from '../src/content.ts';
import { createSave } from '../src/progress.ts';
import { createPuzzle } from '../src/rules.ts';

// The challenge path must not unlock a locked level or replace a normal in-progress board.
test('same-level invitations isolate progression and replay exactly the invited level', async () => {
  const original = {
    ...createSave(),
    active: { levelId: LEVELS[0].id, puzzle: createPuzzle(LEVELS[0]), elapsedMs: 1234 },
  };
  let written: unknown = null;
  const context = new Proxy(
    {
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
    },
    { get: (object, key) => (key in object ? object[key as keyof typeof object] : () => {}) },
  );
  const game = await createMossGame(
    {
      canvas: { width: 390, height: 844, getContext: () => context },
      challengeLevel: LEVELS[8].id,
      onTap: () => () => {},
    } as never,
    {
      storage: {
        read: async () => ({ value: original }),
        write: async (_key: string, value: unknown) => {
          written = structuredClone(value);
          return {};
        },
      },
    } as never,
  );
  try {
    game.act('home:start');
    assert.equal(game.snapshot().levelId, LEVELS[8].id);
    assert.equal(game.snapshot().challenge, true);
    for (let count = 0; count < 20 && game.snapshot().page === 'play'; count++)
      game.act('play:hint');
    assert.equal(game.snapshot().page, 'result');
    game.act('result:next');
    assert.equal(game.snapshot().levelId, LEVELS[8].id);
    assert.equal(game.snapshot().page, 'play');
    assert.equal(game.snapshot().puzzle.hints, 0);
  } finally {
    await game.dispose();
  }
  assert.deepEqual(written, original);
});

test('leaving an invitation restores the ordinary continue route and current-level selection', async () => {
  for (const route of ['continue', 'level-selection']) {
    const original = {
      ...createSave(),
      active: {
        levelId: LEVELS[0].id,
        puzzle: { ...createPuzzle(LEVELS[0]), excluded: [0] },
        elapsedMs: 5000,
      },
    };
    let written: typeof original | null = null;
    const context = new Proxy(
      {
        createLinearGradient: () => ({ addColorStop() {} }),
        createRadialGradient: () => ({ addColorStop() {} }),
      },
      { get: (object, key) => (key in object ? object[key as keyof typeof object] : () => {}) },
    );
    const game = await createMossGame(
      {
        canvas: { width: 390, height: 844, getContext: () => context },
        challengeLevel: LEVELS[8].id,
        onTap: () => () => {},
      } as never,
      {
        storage: {
          read: async () => ({ value: original }),
          write: async (_key: string, value: typeof original) => {
            written = structuredClone(value);
            return {};
          },
        },
      } as never,
    );
    try {
      game.act('home:start');
      assert.equal(game.snapshot().levelId, LEVELS[8].id);
      game.act('play:pause');
      game.act('pause:home');
      if (route === 'continue') game.act('home:start');
      else {
        game.act('home:levels');
        game.act(`level:${LEVELS[0].id}`);
      }
      assert.equal(game.snapshot().levelId, LEVELS[0].id, route);
      assert.equal(game.snapshot().challenge, false, route);
      assert.deepEqual(game.snapshot().puzzle.excluded, [0], route);
      assert(game.snapshot().elapsedMs >= 5000, route);
    } finally {
      await game.dispose();
    }
    assert.deepEqual(written?.active?.puzzle.excluded, [0], route);
    assert((written?.active?.elapsedMs ?? 0) >= 5000, route);
  }
});
