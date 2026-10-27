import { realpath } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPlatform } from '../platforms/build.mjs';
import * as actions from '../assets/scripts/core/Actions.ts';
import * as data from '../assets/scripts/core/Data.ts';
import { Simulation } from '../assets/scripts/core/Simulation.ts';
import { MISSIONS } from '../assets/scripts/core/MissionCatalog.ts';

// Exercise the real HUD layout/drawing logic without building or launching Creator.
// These doubles record UI geometry; actual rendering still needs runtime QA.
class Transform {
  contentSize = { width: 0, height: 0 };
  setContentSize(width: number, height: number) { this.contentSize = { width, height }; }
}
class SceneNode {
  children: SceneNode[] = [];
  components = new Map();
  owner?: SceneNode;
  active = true;
  position = { x: 0, y: 0, z: 0 };
  get parent() { return this.owner; }
  set parent(value: SceneNode | undefined) {
    if (this.owner) this.owner.children.splice(this.owner.children.indexOf(this), 1);
    this.owner = value;
    value?.children.push(this);
  }
  get activeInHierarchy(): boolean { return this.active && (!this.parent || this.parent.activeInHierarchy); }
  addChild(child: SceneNode) { child.parent = this; }
  addComponent(type: any) {
    const component = new type();
    component.node = this;
    this.components.set(type, component);
    return component;
  }
  getComponent(type: any) { return this.components.get(type); }
  setPosition(x: number, y: number, z = 0) { this.position = { x, y, z }; }
  setSiblingIndex(index: number) {
    const parent = this.parent!;
    parent.children.splice(parent.children.indexOf(this), 1);
    parent.children.splice(index, 0, this);
  }
  destroy() { this.active = false; this.parent = undefined; }
}
class Color {
  hex = '';
  fromHEX(hex: string) { this.hex = hex; return this; }
}
class Graphics {
  calls: { op: string; args: number[]; color: string; fill: string; width: number }[] = [];
  strokeColor = new Color();
  fillColor = new Color();
  lineWidth = 1;
  clear() { this.calls = []; }
}
for (const op of ['rect', 'roundRect', 'circle', 'moveTo', 'lineTo', 'close', 'stroke', 'fill'])
  Graphics.prototype[op] = function (...args: number[]) {
    this.calls.push({ op, args, color: this.strokeColor.hex, fill: this.fillColor.hex, width: this.lineWidth });
  };
const frame = { width: 568, height: 320 };
let inset = 0;
const cc = {
  Node: SceneNode, UITransform: Transform, Graphics, Color,
  Camera: class { static ProjectionType = { ORTHO: 0 }; static ClearFlag = { DEPTH_ONLY: 0 }; },
  Canvas: class {}, Mask: class { static Type = { GRAPHICS_RECT: 0 }; },
  Sprite: class { static SizeMode = { CUSTOM: 0 }; }, SpriteFrame: class {}, Texture2D: class {},
  resources: { load(_name: string, _type: any, done: any) { done(new Error('unavailable art')); } },
  isValid: () => true,
  Label: class { static Overflow = { CLAMP: 0 }; static HorizontalAlign = { CENTER: 0, LEFT: 1 }; static VerticalAlign = { CENTER: 0 }; },
  Layers: { Enum: { UI_2D: 1 } }, ResolutionPolicy: { EXACT_FIT: 0 },
  sys: { isMobile: false, isBrowser: false, getSafeAreaRect: () => ({ x: inset, y: inset, width: frame.width - inset * 2, height: frame.height - inset * 2 }) },
  view: { getFrameSize: () => frame, setDesignResolutionSize() {}, getScaleX: () => 1, getScaleY: () => 1 },
};
// Exercise the same adapted inputs supplied to the real native Creator build.
const nativeConfiguration = await buildPlatform('wechat', { configOnly: true, env: {} });
const hudURL = pathToFileURL(await realpath(path.join(path.dirname(path.dirname(nativeConfiguration.configuration)), 'assets/scripts/HUD.ts')));
(globalThis as any).__nightHudTestCC = cc;
const hooks = registerHooks({
  resolve(id, context, next) {
    if (context.parentURL === hudURL.href) {
      if (id === 'cc' || id === './Effects') return { url: 'hud-test:' + id, shortCircuit: true };
      if (id.startsWith('./')) return next(new URL(id + '.ts', hudURL).href, context);
    }
    return next(id, context);
  },
  load(url, context, next) {
    if (url === 'hud-test:cc') return { format: 'module', shortCircuit: true,
      source: `export const { ${Object.keys(cc).join(',')} } = globalThis.__nightHudTestCC;` };
    if (url === 'hud-test:./Effects') return { format: 'module', shortCircuit: true,
      source: 'export const drawEffects = () => ({ impacts: [], projectiles: [] });' };
    return next(url, context);
  },
});
let HUD: any;
try { ({ HUD } = await import(hudURL.href)); }
finally { hooks.deregister(); delete (globalThis as any).__nightHudTestCC; }
const heights: number[] = [];
const world = { zoom: 1, thermal: false, project(p: data.Point, y = 0) {
  heights.push(y);
  return { x: frame.width / 2 + p.x, y: frame.height / 2 - p.z + y * 10, z: 0.5 };
} };
const overlaps = (a: any, b: any) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

test('HUD: identical names remain distinct, own ranking is highlighted, and closed rooms offer only leave', () => {
  Object.assign(frame, { width: 1280, height: 720 }); inset = 0;
  const hud = new HUD(new SceneNode()), sim = new Simulation();
  const own = { playerId: '11111111-1111-4111-8111-111111111111', nickname: '夜航者', rank: 2, secondary: 1200 };
  const other = { ...own, playerId: '22222222-2222-4222-8222-222222222222', rank: 1, secondary: 1000 };
  hud.online = { identity: own, panel: 'ranking', revision: 1, level: 0, rankPage: 0, ranking: { top: [other, own], me: own } };
  hud.update(sim, world);
  const labels = hud.modal.children.map((node: any) => node.getComponent(cc.Label)).filter(Boolean);
  const mine = labels.find((label: any) => label.string.startsWith('2. 夜航者'));
  const theirs = labels.find((label: any) => label.string.startsWith('1. 夜航者'));
  assert.match(mine.string, /11111111 · 你/); assert.match(theirs.string, /22222222/);
  assert.notEqual(mine.color.hex, theirs.color.hex);
  hud.online.panel = 'room'; hud.online.room = { mode: 'friend', status: 'abandoned', code: 'A12BCD456789', players: [own, other], you: 0 };
  hud.online.message = '房间已结束'; hud.online.revision++;
  hud.update(sim, world);
  const ids = hud.buttons.filter((button: any) => button.label.node.parent === hud.modal).map((button: any) => button.id);
  assert.deepEqual(ids, ['online:back']);
});

