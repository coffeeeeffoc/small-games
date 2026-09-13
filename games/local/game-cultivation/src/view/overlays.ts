import { trialScore, type Trial } from '../domain/trial.js';
import { relicDescriptions, relicNames } from '../domain/world.js';
import { ink, label, line } from './paint.js';
import type { TrialUi } from './ui.js';
export function drawOverlay(c: CanvasRenderingContext2D, s: Trial, ui: TrialUi) {
  if (
    !ui.paused &&
    !ui.hostPaused &&
    s.phase !== 'ready' &&
    s.phase !== 'won' &&
    s.phase !== 'lost' &&
    !s.pending
  )
    return;
  c.fillStyle = s.phase === 'won' ? '#102c2dcb' : '#102c2de8';
  c.fillRect(0, 110, 480, 690);
  line(
    c,
    [
      [36, 155],
      [36, 730],
      [444, 730],
      [444, 155],
    ],
    '#d6bd7544',
  );
  label(c, '青 云 山  ·  修 行 录', 240, 192, 16, ink.gold);
  if (ui.paused || ui.hostPaused) {
    label(c, '修行已暂停', 240, 266, 34);
    label(c, '归来时，山风仍在。', 240, 308, 18, ink.jade);
  } else if (s.pending) {
    label(c, relicNames[s.pending], 240, 264, 34, ink.gold);
    label(c, relicDescriptions[s.pending], 240, 310, 16);
    label(c, '行囊只能带两件机缘。', 240, 342, 17, ink.jade);
  } else if (s.phase === 'ready') {
    label(c, '三分钟', 240, 278, 48);
    label(c, '修 仙', 240, 345, 62, ink.gold);
    line(
      c,
      [
        [192, 378],
        [288, 378],
      ],
      '#c4b483',
      1,
    );
    label(c, '亲手引气，御剑寻缘。', 240, 417, 20);
    label(c, '一炷香后，以此身叩问天雷。', 240, 454, 18, ink.jade);
    label(c, '左手行走 · 右手蓄剑 · 松手出剑', 240, 622, 16);
    label(c, '靠近灵脉，按住吐纳，适时收气', 240, 653, 16, '#b5c8b7');
    label(c, '键盘 WASD / 方向键 · 空格御剑 · E 吐纳 · Shift 闪避', 240, 694, 12, '#a8bbb0');
  } else {
    label(
      c,
      s.phase === 'won' ? '筑 基 已 成' : '此 行 未 尽',
      240,
      273,
      39,
      s.phase === 'won' ? ink.gold : ink.paper,
    );
    label(
      c,
      s.phase === 'won' ? '云开见月，断剑有了自己的光。' : '留住这次经历，再走一段仙途。',
      240,
      316,
      18,
      ink.jade,
    );
    label(c, `${trialScore(s)}  道行`, 240, 371, 31, ink.gold);
    label(c, `破劫 ${s.wave} / 3  ·  机缘 ${s.collected.length}  ·  历练 ${s.kills}`, 240, 409, 16);
    for (const [i, text] of s.journal.slice(-3).entries())
      label(c, text, 240, 446 + i * 24, 15, '#cbd1b7');
    if (s.phase === 'lost')
      label(
        c,
        s.message.length > 28 ? s.message.slice(0, 28) : s.message,
        240,
        515,
        14,
        ink.danger,
      );
    label(
      c,
      ui.notice || `试炼 ${ui.record.runs} 次 · 筑基 ${ui.record.wins} 次 · 最佳 ${ui.record.best}`,
      240,
      701,
      14,
      ui.notice.includes('未保存') ? ink.danger : ink.jade,
    );
  }
}
