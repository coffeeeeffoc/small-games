import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createGround, createWalker, createCar, createVisitor, walk, canOccupy } from '../src/physics.ts';
import { localPoint, onWater, onRiver, bridgeRamps, TRAVEL_SPEED } from '../src/world.ts';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Raycaster, Vector3 } from 'three';

const require = createRequire(import.meta.url);
const rapier = createRequire(require.resolve('@react-three/rapier'))('@dimforge/rapier3d-compat');
await rapier.init();
const data = JSON.parse(
  readFileSync(
    new URL('../../../../assets/bund/runtime/world/world.json', import.meta.url),
    'utf8',
  ),
);
test('the actual bridge deck, collider and solid approaches join at the same height',async()=>{
  const bridge=data.props['garden-bridge'][0];
  const bytes=readFileSync(new URL('../../../../assets/bund/runtime/world/garden-bridge.glb',import.meta.url));
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  scene.position.set(...bridge.position);scene.rotation.y=bridge.yaw;scene.scale.set(...bridge.scale);scene.updateMatrixWorld(true);
  const hit=new Raycaster(new Vector3(bridge.position[0],20,bridge.position[2]),new Vector3(0,-1,0)).intersectObject(scene,true)[0];
  assert(hit);const deck=hit.point.y;
  const world=new rapier.World({x:0,y:-9.81,z:0});
  try {
    createGround({world,rapier},data);world.step();
    const physical=world.castRay(new rapier.Ray({x:bridge.position[0],y:20,z:bridge.position[2]},{x:0,y:-1,z:0}),30,true);
    assert(physical&&Math.abs(20-physical.timeOfImpact-deck)<.005);
    for(const ramp of bridgeRamps(data))assert(Math.abs(Math.max(...ramp.hull.map(p=>p[1]))-deck)<.005);
    const r=createWalker({world,rapier});
    for(const side of [-1,1]) {
      const start=localPoint(bridge,side*(14*bridge.scale[0]+25),0);
      const y=deck-(deck-.17)*25/26;
      r.body.setTranslation({x:start[0],y:y+.88,z:start[2]},true);
      r.body.setNextKinematicTranslation({x:start[0],y:y+.88,z:start[2]});r.velocity=0;world.step();
      for(let i=0;i<20;i++)step(world,r);
      for(let i=0;i<Math.ceil(30/TRAVEL_SPEED*60);i++)
        step(world,r,[-side*Math.cos(bridge.yaw)*TRAVEL_SPEED/60,0,side*Math.sin(bridge.yaw)*TRAVEL_SPEED/60]);
      assert(Math.abs(r.body.translation().y-deck-.855)<.06,`Approach ${side} cannot reach the visible bridge deck`);
      assert(canOccupy(r,data,r.body.translation()),'The supported deck above the river remains traversable');
    }
  } finally {world.free();}
});
function step(world, r, move = [0, 0, 0], jump = false) {
  const next = walk(r, move, jump);
  r.body.setNextKinematicTranslation(next);
  world.step();
  return next;
}

test('solid visitors stop default fast travel; moving/removing them moves/releases the obstacle', () => {
  const speed = TRAVEL_SPEED;
  const world = new rapier.World({ x: 0, y: -9.81, z: 0 });
  try {
    createGround({world, rapier}, {...data, colliders:[], surfaces:[], props:{}, parkHulls:[], sidewalkHulls:[]});
    const visitor = createVisitor({world, rapier}, [2, 0, 0]);
    const r = createWalker({world, rapier});
    r.body.setTranslation({x:0,y:.88,z:0},true);
    r.body.setNextKinematicTranslation({x:0,y:.88,z:0});
    world.step();
    for (let i=0;i<180;i++) step(world,r,[speed/60,0,0]);
    assert(r.body.translation().x > 1 && r.body.translation().x < 1.43, 'Capsules must stop before overlap');
    visitor.setNextKinematicTranslation({x:3,y:.83,z:0}); world.step();
    for (let i=0;i<180;i++) step(world,r,[speed/60,0,0]);
    assert(r.body.translation().x > 2 && r.body.translation().x < 2.43, 'The obstacle follows its visible visitor');
    world.removeRigidBody(visitor);
    for (let i=0;i<60;i++) step(world,r,[speed/60,0,0]);
    assert(r.body.translation().x > 3.5, 'Hidden/unloaded crowds must leave no ghost obstacle');
  } finally {world.free();}
});

