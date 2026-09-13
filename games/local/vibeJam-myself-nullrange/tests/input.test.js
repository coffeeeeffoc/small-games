import assert from 'node:assert/strict';
import { createInput } from '../src/input.js';

// Small DOM substitute for input state checks; browser touch behavior is checked separately.
class Surface {
  handlers = new Map();
  captures = new Set();
  classes = new Set();
  style = {};
  offsetWidth = 40;
  offsetHeight = 40;
  interactive = false;
  classList = { toggle: (name, active) => active ? this.classes.add(name) : this.classes.delete(name) };
  addEventListener(type, callback) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(callback);
  }
  removeEventListener(type, callback) { this.handlers.get(type)?.delete(callback); }
  emit(type, detail = {}) {
    const event = { target: this, button: 0, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, ...detail };
    for (const callback of this.handlers.get(type) || []) callback(event);
    return event;
  }
  getBoundingClientRect() { return { left: 0, top: 0, width: 200, height: 200 }; }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) {
    this.captures.delete(id);
    this.emit('lostpointercapture', { pointerId: id });
  }
  closest() { return this.interactive ? this : null; }
}

globalThis.Element = Surface;
globalThis.window = new Surface();
globalThis.document = new Surface();
const joystick = new Surface(), stick = new Surface(), fire = new Surface(), boost = new Surface();
let playing = true, pauses = 0, views = 0;
const actions = [];
const input = createInput({ joystick, stick, fire, boost, isPlaying: () => playing,
  onPause: () => pauses++, onView: () => views++, onAction: name => actions.push(name) });
const idle = { x: 0, y: 0, fire: false, boost: false };

joystick.emit('pointerdown', { pointerId: 1, clientX: 180, clientY: 100 });
fire.emit('pointerdown', { pointerId: 2 });
boost.emit('pointerdown', { pointerId: 3 });
assert.deepEqual(input.state, { x: 1, y: 0, fire: true, boost: true });
assert.equal(joystick.captures.has(1), true);
fire.emit('pointerup', { pointerId: 2 });
assert.deepEqual(input.state, { x: 1, y: 0, fire: false, boost: true });
assert.equal(fire.classes.has('active'), false);
assert.equal(boost.classes.has('active'), true);

// Cancelling one touch preserves other fingers and keyboard holds.
window.emit('keydown', { code: 'Space' });
fire.emit('pointerdown', { pointerId: 4 });
fire.emit('pointercancel', { pointerId: 4 });
assert.equal(input.state.fire, true);
joystick.emit('pointercancel', { pointerId: 1 });
assert.deepEqual(input.state, { x: 0, y: 0, fire: true, boost: true });
window.emit('keyup', { code: 'Space' });
assert.equal(input.state.fire, false);
boost.releasePointerCapture(3);
assert.deepEqual(input.state, idle);

fire.emit('pointerdown', { pointerId: 5 });
fire.emit('pointerdown', { pointerId: 6 });
fire.emit('pointerup', { pointerId: 5 });
assert.equal(input.state.fire, true);
fire.emit('pointerup', { pointerId: 6 });
assert.equal(input.state.fire, false);

joystick.emit('pointerdown', { pointerId: 7, clientX: 180, clientY: 100 });
window.emit('keydown', { code: 'KeyW' });
assert.ok(Math.abs(input.state.x - Math.SQRT1_2) < 1e-12);
assert.ok(Math.abs(input.state.y + Math.SQRT1_2) < 1e-12);
joystick.emit('pointerup', { pointerId: 7 });
assert.deepEqual(input.state, { x: 0, y: -1, fire: false, boost: false });
fire.emit('pointerdown', { pointerId: 8 });
boost.emit('pointerdown', { pointerId: 9 });
window.emit('blur');
assert.deepEqual(input.state, idle);
assert.equal(fire.captures.size + boost.captures.size + joystick.captures.size, 0);
assert.equal(stick.style.translate, '0px 0px');

joystick.emit('pointerdown', { pointerId: 10, clientX: 104, clientY: 100 });
assert.equal(input.state.x, 0, 'small movements stay inside the dead zone');
joystick.emit('pointermove', { pointerId: 10, clientX: 1000, clientY: 100 });
assert.equal(input.state.x, 1, 'the joystick clamps outside its radius');
document.hidden = true;
document.emit('visibilitychange');
assert.deepEqual(input.state, idle);
assert.equal(joystick.captures.size, 0);
document.hidden = false;

playing = false;
fire.emit('pointerdown', { pointerId: 11 });
window.emit('keydown', { code: 'Space' });
window.emit('keydown', { code: 'KeyQ' });
assert.deepEqual(input.state, idle);
assert.deepEqual(actions, []);
window.emit('keydown', { code: 'Escape' });
assert.equal(pauses, 1);
playing = true;
window.emit('keydown', { code: 'KeyQ' });
window.emit('keydown', { code: 'KeyQ', repeat: true });
window.emit('keydown', { code: 'KeyE' });
window.emit('keydown', { code: 'KeyV' });
assert.deepEqual(actions, ['scan', 'missile']);
assert.equal(views, 1);

// Focused controls keep native keyboard activation; callers must restore game focus.
const button = new Surface();
button.interactive = true;
const focusedSpace = window.emit('keydown', { code: 'Space', target: button });
assert.equal(focusedSpace.defaultPrevented, false);
assert.equal(input.state.fire, false);
const browserShortcut = window.emit('keydown', { code: 'KeyW', ctrlKey: true });
assert.equal(browserShortcut.defaultPrevented, false);
assert.deepEqual(input.state, idle);
window.emit('keydown', { code: 'Space' });
window.emit('keyup', { code: 'Space', target: button });
assert.equal(input.state.fire, false, 'releasing over a control must not leave keys held');

input.destroy();
window.emit('keydown', { code: 'Space' });
fire.emit('pointerdown', { pointerId: 12 });
assert.deepEqual(input.state, idle);
assert.equal(fire.captures.size, 0);
console.log('Input checks passed: multitouch, cancellation, mixed keyboard, focus, lifecycle cleanup.');
