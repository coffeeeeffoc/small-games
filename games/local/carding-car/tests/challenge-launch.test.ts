import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { defaultSelection } from '../assets/scripts/Selection.ts';
import { RaceManager } from '../assets/scripts/RaceManager.ts';
import { kartChallengeQuery, readKartChallenge } from '../assets/scripts/RouteChallenges.ts';
import { Career } from '../assets/scripts/Career.ts';
class SceneNode { active = true; addChild() {} destroy() {} }
class Color { fromHEX() { return this; } }
const cc = { _decorator: { ccclass: () => (type: any) => type },
  Node: SceneNode, Rect: class {}, Vec3: class {}, Color, Component: class { node = new SceneNode(); isValid = true; },
  Camera: { ClearFlag: { SKYBOX: 1 } }, Layers: {}, game: { emit() {} }, Game: {}, JsonAsset: class {}, profiler: {}, resources: {},
  sys: { isBrowser: false, localStorage: { getItem: () => null, setItem() {} } } };
const folder = new URL('../assets/scripts/', import.meta.url), sourceURL = new URL('KartGame.ts', folder);
const visual = new Map([
  ['./ThemeView', 'export const buildTheme = async () => {};'],
  ['./SceneArt', 'export const palette = {red: "#f00", blue: "#00f", yellow: "#ff0", mint: "#0ff"}; export const requestedArt = () => [];'],
  ['./GlacierSample', 'export const setThemeLighting = () => {};'],
  ['./KartView', 'export class KartView { ready = Promise.resolve(); constructor(parent, color, selection, equipment) { this.selection = selection; this.equipment = equipment; } }'],
  ...['ItemsView', 'ChaseCamera', 'HUD', 'HomePanel', 'KartController', 'AudioFeedback', 'MultiplayerPanel'].map((name) =>
    ['./' + name, `export class ${name} { ready = Promise.resolve(); }`] as [string, string]),
]);
(globalThis as any).__kartChallengeCC = cc;
const hooks = registerHooks({
  resolve(id, context, next) {
    if (context.parentURL?.startsWith(folder.href)) {
      if (id === 'cc' || visual.has(id)) return { url: 'kart-challenge:' + id, shortCircuit: true };
      if (id.startsWith('./') && !id.endsWith('.ts')) return next(new URL(id + '.ts', context.parentURL).href, context);
    }
    return next(id, context);
  },
  load(url, context, next) {
    if (url === 'kart-challenge:cc') return { format: 'module', shortCircuit: true,
      source: `export const { ${Object.keys(cc).join(',')} } = globalThis.__kartChallengeCC;` };
    if (url.startsWith('kart-challenge:')) return { format: 'module', shortCircuit: true, source: visual.get(url.slice(15))! };
    const result = next(url, context);
    if (url === sourceURL.href) return { ...result, format: 'module', source:
      stripTypeScriptTypes(result.source!.toString().replace("@ccclass('KartGame')", ''), { mode: 'transform' }) };
    return result;
  },
});
let KartGame: any;
try { ({ KartGame } = await import(sourceURL.href)); }
finally { hooks.deregister(); delete (globalThis as any).__kartChallengeCC; }
const query = Object.fromEntries(new URLSearchParams(kartChallengeQuery({ ...defaultSelection, route: 'city' }, 12345, 150)));
function garage() {
  const g = new KartGame();
  g.hud = { challengeNotice: '' };
  g.camera = { camera: {} };
  g.career = new Career(cc.sys.localStorage);
  g.home = { root: { active: false }, show() {}, hide() {} };
  g.raceRewardId = 'test-race';
  return g;
}

test('all eight grid slots copy player equipment or sample the full random bot catalog before start', async () => {
  const g = garage(); g.botCount = 7;
  const original = Math.random;
  Math.random = () => 0.999;
  try {
    g.loadSelection(true); await Promise.resolve();
    assert.equal(g.race.phase, 'ready');
    assert.equal(g.views.length, 8);
    assert.ok(g.views.slice(1).every((v: any) => v.selection.vehicle === 'supercar' && v.selection.driver === 'street-racer'));
    assert.ok(g.views.slice(1).every((v: any) => v.equipment.decoration === 'comet' && v.equipment.pet === 'mini-dragon'));
    g.sameBots = true;
    g.loadSelection(true); await Promise.resolve();
    assert.ok(g.views.every((v: any) => v.selection.vehicle === g.selection.vehicle && v.selection.driver === g.selection.driver));
    g.botCount = 0; g.loadSelection(true); await Promise.resolve();
    assert.equal(g.views.length, 1);
  } finally { Math.random = original; }
});

