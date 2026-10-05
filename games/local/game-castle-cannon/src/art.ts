import type { Battle, Module } from './rules.js';
import { ORIGIN, alive } from './rules.js';
import { C, box, text, ellipse, soldier, flag } from './art-primitives.js';
export { W, H, C, box, text, scenery, cannon, flag } from './art-primitives.js';
function roof(c: CanvasRenderingContext2D, x: number, y: number, w: number) {
  c.beginPath();
  c.moveTo(x - w / 2 - 8, y);
  c.lineTo(x, y - 40);
  c.lineTo(x + w / 2 + 8, y);
  c.closePath();
  c.fillStyle = C.coral;
  c.fill();
  c.strokeStyle = C.ink;
  c.lineWidth = 3;
  c.stroke();
  c.strokeStyle = '#ffc592';
  c.beginPath();
  c.moveTo(x, y - 31);
  c.lineTo(x + 20, y - 4);
  c.stroke();
}
function cracks(c: CanvasRenderingContext2D, m: Module) {
  if (m.hp >= m.maxHp) return;
  c.strokeStyle = '#765343';
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(m.x - 15, m.y - 28);
  c.lineTo(m.x - 3, m.y - 13);
  c.lineTo(m.x - 13, m.y);
  c.lineTo(m.x + 6, m.y + 16);
  c.lineTo(m.x - 3, m.y + 35);
  c.stroke();
}
export function castle(c: CanvasRenderingContext2D, b: Battle, motion = true, skin = 0) {
  box(c, 538, 235, 306, 100, C.stone, 8);
  for (let x = 540; x < 840; x += 36) box(c, x, 220, 24, 29, C.stone, 3);
  for (let y = 258; y < 328; y += 25)
    for (let x = 555 + (y % 2) * 13; x < 835; x += 48) {
      c.strokeStyle = '#c6b58d';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + 26, y);
      c.stroke();
    }
  box(c, 792, 176, 54, 157, C.stone, 9);
  roof(c, 819, 177, 58);
  flag(c, 819, 107, b.result === 'won' ? C.blue : C.coral);
  c.fillStyle = '#655f53';
  c.fillRect(810, 198, 14, 26);
  for (const m of b.modules) {
    if (m.kind === 'gate') {
      c.beginPath();
      c.moveTo(m.x - 43, 334);
      c.lineTo(m.x - 43, 278);
      c.arc(m.x, 278, 43, Math.PI, 0);
      c.lineTo(m.x + 43, 334);
      c.closePath();
      c.fillStyle = m.hp > 0 ? '#a7774d' : '#5a7264';
      c.fill();
      c.strokeStyle = C.ink;
      c.lineWidth = 5;
      c.stroke();
      if (m.hp > 0) {
        for (let x = m.x - 30; x < m.x + 42; x += 15) {
          c.strokeStyle = '#734f3d';
          c.lineWidth = 3;
          c.beginPath();
          c.moveTo(x, 254);
          c.lineTo(x, 333);
          c.stroke();
        }
        box(c, m.x - 39, 289, 78, 9, '#6f5c48', 2);
        cracks(c, m);
      } else {
        for (let i = 0; i < 8; i++)
          box(c, m.x - 55 + i * 15, 334 + (i % 2) * 6, 15, 10, i % 2 ? C.shadow : C.stone, 3);
      }
    } else if (m.kind === 'tower' && m.hp > 0) {
      box(c, m.x - 30, m.y - 22, 60, 122, C.stone, 9);
      roof(c, m.x, m.y - 23, 65);
      c.fillStyle = '#6d6858';
      c.fillRect(m.x - 10, m.y - 5, 20, 29);
      box(c, m.x - 34, m.y + 20, 68, 13, C.shadow, 3);
      flag(c, m.x - 16, m.y + 39, C.coral);
      cracks(c, m);
    } else if (m.kind === 'tower') {
      for (let i = 0; i < 5; i++) box(c, m.x - 38 + i * 16, 256 + (i % 2) * 7, 21, 17, C.shadow, 4);
    } else if (m.hp > 0) {
      for (let i = 0; i < 3; i++)
        box(c, m.x - 30 + i * 20, m.y - 15 - (i % 2) * 7, 19, 33, '#ad8b61', 3);
      cracks(c, m);
    } else {
      for (let i = 0; i < 4; i++) box(c, m.x - 25 + i * 14, 342, 16, 8, '#ad8b61', 2);
    }
    if (m.hp > 0) {
      c.fillStyle = C.ink;
      c.fillRect(m.x - 28, m.y - (m.kind === 'tower' ? 73 : 61), 56, 6);
      c.fillStyle = C.coral;
      c.fillRect(m.x - 28, m.y - (m.kind === 'tower' ? 73 : 61), (56 * m.hp) / m.maxHp, 6);
    }
    if (m.destroyedAt !== null && motion) {
      const t = b.time - m.destroyedAt;
      if (t < 0.85)
        for (let i = 0; i < 8; i++) {
          const a = i * 0.78;
          const x = m.x + Math.cos(a) * t * 95,
            y = m.y - 20 - Math.sin(a) * t * 85 + t * t * 95;
          c.save();
          c.translate(x, y);
          c.rotate(t * (i - 4));
          c.globalAlpha = 1 - t / 0.85;
          box(c, -7, -5, 14, 10, C.shadow, 2);
          c.restore();
        }
    }
  }
  for (const u of alive(b)) soldier(c, u.x, 347 + (u.id % 3) * 8, b.time * 8 + u.id, skin);
  for (const e of b.events.filter((e) => e.type === 'casualty' && b.time - e.time < 0.8)) {
    const unit = b.units.find((u) => String(u.id) === e.target);
    if (!unit) continue;
    const age = b.time - e.time;
    c.save();
    c.globalAlpha = 1 - age / 0.8;
    soldier(c, unit.x - age * 40, 347 + (unit.id % 3) * 8, 0, skin);
    text(c, '−1', unit.x, 321 - age * 36, 23, C.coral);
    c.restore();
  }
  if (b.arrows && b.time - b.lastArrow < 0.45) {
    const victim = alive(b).sort((a, d) => d.x - a.x)[0];
    if (victim)
      for (const m of b.modules.filter((m) => m.kind === 'tower' && m.hp > 0)) {
        const t = (b.time - b.lastArrow) / 0.45,
          x = m.x + (victim.x - m.x) * t,
          y = m.y + (343 - m.y) * t;
        c.strokeStyle = C.coral;
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(x + 14, y - 9);
        c.lineTo(x, y);
        c.stroke();
        c.beginPath();
        c.moveTo(x + 1, y - 7);
        c.lineTo(x, y);
        c.lineTo(x + 8, y);
        c.stroke();
      }
  }
}
export function projectiles(
  c: CanvasRenderingContext2D,
  b: Battle,
  aim: { x: number; y: number } | null,
  motion: boolean,
) {
  if (aim) {
    c.strokeStyle = '#fff7df';
    c.lineWidth = 3;
    c.setLineDash([7, 11]);
    c.beginPath();
    c.moveTo(ORIGIN.x, ORIGIN.y);
    c.lineTo(aim.x, aim.y);
    c.stroke();
    c.setLineDash([]);
    c.strokeStyle = C.orange;
    c.lineWidth = 4;
    c.beginPath();
    c.arc(aim.x, aim.y, 24, 0, Math.PI * 2);
    c.moveTo(aim.x - 33, aim.y);
    c.lineTo(aim.x + 33, aim.y);
    c.moveTo(aim.x, aim.y - 33);
    c.lineTo(aim.x, aim.y + 33);
    c.stroke();
  }
  for (const s of b.shots) {
    if (s.remaining > 0) {
      const t = 1 - s.remaining / 0.38;
      ellipse(
        c,
        ORIGIN.x + (s.x - ORIGIN.x) * t,
        ORIGIN.y + (s.y - ORIGIN.y) * t - 35 * Math.sin(t * Math.PI),
        9,
        9,
        s.ammo === 'solid' ? C.ink : C.coral,
      );
    } else if (s.remaining > -0.6) {
      const t = -s.remaining / 0.6;
      c.save();
      c.globalAlpha = 1 - t;
      ellipse(c, s.x, s.y, 20 + t * (s.ammo === 'blast' ? 84 : 24), 18 + t * 25, C.orange);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        c.strokeStyle = C.cream;
        c.lineWidth = 5;
        c.beginPath();
        c.moveTo(s.x + Math.cos(a) * 24, s.y + Math.sin(a) * 24);
        c.lineTo(
          s.x + Math.cos(a) * (38 + (motion ? t * 24 : 0)),
          s.y + Math.sin(a) * (38 + (motion ? t * 24 : 0)),
        );
        c.stroke();
      }
      c.restore();
    }
  }
}
