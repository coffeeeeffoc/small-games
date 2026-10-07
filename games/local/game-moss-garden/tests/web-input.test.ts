import assert from 'node:assert/strict';
import test from 'node:test';
import { isAccessibleActionClick } from '../src/web-input.ts';

test('zero-detail touch, mouse and pen clicks must not commit a second pointer action', () => {
  for (const pointerType of ['touch', 'mouse', 'pen']) {
    assert.equal(isAccessibleActionClick({ detail: 0, pointerType }), false);
    assert.equal(isAccessibleActionClick({ detail: 1, pointerType }), false);
  }
});
test('keyboard and assistive zero-detail activation still commits an action', () => {
  assert.equal(isAccessibleActionClick({ detail: 0 }), true);
  assert.equal(isAccessibleActionClick({ detail: 0, pointerType: '' }), true);
  assert.equal(isAccessibleActionClick({ detail: 1 }), false);
});
