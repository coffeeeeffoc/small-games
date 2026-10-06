import assert from 'node:assert/strict';
import test from 'node:test';
import { bindPress, isKeyboardClick } from '../ui/dom.mjs';

test('zero-detail touch clicks are not keyboard or assistive activations', () => {
  for (const pointerType of ['touch', 'pen', 'mouse'])
    assert.equal(isKeyboardClick({ detail: 0, pointerType }), false);
  assert.equal(
    isKeyboardClick({ detail: 0, sourceCapabilities: { firesTouchEvents: true } }),
    false,
  );
  assert.equal(isKeyboardClick({ detail: 1 }), false);
  assert.equal(isKeyboardClick({ detail: 0 }), true);
  assert.equal(isKeyboardClick({ detail: 0, pointerType: '' }), true);
});

test('a touch opening a menu cannot click through to its newly revealed close control', (t) => {
  const pause = new EventTarget();
  const close = new EventTarget();
  const original = globalThis.document;
  globalThis.document = { querySelector: (id) => (id === '#pause' ? pause : close) };
  t.after(() => {
    if (original === undefined) delete globalThis.document;
    else globalThis.document = original;
  });
  let open = false;
  bindPress('#pause', () => { open = !open; });
  bindPress('#close', () => { open = false; });
  const dispatch = (target, type, values) =>
    target.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), values));

  dispatch(pause, 'pointerdown', { button: 0, pointerType: 'touch' });
  assert.equal(open, true);
  dispatch(close, 'click', { detail: 0, pointerType: 'touch' });
  assert.equal(open, true, 'the touch release must not dismiss the menu');
  dispatch(pause, 'click', { detail: 0, pointerType: 'touch' });
  assert.equal(open, true, 'an unretargeted touch click must not toggle twice either');
  dispatch(close, 'click', { detail: 0, pointerType: '' });
  assert.equal(open, false, 'keyboard and assistive clicks still dismiss the menu');
  pause.disabled = true;
  dispatch(pause, 'pointerdown', { button: 0, pointerType: 'touch' });
  dispatch(pause, 'click', { detail: 0 });
  assert.equal(open, false, 'disabled controls must ignore both forms of activation');
});
