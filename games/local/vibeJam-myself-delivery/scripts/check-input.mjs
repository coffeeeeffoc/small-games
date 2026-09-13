import assert from 'node:assert/strict';
import { createInput } from '../src/input.js';
import { createGame, startOrder, tick } from '../src/game.js';

function fire(element, type, properties = {}) {
  const event = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries(properties)) Object.defineProperty(event, key, { value });
  element.dispatchEvent(event);
  return event;
}
class Element extends EventTarget {
  constructor(tag = 'div') {
    super();
    this.tag = tag;
    this.style = {};
    this.captures = new Set();
    const classes = new Set();
    this.classList = {
      add: (name) => classes.add(name), remove: (name) => classes.delete(name),
      toggle: (name, active) => active ? classes.add(name) : classes.delete(name),
    };
  }
  closest(selector) { return selector.split(',').map((part) => part.trim()).includes(this.tag) ? this : null; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) {
    if (this.captures.delete(id)) fire(this, 'lostpointercapture', { pointerId: id });
  }
}
globalThis.window = new EventTarget();
const elements = Object.fromEntries(['stick', 'knob', 'boost', 'brake', 'jump', 'canvas'].map((name) => [name, new Element()]));
const { stick, boost, brake, jump } = elements;
const input = createInput(elements);
const down = (element, id, clientX = 90, clientY = 10) => fire(element, 'pointerdown', { pointerId: id, button: 0, clientX, clientY });
const neutral = { steer: 0, throttle: 0, boost: false, brake: false, jump: false };

down(stick, 1);
down(boost, 2);
let state = input.read();
assert(state.steer > 0 && state.throttle > 0 && state.boost, 'Two fingers steer and boost together');
assert(stick.hasPointerCapture(1) && boost.hasPointerCapture(2));
fire(boost, 'pointercancel', { pointerId: 2 });
state = input.read();
assert(state.steer > 0 && state.throttle > 0 && !state.boost, 'Cancelling boost preserves the stick');
down(boost, 3);
fire(stick, 'pointercancel', { pointerId: 1 });
assert.deepEqual(input.read(), { ...neutral, boost: true }, 'Cancelling the stick preserves boost');
boost.releasePointerCapture(3);
assert.deepEqual(input.read(), neutral, 'Losing button capture clears its held state');
down(stick, 4);
stick.releasePointerCapture(4);
assert.deepEqual(input.read(), neutral, 'Losing stick capture clears movement');

down(stick, 5);
down(boost, 6);
down(brake, 7);
down(jump, 8);
fire(window, 'keydown', { code: 'KeyW' });
fire(window, 'keydown', { code: 'ShiftLeft' });
fire(window, 'blur');
assert.deepEqual(input.read(), neutral, 'Blur clears keyboard, touch, and pending jump');
assert([stick, boost, brake, jump].every((element) => element.captures.size === 0), 'Blur releases all captures');

down(jump, 9);
assert.equal(input.read().jump, true, 'Touch jump is queued');
assert.equal(input.read().jump, false, 'Touch jump is consumed once');
fire(jump, 'pointerup', { pointerId: 9 });
const space = fire(window, 'keydown', { code: 'Space' });
assert(space.defaultPrevented);
assert.equal(input.read().jump, true, 'Keyboard jump is queued');
assert.equal(input.read().jump, false, 'Keyboard jump is consumed once');
fire(window, 'keydown', { code: 'Space', repeat: true });
assert.equal(input.read().jump, false, 'Holding Space does not repeat jumps');
fire(window, 'keyup', { code: 'Space' });
const buttonSpace = fire(window, 'keydown', { code: 'Space', target: new Element('button') });
assert.equal(buttonSpace.defaultPrevented, false, 'Focused buttons retain native Space activation');
assert.equal(input.read().jump, false, 'Button activation does not jump');

for (const code of ['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD']) {
  for (const reverse of [false, true]) {
    input.reset();
    const game = createGame(); startOrder(game);
    if (reverse) fire(window, 'keydown', { code: 'ArrowDown' });
    fire(window, 'keydown', { code });
    for (let i = 0; i < 10; i++) tick(game, input.read(), .05);
    const direction = ['ArrowLeft', 'KeyA'].includes(code) ? -1 : 1;
    assert(game.angle * direction > .2, `${code} must turn the heading consistently, reverse=${reverse}`);
    fire(window, 'keyup', { code });
    assert.equal(input.read().steer, 0, 'Releasing the key clears the requested turn');
  }
}
input.destroy();
fire(window, 'keydown', { code: 'KeyW' });
assert.deepEqual(input.read(), neutral, 'Destroy removes keyboard listeners');
console.log('Input checks passed: multitouch, cancellation, capture loss, blur, jump, native button Space.');
