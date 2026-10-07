import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { defaultSelection } from '../assets/scripts/Selection.ts';
import { RaceManager } from '../assets/scripts/RaceManager.ts';
import { kartChallengeQuery, readKartChallenge } from '../assets/scripts/RouteChallenges.ts';
import { Career } from '../assets/scripts/Career.ts';
class SceneNode {
  active = true; children: SceneNode[] = []; parent?: SceneNode;
  addChild(node: SceneNode) { node.parent = this; this.children.push(node); }
  setSiblingIndex(index: number) {
    if (!this.parent) return;
    const siblings = this.parent.children;
    siblings.splice(siblings.indexOf(this), 1);
    siblings.splice(index, 0, this);
  }
  destroy() {}
}
class Color { fromHEX() { return this; } }
const cc = { _decorator: { ccclass: () => (type: any) => type },
  Node: SceneNode, Rect: class {}, Vec3: class {}, UITransform: class {}, Color, Component: class { node = new SceneNode(); isValid = true; },
  Camera: { ClearFlag: { SKYBOX: 1 } }, Layers: {}, game: { emit() {} }, Game: {}, JsonAsset: class {}, profiler: {}, resources: {},
  sys: { isBrowser: false, localStorage: { getItem: () => null, setItem() {} } } };
const folder = new URL('../assets/scripts/', import.meta.url), sourceURL = new URL('KartGame.ts', folder);
const visual = new Map([
  ['./ThemeView', 'export const buildTheme = async () => {};'],
  ['./SceneArt', 'export const palette = {red: "#f00", blue: "#00f", yellow: "#ff0", mint: "#0ff"}; export const requestedArt = () => [];'],
  ['./GlacierSample', 'export const setThemeLighting = () => {};'],
  ['./KartView', 'export class KartView { ready = Promise.resolve(); constructor(parent, color, selection, equipment) { this.selection = selection; this.equipment = equipment; } }'],
  ...['ItemsView', 'ChaseCamera', 'HUD', 'HomePanel', 'MenuPreview', 'KartController', 'AudioFeedback', 'MultiplayerPanel'].map((name) =>
    ['./' + name, `export class ${name} { ready = Promise.resolve(); }`] as [string, string]),
]);
visual.set('./MultiplayerPanel', `export class MultiplayerPanel {
  root = { active: false };
  constructor(hud, client, selection, clear, leave, canUse) { this.selection = selection; this.canUse = canUse; }
  refresh() {}
}`);
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
  const root = new SceneNode(), settings = new SceneNode(); root.addChild(settings);
  g.hud = { challengeNotice: '', root, settings };
  g.camera = { camera: {} };
  g.career = new Career(cc.sys.localStorage);
  const home = new SceneNode(); home.active = false; root.addChild(home);
  g.home = { root: home, page: 'home', inputEnabled: true,
    setInputEnabled(enabled: boolean) { this.inputEnabled = enabled; },
    show(page = 'home') { this.page = page; this.root.active = true; }, hide() { this.root.active = false; } };
  g.controller = { clear() {} };
  g.audio = { activate() {} };
  g.raceRewardId = 'test-race';
  return g;
}

test('locked vehicles and drivers are preview-only at every solo race entry, including shared challenges', () => {
  for (const field of ['vehicle', 'driver'] as const) {
    const g = garage();
    g.home.show('setup'); g.race.loaded = true;
    g.selection[field] = field === 'vehicle' ? 'formula' : 'champion';
    g.activeChallenge = readKartChallenge(query);
    const original = g.race, version = g.loadVersion;
    g.prepareRace();
    assert.equal(g.home.root.active, true);
    assert.equal(g.race, original);
    assert.match(g.setupNotice, /尚未解锁/);
    assert.equal(g.loadSelection(true), false);
    assert.equal(g.loadVersion, version, 'reject before unloading the preview or replacing the race');
    g.home.hide(); g.hud.staged = true;
    g.startRace();
    assert.equal(g.race.phase, 'ready', 'start/Enter cannot bypass ownership');
    g.home.show('setup'); g.restart();
    assert.equal(g.home.root.active, true, 'retry cannot hide the menu after rejected preparation');
    assert.equal(g.race, original);
  }
});

