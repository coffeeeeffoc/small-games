import type { Trial } from '../domain/trial.js';
import { ellipse, glow, ink, label, line, polygon, ring, sword } from './paint.js';

export function fox(c: CanvasRenderingContext2D, x: number, y: number, t: number, tired: boolean) {
  ellipse(c, x, y + 9, 19, 7, '#142e2c45');
  c.save();
  c.translate(x, y);
  c.rotate(tired ? -0.15 : Math.sin(t * 6) * 0.02);
  c.strokeStyle = '#efd9b0';
  c.lineWidth = 10;
  c.beginPath();
  c.moveTo(-8, 3);
  c.quadraticCurveTo(-32, 12, -27, -10 + Math.sin(t * 4) * 3);
  c.stroke();
  ellipse(c, 0, 1, 13, 8, '#f4e4c1');
  polygon(
    c,
    [
      [3, -3],
      [6, -19],
      [12, -13],
      [21, -17],
      [20, -3],
      [11, 6],
    ],
    '#faf0d2',
  );
  ellipse(c, 12, -5, 1.5, 1.5, '#2c403b');
  ellipse(c, 20, 0, 2, 1.7, '#2c403b');
  c.restore();
}
export function cultivator(c: CanvasRenderingContext2D, s: Trial, t: number) {
  const p = s.player,
    walking = Math.hypot(s.move.x, s.move.y) > 0.1,
    stride = walking ? Math.sin(t * 12) * 4 : 0;
  ellipse(c, p.x, p.y + 9, 19, 8, '#193b3b4d');
  if (s.dodge > 0)
    for (let i = 1; i < 4; i++) {
      c.globalAlpha = 0.14 / i;
      ellipse(c, p.x - s.facing.x * i * 14, p.y - s.facing.y * i * 14, 13, 22, '#c7efd7');
    }
  c.globalAlpha = s.invulnerable > 0 && Math.floor(t * 18) % 2 === 0 ? 0.55 : 1;
  c.save();
  c.translate(p.x, p.y);
  line(
    c,
    [
      [-6, 6],
      [-8 + stride, 19],
    ],
    '#253e3b',
    5,
  );
  line(
    c,
    [
      [6, 6],
      [8 - stride, 19],
    ],
    '#253e3b',
    5,
  );
  polygon(
    c,
    [
      [-9, -18],
      [-18, 13 + stride * 0.5],
      [0, 8],
      [18, 14 - stride * 0.5],
      [9, -18],
    ],
    '#eee9cf',
  );
  polygon(
    c,
    [
      [-3, -17],
      [2, 10],
      [10, 12],
      [4, -18],
    ],
    '#73a494',
  );
  line(
    c,
    [
      [-11, -1],
      [11, -1],
    ],
    '#314f45',
    4,
  );
  const lift = s.charge !== null ? -12 : Math.sin(t * 1.8) * 2;
  polygon(
    c,
    [
      [-9, -16],
      [-25, -4 + lift],
      [-17, 3 + lift],
      [-4, -7],
    ],
    '#dedac1',
  );
  polygon(
    c,
    [
      [9, -16],
      [26, -8 + lift],
      [24, -1 + lift],
      [5, -5],
    ],
    '#f0ecd7',
  );
  ellipse(c, 0, -25, 8, 9, '#e3c69a');
  ellipse(c, 0, -32, 9, 5, '#203b35');
  ellipse(c, 1, -38, 4, 5, '#203b35');
  line(
    c,
    [
      [3, -36],
      [13, -38],
    ],
    ink.gold,
    2,
  );
  line(
    c,
    [
      [0, -29],
      [-9, -17 - Math.sin(t) * 2],
    ],
    '#223d37',
    3,
  );
  c.restore();
  c.globalAlpha = 1;
  if (s.shield > 0) {
    glow(c, p.x, p.y, 50, '#d9e6c133');
    ring(c, p.x, p.y - 7, 34, ink.gold, 2);
    ring(c, p.x, p.y - 7, 39, '#e5d79455');
  }
  if (s.charge !== null) {
    const a = s.aim ? Math.atan2(s.aim.y - p.y, s.aim.x - p.x) : Math.atan2(s.facing.y, s.facing.x);
    glow(c, p.x, p.y, 40, s.charge > 0.55 && s.qi >= 18 ? '#e8d79566' : '#a0e3c355');
    sword(c, p.x + Math.cos(a) * 36, p.y + Math.sin(a) * 36 - 8, a, 1 + s.charge * 0.35);
    ring(
      c,
      p.x,
      p.y,
      28,
      s.charge > 0.55 && s.qi >= 18 ? ink.gold : ink.jade,
      3,
      Math.min(1, s.charge / 1.3) * Math.PI * 2,
    );
  } else if (!s.swords.length)
    sword(c, p.x + 26, p.y - 15 + Math.sin(t * 2) * 4, -Math.PI / 2, 0.8);
  if (s.breathing !== null) {
    const ratio = s.breathing / s.balance.breathLimit;
    for (let i = 0; i < 9; i++) {
      const a = t * 2 + i * 0.7,
        r = 18 + ((((i * 7 - t * 25) % 50) + 50) % 50);
      ellipse(
        c,
        p.x + Math.cos(a) * r,
        p.y + Math.sin(a) * r,
        2,
        2,
        ratio > 0.8 ? ink.danger : ink.jade,
      );
    }
    ring(c, p.x, p.y, 38, ratio > 0.8 ? ink.danger : ink.jade, 3, ratio * Math.PI * 2);
    label(
      c,
      ratio > 0.8 ? '快收气！' : '松开 · 收气',
      p.x,
      p.y - 57,
      14,
      ratio > 0.8 ? ink.danger : ink.paper,
    );
  }
}
