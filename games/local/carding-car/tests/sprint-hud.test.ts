import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { RaceManager } from '../assets/scripts/RaceManager.ts';
import { createKart } from '../assets/scripts/KartPhysics.ts';
import { pointAt } from '../assets/scripts/TrackGenerator.ts';
import { settingsLayout, contains } from '../assets/scripts/HUDLayout.ts';

// Exercise actual HUD content and UI geometry; this does not simulate Creator rendering.
class Transform {
  contentSize = { width: 0, height: 0 };
  setContentSize(width: number, height: number) { this.contentSize = { width, height }; }
}
class SceneNode {
  name = '';
  active = true; children: SceneNode[] = []; parent?: SceneNode;
  position = { x: 0, y: 0, z: 0 }; components = new Map();
  constructor(name = '') { this.name = name; }
  addChild(child: SceneNode) { child.parent = this; this.children.push(child); }
  addComponent(type: any) { const component = new type(); component.node = this; this.components.set(type, component); return component; }
  getComponent(type: any) { return this.components.get(type); }
  getChildByName(name: string) { return this.children.find((node) => node.name === name); }
  setPosition(x: number, y: number, z = 0) { this.position = { x, y, z }; }
}
class Color { fromHEX() { return this; } }
class Graphics { clear() {} }
for (const op of ['rect', 'roundRect', 'circle', 'moveTo', 'lineTo', 'close', 'stroke', 'fill'])
  Graphics.prototype[op] = () => {};
const cc = { Node: SceneNode, UITransform: Transform, Graphics, Color,
  Camera: class { static ProjectionType = { ORTHO: 0 }; static ClearFlag = { DEPTH_ONLY: 0 }; },
  Canvas: class {}, Label: class { static HorizontalAlign = { CENTER: 0 }; static VerticalAlign = { CENTER: 0 }; },
  Layers: { Enum: { UI_2D: 1 } }, ResolutionPolicy: { SHOW_ALL: 0 },
  sys: { isBrowser: true, isMobile: false }, view: { setDesignResolutionSize() {} } };
const sourceURL = new URL('../assets/scripts/HUD.ts', import.meta.url);
(globalThis as any).__kartHUDCC = cc;
const hooks = registerHooks({
  resolve(id, context, next) {
    if (context.parentURL === sourceURL.href) {
      if (id === 'cc') return { url: 'kart-hud:cc', shortCircuit: true };
      if (id.startsWith('./') && !id.endsWith('.ts')) return next(new URL(id + '.ts', sourceURL).href, context);
    }
    return next(id, context);
  },
  load(url, context, next) {
    if (url === 'kart-hud:cc') return { format: 'module', shortCircuit: true,
      source: `export const { ${Object.keys(cc).join(',')} } = globalThis.__kartHUDCC;` };
    return next(url, context);
  },
});
let HUD: any;
try { ({ HUD } = await import(sourceURL.href)); }
finally { hooks.deregister(); delete (globalThis as any).__kartHUDCC; }
const idle = { steer: 0, throttle: 0, brake: false, drift: false };

test('open results update remaining finishers without changing the player time or disabling exit and retry', () => {
  for (const mode of ['standard', 'sprint'] as const) {
    const hud = new HUD(new SceneNode()), race = new RaceManager({}, undefined, 4, mode);
    race.phase = 'finished'; race.time = 130;
    Object.assign(race.drivers[0].progress, { laps: race.laps, finishedAt: 120, lapTimes: [120] });
    hud.update(race, idle, false);
    assert.equal(hud.panel.active, true);
    assert.match(hud.detail.string, /2:00\.00/);
    assert.doesNotMatch(hud.detail.string, /2:10\.00/);
    assert.match(hud.standings.string, /1\s*\/\s*4/);
    assert.match(hud.standings.string, /比赛中/);
    assert.match(hud.garageLabel.string, /退出本局/);
    assert.match(hud.button.string, /再跑一场/);
    race.drivers[2].progress.finishedAt = 132;
    race.time = 134;
    hud.update(race, idle, false);
    assert.match(hud.standings.string, /2\s*\/\s*4/);
    assert.match(hud.standings.string, /2\s+对手 2\s+2:12\.00/);
    assert.match(hud.detail.string, /2:00\.00/);
    race.drivers[1].progress.finishedAt = 135;
    race.drivers[3].progress.finishedAt = 137;
    hud.update(race, idle, false);
    assert.match(hud.standings.string, /4\s*\/\s*4/);
    assert.doesNotMatch(hud.standings.string, /比赛中|未完赛/);
    assert.equal(hud.garageButton.active, true);
  }
});

