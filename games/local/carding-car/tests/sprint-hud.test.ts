import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { RaceManager } from '../assets/scripts/RaceManager.ts';

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

test('ready HUD presents both race formats with separate reachable buttons and the correct lap goal', () => {
  for (const mode of ['standard', 'sprint'] as const) {
    const hud = new HUD(new SceneNode()), race = new RaceManager({}, 12, 4, mode);
    hud.update(race, idle, false);
    assert.equal(hud.garageButton.active, true);
    assert.match(hud.button.string, mode === 'sprint' ? /一圈冲刺开跑/ : /3 圈竞速开跑/);
    assert.match(hud.garageLabel.string, mode === 'sprint' ? /3 圈竞速/ : /一圈冲刺/);
    const main = hud.button.node.position, other = hud.garageLabel.node.position;
    const mainWidth = hud.button.node.getComponent(Transform).contentSize.width;
    const otherWidth = hud.garageLabel.node.getComponent(Transform).contentSize.width;
    assert(other.x + otherWidth / 2 < main.x - mainWidth / 2);
    assert(Math.abs((other.x + 480) / 960 - .225) < .005);
    assert(Math.abs((other.y + 270) / 540 - .27) < .005);
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
  assert.match(hud.timer.string, /漂移加速 2 次/);
});
