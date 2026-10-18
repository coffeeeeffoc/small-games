import test from 'node:test';
import assert from 'node:assert/strict';
import { startNativeXiangqiGame } from '../native.js';
import { CHALLENGES } from '../../../../games/submodules/xiangqi-five/challenges.js';
import { newGame, deployDirectly, deploy } from '../../../../games/submodules/xiangqi-five/game.js';

function fixture(width = 390, height = 844, stored = new Map(), config = {}, overrides = {}) {
  const listeners = new Map();
  const context = new Proxy({}, { get: (target, key) => target[key] ?? (() => {}) });
  const texts = [];
  context.fillText = (value) => texts.push(String(value));
  const info = {
    windowWidth: width,
    windowHeight: height,
    pixelRatio: 2,
    safeArea: { top: 32, bottom: height - 22 },
  };
  const sdk = {
    createCanvas: () => ({ getContext: () => context }),
    getSystemInfoSync: () => info,
    getMenuButtonBoundingClientRect: () => ({ bottom: 64 }),
    getStorageSync: (key) => stored.get(key),
    setStorageSync: (key, value) => stored.set(key, value),
    ...overrides,
  };
  for (const name of [
    'TouchStart',
    'TouchMove',
    'TouchEnd',
    'TouchCancel',
    'Hide',
    'Show',
    'WindowResize',
    'AudioInterruptionBegin',
  ]) {
    sdk['on' + name] = (fn) => listeners.set(name, fn);
    sdk['off' + name] = (fn) => {
      assert.equal(listeners.get(name), fn);
      listeners.delete(name);
    };
  }
  const game = startNativeXiangqiGame(sdk, config, () => {
    throw new Error('PK requires a configured service');
  });
  const point = (x, y, identifier = 1) => ({ clientX: x, clientY: y, identifier });
  const emit = (name, points = [], active = points) =>
    listeners.get(name)({ changedTouches: points, touches: active });
  const tap = (label) => {
    let hit = game.getLayout().hits.find((item) => item.label === label);
    assert(hit, `missing ${label}`);
    if (game.state.page !== 'play' && (hit.y < 72 || hit.y + hit.h > info.windowHeight - 22)) {
      const amount = hit.y < 72 ? hit.y - 72 : hit.y + hit.h - info.windowHeight + 22;
      const a = point(20, info.windowHeight / 2),
        b = point(20, info.windowHeight / 2 - amount);
      emit('TouchStart', [a]);
      emit('TouchMove', [b]);
      emit('TouchEnd', [b], []);
      hit = game.getLayout().hits.find((item) => item.label === label);
    }
    const p = point(hit.x + hit.w / 2, hit.y + hit.h / 2);
    emit('TouchStart', [p]);
    emit('TouchEnd', [p], []);
  };
  const start = (opponent = 'local') => {
    tap('开始对弈');
    tap(opponent === 'computer' ? '电脑对弈' : '同屏双人');
    tap('开始对局');
  };
  return { game, stored, listeners, info, tap, point, emit, texts, start };
}

