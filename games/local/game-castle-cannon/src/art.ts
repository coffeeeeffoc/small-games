import type { Battle, Module } from './rules.js';
import { alive } from './rules.js';
import { C, W, H, box, text, ellipse, flag } from './art-primitives.js';
import { project } from './projection.js';
import { poly, prism, shadow, wall, roof } from './diorama.js';
export { W, H, C, box, text, flag };
export { scenery } from './diorama.js';
export { cannon, projectiles } from './effects.js';
function unit(c: CanvasRenderingContext2D, x: number, y: number, phase: number, skin: number) {
  const p = project(x, y),
    s = 1.2 - x * 0.0006;
  shadow(c, x, y, 11 * s, 4 * s);
  c.save();
  c.translate(p.x, p.y);
  c.scale(s, s);
  c.strokeStyle = '#343e3c';
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(-4, -6);
  c.lineTo(-5 - Math.sin(phase) * 3, 2);
  c.moveTo(4, -6);
  c.lineTo(5 + Math.sin(phase) * 3, 2);
  c.stroke();
  const body = c.createLinearGradient(-9, 0, 10, 0);
  body.addColorStop(0, '#5998b2');
  body.addColorStop(1, '#23516e');
  c.fillStyle = body;
  c.fillRect(-8, -23, 16, 18);
  ellipse(c, 1, -28, 7, 8, '#eec494');
  const helm = c.createRadialGradient(-4, -37, 1, 0, -32, 14);
  helm.addColorStop(0, ['#dce9e7', '#ffe4a0', '#f0b59c'][skin]);
  helm.addColorStop(1, ['#657f8a', '#ad8753', '#a16c61'][skin]);
  c.beginPath();
  c.arc(0, -32, 10, Math.PI, 0);
  c.lineTo(11, -27);
  c.lineTo(-10, -27);
  c.closePath();
  c.fillStyle = helm;
  c.fill();
  c.fillStyle = '#354847';
  c.fillRect(5, -29, 2, 2);
  c.strokeStyle = '#dedfc5';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(9, -13);
  c.lineTo(17, -37);
  c.stroke();
  c.restore();
}
function moduleDraw(c: CanvasRenderingContext2D, b: Battle, m: Module, motion: boolean) {
  const height = m.kind === 'tower' ? 0.73 * (350 - m.y) + 25 : m.kind === 'gate' ? 102 : 31,
    base = project(m.x, 350),
    p = project(m.x, m.y);
  if (m.hp > 0) {
    if (m.kind === 'tower') {
      shadow(c, m.x, 364, 43, 12);
      wall(c, m.x - 29, 320, 58, height);
      prism(c, m.x - 39, 316, 78, 49, 15, height - 17, ['#a8794e', '#70543e', '#d1a572']);
      roof(c, m.x - 35, 313, 70, 52, height + 9);
      c.fillStyle = '#514d43';
      c.fillRect(p.x - 7, p.y - 4, 14, 18);
      c.fillStyle = '#7d4735';
      c.fillRect(p.x - 23, p.y + 20, 18, 32);
    } else if (m.kind === 'gate') {
      poly(
        c,
        [
          project(m.x - 44, 337),
          project(m.x + 44, 337),
          project(m.x + 44, 337, 102),
          project(m.x - 44, 337, 102),
        ],
        '#514a37',
      );
      for (let i = 0; i < 8; i++)
        prism(c, m.x - 39 + i * 10, 337, 9, 6, 87, 0, [
          i % 2 ? '#ad7848' : '#ba8956',
          '#624b34',
          '#d6ac72',
        ]);
      for (const z of [20, 65])
        prism(c, m.x - 41, 344, 84, 3, 7, z, ['#665640', '#443e32', '#b7a17a']);
    } else
      for (let i = 0; i < 3; i++)
        prism(c, m.x - 24 + i * 17, 340, 16, 20, 28 + (i % 2) * 10, 0, [
          '#a88152',
          '#755d40',
          '#d4b078',
        ]);
    if (m.hp < m.maxHp) {
      c.strokeStyle = '#694b36';
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(p.x - 13, p.y - 15);
      c.lineTo(p.x + 3, p.y + 1);
      c.lineTo(p.x - 5, p.y + 15);
      c.lineTo(p.x + 9, p.y + 28);
      c.stroke();
    }
    c.fillStyle = '#394638';
    c.fillRect(p.x - 25, p.y - (m.kind === 'tower' ? 65 : 67), 50, 5);
    c.fillStyle = '#edb062';
    c.fillRect(p.x - 25, p.y - (m.kind === 'tower' ? 65 : 67), (50 * m.hp) / m.maxHp, 5);
  } else
    for (let i = 0; i < 9; i++)
      prism(
        c,
        m.x - 45 + i * 10,
        335 + (i % 3) * 12,
        13,
        13,
        6 + (i % 3) * 5,
        0,
        m.kind === 'gate' ? ['#ae8053', '#72563e', '#d1a374'] : undefined,
      );
  if (m.destroyedAt !== null && motion) {
    const age = b.time - m.destroyedAt;
    if (age < 1.1) {
      const t = age / 1.1;
      c.save();
      c.globalAlpha = 1 - t;
      if (m.kind === 'tower' && t < 0.65) {
        c.save();
        c.translate(base.x, base.y);
        c.rotate(t * 0.55);
        c.translate(-base.x, -base.y);
        prism(c, m.x - 25, 325, 50, 30, height * (1 - t));
        roof(c, m.x - 28, 322, 56, 36, height * (1 - t));
        c.restore();
      }
      for (let i = 0; i < 10; i++) {
        const a = i * 2.4,
          q = project(
            m.x + Math.cos(a) * age * 65,
            350 + Math.sin(a) * age * 40,
            Math.sin(t * Math.PI) * 45 + (i % 3) * 8,
          );
        c.save();
        c.translate(q.x, q.y);
        c.rotate(age * (i - 5));
        c.fillStyle = m.kind === 'gate' ? '#b58755' : '#d3be98';
        const w = m.kind === 'gate' ? 20 : 10;
        poly(
          c,
          [
            { x: -5, y: -4 },
            { x: w - 5, y: -4 },
            { x: w - 5, y: 4 },
            { x: -5, y: 4 },
          ],
          m.kind === 'gate' ? '#b58755' : '#cbb796',
        );
        poly(
          c,
          [
            { x: -5, y: -4 },
            { x: -1, y: -8 },
            { x: w - 1, y: -8 },
            { x: w - 5, y: -4 },
          ],
          m.kind === 'gate' ? '#dfb67c' : '#f0debc',
        );
        poly(
          c,
          [
            { x: w - 5, y: -4 },
            { x: w - 1, y: -8 },
            { x: w - 1, y: 0 },
            { x: w - 5, y: 4 },
          ],
          m.kind === 'gate' ? '#70543e' : '#9a896e',
        );
        c.restore();
      }
      for (let i = 0; i < 6; i++)
        ellipse(c, base.x + (i - 3) * 10, base.y - 8 - t * 22, 12 + t * 18, 8 + t * 10, '#c9b893');
      c.restore();
    }
  }
}
export function castle(c: CanvasRenderingContext2D, b: Battle, motion = true, skin = 0) {
  wall(c, 755, 280, 110, 65);
  wall(c, 805, 280, 58, 120);
  roof(c, 803, 280, 58, 48, 120);
  const f = project(823, 305, 160);
  flag(c, f.x, f.y, b.result === 'won' ? C.blue : C.coral);
  const gate = b.modules.find((m) => m.kind === 'gate')!;
  wall(c, gate.x - 109, 307, 63, 92);
  wall(c, gate.x + 46, 307, 185, 92);
  for (const m of [...b.modules].sort((a, d) => a.y - d.y || d.x - a.x))
    moduleDraw(c, b, m, motion);
  for (const u of alive(b).sort((a, d) => d.x - a.x))
    unit(c, u.x, 355 + ((u.id % 3) - 1) * 11, b.time * 8 + u.id, skin);
  for (const e of b.events.filter((e) => e.type === 'casualty' && b.time - e.time < 0.8)) {
    const u = b.units.find((u) => String(u.id) === e.target);
    if (u) {
      const p = project(u.x, 350);
      text(c, '−1', p.x, p.y - 35 - (b.time - e.time) * 20, 18, C.coral);
    }
  }
  if (b.arrows && b.time - b.lastArrow < 0.45) {
    const v = alive(b).sort((a, d) => d.x - a.x)[0];
    if (v)
      for (const m of b.modules.filter((m) => m.kind === 'tower' && m.hp > 0)) {
        const a = project(m.x, m.y),
          d = project(v.x, 350),
          t = (b.time - b.lastArrow) / 0.45,
          x = a.x + (d.x - a.x) * t,
          y = a.y + (d.y - a.y) * t;
        c.strokeStyle = '#f7dda8';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(x + 11, y - 8);
        c.lineTo(x, y);
        c.stroke();
      }
  }
}
