import type { Trial } from '../domain/trial.js';
import { portals, springs } from '../domain/world.js';
import { ellipse, glow, ink, label, line, polygon, ring } from './paint.js';
export function drawSceneProps(c: CanvasRenderingContext2D, s: Trial, t: number) {
  for (const o of s.obstacles) {
    ellipse(c, o.x + 5, o.y + 8, o.r + 7, o.r * 0.5, '#102f3545');
    if (o.hp <= 0) {
      for (let i = 0; i < 6; i++)
        polygon(
          c,
          [
            [o.x - 20 + i * 8, o.y],
            [o.x - 15 + i * 8, o.y - 7 - (i % 3) * 3],
            [o.x - 7 + i * 8, o.y + 5],
          ],
          '#708174',
        );
      continue;
    }
    polygon(
      c,
      [
        [o.x - o.r, o.y],
        [o.x - o.r * 0.6, o.y - o.r],
        [o.x + o.r * 0.3, o.y - o.r * 1.25],
        [o.x + o.r, o.y - 3],
        [o.x + o.r * 0.6, o.y + o.r * 0.5],
        [o.x - o.r * 0.5, o.y + o.r * 0.5],
      ],
      '#526a63',
    );
    polygon(
      c,
      [
        [o.x - o.r * 0.6, o.y - o.r],
        [o.x + o.r * 0.3, o.y - o.r * 1.25],
        [o.x + o.r * 0.35, o.y],
        [o.x - o.r * 0.5, o.y + o.r * 0.5],
      ],
      '#9aa98c',
    );
    if (o.kind === 'pillar') {
      line(
        c,
        [
          [o.x - 5, o.y - 20],
          [o.x + 3, o.y - 9],
          [o.x - 4, o.y + 4],
        ],
        '#344e47',
        2,
      );
      label(c, '镇', o.x, o.y - 7, 14, '#ddd4ac');
    }
  }
  for (const p of springs[s.scene]) {
    const locked = s.enemies.some((e) => e.id === p.guarded && e.hp > 0);
    glow(c, p.x, p.y, 55, locked ? '#687b5033' : '#99f0ce40');
    for (let i = 0; i < 3; i++) {
      const r = 18 + ((t * 10 + i * 13) % 38);
      c.globalAlpha = 1 - r / 60;
      ring(c, p.x, p.y, r, locked ? '#9a9d6d' : '#c0efd4', 1);
    }
    c.globalAlpha = 1;
    label(c, locked ? '石兽守泉' : '灵脉 · 吐纳', p.x, p.y + 67, 13, '#e2e8c8');
  }
  for (const p of portals[s.scene]) {
    glow(c, p.x, p.y, 45, '#e7d39836');
    ring(c, p.x, p.y, 25 + Math.sin(t) * 2, ink.gold, 2);
    polygon(
      c,
      [
        [p.x - 6, p.y + 4],
        [p.x, p.y - 4],
        [p.x + 6, p.y + 4],
      ],
      ink.gold,
    );
    label(c, p.label, p.x, p.y - 36, 15, '#fff0c6');
  }
}
