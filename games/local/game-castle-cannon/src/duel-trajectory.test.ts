import { describe, it, expect } from 'vitest';
import { command, gunDirection, muzzle } from './duel-actions.js';
import { DUEL_RULES as R } from './duel-map.js';
import { advanceShells } from './duel-physics.js';
import { createDuel } from './duel-simulation.js';
import { previewTrajectory } from './duel-trajectory.js';
describe('Creator preview uses authoritative shell physics', () => {
  it.each([0, 1] as const)('same first collision for side %s, all stations and powers', (side) => {
    for (const id of ['ground', 'wall', 'bunker'])
      for (const power of [0, 0.35, 0.65, 1]) {
        const duel = createDuel(),
          p = duel.fighters[side],
          g = p.guns.find((g) => g.id === id)!;
        p.station = id;
        p.destroyed = g.bunker;
        p.position = { x: g.position.x - 4, y: g.position.y, z: g.position.z };
        g.pitch = 38;
        g.yaw = 0;
        if (g.bunker) duel.structures.filter((s) => s.side === side).forEach((s) => (s.hp = 0));
        const before = JSON.stringify(duel),
          preview = previewTrajectory(duel, side, g, power);
        expect(JSON.stringify(duel)).toBe(before);
        expect(preview.points[0]).toEqual(muzzle(side, g));
        command(duel, side, { type: 'charge' });
        duel.time = power * R.chargeSeconds;
        command(duel, side, { type: 'fire' });
        for (let i = 0; i < 720 && duel.shells.length; i++) {
          duel.tick++;
          advanceShells(duel, R.step);
        }
        expect(duel.impacts[0]?.position ?? null).toEqual(preview.impact);
        expect(duel.impacts[0]?.hit ?? '').toBe(preview.hit);
      }
  });
  it('uses actual charging power and analytical gravity', () => {
    const d = createDuel(),
      g = d.fighters[0].guns[0];
    g.charge = 0;
    d.time = 0.9;
    const preview = previewTrajectory(d, 0, g);
    expect(preview.power).toBe(0.5);
    const start = muzzle(0, g),
      vector = gunDirection(0, g),
      speed = (R.minVelocity + R.maxVelocity) / 2,
      t = 6 * R.step;
    expect(preview.points[1].x).toBeCloseTo(start.x + vector.x * speed * t, 8);
    expect(preview.points[1].y).toBeCloseTo(
      start.y + vector.y * speed * t - (R.gravity * t * t) / 2,
      8,
    );
  });
});
