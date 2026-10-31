import assert from 'node:assert/strict';
import test from 'node:test';
import { Quartermaster } from '../assets/scripts/Quartermaster.ts';
import { registerHooks, stripTypeScriptTypes } from 'node:module';

class Node {
  listeners = new Map<string, () => void>();
  on(event: string, callback: () => void) { this.listeners.set(event, callback); }
  emit(event: string) { this.listeners.get(event)?.(); }
  addChild() {}
  addComponent(type: any) { const value = new type(); value.node = this; return value; }
}
class AudioSource {
  static EventType = { ENDED: 'ended' };
  playing = false; currentTime = 0;
  stop() { this.playing = false; this.currentTime = 0; }
  pause() { this.playing = false; }
  play() { this.playing = true; }
}
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
      source: `export class World { constructor(parent, map = 'valley', light = 'day') { this.map = map; this.light = light; } root = { active: true, destroy() {} }; camera = {}; reset() {} updateCamera() {} } export class HUD {}` };
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
  g.hud = { t: (value: string) => value, supplySelection: 'tracking', h: 600, modal: null, hit: (x: number) => x > 900 ? { id: 'fire' } : undefined,
    minimapPoint: () => undefined, blocksBattlefield: () => false };
  g.world = { map: 'valley', light: 'day', root: { active: true, destroy() {} }, camera: {}, updateCamera() {}, reset() {} };
  g.platform = new Platform(new Node(), g.pause, g.clear);
  const memory=new Map<string,string>();
  g.armory=new Quartermaster({getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)},v=>{g.hud.armory=v;},()=>g.platform.offerLottery());
  g.armory.bind('pilot',false,undefined,true);
  g.sim.start(); g.sim.choose(0);
  return g;
}

test('rankings scroll with wheel and touch only inside the list, and cancellation releases the gesture', () => {
  const g=mission();let offset=0;
  Object.assign(g.hud,{modal:{},scrollNode:{},scrollArea:{x:50,y:100,w:400,h:200},scrollBy:(n:number)=>{offset+=n;}});
  g.wheel({getScrollY:()=>-120});assert.equal(offset,24);
  g.touchStart(touch(1,100,450));assert.equal(g.touches.get(1).role,'scroll');
  g.touchMove(touch(1,100,480));assert.equal(offset,54);
  g.touchCancel(touch(1));g.touchMove(touch(1,100,490));assert.equal(offset,54);
  g.touchStart(touch(2,100,550));assert(!g.touches.has(2));assert.equal(g.sim.fired,0);
  g.platform.dispose();
});

test('keyboard fire is blocked by battle reports and settings', () => {
  const g = mission();
  g.hud.modal = {}; g.keyDown({ keyCode: 32 }); g.keyUp({ keyCode: 32 });
  assert.equal(g.sim.fired, 0); assert.deepEqual(Array.from(g.sim.held), []);
  g.hud.modal = null; g.sim.pause('settings', true); g.keyDown({ keyCode: 32 }); g.keyUp({ keyCode: 32 });
  assert.equal(g.sim.fired, 0); g.platform.dispose();
});

test('a new campaign can start while the previous recorder handshake is pending', async () => {
  const g = mission(), requests: (() => void)[] = []; g.hud.t = (text: string) => text;
  g.online = { leave() {}, startRanking: () => new Promise<void>(resolve => requests.push(resolve)), recorder: { record() {}, invalidate() {} } };
  g.sim.phase = 'briefing'; const first = g.sim; g.beginCampaign();
  await new Promise(resolve=>setImmediate(resolve));
  g.retry(); g.beginCampaign(); await new Promise(resolve=>setImmediate(resolve)); const second = g.sim; assert.notEqual(first, second); assert.equal(requests.length, 2);
  requests[0](); await new Promise(resolve => setImmediate(resolve)); assert.equal(second.phase, 'briefing');
  g.beginCampaign(); assert.equal(requests.length, 2, 'old finally cannot unlock the new request');
  requests[1](); await new Promise(resolve => setImmediate(resolve)); assert.equal(second.phase, 'playing');
  g.platform.dispose();
});