test('HUD: real urgent targets avoid convoy, supply and zoom controls on small screens', () => {
  for (const [width, height] of [[1366, 768], [844, 390], [568, 320]]) {
    Object.assign(frame, { width, height }); inset = 0;
    const hud = new HUD(new SceneNode()), sim = new Simulation(); sim.start();
    hud.touch = width < 1000; hud.rewardsAvailable = true;
    const enemy = sim.units.find(u => !u.friendly)!;
    enemy.x = sim.rescue.x + 5; enemy.z = sim.rescue.z; enemy.born = -30; enemy.attack = 3;
    hud.update(sim, world);
    const priority = hud.buttons.find((b: any) => b.id === 'priority');
    assert(priority.label.node.activeInHierarchy);
    for (const button of hud.buttons.filter((b: any) => b !== priority && b.label.node.activeInHierarchy))
      assert(!overlaps(priority, button), `${width}: priority overlaps ${button.id}`);
    sim.pause('settings', true); hud.zoomOpen = true; hud.update(sim, world); assert(!priority.label.node.activeInHierarchy);
    assert(!hud.labels.get('priorityMarker').node.active);
    hud.zoomOpen = false; hud.toolsOpen = true; hud.update(sim, world);
    assert(!priority.label.node.activeInHierarchy); assert(!hud.labels.get('priorityMarker').node.active);
    sim.pause('settings', false); hud.toolsOpen = false;
    sim.pause('advert', true); hud.advert = { kind: 'supply', mock: false }; hud.update(sim, world);
    hud.advert = undefined; sim.pause('advert', false); hud.update(sim, world);
    assert.equal(hud.modalKey, '', 'returning from an ad has no overlay hiding the battlefield');
    assert(hud.labels.get('priorityMarker').node.active, 'red priority marker returns on the first battle frame');
    assert(hud.marks.calls.some((call: any) => call.op === 'stroke' && call.color === '#ff525b'),
      'enemy markers are drawn again without advancing the simulation');
  }
});

test('HUD: desktop bottom battlefield accepts aim while controls and touch footer remain blocked', () => {
  for (const [width, height] of [[1366, 768], [1151, 798], [844, 390]]) {
    Object.assign(frame, { width, height });
    for (const safe of [0, 12]) {
      inset = safe;
      const hud = new HUD(new SceneNode()), sim = new Simulation();
      sim.start(); hud.update(sim, world);
      for (const y of [height - hud.footer + 2, height - safe - 2])
        assert.equal(hud.blocksBattlefield(40 + safe, y), !hud.desktop, 'empty desktop footer is battlefield');
      for (const id of ['weapon0', 'weapon1', 'weapon2']) {
        const b = hud.buttons.find((b: any) => b.id === id);
        assert(hud.blocksBattlefield(b.x + b.w / 2, b.y + b.h / 2), `${id} still blocks aim and battlefield fire`);
      }
    }
  }
  inset = 0;
});

test('HUD: escort and range entries are discoverable, and range results show a specific next goal in compact viewports', () => {
  for (const [width, height] of [[568, 320], [844, 390], [1366, 768]]) {
    Object.assign(frame, { width, height }); inset = 12;
    for (const lang of ['zh', 'en']) {
      const hud = new HUD(new SceneNode()); hud.lang = lang; hud.resize();
      const escort = new Simulation(); hud.update(escort, world);
      assert(hud.buttons.some((button: any) => button.id === 'missions'), 'home has a clear mission selector');
      assert(!hud.buttons.some((button: any) => button.id === 'training'), 'home keeps only primary choices');
      hud.missionsOpen = true; hud.update(escort, world);
      const trainingEntry = hud.buttons.find((button: any) => button.id === 'training');
      assert(trainingEntry); assert.equal(hud.hit(trainingEntry.x + trainingEntry.w / 2, trainingEntry.y + trainingEntry.h / 2)?.id, 'training');
      const sim = new Simulation('training-60'); hud.modalKey = 'rebuild'; hud.update(sim, world);
      hud.trainingBest = { time: 20, fired: 5, hitShots: 5 };
      for (const phase of ['briefing', 'success', 'failure'] as const) {
        sim.phase = phase; sim.failure = phase === 'failure' ? 'timeout' : '';
        hud.update(sim, world);
        const buttons = hud.buttons.filter((button: any) => button.label.node.parent === hud.modal);
        assert.deepEqual(buttons.map((button: any) => button.id), phase === 'briefing' ? ['missionsPrevious', 'missionsNext', 'mission:corridor-01', 'mission:ambush-02', 'mission:patrol-03', 'homeMenu', 'training', 'start'] : ['home', 'retry']);
        for (const button of buttons) {
          assert(button.w >= 44 && button.h >= 44);
          assert(button.y >= inset + 58 && button.y + button.h <= height - inset);
          assert(!buttons.some((other: any) => other !== button && overlaps(button, other)));
        }
        const labels = hud.modal.children.map((node: any) => node.getComponent(cc.Label)?.string).filter(Boolean).join('\n');
        assert.doesNotMatch(labels, /车队安全抵达|CONVOY EXTRACTED/);
        if (phase === 'briefing') assert.match(labels, lang === 'zh' ? /高地警戒/ : /HIGHLAND WATCH/);
        else {
          assert.match(labels, lang === 'zh' ? /再练一轮|重甲用重炮/ : /TRY AGAIN|Heavy for armor/);
          assert.match(labels, lang === 'zh' ? /最佳20.0s/ : /BEST 20.0s/);
        }
      }
      sim.phase = 'playing'; hud.update(sim, world);
      assert.match(hud.labels.get('progress').string, lang === 'zh' ? /热身清靶/ : /WARMUP/);
      assert(!hud.buttons.some((button: any) => button.id === 'convoy' && button.label.node.activeInHierarchy));
    }
  }
  inset = 0;
});

