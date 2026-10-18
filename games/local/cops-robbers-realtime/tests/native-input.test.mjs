import test from 'node:test';
import assert from 'node:assert/strict';
import { startNativeStreetGame } from '../src/native.js';

test('native taps require one uncancelled gesture on the current page and detach on stop', () => {
  const labels = [], listeners = new Map(), storage = new Map();
  const ctx = new Proxy({ fillText: value => labels.push(String(value)), measureText: value => ({ width: String(value).length * 8 }) }, { get: (target, key) => target[key] ?? (() => {}) });
  const sdk = {
    createCanvas: () => ({ getContext: () => ctx }), createImage: () => ({ width: 0 }),
    getSystemInfoSync: () => ({ windowWidth: 844, windowHeight: 390, pixelRatio: 2 }),
    getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value),
    getLaunchOptionsSync: () => ({ query: {} }),
  };
  for (const name of ['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel', 'Hide', 'Show', 'WindowResize']) {
    sdk['on' + name] = fn => listeners.set(name, fn);
    sdk['off' + name] = fn => { assert.equal(listeners.get(name), fn); listeners.delete(name); };
  }
  const previousInstall = globalThis.__installCompetition;
  globalThis.__installCompetition = () => {};
  const instance = startNativeStreetGame(sdk, {}, () => { throw new Error('unexpected PK'); });
  const point = (x = 50, y = 250, identifier = 1) => ({ clientX: x, clientY: y, identifier });
  const emit = (name, points, active = points) => listeners.get(name)({ changedTouches: points, touches: active });
  const remainsHome = () => { labels.length = 0; emit('Show', []); assert(labels.includes('别跑！')); assert(labels.includes('街区围捕')); assert(!labels.includes('选择街区')); };
  const start = () => emit('TouchStart', [point()]);
  const end = () => emit('TouchEnd', [point()], []);
  try {
    // An end without a start, cancelled input, drag out and return, and multitouch are inert.
    end(); remainsHome();
    start(); emit('TouchCancel', [point()], []); end(); remainsHome();
    start(); emit('TouchMove', [point(350)]); emit('TouchMove', [point()]); end(); remainsHome();
    start(); emit('TouchStart', [point(50, 250, 2)], [point(), point(50, 250, 2)]); end(); remainsHome();
    start(); emit('TouchEnd', [point(50, 250, 2)], []); remainsHome();
    start(); emit('Hide', []); emit('Show', []); end(); remainsHome();
    start(); emit('WindowResize', []); end(); remainsHome();
    start(); labels.length = 0; end(); assert(labels.includes('选择街区'));
    // Repeated trailing ends cannot activate the new page's overlapping controls.
    labels.length = 0; end(); assert.equal(labels.length, 0);
  } finally {
    instance.stop();
    assert.equal(listeners.size, 0);
    if (previousInstall === undefined) delete globalThis.__installCompetition;
    else globalThis.__installCompetition = previousInstall;
  }
});

test('native street safe area and capsule offsets preserve physical hit mapping', () => {
  const listeners = new Map(), canvas = { getContext: () => new Proxy({}, { get: () => () => {} }) };
  const sdk = { createCanvas: () => canvas, createImage: () => ({ width: 0 }), getStorageSync: () => '', setStorageSync() {}, getSystemInfoSync: () => ({ windowWidth: 844, windowHeight: 390, pixelRatio: 3, safeArea: { left: 24, top: 12, right: 820, bottom: 366 } }), getMenuButtonBoundingClientRect: () => ({ bottom: 44 }) };
  for (const name of ['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel', 'Hide', 'Show', 'WindowResize']) { sdk['on' + name] = fn => listeners.set(name, fn); sdk['off' + name] = () => listeners.delete(name); }
  const previous = globalThis.__installCompetition; globalThis.__installCompetition = () => {};
  const game = startNativeStreetGame(sdk, {});
  try {
    assert.equal(canvas.width, 1688); assert.equal(canvas.height, 780);
    assert.deepEqual([game.getLayout().originX, game.getLayout().originY, game.getLayout().width, game.getLayout().height], [24, 44, 796, 322]);
    const hit = game.getLayout().hits.find(item => item.label.startsWith('开始游戏'));
    const p = { identifier: 1, clientX: hit.x + hit.w / 2 + 24, clientY: hit.y + 22 + 44 };
    listeners.get('TouchStart')({ touches: [p], changedTouches: [p] }); listeners.get('TouchEnd')({ touches: [], changedTouches: [p] }); assert.equal(game.getState().page, 'levels');
    const start = game.getLayout().hits.find(item => item.label.startsWith('开始行动')); const q = { identifier: 1, clientX: start.x + start.w / 2 + 24, clientY: start.y + 22 + 44 };
    listeners.get('TouchStart')({ touches: [q], changedTouches: [q] }); listeners.get('TouchEnd')({ touches: [], changedTouches: [q] }); assert.equal(game.getState().page, 'game');
    listeners.get('Hide')(); assert.equal(game.getState().page, 'pause'); const tick = game.getState().ticks; listeners.get('Show')(); assert.equal(game.getState().ticks, tick); assert.equal(game.getState().page, 'pause');
  } finally { game.stop(); if (previous === undefined) delete globalThis.__installCompetition; else globalThis.__installCompetition = previous; }
});