test('campaign start waits for the delayed services bootstrap instead of silently dropping the run', async () => {
  const g=mission(),globals=globalThis as any;g.hud.t=(value:string)=>value;g.sim.phase='briefing';let started=0;
  const originalConfig=globals.__COMPETITION_CONFIG__, originalBridge=globals.SmallGamesServices;
  globals.__COMPETITION_CONFIG__={competitionEnabled:true};delete globals.SmallGamesServices;
  g.online={rankStatus:'local',leave(){},async connect(bridge:any){assert.equal(bridge,globals.SmallGamesServices);this.recorder={record(){}};},async startRanking(){started++;this.rankStatus='recording';}};
  try {
    g.servicesReady=g.connectServices();g.beginCampaign();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(g.sim.phase,'briefing');assert.equal(started,0);
    globals.SmallGamesServices={ready:Promise.resolve()};await g.servicesReady;await new Promise(resolve=>setImmediate(resolve));
    assert.equal(started,1);assert.equal(g.sim.phase,'playing');assert(!g.hud.toast.includes('仅保存'));
  } finally {globals.__COMPETITION_CONFIG__=originalConfig;globals.SmallGamesServices=originalBridge;g.platform.dispose();}
});

test('offset aim survives slow microdrags, release-only displacement, taps and cancelled gestures', () => {
  const g = mission();
  g.world.project = (p: any) => ({ x: p.x, y: p.z, z: .5 });
  g.world.aimAt = (x: number, y: number) => ({ x, z: y });
  g.sim.setAim({ x: 20, z: 30 });
  g.touchStart(touch(1, 300, 200));
  for (let i = 1; i <= 10; i++) g.touchMove(touch(1, 300 + i, 200 + i));
  assert.deepEqual(g.sim.aim, { x: 30, z: 40 });
  assert.equal(g.touches.get(1).moved, true, 'motion accumulates from the original finger position');
  g.touchEnd(touch(1, 370, 260));
  assert.deepEqual(g.sim.aim, { x: 30, z: 40 });
  g.touchStart(touch(2, 200, 200)); g.touchEnd(touch(2, 200, 200));
  assert.deepEqual(g.sim.aim, { x: 200, z: 200 }, 'a tap moves the ordinary reticle without firing');
  g.touchStart(touch(3, 200, 200)); g.touchCancel(touch(3)); g.touchEnd(touch(3, 700, 200));
  assert.deepEqual(g.sim.aim, { x: 200, z: 200 }); assert.equal(g.sim.fired, 0);
  g.touchStart(touch(4, 300, 200)); g.touchEnd(touch(4, 370, 260));
  assert.deepEqual(g.sim.aim, { x: 200, z: 200 }, 'release-only displacement is not a tap');
  g.platform.dispose();
});

test('homing tap locks but cumulative movement and end-only displacement do not become taps', () => {
  const g = mission(); g.sim.homingAmmo = 2; g.sim.selectHoming();
  g.world.project = () => ({ x: 0, y: 0, z: .5 }); g.world.aimAt = () => ({ x: 0, z: 0 });
  let locks = 0; g.lockAt = () => { locks++; };
  g.touchStart(touch(1, 300, 200));
  for (let i = 1; i <= 10; i++) g.touchMove(touch(1, 300 + i, 200));
  g.touchMove(touch(1, 300, 200)); g.touchEnd(touch(1, 300, 200));
  assert.equal(locks, 0);
  g.touchStart(touch(2, 300, 200)); g.touchEnd(touch(2, 310, 200)); assert.equal(locks, 0);
  g.touchStart(touch(3, 300, 200)); g.touchEnd(touch(3, 301, 200)); assert.equal(locks, 1);
  g.platform.dispose();
});

test('radio has one voice, honors mute, stops with lifecycle and never queues a missing clip', () => {
  const g = mission(), p = g.platform; p.activate();
  p.speak('day', 'zh'); assert.equal(p.radio.playing, true);
  p.speak('priority', 'zh'); assert.equal(p.radio.clip, p.clips.get('radio-priority-zh'));
  g.pause('manual', true); assert.equal(p.radio.playing, false);
  p.muted = true; p.speak('critical', 'zh'); assert.equal(p.radio.playing, false);
  p.muted = false; p.clips.delete('radio-clear-zh'); p.speak('clear', 'zh'); assert.equal(p.radio.playing, false);
  p.dispose(); p.speak('day', 'zh'); assert.equal(p.radio.playing, false);
});

