import { gunDirection, muzzle } from './duel-actions.js';
import { DUEL_RULES as R } from './duel-map.js';
import { shellCollision, stepShell } from './duel-physics.js';
import { clamp, type Duel, type Gun, type Side, type Shell, type Point } from './duel-types.js';

export function previewTrajectory(duel: Duel, side: Side, gun: Gun, idlePower = 0.65) {
  const power = clamp(
    gun.charge === null ? idlePower : (duel.time - gun.charge) / R.chargeSeconds,
    0,
    1,
  );
  const direction = gunDirection(side, gun);
  const speed = R.minVelocity + (R.maxVelocity - R.minVelocity) * power;
  const shell: Shell = {
    id: -1,
    side,
    ammo: gun.ammo,
    power,
    age: 0,
    trail: [],
    position: muzzle(side, gun),
    velocity: { x: direction.x * speed, y: direction.y * speed, z: direction.z * speed },
  };
  const points: Point[] = [{ ...shell.position }];
  for (let i = 0; i < 720; i++) {
    const before = { ...shell.position };
    stepShell(shell, R.step);
    const collision = shellCollision(duel, shell, before);
    if (collision) {
      points.push(collision.position);
      return { points, power, impact: collision.position, hit: collision.hit };
    }
    if (i % 6 === 5) points.push({ ...shell.position });
    if (Math.abs(shell.position.x) >= 220 || Math.abs(shell.position.z) >= 130) break;
  }
  return { points, power, impact: null, hit: '' };
}