test('a touch started during a native ad cannot consume the reward after its callback', async () => {
  const listeners = new Map(), storage = new Map([['street-native-v1',JSON.stringify({startedRuns:5})]]);
  const sdk = { createCanvas:()=>({getContext:()=>new Proxy({}, {get:()=>()=>{}})}), createImage:()=>({width:0}),
    getSystemInfoSync:()=>({windowWidth:844,windowHeight:390,pixelRatio:1}), getStorageSync:key=>storage.get(key), setStorageSync:(key,value)=>storage.set(key,value) };
  for(const name of ['TouchStart','TouchEnd','TouchCancel','Hide','Show']) {
    sdk['on'+name]=fn=>listeners.set(name,fn); sdk['off'+name]=()=>listeners.delete(name);
  }
  let finish;
  const instance=startNativeStreetGame(sdk,{rewardProvider:{show:()=>new Promise(resolve=>{finish=resolve;})}});
  const event=(x,y,active)=>({changedTouches:[{clientX:x,clientY:y,identifier:1}],touches:active?[{clientX:x,clientY:y,identifier:1}]:[]});
  const tap=label=>{const hit=instance.getLayout().hits.find(item=>item.label===label); assert(hit,label);
    listeners.get('TouchStart')(event(hit.x+hit.w/2,hit.y+22,true)); listeners.get('TouchEnd')(event(hit.x+hit.w/2,hit.y+22,false));};
  try {
    tap('开始游戏 →'); tap('开始行动 →'); tap('广告冲刺');
    const frozen=instance.getState().time;
    listeners.get('TouchStart')(event(420,212,true));
    listeners.get('Hide')();
    finish({status:'completed'}); await Promise.resolve(); await Promise.resolve();
    listeners.get('TouchEnd')(event(420,212,false));
    assert.equal(instance.getState().page,'game');
    assert.equal(instance.getState().phase,'paused');
    assert.equal(instance.getState().support.sprint,1);
    assert.equal(instance.getState().time,frozen);
    listeners.get('Show')();
    assert.equal(instance.getState().phase,'playing');
    assert.equal(instance.getState().support.sprint,1);
    assert.equal(instance.getState().support.remaining,0);
    tap('冲刺 · 1'); assert.equal(instance.getState().support.sprint,0);
  } finally { instance.stop(); }
});

function nativeFixture(config = {}, saved = {}, extraSdk = {}) {
  const listeners = new Map(), storage = new Map([['street-native-v1', JSON.stringify(saved)]]), images = [], draws = [];
  const ctx = new Proxy({ drawImage: (...args) => draws.push(args) }, { get: (target, key) => target[key] ?? (() => {}) });
  const sdk = { createCanvas: () => ({ getContext: () => ctx }), createImage: () => { const image = { width: 1280, height: 1280 }; images.push(image); return image; },
    getSystemInfoSync: () => ({ windowWidth: 844, windowHeight: 390, pixelRatio: 1 }), getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value), ...extraSdk };
  for (const name of ['TouchStart','TouchMove','TouchEnd','TouchCancel','Hide','Show','WindowResize']) { sdk['on'+name] = fn => listeners.set(name, fn); sdk['off'+name] = () => listeners.delete(name); }
  const game = startNativeStreetGame(sdk, config);
  const emit = (name, point, active = name !== 'TouchEnd') => listeners.get(name)({ changedTouches: [point], touches: active ? [point] : [] });
  const tap = label => { const hit = game.getLayout().hits.find(hit => hit.label === label); assert(hit, label); const point = { identifier: 1, x: hit.x + hit.w/2, y: hit.y+22 }; emit('TouchStart', point); emit('TouchEnd', point); };
  return { game, tap, emit, images, draws, storage, listeners };
}

test('ads-off native support uses one refill and waits for a new tap to consume it', async () => {
  const f = nativeFixture({ adMode: 'off', rewardProvider: { show() { throw Error('off mode must not request an ad'); } } }, { startedRuns: 5 });
  try {
    f.tap('开始游戏 →'); f.tap('开始行动 →'); f.tap('补领冲刺');
    await Promise.resolve();
    assert.equal(f.game.getState().support.sprint, 1);
    assert.equal(f.game.getState().support.remaining, 0);
    f.tap('冲刺 · 1');
    assert.equal(f.game.getState().support.sprint, 0);
    assert.equal(f.game.getState().support.assisted, true);
    assert(f.game.getState().support.remaining > 3.8);
  } finally { f.game.stop(); }
});

