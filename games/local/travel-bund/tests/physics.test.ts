import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createGround, createWalker, createCar, walk, canOccupy } from '../src/physics.ts';

const require = createRequire(import.meta.url);
const rapier = createRequire(require.resolve('@react-three/rapier'))('@dimforge/rapier3d-compat');
await rapier.init();
const data = JSON.parse(
  readFileSync(
    new URL('../../../../assets/bund/runtime/world/world.json', import.meta.url),
    'utf8',
  ),
);
function step(world, r, move = [0, 0, 0], jump = false) {
  const next = walk(r, move, jump);
  r.body.setNextKinematicTranslation(next);
  world.step();
  return next;
}

test('the Bund asphalt is below the adjacent building-side sidewalk', () => {
  const world = new rapier.World({ x: 0, y: -9.81, z: 0 });
  try {
    createGround({ world, rapier }, data);
    world.step();
    const height = (x, z) => {
      const hit = world.castRay(new rapier.Ray({ x, y: 3, z }, { x: 0, y: -1, z: 0 }), 4, true);
      assert(hit, `Missing ground at ${x}, ${z}`);
      return 3 - hit.timeOfImpact;
    };
    const asphalt = height(-400, 37), sidewalk = height(-410, 37);
    assert(Math.abs(sidewalk - asphalt - 0.15) < 0.01,
      `Sidewalk must be 15 cm above asphalt: sidewalk=${sidewalk}, asphalt=${asphalt}`);
    const r = createWalker({ world, rapier });
    for (const speed of [1.9, 4, 12]) {
      const start = { x: -410, y: sidewalk + .88, z: 37 };
      r.body.setTranslation(start, true);
      r.body.setNextKinematicTranslation(start);
      r.velocity = 0;
      world.step();
      for (let i = 0; i < 20; i++) step(world, r);
      for (let i = 0; i < Math.ceil(8 / speed * 60); i++) step(world, r, [speed / 60, 0, 0]);
      assert(r.body.translation().x > -403, `Cannot descend to asphalt at ${speed} m/s`);
      assert(Math.abs(r.body.translation().y - asphalt - .855) < .04);
      for (let i = 0; i < Math.ceil(8 / speed * 60); i++) step(world, r, [-speed / 60, 0, 0]);
      assert(Math.abs(r.body.translation().x + 410) < .3, `Cannot return to sidewalk at ${speed} m/s`);
      assert(Math.abs(r.body.translation().y - sidewalk - .855) < .04);
    }
  } finally {
    world.free();
  }
});

test('actual Pudong ground supports an idle player without sinking', () => {
  const world = new rapier.World({ x: 0, y: -9.81, z: 0 });
  try {
    createGround({ world, rapier }, data);
    const r = createWalker({ world, rapier });
    r.body.setTranslation({ x: 357, y: 0.88, z: -95 }, true);
    r.body.setNextKinematicTranslation({ x: 357, y: 0.88, z: -95 });
    world.step();
    for (let i = 0; i < 300; i++) step(world, r);
    assert(r.body.translation().y > 0.84, JSON.stringify(r.body.translation()));
  } finally {
    world.free();
  }
});

test('curbs work at walking / running speeds in both directions, and jumping lands', () => {
  for (const speed of [1.9, 4, 12])
    for (const angle of [0, 0.2, -0.3]) {
      const world = new rapier.World({ x: 0, y: -9.81, z: 0 });
      try {
        createGround(
          { world, rapier },
          {
            ...data,
            colliders: [],
            parkHulls: [],
            sidewalkHulls: [],
            surfaces: [{ position: [5, 0.225, 0], half: [5, 0.225, 12], yaw: 0 }],
            bounds: [-100, -100, 100, 100],
          },
        );
        const r = createWalker({ world, rapier });
        r.body.setTranslation({ x: -2, y: 0.88, z: 0 }, true);
        r.body.setNextKinematicTranslation({ x: -2, y: 0.88, z: 0 });
        world.step();
        for (let i = 0; i < Math.ceil((5 / speed) * 60); i++)
          step(world, r, [(speed / 60) * Math.cos(angle), 0, (speed / 60) * Math.sin(angle)]);
        assert(
          r.body.translation().x > 2,
          `stuck on curb at ${speed}, ${angle}: ${JSON.stringify(r.body.translation())}`,
        );
        assert(r.body.translation().y > 1.28);
        const floor = r.body.translation().y;
        let peak = floor;
        for (let i = 0; i < 100; i++) peak = Math.max(peak, step(world, r, [0, 0, 0], i === 0).y);
        assert(peak > floor + 1, 'Space must lift the capsule');
        assert(Math.abs(r.body.translation().y - floor) < 0.04, 'Jump must land on the raised surface');
        for (let i = 0; i < Math.ceil((6 / speed) * 60); i++) step(world, r, [-speed / 60, 0, 0]);
        assert(r.body.translation().x < -2);
        assert(Math.abs(r.body.translation().y - 0.855) < 0.03, 'Must descend to the lower ground');
      } finally {
        world.free();
      }
    }
});

