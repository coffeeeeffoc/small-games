import assert from 'node:assert/strict';
import { createGame, startOrder, tick } from '../src/game.js';

// Exercise the gameplay update, including braking, reverse, and collision speed loss.
for (const heading of [0, Math.PI / 2, Math.PI - .1, -Math.PI + .1]) {
  for (const speed of [0, -5, 5, 15]) for (const steer of [-1, 1]) {
    const s = createGame();
    startOrder(s);
    Object.assign(s, { angle: heading, speed });
    for (let i = 0; i < 10; i++) tick(s, { steer, throttle: Math.sign(speed) }, .05);
    const turn = Math.atan2(Math.sin(s.angle - heading), Math.cos(s.angle - heading));
    assert(turn * steer > .2, `Heading must follow steer=${steer} at speed=${speed}, heading=${heading}`);
  }
}
const s = createGame();
startOrder(s);
Object.assign(s, { x: 0, z: 1.71, speed: 15 });
const wall = { x: 0, z: 0, w: 10, d: 2 };
tick(s, { throttle: 1 }, .05, [wall]);
const before = s.angle;
for (let i = 0; i < 10; i++) tick(s, { steer: 1, brake: true }, .05, [wall]);
assert(s.angle - before > .2, 'Braking against a wall must still allow turning away');
for (let i = 0; i < 20; i++) tick(s, { steer: -1 }, .05);
assert(s.angle < before, 'Changing direction after a held turn must respond');
console.log('Steering checks passed: both directions, rest, reverse, heading wrap, wall, and brake.');