test('failed finish rewards retain the same ID and settle once after storage recovers', () => {
  const values = new Map<string, string>(); let failed = true;
  const g = garage();
  g.career = new Career({ getItem: key => values.get(key) ?? null, setItem(key, value) { if (failed) throw new Error('quota'); values.set(key, value); } });
  g.mode = 'sprint'; g.race = new RaceManager({}, 12, 4, 'sprint');
  g.race.phase = 'finished';
  Object.assign(g.race.drivers[0].progress, { laps: 1, finishedAt: 30, lapTimes: [30] });
  g.saveFinishedRace();
  assert.equal(g.pendingRewards.length, 1);
  assert.equal(g.career.profile.races, 0);
  assert.match(g.hud.rewardText, /自动重试/);
  failed = false; g.settleRewards();
  assert.equal(g.pendingRewards.length, 0);
  assert.equal(g.career.profile.races, 1);
  const profile = JSON.stringify(g.career.profile);
  g.settleRewards();
  assert.equal(JSON.stringify(g.career.profile), profile);
});

test('native warm challenges wait until the player opens the garage and never reset a live race or room', () => {
  const g = garage();
  let loads = 0;
  g.loadSelection = () => loads++;
  g.race.phase = 'racing';
  g.receiveChallenge(query);
  assert.equal(loads, 0);
  assert.equal(g.selection.route, 'seaside');
  assert.equal(g.pendingChallenge.seed, 12345);
  assert.match(g.hud.challengeNotice, /不.*断本场/);
  g.enterGarage();
  assert.equal(loads, 1);
  assert.equal(g.selection.route, 'city');
  assert.equal(g.activeChallenge.seed, 12345);
  assert.equal(g.pendingChallenge, undefined);
  g.race.phase = 'ready';
  g.roomPanel = { root: { active: true } };
  g.receiveChallenge(query);
  assert.equal(loads, 1, 'an open multiplayer dialog is not replaced');
  g.multiplayer = { room: { code: 'ABCD1234' } };
  g.enterGarage();
  assert.equal(loads, 1, 'the player must leave the network room before accepting a solo challenge');
  g.receiveChallenge({ ...query, seed: '4294967296' });
  assert.equal(loads, 1);
});

test('actual garage assembly keeps the shared pickup seed across retry and cosmetic choices', async () => {
  const g = garage();
  g.receiveChallenge(query);
  await Promise.resolve();
  const items = JSON.stringify(g.race.items);
  assert.equal(g.seed, 12345);
  assert.equal(g.race.phase, 'ready', 'opening a challenge never starts before explicit input');
  g.loadSelection(true);
  await Promise.resolve();
  assert.equal(g.seed, 12345);
  assert.equal(JSON.stringify(g.race.items), items);
  g.race.phase = 'ready';
  g.choose('theme', 1);
  await Promise.resolve();
  assert.equal(JSON.stringify(g.race.items), items);
  g.choose('route', 1);
  await Promise.resolve();
  assert.equal(g.activeChallenge, undefined, 'choosing another route exits the old challenge');
  assert.notEqual(g.seed, 12345);
});

test('sharing uses the completed race seed and reports a native UI request without granting a result', async () => {
  const g = garage();
  let shared: any;
  (globalThis as any).__kartPlatform = { share(query: string, title: string) { shared = { query, title }; return true; } };
  try {
    g.seed = 54321; g.race.phase = 'finished'; g.race.drivers[0].progress.finishedAt = 160;
    await g.shareChallenge();
    const challenge = readKartChallenge(Object.fromEntries(new URLSearchParams(shared.query)))!;
    assert.equal(challenge.seed, 54321);
    assert.equal(challenge.time, 160);
    assert.match(shared.title, /同道具/);
    assert.match(g.hud.challengeNotice, /已请求分享/);
    assert.equal(g.race.phase, 'finished');
    assert.equal(g.sharing, false);
  } finally { delete (globalThis as any).__kartPlatform; }
});

