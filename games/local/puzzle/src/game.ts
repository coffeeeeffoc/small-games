import { deductions, evidence, finalQuestions, suspects } from './case.ts';
import type { Suspect } from './case.ts';

export type Report = {
  grade: 'S' | 'A' | 'B' | 'C';
  correct: number;
  total: number;
  missing: string[];
  answers: Record<string, string>;
  score: number;
};

export type GameState = {
  version: 1;
  started: boolean;
  evidence: string[];
  visited: string[];
  asked: string[];
  challenged: string[];
  puzzles: string[];
  deductions: string[];
  mistakes: string[];
  score: number;
  report: Report | null;
  muted: boolean;
};

export type GameAction =
  | { type: 'start' }
  | { type: 'collect'; id: string }
  | { type: 'visit'; id: string }
  | { type: 'ask'; id: string }
  | { type: 'challenge'; questionId: string; evidenceId: string }
  | { type: 'solve'; id: string }
  | { type: 'combine'; ids: [string, string] }
  | { type: 'submit'; answers: Record<string, string> }
  | { type: 'mute' }
  | { type: 'reset' };

const questions = suspects.flatMap((suspect) => suspect.questions);
const physical = ['body', 'weapon', 'lock', 'window', 'clock', 'cup', 'ledger'];
const phoneItems = ['message', 'threat', 'transfer'];
const consoleItems = ['livestream', 'maintenance'];
const puzzleRewards: Record<string, string> = {
  photo: 'photo', unlock: 'phone', restore: 'schedule',
  'camera-lin': 'camera-lin', 'camera-zhou': 'camera-zhou',
};
const requiredEvidence = ['body', 'watch', 'weapon', 'window', 'lock', 'message', 'schedule', 'ledger', 'threat', 'camera-lin', 'livestream'];
const add = (values: string[], id: string) => values.includes(id) ? values : [...values, id];

export function initialState(): GameState {
  return { version: 1, started: false, evidence: [], visited: [], asked: [], challenged: [], puzzles: [], deductions: [], mistakes: [], score: 100, report: null, muted: false };
}

export function availableQuestions(state: GameState, suspect: Suspect) {
  return suspect.questions.filter((question) => !question.requires || question.requires.every((id) => state.evidence.includes(id)));
}

export function evaluate(state: GameState, answers: Record<string, string>): Report {
  const safeAnswers: Record<string, string> = {};
  for (const question of finalQuestions) {
    if (question.options.some((option) => option.value === answers[question.id])) safeAnswers[question.id] = answers[question.id];
  }
  const correct = finalQuestions.filter((question) => safeAnswers[question.id] === question.correct).length;
  const missing = requiredEvidence.filter((id) => !state.evidence.includes(id)).map((id) => `证据：${evidence.find((item) => item.id === id)!.title}`);
  for (const deduction of deductions) {
    if (!state.deductions.includes(deduction.id)) missing.push(`推理：${deduction.title}`);
  }
  if (!state.challenged.includes('lin-where')) missing.push('当面质疑林岑的行踪证词');
  const grade = safeAnswers.culprit !== 'lin' ? 'C' : missing.length ? 'B' : correct === finalQuestions.length && state.score >= 90 ? 'S' : 'A';
  return { grade, correct, total: finalQuestions.length, missing, answers: safeAnswers, score: state.score };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  if (action.type === 'reset') return { ...initialState(), muted: state.muted };
  if (action.type === 'mute') return { ...state, muted: !state.muted };
  if (action.type === 'start') return { ...state, started: true, visited: add(state.visited, 'room') };
  if (!state.started) return state;

  switch (action.type) {
    case 'visit':
      return ['room', 'console'].includes(action.id) && !state.visited.includes(action.id) ? { ...state, visited: add(state.visited, action.id) } : state;
    case 'collect': {
      const allowed = physical.includes(action.id) && state.visited.includes('room')
        || action.id === 'watch' && state.evidence.includes('body')
        || phoneItems.includes(action.id) && state.evidence.includes('phone')
        || consoleItems.includes(action.id) && state.visited.includes('console');
      return allowed && !state.evidence.includes(action.id) ? { ...state, evidence: add(state.evidence, action.id) } : state;
    }
    case 'ask': {
      const question = questions.find((item) => item.id === action.id);
      return question && (!question.requires || question.requires.every((id) => state.evidence.includes(id))) && !state.asked.includes(question.id)
        ? { ...state, asked: add(state.asked, question.id) } : state;
    }
    case 'challenge': {
      const question = questions.find((item) => item.id === action.questionId);
      if (!question || !state.asked.includes(question.id) || !state.evidence.includes(action.evidenceId) || state.challenged.includes(question.id)) return state;
      if (question.challengeEvidence?.includes(action.evidenceId) && question.reward) {
        return { ...state, challenged: add(state.challenged, question.id), evidence: add(state.evidence, question.reward) };
      }
      const key = `${question.id}:${action.evidenceId}`;
      return state.mistakes.includes(key) ? state : { ...state, mistakes: add(state.mistakes, key), score: Math.max(40, state.score - 5) };
    }
    case 'solve': {
      const reward = Object.hasOwn(puzzleRewards, action.id) ? puzzleRewards[action.id] : undefined;
      const allowed = action.id === 'photo' && state.visited.includes('room')
        || action.id === 'unlock' && state.evidence.includes('photo')
        || action.id === 'restore' && state.evidence.includes('phone')
        || ['camera-lin', 'camera-zhou'].includes(action.id) && state.visited.includes('console');
      return reward && allowed && !state.puzzles.includes(action.id) ? { ...state, puzzles: add(state.puzzles, action.id), evidence: add(state.evidence, reward) } : state;
    }
    case 'combine': {
      if (action.ids[0] === action.ids[1] || !action.ids.every((id) => state.evidence.includes(id))) return state;
      const deduction = deductions.find((item) => item.inputs.every((id) => action.ids.includes(id)));
      return deduction && !state.deductions.includes(deduction.id) ? { ...state, deductions: add(state.deductions, deduction.id) } : state;
    }
    case 'submit':
      return { ...state, report: evaluate(state, action.answers) };
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const stringList = (value: unknown, valid: string[]) => Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && valid.includes(id)))] : [];

