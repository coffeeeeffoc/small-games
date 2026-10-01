import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import * as actions from '../assets/scripts/core/Actions.ts';
import * as data from '../assets/scripts/core/Data.ts';
import { Simulation } from '../assets/scripts/core/Simulation.ts';

// Exercise the real HUD layout/drawing logic without building or launching Creator.
// These doubles record UI geometry; actual rendering and platform fullscreen need runtime QA.
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
  calls: { op: string; args: number[]; color: string; width: number }[] = [];
  strokeColor = new Color();
  lineWidth = 1;
  clear() { this.calls = []; }
}
for (const op of ['rect', 'roundRect', 'circle', 'moveTo', 'lineTo', 'close', 'stroke', 'fill'])
  Graphics.prototype[op] = function (...args: number[]) {
    this.calls.push({ op, args, color: this.strokeColor.hex, width: this.lineWidth });
  };
const frame = { width: 568, height: 320 };
let inset = 0;
const cc = {
  Node: SceneNode, UITransform: Transform, Graphics, Color,
  Camera: class { static ProjectionType = { ORTHO: 0 }; static ClearFlag = { DEPTH_ONLY: 0 }; },
  Canvas: class {}, Mask: class { static Type = { GRAPHICS_RECT: 0 }; },
  Label: class { static Overflow = { CLAMP: 0 }; static HorizontalAlign = { CENTER: 0, LEFT: 1 }; static VerticalAlign = { CENTER: 0 }; },
  Layers: { Enum: { UI_2D: 1 } }, ResolutionPolicy: { EXACT_FIT: 0 },
  sys: { isMobile: false, isBrowser: false, getSafeAreaRect: () => ({ x: inset, y: inset, width: frame.width - inset * 2, height: frame.height - inset * 2 }) },
  view: { getFrameSize: () => frame, setDesignResolutionSize() {}, getScaleX: () => 1, getScaleY: () => 1 },
};
const hudURL = new URL('../assets/scripts/HUD.ts', import.meta.url);
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
const world = { thermal: false, project(p: data.Point, y = 0) {
  heights.push(y);
  return { x: frame.width / 2 + p.x, y: frame.height / 2 - p.z + y * 10, z: 0.5 };
} };
const overlaps = (a: any, b: any) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

test('HUD: persistent global actions, compact modal layout, focus markers and zoom bindings', () => {
  for (const [width, height] of [[568, 320], [844, 390], [1366, 768], [320, 568]]) {
    Object.assign(frame, { width, height });
    for (const lang of ['zh', 'en']) for (const safe of [0, 12]) {
      inset = safe;
      const hud = new HUD(new SceneNode()), sim = new Simulation();
      hud.lang = lang;
      hud.resize();
      const globals = hud.buttons.filter((b: any) => hud.isGlobalAction(b.id));
      assert.equal(globals.length, 2);
      for (const reason of ['briefing', 'manual', 'settings', 'help', 'settings', 'mission', 'orientation', 'success', 'failure', 'playing']) {
        sim.pauses.clear();
        sim.phase = ['briefing', 'success', 'failure'].includes(reason) ? reason as Simulation['phase'] : 'playing';
        if (!['briefing', 'success', 'failure', 'playing'].includes(reason)) sim.pauses.add(reason as any);
        hud.fullscreen = reason === 'help';
        hud.update(sim, world);
        assert.equal(hud.root.children.at(-1), hud.globalControls, 'global graphics render above the modal');
        for (const b of globals) {
          assert.equal(hud.hit(b.x + b.w / 2, b.y + b.h / 2)?.id, b.id, `${width}x${height} ${reason}: ${b.id}`);
          assert(b.w >= 44 && b.h >= 44 && b.x >= safe && b.x + b.w <= width - safe);
          assert(b.y >= safe && b.y + b.h <= height - safe);
          assert(!hud.buttons.some((other: any) => other !== b && other.label.node.activeInHierarchy && overlaps(b, other)), 'globals never overlap active controls');
        }
        const controls = hud.buttons.filter((b: any) => hud.modal && b.label.node.parent === hud.modal);
        for (const b of controls) {
          assert(b.y >= safe + 58 && b.y + b.h <= height - safe, `${reason}: panel control stays below the global row`);
          assert(!controls.some((other: any) => other !== b && overlaps(b, other)), `${reason}: panel controls do not overlap`);
        }
        if (reason === 'manual') assert.equal(controls.map((b: any) => b.id).join(','), 'resume');
        if (reason === 'settings') assert.equal(controls.map((b: any) => b.id).join(','), 'close,sound,effects,help,language');
        if (reason === 'help') assert.equal(globals.find((b: any) => b.id === 'fullscreen').label.string, lang === 'zh' ? '退出全屏' : 'EXIT FULL');
      }
      hud.toolsOpen = true;
      hud.update(sim, world);
      const metrics = hud.labels.get('orbit');
      assert(metrics.node.activeInHierarchy);
      assert.equal(metrics.string, `324 km/h\n${lang === 'zh' ? '半径' : 'RADIUS'} 2.0 km`);
      const size = metrics.node.getComponent(Transform).contentSize, pos = metrics.node.position;
      const box = { x: pos.x + width / 2 - size.width / 2, y: height / 2 - pos.y - size.height / 2, w: size.width, h: size.height };
      assert(box.y >= hud.panelLayout.y && box.y + box.h <= hud.panelLayout.y + hud.panelLayout.h);
      assert(!hud.buttons.some((b: any) => b.label.node.activeInHierarchy && overlaps(box, b)), 'flight metrics use spare cells without covering controls');
      hud.toolsOpen = false;
      hud.update(sim, world);
      assert(!metrics.node.activeInHierarchy, 'flight metrics stay inside the collapsed panel');
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
      assert.equal(hud.buttons.filter((b: any) => hud.isGlobalAction(b.id)).length, 2, 'resize never duplicates global actions');
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
      assert(calls.some((c: any) => c.op === 'rect' && c.color === '#91e6cb' && c.width === 2), 'friendly squares keep their color in thermal');
      assert(calls.some((c: any) => c.op === 'lineTo' && c.args[0] === 95 && c.color === '#f2bc77' && c.width === 2), '10px hostile diamonds keep their color in thermal');
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
  assert(actions.action('zoomIn').description.every((d) => d.includes('5×')));
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
  const squares = () => hud.marks.calls.filter((c: any) => c.op === 'rect' && c.args[2] === c.args[3] && c.color === '#91e6cb' && c.width === 2);
  for (const thermal of [false, true]) {
    distant.thermal = thermal;
    hud.update(sim, distant);
    assert.deepEqual(counts().map((l) => l.string), ['×3'], 'only same-group friendlies aggregate, never the nearby hostile');
    assert.equal(squares().length, 2, 'one rescue square and one grouped square');
    assert(squares().every((c: any) => c.args[2] === 10));
    assert(hud.marks.calls.some((c: any) => c.op === 'lineTo' && c.args[0] === 97 && c.color === '#f2bc77' && c.width === 2), 'unfocused heavy marker is 14px');
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
