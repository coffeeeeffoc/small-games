import { playing, type Trial } from '../domain/trial.js';
import { relicNames } from '../domain/world.js';
import { drawActors } from './actors.js';
import { drawScenery } from './scenery.js';
import { drawOverlay } from './overlays.js';
import { ellipse, ink, label, line, ring, sword } from './paint.js';
import { camera, getButtons, type TrialUi } from './ui.js';

export function drawTrial(
  c: CanvasRenderingContext2D,
  s: Trial,
  ui: TrialUi,
  width: number,
  height: number,
  title: string,
) {
  c.save();
  c.scale(width / 480, height / 800);
  c.fillStyle = ink.dark;
  c.fillRect(0, 0, 480, 800);
  const offset = camera(s),
    t = ui.reduced ? 0 : ui.time;
  c.save();
  c.beginPath();
  c.rect(0, 110, 480, 520);
  c.clip();
  c.translate(-offset.x, 110 - offset.y);
  if (
    ui.shake &&
    !ui.reduced &&
    !ui.paused &&
    s.cues.some((e) => e.kind === 'hurt' || e.kind === 'thunder')
  )
    c.translate(Math.sin(t * 93) * 2, Math.cos(t * 79) * 2);
  drawScenery(c, s, t);
  drawActors(c, s, t);
  c.restore();
  const shade = c.createLinearGradient(0, 110, 0, 205);
  shade.addColorStop(0, '#102c2dcc');
  shade.addColorStop(1, '#102c2d00');
  c.fillStyle = shade;
  c.fillRect(0, 110, 480, 95);
  label(c, title, 22, 38, 25, ink.paper, 'left');
  const remaining =
    s.phase === 'tribulation'
      ? s.balance.tribulationSeconds - s.trialTime
      : s.balance.preparationSeconds - s.elapsed;
  const stage = s.scene === 'cave' ? '山腰洞府' : s.scene === 'forest' ? '雾竹秘境' : '云顶渡劫';
  label(
    c,
    `${stage}   /   ${s.phase === 'won' ? '筑基' : s.scene === 'summit' ? `第 ${Math.min(3, s.wave + 1)} 重` : '炼气'}`,
    22,
    66,
    14,
    ink.jade,
    'left',
  );
  for (const [i, title, value, max, color] of [
    [0, '气血', s.health, s.balance.health, '#cc9d80'],
    [1, '真气', s.qi, 100, ink.jade],
  ] as const) {
    const x = 22 + i * 238;
    c.fillStyle = '#264740';
    c.fillRect(x, 85, 200, 5);
    c.fillStyle = color;
    c.fillRect(x, 85, 200 * Math.max(0, value / max), 5);
    label(c, `${title} ${Math.ceil(value)} / ${max}`, x, 104, 18, '#cfdbc7', 'left');
  }
  label(c, stage, 22, 141, 20, ink.paper, 'left');
  label(
    c,
    s.phase === 'tribulation' ? `破劫 ${s.wave}/3` : '一炷香 · 筑基试炼',
    22,
    163,
    13,
    '#b7d2bd',
    'left',
  );
  if (playing(s))
    label(
      c,
      `${Math.max(0, Math.ceil(remaining))} 秒`,
      454,
      144,
      24,
      remaining < 20 ? ink.danger : ink.gold,
      'right',
    );
  for (const [i, relic] of s.relics.entries())
    label(c, relicNames[relic], 454, 170 + i * 21, 13, ink.gold, 'right');
  if (s.scene === 'forest') {
    c.fillStyle = '#102c2d88';
    c.fillRect(403, 212, 60, 84);
    line(
      c,
      [
        [414, 286],
        [428, 270],
        [440, 252],
        [448, 239],
        [433, 224],
      ],
      '#87bea077',
      2,
    );
    ellipse(c, 408 + (s.player.x / 760) * 50, 217 + (s.player.y / 1080) * 74, 2.5, 2.5, ink.gold);
    label(c, '北 · 渡劫台', 433, 310, 10, '#d4dbc0');
  }
  c.fillStyle = '#102c2ddd';
  c.fillRect(0, 617, 480, 183);
  line(
    c,
    [
      [20, 636],
      [460, 636],
    ],
    '#bcb47b44',
  );
  const hint =
    s.messageTime > 0
      ? s.message
      : s.scene === 'cave'
        ? '灵脉收气 → 御剑试锋 → 沿石径出关'
        : s.scene === 'forest'
          ? '沿石径向北 · 妖兽蓄势时闪开，扑空后出剑'
          : s.exposed > 0
            ? '劫眼已开 · 御剑破劫！'
            : '留意地上雷纹，雷落后出剑';
  if (playing(s)) label(c, hint.length > 31 ? hint.slice(0, 31) : hint, 240, 631, 13, ink.paper);
  if (playing(s)) {
    ring(c, 84, 719, 56, '#85baa653', 2);
    ring(c, 84, 719, 44, '#719c8955');
    ellipse(c, 84 + s.move.x * 25, 719 + s.move.y * 25, 23, 23, '#7eb39c3d');
    ring(c, 84 + s.move.x * 25, 719 + s.move.y * 25, 23, '#b5d6b080', 1.5);
    label(c, ui.tapOnly ? '点地行走' : '行走', 84, 789, 13, ink.jade);
    if (s.dodgeCooldown > 0)
      ring(c, 212, 757, 32, '#c4cfaa66', 2, (s.dodgeCooldown / 1.1) * Math.PI * 2);
  }
  drawOverlay(c, s, ui);
  for (const button of getButtons(s, ui)) {
    c.globalAlpha = button.disabled ? 0.38 : 1;
    const special = button.id === 'sword';
    if (special) {
      ellipse(c, 403, 721, 56, 56, '#3e6f5a');
      ring(c, 403, 721, 56, ink.gold, 2);
      ring(c, 403, 721, 49, '#c6d6a744');
      sword(c, 403, 704, -Math.PI / 4, 0.7);
      label(c, button.label, 403, 746, 20, ink.gold);
    } else {
      c.fillStyle = ['start', 'restart'].includes(button.id) ? '#c5b57d' : '#203f37';
      c.fillRect(button.x, button.y, button.w, button.h);
      c.strokeStyle = '#a5b78766';
      c.lineWidth = 1;
      c.strokeRect(button.x + 0.5, button.y + 0.5, button.w - 1, button.h - 1);
      label(
        c,
        button.label,
        button.x + button.w / 2,
        button.y + button.h / 2 + 6,
        18,
        ['start', 'restart'].includes(button.id) ? ink.dark : ink.paper,
      );
    }
    c.globalAlpha = 1;
  }
  c.restore();
}
