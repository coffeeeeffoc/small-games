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
const version = `five-scenes-v1-${createHash('sha256').update(JSON.stringify(scenes)).digest('hex').slice(0, 12)}`;
const durationMs = 450_000;
const rules =
  '固定五幕，450 秒。地点与年代各 2500 分，合计最高 25000 分；每幕提示扣 500 分。全部五幕完成才上榜，总分优先，同分比服务端用时。答案在提交后揭晓，AI 场景是艺术复原；无公元 0 年。';
function initial(seed) {
  return {
    seed,
    index: 0,
    phase: 'guessing',
    hint: false,
    answers: [],
    elapsedMs: 0,
    finished: false,
  };
}
function view(state) {
  const scene = scenes[state.index];
  const answer = state.phase === 'revealed' ? state.answers[state.index] : null;
  return {
    kind: 'history',
    round: state.index + 1,
    roundKey: `${state.seed}:${state.index}`,
    total: scenes.length,
    phase: state.phase,
    image: scene.image,
    clue: scene.clue,
    hint: state.hint ? scene.hint : null,
    score: state.answers.reduce((total, item) => total + item.score, 0),
    completed: state.answers.length,
    elapsedMs: state.elapsedMs,
    durationMs,
    finished: state.finished,
    rules,
    // Only the already submitted round can disclose the answer.
    answer: answer
      ? {
          ...answer,
          place: scene.place,
          year: scene.year,
          lat: scene.lat,
          lng: scene.lng,
          tolerance: scene.tolerance,
          story: scene.story,
          source: scene.source,
          details: scene.details,
        }
      : null,
  };
}
function action(state, input, elapsedMs) {
  if (state.finished) throw new Error('比赛已经结算');
  if (!Number.isFinite(elapsedMs) || elapsedMs < state.elapsedMs) throw new Error('无效比赛时间');
  if (!input || typeof input.type !== 'string') throw new Error('无效操作');
  if (elapsedMs >= durationMs) {
    state.elapsedMs = durationMs;
    state.finished = true;
    return;
  }
  const keys = input.type === 'guess' ? ['type', 'point', 'year'] : ['type'];
  if (Object.keys(input).some((key) => !keys.includes(key)))
    throw new Error('不能提交客户端成绩或未知字段');
  if (input.type === 'finish') {
    state.finished = true;
    state.elapsedMs = elapsedMs;
    return;
  }
  if (input.type === 'next') {
    if (state.phase !== 'revealed' || state.index >= scenes.length - 1)
      throw new Error('当前不能进入下一幕');
    state.index++;
    state.phase = 'guessing';
    state.hint = false;
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
      const result = scoreGuess(scenes[state.index], input.point, input.year);
      const penalty = state.hint ? 500 : 0;
      state.answers.push({
        point: { lat: input.point.lat, lng: input.point.lng },
        guessedYear: input.year,
        distance: result.distance,
        years: result.years,
        rawScore: result.total,
        score: Math.max(0, result.total - penalty),
        penalty,
      });
      state.phase = 'revealed';
      state.finished = state.answers.length === scenes.length;
    } else throw new Error('未知操作');
  }
  state.elapsedMs = elapsedMs;
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
  action,
  result,
};
