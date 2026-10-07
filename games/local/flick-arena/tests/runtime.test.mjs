import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game.mjs';
import { fighter } from '../src/render.mjs';
function harness() {
  let listener,
    depth = 0;
  const texts = [];
  const context = new Proxy(
    {
      arc(x, y, r) {
        assert(r >= 0, 'Canvas radius must be nonnegative');
      },
      save() {
        depth++;
      },
      restore() {
        depth--;
        assert(depth >= 0);
      },
      fillText(t) {
        texts.push(t);
      },
      createLinearGradient() {
        return { addColorStop() {} };
      },
      createRadialGradient() {
        return { addColorStop() {} };
      },
    },
    {
      get(o, k) {
        return k in o ? o[k] : () => {};
      },
    },
  );
  const target = {
    canvas: { width: 390, height: 780, getContext: () => context },
    onPointer(fn) {
      listener = fn;
      return () => (listener = null);
    },
  };
  const game = createGame(target);
  return {
    game,
    context,
    texts,
    pointer: (phase, x, y, pointerId = 0) => listener({ phase, x, y, pointerId }),
    depth: () => depth,
  };
}
test('elimination drawing supports all shrinking radii without invalid Canvas calls', () => {
  const { context, depth, game } = harness();
  for (let r = 21; r > 0; r -= 0.1) fighter(context, 0, 0, r, 0);
  assert.equal(depth(), 0);
  game.dispose();
});
test('native pointer flow, cancellation, pause, settlement, and disposal without DOM', () => {
  const { game, pointer, depth } = harness();
  game.debugStart(0);
  pointer('down', 195, 475.6);
  pointer('move', 175, 565);
  pointer('cancel', 175, 565);
  assert.equal(game.app.state.shots, 0);
  pointer('down', 195, 475.6);
  pointer('move', 175, 580);
  pointer('up', 175, 580);
  assert.equal(game.app.state.shots, 1);
  game.pause();
  const before = JSON.stringify(game.app.state);
  for (let i = 0; i < 120; i++) game.tick(1 / 60);
  assert.equal(JSON.stringify(game.app.state), before);
  game.resume();
  game.action('resume');
  for (let i = 0; i < 1500 && game.app.screen === 'playing'; i++) {
    const s = game.app.state;
    if (s.phase === 'aim' && s.active === 0) {
      const d = s.discs[0],
        x = 195 + d.x * 1.04,
        y = 382 + d.y * 1.04;
      pointer('down', x, y);
      pointer('move', x, y - 115);
      pointer('up', x, y - 115);
    }
    game.tick(1 / 60);
  }
  assert.equal(game.app.screen, 'result');
  assert.equal(game.app.save.played, 1);
  game.action('replay');
  for (let i = 0; i < 900 && game.app.screen === 'replay'; i++) game.tick(1 / 60);
  assert.equal(game.app.screen, 'result');
  assert.equal(game.app.save.played, 1);
  assert.equal(depth(), 0);
  game.dispose();
});
