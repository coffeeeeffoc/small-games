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
    W: 844,
    H: 430,
    worldScale: 0.6,
    cameraX: 0,
    hit: (x) => (x < 10 ? { id: 'fire' } : x < 20 ? { id: 'right' } : null),
  };
  game.draw = () => {};
  game.audio = { stop() {} };
  return game;
}

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
  game.move(1, { x: 100, y: 5 });
  assert.equal(game.held('right'), false);
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