test('native same-screen games use real rules, old save replay, cancellation and lifecycle', () => {
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [430, 932],
    [844, 390],
  ]) {
    const f = fixture(width, height),
      { game, tap, emit, point } = f;
    try {
      assert.equal(game.state.page, 'home');
      assert(!game.getLayout().hits.some((item) => item.label === '好友挑战'));
      assert.equal(game.state.page, 'home');
      f.start();
      assert.equal(game.state.game.mode, 'xiangqi');
      const hit = game.getLayout().hits.find((item) => item.label.startsWith('棋格'));
      assert(hit);
      assert.equal(hit.w, 44);
      assert.equal(hit.h, 44);
      const p = point(hit.x + 22, hit.y + 22);
      emit('TouchStart', [p]);
      emit('TouchCancel', [p], []);
      emit('TouchEnd', [p], []);
      assert.equal(game.state.game.ply, 0);
      emit('TouchStart', [p]);
      emit('TouchStart', [point(p.clientX, p.clientY, 2)], [p, point(p.clientX, p.clientY, 2)]);
      emit('TouchEnd', [p], []);
      assert.equal(game.state.game.ply, 0);
      tap(hit.label);
      assert.equal(game.state.game.ply, 1);
      assert.equal(game.state.game.turn, 'black');
      tap('抽一枚棋子');
      assert(game.state.game.pending);
      assert.equal(game.state.game.ply, 1);
      const empty = game
        .getLayout()
        .hits.find(
          (item) =>
            item.label.startsWith('棋格') && !game.state.game.board[Number(item.label.slice(2))],
        );
      tap(empty.label);
      assert.equal(game.state.game.ply, 2);
      const original = JSON.stringify(game.state.game);
      emit('Hide');
      assert.equal(game.state.page, 'pause');
      emit('Show');
      assert.equal(game.state.page, 'pause');
      assert.equal(JSON.stringify(game.state.game), original);
      tap('玩法与设置');
      assert.equal(game.state.page, 'help');
      tap('返回');
      assert.equal(game.state.page, 'pause');
      tap('继续对局');
      f.info.windowWidth = height;
      f.info.windowHeight = width;
      f.info.safeArea.bottom = width - 22;
      emit('WindowResize');
      assert.equal(JSON.stringify(game.state.game), original);
      tap('暂停');
      tap('返回首页');
      const restored = fixture(width, height, f.stored);
      assert.equal(JSON.stringify(restored.game.state.game), original);
      restored.game.stop();
      tap('开始对弈');
      tap('同屏双人');
      tap('五子棋盘 15×15');
      assert.equal(game.state.mode, 'xiangqi', 'setup is a draft until confirmed');
      tap('开始对局');
      assert.equal(game.state.page, 'restart');
      tap('确认重开');
      assert.equal(game.state.game.board.length, 225);
      const area = game.getLayout().area,
        a = point(area.x + area.w - 20, area.y + area.h - 20),
        b = point(area.x + 10, area.y + 10);
      emit('TouchStart', [a]);
      emit('TouchMove', [b]);
      emit('TouchEnd', [b], []);
      assert.equal(game.state.game.ply, 0);
      assert(game.getLayout().panX > 0 || game.getLayout().panY > 0);
    } finally {
      game.stop();
      assert.equal(f.listeners.size, 0);
    }
  }
});

