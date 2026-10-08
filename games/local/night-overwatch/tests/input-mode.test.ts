import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks, stripTypeScriptTypes } from 'node:module';

class Node {
  addChild() {}
  addComponent(type: any) { return new type(); }
}
class AudioSource { playing = false; stop() { this.playing = false; } play() { this.playing = true; } }
const cc = { Node, AudioSource, AudioClip: class {}, Component: class {},
  EventKeyboard: class {}, EventTouch: class {}, EventMouse: class {},
  _decorator: { ccclass: () => (type: any) => type },
  input: {}, Input: {}, game: {}, Game: {}, macro: {}, director: {},
  view: { getScaleX: () => 1, getScaleY: () => 1 },
  resources: { load(_name: string, _type: any, done: any) { done(null, {}); } },
  sys: { isMobile: false, isBrowser: false, localStorage: { getItem: () => null } }, screen: {} };
const folder = new URL('../assets/scripts/', import.meta.url), sourceURL = new URL('Overwatch.ts', folder);
(globalThis as any).__nightInputCC = cc;
const hooks = registerHooks({
  resolve(id, context, next) {
    if (context.parentURL?.startsWith(folder.href)) {
      if (id === 'cc' || id === './World' || id === './HUD') return { url: 'night-input:' + id, shortCircuit: true };
      if (id.startsWith('./') && !id.endsWith('.ts')) return next(new URL(id + '.ts', context.parentURL).href, context);
    }
    return next(id, context);
  },
  load(url, context, next) {
    if (url === 'night-input:cc') return { format: 'module', shortCircuit: true,
      source: `export const { ${Object.keys(cc).join(',')} } = globalThis.__nightInputCC;` };
    if (url === 'night-input:./World' || url === 'night-input:./HUD') return { format: 'module', shortCircuit: true,
      source: `export class World { constructor(parent, map = 'valley') { this.map = map; } root = { active: true, destroy() {} }; camera = {}; reset() {} updateCamera() {} } export class HUD {}` };
    const result = next(url, context);
    if (url === sourceURL.href) return { ...result, format: 'module', source:
      stripTypeScriptTypes(result.source!.toString().replace("@ccclass('Overwatch')", ''), { mode: 'transform' }) };
    return result;
  },
});
let Overwatch: any, Platform: any;
try {
  ({ Overwatch } = await import(sourceURL.href));
  ({ Platform } = await import(new URL('Platform.ts', folder).href));
} finally { hooks.deregister(); delete (globalThis as any).__nightInputCC; }
const touch = (id: number, x = 950, y = 100, simulate = false) => ({ simulate,
  getTouches: () => [{ getID: () => id, getUILocation: () => ({ x, y }), getLocation: () => ({ x, y }) }] });
function mission() {
  const g = new Overwatch();
  g.hud = { h: 600, modal: null, hit: (x: number) => x > 900 ? { id: 'fire' } : undefined,
    minimapPoint: () => undefined, blocksBattlefield: () => false };
  g.world = { map: 'valley', root: { active: true, destroy() {} }, camera: {}, updateCamera() {}, reset() {} };
  g.platform = new Platform(new Node(), g.pause, g.clear);
  g.sim.start();
  return g;
}

test('two-finger translation preserves both midpoint positions and cancels the remaining finger', () => {
  const g = mission(), calls: number[][] = [];
  g.world.adjustZoom = (...args: number[]) => calls.push(args);
  g.touchStart(touch(1, 250, 300)); g.touchStart(touch(2, 350, 300));
  const event = (points: number[][]) => ({ simulate: false, getTouches: () => points.map(([id, x, y]) => ({
    getID: () => id, getUILocation: () => ({ x, y }), getLocation: () => ({ x, y }),
  })) });
  g.touchMove(event([[1, 280, 320], [2, 380, 320]]));
  assert.deepEqual(calls[0], [1, 330, 320, 300, 300], 'equal spacing still moves the view');
  g.touchMove(event([[1, 260, 320], [2, 400, 320]]));
  assert.deepEqual(calls[1], [1.4, 330, 320, 330, 320]);
  g.touchEnd(touch(2, 400, 320));
  assert.equal(g.touches.get(1).role, 'cancelled');
  g.touchMove(touch(1, 100, 300)); assert.equal(calls.length, 2);
  g.touchCancel(touch(1)); assert.equal(g.touches.size, 0); assert.equal(g.sim.fired, 0);
  g.platform.dispose();
});

