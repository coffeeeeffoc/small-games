import { command, activeGun, available, selectable, muzzle } from './duel-actions.js';
import { DUEL_RULES as R } from './duel-map.js';
import { clamp, direction, type Duel, type Side } from './duel-types.js';
export class DuelBot {
  private nextAction = 2.3;
  private shot = 0;
  private desiredPower = 0.6;
  private targetX = 0;
  constructor(readonly side: Side) {}
  tick(duel: Duel) {
    if (duel.result) return;
    const p = duel.fighters[this.side],
      enemy = duel.fighters[this.side === 0 ? 1 : 0],
      g = activeGun(p);
    if (p.hp <= 0 || p.route.length || p.healing !== null) return;
    if (g?.charge !== null && g?.charge !== undefined) {
      if (duel.time - g.charge >= this.desiredPower * R.chargeSeconds) {
        command(duel, this.side, { type: 'fire' });
        this.nextAction = duel.time + 1.1;
      }
      return;
    }
    if (duel.time < this.nextAction) return;
    this.nextAction = duel.time + 0.7;
    if (p.hp < 38 && p.medicines > 0 && p.node !== 'shelter') {
      command(duel, this.side, { type: 'retreat' });
      return;
    }
    if (p.node === 'shelter') {
      if (p.hp < 65 && p.medicines) command(duel, this.side, { type: 'heal' });
      else {
        const gun =
          p.guns.find((gun) => available(p, gun)) ?? p.guns.find((gun) => selectable(p, gun));
        if (gun) command(duel, this.side, { type: 'station', id: gun.id });
      }
      return;
    }
    if (!g || g.hp <= 0 || g.reload < 1) return;
    if (
      duel.shells.some(
        (s) =>
          s.side !== this.side && Math.abs(s.position.x - p.position.x) < 14 && s.position.y < 10,
      )
    ) {
      command(duel, this.side, { type: 'crouch', down: true });
      this.nextAction = duel.time + 0.8;
      return;
    }
    command(duel, this.side, { type: 'crouch', down: false });
    // Estimate only the public current battlefield. Bounded errors narrow after observed misses.
    const target =
      this.shot % 4 === 3 && !enemy.destroyed
        ? (duel.structures.find((s) => s.side === enemy.side && s.hp > 0)?.position ??
          enemy.position)
        : enemy.position;
    const origin = muzzle(this.side, g),
      dx = Math.abs(target.x - origin.x),
      dz = target.z - origin.z;
    const error = Math.sin(this.shot * 2.4 + this.side) * Math.max(0.7, 4 - this.shot * 0.45);
    const pitch = g.bunker ? 34 : 38;
    const angle = (pitch * Math.PI) / 180;
    const dy = target.y + 0.9 - origin.y;
    const speed = Math.sqrt(
      (R.gravity * (dx + error) ** 2) /
        Math.max(1, 2 * Math.cos(angle) ** 2 * ((dx + error) * Math.tan(angle) - dy)),
    );
    let power = (speed - R.minVelocity) / (R.maxVelocity - R.minVelocity);
    if (p.lastShot?.impact && Math.abs(target.x - this.targetX) < 6)
      power += clamp((direction(this.side) * (target.x - p.lastShot.impact.x)) / 350, -0.08, 0.08);
    this.targetX = target.x;
    this.desiredPower = clamp(power, 0.15, 0.96);
    this.shot++;
    command(duel, this.side, {
      type: 'aim',
      pitch,
      yaw: (-direction(this.side) * Math.atan2(dz + error * 0.3, dx) * 180) / Math.PI,
    });
    command(duel, this.side, { type: 'ammo', ammo: this.shot % 4 === 0 ? 'solid' : 'blast' });
    command(duel, this.side, { type: 'charge' });
  }
}
