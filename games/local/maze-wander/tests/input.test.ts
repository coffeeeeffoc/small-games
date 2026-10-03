import test from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../src/platform/input.ts';

test('independent pointer identities, cancellation, pause/blur reset and listener disposal', () => {
  const win = new EventTarget(),
    doc = new EventTarget(),
    turns: [number, number][] = [];
  Object.assign(globalThis, { window: win, document: doc });
  let active = true,
    pauses = 0;
  const input = new Input(
    {} as HTMLCanvasElement,
    () => active,
    (x, y) => turns.push([x, y]),
    () => {},
    () => {
      active = false;
      pauses++;
    },
  );
  input.pointerDown(11, 100, 100, 'move');
  input.pointerDown(22, 400, 100, 'look');
  input.pointerMove(11, 142, 58);
  input.pointerMove(22, 430, 105);
  assert.ok(input.axes().right > 0.7 && input.axes().forward > 0.7);
  assert.deepEqual(turns, [[30, 5]]);
  input.pointerEnd(11);
  assert.deepEqual(input.axes(), { forward: 0, right: 0 });
  input.pointerMove(22, 450, 100);
  assert.deepEqual(turns.at(-1), [20, -5]);
  input.pointerEnd(22);
  input.pointerMove(22, 490, 100);
  assert.equal(turns.length, 2);
  input.keys.add('KeyW');
  win.dispatchEvent(new Event('blur'));
  assert.equal(pauses, 1);
  assert.equal(input.axes().forward, 0);
  input.pointerDown(33, 0, 0, 'move');
  input.pointerMove(33, 0, -42);
  assert.equal(input.axes().forward, 0);
  active = true;
  input.keys.add('KeyW');
  Object.assign(doc, { hidden: true });
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(pauses, 2);
  assert.equal(input.axes().forward, 0);
  input.dispose();
  win.dispatchEvent(new Event('blur'));
  assert.equal(pauses, 2);
  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'document');
});
