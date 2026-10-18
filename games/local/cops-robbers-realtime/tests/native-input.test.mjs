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
  const remainsHome = () => { labels.length = 0; emit('Show', []); assert(labels.includes('街区追捕')); assert(!labels.includes('选择街区')); };
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