test('extraction waits for the actual radio end, and pauses resume the unfinished line', () => {
  const g = mission(), p = g.platform; p.activate(); g.hud.lang = 'zh';
  for (const u of g.sim.units) if (!u.friendly) u.hp = 0;
  g.sim.step(1 / 60); g.updateRadio(1 / 60);
  assert(g.sim.extractionRadioPending); assert.equal(p.radio.clip, p.clips.get('radio-clear-zh'));
  p.radio.currentTime = 1.5;
  g.pause('manual', true); g.pause('background', true); g.updateRadio(.1);
  assert(!p.radio.playing); assert(p.radioPending); assert.equal(p.radio.currentTime, 1.5);
  g.pause('manual', false); g.updateRadio(.1); assert(!p.radio.playing);
  g.pause('background', false); g.updateRadio(.1);
  assert(p.radio.playing); assert.equal(p.radio.currentTime, 1.5);
  for (let i = 0; i < 360; i++) { p.radio.currentTime += 1 / 60; g.sim.step(1 / 60); g.updateRadio(1 / 60); }
  assert.equal(g.sim.convoy, 'arrived'); assert.equal(g.sim.phase, 'playing', 'not a fixed three-second voice timeout');
  p.radio.playing = false; p.radio.node.emit(AudioSource.EventType.ENDED); g.updateRadio(1 / 60); g.sim.step(1 / 60);
  assert.equal(g.sim.phase, 'success'); assert(!g.sim.extractionRadioPending);
  p.dispose();
});

test('silent, unavailable and rejected audio cannot strand extraction; retry drops the old radio wait', () => {
  for (const mode of ['muted', 'missing', 'rejected', 'stalled', 'mute-during', 'retry']) {
    const g = mission(), p = g.platform; p.activate(); g.hud.lang = 'zh';
    if (mode === 'muted') p.muted = true;
    if (mode === 'missing') p.clips.delete('radio-clear-zh');
    if (mode === 'rejected') p.radio.play = () => {};
    for (const u of g.sim.units) if (!u.friendly) u.hp = 0;
    g.sim.step(1 / 60); g.updateRadio(1 / 60);
    if (mode === 'mute-during') { p.muted = true; p.stop(); }
    if (mode === 'retry') {
      g.sim.phase='failure';g.retry();g.action('armory:solo');g.action('start');g.updateRadio(1 / 60); assert(!g.sim.extractionRadioPending);
      assert.equal(p.radio.clip, p.clips.get('radio-day-zh'));
    } else {
      for (let i = 0; i < 240; i++) { g.sim.step(1 / 60); g.updateRadio(1 / 60); }
      assert.equal(g.sim.phase, 'success', mode); assert(!g.sim.extractionRadioPending, mode);
      if (mode === 'missing' || mode === 'stalled' || mode === 'rejected') {
        assert(p.radioPending, mode + ': completion speech may continue after extraction');
        assert.equal(p.radio.clip, p.clips.get('radio-complete-zh'));
      }
      if (mode === 'missing') {
        p.radio.playing = false; p.radio.node.emit(AudioSource.EventType.ENDED);
        assert(!p.radioPending, 'completion ENDED releases its audio wait');
      }
      const completedAt = g.sim.time;
      for (let i = 0; i < 130; i++) { g.sim.step(1 / 60); g.updateRadio(1 / 60); }
      assert(!p.radioPending, mode + ': a stalled result voice is released');
      assert.equal(g.sim.phase, 'success'); assert.equal(g.sim.time, completedAt);
    }
    p.dispose();
  }
});

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

