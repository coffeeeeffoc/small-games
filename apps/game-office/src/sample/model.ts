import {
  announce,
  CUES,
  EPSILON,
  ROUTES,
  routeAt,
  sceneBoundary,
  synchronizeBoss,
  synchronizeScene,
} from './timeline.js';

export type OfficeBossPhase = 'safe' | 'warning' | 'approach' | 'inspect' | 'question' | 'leave';
export type OfficeSampleAction =
  | {
      type:
        | 'start'
        | 'pause'
        | 'resume'
        | 'pc-entertainment'
        | 'pc-work'
        | 'phone-start'
        | 'phone-stop'
        | 'phone-stop-fast'
        | 'silence-phone'
        | 'take-file'
        | 'cancel-input';
    }
  | { type: 'confirm-data' | 'answer'; value: number }
  | { type: 'restart'; variant?: number };

/** All rule and animation state for the independent ninety-second desk sample. */
export type OfficeSampleState = {
  status: 'intro' | 'playing' | 'paused' | 'won' | 'failed' | 'caught';
  variant: number;
  elapsed: number;
  joy: number;
  boss: OfficeBossPhase;
  pc: 'work' | 'entertainment';
  phone: 'working' | 'pickup' | 'using' | 'stowing';
  phoneProgress: number;
  phoneStowFast: boolean;
  noiseUntil: number;
  phoneNotice: 'none' | 'vibrating' | 'silenced' | 'sounded';
  notifyUntil: number;
  file: 'none' | 'offered' | 'accepted' | 'missed';
  fileUntil: number;
  activity: 'none' | 'pc' | 'phone';
  workConfirmed: boolean;
  displayedTotal: number;
  questionUntil: number | null;
  questionAnswered: boolean;
  exposure: number;
  feedback: string;
  eventId: number;
  event: string;
};

const PICKUP_SECONDS = 0.5;
const OBSERVATION_SECONDS = 0.35;

/** Creates one of three visible, deterministic routes; retry never costs currency. */
export function createOfficeSample(variant = 0): OfficeSampleState {
  if (!Number.isInteger(variant) || variant < 0 || variant >= ROUTES.length) {
    throw new RangeError('Office sample variant must be 0, 1, or 2.');
  }
  return {
    status: 'intro',
    variant,
    elapsed: 0,
    joy: 0,
    boss: 'safe',
    pc: 'work',
    phone: 'working',
    phoneProgress: 0,
    phoneStowFast: false,
    noiseUntil: 0,
    phoneNotice: 'none',
    notifyUntil: 0,
    file: 'none',
    fileUntil: 0,
    activity: 'none',
    workConfirmed: false,
    displayedTotal: 42,
    questionUntil: null,
    questionAnswered: false,
    exposure: 0,
    feedback: '先确认表格总数，再找空当休息；90 秒内攒够 20 秒快乐。',
    eventId: 0,
    event: 'intro',
  };
}

function hasEvidence(state: OfficeSampleState) {
  return state.pc === 'entertainment' || state.phone !== 'working';
}

function stopInput(state: OfficeSampleState) {
  state.activity = 'none';
  state.phoneStowFast = false;
  if (state.phone === 'pickup' || state.phone === 'using') state.phone = 'stowing';
}

function settle(state: OfficeSampleState) {
  state.elapsed = 90;
  const complete = state.workConfirmed && state.joy >= 20 - EPSILON && !hasEvidence(state);
  state.status = complete ? 'won' : 'failed';
  state.activity = 'none';
  const reason = !state.workConfirmed
    ? '还没有完成表格数据确认。'
    : hasEvidence(state)
      ? '时间到了，娱乐窗口或手机还没有收好。'
      : '这次休息还不足 20 秒，可以免费再试。';
  announce(state, state.status, complete ? '数据确认完毕，也留住了自己的休息时间。下班！' : reason);
}

