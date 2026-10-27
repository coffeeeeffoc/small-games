import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import * as core from '../src/core.mjs';
import { readProgress } from '../src/progress.mjs';

// Exercise the actual controller between simulation frames without loading a renderer.
const source = readFileSync(new URL('../assets/scripts/Ashfall.ts', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from [^;]+;\r?\n/gm, '')
  .replace(/^@ccclass\('Ashfall'\)\r?\n/m, '')
  .replace('export class Ashfall', 'class Ashfall');
const KeyCode = Object.fromEntries(
  [
    'ESCAPE',
    'ENTER',
    'SPACE',
    'KEY_W',
    'ARROW_UP',
    'KEY_S',
    'ARROW_DOWN',
    'SHIFT_LEFT',
    'SHIFT_RIGHT',
    'KEY_J',
    'KEY_I',
    'KEY_K',
    'KEY_D',
    'ARROW_RIGHT',
    'KEY_A',
    'ARROW_LEFT',
  ].map((key, index) => [key, index]),
);
const Ashfall = runInNewContext(stripTypeScriptTypes(source) + '\nAshfall;', {
  ...core,
  Component: class {},
  _decorator: {},
  KeyCode,
  structuredClone,
});
function controller() {
  const game = new Ashfall();
  game.run = core.createRun(0, { seed: 1 });
  game.progress = readProgress(null);
  game.ready = true;
  game.screen = 'playing';
  game.ui = {
    ready: true,
    W: 844,
    H: 430,
    worldScale: 0.6,
    cameraX: 0,
    cameraY: 0,
    controls: [],
    hit: (x) =>
      x < 10 ? { id: 'fire' } : x < 20 ? { id: 'move', x: 0, y: 0, w: 30, h: 30 } : null,
  };
  game.draw = () => {};
  game.audio = { stop() {} };
  return game;
}

function movementController() {
  const game = controller();
  game.ui.controls = [
    { id: 'move', x: 20, y: 280, w: 100, h: 100 },
    { id: 'dash', x: 630, y: 230, w: 70, h: 70 },
    { id: 'jump', x: 630, y: 310, w: 70, h: 70 },
    { id: 'fire', x: 730, y: 300, w: 90, h: 90 },
  ];
  game.ui.hit = (x, y) =>
    game.ui.controls.find(
      (b) => !b.disabled && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h,
    );
  return game;
}

test('left stick moves independently while right jump/dash and fire combine', () => {
  const game = movementController();
  game.down(1, { x: 103, y: 330 });
  game.down(2, { x: 775, y: 345 });
  game.down(3, { x: 665, y: 345 });
  game.update(1 / 60);
  assert.ok(game.run.player.x > 420);
  assert.ok(game.run.player.vy < 0);
  assert.equal(game.run.shots, 1);
  game.up(3, { x: 665, y: 345 });
  game.down(3, { x: 665, y: 265 });
  game.update(1 / 60);
  assert.equal(game.run.player.dashDirection, 1);
  game.move(1, { x: 37, y: 330 });
  assert.equal(game.pointers.get(1).move, -1);
  game.move(1, { x: 70, y: 330 });
  assert.equal(game.pointers.get(1).move, 0, 'centering the stick stops movement');
  assert.equal(game.held('fire'), true);
});

test('movement stick climbs and cancelled fingers release only their own actions', () => {
  const game = movementController();
  const ladder = game.run.level.ladders.find((l) => l.top === 570 && l.bottom > 570);
  game.run.player.x = ladder.x;
  game.down(1, { x: 70, y: 365 });
  game.down(2, { x: 775, y: 345 });
  game.update(1 / 60);
  assert.ok(game.run.player.y > 570, 'stick down enters ladder');
  game.touchCancel({ getTouches: () => [{ getID: () => 1 }] });
  assert.equal(game.held('move'), false);
  assert.equal(game.held('fire'), true);
  game.touchCancel({ getTouches: () => [{ getID: () => 2 }] });
  const shots = game.run.shots;
  game.update(1 / 60);
  assert.equal(game.run.shots, shots);
});

test('a stationary thumb on jump does not retrigger and a second move finger is ignored', () => {
  const game = movementController();
  game.down(1, { x: 103, y: 330 });
  game.down(2, { x: 37, y: 330 });
  assert.equal(game.pointers.has(2), false);
  game.down(3, { x: 665, y: 345 });
  game.update(1 / 60);
  game.move(3, { x: 666, y: 346 });
  assert.equal(game.jump, false);
});

test('disabled movement controls block mouse scene fire', () => {
  const game = controller();
  game.ui.hit = (_x, _y, includeDisabled) =>
    includeDisabled ? { id: 'dash', disabled: true } : null;
  const event = { getButton: () => 0, getUILocation: () => ({ x: 80, y: 100 }) };
  game.mouseDown(event);
  game.mouseUp(event);
  game.update(1 / 60);
  assert.equal(game.run.shots, 0);
});

test('press and release between frames fires once, including taps during weapon cooldown', () => {
  const game = controller();
  for (let i = 0; i < 2; i++) {
    game.down(1, { x: 5, y: 5 });
    game.up(1, { x: 5, y: 5 });
    for (let tick = 0; tick < 12; tick++) game.update(1 / 60);
    assert.equal(game.run.shots, i + 1);
  }
  game.run.player.fireCooldown = 0.12;
  game.down(1, { x: 5, y: 5 });
  game.up(1, { x: 5, y: 5 });
  game.update(1 / 60);
  assert.equal(game.run.shots, 2);
  for (let tick = 0; tick < 20; tick++) game.update(1 / 60);
  assert.equal(game.run.shots, 3);
});

test('cancel, pause and moving off movement controls release input without queued fire', () => {
  const game = controller();
  game.down(1, { x: 5, y: 5 });
  game.touchCancel();
  game.update(1 / 60);
  assert.equal(game.run.shots, 0);
  game.down(1, { x: 15, y: 5 });
  game.touchCancel({ getTouches: () => [{ getID: () => 1 }] });
  assert.equal(game.held('move'), false);
  game.down(1, { x: 5, y: 5 });
  game.hide();
  game.setScreen('playing');
  game.update(1 / 60);
  assert.equal(game.run.shots, 0);
  game.setScreen('paused');
  game.keyDown({ keyCode: KeyCode.KEY_J });
  assert.equal(game.fireTap, false);
});

test('short mouse scene clicks retain their aim and keyboard taps survive release', () => {
  const game = controller();
  const event = { getButton: () => 0, getUILocation: () => ({ x: 400, y: 300 }) };
  game.mouseDown(event);
  game.mouseUp(event);
  game.update(1 / 60);
  assert.equal(game.run.shots, 1);
  assert.ok(game.run.player.aimAngle < -0.5, 'quick scene click still aims above the player');
  assert.equal(game.mouseAim, null);
  game.keyDown({ keyCode: KeyCode.KEY_J });
  game.keyUp({ keyCode: KeyCode.KEY_J });
  for (let tick = 0; tick < 12; tick++) game.update(1 / 60);
  assert.equal(game.run.shots, 2);
});

test('queued diagonal keys and dragged shots retain manual aim after release during cooldown', () => {
  for (const y of [-1, 1]) {
    const game = controller();
    game.run.player.fireCooldown = 0.12;
    const keyCode = y < 0 ? KeyCode.KEY_I : KeyCode.KEY_K;
    game.keyDown({ keyCode });
    game.keyUp({ keyCode });
    for (let tick = 0; tick < 8; tick++) game.update(1 / 60);
    assert.equal(game.run.shots, 1);
    assert.ok(Math.abs(game.run.player.aimAngle - (y * Math.PI) / 4) < 0.01);
    assert.equal(game.tapDirection, undefined);
  }
  const game = controller();
  game.run.player.fireCooldown = 0.12;
  game.down(1, { x: 5, y: 50 });
  game.move(1, { x: 45, y: 10 });
  game.up(1, { x: 45, y: 10 });
  for (let tick = 0; tick < 8; tick++) game.update(1 / 60);
  assert.equal(game.run.shots, 1);
  assert.ok(Math.abs(game.run.player.aimAngle + Math.PI / 4) < 0.01);
});

test('reward wait can be cancelled by touch and late completion cannot regain the screen', () => {
  const game = movementController();
  let cancelled = false;
  game.rewards = {
    cancel() {
      cancelled = true;
      game.adLocked = false;
    },
  };
  game.adLocked = true;
  game.screen = 'reward';
  game.rewardReturn = 'upgrade';
  game.ui.controls = [{ id: 'cancel', x: 100, y: 100, w: 200, h: 60 }];
  game.down(1, { x: 150, y: 130 });
  game.up(1, { x: 150, y: 130 });
  assert.equal(cancelled, true);
  assert.equal(game.screen, 'upgrade');
});
