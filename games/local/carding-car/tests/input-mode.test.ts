import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks, stripTypeScriptTypes } from 'node:module';

const KeyCode = { KEY_W: 87, KEY_A: 65, KEY_S: 83, KEY_D: 68, KEY_G: 71,
  KEY_P: 80, KEY_R: 82, KEY_M: 77, KEY_H: 72, ENTER: 13, ESCAPE: 27, SPACE: 32,
  ARROW_UP: 38, ARROW_DOWN: 40, ARROW_LEFT: 37, ARROW_RIGHT: 39,
  SHIFT_LEFT: 16, SHIFT_RIGHT: 161, DIGIT_1: 49, DIGIT_2: 50, DIGIT_3: 51, DIGIT_4: 52 };
const cc = { KeyCode, EventKeyboard: class {}, EventTouch: class {}, sys: { isMobile: false },
  input: { on() {}, off() {} }, Input: { EventType: {} },
  view: { getVisibleSize: () => ({ width: 960, height: 540 }) } };
(globalThis as any).__kartInputCC = cc;
const sourceURL = new URL('../assets/scripts/KartController.ts', import.meta.url);
const hooks = registerHooks({
  resolve(id, context, next) {
    if (context.parentURL === sourceURL.href) {
      if (id === 'cc') return { url: 'kart-input:cc', shortCircuit: true };
      if (id.startsWith('./')) return next(new URL(id + '.ts', sourceURL).href, context);
    }
    return next(id, context);
  },
  load(url, context, next) {
    if (url === 'kart-input:cc') return { format: 'module', shortCircuit: true,
      source: `export const { ${Object.keys(cc).join(',')} } = globalThis.__kartInputCC;` };
    const result = next(url, context);
    if (url === sourceURL.href) return { ...result, format: 'module', source:
      stripTypeScriptTypes(result.source!.toString(), { mode: 'transform' }) };
    return result;
  },
});
let KartController: any;
try { ({ KartController } = await import(sourceURL.href)); }
finally { hooks.deregister(); delete (globalThis as any).__kartInputCC; }
const touch = (id: number, x: number, y: number, simulate = false) => ({
  simulate, getID: () => id, getUILocation: () => ({ x: x * 960, y: y * 540 }),
});

test('real hybrid-device touches accelerate, while mouse clicks and released keyboard input coast', () => {
  const kart = { drifting: false, nitroHeld: false, charge: 0, tier: 0, driftSide: 0 };
  const race = { phase: 'racing', drivers: [{ kart }] };
  const c = new KartController(() => race, () => {}, () => {}, () => {});
  assert.equal(c.read().throttle, 0);
  c.touchStart(touch(0, 0.15, 0.2, true));
  assert.equal(c.read().throttle, 0, 'Creator-simulated mouse events never enable auto throttle');
  c.touchEnd(touch(0, 0.15, 0.2, true));
  c.touchStart(touch(1, 0.15, 0.2));
  assert.equal(c.read().throttle, 1, 'real fingers work even when sys.isMobile is false');
  c.touchStart(touch(2, 0.7, 0.2));
  assert.equal(c.read().throttle, 0);
  assert.equal(c.read().reverse, true);
  c.touchEnd(touch(2, 0.7, 0.2));
  assert.equal(c.read().throttle, 1, 'releasing brake returns to automatic forward driving');
  c.touchStart(touch(3, 0.9, 0.2));
  assert.equal(c.read().drift, true);
  c.keyDown({ keyCode: KeyCode.KEY_W });
  assert.equal(c.touches.size, 0, 'changing to keyboard releases old finger roles');
  assert.equal(c.read().drift, false);
  assert.equal(c.read().throttle, 1);
  c.keyUp({ keyCode: KeyCode.KEY_W });
  assert.equal(c.read().throttle, 0, 'keyboard release restores coasting');
  c.keyDown({ keyCode: KeyCode.SHIFT_LEFT });
  c.touchStart(touch(4, 0.15, 0.2));
  assert.equal(c.read().nitro, false, 'changing to touch releases old held keyboard controls');
  assert.equal(c.read().throttle, 1);
  c.clear();
  race.phase = 'paused';
  assert.equal(c.read().throttle, 0);
  c.destroy();
});