test('browser mouse-generated touches with simulate=false never replace or cancel mouse input', () => {
  const g = mission();
  cc.sys.isBrowser = true;
  try {
    g.sim.setFire('mouse', true);
    g.touchStart(touch(0));
    g.touchMove(touch(0, 500));
    g.touchEnd(touch(0));
    g.touchCancel(touch(0));
    assert.equal(g.platform.touchInput, false);
    assert.deepEqual([...g.sim.held], ['mouse']);
    assert.equal(g.touches.size, 0);
    // A real browser pointerdown selects touch before Creator dispatches the touch event.
    g.platform.useTouchInput(true);
    g.touchStart(touch(1));
    assert.deepEqual([...g.sim.held], ['touch:1']);
    g.touchEnd(touch(1));
    assert.equal(g.sim.held.size, 0);
  } finally { cc.sys.isBrowser = false; g.platform.dispose(); }
});

test('reward requests pause, reject duplicate claims, preserve inventory on retry, and respect SDK outcomes', async () => {
  const g = mission();
  g.hud.t = (zh: string) => zh;
  cc.sys.isBrowser = true;
  try {
    g.sim.setFire('touch:1', true);
    await g.requestReward('homing');
    assert.equal(g.hud.advert.mock, true);
    assert(g.sim.pauses.has('advert')); assert.equal(g.sim.held.size, 0);
    await g.requestReward('homing');
    g.action('adClose'); g.action('adClose');
    assert.equal(g.sim.homingAmmo, 1); assert.equal(g.platform.rewards.ammo, 1);
    assert(!g.sim.pauses.has('advert'));
    g.retry(); assert.equal(g.sim.homingAmmo, 1);
    g.sim.pause('manual', true);
    await g.requestReward('zoom'); g.action('adClose');
    assert.equal(g.world.zoomLimit, 10); assert(g.sim.pauses.has('manual'));
    for (const status of ['dismissed', 'unavailable', 'failed']) {
      g.platform.rewardProvider = async () => ({ status });
      await g.requestReward('homing'); assert.equal(g.sim.homingAmmo, 1);
      assert(!g.hud.advert); assert(!g.sim.pauses.has('advert'));
    }
    g.platform.rewardProvider = async () => { throw Error('SDK unavailable'); };
    await g.requestReward('homing'); assert.equal(g.sim.homingAmmo, 1);
    g.platform.rewardProvider = async (opportunity: any) => {
      assert.equal(opportunity.id, 'night-overwatch:homing');
      assert.deepEqual(opportunity.reward, { homing: 1 });
      return { status: 'completed' };
    };
    await g.requestReward('homing'); assert.equal(g.sim.homingAmmo, 2);
    g.platform.rewardProvider = undefined; cc.sys.isBrowser = false;
    assert.equal(await g.platform.offerReward('homing'), 'unavailable');
  } finally { cc.sys.isBrowser = false; g.platform.dispose(); }
});