export function loadState(raw: string | null): GameState {
  if (!raw) return initialState();
  try {
    const saved: unknown = JSON.parse(raw);
    if (!isRecord(saved) || saved.version !== 1 || typeof saved.started !== 'boolean') return initialState();
    const state = initialState();
    state.started = saved.started;
    state.muted = saved.muted === true;
    if (!state.started) return state;
    state.visited = add(stringList(saved.visited, ['room', 'console']), 'room');
    state.evidence = stringList(saved.evidence, evidence.map((item) => item.id));
    state.puzzles = stringList(saved.puzzles, Object.keys(puzzleRewards));
    // A saved fact must retain its acquisition prerequisites, so partial or edited saves cannot bypass puzzles.
    state.puzzles = state.puzzles.filter((id) => state.evidence.includes(puzzleRewards[id]) && (id === 'photo'
      || id === 'unlock' && state.puzzles.includes('photo') && state.evidence.includes('photo')
      || id === 'restore' && state.puzzles.includes('photo') && state.puzzles.includes('unlock') && state.evidence.includes('photo') && state.evidence.includes('phone')
      || ['camera-lin', 'camera-zhou'].includes(id) && state.visited.includes('console')));
    state.evidence = state.evidence.filter((id) => {
      if (physical.includes(id)) return true;
      if (id === 'watch') return state.evidence.includes('body');
      const puzzle = Object.entries(puzzleRewards).find(([, reward]) => reward === id)?.[0];
      if (puzzle) return state.puzzles.includes(puzzle);
      if (phoneItems.includes(id)) return state.puzzles.includes('unlock') && state.evidence.includes('phone');
      if (consoleItems.includes(id)) return state.visited.includes('console');
      return id.startsWith('note-');
    });
    state.asked = stringList(saved.asked, questions.filter((question) => !question.requires || question.requires.every((id) => state.evidence.includes(id))).map((question) => question.id));
    state.challenged = stringList(saved.challenged, questions.filter((question) => state.asked.includes(question.id) && question.challengeEvidence?.some((id) => state.evidence.includes(id))).map((question) => question.id));
    state.evidence = state.evidence.filter((id) => !id.startsWith('note-') || questions.some((question) => question.reward === id && state.challenged.includes(question.id)));
    for (const id of state.challenged) {
      const reward = questions.find((question) => question.id === id)?.reward;
      if (reward) state.evidence = add(state.evidence, reward);
    }
    state.deductions = stringList(saved.deductions, deductions.filter((deduction) => deduction.inputs.every((id) => state.evidence.includes(id))).map((deduction) => deduction.id));
    const validMistakes = questions.flatMap((question) => evidence.filter((item) => !question.challengeEvidence?.includes(item.id)).map((item) => `${question.id}:${item.id}`));
    state.mistakes = stringList(saved.mistakes, validMistakes);
    state.score = Math.max(40, 100 - state.mistakes.length * 5);
    const report = saved.report;
    const validMissing = [
      ...requiredEvidence.map((id) => `证据：${evidence.find((item) => item.id === id)!.title}`),
      ...deductions.map((deduction) => `推理：${deduction.title}`),
      '当面质疑林岑的行踪证词',
    ];
    if (isRecord(report) && ['S', 'A', 'B', 'C'].includes(String(report.grade))
      && Number.isInteger(report.correct) && Number(report.correct) >= 0 && Number(report.correct) <= finalQuestions.length
      && report.total === finalQuestions.length && typeof report.score === 'number' && report.score >= 40 && report.score <= 100 && report.score % 5 === 0
      && Array.isArray(report.missing) && report.missing.length <= validMissing.length && report.missing.every((item) => typeof item === 'string' && validMissing.includes(item))
      && isRecord(report.answers)) {
      const safeAnswers = Object.fromEntries(finalQuestions.filter((question) => question.options.some((option) => option.value === (report.answers as Record<string, unknown>)[question.id])).map((question) => [question.id, (report.answers as Record<string, string>)[question.id]]));
      const correct = finalQuestions.filter((question) => safeAnswers[question.id] === question.correct).length;
      const grade = safeAnswers.culprit !== 'lin' ? 'C' : report.missing.length ? 'B' : correct === finalQuestions.length && report.score >= 90 ? 'S' : 'A';
      // Reports describe the last submission; subsequent investigation must not silently rewrite that history.
      if (correct === report.correct && grade === report.grade) state.report = { grade, correct, total: finalQuestions.length, missing: [...report.missing] as string[], answers: safeAnswers, score: report.score };
    }
    return state;
  } catch {
    return initialState();
  }
}