test('wartime offers never play an ad; an existing entitlement remains claimable exactly once', async () => {
  const g=mission();let ads=0;g.platform.rewardProvider=async()=>{ads++;return {status:'completed'};};
  for(const id of ['supply','supplyWatch','homingReward','zoomUpgrade'])g.action(id);
  assert.equal(ads,0);assert(!g.hud.supplyOpen);assert.equal(g.sim.homingAmmo,0);
  g.platform.rewards.pendingSupply=true;g.action('supply');g.action('reward:ammo');g.action('supplyWatch');
  assert.equal(g.sim.homingAmmo,2);assert(!g.platform.rewards.pendingSupply);assert(!g.sim.paused);
  g.action('supplyWatch');assert.equal(g.sim.homingAmmo,2);assert.equal(ads,0);g.platform.dispose();
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
  assert.equal(g.sim.phase,'briefing');assert.equal(g.armory.view.page,'base');g.action('armory:solo');
  assert(g.sim.pauses.has('background'));
  assert.equal(g.sim.guns[2].ammo, 45);
  g.action('start');
  g.sim.pause('background', false);
  g.sim.setFire('touch:99', true);
  g.sim.phase='failure';g.retry();g.action('armory:solo');g.action('start');
  assert.equal(g.sim.mission.id, 'ambush-02');
  assert.equal(g.sim.phase, 'playing');
  assert.equal(g.sim.spawned.size, 6);
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
    g.action('armory:solo');g.action('start'); g.action('missionReturn');
    assert.equal(g.sim.mission.id, 'training-60', 'a live range cannot be abandoned by a hidden menu action');
    g.sim.guns[2].ammo = 1;g.sim.phase='failure';g.retry();g.action('armory:solo');g.action('start');
    assert.equal(g.sim.time, 0); assert.equal(g.sim.spawned.size, 3);
    assert.equal(g.sim.guns[2].ammo, 45); assert(g.sim.pauses.has('background'));
    g.sim.phase = 'failure'; g.action('missionReturn');
    assert.equal(g.sim.mission.id, 'ambush-02'); assert.equal(g.sim.phase, 'briefing');
    assert(g.sim.pauses.has('background')); assert.deepEqual(writes, []);
    for (const query of ['?mission=unknown', '?mission=training-60&mission=training-60']) {
      g.prepareMission(query); assert.equal(g.sim.mission.id, 'ambush-02');
    }
    g.prepareMission('?mission=patrol-03');
    assert.equal(g.sim.mission.id, 'patrol-03'); assert.deepEqual(writes, []);
    g.action('armory:solo');g.action('training'); assert.equal(g.sim.mission.id, 'training-60');
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
    g.prepareMission('?mission=training-60');g.action('armory:solo');g.action('start');
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
    g.action('armory:solo');g.action('training');
    assert.equal(browserLocation.href, 'https://example.test/night/?mission=training-60');
    g.action('missionReturn');
    assert.equal(browserLocation.href, 'https://example.test/night/?mission=corridor-01');
    g.sim.phase='success';g.action('missionNext');
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
  assert.equal(g.sim.phase, 'playing'); assert(g.hud.exitConfirm); assert(g.sim.paused);
  const original = g.sim; g.action('exitCancel');
  assert.equal(g.sim, original); assert(!g.sim.paused); assert(!g.hud.exitConfirm);
  g.action('home'); g.action('exitConfirm');
  assert.equal(g.sim.phase, 'briefing'); assert.equal(g.sim.time, 0);
  assert.equal(g.sim.pauses.size, 0); assert.equal(g.keys.size, 0); assert.equal(g.sim.shots.length, 0);
  g.action('armory:solo');g.action('mission:ambush-02');
  assert.equal(g.sim.mission.map, 'highland'); assert.equal(g.world.map, 'highland');
  assert.equal(g.sim.phase, 'briefing');
  g.action('start'); assert.equal(g.sim.phase, 'playing'); assert.equal(g.sim.spawned.size, 6);
  g.action('home'); g.action('exitConfirm'); assert.equal(g.sim.phase, 'briefing'); assert.equal(g.sim.fired, 0);
});

test('operation lock applies to ordinary menu/URL, developer practice stays isolated, and denied storage keeps progression', () => {
  const originalStorage = cc.sys.localStorage, originalDev = (globalThis as any).SmallGamesDev;
  cc.sys.localStorage = { getItem: () => { throw Error('denied'); }, setItem: () => { throw Error('denied'); } } as any;
  const g = mission(); g.hud.t = (zh: string) => zh;
  try {
    g.prepareMission('?mission=operation-120');
    assert.equal(g.sim.mission.id, 'corridor-01');
    g.action('armory:solo');g.action('mission:operation-004'); assert.equal(g.sim.mission.id, 'corridor-01');
    g.action('mission:patrol-03');
    for (const unit of g.sim.units) if (!unit.friendly) unit.hp = 0;
    g.sim.start(); for (const unit of g.sim.units) if (!unit.friendly) unit.hp = 0;
    for(let i=0;i<g.sim.mission.events.length;i++)g.sim.spawned.add(i);
    g.sim.phase = 'success'; g.saveMissionResult();
    assert.deepEqual(g.platform.missions.cleared, ['patrol-03']);
    g.action('missionNext'); assert.equal(g.sim.mission.id, 'operation-004');
    assert.equal(g.sim.phase, 'briefing');assert.equal(g.armory.view.page,'base');
    g.sim.phase = 'briefing';
    cc.sys.isBrowser = true;
    (globalThis as any).SmallGamesDev = { isEnabled: () => true };
    g.prepareMission('?mission=operation-120'); assert.equal(g.sim.mission.id, 'operation-120');
    assert(g.operationPractice);
    g.sim.start(); for (const unit of g.sim.units) if (!unit.friendly) unit.hp = 0;
    g.sim.phase = 'success'; g.saveMissionResult();
    assert.deepEqual(g.platform.missions.cleared, ['patrol-03'], 'developer practice awards no progression');
  } finally {
    cc.sys.isBrowser = false; cc.sys.localStorage = originalStorage; g.platform.dispose();
    if (originalDev === undefined) delete (globalThis as any).SmallGamesDev;
    else (globalThis as any).SmallGamesDev = originalDev;
  }
});

