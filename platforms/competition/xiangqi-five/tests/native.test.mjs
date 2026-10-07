import test from 'node:test';
import assert from 'node:assert/strict';
import { startNativeXiangqiGame } from '../native.js';

function fixture(width = 390, height = 844, stored = new Map()) {
  const listeners = new Map();
  const context = new Proxy({}, { get: (target, key) => target[key] ?? (() => {}) });
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
  const game = startNativeXiangqiGame(sdk, {}, () => {
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
  return { game, stored, listeners, info, tap, point, emit };
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
      tap('好友挑战');
      assert.equal(game.state.page, 'home');
      tap('同屏双人');
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
      tap('棋盘：象棋盘');
      assert.equal(
        game.state.mode,
        'gomoku',
        `mode switch ${width}x${height}: ${JSON.stringify(game.getLayout())}`,
      );
      tap('同屏双人');
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
    f.tap('电脑对弈');
    const hit = f.game.getLayout().hits.find((item) => item.label.startsWith('棋格'));
    f.tap(hit.label);
    await new Promise((resolve) => setTimeout(resolve, 450));
    assert.equal(f.game.state.game.ply, 2);
    assert.equal(f.game.state.game.turn, 'red');
  } finally {
    f.game.stop();
  }
});

test('native red five-in-a-row settles once and survives replay', () => {
  const f = fixture();
  try {
    f.tap('同屏双人');
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
    f.tap('同屏双人');
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
