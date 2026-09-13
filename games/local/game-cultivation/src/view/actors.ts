import type { Trial } from '../domain/trial.js';
import { ellipse, glow, ink, label, line, polygon, ring, sword } from './paint.js';

import { fox, cultivator } from './characters.js';
export function drawActors(c: CanvasRenderingContext2D, s: Trial, t: number) {
  for (const bolt of s.lightning) {
    if (!bolt.struck) {
      ellipse(c, bolt.x, bolt.y, bolt.radius, bolt.radius, '#6b382d55');
      ring(c, bolt.x, bolt.y, bolt.radius, ink.danger, 2);
      ring(
        c,
        bolt.x,
        bolt.y,
        Math.max(0.04, Math.min(1, bolt.timer / 0.95)) * bolt.radius,
        ink.gold,
        2,
      );
      line(
        c,
        [
          [bolt.x - 12, bolt.y],
          [bolt.x + 12, bolt.y],
        ],
        ink.danger,
        2,
      );
      label(c, '雷', bolt.x, bolt.y - 10, 20, ink.gold);
    } else {
      glow(c, bolt.x, bolt.y, 90, '#e4efcf88');
      line(
        c,
        [
          [bolt.x - 20, bolt.y - 290],
          [bolt.x + 20, bolt.y - 190],
          [bolt.x - 15, bolt.y - 130],
          [bolt.x + 9, bolt.y - 75],
          [bolt.x, bolt.y],
        ],
        '#fff6cc',
        7,
      );
    }
  }
  const actors = [...s.enemies.filter((e) => e.hp > 0)].sort((a, b) => a.y - b.y);
  let playerDrawn = false;
  for (const e of actors) {
    if (e.y > s.player.y && !playerDrawn) {
      cultivator(c, s, t);
      playerDrawn = true;
    }
    ellipse(c, e.x, e.y + 9, e.r + 3, e.r * 0.4, '#13332c55');
    if (e.mode === 'tell') {
      const dx = e.direction.x,
        dy = e.direction.y;
      polygon(
        c,
        [
          [e.x - dy * 15, e.y + dx * 15],
          [e.x + dx * 190 - dy * 30, e.y + dy * 190 + dx * 30],
          [e.x + dx * 190 + dy * 30, e.y + dy * 190 - dx * 30],
          [e.x + dy * 15, e.y - dx * 15],
        ],
        '#eeb08132',
      );
      label(c, e.kind === 'stone' ? '冲 撞' : '扑 击', e.x, e.y - 43, 14, ink.danger);
    }
    c.save();
    c.translate(e.x, e.y);
    if (e.flash > 0) c.globalAlpha = 0.5;
    if (e.kind === 'bamboo') {
      const a = Math.atan2(e.direction.y, e.direction.x);
      c.rotate(a - Math.PI / 2);
      for (let i = -1; i <= 1; i += 2) {
        line(
          c,
          [
            [i * 10, -8],
            [i * 23, 6],
            [i * 18, 19 + Math.sin(t * 9) * 3],
          ],
          '#a4b397',
          4,
        );
      }
      ellipse(c, 0, 0, 13, 19, '#345349');
      polygon(
        c,
        [
          [-12, -12],
          [-17, -29],
          [0, -20],
          [17, -29],
          [12, -12],
        ],
        '#5b8068',
      );
      ellipse(c, -5, -14, 2, 3, ink.gold);
      ellipse(c, 5, -14, 2, 3, ink.gold);
    } else if (e.kind === 'stone' || e.kind === 'dummy') {
      polygon(
        c,
        [
          [-24, 5],
          [-21, -15],
          [-7, -27],
          [18, -23],
          [26, 0],
          [17, 17],
          [-11, 20],
        ],
        e.mode === 'recover' ? '#7a9382' : '#65776b',
      );
      polygon(
        c,
        [
          [-21, -15],
          [-7, -27],
          [18, -23],
          [3, -7],
        ],
        '#a5af92',
      );
      line(
        c,
        [
          [-9, -8],
          [-3, -2],
          [4, -7],
          [11, -1],
        ],
        e.mode === 'recover' ? ink.gold : '#304c40',
        3,
      );
      if (e.mode === 'recover') {
        ring(c, 0, -33, 13, ink.gold);
        label(c, '破', 0, -27, 15, ink.gold);
      }
    } else if (e.kind === 'foxSeal') {
      fox(c, 0, 0, t, false);
      ring(c, 0, 0, 30, '#ecd39d', 2);
      for (let i = -1; i <= 1; i++)
        line(
          c,
          [
            [i * 16, -30],
            [i * 16, 25],
          ],
          '#74bdb5',
          2,
        );
    } else {
      const eye = e.kind === 'eye',
        open = !eye || s.exposed > 0;
      glow(c, 0, 0, 50, open ? '#e4d19c44' : '#517b7b44');
      c.rotate(t * (open ? 0.4 : -0.2));
      ring(c, 0, 0, eye ? 32 : 22, open ? ink.gold : ink.jade, 2);
      polygon(
        c,
        [
          [0, -23],
          [17, 0],
          [0, 23],
          [-17, 0],
        ],
        open ? '#e9d59c' : '#355755',
      );
      c.rotate(-t * (open ? 0.4 : -0.2));
      ellipse(c, 0, 0, open ? 8 : 2, 9, '#284849');
    }
    c.restore();
    c.fillStyle = '#183d36';
    c.fillRect(e.x - 23, e.y + 29, 46, 4);
    c.fillStyle = e.kind === 'eye' ? ink.gold : ink.jade;
    c.fillRect(e.x - 23, e.y + 29, (46 * e.hp) / e.maxHp, 4);
  }
  if (!playerDrawn) cultivator(c, s, t);
  if (s.fox === 'following') fox(c, s.foxPosition.x, s.foxPosition.y, t, false);
  if (s.fox === 'spent' && s.scene === 'summit') fox(c, 410, 438, t, true);
  if (s.tree) {
    line(
      c,
      [
        [s.tree.x, s.tree.y + 8],
        [s.tree.x, s.tree.y - 42],
      ],
      '#9fbd7c',
      5,
    );
    line(
      c,
      [
        [s.tree.x - 20, s.tree.y - 26],
        [s.tree.x, s.tree.y - 16],
        [s.tree.x + 18, s.tree.y - 37],
      ],
      ink.gold,
      3,
    );
    ring(c, s.tree.x, s.tree.y, 30, ink.gold);
  }
  for (const p of s.swords) {
    line(
      c,
      [
        [p.x - p.velocity.x * 0.07, p.y - p.velocity.y * 0.07],
        [p.x, p.y],
      ],
      p.strong ? '#efd89199' : '#cbead899',
      p.strong ? 5 : 2,
    );
    sword(
      c,
      p.x,
      p.y,
      Math.atan2(p.velocity.y, p.velocity.x),
      p.strong ? 1.25 : 0.9,
      p.strong ? '#ffe9ae' : '#e7efdb',
    );
  }
  for (const effect of s.cues) {
    if (effect.kind === 'step') {
      ring(c, effect.x, effect.y, 8 + (1 - effect.life) * 12, '#cfe3c233');
      continue;
    }
    if (!['hit', 'stone', 'qi', 'hurt', 'scatter', 'fox'].includes(effect.kind)) continue;
    const a = 1 - effect.life / 0.7;
    colorEffect(
      c,
      effect.x,
      effect.y,
      a,
      effect.kind === 'hurt' ? ink.danger : effect.kind === 'qi' ? ink.jade : ink.gold,
    );
  }
}
function colorEffect(c: CanvasRenderingContext2D, x: number, y: number, t: number, color: string) {
  c.globalAlpha = 1 - t;
  for (let i = 0; i < 7; i++) {
    const a = (i * Math.PI * 2) / 7;
    line(
      c,
      [
        [x + Math.cos(a) * t * 20, y + Math.sin(a) * t * 20],
        [x + Math.cos(a) * (8 + t * 32), y + Math.sin(a) * (8 + t * 32)],
      ],
      color,
      2,
    );
  }
  c.globalAlpha = 1;
}
