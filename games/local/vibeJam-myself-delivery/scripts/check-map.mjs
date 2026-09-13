import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWorld } from '../src/world.js';
import { createGame, startOrder, tick, MARKET, GOODS, ORDERS } from '../src/game.js';
import { COAST_ROAD, ROAD_ISLANDS } from '../src/map-data.js';
import { drawMap } from '../src/map.js';

// Canvas text is decorative; use the real Three.js scene and its actual colliders.
const context = Object.fromEntries(['fillRect', 'strokeRect', 'fillText', 'clearRect', 'save', 'restore', 'translate', 'scale', 'beginPath', 'arc', 'fill', 'stroke', 'setLineDash', 'moveTo', 'lineTo', 'rotate', 'closePath'].map(name => [name, () => {}]));
globalThis.document = { createElement: () => ({ getContext: () => context }) };
const scene = new THREE.Scene(), world = createWorld(scene);
const s = createGame(); startOrder(s);
const parked = scene.getObjectByName('parked-scooter');
for (const angle of [-2.1, -.5, 0, .7, 2.4]) {
  Object.assign(s, { mode: 'walk', angle, bikeAngle: angle });
  world.update(s, 0, 0);
  assert.equal(parked.rotation.y, world.rider.rotation.y, 'Parked and ridden headings must agree');
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(parked.quaternion);
  assert(Math.abs(forward.x - Math.sin(angle)) < 1e-9 && Math.abs(forward.z + Math.cos(angle)) < 1e-9);
}

function clear(x, z, mode = 'ride') {
  Object.assign(s, { x, z, speed: 0, steer: 0, angle: 0, mode, elapsed: 0, phase: 'pickup' });
  tick(s, {}, .001, world.colliders);
  return Math.hypot(s.x - x, s.z - z) < 1e-8;
}
for (const r of ROAD_ISLANDS) {
  assert(world.colliders.includes(r), 'Rendered islands must supply their collision shape');
  assert(!clear(r.x, r.z), 'Flowerbeds must block the player');
}
// A complete loop must remain passable, including the space needed for the scooter.
for (let i = 0; i < 720; i++) {
  const angle = i * Math.PI / 360;
  assert(clear(Math.sin(angle) * COAST_ROAD.radius, Math.cos(angle) * COAST_ROAD.radius), `Coast road blocked at ${i / 2} degrees`);
}
// Flood the actual collision space at 1m resolution; verify objectives and dock stay connected.
const visited = new Set(['0,16']), queue = [[0, 16]];
for (let i = 0; i < queue.length; i++) {
  const [x, z] = queue[i];
  for (const [nx, nz] of [[x - 1, z], [x + 1, z], [x, z - 1], [x, z + 1]]) {
    const key = `${nx},${nz}`;
    if (visited.has(key) || Math.abs(nx) > 73 || nz < -73 || nz > 85) continue;
    if (!clear(nx, nz) || !clear((x + nx) / 2, (z + nz) / 2)) continue;
    visited.add(key); queue.push([nx, nz]);
  }
}
for (const p of [MARKET, ...GOODS, ...ORDERS, { x: 0, z: 83 }]) {
  assert(visited.has(`${p.x},${p.z}`), `Unreachable destination ${p.name || 'dock'}`);
}
drawMap({ width: 600, height: 480, getContext: () => context }, s, world.colliders, true);
drawMap({ width: 180, height: 180, getContext: () => context }, s, world.colliders);
console.log(`Map checks passed: scene headings, solid flowerbeds, full coast loop, ${visited.size} connected cells, all objectives, both map sizes.`);
