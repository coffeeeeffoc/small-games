import { Color, Graphics, view } from 'cc';
import { WEAPONS } from './core/Data';
import type { Point } from './core/Data';
import type { Simulation } from './core/Simulation';
import type { World } from './World';

type ScreenPoint = { x: number; y: number };
const TAU = Math.PI * 2;
const clamp = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Append after Graphics.clear(), before target/aim markers; preserves their Graphics styles.
 * Budget: 16 rounds, 24 impacts/kills, 8 attacks, 8 wrecks. At most 312 filled ellipses.
 * With <=96px lobe radii and an estimated <=128 vertices/ellipse, allow ~46k FX vertices
 * including fixed-segment strokes/ribbons (Creator's default tessellation; estimate, not measured).
 */
export function drawEffects(
  g: Graphics,
  s: Simulation,
  world: World,
  width: number,
  height: number,
  reduced = false,
): void {
  const fill = g.fillColor.clone(),
    stroke = g.strokeColor.clone(),
    lineWidth = g.lineWidth;
  const sx = view.getScaleX(),
    sy = view.getScaleY();
  const project = (p: Point, y = 0): ScreenPoint => {
    const q = world.project(p, y);
    return { x: q.x / sx - width / 2, y: q.y / sy - height / 2 };
  };
  // World uses an orthographic camera: one projected world unit scales all airborne billboards.
  const base = project({ x: 0, z: 0 }),
    axis = project({ x: 1, z: 0 });
  const scale = Math.hypot(axis.x - base.x, axis.y - base.y);
  const ink = new Color();
  const color = (heat: number, alpha: number, smoke = false): Color => {
    heat = clamp(heat);
    const gray = Math.round(60 + heat * 195);
    ink.set(
      world.thermal ? gray : smoke ? 72 + heat * 35 : 255,
      world.thermal ? gray : smoke ? 75 + heat * 32 : 95 + heat * 140,
      world.thermal ? gray : smoke ? 79 + heat * 28 : 25 + heat * 175,
      Math.round(clamp(alpha) * 255),
    );
    return ink;
  };
  const blob = (
    p: ScreenPoint,
    rx: number,
    ry: number,
    heat: number,
    alpha: number,
    smoke = false,
  ) => {
    if (alpha <= 0.005 || rx <= 0 || ry <= 0) return;
    // ponytail: cap billboard lobes at 96 UI pixels; subdivide them if giant close-up clouds are needed.
    rx = Math.min(96, rx);
    ry = Math.min(96, ry);
    if (Math.abs(p.x) > width / 2 + rx || Math.abs(p.y) > height / 2 + ry) return;
    g.fillColor = color(heat, alpha, smoke);
    g.ellipse(p.x, p.y, rx, ry);
    g.fill();
  };
  const line = (a: ScreenPoint, b: ScreenPoint, heat: number, alpha: number, weight: number) => {
    g.strokeColor = color(heat, alpha);
    g.lineWidth = weight;
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
  };
  const ring = (p: Point, radius: number, heat: number, alpha: number, dashed = false) => {
    if (alpha <= 0.005) return;
    const q = project(p),
      x = project({ x: p.x + radius, z: p.z });
    const z = project({ x: p.x, z: p.z + radius });
    g.strokeColor = color(heat, alpha);
    g.lineWidth = 1;
    // Project both ground axes, including temporary zoom; 24 segments also bound stroke geometry.
    for (let i = 0; i < (dashed ? 24 : 25); i++) {
      const a = (i * TAU) / 24;
      const px = q.x + Math.cos(a) * (x.x - q.x) + Math.sin(a) * (z.x - q.x);
      const py = q.y + Math.cos(a) * (x.y - q.y) + Math.sin(a) * (z.y - q.y);
      if (i === 0 || (dashed && i % 2 === 0)) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    if (!dashed) g.close();
    g.stroke();
  };

  // ponytail: inspect only the last 64 units, render at most 8 wrecks; raise the window for larger missions.
  let wrecks = 0;
  for (
    let i = s.units.length - 1, end = Math.max(0, s.units.length - 64);
    i >= end && wrecks < 8 && !reduced;
    i--
  ) {
    const u = s.units[i],
      age = s.time - u.deadAt;
    if (u.hp > 0 || u.deadAt < 0 || age < 0 || age >= 12) continue;
    wrecks++;
    const fade = (1 - age / 12) * Math.min(1, age * 2);
    for (let j = 2; j >= 0; j--) {
      const r = (0.65 + j * 0.3 + age * 0.035) * scale;
      const p = project(
        { x: u.x + age * 0.12 + Math.sin(u.id + j) * 0.3, z: u.z },
        0.8 + j * 0.85 + Math.min(age, 5) * 0.45,
      );
      blob(p, r, r * 1.2, 0.65 - age * 0.05, fade * 0.25, true);
    }
  }

  // Events are time-ordered and Simulation retains 64. Select the newest 24 explosions, draw oldest first.
  const end = Math.max(0, s.events.length - 64);
  let first = s.events.length,
    impacts = 0;
  for (let i = s.events.length - 1; i >= end; i--) {
    const e = s.events[i],
      age = s.time - e.time;
    if (age >= 2.2) break;
    first = i;
    if (age >= 0 && (e.type === 'impact' || e.type === 'kill') && ++impacts === 24) break;
  }
  let attacks = 0;
  for (let i = end; i < s.events.length; i++) {
    const e = s.events[i],
      age = s.time - e.time;
    if (age < 0) continue;
    if (e.type === 'attack') {
      if (age >= 0.3 || attacks++ >= 8) continue;
      const a = project(e, 1.1),
        b = project(s.rescue, 0.9),
        t = clamp(age / 0.12);
      line(a, b, 0.45, (1 - age / 0.3) * 0.55, 1);
      blob({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, 2, 2, 1, 1 - age / 0.3);
      continue;
    }
    if (i < first || (e.type !== 'impact' && e.type !== 'kill')) continue;
    const weapon = e.weapon,
      life = weapon === 0 ? 0.38 : weapon === 1 ? 1.35 : 2.2;
    if (age >= life) continue;
    const radius = Math.max(e.type === 'kill' ? 1.1 : 0.5, WEAPONS[weapon].radius);
    const t = age / life,
      fade = 1 - t,
      seed = (e.id * 0.61803398875) % 1;
    const wave = clamp(age / (weapon === 0 ? 0.2 : 0.75));
    ring(e, radius * (0.2 + wave * 1.35), 0.9 - t * 0.65, (1 - wave) * 0.65);
    if (weapon > 0) {
      ring(e, radius * (0.12 + wave), 0.5, (1 - wave) * 0.28);
      const lobes = reduced ? 0 : weapon === 2 ? 5 : 3;
      // Cool outer dust behind fewer, smaller fire lobes. All motion is a function of event id and age.
      for (let j = lobes - 1; j >= 0; j--) {
        const a = seed * TAU + j * 2.39996323;
        const spread = radius * (0.1 + t * 0.55);
        const p = project(
          { x: e.x + Math.cos(a) * spread, z: e.z + Math.sin(a) * spread },
          radius * (0.08 + t * (0.65 + j * 0.08)),
        );
        const r = radius * (0.16 + t * 0.42 + (j % 2) * 0.05) * scale;
        blob(p, r, r * 1.12, fade * 0.55, fade * 0.3, true);
      }
      for (let j = 0; j < (reduced ? 0 : weapon === 2 ? 3 : 2); j++) {
        const a = seed * TAU + (j * TAU) / 3,
          burn = clamp(1 - t / 0.58);
        const p = project(
          { x: e.x + Math.cos(a) * radius * 0.2, z: e.z + Math.sin(a) * radius * 0.2 },
          radius * (0.1 + t * 0.7),
        );
        const r = radius * (0.16 + Math.sin(Math.min(1, t * 2) * Math.PI) * 0.2) * scale;
        blob(p, r, r * 1.1, burn, burn * 0.78);
      }
    } else {
      const p = project(e, 0.2);
      blob(p, (0.35 + age) * scale, (0.25 + age) * scale, fade, fade * 0.45);
    }
    const flash = clamp(1 - age / (weapon === 2 ? 0.18 : 0.1));
    const core = Math.max(1.5, radius * 0.22 * scale);
    blob(project(e, 0.25), core, core, 1, flash * 0.9);
    const count = reduced ? 1 : weapon === 0 ? 3 : weapon === 1 ? 5 : 7;
    if (age < (weapon === 0 ? 0.28 : 0.85)) {
      for (let j = 0; j < count; j++) {
        const a = seed * TAU + j * 2.39996323;
        const speed = (1.7 + ((e.id + j * 13) % 7) * 0.22) * radius;
        const fragment = (time: number) =>
          project(
            {
              x: e.x + Math.cos(a) * speed * time,
              z: e.z + Math.sin(a) * speed * time,
            },
            Math.max(0, 0.15 + radius * 1.7 * time - 5 * time * time),
          );
        line(
          fragment(Math.max(0, age - 0.045)),
          fragment(age),
          fade,
          clamp(1 - age / (weapon === 0 ? 0.28 : 0.85)) * 0.9,
          weapon === 2 ? 1.6 : 1,
        );
      }
    }
  }

  let muzzle = 0;
  // ponytail: last 16 rounds cover current cadence; raise this budget if weapons gain simultaneous volleys.
  for (let i = Math.max(0, s.shots.length - 16); i < s.shots.length; i++) {
    const shot = s.shots[i],
      age = s.time - shot.born,
      flight = shot.due - shot.born;
    if (flight <= 0 || age < 0 || age >= flight) continue;
    const t = clamp(age / flight),
      weapon = shot.weapon;
    const position = (progress: number): ScreenPoint =>
      project(
        {
          x: shot.origin.x + (shot.x - shot.origin.x) * progress,
          z: shot.origin.z + (shot.z - shot.origin.z) * progress,
        },
        shot.origin.y * (1 - progress) + (4 + weapon * 5) * 4 * progress * (1 - progress),
      );
    ring(shot, WEAPONS[weapon].radius * (1 + (1 - t) * 0.65), 0.75, 0.22 + t * 0.25, true);
    // A single tapered ribbon per round, seven samples along the actual origin-to-impact parabola.
    const tail: ScreenPoint[] = [];
    const start = Math.max(0, t - (0.09 + weapon * 0.04));
    for (let j = 0; j <= 6; j++) tail.push(position(start + ((t - start) * j) / 6));
    g.fillColor = color(0.6, 0.6);
    for (let side = 0; side < 2; side++) {
      for (let n = 0; n <= 6; n++) {
        const j = side === 0 ? n : 6 - n,
          p = tail[j];
        const a = tail[Math.max(0, j - 1)],
          b = tail[Math.min(6, j + 1)];
        const length = Math.max(0.001, Math.hypot(b.x - a.x, b.y - a.y));
        const w = (0.15 + (j / 6) * (0.75 + weapon * 0.5)) * (side === 0 ? 1 : -1);
        const x = p.x - ((b.y - a.y) / length) * w,
          y = p.y + ((b.x - a.x) / length) * w;
        if (side === 0 && n === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
    }
    g.close();
    g.fill();
    const head = tail[6],
      r = 1.4 + weapon * 0.65;
    blob(head, r * 2.4, r * 2.4, 0.6, 0.2);
    blob(head, r, r, 1, 0.98);
    const flash = clamp(1 - age / 0.085);
    if (flash > 0) {
      const origin = project(shot.origin, shot.origin.y);
      blob(origin, 7 + weapon * 3, 5 + weapon * 2, 0.65, flash * 0.35);
      blob(origin, 2.5 + weapon, 2.5 + weapon, 1, flash);
      muzzle = Math.max(muzzle, flash * (0.35 + weapon * 0.15));
    }
  }
  // Aircraft origin is often outside the sensor view. Edge glint gives immediate feedback without moving aim/camera.
  if (muzzle > 0 && !reduced) {
    g.fillColor = color(1, muzzle * 0.35);
    g.rect(-width / 2, height / 2 - 3, width, 3);
    g.rect(-width / 2, -height / 2, width, 3);
    g.fill();
  }
  g.fillColor = fill;
  g.strokeColor = stroke;
  g.lineWidth = lineWidth;
}
