import { nearby, type Trial } from '../domain/trial.js';
import { relicNames, sizeOf } from '../domain/world.js';
import type { TrialRecord } from '../adapter/trial-save.js';
export type TrialUi = {
  paused: boolean;
  hostPaused: boolean;
  muted: boolean;
  reduced: boolean;
  shake: boolean;
  time: number;
  record: TrialRecord;
  saving: boolean;
  notice: string;
  tapOnly: boolean;
};
export type Button = {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  disabled?: boolean;
};
export const SCREEN = { width: 480, height: 800, worldTop: 110, worldHeight: 520 };
export function camera(s: Trial) {
  const size = sizeOf(s.scene);
  return {
    x: Math.max(0, Math.min(size.x - 480, s.player.x - 240)),
    y: Math.max(0, Math.min(size.y - 520, s.player.y - 280)),
  };
}
export function getButtons(s: Trial, ui: TrialUi): Button[] {
  const buttons: Button[] = [
    { id: 'mute', label: ui.muted ? '开声' : '静音', x: 326, y: 12, w: 65, h: 55 },
    { id: 'pause', label: ui.paused ? '继续' : '暂停', x: 400, y: 12, w: 65, h: 55 },
  ];
  if (ui.hostPaused) return [];
  if (ui.paused)
    return [
      ...buttons,
      { id: 'shake', label: `镜头震动：${ui.shake ? '开' : '关'}`, x: 100, y: 348, w: 280, h: 62 },
      {
        id: 'motion',
        label: `动态效果：${ui.reduced ? '减少' : '完整'}`,
        x: 100,
        y: 422,
        w: 280,
        h: 62,
      },
      { id: 'pause', label: '继续修行', x: 100, y: 510, w: 280, h: 65 },
    ];
  if (s.phase === 'ready')
    return [...buttons, { id: 'start', label: '点香 · 开始修行', x: 85, y: 511, w: 310, h: 68 }];
  if (s.phase === 'won' || s.phase === 'lost')
    return [
      ...buttons,
      {
        id: 'restart',
        label: ui.saving ? '正在保存…' : '再入仙山',
        x: 95,
        y: 535,
        w: 290,
        h: 66,
        disabled: ui.saving,
      },
      ...(ui.notice.includes('未保存')
        ? [{ id: 'save', label: '重试保存', x: 130, y: 610, w: 220, h: 60 }]
        : []),
    ];
  if (s.pending)
    return [
      ...buttons,
      ...[-1, 0, 1].map((index, i) => ({
        id: `relic:${index}`,
        label: index === -1 ? '留在此处' : `替换 ${relicNames[s.relics[index]]}`,
        x: 85,
        y: 370 + i * 76,
        w: 310,
        h: 64,
      })),
    ];
  const near = nearby(s);
  const interaction = near.relic
    ? `收取 · ${relicNames[near.relic.relic]}`
    : (near.portal?.label ??
      (near.spring ? (s.breathing !== null ? '松开 · 收气' : '按住 · 吐纳') : '靠近灵脉或机缘'));
  buttons.push(
    {
      id: 'interact',
      label: interaction,
      x: 158,
      y: 649,
      w: 174,
      h: 63,
      disabled: !near.spring && !near.portal && !near.relic,
    },
    { id: 'dodge', label: '闪避', x: 176, y: 726, w: 72, h: 62, disabled: s.dodgeCooldown > 0 },
    {
      id: 'sword',
      label: s.charge !== null ? (s.charge >= 0.55 && s.qi >= 18 ? '松手出剑' : '蓄势') : '御剑',
      x: 345,
      y: 663,
      w: 116,
      h: 116,
      disabled: s.shield > 0,
    },
  );
  if (s.relics.includes('shield'))
    buttons.push({
      id: 'shield',
      label: '灵玉护体 Q',
      x: 24,
      y: 559,
      w: 115,
      h: 56,
      disabled: s.qi < 15 || s.shield > 0,
    });
  if (s.relics.includes('wood'))
    buttons.push({
      id: 'wood',
      label: s.woodUsed ? '木种已用' : '引雷木 R',
      x: 151,
      y: 559,
      w: 115,
      h: 56,
      disabled: s.woodUsed || s.scene !== 'summit',
    });
  return buttons;
}
