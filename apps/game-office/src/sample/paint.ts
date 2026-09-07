import { bossLabels, sampleControls, type SampleView } from './presentation.js';
import { drawScene, type SceneImages } from './scene.js';

const ink = '#eae7db';
const mute = '#a9b5ae';
const mint = '#c7dda9';
const dark = '#15241f';
const warning = '#ecc38e';
const font = '"Microsoft YaHei", "PingFang SC", sans-serif';

function box(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  context.fillStyle = color;
  context.fillRect(x, y, w, h);
}
function text(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size = 14,
  color = ink,
  bold = false,
) {
  context.fillStyle = color;
  context.font = `${bold ? '600 ' : ''}${size}px ${font}`;
  context.fillText(value, x, y);
}
function wrapped(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  width: number,
  color = mute,
  size = 13,
  maxLines = 3,
) {
  context.font = `${size}px ${font}`;
  let line = '';
  let row = 0;
  for (const character of value) {
    if (context.measureText(line + character).width > width) {
      text(context, line, x, y + row * (size + 7), size, color);
      row += 1;
      if (row >= maxLines) return;
      line = '';
    }
    line += character;
  }
  if (line) text(context, line, x, y + row * (size + 7), size, color);
}

export function paintSample(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  view: SampleView,
  images: SceneImages | null,
  phaseTime: number,
  poseTime = view.state.elapsed,
) {
  context.save();
  const scale = Math.min(width / 390, height / 844);
  box(context, 0, 0, width, height, '#0b1511');
  context.translate((width - 390 * scale) / 2, (height - 844 * scale) / 2);
  context.scale(scale, scale);
  box(context, 0, 0, 390, 844, dark);
  if (images) drawScene(context, images, view.state, phaseTime, poseTime);
  const { state } = view;
  text(context, '打工人摸鱼记', 24, 40, 19, ink, true);
  text(context, `工位偷闲  /  周五 17:58`, 24, 64, 11, mute);
  box(context, 24, 81, 342, 1, '#425047');
  if (view.ready && state.status === 'playing') {
    const color = state.boss === 'safe' || state.boss === 'leave' ? mint : warning;
    box(context, 16, 102, 358, 46, '#15241feb');
    text(context, bossLabels[state.boss], 29, 123, 13, color, true);
    text(
      context,
      `剩余 ${String(Math.ceil(90 - state.elapsed)).padStart(2, '0')} 秒`,
      29,
      139,
      10,
      mute,
    );
    box(context, 16, 533, 358, 49, '#15241fed');
    box(context, 22, 539, 90, 37, state.pc === 'work' ? '#d9e3df' : '#223b60');
    text(context, '电脑画面', 27, 547, 6, state.pc === 'work' ? dark : ink);
    if (state.pc === 'work') {
      text(context, '项目 A   18    项目 B   24', 27, 559, 6, dark);
      text(context, '本月合计       42', 27, 570, 7, dark, true);
    } else {
      box(context, 27, 551, 78, 17, '#779fb8');
      box(context, 30 + ((state.elapsed * 7) % 63), 554, 7, 11, warning);
      text(context, '休闲频道 · 播放中', 27, 574, 6, ink);
    }
    text(
      context,
      `屏幕：${state.pc === 'work' ? '工作表格 · 合计 42' : '休闲窗口 · 仍然可见'}`,
      123,
      553,
      12,
      state.pc === 'work' ? ink : warning,
    );
    const phone =
      state.phone === 'working'
        ? '已收好'
        : state.phone === 'stowing'
          ? `收回中 ${Math.round((1 - state.phoneProgress) * 100)}%`
          : state.phone === 'pickup'
            ? '正在伸手拿起…'
            : '在手中 · 需要单独收好';
    text(context, `手机：${phone}`, 123, 572, 11, state.phone === 'working' ? mute : warning);
  }
  box(context, 0, 590, 390, 254, dark);
  box(context, 24, 590, 342, 1, '#425047');
  if (view.error || !view.ready) {
    text(context, view.error ? '工位还没准备好' : '正在布置工位', 24, 628, 24, ink, true);
    wrapped(context, view.error || '正在加载人物、环境和动作。稍等一下。', 24, 660, 338);
  } else if (state.status === 'intro') {
    text(context, '偷一点，属于自己的时间。', 24, 631, 23, ink, true);
    wrapped(
      context,
      '90 秒，攒够 20 秒快乐。先核对表格，再找空当看看手机。听见脚步，记得分别收好手机和电脑窗口。',
      24,
      665,
      338,
      mute,
      13,
      3,
    );
  } else if (state.status === 'paused') {
    text(context, '先歇一会儿。', 24, 632, 27, ink, true);
    wrapped(
      context,
      '时间停在这里。准备好再继续；已经拿起的手机，会从当前姿态收回。',
      24,
      669,
      338,
    );
  } else if (['won', 'failed', 'caught'].includes(state.status)) {
    text(
      context,
      state.status === 'won'
        ? '这点快乐，归你了。'
        : state.status === 'caught'
          ? '这一眼，没躲过去。'
          : '再找一个好时机。',
      24,
      630,
      25,
      ink,
      true,
    );
    wrapped(context, state.feedback, 24, 657, 338, mute, 13, 2);
    if (view.saving !== 'failed')
      text(
        context,
        `快乐 ${state.joy.toFixed(1)} 秒 · 最佳 ${view.best.toFixed(1)} 秒  ${view.saving === 'pending' ? '保存中…' : view.saving === 'saved' ? '已保存' : ''}`,
        24,
        719,
        12,
        mint,
      );
  } else {
    text(context, '今日的小目标', 24, 613, 11, mute);
    text(context, `${state.joy.toFixed(1)} / 20 秒快乐`, 24, 640, 19, mint, true);
    text(
      context,
      state.workConfirmed ? '数据已确认' : '数据待确认',
      279,
      636,
      12,
      state.workConfirmed ? mint : warning,
    );
    box(context, 24, 650, 342, 3, '#455249');
    box(context, 24, 650, 342 * Math.min(1, state.joy / 20), 3, mint);
    wrapped(context, state.feedback, 24, 673, 342, mute, 11, 1);
  }
  for (const control of sampleControls(view)) {
    const top = control.y < 90;
    const primary = ['start', 'restart', 'resume', 'answer'].includes(control.id);
    box(
      context,
      control.x,
      control.y,
      control.w,
      control.h,
      primary ? mint : top ? '#24352d' : '#2c3e33',
    );
    text(
      context,
      control.label,
      control.x + (top ? 8 : 13),
      control.y + control.h / 2 + 5,
      top ? 10 : 13,
      primary ? dark : ink,
      !top,
    );
    if (control.detail && !primary)
      text(context, control.detail, control.x + control.w - 39, control.y + 12, 9, mute);
  }
  text(context, '点道具或按钮操作  ·  Esc 暂停  ·  关闭声音也能玩', 38, 827, 10, mute);
  context.restore();
}