test('HUD updates fourth to first and back as cars pass on the wide lane at the fork', () => {
  const hud = new HUD(new SceneNode()), race = new RaceManager();
  const go = { ...idle, throttle: 1 };
  race.phase = 'racing';
  race.drivers.forEach((driver, i) => {
    const s = race.track.shortcutStart + (i === 0 ? -2 : i);
    const p = pointAt(race.track, s), side = i === 0 ? 6 : -3;
    Object.assign(driver.kart, createKart(
      p.x + Math.cos(p.heading) * side, p.z - Math.sin(p.heading) * side, p.heading,
    ));
    driver.progress.s = driver.progress.distance = s;
    driver.safe = { ...p, s };
  });
  hud.update(race, idle, false);
  assert.match(hud.top.string, /^第 4 \/ 4 名/);
  for (let frame = 0; frame < 90; frame++) race.step(go, 1 / 60, [go, idle, idle, idle]);
  hud.update(race, go, false);
  assert.match(hud.top.string, /^第 1 \/ 4 名/);
  const brake = { ...idle, brake: true };
  for (let frame = 0; frame < 150; frame++) race.step(brake, 1 / 60, [brake, go, go, go]);
  hud.update(race, brake, false);
  assert.match(hud.top.string, /^第 4 \/ 4 名/);
  assert.equal(race.resets, 0);
});

test('ready HUD presents both race formats with separate reachable buttons and the correct lap goal', () => {
  for (const mode of ['standard', 'sprint'] as const) {
    const hud = new HUD(new SceneNode()), race = new RaceManager({}, 12, 4, mode);
    hud.update(race, idle, false);
    assert.equal(hud.garageButton.active, true);
    assert.match(hud.button.string, /开跑/);
    assert.match(hud.garageLabel.string, mode === 'sprint' ? /一圈冲刺/ : /三圈竞速/);
    const main = hud.button.node.position, other = hud.garageLabel.node.position;
    const mainWidth = hud.button.node.getComponent(Transform).contentSize.width;
    const otherWidth = hud.garageLabel.node.getComponent(Transform).contentSize.width;
    assert(other.y - 22 > main.y + 26, 'format and start touch targets have a gap');
    assert(main.x + mainWidth / 2 < 0 && other.x + otherWidth / 2 < 0, 'ready controls leave the centre of the road visible');
    assert.equal(hud.racingHUD.active, false, 'ready view has no overlapping race HUD or driving controls');
    assert.match(hud.top.string, mode === 'sprint' ? /\/ 1 圈/ : /\/ 3 圈/);
    race.networked = true; hud.update(race, idle, false);
    assert.equal(hud.garageButton.active, false, 'the solo format selector is not an option in a room');
  }
});

test('short results show their own score, live driving goals and an actual next attempt target', () => {
  const hud = new HUD(new SceneNode()), race = new RaceManager({}, 12, 4, 'sprint');
  race.phase = 'finished'; race.time = 30; race.driftBoosts = 2; race.collisions = 1;
  Object.assign(race.drivers[0].progress, { laps: 1, finishedAt: 30, lapTimes: [30] });
  hud.records = [{ time: 30, bestLap: 30, place: 1 }]; hud.previousBest = 32;
  hud.update(race, idle, false);
  assert.match(hud.title.string, /一圈冠军/);
  assert.match(hud.leaderboard.string, /一圈冲刺最快/);
  assert.doesNotMatch(hud.leaderboard.string, /路线印章/);
  assert.match(hud.footer.string, /刷新本机纪录/);
  assert.match(hud.footer.string, /少碰一次/);
  assert.match(hud.detail.string, /漂移加速 2 次/);
  assert.equal(hud.racingHUD.active, false, 'race status is hidden behind results');
});


