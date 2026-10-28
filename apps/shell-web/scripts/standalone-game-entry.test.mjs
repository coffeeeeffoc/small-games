import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ashfallInput } from './game-checks/ashfall-front.mjs';
import {
  markers,
  homeControls,
  legacyEntryIds,
  entryMode,
  enterStandalone,
} from './standalone-game-entry.mjs';
test('every registered standalone has one explicit adapter or legacy mode and a gameplay branch', async () => {
  const games = JSON.parse(
    await readFile(new URL('../src/standalone-games.json', import.meta.url)),
  );
  const source = await readFile(new URL('./standalone-game-checks.mjs', import.meta.url), 'utf8');
  assert.equal(new Set(legacyEntryIds).size, legacyEntryIds.length);
  for (const game of games) {
    assert(markers[game.id]);
    assert.equal(
      Number(Object.hasOwn(homeControls, game.id)) + Number(legacyEntryIds.includes(game.id)),
      1,
      game.id,
    );
    assert(['adapter', 'legacy'].includes(entryMode(game.id)));
    assert(source.includes(`id === '${game.id}'`), `Missing legacy/gameplay branch ${game.id}`);
  }
  assert.throws(() => entryMode('new-unreviewed-game'), /Missing/);
});
test('explicit legacy mode leaves the original native interaction flow in charge', async () => {
  const frame = {
    locator: () => {
      throw new Error('Legacy entry must remain in the existing assertion');
    },
  };
  for (const id of legacyEntryIds) assert.equal(await enterStandalone(frame, id, true), 'legacy');
});
test('entry adapters never force clicks and have only stable semantic selectors', async () => {
  const source = await readFile(new URL('./standalone-game-entry.mjs', import.meta.url), 'utf8');
  assert(!/force\s*:/.test(source));
  for (const control of Object.values(homeControls))
    for (const selector of Array.isArray(control) ? control : [control])
      assert(/^#|^\[data-/.test(selector));
});

test('word island readiness is home, with an explicit start adapter before board assertions', () => {
  assert.equal(markers['letters-words2'], '#focus-button');
  assert.equal(homeControls['letters-words2'], '#focus-button');
  assert.equal(entryMode('letters-words2'), 'adapter');
});

test('street chase uses real Cocos canvas controls', () => {
  assert.equal(markers['chase-thief'], '#GameCanvas');
  assert.equal(homeControls['chase-thief'], undefined);
  assert.equal(entryMode('chase-thief'), 'legacy');
});

test('Place & Clear uses its visible Creator canvas and game-owned start flow', () => {
  assert.equal(markers['place-and-clear'], '#GameCanvas');
  assert.equal(homeControls['place-and-clear'], undefined);
  assert.equal(entryMode('place-and-clear'), 'legacy');
});

test('Tianxia enters its ready Creator battlefield through preparation', () => {
  assert.equal(markers['tianxia-chalu'], '#start');
  assert.deepEqual(homeControls['tianxia-chalu'], ['#start', '#begin-battle']);
  assert.equal(entryMode('tianxia-chalu'), 'adapter');
});

test('Tower Creator owns its native menu and touch flow', async () => {
  assert.equal(markers['tower-brake'], '#GameCanvas');
  assert.equal(homeControls['tower-brake'], undefined);
  assert.equal(entryMode('tower-brake'), 'legacy');
  assert.equal(
    await enterStandalone(
      {
        locator() {
          throw Error('No DOM click for Creator');
        },
      },
      'tower-brake',
      true,
    ),
    'legacy',
  );
});

test('Tetracube waits for the real Creator scene and owns its canvas input flow', () => {
  assert.equal(markers.tetracube, 'body[data-tetracube-ready="true"]');
  assert.equal(homeControls.tetracube, undefined);
  assert.equal(entryMode('tetracube'), 'legacy');
});

test('Castle Cannon uses the Creator canvas and game-owned portrait controls', () => {
  assert.equal(markers['castle-cannon'], '#GameCanvas');
  assert.equal(homeControls['castle-cannon'], undefined);
  assert.equal(entryMode('castle-cannon'), 'legacy');
});

test('Ashfall uses the visible Creator canvas and game-owned touch flow', () => {
  assert.equal(markers['ashfall-front'], '#GameCanvas');
  assert.equal(homeControls['ashfall-front'], undefined);
  assert.equal(entryMode('ashfall-front'), 'legacy');
});

function ashfallTouchFixture(send) {
  const cdp = { send, detach: async () => {} };
  const page = { context: () => ({ newCDPSession: async () => cdp }) };
  return {
    locator: (selector) =>
      selector === 'canvas'
        ? { page: () => page }
        : {
            evaluate: async () => ({
              controls: [{ id: 'fire', x: 10, y: 20, w: 50, h: 60 }],
            }),
            boundingBox: async () => ({ x: 100, y: 200 }),
          },
  };
}

test('Ashfall taps enqueue release before a delayed press acknowledgement and await both replies', async () => {
  let acknowledgePress, acknowledgeRelease, signalPress;
  const pressReply = new Promise((resolve) => (acknowledgePress = resolve));
  const releaseReply = new Promise((resolve) => (acknowledgeRelease = resolve));
  const pressSent = new Promise((resolve) => (signalPress = resolve));
  const calls = [];
  const input = await ashfallInput(
    ashfallTouchFixture(async (method, params) => {
      calls.push({ method, ...params });
      if (params.type === 'touchStart') {
        signalPress();
        return pressReply;
      }
      return releaseReply;
    }),
    true,
  );
  let finished = false;
  const tapping = input.tap('fire').then(() => (finished = true));
  await pressSent;
  try {
    assert.deepEqual(
      calls.map((call) => call.type),
      ['touchStart', 'touchEnd'],
    );
    assert.deepEqual(calls[0].touchPoints, [{ x: 135, y: 250, id: 1 }]);
    assert.deepEqual(calls[1].touchPoints, []);
    assert(calls.every((call) => call.method === 'Input.dispatchTouchEvent'));
    assert.equal(finished, false);
    acknowledgePress();
    await new Promise(setImmediate);
    assert.equal(finished, false, 'release acknowledgement is still required');
    acknowledgeRelease();
    await tapping;
    assert.equal(finished, true);
  } finally {
    acknowledgePress();
    acknowledgeRelease();
    await tapping;
    await input.dispose();
  }
});

test('Ashfall holds wait for explicit release and failed taps remain cancellable', async () => {
  const held = [];
  const holdInput = await ashfallInput(
    ashfallTouchFixture(async (_method, params) => held.push(params.type)),
    true,
  );
  await holdInput.press(['fire']);
  assert.deepEqual(held, ['touchStart']);
  await holdInput.release();
  assert.deepEqual(held, ['touchStart', 'touchEnd']);
  await holdInput.dispose();
  assert.deepEqual(held, ['touchStart', 'touchEnd']);

  const failed = [];
  const failedInput = await ashfallInput(
    ashfallTouchFixture(async (_method, params) => {
      failed.push(params.type);
      if (params.type === 'touchEnd') throw Error('release acknowledgement failed');
    }),
    true,
  );
  await assert.rejects(failedInput.tap('fire'), /release acknowledgement failed/);
  await failedInput.dispose();
  assert.deepEqual(failed, ['touchStart', 'touchEnd', 'touchCancel']);
});

test('Nullrange preserves its ID and uses native Creator controls with scaled, rotated iframe coordinates', async () => {
  const { controlPoint } = await import('./game-checks/nullrange.mjs');
  assert.equal(markers['vibeJam-myself-nullrange'], '#GameCanvas');
  assert.equal(homeControls['vibeJam-myself-nullrange'], undefined);
  assert.equal(entryMode('vibeJam-myself-nullrange'), 'legacy');
  const control = { x: 100, y: 50, w: 60, h: 48 };
  const state = { scale: 0.5 };
  assert.deepEqual(controlPoint(state, control, { x: 20, y: 30, width: 844, height: 390 }), {
    x: 85,
    y: 67,
  });
  assert.deepEqual(controlPoint(state, control, { x: 20, y: 30, width: 390, height: 844 }), {
    x: 373,
    y: 95,
  });
});
