import assert from 'node:assert/strict';
import rule from '../../../../services/runtime-api/rules/letters.mjs';
import { findSpelling } from '../engine.js';
import { createRenderer } from '../competition-renderer.js';

const labels = [];
const ctx = new Proxy({
  fillText(text, x, y) { labels.push({ text, x, y }); },
  measureText(text) { return { width: [...text].length * 8 }; },
}, { get: (target, key) => key in target ? target[key] : () => {} });
const center = target => [target.x + target.w / 2, target.y + target.h / 2];
const draw = (renderer, width, height, state) => {
  renderer.draw(ctx, width, height, rule.view(state));
  const layout = renderer.getLayout();
  assert.ok(layout.tileSize >= 44, 'letters retain a 44px touch size');
  for (const target of layout.targets.filter(target => target.action)) {
    assert.ok(target.w >= 44 - .01 && target.h >= 44 - .01, `full touch target: ${JSON.stringify(target)}`);
    assert.ok(target.x >= 0 && target.y >= 0 && target.x + target.w <= width + .01 && target.y + target.h <= height + .01,
      `target stays on the canvas: ${JSON.stringify(target)}`);
  }
  return layout;
};
function seek(renderer, width, height, state, predicate) {
  for (const direction of ['board-down', 'board-up']) {
    for (let index = 0; index < 400; index++) {
      const layout = draw(renderer, width, height, state);
      const target = layout.targets.find(target => target.action && predicate(target));
      if (target) return target;
      const next = layout.targets.find(target => target.action?.local === direction);
      if (!next) break;
      assert.equal(renderer.tap(...center(next)), null, 'board paging stays local');
    }
  }
  assert.fail('the requested visible card is reachable through overlapping pages');
}
for (const [width, height] of [[320, 388], [390, 360], [390, 664], [844, 220], [844, 390]]) {
  const state = rule.initial(`renderer-${width}-${height}`), renderer = createRenderer();
  let elapsed = 0;
  while (!state.finished) {
    const path = findSpelling(state.game, state.game.activeWordId);
    assert.ok(path?.length);
    for (const id of path) {
      const target = seek(renderer, width, height, state, target => target.action?.tileId === id);
      const action = renderer.tap(...center(target));
      assert.deepEqual(action, { type: 'select', tileId: id });
      rule.action(state, action, elapsed += 100);
    }
    const layout = draw(renderer, width, height, state);
    const submit = layout.targets.find(target => target.action?.type === 'submit');
    assert.ok(submit, 'a completed answer enables the visible check action');
    rule.action(state, renderer.tap(...center(submit)), elapsed += 100);
  }
  assert.equal(state.correct, 18, 'real rules accept every touch-selected word');
  assert.equal(draw(renderer, width, height, state).targets.some(target => target.action?.type), false,
    'finished games cannot emit a gameplay action');
  console.log(`PASS renderer ${width}×${height}: 18 real words, 44px cards/buttons, local paging, finished input lock`);
}
const state = rule.initial('blocked-absorption'), renderer = createRenderer();
const view = rule.view(state);
view.tiles = [
  { id: 'back', char: 'a', x: 40, y: 50, size: 64, z: 1, blocked: false },
  { id: 'front', char: 'b', x: 40, y: 50, size: 64, z: 2, blocked: true },
];
renderer.draw(ctx, 390, 664, view);
const covered = renderer.getLayout().targets.find(target => target.tileId === 'front');
assert.equal(renderer.tap(...center(covered)), null, 'blocked front cards absorb taps to the back card');
view.tiles = rule.view(state).tiles;
renderer.draw(ctx, 320, 388, view);
const clipped = renderer.getLayout().targets.find(target => target.kind === 'tile' && target.h < renderer.getLayout().tileSize - .1);
assert.ok(clipped, 'short canvases expose a clipped card at the page edge');
assert.equal(renderer.tap(...center(clipped)), null, 'partially visible cards absorb taps without a tiny gameplay target');
const chooser = renderer.getLayout().targets.find(target => target.action?.local === 'choose');
renderer.tap(...center(chooser));
renderer.draw(ctx, 320, 388, view);
assert.equal(renderer.getLayout().targets.some(target => target.kind === 'tile'), false, 'word choice is a separate page with no board taps');
const choices = new Set();
for (let page = 0; page < 8; page++) {
  const layout = renderer.getLayout();
  layout.targets.filter(target => target.action?.type === 'choose').forEach(target => choices.add(target.action.wordId));
  const next = layout.targets.find(target => target.action?.local === 'next');
  if (!next) break;
  renderer.tap(...center(next)); renderer.draw(ctx, 320, 388, view);
}
assert.equal(choices.size, view.words.length, 'every word remains reachable on small screens');
const chosen = renderer.getLayout().targets.find(target => target.action?.type === 'choose');
assert.equal(renderer.tap(...center(chosen)).type, 'choose');
renderer.draw(ctx, 320, 388, view);
assert.ok(renderer.getLayout().targets.some(target => target.kind === 'tile'), 'selecting a meaning returns to the board');
const copy = renderer.getLayout(); copy.targets.length = 0; copy.boardViewport.x = -999;
assert.ok(renderer.getLayout().targets.length > 0 && renderer.getLayout().boardViewport.x >= 0, 'host geometry cannot mutate hit testing');
console.log('PASS blocked/clipped absorption, separate meaning pages, complete paginated choices, immutable host geometry');