test('native computer makes a legal reply using the existing search', async () => {
  const f = fixture();
  try {
    f.start('computer');
    const hit = f.game.getLayout().hits.find((item) => item.label.startsWith('棋格'));
    f.tap(hit.label);
    const deadline = Date.now() + 6000;
    while (f.game.state.game.ply === 1 && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(f.game.state.game.ply, 2);
    assert.equal(f.game.state.game.turn, 'red');
  } finally {
    f.game.stop();
  }
});

test('native red five-in-a-row settles once and survives replay', () => {
  const f = fixture();
  try {
    f.start();
    for (const index of [0, 9, 1, 10, 2, 11, 3, 12, 4]) f.tap(`棋格${index}`);
    assert.equal(f.game.state.page, 'result');
    assert.equal(f.game.state.game.result, 'red');
    assert.equal(f.game.state.game.ply, 9);
    const resumed = fixture(390, 844, f.stored);
    assert.equal(resumed.game.state.game.result, 'red');
    assert.equal(resumed.game.state.game.history.length, 9);
    resumed.game.stop();
    f.tap('再来一局');
    assert.equal(f.game.state.game.ply, 0);
    assert.equal(f.game.state.page, 'play');
  } finally {
    f.game.stop();
  }
});

test('native tactical training uses pinned fixed positions, settles stars and keeps local save', () => {
  const f = fixture();
  try {
    f.start();
    f.tap('棋格0');
    f.tap('暂停');
    f.tap('返回首页');
    const saved = f.stored.get('xiangqi-five-local-v1');
    f.tap('战术练习');
    f.tap('01 一车架桥');
    f.tap('棋格14');
    f.tap('棋格41');
    assert.equal(f.game.state.page, 'result');
    assert.equal(f.game.state.game.result, 'red');
    const progress = JSON.parse(f.stored.get('xiangqi-five-challenges-v1'));
    assert.equal(progress.progress['rook-bridge'].stars, 2);
    assert.equal(progress.progress['rook-bridge'].attempts, 1);
    assert.equal(f.stored.get('xiangqi-five-local-v1'), saved);
    f.tap('查看解法');
    assert.equal(f.game.state.page, 'help');
    f.tap('返回');
    assert.equal(f.game.state.page, 'result');
  } finally {
    f.game.stop();
  }
});

const tick = () => new Promise((resolve) => setImmediate(resolve));
function advertisedFixture(computer = false) {
  const callbacks = {},
    calls = [],
    adShows = [];
  const f = fixture(
    390,
    844,
    new Map(),
    { platform: 'taptap', rewardedAdUnitId: 'slot' },
    {
      createRewardedVideoAd({ adUnitId }) {
        assert.equal(adUnitId, 'slot');
        calls.push('create');
        return {
          onClose: (fn) => {
            callbacks.close = fn;
          },
          onError: (fn) => {
            callbacks.error = fn;
          },
          offClose() {},
          offError() {},
          destroy() {},
          show: async () => {
            adShows.push('show');
          },
          load: async () => {},
        };
      },
    },
  );
  if (computer) f.start('computer');
  else {
    f.tap('战术练习');
    f.tap('01 一车架桥');
  }
  return { ...f, callbacks, calls, adShows };
}

test('native human-computer hints reward only completion, reuse this turn and cancel on pause', async () => {
  for (const status of [
    'completed',
    'dismissed',
    'hide-complete',
    'hide-dismissed',
    'show-first',
    'hide-repeat',
    'pause',
  ]) {
    const f = advertisedFixture(true);
    try {
      // A real immediate winning position keeps this integration test fast and deterministic.
      for (let i = 0; i < 4; i++) f.game.state.game.board[i] = { side: 'red', type: 'pawn' };
      f.tap('获取提示');
      await tick();
      assert.equal(f.calls.length, 1);
      const before = JSON.stringify(f.game.state.game);
      f.tap('棋格4');
      f.tap('抽一枚棋子');
      assert.equal(JSON.stringify(f.game.state.game), before);
      if (status.startsWith('hide') || status === 'show-first') f.emit('Hide');
      if (status === 'show-first') f.emit('Show');
      if (status === 'pause') f.tap('暂停');
      f.callbacks.close({ isEnded: !status.includes('dismissed') });
      await tick();
      if (status === 'hide-repeat') f.emit('Hide');
      if (status.startsWith('hide')) {
        assert.equal(f.game.state.page, 'play');
        f.emit('Show');
        await tick();
      }
      if (status === 'pause') f.tap('继续对局');
      if (['completed', 'hide-complete', 'hide-repeat', 'show-first'].includes(status)) {
        f.tap('重看提示');
        assert.equal(f.calls.length, 1);
        assert(f.texts.join('').includes('直接连五'));
        f.tap('抽一枚棋子');
        f.tap('更新提示');
        await tick();
        assert.equal(f.calls.length, 1, 'revealing the draw must not require a second ad');
      } else {
        assert(f.game.getLayout().hits.some((h) => h.label === '获取提示'));
        assert(f.texts.join('').includes('提示未成功生成'));
      }
    } finally {
      f.game.stop();
    }
  }
});

test('native long analysis can pause, and its retired result cannot cancel a new hint', async () => {
  const f = advertisedFixture(true);
  try {
    f.tap('获取提示');
    await tick();
    f.callbacks.close({ isEnded: true });
    await tick();
    f.tap('暂停');
    assert.equal(f.game.state.page, 'pause');
    assert.equal(f.calls.length, 1, 'analysis starts only after the first ad');
    f.tap('返回首页');
    f.start('computer');
    for (let i = 0; i < 4; i++) f.game.state.game.board[i] = { side: 'red', type: 'pawn' };
    f.tap('获取提示');
    await tick();
    f.callbacks.close({ isEnded: true });
    await tick();
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert(f.game.getLayout().hits.some((hit) => hit.label === '重看提示'));
    assert.equal(f.calls.length, 2);
  } finally {
    f.game.stop();
  }
});

test('native undo is free once, saved, then requires full viewing across Hide/Show', async () => {
  for (const outcome of ['completed', 'dismissed', 'error', 'pause']) {
    const f = advertisedFixture(true);
    try {
      const state = newGame();
      for (const to of [0, 18, 2, 20]) deployDirectly(state, to, () => 0);
      Object.assign(f.game.state.game, state);
      f.emit('WindowResize');
      f.tap('悔棋·免费1次');
      assert.equal(f.calls.length, 1, 'only the preloaded instance exists');
      assert.equal(f.adShows.length, 0, 'the first undo never opens the preloaded ad');
      assert.equal(f.game.state.game.ply, 2);
      assert.equal(f.game.state.game.freeUndoUsed, true);
      const resumed = fixture(390, 844, f.stored);
      assert.equal(resumed.game.state.game.freeUndoUsed, true);
      resumed.game.stop();
      deploy(f.game.state.game, 2);
      deployDirectly(f.game.state.game, 20, () => 0);
      f.emit('WindowResize');
      const before = structuredClone(f.game.state.game);
      f.tap('悔棋');
      await tick();
      assert.equal(f.calls.length, 1);
      f.tap('棋格3');
      f.tap('抽一枚棋子');
      assert.deepEqual(f.game.state.game, before);
      if (outcome === 'pause') f.tap('暂停');
      else f.emit('Hide');
      if (outcome === 'error') f.callbacks.error({ errCode: 1 });
      else f.callbacks.close({ isEnded: outcome !== 'dismissed' });
      await tick();
      assert.deepEqual(f.game.state.game, before, 'no application while hidden or cancelled');
      if (outcome === 'pause') f.tap('继续对局');
      else f.emit('Show');
      await tick();
      if (outcome === 'completed') {
        assert.equal(f.game.state.game.ply, 2);
        assert(f.texts.join('').includes('已悔棋'));
      } else {
        assert.deepEqual(f.game.state.game, before);
        assert(f.texts.join('').includes('未成功获得悔棋次数，悔棋失败'));
      }
    } finally {
      f.game.stop();
    }
  }
});

test('a native deploy hint clears a previously selected rook before tapping the destination', async () => {
  const f = advertisedFixture(true);
  try {
    for (let i = 0; i < 4; i++)
      f.game.state.game.board[i] = { side: 'red', type: i === 3 ? 'rook' : 'pawn' };
    f.tap('棋格3');
    f.tap('获取提示');
    await tick();
    f.callbacks.close({ isEnded: true });
    await tick();
    f.tap('棋格4');
    assert.equal(f.game.state.game.result, 'red');
    assert.equal(f.game.state.game.history.at(-1).action, 'deploy');
  } finally {
    f.game.stop();
  }
});

test('native Tap hint waits for full viewing, freezes board input, and records the one-star limit', async () => {
  const f = advertisedFixture();
  try {
    f.tap('获取提示');
    await tick();
    const board = JSON.stringify(f.game.state.game);
    f.tap('棋格14');
    assert.equal(JSON.stringify(f.game.state.game), board);
    assert.equal(f.game.state.page, 'play');
    f.callbacks.close({ isEnded: true });
    await tick();
    assert.equal(f.game.state.page, 'help');
    f.tap('返回');
    assert.equal(f.game.state.page, 'play');
    f.tap('本题提示');
    assert.equal(f.calls.length, 1, 'the same puzzle hint is already earned');
    f.tap('返回');
    f.tap('棋格14');
    f.tap('棋格41');
    assert.equal(f.game.state.page, 'result');
    assert.equal(
      JSON.parse(f.stored.get('xiangqi-five-challenges-v1')).progress['rook-bridge'].stars,
      1,
    );
  } finally {
    f.game.stop();
  }
});

test('native Tap cancellation, SDK failure, background and disposal never reveal a late hint', async () => {
  for (const operation of ['dismiss', 'error', 'hide', 'stop']) {
    const f = advertisedFixture();
    try {
      f.tap('获取提示');
      await tick();
      if (operation === 'dismiss') f.callbacks.close({ isEnded: false });
      if (operation === 'error') f.callbacks.error({ errCode: 1 });
      if (operation === 'hide') {
        f.emit('Hide');
        f.callbacks.close({ isEnded: false });
      }
      if (operation === 'stop') f.game.stop();
      const page = f.game.state.page;
      f.callbacks.close({ isEnded: true });
      await tick();
      assert.equal(f.game.state.page, page);
      if (operation === 'hide') {
        f.emit('Show');
        await tick();
      }
      if (operation !== 'stop')
        assert(f.game.getLayout().hits.some((hit) => hit.label === '获取提示'));
    } finally {
      if (operation !== 'stop') f.game.stop();
    }
  }
});

test('pause/settings cannot reveal the unpaid tactical hint; non-Tap hints stay free', async () => {
  const f = advertisedFixture();
  try {
    f.tap('暂停');
    f.texts.length = 0;
    f.tap('玩法与设置');
    assert(!f.texts.join('').includes(CHALLENGES[0].hint));
    assert.equal(f.calls.length, 1, 'only the preloaded instance exists');
    assert.equal(f.adShows.length, 0, 'opening rules never starts the preloaded ad');
  } finally {
    f.game.stop();
  }
  const free = fixture();
  try {
    free.tap('战术练习');
    free.tap('01 一车架桥');
    free.tap('本题提示');
    assert.equal(free.game.state.page, 'help');
    free.tap('返回');
    assert.equal(free.game.state.page, 'play');
  } finally {
    free.game.stop();
  }
});

test('draft setup and cancelled restart preserve pending draw and persisted game', () => {
  const f = fixture();
  try {
    f.start();
    f.tap('抽一枚棋子');
    const before = structuredClone(f.game.state.game),
      saved = new Map(f.stored);
    f.tap('暂停');
    f.tap('重新开局');
    assert.equal(f.game.state.page, 'restart');
    f.tap('取消，保留棋局');
    assert.equal(f.game.state.page, 'pause');
    f.tap('调整玩法与难度');
    f.tap('五子棋盘 15×15');
    f.tap('开始对局');
    f.tap('取消，保留棋局');
    assert.deepEqual(f.game.state.game, before);
    assert.deepEqual(f.stored, saved);
    assert.equal(f.game.state.mode, 'xiangqi');
    f.tap('开始对局');
    f.tap('确认重开');
    assert.equal(f.game.state.game.mode, 'gomoku');
    assert.equal(f.game.state.game.pending, null);
  } finally {
    f.game.stop();
  }
});

test('training next puzzle and exit restore opponent, difficulty, pending draw and viewport', () => {
  const f = fixture();
  try {
    f.tap('开始对弈');
    f.tap('电脑对弈');
    f.tap('困难');
    f.tap('五子棋盘 15×15');
    f.tap('开始对局');
    f.tap('抽一枚棋子');
    const area = f.game.getLayout().area,
      a = f.point(area.x + 150, area.y + 120),
      b = f.point(area.x + 30, area.y + 30);
    f.emit('TouchStart', [a]);
    f.emit('TouchMove', [b]);
    f.emit('TouchEnd', [b], []);
    const before = structuredClone(f.game.state),
      { panX, panY } = f.game.getLayout();
    const saved = f.stored.get('xiangqi-five-local-v1');
    f.tap('暂停');
    f.tap('返回首页');
    f.tap('战术练习');
    f.tap('01 一车架桥');
    f.tap('棋格14');
    f.tap('棋格41');
    f.tap('下一题');
    assert.equal(f.game.state.page, 'play');
    f.tap('暂停');
    f.tap('返回原棋局');
    assert.deepEqual(f.game.state, before);
    assert.equal(f.game.getLayout().panX, panX);
    assert.equal(f.game.getLayout().panY, panY);
    assert.equal(f.stored.get('xiangqi-five-local-v1'), saved);
  } finally {
    f.game.stop();
  }
});

test('resignation settlement names resignation instead of a nonexistent five-line', () => {
  const f = fixture();
  try {
    f.start();
    f.tap('棋格0');
    Object.assign(f.game.state.game, { result: 'red', resigned: 'black' });
    f.tap('暂停');
    f.tap('返回首页');
    f.texts.length = 0;
    f.tap('继续对局');
    assert(f.texts.includes('黑方认输，红方获胜'));
    assert(!f.texts.some((text) => text.includes('连五获胜')));
  } finally {
    f.game.stop();
  }
});

test('optional visual assets tolerate unavailable APIs, errors and late completion after stop', () => {
  const images = [];
  const overrides = {
    createImage() {
      const image = { width: 1024, height: 1024 };
      images.push(image);
      return image;
    },
  };
  const legacy = fixture(390, 844, new Map(), {}, overrides);
  assert.equal(images.length, 0, 'legacy packages do not request missing art');
  legacy.game.stop();
  const f = fixture(
    390,
    844,
    new Map(),
    { visualAssets: { pavilion: 'pavilion.png', logo: 'logo.webp' } },
    overrides,
  );
  try {
    assert.deepEqual(
      images.map((image) => image.src),
      ['pavilion.png', 'logo.webp'],
    );
    images[0].onerror();
    images[1].onload();
    f.start();
    assert.equal(f.game.state.page, 'play');
    const late = images[0].onload;
    f.game.stop();
    const count = f.texts.length;
    late();
    assert.equal(f.texts.length, count);
    assert.equal(images[1].onload, null);
  } finally {
    if (f.listeners.size) f.game.stop();
  }
});

test('native onShown clears the game fallback; repeated Hide preserves a completed long ad', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = advertisedFixture();
  try {
    f.tap('获取提示');
    await tick();
    f.emit('Hide');
    t.mock.timers.tick(600_000);
    await tick();
    assert.equal(f.game.state.page, 'play');
    f.callbacks.close({ isEnded: true });
    await tick();
    f.emit('Hide');
    f.emit('Hide');
    assert.equal(f.game.state.page, 'play');
    f.emit('Show');
    await tick();
    assert.equal(f.game.state.page, 'help');
  } finally {
    f.game.stop();
  }
});

