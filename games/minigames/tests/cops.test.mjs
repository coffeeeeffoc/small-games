import test from 'node:test';
import assert from 'node:assert/strict';
import { startCocosCopsGame } from '../cops-robbers/controller.mjs';
import { initialState, legalTargets, step } from '../../local/cops-robbers/src/engine.js';
import { levels } from '../../local/cops-robbers/src/levels.js';
import { relayLevels } from '../../local/cops-robbers/src/relay.js';
import { quickTrials, quickSolutions } from '../../local/cops-robbers/src/quick-trials.js';
import { optimalRelaySolutions } from '../../local/cops-robbers/src/optimal-solutions.js';
import { getDuelLevel } from '../../local/cops-robbers/src/duel-levels.js';
import {
  initialDuel,
  legalDuelTargets,
  stepDuel,
  chooseDuelAction,
} from '../../local/cops-robbers/src/duel.js';

function fixture({
  saved = {},
  size = [390, 844],
  random = 0.9,
  config = {},
  competition,
  art = false,
} = {}) {
  let clock = 1000,
    nextTimer = 0;
  const timers = new Map(),
    callbacks = [],
    listeners = new Map(),
    writes = [],
    storage = new Map(Object.entries(saved)),
    images = [],
    draws = [];
  const context = new Proxy(
    {},
    {
      get: (_, key) =>
        key === 'createLinearGradient'
          ? () => ({ addColorStop() {} })
          : key === 'drawImage'
            ? (...args) => draws.push(args)
            : key === 'measureText'
              ? (text) => ({ width: String(text).length * 15 })
              : () => {},
    },
  );
  const canvas = { width: 0, height: 0, getContext: () => context };
  const sdk = {
    createCanvas() {
      return canvas;
    },
    getSystemInfoSync: () => ({
      windowWidth: size[0],
      windowHeight: size[1],
      pixelRatio: 2,
      safeArea: { top: 28, bottom: size[1] - 18 },
    }),
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => {
      storage.set(key, value);
      writes.push([key, JSON.parse(value)]);
    },
  };
  if (art)
    sdk.createImage = () => {
      const image = { width: 1536, height: 1024 };
      images.push(image);
      return image;
    };
  for (const name of [
    'TouchStart',
    'TouchMove',
    'TouchEnd',
    'TouchCancel',
    'Hide',
    'Show',
    'WindowResize',
  ]) {
    sdk[`on${name}`] = (listener) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
    };
    sdk[`off${name}`] = (listener) => listeners.get(name)?.delete(listener);
  }
  const scheduler = {
    now: () => clock,
    random: () => random,
    setTimeout: (callback) => {
      const id = ++nextTimer;
      timers.set(id, callback);
      callbacks.push(callback);
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  const game = startCocosCopsGame(sdk, { ...config, scheduler }, competition);
  const emit = (name, event = {}) => {
    for (const callback of [...(listeners.get(name) || [])]) callback(event);
  };
  const hit = (id) => {
    const value = game.getState().hits.find((item) => item.id === id);
    assert.ok(
      value,
      `Missing ${id} in ${game.getState().page}: ${game.getState().hits.map((item) => item.id)}`,
    );
    return value;
  };
  const touch = (id) => {
    const value = hit(id);
    return { identifier: 1, clientX: value.x + value.w / 2, clientY: value.y + value.h / 2 };
  };
  const tap = (id) => {
    clock += 200;
    const point = touch(id);
    emit('TouchStart', { touches: [point] });
    emit('TouchEnd', { touches: [], changedTouches: [point] });
  };
  const runAI = () => {
    assert.equal(timers.size, 1, 'one AI task');
    const [id, callback] = timers.entries().next().value;
    timers.delete(id);
    callback();
  };
  const selectMode = (mode) => {
    tap('modes');
    tap(`mode:${mode}`);
  };
  return {
    game,
    sdk,
    storage,
    writes,
    timers,
    callbacks,
    size,
    listeners,
    emit,
    hit,
    touch,
    tap,
    runAI,
    selectMode,
    images,
    draws,
  };
}

test('original home, garden and illustrated actors load, redraw and detach on disposal', () => {
  const f = fixture({ art: true });
  assert.deepEqual(f.images.map((image) => image.src).sort(), [
    'home-chase.webp',
    'patrol-characters.webp',
    'patrol-garden.webp',
  ]);
  for (const image of f.images) image.onload();
  assert(f.draws.some(([image]) => image.src === 'home-chase.webp'));
  f.tap('start');
  assert(f.draws.some(([image]) => image.src === 'patrol-garden.webp'));
  assert(f.draws.some(([image, x]) => image.src === 'patrol-characters.webp' && x === 0));
  assert(f.draws.some(([image, x]) => image.src === 'patrol-characters.webp' && x === 768));
  assert.deepEqual(f.game.getState().art.failed, []);
  const callback = f.images[0].onload;
  f.game.dispose();
  const count = f.draws.length;
  callback();
  assert.equal(f.draws.length, count, 'late image callbacks must not redraw a disposed game');
  assert(f.images.every((image) => image.onload === null && image.onerror === null));
});

test('tapping an officer at its feet selects it without consuming a move', () => {
  const f = fixture();
  f.tap('start');
  const before = f.game.getState().board;
  f.tap(`node${before.cops[1]}`);
  assert.equal(f.game.getState().selected, 1, 'the officer takes priority over its own junction');
  assert.deepEqual(f.game.getState().board, before);
  f.tap(`node${before.cops[1]}`);
  assert.deepEqual(
    f.game.getState().board,
    before,
    'selecting the officer again must not wait a turn',
  );
  const target = legalTargets(levels[0], before, 1).find((node) => node !== before.cops[1]);
  if (target !== undefined) {
    f.tap(`node${target}`);
    const plan = [...before.cops];
    plan[1] = target;
    assert.deepEqual(f.game.getState().board, step(levels[0], before, plan).state);
  }
  f.game.dispose();
});

test('five modes and setup controls fit a 320 × 568 safe area', () => {
  const f = fixture({ size: [320, 568] });
  const check = () => {
    for (const hit of f.game.getState().hits) {
      assert.ok(hit.w >= 44 && hit.h >= 44, hit.id);
      assert.ok(
        hit.x >= 0 && hit.y >= 28 && hit.x + hit.w <= 320 && hit.y + hit.h <= 550,
        `${hit.id} outside safe area`,
      );
    }
  };
  f.tap('modes');
  check();
  assert.deepEqual(
    f.game
      .getState()
      .hits.filter((hit) => hit.id.startsWith('mode:'))
      .map((hit) => hit.id),
    ['mode:standard', 'mode:relay', 'mode:quick', 'mode:escape', 'mode:survival'],
  );
  f.tap('mode:escape');
  check();
  assert.equal(f.game.getState().page, 'setup');
  f.tap('role:runner');
  f.tap('initiative:second');
  f.tap('start');
  check();
  f.game.dispose();
});

test('escape and survival preserve both roles and all initiative choices', () => {
  for (const mode of ['escape', 'survival'])
    for (const role of ['pursuer', 'runner'])
      for (const initiative of ['first', 'second', 'random']) {
        const f = fixture();
        f.selectMode(mode);
        f.tap(`role:${role}`);
        f.tap(`initiative:${initiative}`);
        f.tap('start');
        const level = getDuelLevel(mode, 1),
          other = role === 'pursuer' ? 'runner' : 'pursuer';
        const first = initiative === 'random' ? 'runner' : initiative === 'first' ? role : other;
        assert.equal(f.game.getState().firstSide, first, `${mode}/${role}/${initiative}`);
        assert.deepEqual(f.game.getState().board, initialDuel(level, first));
        if (first !== role) {
          assert.equal(
            f.game.getState().hits.some((hit) => hit.id === 'wait'),
            false,
            'cannot play the AI turn',
          );
          const before = f.game.getState().board;
          f.runAI();
          assert.deepEqual(
            f.game.getState().board,
            stepDuel(level, before, chooseDuelAction(level, before)),
          );
        }
        const before = f.game.getState().board,
          positions = role === 'runner' ? before.robbers : before.cops;
        f.tap('wait');
        assert.deepEqual(
          f.game.getState().board,
          stepDuel(level, before, { type: 'move', side: role, actor: 0, target: positions[0] }),
        );
        f.tap('pause');
        f.tap('retry');
        assert.equal(f.game.getState().firstSide, first, 'retry preserves the actual first side');
        assert.deepEqual(f.game.getState().board, initialDuel(level, first));
        f.game.dispose();
      }
});

test('AI callbacks cannot act after pause, background, mode change or disposal', () => {
  const f = fixture();
  f.selectMode('escape');
  f.tap('initiative:second');
  f.tap('start');
  const before = f.game.getState().board,
    oldAI = f.callbacks.at(-1);
  f.tap('pause');
  assert.equal(f.timers.size, 0);
  oldAI();
  assert.deepEqual(f.game.getState().board, before);
  f.tap('resume');
  assert.equal(f.timers.size, 1);
  oldAI();
  assert.equal(
    f.game.getState().aiPending,
    true,
    'stale callback does not clear the current AI handle',
  );
  const hiddenAI = f.callbacks.at(-1);
  f.emit('Hide');
  f.emit('Show');
  hiddenAI();
  assert.equal(f.game.getState().page, 'pause');
  assert.equal(f.timers.size, 0);
  assert.deepEqual(f.game.getState().board, before);
  f.tap('resume');
  f.runAI();
  assert.equal(f.game.getState().board.turn, 1);
  assert.equal(f.timers.size, 0);
  f.tap('wait');
  const abandonedAI = f.callbacks.at(-1);
  f.tap('pause');
  f.tap('home');
  f.selectMode('quick');
  f.tap('start');
  const quick = f.game.getState().board;
  abandonedAI();
  assert.deepEqual(f.game.getState().board, quick);
  f.tap('pause');
  f.tap('home');
  f.selectMode('survival');
  f.tap('initiative:second');
  f.tap('start');
  const disposedAI = f.callbacks.at(-1),
    last = f.game.getState().board;
  f.game.dispose();
  f.game.dispose();
  disposedAI();
  assert.deepEqual(f.game.getState().board, last);
  assert.equal(f.timers.size, 0);
  assert.equal(
    [...f.listeners.values()].reduce((total, listeners) => total + listeners.size, 0),
    0,
  );
});

test('duel movement and capture use original rules and progress is isolated by role and mode', () => {
  const level = getDuelLevel('escape', 1);
  const runner = level.robbers[0];
  const adjacent = level.adj[runner].find((node) => !level.cops.slice(1).includes(node));
  assert.ok(Number.isInteger(adjacent));
  const state = { ...initialDuel(level), cops: [adjacent, ...level.cops.slice(1)] };
  const f = fixture({
    saved: {
      'cops-robbers-duel-v1': {
        'solo-mode': 'escape',
        'solo-role': 'pursuer',
        wins: {},
        sessions: {
          'escape:pursuer': {
            mode: 'escape',
            role: 'pursuer',
            firstSide: 'pursuer',
            levelId: 1,
            state,
          },
        },
        extra: 'keep',
      },
    },
  });
  f.tap('start');
  f.tap(`node${runner}`);
  assert.equal(f.game.getState().outcome, 'won');
  assert.equal(f.game.getState().page, 'result');
  assert.deepEqual(
    f.game.getState().board,
    stepDuel(level, state, { type: 'move', side: 'pursuer', actor: 0, target: runner }),
  );
  const save = JSON.parse(f.storage.get('cops-robbers-duel-v1'));
  assert.deepEqual(save.wins, { 'escape:pursuer:1': true });
  assert.equal(save.extra, 'keep');
  f.tap('continue');
  assert.equal(f.game.getState().levelId, 2);
  f.tap('pause');
  f.tap('home');
  f.tap('setup');
  f.tap('role:runner');
  f.tap('levels');
  assert.ok(f.game.getState().hits.some((hit) => hit.id === 'level:1'));
  assert.equal(
    f.game.getState().hits.some((hit) => hit.id === 'level:2'),
    false,
  );
  f.game.dispose();
});

test('survival deadline and escape exits award the runner through original duel rules', () => {
  for (const mode of ['survival', 'escape']) {
    const level = getDuelLevel(mode, 1);
    let state = { ...initialDuel(level, 'runner'), turn: level.roundLimit * 2 - 1 },
      target = state.robbers[0];
    if (mode === 'escape') {
      const exit = level.exits.find((node) =>
        level.adj[node].some((adjacent) => !level.cops.includes(adjacent)),
      );
      const adjacent = level.adj[exit].find((node) => !level.cops.includes(node));
      state = { ...initialDuel(level, 'runner'), robbers: [adjacent] };
      target = exit;
    }
    const f = fixture({
      saved: {
        'cops-robbers-duel-v1': {
          'solo-mode': mode,
          'solo-role': 'runner',
          sessions: {
            [`${mode}:runner`]: { mode, role: 'runner', firstSide: 'runner', levelId: 1, state },
          },
        },
      },
    });
    f.tap('start');
    assert.ok(legalDuelTargets(level, state, 0).includes(target));
    if (target === state.robbers[0]) f.tap('wait');
    else f.tap(`node${target}`);
    assert.equal(f.game.getState().outcome, 'won');
    assert.equal(f.game.getState().board.winner, 'runner');
    assert.equal(JSON.parse(f.storage.get('cops-robbers-duel-v1')).wins[`${mode}:runner:1`], true);
    f.game.dispose();
  }
});

test('campaigns retain canonical moves, relay baton, certified hints and quick victory', () => {
  const f = fixture({
    saved: { 'cops-robbers-v3': { completed: { 1: { turns: 7, stars: 3 } }, extra: 'keep' } },
  });
  f.tap('start');
  assert.equal(f.game.getState().levelId, 2);
  const before = f.game.getState().board,
    target = legalTargets(levels[1], before, 0).find((node) => node !== before.cops[0]);
  f.tap(`node${target}`);
  const plan = [...before.cops];
  plan[0] = target;
  assert.deepEqual(f.game.getState().board, step(levels[1], before, plan).state);
  f.tap('undo');
  assert.deepEqual(f.game.getState().board, before);
  f.tap('pause');
  f.tap('home');
  f.selectMode('relay');
  f.tap('start');
  f.tap('hint');
  const relayBefore = f.game.getState().board,
    answer = optimalRelaySolutions[relayLevels[0].id][0],
    actor = answer.findIndex((node, index) => node !== relayBefore.cops[index]);
  assert.equal(f.game.getState().hintNode, answer[Math.max(0, actor)]);
  if (actor >= 0) f.tap(`node${answer[actor]}`);
  else f.tap('wait');
  assert.equal(f.game.getState().board.relayLast, actor);
  f.tap('undo');
  assert.equal(f.game.getState().board.relayLast, -1);
  f.tap('pause');
  f.tap('home');
  f.selectMode('quick');
  f.tap('start');
  for (const plan of quickSolutions[1]) {
    const board = f.game.getState().board,
      actor = plan.findIndex((node, index) => node !== board.cops[index]);
    if (actor < 0) f.tap('wait');
    else {
      f.tap(`cop${actor}`);
      f.tap(`node${plan[actor]}`);
    }
  }
  assert.equal(f.game.getState().outcome, 'won');
  assert.equal(f.game.getState().page, 'result');
  const save = JSON.parse(f.storage.get('cops-robbers-v3'));
  assert.equal(save.quickCompleted[1].stars, 3);
  assert.equal(save.extra, 'keep');
  assert.equal(save.completed[1].stars, 3);
  f.tap('continue');
  assert.equal(f.game.getState().levelId, 2);
  assert.deepEqual(f.game.getState().board, initialState(quickTrials[1]));
  f.game.dispose();
});

test('legacy campaign resume, cancelled touch, resize and storage failure do not lose a playable session', () => {
  const level = levels[20],
    state = initialState(level);
  const f = fixture({
    saved: {
      'cops-robbers-v3': {
        version: 3,
        current: { mode: 'challenge', rule: 'standard', levelId: level.id, state, history: [] },
      },
    },
  });
  f.tap('start');
  assert.equal(
    f.game.getState().levelId,
    level.id,
    'valid legacy in-progress map remains resumable',
  );
  const point = f.touch('wait');
  f.emit('TouchStart', { touches: [point] });
  f.emit('TouchCancel');
  f.emit('TouchEnd', { touches: [], changedTouches: [point] });
  assert.deepEqual(f.game.getState().board, state);
  f.emit('TouchStart', { touches: [point] });
  f.emit('TouchMove', { touches: [{ ...point, clientX: -10 }] });
  f.emit('TouchEnd', { touches: [], changedTouches: [point] });
  assert.deepEqual(f.game.getState().board, state);
  f.emit('TouchStart', { touches: [point, { ...point, identifier: 2 }] });
  f.emit('TouchEnd', { touches: [], changedTouches: [point] });
  assert.deepEqual(f.game.getState().board, state);
  f.size[0] = 320;
  f.size[1] = 568;
  f.emit('WindowResize');
  assert.deepEqual(f.game.getState().board, state);
  f.sdk.setStorageSync = () => {
    throw new Error('storage unavailable');
  };
  f.tap('wait');
  assert.equal(f.game.getState().storageOK, false);
  assert.equal(f.game.getState().board.turn, 1);
  f.game.dispose();
});

test('duel session resumes without double AI and malformed progress does not unlock levels', () => {
  const f = fixture();
  f.selectMode('survival');
  f.tap('role:runner');
  f.tap('initiative:second');
  f.tap('start');
  f.runAI();
  const before = f.game.getState().board;
  f.game.dispose();
  const g = fixture({ saved: Object.fromEntries(f.storage) });
  g.tap('start');
  assert.deepEqual(g.game.getState().board, before);
  assert.equal(g.timers.size, 0);
  g.game.dispose();
  const corrupt = fixture({
    saved: {
      'cops-robbers-duel-v1': {
        'solo-mode': 'escape',
        wins: { 'escape:pursuer:1': 'true', 'escape:fake:1': true, 'escape:pursuer:999': true },
      },
    },
  });
  corrupt.tap('levels');
  assert.equal(
    corrupt.game.getState().hits.some((hit) => hit.id === 'level:2'),
    false,
  );
  corrupt.game.dispose();
});

test('competition requires explicit enabled flag and disposes resumed child with the outer game', () => {
  const disabled = fixture({
    config: { apiUrl: 'https://fixture.invalid' },
    competition: () => {
      throw new Error('disabled competition ran');
    },
  });
  assert.equal(
    disabled.game.getState().hits.some((hit) => hit.id === 'competition'),
    false,
  );
  disabled.game.dispose();
  let exit,
    stops = 0;
  const f = fixture({
    config: { competitionEnabled: true, apiUrl: 'https://fixture.invalid' },
    competition: (_sdk, config, renderer) => {
      exit = config.onExit;
      assert.equal(typeof renderer, 'function');
      return { stop: () => stops++ };
    },
  });
  f.tap('competition');
  assert.equal(
    [...f.listeners.values()].reduce((total, listeners) => total + listeners.size, 0),
    0,
  );
  exit();
  assert.equal(stops, 1);
  assert.equal(f.game.getState().page, 'home');
  f.tap('start');
  assert.equal(f.game.getState().page, 'play');
  f.game.dispose();
  assert.equal(
    [...f.listeners.values()].reduce((total, listeners) => total + listeners.size, 0),
    0,
  );
  exit();
  assert.equal(
    [...f.listeners.values()].reduce((total, listeners) => total + listeners.size, 0),
    0,
    'late exit cannot resurrect a disposed game',
  );
});

test('developer saves remain separate from normal progress', () => {
  const f = fixture({
    config: { developer: true },
    saved: { 'cops-robbers-v3': { completed: { 1: { turns: 7, stars: 3 } } } },
  });
  f.tap('start');
  assert.equal(f.game.getState().levelId, 1);
  f.tap('wait');
  f.game.dispose();
  assert.ok(f.storage.has('cops-robbers-practice-v3'));
  assert.ok(f.storage.has('cops-robbers-duel-practice-v1'));
  assert.deepEqual(f.storage.get('cops-robbers-v3'), { completed: { 1: { turns: 7, stars: 3 } } });
});