test('HUD: persistent global actions, compact modal layout, focus markers and zoom bindings', () => {
  for (const [width, height] of [[568, 320], [844, 390], [1366, 768], [320, 568]]) {
    Object.assign(frame, { width, height });
    for (const lang of ['zh', 'en']) for (const safe of [0, 12]) {
      inset = safe;
      const hud = new HUD(new SceneNode()), sim = new Simulation();
      hud.lang = lang;
      hud.rewardsAvailable = true;
      hud.resize();
      const globals = hud.buttons.filter((b: any) => hud.isGlobalAction(b.id));
      assert.equal(globals.length, 1);
      for (const reason of ['briefing', 'manual', 'settings', 'help', 'settings', 'mission', 'orientation', 'success', 'failure', 'playing']) {
        sim.pauses.clear();
        sim.phase = ['briefing', 'success', 'failure'].includes(reason) ? reason as Simulation['phase'] : 'playing';
        if (!['briefing', 'success', 'failure', 'playing'].includes(reason)) sim.pauses.add(reason as any);
        hud.update(sim, world);
        assert.equal(hud.root.children.at(-1), hud.globalControls, 'global graphics render above the modal');
        for (const b of globals) {
          assert.equal(hud.hit(b.x + b.w / 2, b.y + b.h / 2)?.id, b.id, `${width}x${height} ${reason}: ${b.id}`);
          assert(b.w >= 44 && b.h >= (hud.mouseDesktop ? 32 : 44) && b.x >= safe && b.x + b.w <= width - safe);
          assert(b.y >= safe && b.y + b.h <= height - safe);
          assert(!hud.buttons.some((other: any) => other !== b && other.label.node.activeInHierarchy && overlaps(b, other)), 'globals never overlap active controls');
        }
        const controls = hud.buttons.filter((b: any) => hud.modal && b.label.node.parent === hud.modal);
        for (const b of controls) {
          assert(b.y >= safe + 58 && b.y + b.h <= height - safe, `${reason}: panel control stays below the global row`);
          assert(!controls.some((other: any) => other !== b && overlaps(b, other)), `${reason}: panel controls do not overlap`);
        }
        if (reason === 'help') {
          const back = controls.find((b: any) => b.id === 'close');
          assert(back && back.label.string === (lang === 'zh' ? '返回' : 'BACK'));
          assert.equal(back.y, Math.max(...controls.map((b: any) => b.y)), 'return stays in the footer');
        }
        if (reason === 'manual' || reason === 'settings') assert.equal(controls.map((b: any) => b.id).join(','), 'flightControls,zoomControls,sound,language,help,convoy,mission,supply,home,' + (reason === 'settings' ? 'close' : 'resume'));
      }
      sim.pause('settings', true); hud.toolsOpen = true; hud.update(sim, world);
      assert.equal(hud.modalKey, 'settings:flight');
      for (const id of ['rotateLeft', 'rotateRight', 'orbitLeft', 'orbitRight', 'altitudeUp', 'radiusOut', 'locate'])
        assert(hud.buttons.some((b: any) => b.id === id && b.label.node.activeInHierarchy));
      hud.toolsOpen = false; sim.pause('settings', false); hud.update(sim, world);
      assert(!hud.buttons.some((b: any) => b.id === 'orbitLeft' && b.label.node.activeInHierarchy));
      sim.pause('manual', true);
      sim.pause('settings', true);
      sim.pause('help', true);
      hud.update(sim, world);
      assert(hud.modalKey.startsWith('help:'));
      sim.pause('help', false);
      hud.update(sim, world);
      assert.equal(hud.modalKey, 'settings');
      sim.pause('settings', false);
      hud.update(sim, world);
      assert.equal(hud.modalKey, 'pause');
      hud.resize();
      hud.update(sim, world);
      assert.equal(hud.buttons.filter((b: any) => hud.isGlobalAction(b.id)).length, 1, 'resize never duplicates global actions');
    }
  }

  Object.assign(frame, { width: 568, height: 320 });
  inset = 0;
  const hud = new HUD(new SceneNode()), sim = new Simulation();
  sim.start();
  sim.units = [sim.rescue, sim.units[1]];
  Object.assign(sim.rescue, { x: -90, z: 0 });
  const focus = sim.units[1];
  Object.assign(focus, { x: 0, z: 0, hp: focus.maxHp * 0.6 });
  const hostile = sim.addUnit('light', { x: 90, z: 0 }, false);
  sim.setAim(focus);
  const active = () => [...hud.unitLabels.values()].filter((l: any) => l.node.activeInHierarchy) as any[];
  for (const thermal of [false, true]) {
    world.thermal = thermal;
    for (const touch of [false, true]) {
      hud.touch = touch;
      hud.mousePointer = touch ? undefined : { x: 284, y: 160 };
      hud.update(sim, world);
      assert.equal(active().length, 1, 'only the hovered or touch-aimed unit has a label');
      assert.match(active()[0].string, /护卫 · 受损/);
      assert.doesNotMatch(active()[0].string, /%/);
      const calls = hud.marks.calls;
      assert(!calls.some((c: any) => c.op === 'rect' && c.args[3] === 2), 'no unit health bars');
      assert(calls.some((c: any) => c.op === 'rect' && c.color === '#5ed9f5' && c.width === 2), 'friendly squares keep their color in thermal');
      assert(calls.some((c: any) => c.op === 'lineTo' && c.args[0] === 95 && c.color === '#ff525b' && c.width === 2), '10px hostile diamonds keep their color in thermal');
      assert(calls.some((c: any) => c.op === 'lineTo' && c.args[0] === 32 && c.args[1] === 0 && c.width === 6 && c.color === '#061116'), 'reticle has a wide dark outline');
      assert(calls.some((c: any) => c.op === 'lineTo' && c.args[0] === 32 && c.args[1] === 0 && c.width === 3), 'reticle spans 64 pixels');
    }
  }
  assert(heights.includes(0.8) && !heights.includes(2.3), 'marker projection follows scaled vehicle height');
  focus.hp = focus.maxHp * 0.2;
  hud.update(sim, world);
  assert.match(active()[0].string, /重创/);
  Object.assign(hostile, { x: 0, z: 0, hp: hostile.maxHp * 0.2 });
  focus.x = -90;
  sim.setAim(hostile);
  hud.update(sim, world);
  const focused = active().filter((l) => !l.string.startsWith('×'));
  assert.equal(focused.length, 1);
  assert.match(focused[0].string, /轻车 · 重创/);
  assert.deepEqual(active().filter((l) => l.string.startsWith('×')).map((l) => l.string), ['×2']);
  hud.touch = false;
  hud.mousePointer = undefined;
  hud.update(sim, world);
  assert.deepEqual(active().map((l) => l.string), ['×2'], 'focus text disappears; only the coincident friendly group count remains');
  for (const [key, id] of [[187, 'zoomIn'], [107, 'zoomIn'], [189, 'zoomOut'], [109, 'zoomOut'], [49, 'weapon0'], [50, 'weapon1'], [51, 'weapon2']] as const)
    assert.equal(actions.ACTIONS.find((a) => (a.keys as readonly number[]).includes(key))?.id, id);
  assert(!actions.action('previous').binding.includes('Wheel') && !actions.action('next').binding.includes('Wheel'));
  assert.match(actions.bindingLabel('zoomIn', 'zh'), /滚轮/);
  for (const description of actions.action('weapon1').description) assert(description.includes(String(data.WEAPONS[1].ammo)));
  assert(actions.action('zoomOut').description.every((d) => d.includes('0.65×')));
  assert(actions.action('zoomIn').description.every((d) => d.includes('10×')));
});