test('earned computer hint and first undo survive training, next puzzle and original-turn return', async () => {
  const f = advertisedFixture(true);
  try {
    for (let i = 0; i < 4; i++) f.game.state.game.board[i] = { side: 'red', type: 'pawn' };
    f.game.state.game.freeUndoUsed = true;
    f.stored.set(
      'xiangqi-five-local-v1',
      JSON.stringify({ ...JSON.parse(f.stored.get('xiangqi-five-local-v1')), freeUndoUsed: true }),
    );
    f.tap('获取提示');
    await tick();
    f.callbacks.close({ isEnded: true });
    await tick();
    assert(f.game.getLayout().hits.some((hit) => hit.label === '重看提示'));
    const before = structuredClone(f.game.state.game),
      count = f.adShows.length;
    f.tap('暂停');
    const saved = f.stored.get('xiangqi-five-local-v1');
    f.tap('返回首页');
    f.tap('战术练习');
    f.tap('01 一车架桥');
    f.tap('棋格14');
    f.tap('棋格41');
    f.tap('下一题');
    f.tap('暂停');
    f.tap('返回原棋局');
    assert.deepEqual(f.game.state.game, before);
    assert.equal(f.stored.get('xiangqi-five-local-v1'), saved);
    f.tap('重看提示');
    await tick();
    assert.equal(f.adShows.length, count);
    assert.equal(f.game.state.game.freeUndoUsed, true);
  } finally {
    f.game.stop();
  }
});