test('the former land strip immediately outside the Bund railing is water and cannot be walked on', () => {
  const section = data.props['promenade-section'].reduce((a,b) => Math.hypot(a.position[0]+375,a.position[2]-37)<Math.hypot(b.position[0]+375,b.position[2]-37)?a:b);
  const outside=localPoint(section,0,-5), inside=localPoint(section,0,0);
  assert.equal(onWater(outside[0],outside[2],data.water),false, 'Exercise the original shoreline gap');
  assert.equal(onRiver(outside[0],outside[2],data),true);
  assert.equal(onRiver(inside[0],inside[2],data),false);
  const world = new rapier.World({x:0,y:-9.81,z:0});
  try {
    createGround({world,rapier},data); const r=createWalker({world,rapier}); world.step();
    assert.equal(canOccupy(r,data,{x:outside[0],y:4,z:outside[2]}),false,'Jumping cannot enter the water below the railing');
  } finally {world.free();}
});

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
    const speed = TRAVEL_SPEED;
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

test('curbs work during default fast travel in both directions, and jumping lands', () => {
  const speed = TRAVEL_SPEED;
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
      // The short run after leaving the curb must still allow time for its 45 cm fall.
      for (let i = 0; i < 30; i++) step(world, r);
      assert(Math.abs(r.body.translation().y - 0.855) < 0.03, 'Must descend to the lower ground');
    } finally {
      world.free();
    }
  }
});

test('default fast travel cannot tunnel through a thin wall, including at a rotated approach', () => {
  for (const yaw of [0, Math.PI / 4]) {
    const world = new rapier.World({ x: 0, y: -9.81, z: 0 });
    try {
      createGround({ world, rapier }, {
        ...data, colliders: [], surfaces: [], props: {}, parkHulls: [], sidewalkHulls: [],
      });
      world.createCollider(rapier.ColliderDesc.cuboid(.025, 2, 10)
        .setTranslation(0, 2, 0)
        .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }));
      const r = createWalker({ world, rapier });
      const start = { x: -2 * Math.cos(yaw), y: .88, z: 2 * Math.sin(yaw) };
      r.body.setTranslation(start, true);
      r.body.setNextKinematicTranslation(start);
      world.step();
      for (let i = 0; i < 120; i++)
        step(world, r, [TRAVEL_SPEED / 60 * Math.cos(yaw), 0, -TRAVEL_SPEED / 60 * Math.sin(yaw)], i === 5);
      const p = r.body.translation(), localX = p.x * Math.cos(yaw) - p.z * Math.sin(yaw);
      assert(localX > -.4 && localX < -.31, `Capsule crossed the 5 cm wall at ${yaw}: ${localX}`);
    } finally {
      world.free();
    }
  }
});

test('default fast travel and jumping stay inside the actual Bund quay railing', () => {
  const section = data.props['promenade-section'].reduce((a, b) =>
    Math.hypot(a.position[0] + 375, a.position[2] - 37) < Math.hypot(b.position[0] + 375, b.position[2] - 37) ? a : b);
  const world = new rapier.World({ x: 0, y: -9.81, z: 0 });
  try {
    createGround({ world, rapier }, data);
    const r = createWalker({ world, rapier });
    const inside = localPoint(section, 0, 0), start = { x: inside[0], y: 1.78, z: inside[2] };
    r.body.setTranslation(start, true);
    r.body.setNextKinematicTranslation(start);
    world.step();
    for (let i = 0; i < 30; i++) step(world, r);
    for (let i = 0; i < 180; i++) {
      const previous = r.body.translation();
      const next = walk(r, [-Math.sin(section.yaw) * TRAVEL_SPEED / 60, 0, -Math.cos(section.yaw) * TRAVEL_SPEED / 60], i === 20);
      if (!canOccupy(r, data, next)) { next.x = previous.x; next.z = previous.z; }
      r.body.setNextKinematicTranslation(next);
      world.step();
      assert(!onRiver(next.x, next.z, data), 'Fast travel or jumping crossed the quay into water');
    }
    const p = r.body.translation();
    const localZ = (p.x - section.position[0]) * Math.sin(section.yaw) + (p.z - section.position[2]) * Math.cos(section.yaw);
    assert(localZ < -2 && localZ > -4, `The capsule must reach and stop at the quay railing: ${localZ}`);
  } finally {
    world.free();
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
    for (let i = 0; i < 120; i++) step(world, r, [0, 0, -TRAVEL_SPEED / 60]);
    assert(r.body.translation().z > 1.3, 'Cannot pass through the side of a car');
    world.removeRigidBody(car);
    world.createCollider(rapier.ColliderDesc.cuboid(0.5, 2, 10).setTranslation(0, 2, 0));
    r.body.setTranslation({ x: -2, y: 0.88, z: 0 }, true);
    r.body.setNextKinematicTranslation({ x: -2, y: 0.88, z: 0 });
    world.step();
    for (let i = 0; i < 120; i++) step(world, r, [TRAVEL_SPEED / 60, 0, 0], i === 5);
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