test('room preparation and direct network assembly cannot use locked local cosmetics', () => {
  for (const field of ['vehicle', 'driver'] as const) {
    const g = garage(), sent: unknown[] = [];
    const locked = { ...defaultSelection, [field]: field === 'vehicle' ? 'formula' : 'champion' };
    const room = { ...locked, code: 'ABCD1234', phase: 'lobby', revision: 3,
      seed: 88, raceId: 1, roster: [{ id: 'you', name: 'YOU', ...locked }] };
    g.selection = { ...locked }; g.race.loaded = true; g.networkIndexes = [0];
    g.multiplayer = { room, send: message => sent.push(message) };
    g.roomPanel = { root: { active: false }, refresh() {} };
    g.markPrepared();
    assert.deepEqual(sent, []); assert.equal(g.networkSelectionBlocked, true);
    assert.equal(g.roomPanel.root.active, true); assert.match(g.multiplayer.status, /未解锁.*退出后解锁/);
    const version = g.loadVersion, race = g.race;
    assert.equal(g.loadSelection(false, false, room), false);
    assert.equal(g.loadVersion, version); assert.equal(g.race, race, 'reject before replacing the local preview');
    assert.deepEqual(sent, [], 'a refused room never announces loaded');

    g.career.profile.owned.push(`${field}:${locked[field]}`);
    g.markPrepared();
    assert.equal(g.networkSelectionBlocked, false);
    assert.deepEqual(sent, [{ type: 'prepared', revision: 3 }]);
    g.markPrepared(); assert.equal(sent.length, 1);
  }
});

test('room callbacks use owned entry cosmetics and reject locked self roster before loading or duplicate acknowledgements', () => {
  const originalLoad = (cc.resources as any).load;
  (cc.resources as any).load = (_name, _type, done) => done(null, { json: { serverUrl: 'wss://kart.test' } });
  try {
    const g = garage(); g.selection.vehicle = 'formula'; g.setupMultiplayer();
    assert.equal(g.roomPanel.selection().vehicle, 'classic-kart', 'entry cannot inherit a locked setup preview');
    assert.equal(g.roomPanel.canUse(g.selection), false);
    const sent: unknown[] = [], loads: unknown[] = [];
    const client = g.multiplayer; client.selfId = 'you'; client.send = message => sent.push(message);
    g.race.loaded = true; g.networkRaceId = 7;
    const room = { ...defaultSelection, code: 'ABCD1234', phase: 'loading', raceId: 7, seed: 88,
      roster: [{ id: 'you', name: 'YOU', vehicle: 'formula', driver: 'rookie' }] };
    client.room = room;
    g.loadSelection = (...args) => { loads.push(args); return true; };
    client.onRoom(room);
    assert.deepEqual(loads, []); assert.deepEqual(sent, []);
    assert.equal(g.roomPanel.root.active, true); assert.equal(g.networkSelectionBlocked, true);
    assert.match(client.status, /房主换车/);
    g.networkRaceId = 0;
    room.roster[0].vehicle = 'classic-kart'; client.onRoom(room);
    assert.equal(g.networkSelectionBlocked, false);
    assert.equal(g.roomPanel.root.active, false);
    assert.deepEqual(loads, [[false, false, room]], 'an owned roster follows the existing room assembly path');
  } finally { (cc.resources as any).load = originalLoad; }
});

test('a late asset completion cannot acknowledge loading after a room ownership rejection', async () => {
  const g = garage(), sent: unknown[] = [];
  const room = { ...defaultSelection, code: 'ABCD1234', phase: 'loading', raceId: 7, seed: 88,
    roster: [{ id: 'you', name: 'YOU', ...defaultSelection }] };
  g.multiplayer = { room, send: message => sent.push(message) };
  g.roomPanel = { root: { active: false }, refresh() {} };
  g.networkIndexes = [0];
  assert.equal(g.loadSelection(false, false, room), true);
  g.rejectRoomSelection();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(g.race.loaded, false);
  assert.deepEqual(sent, []);
  assert.equal(g.roomPanel.root.active, true);
});