export function getHint(state: GameState): { id: string; steps: string[] } {
  const has = (id: string) => state.evidence.includes(id);
  if (!has('body') || !has('watch')) return { id: 'scene-time', steps: ['先弄清伤势，再寻找随身设备记录的时间。', '遗体旁的腕表保留了冲击记录。先调查遗体，随后再次检查腕表。', '在「现场」打开「调查清单」，选择「遗体与腕表」，收集初检证据后点击「进一步检查 · 遗体腕表」。'] };
  if (!has('photo')) return { id: 'photo', steps: ['桌面手机的提示与档案馆的纪念日有关。', '调查馆庆相框，留意合照最下方的开馆铭牌。', '打开馆庆照片，用双指或「放大」按钮放大，找到铭牌上的 09.17 并记录。'] };
  if (!has('phone')) return { id: 'phone', steps: ['「开馆那一天」可以写成四个数字。', '把馆庆铭牌的月份和日期连起来，保留前导零。', '打开桌面手机，在密码锁输入 0917。'] };
  if (!has('message') || !has('schedule')) return { id: 'schedule', steps: ['消息的发送时刻，与本人操作手机的时刻可能不同。', '先查看手机工作群聊天，再检查「已删除」中的预约回执。', '在删除恢复中将碎片排为「类型：预约消息」→「创建：19:48」→「执行：20:40」→「状态：服务器自动发送」，再恢复。可以拖动，也可以点上下移动按钮。'] };
  if (!has('camera-lin') || !has('camera-zhou')) return { id: 'camera', steps: ['用影像核对两份行踪证词：修复室和离馆。', '一楼控制台的主监控没有停用，关键画面在 20:27 和 20:32。', '进入控制台，拖动时间轴或点逐分钟按钮到 20:27、20:32，分别截取画面。'] };
  if (!has('livestream')) return { id: 'livestream', steps: ['说谎的人仍有可能没有时间行凶。单帧影像不够。', '周屿身边是直播设备。连续录像可以验证一整段时间。', '在一楼控制台选择「直播原始缓存」，核实 20:21—20:33 三人持续同框。'] };
  if (!state.challenged.includes('lin-where')) return { id: 'challenge', steps: ['不要只在心里发现矛盾，把证据出示给作出证词的人。', '询问林岑 20:20—20:40 的行踪，她的话与转角画面冲突。', '在「嫌疑人」选择林岑，询问行踪，点「质疑」并出示「20:27 的转角画面」。'] };
  if (!has('weapon') || !has('window') || !has('lock')) return { id: 'physical', steps: ['证词被推翻仍不等于完整破案。需要凶器、入口和排除其他路径的物证。', '回到阅档室，检查门内边柜、唯一房门和窗台。', '通过「调查清单」收集铜镇纸、指纹门锁日志、内扣窗与窗台灰尘。'] };
  if (!has('ledger') || !has('threat')) return { id: 'motive', steps: ['还缺一条说明当晚为什么发生争执的实证。', '桌面的原始修复账目与顾言手机中的私人通知指向同一件事。', '收集书桌「原始修复账页」，再打开手机与林岑的聊天，记录 19:52 的通知。'] };
  const missing = deductions.find((deduction) => !state.deductions.includes(deduction.id));
  if (missing) return { id: `board-${missing.id}`, steps: [`证据板还缺少一项结论：「${missing.title}」。`, `尝试把「${evidence.find((item) => item.id === missing.inputs[0])!.title}」与另一份能够交叉核实的材料联系。`, `在「证据」中选择「${evidence.find((item) => item.id === missing.inputs[0])!.title}」和「${evidence.find((item) => item.id === missing.inputs[1])!.title}」，建立联系。`] };
  return { id: 'final', steps: ['关键事实已经齐全，把六项答案连成一条解释。', '结案需要同时解释作案人、时间、手法、动机、行踪谎言和进入条件。', '前往「推理」逐项填写。用实际袭击时间回答，不要把自动消息或停钟读数当作死亡时间。提交后仍可返回调查。'] };
}
