import type { Battle } from './rules.js';
import { ORIGIN } from './rules.js';
import { C, ellipse, flag } from './art-primitives.js';
import { project } from './projection.js';
import { prism, shadow } from './diorama.js';
type P = { x: number; y: number };
export function cannon(c: CanvasRenderingContext2D, aim: P | null, shot: boolean, skin: number) {
  const o = project(ORIGIN.x, ORIGIN.y),
    p = aim ? project(aim.x, aim.y) : { x: o.x + 400, y: o.y - 140 },
    angle = Math.atan2(p.y - o.y, p.x - o.x);
  shadow(c, 100, 390, 78, 15);
  prism(c, 46, 372, 110, 48, 21, 0, ['#aa7848', '#6a4e34', '#d1a676']);
  for (const p of [project(74, 385), project(156, 400)]) {
    ellipse(c, p.x + 5, p.y, 28, 33, '#3e423b');
    ellipse(c, p.x, p.y, 24, 31, '#ab7b49');
    ellipse(c, p.x, p.y, 18, 25, '#785538');
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      c.strokeStyle = '#cda368';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(p.x, p.y);
      c.lineTo(p.x + 19 * Math.cos(a), p.y + 25 * Math.sin(a));
      c.stroke();
    }
    ellipse(c, p.x, p.y, 5, 6, '#dbb47d');
  }
  c.save();
  c.translate(o.x - (shot ? 6 : 0), o.y - 15);
  c.rotate(angle);
  const metal = c.createLinearGradient(0, -23, 0, 23);
  metal.addColorStop(0, '#8d9b93');
  metal.addColorStop(0.35, '#535f59');
  metal.addColorStop(1, '#293734');
  c.fillStyle = metal;
  c.fillRect(-60, -23, 122, 46);
  ellipse(c, -60, 0, 9, 23, '#6a7971');
  ellipse(c, 62, 0, 9, 24, '#21312f');
  ellipse(c, 62, 0, 5, 17, '#111f1d');
  for (const x of [-35, 25]) {
    c.fillStyle = '#a9a68b';
    c.fillRect(x, -23, 6, 46);
  }
  c.restore();
  const f = project(36, 378, 68);
  flag(c, f.x, f.y, [C.blue, '#d5a435', '#cb756c'][skin]);
}
function dust(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  const g = c.createRadialGradient(x - rx * 0.3, y - ry * 0.35, 1, x, y, rx);
  g.addColorStop(0, '#efdfbd');
  g.addColorStop(0.55, '#cbb897');
  g.addColorStop(1, '#aa9b8060');
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
}
export function projectiles(
  c: CanvasRenderingContext2D,
  b: Battle,
  aim: P | null,
  motion: boolean,
) {
  const o = project(ORIGIN.x, ORIGIN.y);
  o.y -= 15;
  if (aim) {
    const p = project(aim.x, aim.y);
    c.strokeStyle = '#fff4cb';
    c.lineWidth = 2;
    c.setLineDash([5, 10]);
    c.beginPath();
    c.moveTo(o.x, o.y);
    c.quadraticCurveTo((o.x + p.x) / 2, (o.y + p.y) / 2 - 40, p.x, p.y);
    c.stroke();
    c.setLineDash([]);
    c.strokeStyle = '#ffd287';
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(p.x, p.y, 22, 13, 0, 0, Math.PI * 2);
    c.moveTo(p.x - 28, p.y);
    c.lineTo(p.x + 28, p.y);
    c.moveTo(p.x, p.y - 22);
    c.lineTo(p.x, p.y + 22);
    c.stroke();
  }
  for (const s of b.shots) {
    const p = project(s.x, s.y);
    if (s.remaining > 0) {
      const t = 1 - s.remaining / 0.38,
        x = o.x + (p.x - o.x) * t,
        y = o.y + (p.y - o.y) * t - 32 * Math.sin(t * Math.PI);
      ellipse(c, x + 5, y + 6, 9, 4, '#263c3428');
      const ball = c.createRadialGradient(x - 3, y - 3, 1, x, y, 8);
      ball.addColorStop(0, s.ammo === 'solid' ? '#b5beb6' : '#fff0b0');
      ball.addColorStop(1, s.ammo === 'solid' ? '#293834' : '#d5813e');
      c.fillStyle = ball;
      c.beginPath();
      c.arc(x, y, 8, 0, Math.PI * 2);
      c.fill();
    } else if (s.remaining > -0.7) {
      const t = -s.remaining / 0.7;
      c.save();
      c.globalAlpha = 1 - t;
      if (s.ammo === 'blast') {
        ellipse(c, p.x, p.y + 8, 22 + t * 38, 8 + t * 12, '#d8bf88');
        for (let i = 0; i < (motion ? 6 : 2); i++)
          dust(c, p.x + (i - 2.5) * 9, p.y - 9 - t * (18 + (i % 2) * 9), 8 + t * 17, 10 + t * 17);
        ellipse(c, p.x, p.y, 16 * (1 - t), 19 * (1 - t), '#eeb45b');
        ellipse(c, p.x - 3, p.y - 3, 9 * (1 - t), 11 * (1 - t), '#fff0bf');
      } else {
        for (let i = 0; i < (motion ? 8 : 4); i++) {
          const a = (i * Math.PI) / 4;
          c.strokeStyle = '#ffe3a1';
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(p.x + Math.cos(a) * 5, p.y + Math.sin(a) * 5);
          c.lineTo(p.x + Math.cos(a) * (12 + t * 18), p.y + Math.sin(a) * (12 + t * 18));
          c.stroke();
        }
        ellipse(c, p.x, p.y, 6 * (1 - t), 6 * (1 - t), '#fff2c7');
      }
      c.restore();
    }
  }
}
