import { Color, Graphics, view } from 'cc';
import { FLIGHT, WEAPONS } from './core/Data';
import type { Point } from './core/Data';
import type { Simulation } from './core/Simulation';
import type { World } from './World';

type ScreenPoint = { x: number; y: number };
export type EffectsFrame = {
  smoke?: { id: number; age: number; kind: 'damage' | 'wreck' }[];
  impacts: { id: number; weapon: number; outcome?: string; x: number; y: number; radius: number; age: number; primitives: number }[];
  projectiles: { id: number; weapon: number; x: number; y: number; width: number; length: number; speed: number }[];
};
const TAU = Math.PI * 2;
const clamp = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Append after Graphics.clear(), before target/aim markers; preserves their Graphics styles.
 * Budget: 16 rounds, 24 large / 8 small impacts, 8 attacks, 12 smoking vehicles.
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
): EffectsFrame {
  const frame: EffectsFrame = { impacts: [], projectiles: [], smoke: [] };
  let primitives = 0;
  const fill = g.fillColor.clone(),
    stroke = g.strokeColor.clone(),
    lineWidth = g.lineWidth;
  const sx = view.getScaleX(),
    sy = view.getScaleY();
  const project = (p: Point, y = 0): ScreenPoint => {
    const q = world.project(p, y);
    return { x: q.x / sx - width / 2, y: q.y / sy - height / 2 };
  };
  const airborne = (p: { x: number; y: number; z: number }): ScreenPoint => {
    const q = world.projectAir(p);
    return { x: q.x / sx - width / 2, y: q.y / sy - height / 2 };
  };
  // Perspective size comes from each effect's ground location.
  const scaleAt = (p: Point) => {
    const base = project(p), x = project({ x: p.x + 1, z: p.z }), z = project({ x: p.x, z: p.z + 1 });
    // The X axis can point straight away from the camera; use both axes so the blast cannot collapse.
    return Math.min(30, Math.max(Math.hypot(x.x - base.x, x.y - base.y), Math.hypot(z.x - base.x, z.y - base.y)));
  };
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
    if (alpha <= 0.005 || rx <= 0 || ry <= 0 || ![p.x, p.y, rx, ry].every(Number.isFinite)) return;
    // ponytail: cap billboard lobes at 96 UI pixels; subdivide them if giant close-up clouds are needed.
    rx = Math.min(96, rx);
    ry = Math.min(96, ry);
    if (Math.abs(p.x) > width / 2 + rx || Math.abs(p.y) > height / 2 + ry) return;
    g.fillColor = color(heat, alpha, smoke);
    g.ellipse(p.x, p.y, rx, ry);
    g.fill();
    primitives++;
  };
  const line = (a: ScreenPoint, b: ScreenPoint, heat: number, alpha: number, weight: number, friendly = false) => {
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return;
    if (Math.max(a.x, b.x) < -width / 2 || Math.min(a.x, b.x) > width / 2 ||
      Math.max(a.y, b.y) < -height / 2 || Math.min(a.y, b.y) > height / 2) return;
    g.strokeColor = color(heat, alpha);
    if (friendly && !world.thermal) g.strokeColor = new Color(145, 230, 203, Math.round(alpha * 255));
    g.lineWidth = weight;
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
    primitives++;
  };
  const ring = (p: Point, radius: number, heat: number, alpha: number, dashed = false) => {
    if (alpha <= 0.005) return;
    const q = project(p),
      x = project({ x: p.x + radius, z: p.z });
    const z = project({ x: p.x, z: p.z + radius });
    const extent = Math.max(Math.hypot(x.x - q.x, x.y - q.y), Math.hypot(z.x - q.x, z.y - q.y));
    if (Math.abs(q.x) > width / 2 + extent || Math.abs(q.y) > height / 2 + extent || extent > 2000) return;
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
    primitives++;
  };

  // ponytail: inspect 64 units and render 12 plumes; spatial pooling if missions grow.
  let wrecks = 0;
  for (
    let i = s.units.length - 1, end = Math.max(0, s.units.length - 64);
    i >= end && wrecks < 12;
    i--
  ) {
    const u = s.units[i], dead = u.hp <= 0,
      age = dead ? s.time - u.deadAt : s.time;
    if (dead ? u.deadAt < 0 || age < 0 || age >= 35 : u.hp / u.maxHp > 0.55) continue;
    wrecks++;
    const scale = scaleAt(u);
    const fade = dead ? Math.min(1, age * 2) * Math.min(1, (35 - age) / 10) : 0.6;
    for (let j = reduced ? 0 : 3; j >= 0; j--) {
      const drift = (age * 0.35 + j * 0.7) % 3;
      const r = (0.16 + drift * 0.14) * scale;
      const p = project(
        { x: u.x + drift * 0.25 + Math.sin(u.id + j) * 0.08, z: u.z },
        0.3 + drift * 0.6,
      );
      blob(p, Math.max(1.5, r), Math.max(2, r * 1.2), dead ? 0.6 * Math.max(0, 1 - age / 30) : 0.3,
        fade * (1 - drift / 3) * 0.6, true);
    }
    frame.smoke!.push({ id: u.id, age, kind: dead ? 'wreck' : 'damage' });
    if (dead && age < 9 && !reduced) {
      const p = project(u, 0.3), flicker = 0.75 + Math.sin(age * 13 + u.id) * 0.2;
      blob(p, Math.max(1, scale * 0.16), Math.max(2, scale * 0.35 * flicker), 0.7, (1 - age / 9) * 0.7);
    }
  }

  // Every terrain impact explodes, including misses. Kill events use wreck smoke, not a second explosion.
  let attacks = 0;
  for (const e of [...world.impactClouds, ...s.events.filter((event) => event.type === 'attack')]) {
    const
      age = s.time - e.time;
    if (age < 0) continue;
    if (e.type === 'attack') {
      if (age >= 0.3 || attacks++ >= 8) continue;
      const target = e.target || s.units.find((u) => u.id === e.unit);
      if (!target) continue;
      const a = project(e, 0.3),
        b = project(target, 0.25),
        t = clamp(age / 0.12);
      line(a, b, 0.45, (1 - age / 0.3) * 0.55, 1, e.friendly);
      blob({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, 2, 2, 1, 1 - age / 0.3);
      continue;
    }
    if (e.type !== 'impact') continue;
    const weapon = e.weapon,
      life = weapon === 0 ? 1.5 : weapon === 1 ? 10 : 16;
    if (age >= life) continue;
    const before = primitives;
    const scale = scaleAt(e);
    const radius = WEAPONS[weapon].radius;
    const t = age / life,
      fade = 1 - t,
      seed = (e.id * 0.61803398875) % 1;
    const wave = clamp(age / (weapon === 0 ? 0.2 : 0.75));
    // The pressure ring stops at the gameplay blast radius; dust can drift beyond it.
    ring(e, radius * (0.2 + wave * 0.8), 0.9 - t * 0.65, (1 - wave) * 0.8);
    if (weapon > 0) {
      ring(e, radius * (0.12 + wave * 0.88), 0.5, (1 - wave) * 0.4);
      if (reduced) {
        const r = Math.max(1.5, radius * (0.15 + t * 0.3) * scale);
        blob(project(e, radius * 0.15), r, r * 0.6, fade * 0.5, fade * 0.45, true);
      }
      const lobes = reduced ? 0 : weapon === 2 ? 5 : 3;
      // Cool outer dust behind fewer, smaller fire lobes. All motion is a function of event id and age.
      for (let j = lobes - 1; j >= 0; j--) {
        const a = seed * TAU + j * 2.39996323;
        const spread = radius * (0.1 + t * 0.55);
        const p = project(
          { x: e.x + Math.cos(a) * spread + age * 0.12, z: e.z + Math.sin(a) * spread },
          radius * (0.08 + t * (0.65 + j * 0.08)),
        );
        const r = radius * (0.16 + t * 0.42 + (j % 2) * 0.05) * scale;
        blob(p, r, r * 1.12, fade * 0.55, fade * 0.48, true);
      }
      for (let j = 0; j < (reduced ? 0 : weapon === 2 ? 3 : 2); j++) {
        const a = seed * TAU + (j * TAU) / 3,
          burn = clamp(1 - age / (weapon === 2 ? 0.9 : 0.65));
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
    const flash = clamp(1 - age / (weapon === 2 ? 0.24 : 0.16));
    const core = Math.max(weapon === 0 ? 1 : 2, radius * 0.3 * scale);
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
    if (primitives > before) {
      const p = project(e);
      frame.impacts.push({ id: e.id, weapon, outcome: e.outcome, x: p.x + width / 2,
        y: height / 2 - p.y, radius: radius * scale, age, primitives: primitives - before });
    }
  }

  // ponytail: last 16 rounds cover current cadence; raise this budget if weapons gain simultaneous volleys.
  for (let i = Math.max(0, s.shots.length - 16); i < s.shots.length; i++) {
    const shot = s.shots[i],
      age = s.time - shot.born,
      flight = shot.due - shot.born;
    if (flight <= 0 || age < 0 || age >= flight) continue;
    const t = clamp(age / flight),
      weapon = shot.weapon, spec = WEAPONS[weapon];
    const position = (progress: number): ScreenPoint =>
      airborne(s.shotPosition(shot, shot.born + progress * flight));
    ring(shot, WEAPONS[weapon].radius * (1 + (1 - t) * 0.65), 0.75, 0.22 + t * 0.25, true);
    // A single tapered ribbon per round, seven samples along the actual origin-to-impact parabola.
    const tail: ScreenPoint[] = [];
    const start = Math.max(0, t - spec.tracerTime / flight);
    for (let j = 0; j <= 6; j++) tail.push(position(start + ((t - start) * j) / 6));
    if (tail.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y) ||
      Math.abs(p.x) > width * 3 || Math.abs(p.y) > height * 3)) continue;
    const location = s.shotPosition(shot), projected = airborne(location);
    const localScale = Math.min(200, Math.max(...[
      { x: location.x + 1, y: location.y, z: location.z },
      { x: location.x, y: location.y + 1, z: location.z },
      { x: location.x, y: location.y, z: location.z + 1 },
    ].map((p) => { const q = airborne(p); return Math.hypot(q.x - projected.x, q.y - projected.y); })));
    // Keep distant rounds readable in UI pixels without changing their ballistic path.
    const bodyWidth = Math.min(5, Math.max(1.5 + weapon * 0.65, spec.calibre * localScale));
    const bodyLength = Math.min(12, Math.max(4 + weapon * 1.5, spec.length * localScale));
    g.fillColor = color(0.8, 0.7);
    for (let side = 0; side < 2; side++) {
      for (let n = 0; n <= 6; n++) {
        const j = side === 0 ? n : 6 - n,
          p = tail[j];
        const a = tail[Math.max(0, j - 1)],
          b = tail[Math.min(6, j + 1)];
        const length = Math.max(0.001, Math.hypot(b.x - a.x, b.y - a.y));
        const w = (0.08 + (j / 6) * bodyWidth * 0.5) * (side === 0 ? 1 : -1);
        const x = p.x - ((b.y - a.y) / length) * w,
          y = p.y + ((b.x - a.x) / length) * w;
        if (side === 0 && n === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
    }
    g.close();
    g.fill();
    const head = tail[6], last = tail[5], heading = Math.atan2(head.y - last.y, head.x - last.x);
    const beforeHead = primitives;
    line({ x: head.x - Math.cos(heading) * bodyLength, y: head.y - Math.sin(heading) * bodyLength }, head, 1, 0.95, bodyWidth);
    if (primitives > beforeHead) frame.projectiles.push({ id: shot.id, weapon,
      x: head.x + width / 2, y: height / 2 - head.y, width: bodyWidth, length: bodyLength,
      speed: Math.hypot(shot.velocity.x, shot.velocity.y - FLIGHT.gravity * age, shot.velocity.z) });
    const flash = clamp(1 - age / 0.085);
    if (flash > 0) {
      const origin = airborne(shot.origin);
      blob(origin, 7 + weapon * 3, 5 + weapon * 2, 0.65, flash * 0.35);
      blob(origin, 2.5 + weapon, 2.5 + weapon, 1, flash);
    }
  }
  g.fillColor = fill;
  g.strokeColor = stroke;
  g.lineWidth = lineWidth;
  return frame;
}