test('explicit dev=0 is retained when mission shortcuts are synchronized', () => {
  const g = mission(); g.sim.phase = 'briefing';
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
  const originalHistory = Object.getOwnPropertyDescriptor(globalThis, 'history');
  const browserLocation = { href: 'https://example.test/night/?mission=training-60&dev=0&private=secret' };
  cc.sys.isBrowser = true;
  Object.defineProperties(globalThis, {
    location: { configurable: true, value: browserLocation },
    history: { configurable: true, value: { replaceState(_state: unknown, _title: string, url: string) { browserLocation.href = url; } } },
  });
  try {
    g.action('armory:solo');g.action('mission:ambush-02');
    assert.equal(browserLocation.href, 'https://example.test/night/?mission=ambush-02&dev=0');
  } finally {
    cc.sys.isBrowser = false; g.platform.dispose();
    for (const [name, original] of [['location', originalLocation], ['history', originalHistory]] as const)
      if (original) Object.defineProperty(globalThis, name, original); else delete (globalThis as any)[name];
  }
});


test('base configuration leads directly to modes and retry returns to configuration',()=>{
  const g=mission();g.sim.phase='briefing';g.action('start');assert.equal(g.sim.phase,'briefing');
  assert.equal(g.armory.view.page,'base');assert.equal(g.armory.view.kits.solo.length,3);
  g.action('armory:solo');assert(g.hud.missionsOpen);g.action('start');
  assert.equal(g.sim.phase,'playing');assert.deepEqual(g.sim.loadout,g.armory.view.kits.solo);assert.equal(g.sim.guns.length,4);
  g.sim.phase='failure';g.action('retry');assert.equal(g.sim.phase,'briefing');assert.equal(g.armory.view.page,'base');
  assert(!g.hud.missionsOpen);g.action('start');assert.equal(g.sim.phase,'briefing');g.platform.dispose();
});

test('settings controls stay paused, subpages return to settings, and system pauses remain authoritative', () => {
  const g = mission(); g.hud.t = (zh: string) => zh;
  g.world.zoom = 1; g.world.adjustZoom = (factor: number) => { g.world.zoom *= factor; };
  g.world.sensor = () => { g.world.thermal = !g.world.thermal; };
  g.action('settings'); assert(g.sim.pauses.has('settings')); assert.equal(g.sim.held.size, 0);
  g.action('flightControls'); assert(g.hud.toolsOpen);
  g.action('sensor'); assert(g.world.thermal); assert(g.sim.paused);
  g.action('close'); assert(!g.hud.toolsOpen); assert(g.sim.paused);
  g.action('zoomControls'); g.action('lensIn'); assert.equal(g.world.zoom, 1.5); assert(g.sim.paused);
  g.action('lensOut'); assert.equal(g.world.zoom, 1); assert(g.sim.paused);
  g.action('close'); assert(!g.hud.zoomOpen); assert(g.sim.paused);
  g.action('convoy'); assert.equal(g.sim.convoy, 'holdRequested');
  g.hide(); g.action('convoy'); assert.equal(g.sim.convoy, 'holdRequested');
  g.action('resume'); assert(g.sim.pauses.has('background')); assert(!g.sim.pauses.has('settings'));
  g.show(); assert(!g.sim.paused); g.platform.dispose();
});