test('a real touch activates initially desktop-classified native devices and trigger release stays safe', () => {
  const g = mission();
  assert.equal(g.platform.touchInput, false);
  g.touchStart(touch(0, 950, 100, true));
  assert.equal(g.sim.held.size, 0, 'mouse-generated touch is ignored');
  g.sim.setFire('mouse', true);
  g.touchStart(touch(1));
  assert.equal(g.platform.touchInput, true);
  assert.deepEqual([...g.sim.held], ['touch:1'], 'the first real touch replaces old mouse fire');
  g.touchEnd(touch(1));
  assert.equal(g.sim.held.size, 0);
  g.touchStart(touch(2));
  g.touchMove(touch(2, 500));
  assert.equal(g.sim.held.size, 0, 'sliding out releases the trigger');
  g.touchMove(touch(2));
  assert.equal(g.sim.held.size, 0, 'sliding back never restarts firing');
  g.touchEnd(touch(2));
  g.touchStart(touch(3));
  g.platform.useTouchInput(false);
  assert.equal(g.sim.held.size, 0, 'switching back to mouse releases held touch fire');
  assert.equal(g.touches.size, 0);
  g.touchEnd(touch(3));
  assert.equal(g.sim.held.size, 0);
  g.touchStart(touch(4));
  g.touchCancel(touch(4));
  assert.equal(g.sim.held.size, 0);
  assert.equal(g.touches.size, 0);
  g.platform.dispose();
});

test('changing missions requires a briefing or result; retry preserves the chosen mission and system pauses', () => {
  const g = mission();
  g.action('missionNext');
  assert.equal(g.sim.mission.id, 'corridor-01', 'a live mission cannot be replaced by an accidental switch');
  g.sim.phase = 'success';
  g.sim.pause('background', true);
  g.sim.guns[2].ammo = 0;
  g.action('missionNext');
  assert.equal(g.sim.mission.id, 'ambush-02');
  assert.equal(g.sim.phase, 'briefing', 'switching waits for the player to explicitly start');
  assert(g.sim.pauses.has('background'));
  assert.equal(g.sim.guns[2].ammo, 30);
  g.action('start');
  g.sim.pause('background', false);
  g.sim.setFire('touch:99', true);
  g.retry();
  assert.equal(g.sim.mission.id, 'ambush-02');
  assert.equal(g.sim.phase, 'playing');
  assert.equal(g.sim.spawned.size, 8);
  assert.equal(g.sim.held.size, 0);
  assert.equal(g.sim.time, 0);
});

test('actual warmup entry, retry and return keep saved escort preferences and system pauses independent', () => {
  const g = mission(), saved = new Map([['night-overwatch-mission-v1', 'ambush-02']]);
  const original = cc.sys.localStorage, writes: string[] = [];
  cc.sys.localStorage = { getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => { writes.push(key); saved.set(key, value); } } as any;
  try {
    g.prepareMission('?mission=training-60');
    assert.equal(g.sim.mission.id, 'training-60'); assert.equal(g.sim.phase, 'briefing');
    assert.equal(g.selectedMission, 'ambush-02'); assert.deepEqual(writes, []);
    g.sim.pause('background', true);
    g.action('start'); g.action('missionReturn');
    assert.equal(g.sim.mission.id, 'training-60', 'a live range cannot be abandoned by a hidden menu action');
    g.sim.guns[2].ammo = 1; g.retry();
    assert.equal(g.sim.time, 0); assert.equal(g.sim.spawned.size, 3);
    assert.equal(g.sim.guns[2].ammo, 30); assert(g.sim.pauses.has('background'));
    g.sim.phase = 'failure'; g.action('missionReturn');
    assert.equal(g.sim.mission.id, 'ambush-02'); assert.equal(g.sim.phase, 'briefing');
    assert(g.sim.pauses.has('background')); assert.deepEqual(writes, []);
    for (const query of ['?mission=unknown', '?mission=training-60&mission=training-60']) {
      g.prepareMission(query); assert.equal(g.sim.mission.id, 'ambush-02');
    }
    g.prepareMission('?mission=patrol-03');
    assert.equal(g.sim.mission.id, 'patrol-03'); assert.deepEqual(writes, []);
    g.action('training'); assert.equal(g.sim.mission.id, 'training-60');
    g.action('missionReturn'); assert.equal(g.sim.mission.id, 'patrol-03');
    assert.equal(saved.get('night-overwatch-mission-v1'), 'ambush-02');
    g.platform.saveMission('training-60'); assert.deepEqual(writes, []);
  } finally { cc.sys.localStorage = original; g.platform.dispose(); }
});

