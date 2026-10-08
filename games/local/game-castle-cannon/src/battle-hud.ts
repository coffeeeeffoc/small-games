import { C, box, text, ellipse } from './art-primitives.js';
import { alive, RELOAD } from './rules.js';
import type { View, Hit } from './view.js';
/** Corner controls leave the cannon, approach and gate unobstructed. */
export function battleHud(c: CanvasRenderingContext2D, v: View, hits: Hit[]) {
  box(c, 20, 18, 118, 48, '#362f25e8', 12);
  c.strokeStyle = '#ccb185';
  c.lineWidth = 2;
  c.stroke();
  ellipse(c, 45, 45, 14, 17, '#bb8453');
  ellipse(c, 46, 43, 11, 14, '#e7b178');
  const steel = c.createLinearGradient(29, 22, 57, 44);
  steel.addColorStop(0, '#9ab5bf');
  steel.addColorStop(0.35, '#367bad');
  steel.addColorStop(1, '#203d57');
  c.fillStyle = steel;
  c.beginPath();
  c.arc(45, 36, 16, Math.PI, 0);
  c.fill();
  c.strokeStyle = '#cccfbd';
  c.lineWidth = 2;
  c.stroke();
  c.fillStyle = '#91a8ad';
  c.fillRect(28, 35, 34, 4);
  c.fillRect(29, 38, 5, 16);
  c.fillRect(56, 38, 5, 16);
  c.fillStyle = '#2c332e';
  c.fillRect(38, 42, 3, 3);
  c.fillRect(50, 42, 3, 3);
  ellipse(c, 46, 47, 4, 3, '#edb36f');
  ellipse(c, 41, 52, 5, 2.5, '#533928');
  ellipse(c, 50, 52, 5, 2.5, '#533928');
  text(c, String(alive(v.b).length), 97, 53, 31, '#fff0d0', 'center');
  box(c, 886, 16, 56, 56, '#362f25df', 12);
  c.fillStyle = '#fff0d0';
  c.fillRect(902, 29, 7, 29);
  c.fillRect(918, 29, 7, 29);
  hits.push({ id: 'pause', label: '暂停', x: 880, y: 10, w: 68, h: 68 });
  for (const [i, id] of ['solid', 'blast'].entries()) {
    const x = 20 + i * 82,
      selected = v.ammo === id;
    box(c, x, 444, 74, 79, selected ? '#cba968' : '#806d50', 12);
    box(c, x + 3, 447, 68, 73, '#292b29e8', 10);
    c.strokeStyle = selected ? '#e2c58c' : '#a18a62';
    c.lineWidth = 2;
    c.stroke();
    const g = c.createRadialGradient(x + 29, 466, 2, x + 37, 477, 22);
    g.addColorStop(0, id === 'solid' ? '#a8aaa0' : '#ffe795');
    g.addColorStop(0.45, id === 'solid' ? '#525c5c' : '#e78420');
    g.addColorStop(1, id === 'solid' ? '#202c30' : '#673320');
    c.fillStyle = g;
    c.beginPath();
    c.arc(x + 37, 477, 21, 0, Math.PI * 2);
    c.fill();
    if (id === 'blast') {
      c.strokeStyle = '#fff0a6';
      c.lineWidth = 1.4;
      for (let spark = 0; spark < 4; spark++) {
        const angle = spark * 1.6;
        c.beginPath();
        c.moveTo(x + 37 + Math.cos(angle) * 18, 477 + Math.sin(angle) * 18);
        c.bezierCurveTo(
          x + 54,
          458 + spark * 6,
          x + 18,
          475 + spark * 3,
          x + 37 + Math.cos(angle + 2) * 16,
          477 + Math.sin(angle + 2) * 16,
        );
        c.stroke();
      }
    }
    text(c, id === 'solid' ? '实心弹' : '爆破弹', x + 37, 513, 15, '#fff0d0', 'center');
    hits.push({ id, label: id === 'solid' ? '实心弹' : '爆破弹', x, y: 444, w: 74, h: 79 });
  }
  c.strokeStyle = '#262b2ce8';
  c.lineWidth = 7;
  c.beginPath();
  c.arc(227, 491, 22, 0, Math.PI * 2);
  c.stroke();
  c.strokeStyle = v.b.reload > 0 ? '#4695b9' : '#e4c482';
  c.beginPath();
  c.arc(227, 491, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - v.b.reload / RELOAD));
  c.stroke();
  if (v.b.reload > 0) text(c, v.b.reload.toFixed(1), 227, 497, 15, '#fff0d0', 'center');
  if (v.b.capture > 0) {
    box(c, 750, 483, 190, 35, '#362f25cc', 8);
    text(c, `占领 ${Math.round(v.b.capture * 100)}%`, 845, 507, 17, '#fff0d0', 'center');
  }
  text(c, `${Math.ceil(v.b.level.duration - v.b.time)}s`, 855, 42, 16, '#fff0d0', 'right');
  const feedback =
    v.b.time < v.feedbackUntil && v.feedback !== '炮弹出膛' ? v.feedback : v.b.notice;
  if (
    v.b.time < 4 ||
    v.b.time - v.b.lastArrow < 1.4 ||
    v.b.shots.length ||
    v.b.time < v.feedbackUntil
  ) {
    c.save();
    c.shadowColor = '#302923';
    c.shadowBlur = 4;
    text(c, feedback, 574, 523, 17, '#fff2d4', 'center');
    c.restore();
  }
  if (v.practice) text(c, '开发试玩 · 不记录奖励', 480, 30, 15, C.cream, 'center');
}
