import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  nativeInvitation,
  readNativeInvitation,
  createRematchResolver,
  copyNativeInvitation,
} from '../platforms/competition/native.js';

const game = 'xiangqi-five';
const original = {
  code: 'ABCDEFABCDEF',
  game,
  status: 'finished',
  token: 'private',
  playerId: 'private',
};

test('shares only allowlisted public fields, with a valid same-game invitation', () => {
  const payload = nativeInvitation({ game, title: '象五子棋', token: 'secret' }, '012345ABCDEF');
  assert.deepEqual(payload, {
    title: '象五子棋 · 好友挑战',
    query: 'game=xiangqi-five&matchId=012345ABCDEF&entry=challenge',
  });
  assert.doesNotMatch(JSON.stringify(payload), /token|playerId|secret|private/);
  assert.throws(() => nativeInvitation({ game: 'foreign-game' }, '012345ABCDEF'), /无效/);
  assert.throws(() => nativeInvitation({ game }, 'ABCDEF?token=secret'), /无效/);
  assert.deepEqual(
    readNativeInvitation({ game, matchId: '012345abcdef', entry: 'challenge' }, game),
    { code: '012345ABCDEF' },
  );
  assert.deepEqual(readNativeInvitation({ pk: 'abcdefabcdef' }, game), { code: 'ABCDEFABCDEF' });
});

test('foreign games, missing routing, malformed codes and unknown entries never produce a join code', () => {
  for (const query of [
    { game: 'letters-words2', matchId: 'ABCDEFABCDEF', entry: 'challenge' },
    { matchId: 'ABCDEFABCDEF', entry: 'challenge' },
    { game, matchId: 'ABCDEFABCDEF' },
    { game, matchId: 123, entry: 'challenge' },
    { game, matchId: '../rooms/private', entry: 'challenge' },
    { game, pk: 'ABCDEFABCDEF', entry: 'unknown' },
  ]) {
    const result = readNativeInvitation(query, game);
    assert.equal(result.code, '');
    assert.ok(result.message);
  }
  assert.match(
    readNativeInvitation({ game: 'letters-words2', pk: 'ABCDEFABCDEF' }, game).message,
    /另一款游戏/,
  );
});

test('either original seat can create a waiting rematch and concurrent calls reuse one exact room', async () => {
  for (const you of [0, 1]) {
    const sent = [];
    let complete;
    const resolver = createRematchResolver((path, init) => {
      sent.push({ path, init });
      return new Promise((resolve) => {
        complete = resolve;
      });
    }, game);
    const room = { ...original, you };
    const a = resolver(room),
      b = resolver(room);
    assert.equal(a, b);
    await Promise.resolve();
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0], { path: '/rooms/ABCDEFABCDEF/rematch', init: { body: '{}' } });
    complete({ ...original, rematch: '012345ABCDEF' });
    assert.equal(await a, '012345ABCDEF');
    assert.equal(await resolver(room), '012345ABCDEF');
    assert.equal(sent.length, 1);
    assert.equal(room.status, 'finished', 'sharing does not overwrite original results');
    assert.ok(sent.every(({ path }) => !path.endsWith('/ready') && !path.endsWith('/actions')));
  }
});

test('failed or malformed rematches can retry and unfinished rooms never create one', async () => {
  let attempts = 0;
  const resolver = createRematchResolver(async () => {
    attempts++;
    if (attempts === 1) throw new Error('offline');
    if (attempts === 2) return { game, rematch: original.code };
    if (attempts === 3) return { game: 'letters-words2', rematch: '012345ABCDEF' };
    return { game, rematch: '012345ABCDEF' };
  }, game);
  await assert.rejects(resolver({ ...original, status: 'playing' }), /尚未结束/);
  assert.equal(attempts, 0);
  await assert.rejects(resolver(original), /offline/);
  await assert.rejects(resolver(original), /暂不可用/);
  await assert.rejects(resolver(original), /暂不可用/);
  assert.equal(await resolver(original), '012345ABCDEF');
});

test('clipboard requires confirmed success and degrades on missing, callback failure, throw or rejection', async () => {
  const data = '公开房间码 ABCDEFABCDEF';
  const cases = [
    [{}, false],
    [
      {
        setClipboardData({ data: received, success }) {
          assert.equal(received, data);
          success();
        },
      },
      true,
    ],
    [
      {
        setClipboardData({ fail }) {
          fail();
        },
      },
      false,
    ],
    [
      {
        setClipboardData() {
          throw new Error('denied');
        },
      },
      false,
    ],
    [{ setClipboardData: async () => undefined }, true],
    [
      {
        setClipboardData: async () => {
          throw new Error('denied');
        },
      },
      false,
    ],
    [{ setClipboardData() {} }, false],
  ];
  for (const [sdk, expected] of cases)
    assert.equal(await copyNativeInvitation(sdk, data, 10), expected);
});

test('disposal cancels pending clipboard callbacks without claiming success', async () => {
  let cancel,
    lateSuccess,
    removed = 0;
  const result = copyNativeInvitation(
    {
      setClipboardData({ success }) {
        lateSuccess = success;
      },
    },
    '房间码',
    4000,
    (listener) => {
      cancel = listener;
      return () => {
        removed++;
      };
    },
  );
  cancel();
  assert.equal(await result, false);
  lateSuccess();
  assert.equal(removed, 1);
});
