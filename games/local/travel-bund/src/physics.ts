import type { useRapier } from '@react-three/rapier';
import { onWater, type WorldData, type V3, type Placement } from './world.ts';

type Physics = Pick<ReturnType<typeof useRapier>, 'world' | 'rapier'>;
export function createGround({ world, rapier }: Physics, data: WorldData) {
  const fixed = world.createRigidBody(rapier.RigidBodyDesc.fixed());
  for (const b of [...data.colliders, ...data.surfaces]) {
    world.createCollider(
      rapier.ColliderDesc.cuboid(...b.half)
        .setTranslation(...b.position)
        .setRotation({ x: 0, y: Math.sin(b.yaw / 2), z: 0, w: Math.cos(b.yaw / 2) }),
      fixed,
    );
  }
  for (const points of data.parkHulls) {
    const hull = rapier.ColliderDesc.convexHull(new Float32Array(points.flat()));
    if (hull) world.createCollider(hull, fixed);
  }
  // An analytic plane avoids convex sweep precision loss on a kilometer-wide cuboid.
  world.createCollider(new rapier.ColliderDesc(new rapier.HalfSpace({ x: 0, y: 1, z: 0 })), fixed);
  return fixed;
}
export function createWalker({ world, rapier }: Physics) {
  const body = world.createRigidBody(
    rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 10, 0),
  );
  const collider = world.createCollider(rapier.ColliderDesc.capsule(0.53, 0.3), body);
  const controller = world.createCharacterController(0.025);
  controller.disableAutostep();
  controller.enableSnapToGround(0.7);
  controller.setMaxSlopeClimbAngle(Math.PI / 4);
  return { world, rapier, body, collider, controller, ground: false, velocity: 0, speed: 0 };
}
export function walk(r: ReturnType<typeof createWalker>, move: V3, jump: boolean, dt = 1 / 60) {
  if (jump && r.ground) {
    r.velocity = 5.6;
    r.ground = false;
  }
  const wasGrounded = r.ground;
  r.velocity = Math.max(-30, r.velocity - 9.81 * dt);
  if (r.velocity > 0) r.controller.disableSnapToGround();
  else r.controller.enableSnapToGround(0.7);
  r.controller.computeColliderMovement(
    r.collider,
    { x: move[0], y: r.velocity * dt, z: move[2] },
    undefined,
    undefined,
    (c) => c.handle !== r.collider.handle,
  );
  const corrected = r.controller.computedMovement(),
    p = r.body.translation();
  r.ground = r.controller.computedGrounded();
  const intended = Math.hypot(move[0], move[2]);
  if (
    wasGrounded &&
    r.velocity <= 0 &&
    intended > 0.001 &&
    Math.hypot(corrected.x, corrected.z) < intended * 0.8
  ) {
    const cast = (at: typeof p, velocity: typeof p, distance: number) =>
      r.world.castShape(
        at,
        { x: 0, y: 0, z: 0, w: 1 },
        velocity,
        r.collider.shape,
        0.025,
        distance,
        false,
        undefined,
        undefined,
        r.collider,
        r.body,
      );
    const up = cast(p, { x: 0, y: 1, z: 0 }, 0.65);
    const rise = Math.min(0.65, up ? up.time_of_impact : 0.65);
    const raised = { x: p.x, y: p.y + rise, z: p.z };
    const across = cast(raised, { x: move[0], y: 0, z: move[2] }, 1);
    if (rise > 0.02 && !across) {
      const target = { x: raised.x + move[0], y: raised.y, z: raised.z + move[2] };
      const down = cast(target, { x: 0, y: -1, z: 0 }, rise);
      if (down && down.normal1.y > 0.05 && rise - down.time_of_impact > 0.01) {
        r.ground = true;
        r.velocity = 0;
        return { x: target.x, y: target.y - down.time_of_impact, z: target.z };
      }
    }
  }
  if (r.ground || (r.velocity > 0 && corrected.y < r.velocity * dt - 0.001)) r.velocity = 0;
  return { x: p.x + corrected.x, y: p.y + corrected.y, z: p.z + corrected.z };
}

export function createCar({ world, rapier }: Physics, p: Placement) {
  const body = world.createRigidBody(
    rapier.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(...p.position)
      .setRotation({ x: 0, y: Math.sin(p.yaw / 2), z: 0, w: Math.cos(p.yaw / 2) }),
  );
  world.createCollider(
    rapier.ColliderDesc.cuboid(2.32, 0.48, 1.04).setTranslation(0, 0.49, 0),
    body,
  );
  world.createCollider(
    rapier.ColliderDesc.cuboid(1.25, 0.26, 0.8).setTranslation(-0.15, 1.24, 0),
    body,
  );
  return body;
}

// Check the landing surface while airborne too: jumping over a rail must not strand the player in water.
export function canOccupy(
  r: ReturnType<typeof createWalker>,
  data: WorldData,
  p: { x: number; y: number; z: number },
) {
  if (
    p.x < data.bounds[0] + 1 ||
    p.x > data.bounds[2] - 1 ||
    p.z < data.bounds[1] + 1 ||
    p.z > data.bounds[3] - 1
  )
    return false;
  if (!onWater(p.x, p.z, data.water)) return true;
  const top = p.y + 0.83;
  const hit = r.world.castRay(
    new r.rapier.Ray({ x: p.x, y: top, z: p.z }, { x: 0, y: -1, z: 0 }),
    Math.max(1, top + 1),
    true,
    undefined,
    undefined,
    r.collider,
    r.body,
  );
  return !!hit && top - hit.timeOfImpact >= 0.7;
}