test('HUD: short-screen information priority, focus clearance and friendly group expansion', () => {
  Object.assign(frame, { width: 568, height: 320 });
  inset = 0;
  const hud = new HUD(new SceneNode()), sim = new Simulation();
  sim.start();
  const rescue = sim.rescue, enemy = sim.addUnit('turret', { x: 0, z: 0 }, false);
  sim.units = [rescue, enemy];
  Object.assign(rescue, { x: -90, z: 0 });
  sim.waveAt = sim.time;
  sim.lastWave = 0;
  sim.setAim(enemy);
  hud.touch = true;
  // Distant models have almost no vertical screen separation between body and marker.
  const distant = { ...world, project: (p: data.Point) => world.project(p) };
  const slot = () => ['friendWarning', 'notice', 'tutorial'].filter((id) => {
    const l = hud.labels.get(id);
    return l.node.activeInHierarchy && l.string;
  });
  for (const thermal of [false, true]) {
    distant.thermal = thermal;
    hud.update(sim, distant);
    assert.deepEqual(slot(), ['notice'], 'wave replaces tutorial, with no central banner');
    const l = hud.unitLabels.get(enemy.id);
    assert(l?.node.activeInHierarchy, 'focused name survives an active wave notice');
    const size = l.node.getComponent(Transform).contentSize, p = l.node.position;
    assert.equal(size.width, 120);
    assert(l.fontSize >= 12 && l.fontSize <= 13);
    assert(Math.hypot(Math.max(0, Math.abs(p.x) - size.width / 2), Math.max(0, Math.abs(p.y) - size.height / 2)) >= 40, 'entire focused label clears the reticle by 40px');
    for (const id of ['notice', 'friendWarning']) {
      const label = hud.labels.get(id), tutorial = hud.labels.get('tutorial');
      assert.equal(label.node.position.y, tutorial.node.position.y);
      assert.equal(label.node.getComponent(Transform).contentSize.height, 28);
    }
    Object.assign(rescue, { x: 0 });
    enemy.x = 90;
    sim.setAim(rescue);
    hud.update(sim, distant);
    assert.deepEqual(slot(), ['friendWarning'], 'friendly warning takes priority over wave and tutorial');
    Object.assign(rescue, { x: -90 });
    enemy.x = 0;
    sim.setAim(enemy);
  }
  sim.time = 5;
  hud.update(sim, distant);
  assert.deepEqual(slot(), ['tutorial'], 'tutorial returns when warning and wave clear');

  const group = [0, 4, 8].map((x) => Object.assign(sim.addUnit('escort', { x, z: 0 }, true), { group: 1 }));
  const heavy = sim.addUnit('heavy', { x: 90, z: 0 }, false);
  Object.assign(enemy, { x: 4, group: 1 });
  sim.units = [rescue, ...group, enemy, heavy];
  sim.setAim({ x: 140, z: 0 });
  hud.touch = false;
  hud.mousePointer = undefined;
  const visibleLabels = () => [...hud.unitLabels.values()].filter((l: any) => l.node.activeInHierarchy) as any[];
  const counts = () => visibleLabels().filter((l) => l.string.startsWith('×'));
  const squares = () => hud.marks.calls.filter((c: any) => c.op === 'rect' && c.args[2] === c.args[3] && c.color === '#5ed9f5' && c.width === 2);
  for (const thermal of [false, true]) {
    distant.thermal = thermal;
    hud.update(sim, distant);
    assert.deepEqual(counts().map((l) => l.string), ['×3'], 'only same-group friendlies aggregate, never the nearby hostile');
    assert.equal(squares().length, 2, 'one rescue square and one grouped square');
    assert(squares().every((c: any) => c.args[2] === 10));
    assert(hud.marks.calls.some((c: any) => c.op === 'lineTo' && c.args[0] === 97 && c.color === '#ff525b' && c.width === 2), 'unfocused heavy marker is 14px');
    const lead = hud.unitLabels.get(group[0].id);
    assert.equal(lead.node.getComponent(Transform).contentSize.width, 28);
    hud.mousePointer = { x: 284, y: 160 };
    sim.setAim(group[0]);
    hud.update(sim, distant);
    assert.equal(counts().length, 0, 'focusing any member expands the whole group');
    assert.equal(squares().length, 4);
    assert.equal(squares().at(-1).args[2], 18, 'focus marker is 18px and drawn after other markers');
    assert.equal(hud.unitLabels.get(group[0].id), lead, 'group lead reuses its focus label');
    assert.equal(lead.node.getComponent(Transform).contentSize.width, 120, 'focus restores count label width');
    assert.equal(lead.node.getComponent(Transform).contentSize.height, 24, 'focus restores count label height');
    assert(lead.fontSize >= 12 && lead.fontSize <= 13);
    assert.match(lead.string, /护卫/);
    hud.mousePointer = { x: 288, y: 160 };
    sim.setAim(group[1]);
    hud.update(sim, distant);
    assert.equal(counts().length, 0, 'a non-lead member also expands the group');
    assert.equal(squares().length, 4);
    assert(!lead.node.activeInHierarchy, 'former lead focus text hides on the next frame');
    assert(hud.unitLabels.get(group[1].id).node.activeInHierarchy);
    hud.mousePointer = undefined;
    sim.setAim({ x: 140, z: 0 });
    hud.update(sim, distant);
    assert.equal(lead.string, '×3');
    assert.equal(lead.node.getComponent(Transform).contentSize.width, 28, 'count dimensions also restore after focus');
    assert(!hud.unitLabels.get(group[1].id).node.activeInHierarchy, 'member focus label hides when the group collapses again');
    group[2].hp = 0;
    hud.update(sim, distant);
    assert.equal(lead.string, '×2', 'dead allies do not count');
    group[2].hp = group[2].maxHp;
    for (const x of [12, 24]) {
      group[2].x = x;
      hud.update(sim, distant);
      assert.equal(counts().length, 0, 'all members must be mutually within 12px');
      assert.equal(squares().length, 4);
      assert(!lead.node.activeInHierarchy, 'old count is hidden on the next frame');
    }
    group[2].x = 8;
  }
});


test('HUD: desktop controls stay compact, touch keeps FIRE, reload has a single home', () => {
  for (const touch of [false, true]) for (const width of [1366, 1920, 2560]) {
    Object.assign(frame, { width, height: 1080 }); inset = 0;
    const hud = new HUD(new SceneNode()), sim = new Simulation();
    hud.touch = touch; hud.resize(); sim.start(); sim.selected = 2; sim.guns[2].cooldown = 2;
    hud.update(sim, world);
    const fire = hud.buttons.find((b: any) => b.id === 'fire');
    assert.equal(fire.label.node.activeInHierarchy, touch);
    assert.equal(hud.hit(fire.x + fire.w / 2, fire.y + fire.h / 2)?.id === 'fire', touch);
    for (const id of ['settings', 'weapon0', 'weapon1', 'weapon2']) {
      const b = hud.buttons.find((b: any) => b.id === id);
      assert(touch ? b.h >= 44 : b.h <= 44);
      if (!touch) assert(b.w <= 104);
    }
    const visibleText = [...hud.labels.values(), ...hud.buttons.map((b: any) => b.label)]
      .filter((l: any) => l.node.activeInHierarchy).map((l: any) => l.string).join('\n');
    assert.equal(visibleText.match(/装填/g)?.length, 1);
    if (!touch) assert.equal(hud.footer, 60);
  }
});

test('HUD: rewards, zoom panel and mock ads fit small phones with safe areas and no overlapping buttons', () => {
  for (const [width, height] of [[568, 320], [844, 390], [1366, 768]]) for (const safe of [0, 12]) {
    Object.assign(frame, { width, height }); inset = safe;
    const hud = new HUD(new SceneNode()), sim = new Simulation('training-60'); sim.start();
    hud.rewardsAvailable = true;
    for (const zoomOpen of [false, true]) {
      sim.pause('settings', zoomOpen); hud.zoomOpen = zoomOpen; hud.update(sim, world);
      const buttons = hud.buttons.filter((b: any) => b.label.node.activeInHierarchy);
      for (const b of buttons) {
        assert(b.x >= safe && b.x + b.w <= width - safe);
        assert(b.y >= safe && b.y + b.h <= height - safe);
        assert(!buttons.some((other: any) => other !== b && overlaps(b, other)), `${b.id}: no overlap`);
      }
      assert.equal(buttons.some((b: any) => b.id === 'zoomUpgrade'), zoomOpen);
    }
    for (const kind of ['supply', 'zoom'] as const) {
      hud.advert = { kind, mock: true }; sim.pause('advert', true); hud.update(sim, world);
      const buttons = hud.buttons.filter((b: any) => b.label.node.activeInHierarchy);
      assert.deepEqual(buttons.map((b: any) => b.id), ['adClose', 'adCancel']);
      assert.match(buttons[0].label.string, /完成模拟广告/);
      assert.match(buttons[1].label.string, /取消.*选择/);
      for (const b of buttons) {
        assert(b.h >= 44 && b.x >= safe && b.x + b.w <= width - safe);
        assert(b.y >= safe && b.y + b.h <= height - safe);
        assert(!buttons.some((other: any) => other !== b && overlaps(b, other)));
        assert.equal(hud.hit(b.x + b.w / 2, b.y + b.h / 2)?.id, b.id);
      }
    }
  }
  inset = 0;
});