test('muting through settings stops every voice, persists the choice and blocks new sound', () => {
  const g = mission(), p = g.platform, saved = new Map<string, string>(), previous = cc.sys.localStorage;
  cc.sys.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) } as any;
  try {
    p.activate(); p.speak('priority', 'zh'); p.play('rapid'); p.ambience(true);
    g.action('sound'); assert(p.muted); assert(g.hud.muted); assert(!p.radio.playing);
    assert([...p.voices.values()].every((source: any) => !source.playing));
    p.speak('day', 'zh'); p.play('rapid'); p.ambience(true);
    assert(!p.radio.playing); assert(!p.engine.playing); assert([...p.voices.values()].every((source: any) => !source.playing));
    assert.equal(saved.get('night-overwatch-muted'), 'true');
    g.action('sound'); assert(!p.muted); assert(!g.hud.muted); p.play('rapid'); assert(p.voices.get('rapid').playing);
  } finally { cc.sys.localStorage = previous; p.dispose(); }
});

test('skipping support keeps background frozen without reintroducing a countdown', () => {
  const g = mission(); g.hud.t = (zh: string) => zh; g.platform.rewards.pendingSupply = true;
  g.action('settings'); g.action('supply'); g.hide(); g.action('supplyLater');
  assert.equal(g.sim.resumeCountdown, 0); assert(g.sim.pauses.has('background')); assert(g.platform.rewards.pendingSupply);
  g.show(); assert(!g.sim.paused); assert.equal(g.sim.resumeCountdown, 0); g.platform.dispose();
});

test('priority action moves both view and reticle, clears firing and stays inert while paused', () => {
  const g = mission(), target = g.sim.units.find((u: any) => !u.friendly);
  Object.assign(target, { x: g.sim.rescue.x + 5, z: g.sim.rescue.z, born: -30, attack: 3 });
  const threat = g.sim.priorityThreat; assert(threat);
  g.sim.setFire('touch:1', true); g.action('priority');
  assert.equal(g.world.follow, false); assert.equal(g.world.center.x, threat.unit.x); assert.equal(g.world.center.z, threat.unit.z);
  assert.equal(g.sim.aim.x, threat.unit.x); assert.equal(g.sim.aim.z, threat.unit.z); assert.equal(g.sim.held.size, 0);
  g.action('settings'); const aim = { ...g.sim.aim }; target.x += 4; g.action('priority'); assert.deepEqual(g.sim.aim, aim);
  g.platform.dispose();
});

test('lottery opportunity accepts actual completion only',async()=>{
  const g=mission();assert(!g.platform.lotteryAdsAvailable);assert(!(await g.platform.offerLottery()));
  for(const status of ['dismissed','unavailable','failed','mock','completed']){
    g.platform.rewardProvider=async(o:any)=>{assert.equal(o.id,'night-overwatch:armory-lottery');return {status};};
    assert.equal(await g.platform.offerLottery(),status==='completed');
  }
  g.platform.dispose();
});

test('trial start requires a durable begin receipt and retains existing homing ammo',async()=>{
 const g=mission(),q=g.armory;g.sim.phase='briefing';let begun=false;
 const wallet={playerId:'pilot',revision:1,coins:0,inventory:{coolant:0},owned:{hePower:1,heVelocity:1,heavyPower:1},trials:{'hePower:3':1},signedDays:[],day:'2026-10-31',signedToday:false};
 q.bind('pilot',true,{nightWallet:async()=>wallet,nightWalletAction:async()=>wallet},false);await q.refresh();q.selectTrial('hePower',3);
 g.platform.rewards.ammo=2;g.selectMission('corridor-01');const kit=g.sim.loadout;
 g.online={leave(){},rankStatus:'recording',startRanking:async()=>({id:'prepared',loadout:kit}),recorder:{begin:()=>begun,record(){},invalidate(){}}};
 g.beginCampaign();await new Promise(r=>setImmediate(r));assert.equal(g.sim.phase,'briefing');assert.equal(g.sim.homingAmmo,2);
 begun=true;g.beginCampaign();await new Promise(r=>setImmediate(r));assert.equal(g.sim.phase,'playing');assert.equal(g.sim.homingAmmo,2);assert.equal(g.platform.rewards.ammo,2);
 g.platform.dispose();
});
test('escape from mission selection returns to base configuration',()=>{
 const g=mission();g.sim.phase='briefing';g.action('armory:solo');assert(g.hud.missionsOpen);g.keyDown({keyCode:27});
 assert(!g.hud.missionsOpen);assert.equal(g.armory.view.page,'base');g.platform.dispose();
});
