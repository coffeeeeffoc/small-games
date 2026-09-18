import assert from 'node:assert/strict';
import test from 'node:test';
import { createBarriers, roadDistance } from '../assets/scripts/TrackBarriers.ts';
import { RaceManager } from '../assets/scripts/RaceManager.ts';
import { pointAt, createTrack, projectOnTrack } from '../assets/scripts/TrackGenerator.ts';
import {
  createKart,
  driveKart,
  resolveKartBarriers,
  barrierOverlap,
} from '../assets/scripts/KartPhysics.ts';

test('the whole kart, including a sideways nose, stays inside the visible barrier', () => {
  for (const side of [-1, 1])
    for (const angle of [0, Math.PI / 2]) {
      const race = new RaceManager(),
        d = race.drivers[0],
        p = pointAt(race.track, 50);
      race.phase = 'racing';
      race.drivers.slice(1).forEach((rival) => {
        rival.progress.finishedAt = 1;
      });
      Object.assign(
        d.kart,
        createKart(
          p.x + Math.cos(p.heading) * side * 7.7,
          p.z - Math.sin(p.heading) * side * 7.7,
          p.heading + angle,
        ),
      );
      d.progress.s = d.progress.distance = 50;
      race.step({ steer: 0, throttle: 0, brake: true, drift: false }, 1 / 60);
      const road = projectOnTrack(race.track, d.kart.x, d.kart.z, d.progress.s);
      const extent = Math.abs(Math.cos(angle)) * 1.12 + Math.abs(Math.sin(angle)) * 1.65;
      assert.ok(road.distance + extent < race.track.width / 2 + 1.4 - 0.275 + 0.05);
    }
});

test('fork barriers do not occupy the other road or its shoulder', () => {
  const track = createTrack();
  const barriers = createBarriers(track.main, track.shortcut, track.width, track.shortcutWidth);
  for (const b of barriers) {
    const other = b.branch === 'main' ? track.shortcut : track.main;
    const width = b.branch === 'main' ? track.shortcutWidth : track.width;
    for (const along of [-b.halfLength, 0, b.halfLength])
      for (const side of [-b.halfWidth, b.halfWidth]) {
        const x = b.x + Math.sin(b.heading) * along + Math.cos(b.heading) * side;
        const z = b.z + Math.cos(b.heading) * along - Math.sin(b.heading) * side;
        assert.ok(
          roadDistance(track.main, x, z) >= track.width / 2,
          'guardrail enters main asphalt',
        );
        assert.ok(
          roadDistance(track.shortcut, x, z) >= track.shortcutWidth / 2,
          'guardrail enters shortcut asphalt',
        );
        assert.ok(
          roadDistance(other, x, z) >= width / 2 + 1.6,
          `barrier blocks ${b.branch} fork at ${x},${z}`,
        );
      }
  }
});

test('boost-speed impacts cannot leave the kart embedded in straight or curved rails', () => {
  const track = createTrack();
  for (let i = 0; i < track.barriers.length; i += 7) {
    const b = track.barriers[i],
      road = projectOnTrack(track, b.x, b.z);
    const heading = Math.atan2(b.x - road.x, b.z - road.z);
    const kart = createKart(b.x - Math.sin(heading) * 3, b.z - Math.cos(heading) * 3, heading);
    kart.y = b.y;
    kart.speed = 40;
    for (let frame = 0; frame < 20; frame++) {
      driveKart(kart, { steer: 0, throttle: 1, brake: false, drift: false }, 1 / 30);
      resolveKartBarriers(kart, track.barriers);
      const penetration = Math.max(
        0,
        ...track.barriers.map((wall) => barrierOverlap(kart, wall)?.depth ?? 0),
      );
      assert.ok(penetration < 0.01, `rail ${i}, frame ${frame}: penetrated ${penetration}m`);
    }
  }
});