test('HUD: combat supply, choices and buff countdown fit phones and the rotated logical viewport', () => {
  const previousWindow = (globalThis as any).window;
  (globalThis as any).window = { matchMedia: () => ({ matches: true }) };
  cc.sys.isBrowser = true;
  try {
    for (const [physicalWidth, physicalHeight] of [[568, 320], [844, 390], [390, 844], [1366, 768]])
      for (const safe of [0, 12]) for (const lang of ['zh', 'en']) {
        // The display adapter supplies landscape coordinates after rotating portrait phones.
        const width = Math.max(physicalWidth, physicalHeight), height = Math.min(physicalWidth, physicalHeight);
        Object.assign(frame, { width, height }); inset = safe;
        const hud = new HUD(new SceneNode()), sim = new Simulation();
        hud.lang = lang; hud.rewardsAvailable = true; hud.touch = width < 900; hud.resize(); sim.start();
        const visible = () => hud.buttons.filter((b: any) => b.label.node.activeInHierarchy);
        const control = (id: string) => visible().find((b: any) => b.id === id);
        const panelText = () => hud.modal.children.map((n: any) => n.getComponent(cc.Label)?.string).filter(Boolean).join('\n');
        const labelBox = (l: any) => {
          const size = l.node.getComponent(Transform).contentSize, p = l.node.position;
          return { x: p.x + width / 2 - size.width / 2, y: height / 2 - p.y - size.height / 2, w: size.width, h: size.height };
        };
        const checkLayout = () => {
          const buttons = visible();
          for (const b of buttons) {
            assert(b.x >= safe && b.x + b.w <= width - safe, `${physicalWidth}x${physicalHeight}: ${b.id} horizontal safe area`);
            assert(b.y >= safe && b.y + b.h <= height - safe, `${b.id}: vertical safe area`);
            assert(!buttons.some((other: any) => other !== b && overlaps(b, other)), `${b.id}: no overlapping controls`);
            assert.equal(hud.hit(b.x + b.w / 2, b.y + b.h / 2)?.id, b.id, `${b.id}: touch target is reachable`);
            if (b.id === 'supply' || b.id === 'supplyLater' || b.id === 'supplyWatch' || b.id.startsWith('reward:'))
              assert(b.w >= 44 && b.h >= 44);
          }
          const buff = hud.labels.get('buff');
          if (buff.node.activeInHierarchy) {
            const box = labelBox(buff);
            assert(box.w >= 60 && box.x >= safe && box.x + box.w <= width - safe);
            assert(box.y >= safe && box.y + box.h <= height - safe);
            assert(!buttons.some((b: any) => overlaps(box, b)), 'buff stays clear of controls');
            for (const id of ['health', 'status']) {
              const label = hud.labels.get(id);
              if (label.node.activeInHierarchy) assert(!overlaps(box, labelBox(label)), `buff clears ${id}`);
            }
          }
        };
        assert.equal(hud.supplyOpen, false); assert.equal(hud.pendingSupply, false);
        hud.update(sim, world); checkLayout();
        assert(!control('supply'), 'supply stays inside settings');
        sim.pause('manual', true); hud.update(sim, world); checkLayout();
        assert.equal(hud.modalKey, 'pause'); assert(control('supply'));
        hud.supplyOpen = true; sim.pause('supply', true); hud.update(sim, world); checkLayout();
        assert.equal(hud.modalKey, 'supply:offer');
        assert.deepEqual(visible().map((b: any) => b.id), ['reward:tracking', 'reward:ammo', 'reward:rate', 'reward:restock', 'supplyLater', 'supplyWatch']);
        hud.pendingSupply = true; hud.update(sim, world); checkLayout();
        assert.equal(hud.modalKey, 'supply:choice');
        assert.deepEqual(visible().map((b: any) => b.id), ['reward:tracking', 'reward:ammo', 'reward:rate', 'reward:restock', 'supplyLater', 'supplyWatch']);
        assert.match(panelText(), lang === 'zh' ? /点选敌人，再按开火/ : /Tap an enemy, then FIRE/);
        assert.match(panelText(), /60/); assert.match(panelText(), /\+2/); assert.match(panelText(), /30%/);
        assert.doesNotMatch(panelText(), /恢复耐久|治疗|HEAL/i);
        const choiceLabels = hud.modal.children.map((n: any) => n.getComponent(cc.Label)).filter(Boolean);
        for (const l of choiceLabels) {
          const box = labelBox(l);
          assert(!choiceLabels.some((other: any) => other !== l && overlaps(box, labelBox(other))), 'choice card text does not overlap');
        }
        hud.supplyOpen = false; sim.pause('supply', false); hud.update(sim, world); checkLayout();
        assert.equal(hud.modalKey, 'pause');
        assert.match(control('supply').label.string, lang === 'zh' ? /待领取/ : /CLAIM/);
        hud.pendingSupply = false; sim.pauses.clear();
        sim.buff = { kind: 'tracking', remaining: 60 }; sim.resumeCountdown = 3; sim.pause('countdown', true);
        for (const remaining of [3, 2.2, 2, 1]) {
          sim.resumeCountdown = remaining; hud.update(sim, world); checkLayout();
          assert.equal(hud.modalKey, `countdown:${Math.ceil(remaining)}`);
          assert.equal(visible().length, 0, 'countdown hides controls that cannot act');
          assert(!hud.labels.get('buff').node.activeInHierarchy, 'countdown has no extra overlay');
          assert.match(panelText(), new RegExp(String(Math.ceil(remaining))));
        }
        sim.pause('countdown', false); hud.update(sim, world); checkLayout();
        assert.equal(hud.modalKey, '');
        assert(!control('supply'));
        sim.pause('settings', true); hud.update(sim, world); checkLayout();
        assert.equal(control('supply').label.color.hex, '#a2b5b5');
        sim.pause('settings', false); hud.update(sim, world);
        assert(!hud.labels.get('buff').node.activeInHierarchy, 'tracking countdown moved into its button');
        assert.equal(control('homing').label.color.hex, control('weapon' + sim.selected).label.color.hex);
        assert(control('homing').label.isBold);
        assert.equal(control('homing').label.string, lang === 'zh' ? '追踪\n60秒' : 'HOMING\n60s');
        hud.rewardsAvailable = false; hud.update(sim, world);
        assert(control('homing'), 'active tracking remains visible without ad availability or homing ammo');
        hud.rewardsAvailable = true;
        sim.buff.remaining = 4.2; hud.update(sim, world); checkLayout();
        assert.equal(control('homing').label.color.hex, '#ffbf55');
        assert.equal(control('homing').label.string, lang === 'zh' ? '追踪\n5秒' : 'HOMING\n5s');
        sim.pause('settings', true); hud.zoomOpen = true; hud.update(sim, world); checkLayout();
        assert.equal(control('zoomUpgrade').label.color.hex, '#a2b5b5');
        assert.match(control('zoomUpgrade').label.string, lang === 'zh' ? /支援生效中/ : /SUPPORT ACTIVE/);
        hud.zoomOpen = false; sim.pause('settings', false); hud.supplyOpen = true; sim.pause('supply', true); hud.update(sim, world); checkLayout();
        assert.equal(hud.modalKey, 'supply:offer', 'buff still allows opening the offer');
        assert.equal(control('supplyWatch').label.color.hex, '#a2b5b5');
        assert.match(panelText(), lang === 'zh' ? /支援已生效，结束后可再次领取/ : /SUPPORT ACTIVE.*WAIT UNTIL IT ENDS/);
        assert(control('supplyLater'), 'blocked offer can return to pause');
        hud.supplyOpen = false; sim.pause('supply', false);
        sim.buff = { kind: 'rate', remaining: 60 }; hud.update(sim, world); checkLayout();
        assert.match(hud.labels.get('buff').string, lang === 'zh' ? /射速提升/ : /RATE ×1\.3/);
        assert(!control('homing').label.isBold, 'expiry clears the tracking highlight');
        assert.equal(control('homing').label.string, lang === 'zh' ? '追踪\n+' : 'HOMING\n+');
        sim.homingAmmo = 2; sim.selectHoming(); hud.update(sim, world);
        assert(control('homing').label.isBold, 'homing weapon selection still highlights independently');
        assert.equal(control('homing').label.string, lang === 'zh' ? '追踪\n2' : 'HOMING\n2');
        sim.buff = undefined; hud.update(sim, world); checkLayout();
        assert(!hud.labels.get('buff').node.activeInHierarchy);
        sim.pause('settings', true); hud.update(sim, world); checkLayout();
        assert.equal(control('supply').label.color.hex, '#eef3ea');
      }
  } finally {
    cc.sys.isBrowser = false; inset = 0;
    if (previousWindow === undefined) delete (globalThis as any).window;
    else (globalThis as any).window = previousWindow;
  }
});