test('shared challenges fall back to equipped cosmetics but retain route, mode, seed and tuning', async () => {
  for (const deferred of [false, true]) {
    const g = garage();
    g.career.profile.owned.push('vehicle:electric'); g.career.profile.equipped.vehicle = 'electric';
    const parts = { engine: 2, grip: 3, nitro: 1 };
    const locked = { ...defaultSelection, theme: 'glacier', route: 'city', vehicle: 'formula', driver: 'champion' };
    const shared = Object.fromEntries(new URLSearchParams(kartChallengeQuery(locked, 100, 42, 'sprint', parts)));
    if (deferred) g.race.phase = 'racing';
    g.receiveChallenge(shared);
    if (deferred) g.enterGarage();
    await Promise.resolve();
    assert.deepEqual(g.selection, { ...locked, vehicle: 'electric', driver: 'rookie' });
    assert.deepEqual(g.activeChallenge.selection, g.selection);
    assert.equal(g.seed, 100); assert.equal(g.mode, 'sprint');
    assert.deepEqual(g.race.upgrades, parts);
    assert.equal(g.loadSelection(true), true);
    assert.equal(g.race.phase, 'ready');
    assert.equal(g.career.profile.owned.includes('vehicle:formula'), false);
  }
});

test('browsing persists route choices using equipped cosmetics and cannot equip a shop preview', () => {
  const saved = new Map<string, string>(), originalStore = cc.sys.localStorage;
  cc.sys.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => { saved.set(key, value); } };
  try {
    const g = garage(); g.loadSelection = () => true;
    g.home.show('shop'); g.race.loaded = true;
    g.career.profile.owned.push('vehicle:electric');
    g.preview({ vehicle: 'electric', decoration: 'halo', pet: 'star-bot' });
    g.choose('route', 1);
    assert.deepEqual(JSON.parse(saved.get('kart-selection-v1')!), { ...g.selection, vehicle: 'classic-kart', driver: 'rookie' });
    g.prepareRace();
    assert.equal(g.career.profile.equipped.vehicle, 'classic-kart');
    assert.equal(saved.has('kart-career-v1'), false);
    g.equip();
    assert.equal(g.selection.vehicle, 'classic-kart');
    assert.equal(g.previewEquipment, undefined);
  } finally { cc.sys.localStorage = originalStore; }
});

test('full race assembly ignores temporary decoration and pet previews', () => {
  const g = garage(); g.previewEquipment = { decoration: 'halo', pet: 'star-bot' };
  g.loadSelection(true);
  assert.equal(g.views[0].equipment.decoration, 'none');
  assert.equal(g.views[0].equipment.pet, 'none');
});

test('career goals lead to safe setup with unvisited routes or at least one championship rival', () => {
  for (const stat of ['races', 'wins', 'routes']) {
    const g = garage(); let loads = 0;
    g.loadSelection = (fullRace = false) => { loads++; assert.equal(fullRace, false); };
    g.botCount = 0; g.home.show('career');
    g.career.profile.routes = ['seaside', 'city'];
    g.selection.vehicle = 'formula'; g.previewEquipment = { decoration: 'halo', pet: 'star-bot' };
    g.activeChallenge = readKartChallenge(query);
    g.challenge(stat);
    assert.equal(g.home.page, 'setup'); assert.equal(g.home.root.active, true);
    assert.equal(g.race.phase, 'ready'); assert.equal(loads, 1);
    assert.equal(g.selection.vehicle, 'classic-kart'); assert.equal(g.previewEquipment, undefined);
    assert.equal(g.activeChallenge, undefined);
    if (stat === 'wins') assert.equal(g.botCount, 1);
    if (stat === 'routes') { assert.equal(g.selection.route, 'desert'); assert.equal(g.selection.theme, 'desert'); }
  }
});

test('settings retain the menu background, block actions and restore the same page, then resume a paused race', () => {
  const g = garage(); g.home.show('setup'); g.home.advanced = true;
  const selection = { ...g.selection }, bots = g.botCount;
  g.toggleSettings();
  assert.equal(g.home.root.active, true);
  assert.equal(g.home.inputEnabled, false);
  assert.equal(g.hud.root.children.at(-1), g.hud.settings);
  g.choose('route', 1); g.preview({ vehicle: 'formula' }); g.setBots(0, true); g.challenge('routes');
  g.race.loaded = true; g.prepareRace();
  assert.deepEqual(g.selection, selection); assert.equal(g.botCount, bots);
  assert.equal(g.race.phase, 'ready');
  g.toggleSettings();
  assert.equal(g.home.inputEnabled, true); assert.equal(g.home.page, 'setup'); assert.equal(g.home.advanced, true);
  assert.equal(g.settingsFromHome, false);
  g.home.hide(); g.race.phase = 'racing'; g.toggleSettings();
  assert.equal(g.race.phase, 'paused'); g.toggleSettings(); assert.equal(g.race.phase, 'racing');
  assert.equal(g.home.root.active, false);
});

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