test('training result saves only a clean successful range score in its separate key', () => {
  const g = mission(), saved = new Map([['night-overwatch-mission-v1', 'patrol-03'], ['night-overwatch-coach-v2', 'done']]);
  const original = cc.sys.localStorage, writes: string[] = [];
  cc.sys.localStorage = { getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => { writes.push(key); saved.set(key, value); } } as any;
  try {
    g.prepareMission('?mission=training-60'); g.action('start');
    for (const unit of g.sim.units) if (!unit.friendly) unit.hp = 0;
    Object.assign(g.sim, { phase: 'success', time: 20, fired: 5, hitShots: 5, kills: 3 });
    g.saveTrainingResult();
    assert.deepEqual(writes, ['night-overwatch-training-v1']);
    assert.equal(g.hud.trainingBest.time, 20);
    assert.equal(saved.get('night-overwatch-mission-v1'), 'patrol-03');
    assert.equal(saved.get('night-overwatch-coach-v2'), 'done');
    g.sim.time = 15; g.sim.friendlyDamage = 10; g.saveTrainingResult();
    assert.equal(writes.length, 1); assert.equal(g.hud.trainingBest.time, 20);
    g.sim.mission = { ...g.sim.mission, mode: 'escort' }; g.saveTrainingResult();
    assert.equal(writes.length, 1);
  } finally { cc.sys.localStorage = original; g.platform.dispose(); }
});

test('actual task choices update public entry URLs without carrying private fields or credentials', () => {
  const g = mission(); g.sim.phase = 'briefing';
  const names = ['location', 'history'] as const;
  const originals = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  const browserLocation = { href: 'https://user:password@example.test/night/?mission=training-60&private=secret#old' };
  cc.sys.isBrowser = true;
  Object.defineProperties(globalThis, {
    location: { configurable: true, value: browserLocation },
    history: { configurable: true, value: { replaceState(_state: unknown, _title: string, url: string) { browserLocation.href = url; } } },
  });
  try {
    g.action('training');
    assert.equal(browserLocation.href, 'https://example.test/night/?mission=training-60');
    g.action('missionReturn');
    assert.equal(browserLocation.href, 'https://example.test/night/?mission=corridor-01');
    g.action('missionNext');
    assert.equal(browserLocation.href, 'https://example.test/night/?mission=ambush-02');
    assert.equal(g.sim.phase, 'briefing');
  } finally {
    cc.sys.isBrowser = false;
    names.forEach((name, index) => {
      if (originals[index]) Object.defineProperty(globalThis, name, originals[index]!);
      else delete (globalThis as any)[name];
    });
    g.platform.dispose();
  }
});

test('returning home aborts a live mission, clears input and starts the next map cleanly', () => {
  const g = mission(); g.sim.choose(2); g.sim.setFire('mouse', true); g.keys.add(32);
  g.sim.pause('manual', true); g.action('home');
  assert.equal(g.sim.phase, 'briefing'); assert.equal(g.sim.time, 0);
  assert.equal(g.sim.pauses.size, 0); assert.equal(g.keys.size, 0); assert.equal(g.sim.shots.length, 0);
  g.action('mission:ambush-02');
  assert.equal(g.sim.mission.map, 'highland'); assert.equal(g.world.map, 'highland');
  assert.equal(g.sim.phase, 'briefing');
  g.action('start'); assert.equal(g.sim.phase, 'playing'); assert.equal(g.sim.spawned.size, 8);
  g.action('home'); assert.equal(g.sim.phase, 'briefing'); assert.equal(g.sim.fired, 0);
});