test('HUD: browser and native hosts have no fullscreen control or state in any screen', () => {
  const previousWindow = (globalThis as any).window;
  (globalThis as any).window = { matchMedia: () => ({ matches: false }) };
  try {
    for (const browser of [false, true]) {
      cc.sys.isBrowser = browser;
      Object.assign(frame, { width: 844, height: 390 }); inset = 12;
      const hud = new HUD(new SceneNode()), sim = new Simulation();
      for (const reason of ['home', 'missions', 'playing', 'manual', 'settings', 'help', 'offer', 'choice', 'success', 'failure']) {
        sim.pauses.clear(); hud.supplyOpen = false;
        sim.phase = reason === 'success' || reason === 'failure' ? reason : ['home', 'missions'].includes(reason) ? 'briefing' : 'playing';
        hud.missionsOpen = reason === 'missions';
        if (['manual', 'settings', 'help'].includes(reason)) sim.pauses.add(reason as any);
        if (reason === 'offer' || reason === 'choice') { hud.supplyOpen = true; hud.pendingSupply = reason === 'choice'; }
        hud.update(sim, world);
        assert.equal(hud.buttons.some((button: any) => /fullscreen/i.test(button.id)), false, reason);
        assert.equal('fullscreen' in hud, false, 'removed state must not return');
        assert.equal(hud.isGlobalAction('fullscreen'), false);
        assert.equal(hud.buttons.filter((button: any) => button.id === 'settings' && button.label.node.activeInHierarchy).length, hud.supplyOpen ? 0 : 1);
      }
    }
  } finally {
    cc.sys.isBrowser = false; inset = 0;
    if (previousWindow === undefined) delete (globalThis as any).window;
    else (globalThis as any).window = previousWindow;
  }
});

test('HUD: every operation page keeps three reachable cards and pagination within phone safe areas', () => {
  for (const [width, height] of [[568, 320], [844, 390]]) for (const safe of [0, 12]) {
    Object.assign(frame, { width, height }); inset = safe;
    const hud = new HUD(new SceneNode()), sim = new Simulation();
    hud.missionsOpen = true;
    const seen = new Set();
    for (let page = 0; page < 40; page++) {
      hud.missionPage = page; hud.modalKey = 'rebuild'; hud.update(sim, world);
      const buttons = hud.buttons.filter((button: any) => button.label.node.parent === hud.modal);
      const cards = buttons.filter((button: any) => button.id.startsWith('mission:'));
      assert.equal(cards.length, 3);
      cards.forEach((card: any) => seen.add(card.id));
      for (const button of buttons) {
        assert(button.w >= 44 && button.h >= 44, `${button.id}: thumb-sized target`);
        assert(button.x >= safe && button.x + button.w <= width - safe);
        assert(button.y >= safe + 58 && button.y + button.h <= height - safe);
        assert.equal(hud.hit(button.x + button.w / 2, button.y + button.h / 2)?.id, button.id);
        assert(!buttons.some((other: any) => other !== button && overlaps(button, other)));
      }
      const captions = hud.modal.children.map((node: any) => node.getComponent(cc.Label)?.string).filter(Boolean).join('\n');
      assert.match(captions, new RegExp(`${page * 3 + 1}–${page * 3 + 3} / 120`));
      if (page > 0) assert.match(captions, /完成上一关解锁/);
    }
    assert.equal(seen.size, 120);
    hud.missionProgress = { version: 1, cleared: ['patrol-03'] };
    hud.missionPage = 1; hud.modalKey = 'rebuild'; hud.update(sim, world);
    const captions = hud.modal.children.map((node: any) => node.getComponent(cc.Label)?.string).filter(Boolean).join('\n');
    assert.match(captions, /可出动/);
    sim.phase = 'success'; hud.update(sim, world);
    assert.deepEqual(hud.buttons.filter((button: any) => button.label.node.parent === hud.modal).map((button: any) => button.id), ['home', 'retry', 'missionNext']);
  }
  inset = 0;
});

const panelLabels = (hud: any) => hud.modal.children.map((node: any) => node.getComponent(cc.Label)).filter(Boolean);
const labelBounds = (hud: any, label: any) => {
  const size = label.node.getComponent(Transform).contentSize, p = label.node.position;
  return { x: p.x + hud.w / 2 - size.width / 2, y: hud.h / 2 - p.y - size.height / 2, w: size.width, h: size.height };
};
const assertPanelTargets = (hud: any) => {
  const buttons = hud.buttons.filter((b: any) => b.label.node.activeInHierarchy);
  for (const button of buttons) {
    assert(button.w >= 44 && button.h >= 44, `${button.id}: at least 44px`);
    assert(button.x >= inset && button.x + button.w <= hud.w - inset);
    assert(button.y >= inset && button.y + button.h <= hud.h - inset);
    assert(!buttons.some((other: any) => other !== button && overlaps(button, other)), `${button.id}: no overlap`);
    assert.equal(hud.hit(button.x + button.w / 2, button.y + button.h / 2)?.id, button.id);
  }
  const labels = panelLabels(hud).filter((label: any) => label.string);
  for (const label of labels) {
    const box = labelBounds(hud, label);
    assert(!labels.some((other: any) => other !== label && overlaps(box, labelBounds(hud, other))), `${label.string}: text stays separate`);
  }
};

