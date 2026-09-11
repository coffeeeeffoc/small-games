import { targetInReach, WORLD } from './model.js';
import type { OfficeView, OfficeAction } from './runtime.js';
export type NativeControl = {
  id: OfficeAction;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
};
export function getNativeControls(view: OfficeView, w: number, h: number): NativeControl[] {
  const status = view.state.status;
  const primary = (id: OfficeAction, label: string): NativeControl => ({
    id,
    label,
    x: w * 0.12,
    y: h * 0.65,
    w: w * 0.76,
    h: 56,
  });
  if (view.hostPaused) return [];
  if (status === 'ready') return [primary('start', '悄悄进入办公室')];
  if (status === 'paused') return [primary('resume', '继续潜入')];
  if (status === 'won' || status === 'lost') return [primary('retry', '再试一条路线')];
  return [
    { id: 'pause', label: '暂停', x: w - 72, y: 14, w: 58, h: 40 },
    {
      id: 'crouch',
      label: view.state.crouched ? '站起来' : '蹲下',
      x: w - 126,
      y: h - 153,
      w: 110,
      h: 44,
    },
    {
      id: 'interact',
      label: targetInReach(view.state)?.label ?? '靠近物品',
      x: w - 142,
      y: h - 96,
      w: 126,
      h: 62,
    },
  ];
}

export function drawNative(ctx: CanvasRenderingContext2D, w: number, h: number, view: OfficeView) {
  const { state } = view;
  ctx.fillStyle = '#172e29d9';
  ctx.fillRect(0, 0, w, 104);
  ctx.fillStyle = '#e9e6d5';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('周一 09:08 · 迟到潜入', 16, 32);
  ctx.font = '13px sans-serif';
  ctx.fillText(`抵达右后方工位 · ${Math.ceil(WORLD.timeLimit - state.elapsed)}秒`, 16, 60);
  ctx.fillText(
    `怀疑 ${Math.round(state.suspicion)}% · ${state.boss.visible ? '老板看见你了' : '利用屏风和资料柜遮挡'}`,
    16,
    86,
  );
  const status = state.status;
  if (status !== 'playing') {
    ctx.fillStyle = '#102b26dc';
    ctx.fillRect(w * 0.06, h * 0.22, w * 0.88, h * 0.51);
    ctx.fillStyle = '#efe8d1';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(
      status === 'won'
        ? '有惊无险，坐下了'
        : status === 'lost'
          ? '被老板叫住了'
          : status === 'paused'
            ? '已暂停'
            : '迟到的最后一分钟',
      w * 0.1,
      h * 0.29,
    );
    ctx.font = '15px sans-serif';
    const lines =
      status === 'ready'
        ? [
            '左下拖动：前后左右移动',
            '右侧拖动：环顾办公室',
            '蹲下躲过屏风，靠近物件后互动',
            '目标：右后方亮屏电脑，坐下打卡',
            '完整一周场景将逐步开放',
          ]
        : status === 'won'
          ? [`潜入得分 ${state.score} · 最佳 ${view.best}`, '首关完成，后续日程待制作']
          : status === 'lost'
            ? [state.feedback, '重新观察老板朝向，选择掩体路线']
            : ['准备好了再继续'];
    lines.forEach((text, i) => ctx.fillText(text, w * 0.1, h * 0.36 + i * 27));
  } else {
    ctx.fillStyle = '#19362bb0';
    ctx.fillRect(16, h - 136, 104, 104);
    ctx.fillStyle = '#e2dfc9';
    ctx.font = '14px sans-serif';
    ctx.fillText('拖动移动', 36, h - 77);
    ctx.font = '13px sans-serif';
    ctx.fillText(state.feedback, 16, h - 172);
  }
  for (const button of getNativeControls(view, w, h)) {
    ctx.fillStyle = button.id === 'interact' || button.id === 'start' ? '#c69858' : '#3b5950';
    ctx.fillRect(button.x, button.y, button.w, button.h);
    ctx.fillStyle = '#fff1d7';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(button.label, button.x + button.w / 2, button.y + button.h / 2 + 5);
    ctx.textAlign = 'left';
  }
}
