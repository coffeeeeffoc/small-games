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
      source: 'export class World {} export class HUD {}' };
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
  g.world = { updateCamera() {} };
  g.platform = new Platform(new Node(), g.pause, g.clear);
  g.sim.start();
  return g;
}

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