test('native late admissions cannot navigate or consume starter runs after leaving or hiding', async () => {
  const previous = Object.fromEntries(['__competition', '__installCompetition', '__COMPETITION_CONFIG__'].map(key => [key, globalThis[key]]));
  globalThis.__installCompetition = () => {};
  try {
    for (const order of ['home', 'hide-show-release', 'hide-release-show']) {
      let release;
      globalThis.__competition = { session: async () => ({ userId: 'fixture-player' }), request: async path => path.includes('/start?') ? new Promise(resolve => { release = resolve; }) : {} };
      const f = nativeFixture({ competitionEnabled: true, apiUrl: 'https://fixture.invalid', adMode: 'off' }, { startedRuns: 4 });
      try {
        f.tap('开始游戏 →'); f.tap('开始行动 →');
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(typeof release, 'function');
        if (order === 'home') f.tap('首页');
        else { f.listeners.get('Hide')(); if (order === 'hide-show-release') f.listeners.get('Show')(); }
        release({ admissionId: '00000000-0000-0000-0000-000000000000', expiresAt: Date.now() + 60000 });
        await new Promise(resolve => setImmediate(resolve));
        if (order === 'hide-release-show') f.listeners.get('Show')();
        assert.equal(f.game.getState().page, order === 'home' ? 'home' : 'levels');
        assert.equal(f.game.getState().phase, 'ready');
        assert.equal(f.game.getState().startedRuns, 4);
        if (order === 'home') f.tap('开始游戏 →');
        f.tap('开始行动 →');
        await new Promise(resolve => setImmediate(resolve));
        release({ admissionId: '00000000-0000-0000-0000-000000000000', expiresAt: Date.now() + 60000 });
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(f.game.getState().phase, 'playing');
        assert.equal(f.game.getState().startedRuns, 5);
      } finally { f.game.stop(); }
    }
  } finally { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } }
});

test('native maps cache only on an independent offscreen canvas and preserve the live surface', () => {
  let allocated = 0;
  const cached = { getContext: () => new Proxy({}, { get: () => () => {} }) };
  const f = nativeFixture({}, {}, { createOffscreenCanvas: () => { allocated++; return cached; } });
  try {
    f.tap('开始游戏 →'); f.tap('开始行动 →');
    assert.equal(f.game.getState().backgroundCached, true);
    assert.equal(allocated, 1);
    assert(f.draws.some(args => args[0] === cached));
    f.listeners.get('Show')();
    assert.equal(allocated, 1, 'same map reuses background');
    assert.equal(cached.width, 1000); assert.equal(cached.height, 600);
  } finally { f.game.stop(); }
  const fallback = nativeFixture({}, {}, { createOffscreenCanvas: () => { throw Error('not supported'); } });
  try {
    fallback.tap('开始游戏 →'); fallback.tap('开始行动 →');
    assert.equal(fallback.game.getState().backgroundCached, false);
    assert.equal(fallback.game.getState().phase, 'playing');
    assert.equal(fallback.game.canvas.width, 844, 'fallback drawing must not resize the game canvas');
  } finally { fallback.game.stop(); }
});

test('native field drag issues one order, while return, cancel and multitouch preserve orders', () => {
  const f = nativeFixture();
  try {
    f.tap('开始游戏 →'); f.tap('开始行动 →');
    const field = f.game.getLayout().field;
    const hit = field.hits.find(hit => hit.action.local === 1);
    const road = field.hits.find(item => item.action.type === 'move' && Math.hypot(item.x - hit.x, item.y - hit.y) > 40);
    const from = { identifier: 1, x: hit.x+22, y: hit.y+22 };
    const to = { identifier: 1, x: road.x+18, y: road.y+18 };
    assert(Math.hypot(from.x-to.x, from.y-to.y)>8);
    const drag = () => { f.emit('TouchStart', from); f.emit('TouchMove', to); };
    drag(); f.emit('TouchMove', from); f.emit('TouchEnd', from); assert.equal(f.game.getState().orders.length, 0);
    drag(); f.emit('TouchCancel', to); f.emit('TouchEnd', to); assert.equal(f.game.getState().orders.length, 0);
    drag(); f.listeners.get('TouchMove')({ changedTouches: [to], touches: [to, {...to, identifier: 2}] }); f.emit('TouchEnd', to); assert.equal(f.game.getState().orders.length, 0);
    drag(); f.emit('TouchEnd', to);
    assert.equal(f.game.getState().orders.length, 1);
    assert.equal(f.game.getState().orders[0].actor, 1);
    assert.equal(f.game.getState().orders[0].type, 'move');
  } finally { f.game.stop(); }
});

test('Cocos portraits use H5 preset crops; old native hosts do not request the new sheet', () => {
  const legacy = nativeFixture();
  assert(!legacy.images.some(image => image.src?.includes('characters'))); legacy.game.stop();
  const f = nativeFixture({ visualAssets: { portraits: 'street-characters.webp' } });
  try {
    const image = f.images.find(image => image.src === 'street-characters.webp'); assert(image);
    image.onload(); f.tap('角色头像'); f.tap('机灵保安');
    assert.equal(f.game.getState().avatars.cop, 1);
    assert(f.draws.some(args => args[0] === image && args[1] === 486 && args[2] === 18 && args[3] === 306));
    f.tap('首页'); f.tap('开始游戏 →'); f.tap('开始行动 →');
    assert(f.draws.some(args => args[0] === image && args[7] === 46 && args[8] === 46));
  } finally { f.game.stop(); }
  assert(f.images.every(image => image.onload == null));
});
