import { KartConfig as C, angleDelta, type KartInput } from './KartConfig.ts';
import { createKart, driveKart, resolveKartBarriers } from './KartPhysics.ts';
import { createTrack, pointAt, projectOnTrack, wrapDistance } from './TrackGenerator.ts';
import { createProgress, advanceCheckpoint } from './CheckpointSystem.ts';
import { updateLap } from './LapSystem.ts';
import { ranking } from './RankingSystem.ts';
import { aiInput } from './KartAI.ts';

export class RaceManager {
  track = createTrack();
  phase: 'ready' | 'countdown' | 'racing' | 'paused' | 'finished' = 'ready';
  resumePhase: 'countdown' | 'racing' = 'racing';
  countdown = 3;
  time = 0;
  boosts = 0;
  collisions = 0;
  resets = 0;
  drivers = [0, 1, 2, 3].map((i) => {
    const s = -6 - Math.floor(i / 2) * 4;
    const p = pointAt(this.track, s),
      side = i % 2 ? -2 : 2;
    const kart = createKart(
      p.x + Math.cos(p.heading) * side,
      p.z - Math.sin(p.heading) * side,
      p.heading,
    );
    const progress = createProgress(wrapDistance(s, this.track.length));
    progress.distance = s;
    return {
      kart,
      progress,
      safe: { ...p, s: progress.s },
      shortcut: i === 3,
      stuck: 0,
      shortcutFailure: 0,
    };
  });
  start() {
    if (this.phase === 'ready') this.phase = 'countdown';
  }
  pause() {
    if (this.phase === 'racing' || this.phase === 'countdown') {
      this.resumePhase = this.phase;
      this.phase = 'paused';
    }
  }
  resume() {
    if (this.phase === 'paused') this.phase = this.resumePhase;
  }
  get order() {
    return ranking(this.drivers);
  }
  recover(i: number) {
    const d = this.drivers[i],
      k = d.kart;
    Object.assign(k, createKart(d.safe.x, d.safe.z, d.safe.heading));
    k.y = d.safe.y;
    k.speed = 8;
    k.recovery = 0.8;
    d.stuck = 0;
    if (i === 0) this.resets++;
  }
  step(input: KartInput, dt: number) {
    dt = Math.min(dt, 1 / 30);
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) this.phase = 'racing';
      return;
    }
    if (this.phase !== 'racing') return;
    this.time += dt;
    const contactTravel = [0, 0, 0, 0];
    // Resolve every circle contact before any checkpoint sees the new positions.
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < i; j++) {
        if (this.drivers[i].progress.finishedAt || this.drivers[j].progress.finishedAt) continue;
        const a = this.drivers[i].kart,
          b = this.drivers[j].kart,
          dx = a.x - b.x,
          dz = a.z - b.z,
          distance = Math.hypot(dx, dz);
        if (distance < 1.65 && distance > 0.001 && Math.abs(a.y - b.y) < 1.5) {
          const push = (1.65 - distance) * 0.5;
          a.x += (dx / distance) * push;
          a.z += (dz / distance) * push;
          b.x -= (dx / distance) * push;
          b.z -= (dz / distance) * push;
          a.speed *= 0.99;
          b.speed *= 0.99;
          contactTravel[i] += push;
          contactTravel[j] += push;
        }
      }
    for (let i = 0; i < 4; i++) {
      const d = this.drivers[i],
        k = d.kart;
      if (d.progress.finishedAt) continue;
      const previousProgress = d.progress.distance;
      if (d.shortcutFailure > 0) {
        d.shortcutFailure -= dt;
        if (d.shortcutFailure <= 0) {
          const s = this.track.shortcutStart + 12,
            p = pointAt(this.track, s);
          d.progress.distance -= Math.max(0, d.progress.s - s);
          d.progress.s = s;
          d.safe = { ...p, s };
          d.shortcut = false;
          this.recover(i);
        }
        continue;
      }
      const oldBoost = k.boost,
        oldCollision = k.collision;
      const controls = i === 0 ? input : aiInput(k, this.track, d.shortcut, d.progress.s);
      const oldRoad = projectOnTrack(this.track, k.x, k.z, d.progress.s);
      driveKart(k, controls, dt);
      const hit = resolveKartBarriers(k, this.track.barriers);
      const road = projectOnTrack(this.track, k.x, k.z, d.progress.s);
      k.offRoad = Math.max(0, road.distance - road.width / 2 + 0.4);
      if (k.offRoad > 0) k.speed *= Math.exp(-1.2 * dt);
      const wall = road.width / 2 + 1.2;
      if (
        hit?.branch === 'shortcut' &&
        road.s > this.track.shortcutStart + 18 &&
        road.s < this.track.shortcutEnd - 18
      ) {
        d.shortcutFailure = C.recoverySeconds;
        k.speed = 0;
      }
      if (!k.airborne && oldRoad.y - road.y > 0.018 && k.speed > 22 && oldRoad.y > 1.6) {
        k.airborne = true;
        k.verticalSpeed = 1.8;
      }
      if (k.airborne) {
        k.verticalSpeed -= C.gravity * dt;
        k.y += k.verticalSpeed * dt;
        if (k.y <= road.y) {
          k.y = road.y;
          k.airborne = false;
          k.verticalSpeed = 0;
        }
      } else k.y = road.y;
      const ratio =
        road.branch === 'shortcut' ||
        (d.progress.s >= this.track.shortcutStart && d.progress.s <= this.track.shortcutEnd)
          ? (this.track.shortcutEnd - this.track.shortcutStart) / this.track.shortcutLength
          : 1;
      const legal = road.distance < road.width / 2 + 1.3;
      // Both ribbons overlap at a fork; their projected distances can differ by a few metres.
      const junction =
        Math.min(
          Math.abs(d.progress.s - this.track.shortcutStart),
          Math.abs(d.progress.s - this.track.shortcutEnd),
        ) < 7
          ? 4
          : 0;
      // The centreline advances faster than a kart cutting the inside of a tight bend.
      const crossed = advanceCheckpoint(
        d.progress,
        this.track,
        road.s,
        (k.speed * dt + contactTravel[i]) * Math.max(3, ratio) + 1 + junction,
        legal,
      );
      const finished = updateLap(d.progress, crossed, this.time);
      if (crossed) d.shortcut = i === 3;
      if (
        legal &&
        Math.abs(angleDelta(k.heading, road.heading)) < 1.2 &&
        Math.abs(d.progress.s - road.s) < 1
      ) {
        d.safe = { x: road.x, z: road.z, y: road.y, heading: road.heading, s: road.s };
      }
      k.recovery = Math.max(0, k.recovery - dt);
      const stalledProgress =
        k.speed > 4 && !controls.brake && Math.abs(d.progress.distance - previousProgress) < 0.001;
      d.stuck =
        road.distance > wall + 5 ||
        (!controls.brake && k.speed < 3) ||
        stalledProgress ||
        Math.abs(angleDelta(k.heading, road.heading)) > 2.2
          ? d.stuck + dt
          : 0;
      if (d.stuck > C.recoverySeconds) this.recover(i);
      if (i === 0) {
        if (k.boost > oldBoost) this.boosts++;
        if (k.collision > oldCollision && oldCollision <= 0) this.collisions++;
        if (finished) this.phase = 'finished';
      }
    }
  }
}
