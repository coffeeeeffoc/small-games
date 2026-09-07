import type { OfficeSampleAction, OfficeSampleState } from './model.js';

export type SampleControl = {
  id: string;
  label: string;
  detail?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  action: OfficeSampleAction | 'sound' | 'retry-load' | 'retry-save';
};
export type SampleView = {
  state: OfficeSampleState;
  ready: boolean;
  error: string;
  sound: boolean;
  best: number;
  saving: 'idle' | 'pending' | 'saved' | 'failed';
};

export const bossLabels: Record<OfficeSampleState['boss'], string> = {
  safe: '老板还在远处',
  warning: '老板留意这边了，准备收好',
  approach: '脚步正在靠近，提前收好',
  inspect: '老板正在看向你的工位',
  question: '“刚才那一列，合计多少？”',
  leave: '他转身了，再等一小会儿',
};

export function sampleControls(view: SampleView): SampleControl[] {
  const { state } = view;
  const controls: SampleControl[] = [
    {
      id: 'sound',
      label: view.sound ? '声音开' : '声音关',
      x: 256,
      y: 22,
      w: 64,
      h: 42,
      action: 'sound',
    },
  ];
  if (view.error)
    return [
      ...controls,
      {
        id: 'retry-load',
        label: '重新加载场景',
        x: 24,
        y: 750,
        w: 342,
        h: 54,
        action: 'retry-load',
      },
    ];
  if (!view.ready) return controls;
  if (state.status === 'intro')
    return [
      ...controls,
      {
        id: 'start',
        label: '坐下来，开始这 90 秒',
        detail: '键盘 Enter',
        x: 24,
        y: 748,
        w: 342,
        h: 58,
        action: { type: 'start' },
      },
    ];
  controls.push({
    id: 'pause',
    label: state.status === 'paused' ? '继续' : '暂停',
    x: 324,
    y: 22,
    w: 48,
    h: 42,
    action: { type: state.status === 'paused' ? 'resume' : 'pause' },
  });
  if (state.status === 'paused')
    return [
      ...controls,
      {
        id: 'resume',
        label: '准备好了，继续',
        x: 24,
        y: 748,
        w: 342,
        h: 58,
        action: { type: 'resume' },
      },
    ];
  if (['won', 'failed', 'caught'].includes(state.status))
    return [
      ...controls.filter((control) => control.id !== 'pause'),
      {
        id: 'restart',
        label: '再来一次 · 免费',
        x: 24,
        y: 748,
        w: 342,
        h: 58,
        action: { type: 'restart', variant: (state.variant + 1) % 3 },
      },
      ...(view.saving === 'failed'
        ? [
            {
              id: 'retry-save',
              label: '纪录未保存 · 点击重试',
              x: 24,
              y: 696,
              w: 342,
              h: 38,
              action: 'retry-save' as const,
            },
          ]
        : []),
    ];
  controls.push(
    {
      id: 'pc',
      label: state.pc === 'work' ? '切到休闲窗口' : '切回工作表格',
      detail: 'E',
      x: 24,
      y: 687,
      w: 166,
      h: 52,
      action: { type: state.pc === 'work' ? 'pc-entertainment' : 'pc-work' },
    },
    {
      id: 'phone',
      label:
        state.phone === 'stowing' ? '正在收好…' : state.phone === 'working' ? '拿起手机' : '轻放',
      detail: 'Space',
      x: 200,
      y: 687,
      w: state.phone === 'working' ? 166 : 88,
      h: 52,
      action: { type: state.phone === 'working' ? 'phone-start' : 'phone-stop' },
    },
  );
  if (state.phone !== 'working')
    controls.push({
      id: 'phone-fast',
      label: '快收',
      detail: '有声',
      x: 296,
      y: 687,
      w: 70,
      h: 52,
      action: { type: 'phone-stop-fast' },
    });
  if (state.file === 'offered')
    controls.push({
      id: 'take-file',
      label:
        state.phone === 'working'
          ? `接过同事的文件 · ${Math.ceil(state.fileUntil - state.elapsed)} 秒`
          : '先收好手机，再接文件',
      x: 24,
      y: 476,
      w: 342,
      h: 44,
      action: { type: 'take-file' },
    });
  if (state.phoneNotice === 'vibrating')
    controls.push({
      id: 'silence-phone',
      label: `手机在振动 · 轻触静音 ${Math.ceil(state.notifyUntil - state.elapsed)} 秒`,
      x: 24,
      y: 476,
      w: 342,
      h: 44,
      action: { type: 'silence-phone' },
    });
  if (state.boss === 'question' && !state.questionAnswered && state.workConfirmed) {
    controls.push(
      {
        id: 'answer',
        label: '合计 42',
        x: 24,
        y: 750,
        w: 166,
        h: 48,
        action: { type: 'answer', value: 42 },
      },
      {
        id: 'wrong-answer',
        label: '好像是 24',
        x: 200,
        y: 750,
        w: 166,
        h: 48,
        action: { type: 'answer', value: 24 },
      },
    );
  } else {
    controls.push({
      id: 'confirm',
      label: state.workConfirmed ? '数据已核对 · 合计 42' : '核对表格 · 确认合计 42',
      detail: 'Enter',
      x: 24,
      y: 750,
      w: 342,
      h: 48,
      action: { type: 'confirm-data', value: 42 },
    });
  }
  // Introduce one action at a time; keyboard shortcuts remain available to repeat players.
  return controls.filter((control) => {
    if (state.elapsed < 6 && !state.workConfirmed && ['pc', 'phone'].includes(control.id))
      return false;
    if (state.elapsed < 6 && state.phone === 'working' && control.id === 'phone') return false;
    return true;
  });
}

export function sampleSummary(view: SampleView): string {
  const { state } = view;
  if (view.error) return view.error;
  if (!view.ready) return '正在布置工位，加载人物与动作…';
  if (state.status === 'intro')
    return '工位偷闲。90 秒内攒够 20 秒快乐，确认表格合计 42；手机与电脑要分别收尾。';
  if (state.status === 'paused') return '已暂停，时间与巡查都已停下。';
  return `${state.feedback} ${bossLabels[state.boss]}。快乐 ${Math.floor(state.joy)} / 20 秒；${state.workConfirmed ? '工作已确认' : '工作待确认'}；剩余 ${Math.ceil(90 - state.elapsed)} 秒。`;
}