test('HUD: independent title cover precedes mission previews and compact settings', () => {
  for (const [width, height] of [[568, 320], [844, 320], [844, 390], [1366, 768]])
    for (const safe of [0, 12]) for (const lang of ['zh', 'en']) {
      Object.assign(frame, { width, height }); inset = safe;
      const hud = new HUD(new SceneNode()), sim = new Simulation();
      hud.lang = lang; hud.rewardsAvailable = true; hud.resize(); hud.update(sim, world);
      assertPanelTargets(hud);
      for (const id of ['help', 'missions']) assert(hud.buttons.some((b: any) => b.id === id && b.label.node.parent === hud.modal));
      assert(!hud.buttons.some((b: any) => b.id === 'start'));
      assert(hud.homeBackground.active, 'cover stays opaque even when artwork fails');
      assert(!panelLabels(hud).some((l: any) => l.string.includes(data.text(sim.mission.name, lang))));
      hud.missionsOpen = true; hud.update(sim, world);
      assert(!hud.homeBackground.active); assert(hud.buttons.some((b: any) => b.id === 'start'));
      hud.missionsOpen = false;
      sim.start(); sim.time = 38; sim.pause('manual', true); hud.update(sim, world);
      assertPanelTargets(hud);
      const captions = panelLabels(hud).map((l: any) => l.string);
      assert(captions.includes(lang === 'zh' ? '战斗设置' : 'BATTLE SETTINGS'));
      const graphics = hud.modal.getComponent(Graphics).calls;
      const panel = graphics.find((c: any) => c.op === 'roundRect' && c.fill === '#091b2df5');
      assert(panel && panel.args[2] <= 640 && panel.args[3] <= 304);
      const resume = hud.buttons.find((b: any) => b.id === 'resume');
      assert(graphics.some((c: any) => c.op === 'roundRect' && c.fill === '#ffbf55' && c.args[0] === resume.x - width / 2), 'resume is the amber primary action');
      for (const pending of [false, true]) {
        hud.supplyOpen = true; hud.pendingSupply = pending; hud.update(sim, world);
        assertPanelTargets(hud);
        const copy = panelLabels(hud).map((l: any) => l.string).join('\n');
        assert.match(copy, /60/); assert.match(copy, /\+2/); assert.match(copy, /30%/);
        if (height >= 390) assert(hud.modal.getComponent(Graphics).calls.some((c: any) => c.op === 'circle' && c.args[2] === 9), 'tracking offer has a drawn icon');
        assert.match(copy, pending ? lang === 'zh' ? /启用并返回战斗/ : /ACTIVATE & RESUME/ : lang === 'zh' ? /看广告并启用/ : /WATCH AD & ACTIVATE/);
      }
      hud.supplyOpen = false; hud.pendingSupply = false; hud.rewardsAvailable = false; hud.modalKey = 'rebuild'; hud.update(sim, world);
      assertPanelTargets(hud);
      assert.deepEqual(hud.buttons.filter((b: any) => b.label.node.parent === hud.modal).map((b: any) => b.id), ['flightControls', 'zoomControls', 'sound', 'language', 'help', 'convoy', 'mission', 'home', 'resume'], 'offline settings omit only ads');
    }
  inset = 0;
});

test('HUD: mission cards expose their actual enemy count, lighting, selection, lock and cleared state', () => {
  for (const lang of ['zh', 'en']) {
    Object.assign(frame, { width: 568, height: 320 }); inset = 12;
    const hud = new HUD(new SceneNode()), sim = new Simulation();
    hud.lang = lang; hud.missionsOpen = true; hud.resize();
    const text = () => panelLabels(hud).map((l: any) => l.string).join('\n');
    hud.update(sim, world); assertPanelTargets(hud);
    assert.match(text(), /001/); assert.match(text(), /002/); assert.match(text(), /003/);
    assert.match(text(), lang === 'zh' ? /当前/ : /SELECTED/);
    assert.match(text(), lang === 'zh' ? /白天.*入门/ : /DAY.*INTRO/);
    for (const mission of MISSIONS.slice(0, 3)) assert.match(text(), new RegExp(lang === 'zh' ? `敌方 ${mission.events.length}` : `${mission.events.length} HOSTILES`));
    hud.missionPage = 1; hud.modalKey = 'rebuild'; hud.update(sim, world); assertPanelTargets(hud);
    assert.match(text(), lang === 'zh' ? /黄昏/ : /DUSK/); assert.match(text(), lang === 'zh' ? /夜间/ : /NIGHT/);
    assert.match(text(), lang === 'zh' ? /锁定/ : /LOCKED/);
    hud.missionProgress = { version: 1, cleared: ['patrol-03', MISSIONS[3].id] };
    hud.modalKey = 'rebuild'; hud.update(sim, world);
    assert.match(text(), lang === 'zh' ? /已完成/ : /CLEARED/);
    assert.match(text(), lang === 'zh' ? /可出动/ : /AVAILABLE/);
    hud.developer = true; hud.modalKey = 'rebuild'; hud.update(sim, world);
    assert.match(text(), lang === 'zh' ? /试玩.*不计进度/ : /PRACTICE/);
  }
  inset = 0;
});

test('HUD: compact guide keeps its tabs and footer reachable while content scrolls', () => {
  Object.assign(frame, { width: 568, height: 320 }); inset = 12;
  for (const lang of ['zh', 'en']) {
    const hud = new HUD(new SceneNode()), sim = new Simulation();
    hud.lang = lang; hud.resize(); sim.pause('help', true); hud.update(sim, world);
    assertPanelTargets(hud);
    assert(hud.scrollMax > 0 && hud.scrollArea.h >= 56);
    const close = hud.buttons.find((b: any) => b.id === 'close');
    hud.scrollBy(Infinity);
    assert.equal(hud.scroll, hud.scrollMax); assert.equal(hud.scrollNode.position.y, hud.scrollMax);
    assert.equal(hud.hit(close.x + close.w / 2, close.y + close.h / 2)?.id, 'close');
    hud.scrollBy(-Infinity); assert.equal(hud.scroll, 0);
    sim.pause('help', false); sim.pause('settings', true); hud.update(sim, world);
    const controls = hud.buttons.filter((b: any) => b.label.node.parent === hud.modal);
    for (const b of controls) assert(b.h >= 44 && b.y + b.h <= frame.height - inset);
  }
  inset = 0;
});

