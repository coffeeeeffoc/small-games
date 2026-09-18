import type { TrackOptions } from './WorldDefinition.ts';
import { createItems, collectItems, type RoadItem } from './RoadItems.ts';
import { KartConfig as C, angleDelta, type KartInput } from './KartConfig.ts';
import { createKart, driveKart, resolveKartBarriers } from './KartPhysics.ts';
import { createTrack, pointAt, projectOnTrack, wrapDistance } from './TrackGenerator.ts';
import { createProgress, advanceCheckpoint } from './CheckpointSystem.ts';
import { updateLap } from './LapSystem.ts';
import { ranking } from './RankingSystem.ts';
import { aiInput } from './KartAI.ts';

export class RaceManager {
  track: ReturnType<typeof createTrack>;
  items: RoadItem[] = [];
  itemsCollected = 0;
  loaded = true;
  loadError = '';
  constructor(options: TrackOptions = {}, seed?: number) {
    this.track = createTrack(options);
    this.drivers = this.makeDrivers();
    if (seed !== undefined) this.items = createItems(this.track, seed);
  }
  phase: 'ready' | 'countdown' | 'racing' | 'paused' | 'finished' = 'ready';
  resumePhase: 'countdown' | 'racing' = 'racing';
  countdown = 3;
  time = 0;
  boosts = 0;
  collisions = 0;
  resets = 0;
  drivers: ReturnType<RaceManager['makeDrivers']>;
  makeDrivers() {
    return [0, 1, 2, 3].map((i) => {
      const s = -6 - Math.floor(i / 2) * 4;
      const p = pointAt(this.track, s),
        side = i % 2 ? -2 : 2;
      const kart = createKart(
        p.x + Math.cos(p.heading) * side,
        p.z - Math.sin(p.heading) * side,
        p.heading,
      );
      kart.y = p.y;
      const progress = createProgress(wrapDistance(s, this.track.length));
      progress.distance = s;
      return {
        kart,
        progress,
        safe: { ...p, s: progress.s },
        shortcut: i === 3 && this.track.shortcut.length > 1,
        stuck: 0,
        shortcutFailure: 0,
      };
    });
  }
  start() {
    if (this.phase === 'ready' && this.loaded && !this.loadError) this.phase = 'countdown';
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
  get currentLapTime() {
    const p = this.drivers[0].progress;
    return p.finishedAt
      ? p.lapTimes[p.lapTimes.length - 1] || 0
      : Math.max(0, this.time - p.lapStarted);
  }
  get bestLapTime() {
    const times = this.drivers[0].progress.lapTimes;
    return times.length ? Math.min(...times) : 0;
  }
  recover(i: number) {
    const d = this.drivers[i],
      k = d.kart;
    if (d.progress.finishedAt) return;
    const retreat =
      wrapDistance(d.progress.s - d.safe.s + this.track.length / 2, this.track.length) -
      this.track.length / 2;
    d.progress.distance -= Math.max(0, retreat);
    d.progress.s = d.safe.s;
    Object.assign(k, createKart(d.safe.x, d.safe.z, d.safe.heading));
    k.y = d.safe.y;
    k.speed = 8;
    k.recovery = 0.8;
    d.stuck = 0;
    if (i === 0) this.resets++;
  }
  step(input: KartInput, dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
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
      // Physical road contact must not be constrained by checkpoint progress at a fork.
      const oldRoad = projectOnTrack(this.track, k.x, k.z);
      const previousPosition = { x: k.x, z: k.z };
      driveKart(k, controls, dt);
      const hit = resolveKartBarriers(k, this.track.barriers);
      const collected = collectItems(this.items, k, previousPosition, this.time);
      if (i === 0) this.itemsCollected += collected;
      const road = projectOnTrack(this.track, k.x, k.z);
      k.offRoad = Math.max(0, road.distance - road.width / 2 + 0.4);
      if (k.offRoad > 0) k.speed *= Math.exp(-1.2 * dt);
      const wall = road.width / 2 + 1.2;
      if (
        i !== 0 &&
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
      // A slide across a tight bend must not jump to a distant section's checkpoint.
      const progressRoad = projectOnTrack(this.track, k.x, k.z, d.progress.s);
      const ratio =
        road.branch === 'shortcut' ||
        (d.progress.s >= this.track.shortcutStart && d.progress.s <= this.track.shortcutEnd)
          ? (this.track.shortcutEnd - this.track.shortcutStart) / this.track.shortcutLength
          : 1;
      const legal = progressRoad.distance < progressRoad.width / 2 + 1.3;
      // Both ribbons overlap at a fork; their projected distances can differ by a few metres.
      const junction =
        Math.min(
          Math.abs(d.progress.s - this.track.shortcutStart),
          Math.abs(d.progress.s - this.track.shortcutEnd),
        ) < 7
          ? 4
          : 0;
      // The centreline advances faster than a kart cutting the inside of a tight bend.
      const previousS = d.progress.s;
      const crossed = advanceCheckpoint(
        d.progress,
        this.track,
        progressRoad.s,
        (k.speed * dt + contactTravel[i]) * Math.max(3, ratio) + 1 + junction,
        legal,
      );
      // Resolve the crossing within the frame so a close finish is not decided by driver index.
      const crossingTime = crossed
        ? this.time -
          dt +
          (dt * wrapDistance(-previousS, this.track.length)) /
            wrapDistance(progressRoad.s - previousS, this.track.length)
        : this.time;
      const finished = updateLap(d.progress, crossed, crossingTime);
      if (crossed) d.shortcut = i === 3 && this.track.shortcut.length > 1;
      if (
        legal &&
        d.shortcutFailure <= 0 &&
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
        (i !== 0 &&
          ((!controls.brake && k.speed < 3) ||
            stalledProgress ||
            Math.abs(angleDelta(k.heading, road.heading)) > 2.2))
          ? d.stuck + dt
          : 0;
      if (d.stuck > C.recoverySeconds) this.recover(i);
      if (i === 0) {
        if (k.boost > oldBoost) this.boosts++;
        if (k.collision > oldCollision && oldCollision <= 0) this.collisions++;
        if (finished) this.phase = 'finished';
      }
    }
    if (this.phase === 'finished') this.time = this.drivers[0].progress.finishedAt;
  }
}