test('car body blocks fast walkers from the side; a high wall and a low ceiling cannot be stepped through', () => {
  const world = new rapier.World({ x: 0, y: -9.81, z: 0 });
  try {
    createGround({ world, rapier }, { ...data, colliders: [], surfaces: [], parkHulls: [], sidewalkHulls: [] });
    const car = createCar({ world, rapier }, { position: [0, 0, 0], yaw: 0, scale: [1, 1, 1] });
    const r = createWalker({ world, rapier });
    r.body.setTranslation({ x: 0, y: 0.88, z: 4 }, true);
    r.body.setNextKinematicTranslation({ x: 0, y: 0.88, z: 4 });
    world.step();
    for (let i = 0; i < 120; i++) step(world, r, [0, 0, -12 / 60]);
    assert(r.body.translation().z > 1.3, 'Cannot pass through the side of a car');
    world.removeRigidBody(car);
    world.createCollider(rapier.ColliderDesc.cuboid(0.5, 2, 10).setTranslation(0, 2, 0));
    r.body.setTranslation({ x: -2, y: 0.88, z: 0 }, true);
    r.body.setNextKinematicTranslation({ x: -2, y: 0.88, z: 0 });
    world.step();
    for (let i = 0; i < 120; i++) step(world, r, [12 / 60, 0, 0], i === 5);
    assert(r.body.translation().x < -0.8, 'Jumping must not tunnel through a wall');
    world.createCollider(rapier.ColliderDesc.cuboid(5, 0.1, 5).setTranslation(-5, 1.95, 0));
    let peak = 0;
    for (let i = 0; i < 100; i++) peak = Math.max(peak, step(world, r, [0, 0, 0], i === 0).y);
    assert(peak < 1.06, 'Jump must respect head clearance');
  } finally {
    world.free();
  }
});

test('jumping toward water is blocked while an elevated bridge remains traversable', () => {
  const world = new rapier.World({ x: 0, y: -9.81, z: 0 });
  try {
    const wet = {
      ...data,
      colliders: [],
      surfaces: [],
      parkHulls: [],
      sidewalkHulls: [],
      bounds: [-100, -100, 100, 100],
      water: [
        [
          [0, -20],
          [20, -20],
          [0, 20],
        ],
      ],
    };
    createGround({ world, rapier }, wet);
    const r = createWalker({ world, rapier });
    world.step();
    assert(
      !canOccupy(r, wet, { x: 1, y: 4, z: 0 }),
      'An airborne player still needs a dry landing',
    );
    world.createCollider(rapier.ColliderDesc.cuboid(4, 0.2, 4).setTranslation(1, 3, 0));
    world.step();
    assert(canOccupy(r, wet, { x: 1, y: 4, z: 0 }), 'Bridge decking over water is safe');
    assert(!canOccupy(r, wet, { x: 101, y: 4, z: 0 }));
  } finally {
    world.free();
  }
});

test('jump remains available beside the actual overlapping promenade sections and rail', () => {
  const world = new rapier.World({ x: 0, y: -9.81, z: 0 });
  try {
    createGround({ world, rapier }, data);
    const r = createWalker({ world, rapier });
    const start = { x: -374.03, y: 1.78, z: 37.14 };
    r.body.setTranslation(start, true);
    r.body.setNextKinematicTranslation(start);
    world.step();
    for (let i = 0; i < 30; i++) step(world, r);
    const floor = r.body.translation().y;
    let peak = floor;
    for (let i = 0; i < 100; i++) peak = Math.max(peak, step(world, r, [0, 0, 0], i === 0).y);
    assert(peak > floor + 1, `Jump beside rail: floor=${floor}, peak=${peak}`);
  } finally {
    world.free();
  }
});
