import type { OfficeBossPhase, OfficeSampleState } from './model.js';

export const EPSILON = 1e-8;
export const ROUTES = [
  [25, 55],
  [23, 58],
  [28, 54],
] as const;
export const CUES: Record<OfficeBossPhase, string> = {
  safe: '老板还在远处。表格里本月确认总数是 42。',
  warning: '老板开始留意这边，先收好手机，再检查电脑窗口。',
  approach: '脚步近了，老板正沿通道走来。',
  inspect: '老板经过工位，能看见屏幕和你手里的手机。',
  question: '老板问：刚才表格中，本月确认总数是多少？',
  leave: '老板转身离开，脚步渐渐远了。',
};

export function announce(state: OfficeSampleState, event: string, feedback: string) {
  state.eventId += 1;
  state.event = event;
  state.feedback = feedback;
}

export function routeAt(
  elapsed: number,
  variant: number,
): { phase: OfficeBossPhase; until: number } {
  const [first, second] = ROUTES[variant];
  const stops: [number, OfficeBossPhase][] = [
    [first, 'safe'],
    [first + 3, 'warning'],
    [first + 5, 'approach'],
    [first + 9, 'inspect'],
    [first + 13, 'leave'],
    [second, 'safe'],
    [second + 3, 'warning'],
    [second + 5, 'approach'],
    [second + 7, 'inspect'],
    [second + 13, 'question'],
    [second + 17, 'leave'],
    [91, 'safe'],
  ];
  const [until, phase] = stops.find(([end]) => end > elapsed + EPSILON)!;
  return { phase, until };
}

export function synchronizeBoss(state: OfficeSampleState) {
  const route = routeAt(state.elapsed, state.variant);
  if (state.questionUntil !== null) {
    state.boss = 'question';
    return;
  }
  let phase = route.phase;
  if (state.questionAnswered && (phase === 'inspect' || phase === 'question')) phase = 'leave';
  if (phase === state.boss) return;
  if (phase === 'warning') state.questionAnswered = false;
  state.boss = phase;
  if (phase === 'question') state.questionUntil = route.until;
  announce(state, phase, CUES[phase]);
}

/** Each optional visit happens once and shares the same elapsed clock as inspections. */
export function sceneBoundary(state: OfficeSampleState) {
  const file =
    state.variant === 1
      ? state.file === 'none'
        ? 40
        : state.file === 'offered'
          ? state.fileUntil
          : Infinity
      : Infinity;
  const phone =
    state.variant === 2
      ? state.phoneNotice === 'none'
        ? 40
        : state.phoneNotice === 'vibrating'
          ? state.notifyUntil
          : Infinity
      : Infinity;
  return Math.min(
    file,
    phone,
    state.noiseUntil > state.elapsed + EPSILON ? state.noiseUntil : Infinity,
  );
}

export function synchronizeScene(state: OfficeSampleState) {
  if (state.elapsed < 40 - EPSILON) return;
  if (state.variant === 1 && state.file === 'none') {
    state.file = 'offered';
    state.fileUntil = 47;
    announce(state, 'file-offered', '同事递来核对单，7 秒后要离开。先收好手机，腾出手接一下。');
  } else if (state.file === 'offered' && state.elapsed >= state.fileUntil - EPSILON) {
    state.file = 'missed';
    state.workConfirmed = false;
    announce(state, 'file-missed', '同事把核对单放在桌边了。稍后重新确认表格即可。');
  }
  if (state.variant === 2 && state.phoneNotice === 'none') {
    state.phoneNotice = 'vibrating';
    state.notifyUntil = 44;
    announce(state, 'phone-vibrate', '手机开始振动，4 秒后将响铃；现在可以点静音。');
  } else if (state.phoneNotice === 'vibrating' && state.elapsed >= state.notifyUntil - EPSILON) {
    state.phoneNotice = 'sounded';
    state.noiseUntil = Math.max(state.noiseUntil, state.elapsed + 0.7);
    announce(state, 'phone-ring', '手机响了一声。老板还在远处，下次看到振动可提前静音。');
  }
}