test('browser sharing keeps a clean copyable challenge address after API failures and treats cancellation honestly', async () => {
  const g = garage();
  g.seed = 2468; g.race.phase = 'finished'; g.race.drivers[0].progress.finishedAt = 160;
  const names = ['location', 'history', 'navigator'] as const;
  const originals = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  let address = '', copied = '';
  const browserNavigator: any = { share: async () => { throw null; } };
  cc.sys.isBrowser = true;
  Object.defineProperties(globalThis, {
    location: { configurable: true, value: { href: 'https://name:password@example.test/kart/?token=private#old' } },
    history: { configurable: true, value: { replaceState(_state: unknown, _title: string, url: string) { address = url; } } },
    navigator: { configurable: true, value: browserNavigator },
  });
  try {
    await g.shareChallenge();
    const url = new URL(address);
    assert.equal(url.username, ''); assert.equal(url.password, ''); assert.equal(url.hash, '');
    assert.equal(url.searchParams.has('token'), false);
    assert.equal(readKartChallenge(Object.fromEntries(url.searchParams))!.seed, 2468);
    assert.match(g.hud.challengeNotice, /复制浏览器地址/);
    assert.equal(g.sharing, false);
    browserNavigator.share = async () => { throw { name: 'AbortError' }; };
    await g.shareChallenge();
    assert.match(g.hud.challengeNotice, /已取消分享/);
    browserNavigator.share = undefined;
    browserNavigator.clipboard = { writeText: async () => { throw undefined; } };
    await g.shareChallenge();
    assert.match(g.hud.challengeNotice, /复制浏览器地址/);
    browserNavigator.clipboard = { writeText: async (value: string) => { copied = value; } };
    await g.shareChallenge();
    assert(copied.endsWith('\n' + address));
    assert.match(g.hud.challengeNotice, /分享已完成/);
    assert.equal(g.race.phase, 'finished');
    assert.equal(g.sharing, false);
  } finally {
    cc.sys.isBrowser = false;
    names.forEach((name, index) => {
      if (originals[index]) Object.defineProperty(globalThis, name, originals[index]!);
      else delete (globalThis as any)[name];
    });
  }
});

test('actual race assembly switches short rules, shares them explicitly and restores standard room rules', async () => {
  const g = garage();
  g.toggleMode();
  await Promise.resolve();
  assert.equal(g.mode, 'sprint'); assert.equal(g.race.laps, 1);
  assert.equal(g.race.phase, 'ready');
  const sprintQuery = Object.fromEntries(new URLSearchParams(kartChallengeQuery(defaultSelection, 77, 30, 'sprint')));
  g.receiveChallenge(sprintQuery);
  await Promise.resolve();
  const items = JSON.stringify(g.race.items);
  g.loadSelection(true);
  await Promise.resolve();
  assert.equal(g.race.laps, 1); assert.equal(g.seed, 77);
  assert.equal(JSON.stringify(g.race.items), items);
  g.race.phase = 'racing'; g.toggleMode();
  assert.equal(g.mode, 'sprint', 'a running short race cannot switch its finish line');
  g.networkIndexes = [0, 1];
  g.loadSelection(false, false, { seed: 99, roster: [
    { name: 'YOU', vehicle: 'classic-kart', driver: 'rookie' },
    { name: 'FRIEND', vehicle: 'classic-kart', driver: 'rookie' },
  ] });
  await Promise.resolve();
  assert.equal(g.mode, 'standard'); assert.equal(g.race.laps, 3);
  assert.equal(g.race.networked, true); assert.equal(g.activeChallenge, undefined);
});

test('short finish saving cannot overwrite three-lap records, passport or legacy best', () => {
  const saved = new Map([
    ['coastline-records-v1', JSON.stringify([{ time: 120, bestLap: 40, place: 1 }])],
    ['coastline-best', '120'], ['kart-route-passport-v1', '{"seaside":1}'],
  ]);
  const originals = new Map(saved), originalStore = cc.sys.localStorage;
  const writes: string[] = [];
  cc.sys.localStorage = { getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => { writes.push(key); saved.set(key, value); } };
  try {
    const g = garage(); g.mode = 'sprint'; g.passport = { seaside: 1 };
    g.race = new RaceManager({}, 12, 4, 'sprint');
    g.readRouteRecords();
    assert.deepEqual(g.records, [], 'three-lap and legacy scores do not become a one-lap target');
    g.race.phase = 'finished'; g.race.time = 35;
    Object.assign(g.race.drivers[0].progress, { laps: 1, finishedAt: 30, lapTimes: [30] });
    g.saveFinishedRace();
    assert.deepEqual(writes, ['kart-career-v1', 'kart-sprint-records-v1-seaside']);
    assert.equal(g.career.profile.races, 1);
    assert.ok(g.career.profile.coins > 0);
    for (const [key, value] of originals) assert.equal(saved.get(key), value);
    assert.deepEqual(g.passport, { seaside: 1 });
    assert.equal(JSON.parse(saved.get(g.recordKey)!)[0].time, 30);
    g.race.networked = true; g.saveFinishedRace();
    assert.equal(writes.length, 2);
    g.mode = 'standard'; g.readRouteRecords();
    assert.equal(g.records[0].time, 120);
  } finally { cc.sys.localStorage = originalStore; }
});