test('HUD: flight values, direction selection and display controls stay separate in a live-view drawer', () => {
  for (const [width, height] of [[568, 320], [844, 390], [1366, 768]]) for (const safe of [0, 12]) for (const lang of ['zh', 'en']) {
    Object.assign(frame, { width, height }); inset = safe;
    const hud = new HUD(new SceneNode()), sim = new Simulation(); sim.start(); sim.pause('settings', true);
    hud.lang = lang; hud.toolsOpen = true; hud.rewardsAvailable = true; hud.update(sim, world);
    assertPanelTargets(hud);
    const left = hud.buttons.find((b: any) => b.id === 'altitudeDown').x;
    assert(left > width * .3, 'keep part of the actual battlefield visible');
    assert(panelLabels(hud).some((l: any) => l.string === '1000'));
    assert.equal(hud.buttons.find((b: any) => b.id === 'orbitRight').label.color.hex, '#5ed9f5');
    sim.adjustAltitude(20); sim.setOrbitDirection(-1); hud.modalKey = 'rebuild'; hud.update(sim, world);
    assert(panelLabels(hud).some((l: any) => l.string === '1200'));
    assert.equal(hud.buttons.find((b: any) => b.id === 'orbitLeft').label.color.hex, '#5ed9f5');
    hud.toolsOpen = false; hud.zoomOpen = true; hud.update(sim, world); assertPanelTargets(hud);
    for (const id of ['sensor', 'effects', 'lensIn', 'lensOut', 'zoomUpgrade'])
      assert(hud.buttons.some((b: any) => b.id === id && b.label.node.parent === hud.modal));
  }
  inset = 0;
});


test('mission previews draw distinct terrain and lighting, with actual contacts and endpoints', () => {
  Object.assign(frame, { width: 844, height: 390 }); inset = 0;
  const hud = new HUD(new SceneNode()), pictures = [];
  for (const [map, light] of [['valley', 'day'], ['highland', 'day'], ['valley', 'dusk'], ['valley', 'night']]) {
    const g = new Graphics(); hud.routeGraphic(g, 0, 0, 240, 120, 0, map, light, MISSIONS[0].events);
    assert(g.calls.filter(c => c.op === 'fill').length > 1000, 'height-field terrain replaces the empty rectangle');
    assert(g.calls.some(c => c.op === 'stroke' && c.color === '#5ed9f5'));
    assert.equal(g.calls.filter(c => c.op === 'stroke' && c.color === '#ff525b').length, MISSIONS[0].events.length);
    assert(g.calls.every(c => c.args.every(Number.isFinite)));
    pictures.push(JSON.stringify(g.calls));
  }
  assert.equal(new Set(pictures).size, 4);
});


test('an earned support remains activatable with no ad provider', () => {
  Object.assign(frame, { width: 568, height: 320 }); inset = 12;
  const hud = new HUD(new SceneNode()), sim = new Simulation(); sim.start();
  hud.rewardsAvailable = false; hud.pendingSupply = true; hud.supplyOpen = true;
  hud.update(sim, world); assertPanelTargets(hud);
  const claim = hud.buttons.find((b: any) => b.id === 'supplyWatch');
  assert(claim.label.node.activeInHierarchy); assert.match(claim.label.string, /启用并返回战斗/);
  assert.equal(hud.hit(claim.x + claim.w / 2, claim.y + claim.h / 2)?.id, 'supplyWatch');
  inset = 0;
});


test('HUD: minimal battle has no top backdrop and priority marker itself is a reachable control', () => {
  Object.assign(frame, { width: 844, height: 390 }); inset = 12;
  const hud = new HUD(new SceneNode()), sim = new Simulation(); sim.start(); hud.touch = true; hud.resize();
  const enemy = sim.units.find(u => !u.friendly)!;
  Object.assign(enemy, { x: sim.rescue.x + 5, z: sim.rescue.z, born: -30, attack: 3 });
  hud.update(sim, world);
  const buttons = hud.buttons.filter((b: any) => b.label.node.activeInHierarchy);
  assert.deepEqual(buttons.map((b: any) => b.id).sort(), ['settings', 'battleReport', 'weapon0', 'weapon1', 'weapon2', 'weapon3', 'fire', 'priority'].sort());
  assert(!hud.g.calls.some((c: any) => ['rect', 'roundRect'].includes(c.op) && c.args[2] === frame.width), 'no full-width HUD backing');
  const priority = buttons.find((b: any) => b.id === 'priority');
  assert.equal(hud.hit(priority.x + 48, priority.y + 24)?.id, 'priority');
  assert.equal(hud.hit(priority.x + 48, priority.y + 57)?.id, 'priority', 'caption is clickable too');
  assert(priority.w >= 44 && priority.h >= 44); inset = 0;
});

test('HUD: sound states draw different icons and ad feedback never paints over action buttons', () => {
  Object.assign(frame, { width: 568, height: 320 }); inset = 12;
  const hud = new HUD(new SceneNode()), sim = new Simulation(); sim.start(); sim.pause('settings', true);
  hud.update(sim, world); const on = hud.modal.getComponent(Graphics).calls;
  hud.muted = true; hud.modalKey = 'rebuild'; hud.update(sim, world);
  const off = hud.modal.getComponent(Graphics).calls;
  assert.notDeepEqual(on, off); assert(panelLabels(hud).some((l: any) => l.string === '声音 关'));
  sim.pause('settings', false); hud.supplyOpen = true; hud.rewardsAvailable = true; sim.pause('supply', true);
  hud.supplyMessage = '观看已中断，未获得奖励'; hud.toast = hud.supplyMessage; hud.toastUntil = Date.now() + 4000;
  hud.update(sim, world); assert(!hud.labels.get('globalToast').node.activeInHierarchy);
  assert(panelLabels(hud).some((l: any) => l.string === hud.supplyMessage)); assertPanelTargets(hud);
  hud.supplyOpen = false; sim.pause('supply', false); sim.pause('manual', true); hud.update(sim, world);
  assert(hud.labels.get('globalToast').node.activeInHierarchy, 'zoom ad errors remain visible above the panel');
  const toastY = hud.h / 2 - hud.labels.get('globalToast').node.position.y;
  assert(hud.buttons.filter((b: any) => b.label.node.parent === hud.modal).every((b: any) => b.y > toastY + 18));
  const toast = hud.labels.get('globalToast'), gear = hud.buttons.find((b: any) => b.id === 'settings');
  assert(toast.node.position.x + hud.w / 2 + toast.node.getComponent(Transform).contentSize.width / 2 < gear.x);
  sim.pause('settings', true); hud.toolsOpen = true; sim.pause('mission', true); hud.update(sim, world);
  assert.equal(hud.modalKey, 'mission'); sim.pause('mission', false); hud.update(sim, world);
  assert.equal(hud.modalKey, 'settings:flight');
  hud.supplyOpen = false; sim.pause('supply', false); sim.pause('settings', true); hud.exitConfirm = true; hud.update(sim, world);
  assert.equal(hud.modalKey, 'exit'); assertPanelTargets(hud);
  assert.deepEqual(hud.buttons.filter((b: any) => b.label.node.activeInHierarchy).map((b: any) => b.id), ['exitCancel', 'exitConfirm']);
  assert(panelLabels(hud).some((l: any) => l.string === '将会中断本次游戏并退出。')); inset = 0;
});
