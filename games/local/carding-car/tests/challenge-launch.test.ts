import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { defaultSelection } from '../assets/scripts/Selection.ts';
import { kartChallengeQuery, readKartChallenge } from '../assets/scripts/RouteChallenges.ts';
class SceneNode { active = true; addChild() {} destroy() {} }
class Color { fromHEX() { return this; } }
const cc = { _decorator: { ccclass: () => (type: any) => type },
  Node: SceneNode, Color, Component: class { node = new SceneNode(); isValid = true; },
  Camera: { ClearFlag: { SKYBOX: 1 } }, Layers: {}, game: {}, Game: {}, JsonAsset: class {}, profiler: {}, resources: {},
  sys: { isBrowser: false, localStorage: { getItem: () => null, setItem() {} } } };
const folder = new URL('../assets/scripts/', import.meta.url), sourceURL = new URL('KartGame.ts', folder);
const visual = new Map([
  ['./ThemeView', 'export const buildTheme = async () => {};'],
  ['./SceneArt', 'export const palette = {red: "#f00", blue: "#00f", yellow: "#ff0", mint: "#0ff"}; export const requestedArt = () => [];'],
  ['./GlacierSample', 'export const setThemeLighting = () => {};'],
  ...['ItemsView', 'KartView', 'ChaseCamera', 'HUD', 'KartController', 'AudioFeedback', 'MultiplayerPanel'].map((name) =>
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
  return g;
}

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