/** Advances exact event boundaries instead of counting frames; background time is not accepted. */
export function updateOfficeSample(state: OfficeSampleState, dt: number): OfficeSampleState {
  if (!Number.isFinite(dt) || dt < 0 || dt > 1)
    throw new RangeError('dt must be finite and within 0..1 seconds.');
  if (state.status !== 'playing' || dt === 0) return state;
  const next = { ...state };
  const target = Math.min(90, state.elapsed + dt);
  while (next.elapsed < target - EPSILON && next.status === 'playing') {
    synchronizeBoss(next);
    synchronizeScene(next);
    const moving = next.phone === 'pickup' || next.phone === 'stowing';
    const stowSeconds = next.phoneStowFast ? 0.4 : 0.8;
    const phoneTime =
      next.phone === 'pickup'
        ? (1 - next.phoneProgress) * PICKUP_SECONDS
        : next.phoneProgress * stowSeconds;
    if (moving && phoneTime < EPSILON) {
      next.phone = next.phone === 'pickup' ? 'using' : 'working';
      next.phoneProgress = next.phone === 'using' ? 1 : 0;
      continue;
    }
    const visible = hasEvidence(next);
    const observed =
      next.boss === 'inspect' && (visible || next.noiseUntil > next.elapsed + EPSILON);
    const until = Math.min(
      target,
      routeAt(next.elapsed, next.variant).until,
      sceneBoundary(next),
      next.questionUntil ?? Infinity,
      moving ? next.elapsed + phoneTime : Infinity,
      observed ? next.elapsed + OBSERVATION_SECONDS - next.exposure : Infinity,
    );
    const duration = until - next.elapsed;
    const enjoying =
      (next.activity === 'pc' && next.pc === 'entertainment') ||
      (next.activity === 'phone' && next.phone === 'using');
    if (enjoying && next.boss !== 'inspect' && next.boss !== 'question') next.joy += duration;
    if (moving) {
      next.phoneProgress +=
        duration * (next.phone === 'pickup' ? 1 / PICKUP_SECONDS : -1 / stowSeconds);
      next.phoneProgress = Math.max(0, Math.min(1, next.phoneProgress));
      if (phoneTime <= duration + EPSILON) {
        next.phone = next.phone === 'pickup' ? 'using' : 'working';
        next.phoneProgress = next.phone === 'using' ? 1 : 0;
      }
    }
    next.exposure = observed ? next.exposure + duration : Math.max(0, next.exposure - duration / 2);
    next.elapsed = until;
    if (observed && next.exposure >= OBSERVATION_SECONDS - EPSILON) {
      next.questionUntil = next.elapsed + 4;
      next.questionAnswered = false;
      next.boss = 'question';
      const evidence = !visible
        ? '听到了手机的响动'
        : next.pc === 'entertainment'
          ? '看见了电脑娱乐窗口'
          : '看见了还没收好的手机';
      announce(next, 'evidence', `老板${evidence}。先收尾，再回答表格总数。`);
    }
    if (next.questionUntil !== null && next.elapsed >= next.questionUntil - EPSILON) {
      next.status = 'caught';
      next.activity = 'none';
      announce(next, 'caught', '老板等不到合理回应，发现你刚才没有在工作。可以免费重试。');
    } else {
      synchronizeBoss(next);
      synchronizeScene(next);
    }
  }
  if (next.status === 'playing' && next.elapsed >= 90 - EPSILON) settle(next);
  return next;
}

/** Applies one explicit intent without teleporting props or clearing unrelated evidence. */
export function actOfficeSample(
  state: OfficeSampleState,
  action: OfficeSampleAction,
): OfficeSampleState {
  if (action.type === 'restart')
    return createOfficeSample(action.variant ?? (state.variant + 1) % ROUTES.length);
  const next = { ...state };
  if (action.type === 'start' && state.status === 'intro') {
    next.status = 'playing';
    announce(next, 'start', CUES.safe);
    return next;
  }
  if (action.type === 'resume' && state.status === 'paused') return { ...next, status: 'playing' };
  if (state.status !== 'playing') return state;
  if (action.type === 'pause' || action.type === 'cancel-input') {
    stopInput(next);
    if (action.type === 'pause') next.status = 'paused';
    return next;
  }
  if (action.type === 'pc-entertainment') {
    next.pc = 'entertainment';
    next.activity = 'pc';
  } else if (action.type === 'pc-work') {
    next.pc = 'work';
    if (next.activity === 'pc') next.activity = 'none';
  } else if (action.type === 'phone-start' && next.phone !== 'stowing') {
    next.activity = 'phone';
    if (next.phone === 'working') {
      next.phone = 'pickup';
      next.phoneStowFast = false;
    }
  } else if (action.type === 'phone-stop' || action.type === 'phone-stop-fast') {
    if (next.phone !== 'working') {
      const fast = action.type === 'phone-stop-fast';
      if (fast && !next.phoneStowFast) {
        next.noiseUntil = Math.max(next.noiseUntil, next.elapsed + 0.7);
        announce(next, 'fast-stow', '快速扣下手机，收回更快，但会响一声。');
      }
      next.phoneStowFast = fast;
      next.phone = 'stowing';
    }
    if (next.activity === 'phone') next.activity = 'none';
  } else if (action.type === 'silence-phone' && next.phoneNotice === 'vibrating') {
    next.phoneNotice = 'silenced';
    announce(next, 'phone-silenced', '已静音，手机不会响铃。');
  } else if (action.type === 'take-file' && next.file === 'offered') {
    if (next.phone !== 'working') announce(next, 'blocked', '先收好手机，腾出手接核对单。');
    else {
      next.file = 'accepted';
      announce(next, 'file-accepted', '接好了，谢谢。已确认的表格数据不变。');
    }
  } else if (action.type === 'confirm-data') {
    if (next.pc !== 'work' || next.phone !== 'working') {
      announce(next, 'blocked', '先回到表格并收好手机，再核对数据。');
    } else if (action.value === next.displayedTotal) {
      next.workConfirmed = true;
      announce(next, 'confirmed', '已核对：本月确认总数 42。记住它，老板可能会问。');
    } else announce(next, 'incorrect', '再看一眼表格：本月确认总数是 42。');
  } else if (action.type === 'answer' && next.questionUntil !== null) {
    if (hasEvidence(next) || !next.workConfirmed) {
      announce(next, 'blocked', '先收好手机、切回表格并完成数据确认，再回答。');
    } else if (action.value === next.displayedTotal) {
      next.questionUntil = null;
      next.questionAnswered = true;
      next.exposure = 0;
      next.boss = 'leave';
      announce(next, 'answered', '“本月确认总数是 42。”老板点点头，转身离开。');
    } else {
      next.status = 'caught';
      next.activity = 'none';
      announce(next, 'caught', '答复与刚才表格的总数不符，老板发现了。可以免费重试。');
    }
  }
  return next;
}
