import { DUEL_RULES as R, nodePoint, routeBetween } from './duel-map.js';
import {
  clamp,
  direction,
  distance,
  type Command,
  type Duel,
  type Fighter,
  type Gun,
  type Side,
} from './duel-types.js';
export const activeGun = (p: Fighter) => p.guns.find((g) => g.id === p.station);
export const available = (p: Fighter, g: Gun) => g.hp > 0 && g.bunker === p.destroyed;
export const selectable = (p: Fighter, g: Gun) => g.bunker === p.destroyed;
export function operatorPoint(p: Fighter, g: Gun) {
  return {
    x: g.position.x - direction(p.side) * 1.5,
    y: g.position.y,
    z: g.position.z + direction(p.side) * 1.4,
  };
}
export function cancelCharge(p: Fighter) {
  for (const g of p.guns) g.charge = null;
}
export function startHealing(p: Fighter) {
  if (
    !p.route.length &&
    p.node === 'shelter' &&
    p.hp > 0 &&
    p.hp < R.hp &&
    p.medicines > 0 &&
    p.healing === null
  ) {
    p.medicines--;
    p.healing = 0;
    p.station = null;
    cancelCharge(p);
  }
}
export function travel(p: Fighter, destination: string, heal = false) {
  cancelCharge(p);
  p.crouched = false;
  p.healing = null;
  p.healOnArrival = heal;
  // During a transfer return to its last reached waypoint before following another route.
  const anchor = nodePoint(p.side, p.node);
  p.route = distance(p.position, anchor) > 0.1 ? [anchor] : [];
  p.route.push(...routeBetween(p.side, p.node, destination));
  p.destination = destination;
  p.station = null;
  if (!p.route.length) arrive(p);
}
export function arrive(p: Fighter) {
  p.node = p.destination;
  const gun = p.guns.find((g) => g.node === p.node && selectable(p, g));
  if (gun?.hp === 0) gun.repair ??= 0;
  p.station = gun?.id ?? null;
  p.position = gun ? operatorPoint(p, gun) : nodePoint(p.side, p.node);
  if (p.healOnArrival) {
    p.healOnArrival = false;
    startHealing(p);
  }
}
export function command(duel: Duel, side: Side, c: Command) {
  if (duel.result) return;
  const p = duel.fighters[side],
    gun = activeGun(p);
  if (p.hp <= 0) return;
  p.lastInput = duel.time;
  switch (c.type) {
    case 'aim':
      if (
        gun &&
        available(p, gun) &&
        !p.route.length &&
        Number.isFinite(c.pitch) &&
        Number.isFinite(c.yaw)
      ) {
        gun.pitch = clamp(c.pitch, R.minPitch, R.maxPitch);
        const limit = gun.bunker ? R.bunkerYaw : R.maxYaw;
        gun.yaw = clamp(c.yaw, -limit, limit);
      }
      break;
    case 'ammo':
      if (gun && (c.ammo === 'solid' || c.ammo === 'blast')) gun.ammo = c.ammo;
      break;
    case 'charge':
      if (
        gun &&
        available(p, gun) &&
        gun.reload >= 1 &&
        gun.charge === null &&
        !p.crouched &&
        !p.route.length &&
        p.healing === null
      )
        gun.charge = duel.time;
      break;
    case 'fire':
      if (gun?.charge !== null && gun?.charge !== undefined) fire(duel, p, gun);
      break;
    case 'cancel':
      cancelCharge(p);
      p.crouched = false;
      break;
    case 'crouch':
      if (!p.route.length && gun && selectable(p, gun)) {
        cancelCharge(p);
        p.crouched = c.down === true;
      }
      break;
    case 'retreat':
      travel(p, 'shelter', true);
      break;
    case 'heal':
      startHealing(p);
      break;
    case 'station': {
      const next = p.guns.find((g) => g.id === c.id);
      if (next && selectable(p, next) && next.id !== p.station) travel(p, next.node);
      break;
    }
    case 'leave':
      duel.result = { winner: side === 0 ? 1 : 0, reason: 'leave' };
      break;
  }
}
export function gunDirection(side: Side, gun: Gun) {
  const pitch = (gun.pitch * Math.PI) / 180,
    yaw = (gun.yaw * Math.PI) / 180,
    d = direction(side);
  return {
    x: d * Math.cos(pitch) * Math.cos(yaw),
    y: Math.sin(pitch),
    z: -d * Math.cos(pitch) * Math.sin(yaw),
  };
}
export function muzzle(side: Side, gun: Gun) {
  const v = gunDirection(side, gun);
  return {
    x: gun.position.x + v.x * 3,
    y: gun.position.y + 2.05 + v.y * 3,
    z: gun.position.z + v.z * 3,
  };
}
function fire(duel: Duel, p: Fighter, gun: Gun) {
  const started = gun.charge!;
  gun.charge = null;
  if (!available(p, gun) || gun.reload < 1 || p.crouched || p.route.length || p.healing !== null)
    return;
  const power = clamp((duel.time - started) / R.chargeSeconds, 0, 1),
    vector = gunDirection(p.side, gun);
  const speed = R.minVelocity + (R.maxVelocity - R.minVelocity) * power,
    position = muzzle(p.side, gun);
  duel.shells.push({
    id: duel.nextId++,
    side: p.side,
    ammo: gun.ammo,
    position,
    velocity: { x: vector.x * speed, y: vector.y * speed, z: vector.z * speed },
    power,
    age: 0,
    trail: [{ ...position }],
  });
  gun.reload = 0;
  gun.firedAt = duel.time;
  p.lastShot = { pitch: gun.pitch, yaw: gun.yaw, power, impact: null, trail: [] };
}
