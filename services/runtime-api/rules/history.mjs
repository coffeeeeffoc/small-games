import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  scoreGuess,
  validPoint,
  MIN_YEAR,
  MAX_YEAR,
} from '../../../games/local/vibeJam-myself-history-guess/src/game.js';

const root = new URL('../../../games/local/vibeJam-myself-history-guess/', import.meta.url);
const scenes = ['changan', 'babylon', 'beijing', 'athens', 'paris'].map((id) => {
  const scene = JSON.parse(readFileSync(new URL(`src/scenes/${id}.json`, root), 'utf8'));
  const hash = createHash('sha256')
    .update(readFileSync(new URL(`public/${scene.image}`, root)))
    .digest('hex')
    .slice(0, 16);
  return { ...scene, image: `assets/competition/${hash}.webp` };
});
const version = `score-only-25s-v2-${createHash('sha256').update(JSON.stringify(scenes)).digest('hex').slice(0, 12)}`;
// The room cap includes time spent reading the score between rounds. Each question
// has its own non-pausable server deadline, independent of that room cap.
const durationMs = 450_000;
const roundDurationMs = 25_000;
const observationHint = '观察建筑材料、交通方式与衣着，把多处线索结合起来判断。';
const rules =
  '五幕同题挑战，每幕限时 25 秒，超时本幕 0 分。房间内题序相同；地点与年代各 2500 分，合计最高 25000 分，提示扣 500 分。全部五幕完成才上榜，总分优先，同分比服务端用时。仅公布评分，不公开标准答案或误差。整局最多 450 秒（含评分阅读）；AI 场景为艺术复原，无公元 0 年。';
function initial(seed) {
  // Both players receive a frozen order. Retain the same five-question pool so
  // existing shared rankings still compare the same amount of content.
  const deck = scenes
    .map((_, index) => index)
    .sort((a, b) => {
      const key = (index) =>
        createHash('sha256').update(`${seed}:${scenes[index].id}`).digest('hex');
      return key(a).localeCompare(key(b));
    });
  return {
    seed,
    deck,
    index: 0,
    phase: 'guessing',
    hint: false,
    answers: [],
    elapsedMs: 0,
    roundStartedAt: 0,
    finished: false,
  };
}
function view(state) {
  const scene = scenes[state.deck[state.index]];
  const answer = state.phase === 'revealed' ? state.answers[state.index] : null;
  return {
    kind: 'history',
    round: state.index + 1,
    roundKey: `${state.seed}:${state.index}`,
    total: scenes.length,
    phase: state.phase,
    image: scene.image,
    clue: scene.clue,
    hint: state.hint ? observationHint : null,
    score: state.answers.reduce((total, item) => total + item.score, 0),
    completed: state.answers.length,
    elapsedMs: state.elapsedMs,
    durationMs,
    roundDurationMs,
    remainingMs:
      state.phase === 'guessing'
        ? Math.max(0, roundDurationMs - (state.elapsedMs - state.roundStartedAt))
        : 0,
    finished: state.finished,
    rules,
    // An explicit allowlist prevents internal grading data from becoming an
    // answer oracle. This also applies after a round or the entire match ends.
    answer: answer
      ? { score: answer.score, penalty: answer.penalty, timedOut: answer.timedOut }
      : null,
  };
}
function advance(state, elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < state.elapsedMs) throw new Error('无效比赛时间');
  if (state.finished) return;
  state.elapsedMs = Math.min(durationMs, elapsedMs);
  if (state.phase === 'guessing' && state.elapsedMs - state.roundStartedAt >= roundDurationMs) {
    state.answers.push({ score: 0, penalty: state.hint ? 500 : 0, timedOut: true });
    state.phase = 'revealed';
    state.finished = state.answers.length === scenes.length;
  }
  if (state.elapsedMs >= durationMs) state.finished = true;
}
function action(state, input, elapsedMs) {
  if (state.finished) throw new Error('比赛已经结算');
  if (!input || !['guess', 'hint', 'next', 'finish'].includes(input.type))
    throw new Error('无效操作');
  const keys = input.type === 'guess' ? ['type', 'point', 'year'] : ['type'];
  if (Object.keys(input).some((key) => !keys.includes(key)))
    throw new Error('不能提交客户端成绩或未知字段');
  advance(state, elapsedMs);
  if (state.finished) return;
  // The store may already have advanced this round before invoking the action.
  // An in-flight answer can acknowledge expiry, but can never replace its zero.
  if (
    state.phase === 'revealed' &&
    state.answers[state.index]?.timedOut &&
    ['guess', 'hint'].includes(input.type)
  )
    return;
  if (input.type === 'finish') {
    state.finished = true;
    return;
  }
  if (input.type === 'next') {
    if (state.phase !== 'revealed' || state.index >= scenes.length - 1)
      throw new Error('当前不能进入下一幕');
    state.index++;
    state.phase = 'guessing';
    state.hint = false;
    state.roundStartedAt = state.elapsedMs;
  } else {
    if (state.phase !== 'guessing') throw new Error('这一幕已经提交');
    if (input.type === 'hint') {
      if (state.hint) throw new Error('本幕提示已经使用');
      state.hint = true;
    } else if (input.type === 'guess') {
      if (
        !validPoint(input.point) ||
        !Number.isInteger(input.year) ||
        input.year === 0 ||
        input.year < MIN_YEAR ||
        input.year > MAX_YEAR
      )
        throw new Error('请选择有效地点与年代');
      if (Object.keys(input.point).some((key) => !['lat', 'lng'].includes(key)))
        throw new Error('无效地点字段');
      const result = scoreGuess(scenes[state.deck[state.index]], input.point, input.year);
      const penalty = state.hint ? 500 : 0;
      state.answers.push({ score: Math.max(0, result.total - penalty), penalty, timedOut: false });
      state.phase = 'revealed';
      state.finished = state.answers.length === scenes.length;
    }
  }
}
function result(state) {
  return {
    finished: state.finished,
    eligible: state.finished && state.answers.length === scenes.length,
    score: state.answers.reduce((sum, answer) => sum + answer.score, 0),
    secondary: state.elapsedMs,
  };
}
export default {
  id: 'vibeJam-myself-history-guess',
  title: '此时·此地 · 五幕时空挑战',
  version,
  durationMs,
  description: rules,
  initial,
  view,
  advance,
  action,
  result,
};