test('actual garage choices synchronize public URLs and retain active challenge rules without private data', () => {
  const names = ['location', 'history'] as const;
  const originals = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  const browserLocation = { href: 'https://user:password@example.test/kart/?mode=sprint&private=secret#old' };
  cc.sys.isBrowser = true;
  Object.defineProperties(globalThis, {
    location: { configurable: true, value: browserLocation },
    history: { configurable: true, value: { replaceState(_state: unknown, _title: string, url: string) { browserLocation.href = url; } } },
  });
  try {
    const g = garage(); g.mode = 'sprint'; g.loadSelection = () => {};
    g.toggleMode();
    assert.equal(browserLocation.href, 'https://example.test/kart/?mode=standard');
    const query = kartChallengeQuery(defaultSelection, 77, 30, 'sprint');
    browserLocation.href = 'https://example.test/kart/?' + query + '&private=secret#old';
    g.mode = 'sprint'; g.activeChallenge = readKartChallenge(Object.fromEntries(new URLSearchParams(query)));
    g.choose('theme', 1);
    const active = readKartChallenge(Object.fromEntries(new URL(browserLocation.href).searchParams))!;
    assert.equal(active.seed, 77); assert.equal(active.time, 30); assert.equal(active.mode, 'sprint');
    assert.equal(new URL(browserLocation.href).searchParams.has('private'), false);
    g.choose('route', 1);
    assert.equal(browserLocation.href, 'https://example.test/kart/?mode=sprint');
    assert.equal(g.activeChallenge, undefined, 'explicitly exiting a challenge removes its old target from the address');
  } finally {
    cc.sys.isBrowser = false;
    names.forEach((name, index) => {
      if (originals[index]) Object.defineProperty(globalThis, name, originals[index]!);
      else delete (globalThis as any)[name];
    });
  }
});

test('a delayed share success or failure cannot write feedback onto a newly selected race', async () => {
  const names = ['location', 'history', 'navigator'] as const;
  const originals = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  const browserLocation = { href: 'https://example.test/kart/?mode=sprint' };
  let settle: (value?: any) => void;
  const browserNavigator = { share: () => Promise.resolve() };
  cc.sys.isBrowser = true;
  Object.defineProperties(globalThis, {
    location: { configurable: true, value: browserLocation },
    history: { configurable: true, value: { replaceState(_state: unknown, _title: string, url: string) { browserLocation.href = url; } } },
    navigator: { configurable: true, value: browserNavigator },
  });
  try {
    for (const reject of [false, true]) {
      const g = garage(); g.mode = 'sprint'; g.race = new RaceManager({}, 77, 4, 'sprint');
      g.race.phase = 'finished'; g.race.drivers[0].progress.finishedAt = 30;
      browserLocation.href = 'https://example.test/kart/?mode=sprint';
      let calls = 0;
      browserNavigator.share = () => { calls++; return new Promise((resolve, fail) => { settle = reject ? fail : resolve; }); };
      const pending = g.shareChallenge();
      await g.shareChallenge();
      assert.equal(calls, 1, 'a pending platform call remains single-flight');
      g.enterGarage(); g.toggleMode(); await Promise.resolve();
      assert.equal(g.mode, 'standard'); assert.equal(browserLocation.href, 'https://example.test/kart/?mode=standard');
      assert.equal(g.hud.challengeNotice, '');
      settle!(reject ? new Error('Share failed') : undefined);
      await pending;
      assert.equal(g.hud.challengeNotice, '', 'the old request does not announce the wrong current URL or race rules');
      assert.equal(g.sharing, false);
    }
  } finally {
    cc.sys.isBrowser = false;
    names.forEach((name, index) => {
      if (originals[index]) Object.defineProperty(globalThis, name, originals[index]!);
      else delete (globalThis as any)[name];
    });
  }
});