test('settings replaces the menu and race view restores only essential state', () => {
  const hud = new HUD(new SceneNode()), race = new RaceManager();
  hud.settingsVisible = true;
  hud.update(race, idle, true);
  assert.equal(hud.settings.active, true);
  assert.equal(hud.panel.active, false);
  assert.match(hud.sound.string, /关/);
  hud.settingsVisible = false;
  race.phase = 'racing'; race.time = 3;
  hud.coach.enabled = false;
  hud.update(race, idle, false);
  assert.equal(hud.racingHUD.active, true);
  assert.equal(hud.panel.active, false);
  assert.equal(hud.coaching.node.parent.active, false);
  assert.equal(hud.pause.string, '', 'pause uses geometry, never a font glyph');
  assert.equal(hud.pauseIcon.node.active, true);
  assert.equal(hud.noticeBackground.node.active, false, 'no empty message bar');
});

test('settings keeps preference feedback separate from row labels and omits browser fullscreen on native hosts', () => {
  const hud = new HUD(new SceneNode()), race = new RaceManager();
  hud.settingsVisible = true;
  hud.coach.enabled = false;
  hud.update(race, idle, false);
  assert.equal(hud.sound.string, '开');
  assert.equal(hud.help.string, '驾驶教学');
  assert.equal(hud.helpState.string, '关');
  assert.doesNotMatch(hud.settingsHelp.string, /Shift|W\s*\/|自动加速/, 'driving help is opt-in');
  hud.coach.enabled = true;
  hud.update(race, idle, true);
  assert.equal(hud.sound.string, '关');
  assert.equal(hud.helpState.string, '开');
  assert.match(hud.settingsHelp.string, /Shift/);
  race.networked = true;
  hud.rulesVisible = false;
  hud.update(race, idle, false);
  assert.equal(hud.help.string, '竞赛规则');
  assert.equal(hud.helpState.string, '关', 'network rules and solo teaching have independent state');
  hud.rulesVisible = true;
  hud.update(race, idle, false);
  assert.equal(hud.helpState.string, '开');
  assert.match(hud.settingsHelp.string, /不会暂停/);

  const previousDisplay = (globalThis as any).KartDisplay;
  try {
    (globalThis as any).KartDisplay = { getFullscreen: () => true };
    hud.update(race, idle, false);
    assert.equal(hud.fullscreen.string, '退出');
    assert.equal(hud.fullscreen.node.parent.active, true);
    cc.sys.isBrowser = false;
    hud.update(race, idle, false);
    assert.equal(hud.fullscreen.node.parent.active, false, 'native hosts never show a browser-only action');
    assert.equal(hud.sound.node.parent.active, true);
    assert.equal(hud.help.node.parent.active, true);
  } finally {
    cc.sys.isBrowser = true;
    (globalThis as any).KartDisplay = previousDisplay;
  }
});

test('compact settings switches retain full-row touch targets and separate close action', () => {
  const actions = ['sound', 'fullscreen', 'help', 'close'] as const;
  for (const action of actions) {
    const rect = settingsLayout[action];
    assert.ok(rect.width >= 60 && rect.height >= 60, `${action} keeps a generous touch target`);
    assert.ok(contains(rect, rect.x, rect.y));
    assert.ok(contains(rect, rect.x + rect.width / 2 - 1, rect.y + rect.height / 2 - 1));
    for (const other of actions.filter(other => other !== action))
      assert.equal(contains(settingsLayout[other], rect.x, rect.y), false, `${action} does not trigger ${other}`);
  }
});
