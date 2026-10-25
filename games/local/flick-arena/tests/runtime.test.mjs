import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game.mjs';
import { arena, fighter } from '../src/render.mjs';
import { chooseBot, seeded, shoot, step, physics } from '../src/core.mjs';
function harness(options = {}, width = 390, height = 780) {
  let listener,
    depth = 0,
    dash = [],
    path = [];
  const dashStack = [],
    dashedPaths = [];
  const texts = [],
    arcs = [];
  const context = new Proxy(
    {
      arc(x, y, r) {
        assert(r >= 0, 'Canvas radius must be nonnegative');
        arcs.push({ x, y, r });
      },
      save() {
        depth++;
        dashStack.push(dash);
      },
      restore() {
        depth--;
        assert(depth >= 0);
        dash = dashStack.pop();
      },
      setLineDash(value) {
        dash = value;
      },
      beginPath() {
        path = [];
      },
      moveTo(x, y) {
        path.push({ x, y });
      },
      lineTo(x, y) {
        path.push({ x, y });
      },
      stroke() {
        if (dash.length && path.length > 1) dashedPaths.push(path);
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
    canvas: { width, height, getContext: () => context },
    onPointer(fn) {
      listener = fn;
      return () => (listener = null);
    },
  };
  const game = createGame(target, options);
  return {
    game,
    context,
    texts,
    arcs,
    dashedPaths,
    canvas: target.canvas,
    pointer: (phase, x, y, pointerId = 0) => listener?.({ phase, x, y, pointerId }),
    depth: () => depth,
  };
}
function playerPoint(game) {
  const d = game.app.state.discs[0];
  return { x: arena.x + d.x * arena.scale, y: arena.y + d.y * arena.scale };
}
test('elimination drawing supports all shrinking radii without invalid Canvas calls', () => {
  const { context, depth, game } = harness();
  for (let r = 21; r > 0; r -= 0.1) fighter(context, 0, 0, r, 0);
  assert.equal(depth(), 0);
  game.dispose();
});
test('native pointer flow, cancellation, pause, settlement, and disposal without DOM', () => {
  let persisted = 0;
  const { game, pointer, depth, texts } = harness({
    saveProgress() {
      persisted++;
    },
  });
  game.debugStart(0);
  const p = playerPoint(game);
  pointer('down', p.x, p.y);
  pointer('move', p.x - 20, p.y + 100);
  pointer('cancel', p.x - 20, p.y + 100);
  assert.equal(game.app.state.shots, 0);
  assert.equal(game.app.state.playerShots, 0);
  pointer('down', p.x, p.y);
  pointer('move', p.x, p.y + 100);
  pointer('up', p.x, p.y + 100);
  assert.equal(game.app.state.shots, 1);
  assert.equal(game.app.state.playerShots, 1);
  game.pause();
  const before = JSON.stringify(game.app.state);
  for (let i = 0; i < 120; i++) game.tick(1 / 60);
  assert.equal(JSON.stringify(game.app.state), before);
  game.resume();
  game.action('resume');
  for (let i = 0; i < 10000 && game.app.screen === 'playing'; i++) {
    const s = game.app.state;
    if (s.phase === 'aim' && s.active === 0) {
      const { x, y } = playerPoint(game),
        b = chooseBot(s, seeded(s.shots + 8));
      pointer('down', x, y);
      pointer('move', x - b.x * b.power * 115, y - b.y * b.power * 115);
      pointer('up', x - b.x * b.power * 115, y - b.y * b.power * 115);
    }
    game.tick(1 / 60);
  }
  assert.equal(game.app.screen, 'result');
  assert.equal(game.app.save.played, 1);
  assert.equal(persisted, 1);
  assert(
    texts.includes(
      `${game.app.state.turn} 回合 · 出手 ${game.app.state.playerShots} 次 · 击落 ${game.app.playerKnockouts} 位`,
    ),
  );
  const result = JSON.stringify(game.app.state);
  game.action('replay');
  game.pause();
  const pausedReplay = JSON.stringify(game.app.state);
  for (let i = 0; i < 120; i++) game.tick(1 / 60);
  assert.equal(JSON.stringify(game.app.state), pausedReplay);
  game.resume();
  for (let i = 0; i < 900 && game.app.screen === 'replay'; i++) game.tick(1 / 60);
  assert.equal(game.app.screen, 'result');
  assert.equal(JSON.stringify(game.app.state), result);
  game.action('replay');
  game.action('result');
  assert.equal(game.app.save.played, 1);
  assert.equal(persisted, 1);
  assert.equal(depth(), 0);
  game.dispose();
});
test('small physical discs retain a 32 logical pixel touch target on scaled canvases', () => {
  const { game, pointer, arcs } = harness({}, 780, 1560);
  game.debugStart(0);
  const { x, y } = playerPoint(game);
  assert(arcs.some((a) => a.x === 0 && a.y === 0 && a.r === physics.puck * arena.scale));
  pointer('down', (x + 30) * 2, y * 2, 7);
  assert(game.app.drag, 'touch beyond the small disc still starts aiming');
  pointer('down', x * 2, y * 2, 8);
  pointer('move', x * 2, (y + 100) * 2, 8);
  pointer('up', x * 2, (y + 100) * 2, 8);
  assert.equal(game.app.state.shots, 0);
  assert.equal(game.app.drag.dx, 0, 'second touch cannot take over the first drag');
  pointer('cancel', x * 2, y * 2, 7);
  assert.equal(game.app.drag, null);
  pointer('down', (x + 33) * 2, y * 2, 7);
  assert.equal(game.app.drag, null);
  pointer('up', (x + 33) * 2, y * 2, 7);
  pointer('down', x * 2, y * 2, 7);
  pointer('move', x * 2, (y + 90) * 2, 7);
  pointer('up', x * 2, y * 2, 7);
  assert.equal(game.app.state.shots, 0, 'returning to the touch origin cancels the shot');
  game.dispose();
});
test('round-end shrinking advances in the native loop and freezes across pause', () => {
  const { game, arcs, texts } = harness();
  game.debugStart(0);
  const s = game.app.state;
  s.turn = physics.safeRounds;
  s.active = 2;
  [
    [-45, -20],
    [45, -20],
    [0, 45],
  ].forEach(([x, y], id) => Object.assign(s.discs[id], { x, y }));
  game.render();
  assert(texts.includes('本回合结束后收圈'));
  shoot(s, 1, 0, 0.08);
  for (let i = 0; i < 180 && s.phase !== 'shrinking'; i++) game.tick(1 / 60);
  assert.equal(s.phase, 'shrinking');
  assert(s.shrink.targetRadius < physics.radius);
  const targetRadius = s.shrink.targetRadius;
  game.pause();
  const before = JSON.stringify(s);
  for (let i = 0; i < 90; i++) game.tick(1 / 60);
  assert.equal(JSON.stringify(s), before);
  game.resume();
  game.action('resume');
  for (let i = 0; i < 90 && s.phase === 'shrinking'; i++) game.tick(1 / 60);
  assert.equal(s.phase, 'aim');
  assert.equal(s.radius, targetRadius);
  assert.equal(s.active, 0);
  assert.equal(s.playerShots, 0);
  assert(arcs.some((a) => a.x === arena.x && a.y === arena.y && a.r === s.radius * arena.scale));
  game.dispose();
});

test('resizing during a drag preserves the match and cancels the old touch origin', () => {
  const { game, pointer, canvas } = harness();
  game.debugStart(0);
  const point = playerPoint(game);
  const before = JSON.stringify(game.app.state);
  pointer('down', point.x, point.y, 9);
  pointer('move', point.x, point.y + 90, 9);
  assert(game.app.drag);
  canvas.width = 844;
  canvas.height = 390;
  game.render();
  assert.equal(game.app.drag, null);
  pointer('up', 422, 270, 9);
  assert.equal(JSON.stringify(game.app.state), before);
  pointer('down', (844 - 195) / 2 + point.x * 0.5, point.y * 0.5, 10);
  assert(game.app.drag);
  canvas.width = 390;
  canvas.height = 780;
  pointer('up', point.x, point.y + 90, 10);
  assert.equal(game.app.drag, null, 'input handles resize before the first redraw too');
  assert.equal(JSON.stringify(game.app.state), before);
  game.dispose();
});

test('landscape touch can start aiming within a 44 display-pixel target', () => {
  const { game, pointer } = harness({}, 844, 390);
  game.debugStart(0);
  const point = playerPoint(game);
  const scale = 0.5;
  const offsetX = (844 - 390 * scale) / 2;
  pointer('down', offsetX + point.x * scale + 21, point.y * scale, 4);
  assert(game.app.drag, '21 px away remains inside the accessible landscape target');
  pointer('cancel', 0, 0, 4);
  assert.equal(game.app.state.shots, 0);
  game.dispose();
});

test('human elimination shortens AI waiting without accelerating shared physics', () => {
  const { game } = harness();
  game.debugStart(0);
  const state = game.app.state;
  state.discs[0].alive = false;
  state.active = 1;
  for (let i = 0; i < 7; i++) game.tick(0.05);
  assert.equal(state.shots, 1, 'remaining bots no longer wait 1.25s while the player is out');
  assert.equal(state.phase, 'moving');
  assert(state.elapsed <= 0.11, 'physics still advances at the fixed simulation rate');
  game.dispose();
});
test('touch aim previews the simulated stop and warns about both exits and the next ring', () => {
  const { game, pointer, arcs, texts } = harness();
  game.debugStart(0);
  const { x, y } = playerPoint(game),
    simulated = JSON.parse(JSON.stringify(game.app.state));
  shoot(simulated, 0, -1, 0.65);
  while (simulated.phase === 'moving') step(simulated);
  const stop = simulated.discs[0];
  pointer('down', x, y);
  arcs.length = 0;
  pointer('move', x, y + 0.65 * 115);
  assert(
    arcs.some(
      (a) =>
        Math.abs(a.x - (arena.x + stop.x * arena.scale)) < 1e-7 &&
        Math.abs(a.y - (arena.y + stop.y * arena.scale)) < 1e-7 &&
        a.r === physics.puck * arena.scale,
    ),
    'the ghost stop follows actual no-collision motion rather than an arbitrary arrow length',
  );
  pointer('cancel', x, y);
  const s = game.app.state;
  Object.assign(s.discs[0], { x: physics.radius - 2, y: 0 });
  let p = playerPoint(game);
  pointer('down', p.x, p.y);
  pointer('move', p.x - 115, p.y);
  assert(texts.includes('预计出界 · 减小力度或改变方向'));
  pointer('cancel', p.x, p.y);
  s.turn = physics.safeRounds;
  Object.assign(s.discs[0], { x: physics.radius - physics.puck + 1, y: 0 });
  p = playerPoint(game);
  pointer('down', p.x, p.y);
  pointer('move', p.x - 0.4 * 115, p.y);
  assert(texts.includes('这个落点有收圈风险'));
  pointer('cancel', p.x, p.y);
  assert.equal(s.shots, 0);
  game.dispose();
});
test('drag distance, visible dashed reach and released speed agree at every strength', () => {
  let previousReach = 0;
  for (const distance of [9, 28.75, 57.5, 86.25, 115, 180]) {
    const { game, pointer, dashedPaths, texts } = harness();
    game.debugStart(0);
    const { x, y } = playerPoint(game);
    pointer('down', x, y);
    dashedPaths.length = 0;
    pointer('move', x, y + distance);
    const guide = dashedPaths[0];
    assert(guide, 'an actionable drag draws a dashed travel guide');
    const end = guide.at(-1);
    const reach = y - end.y;
    assert.equal(guide[0].x, x);
    assert.equal(guide[0].y, y);
    assert(Math.abs(end.x - x) < 1e-9);
    if (distance <= 115) assert(reach > previousReach, 'longer pull extends the dashed line');
    else assert.equal(reach, previousReach, 'overpull stays at the full-power reach');
    previousReach = reach;
    pointer('up', x, y + distance);
    const power = Math.max(0.08, Math.min(1, distance / 115));
    assert.equal(game.app.state.lastShot.power, power);
    assert.equal(game.app.state.discs[0].vy, -physics.maxSpeed * power);
    assert(texts.some((value) => value.startsWith(`力度 ${Math.round(power * 100)}%`)));
    while (game.app.state.phase === 'moving') step(game.app.state);
    const disc = game.app.state.discs[0];
    assert(
      Math.abs(end.y - (arena.y + disc.y * arena.scale)) < 1e-7,
      'the rendered guide ends at the actual unobstructed stop',
    );
    game.dispose();
  }
});
test('pulling back into the cancel zone clears both power and the dashed guide', () => {
  const { game, pointer, dashedPaths, texts } = harness();
  game.debugStart(0);
  const { x, y } = playerPoint(game);
  pointer('down', x, y);
  pointer('move', x, y + 115);
  for (const distance of [8.9, 5, 0]) {
    dashedPaths.length = 0;
    texts.length = 0;
    pointer('move', x, y + distance);
    assert.equal(dashedPaths.length, 0);
    assert(texts.some((value) => value.startsWith('力度 0%')));
  }
  pointer('up', x, y);
  assert.equal(game.app.state.shots, 0);
  game.dispose();
});
test('replay motion follows the same physical clock after 30 Hz and 120 Hz live play', () => {
  const replayAt = (displayStep) => {
    const { game, pointer } = harness();
    game.debugStart(0);
    const s = game.app.state;
    Object.assign(s.discs[0], { x: physics.radius - 20, y: 0 });
    s.discs[1].alive = false;
    s.discs[2].alive = false;
    const { x, y } = playerPoint(game);
    pointer('down', x, y);
    pointer('up', x - 0.8 * 115, y);
    for (let i = 0; i < 500 && game.app.screen === 'playing'; i++) game.tick(displayStep);
    assert.equal(game.app.screen, 'result');
    game.action('replay');
    for (let i = 0; i < 3; i++) game.tick(physics.step);
    const position = { x: game.app.state.discs[0].x, phase: game.app.state.phase };
    game.action('result');
    assert.equal(game.app.save.played, 1);
    game.dispose();
    return position;
  };
  const low = replayAt(1 / 30),
    high = replayAt(1 / 120);
  assert.equal(low.phase, 'moving');
  assert.deepEqual(low, high);
});

test('shared rematches preserve layout and bot seed but reset transient match state', () => {
  const { game } = harness({ challenge: { layout: 'triangle', seed: 1234567 } });
  // Resolve the actual stable layout id rather than assuming catalog order in a URL.
  game.app.invited.layout = game.app.layouts[2].id;
  game.action('start');
  for (let i = 0; i < 30; i++) game.tick(0.05);
  assert.equal(game.app.state.seed, 1234567);
  assert.equal(game.app.state.layout, game.app.layouts[2].id);
  const initial = JSON.parse(JSON.stringify(game.app.state));
  game.app.state.phase = 'over';
  game.app.screen = 'result';
  game.app.playerKnockouts = 2;
  game.action('rematch');
  for (let i = 0; i < 30; i++) game.tick(0.05);
  assert.deepEqual(game.app.state, initial);
  assert.equal(game.app.playerKnockouts, 0);
  game.dispose();
});
