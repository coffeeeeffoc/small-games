import assert from 'node:assert/strict';
import { deductions, evidence, finalQuestions, suspects, timeline } from '../src/case.ts';
import { availableQuestions, evaluate, gameReducer, getHint, initialState, loadState } from '../src/game.ts';
import type { GameAction, GameState } from '../src/game.ts';

const answers = Object.fromEntries(finalQuestions.map((question) => [question.id, question.correct]));
const evidenceIds = evidence.map((item) => item.id);
const questionIds = suspects.flatMap((suspect) => suspect.questions.map((question) => question.id));
assert.equal(new Set(evidenceIds).size, evidenceIds.length);
assert.equal(new Set(questionIds).size, questionIds.length);
assert.equal(suspects.length, 4);
assert.equal(finalQuestions.length, 6);
for (const suspect of suspects) {
  assert.equal(availableQuestions(initialState(), suspect).length, 3);
  assert.equal(suspect.questions.length, 4);
  for (const question of suspect.questions) {
    for (const id of [...question.requires ?? [], ...question.challengeEvidence ?? [], ...question.reward ? [question.reward] : []]) assert(evidenceIds.includes(id));
    assert(question.wrongResponse && question.rebuttal);
  }
}
for (const deduction of deductions) for (const id of deduction.inputs) assert(evidenceIds.includes(id));
for (const event of timeline) for (const id of event.requires) assert(evidenceIds.includes(id));
for (const question of finalQuestions) assert(question.options.some((option) => option.value === question.correct));

const act = (state: GameState, ...actions: GameAction[]) => actions.reduce(gameReducer, state);
function investigate(state = initialState()): GameState {
  state = act(state, { type: 'start' });
  for (const id of ['body', 'watch', 'weapon', 'lock', 'window', 'ledger']) state = gameReducer(state, { type: 'collect', id });
  for (const id of ['photo', 'unlock', 'restore']) state = gameReducer(state, { type: 'solve', id });
  for (const id of ['message', 'threat']) state = gameReducer(state, { type: 'collect', id });
  state = gameReducer(state, { type: 'visit', id: 'console' });
  for (const id of ['camera-lin', 'camera-zhou']) state = gameReducer(state, { type: 'solve', id });
  state = act(state, { type: 'collect', id: 'livestream' }, { type: 'ask', id: 'lin-where' }, { type: 'challenge', questionId: 'lin-where', evidenceId: 'camera-lin' });
  for (const deduction of deductions) state = gameReducer(state, { type: 'combine', ids: deduction.inputs });
  return state;
}

// Route 1: complete, efficient investigation, with a save/reload midway.
let efficient = act(initialState(), { type: 'start' }, { type: 'collect', id: 'body' }, { type: 'collect', id: 'watch' });
efficient = loadState(JSON.stringify(efficient));
assert(efficient.evidence.includes('watch'));
efficient = gameReducer(investigate(efficient), { type: 'submit', answers });
assert.equal(efficient.report?.grade, 'S');
assert.equal(efficient.report?.correct, 6);
assert.equal(efficient.score, 100);
assert.deepEqual(loadState(JSON.stringify(efficient)), efficient);
assert.equal(getHint(efficient).id, 'final');

// Route 2: wrong accusations lower the score, but never consume or lock evidence.
let mistaken = act(initialState(), { type: 'start' }, { type: 'collect', id: 'cup' }, { type: 'collect', id: 'clock' }, { type: 'ask', id: 'zhou-where' }, { type: 'ask', id: 'xu-money' });
mistaken = act(mistaken,
  { type: 'challenge', questionId: 'zhou-where', evidenceId: 'cup' },
  { type: 'challenge', questionId: 'zhou-where', evidenceId: 'cup' },
  { type: 'challenge', questionId: 'zhou-where', evidenceId: 'clock' },
  { type: 'challenge', questionId: 'xu-money', evidenceId: 'cup' },
  { type: 'solve', id: 'incorrect-password' },
  { type: 'combine', ids: ['cup', 'clock'] },
  { type: 'submit', answers: { ...answers, culprit: 'zhou' } });
assert.equal(mistaken.report?.grade, 'C');
assert.equal(mistaken.score, 85);
assert.equal(mistaken.mistakes.length, 3);
mistaken = gameReducer(investigate(loadState(JSON.stringify(mistaken))), { type: 'submit', answers });
assert.equal(mistaken.report?.grade, 'A');
assert.equal(mistaken.report?.correct, 6);
assert.equal(mistaken.score, 85);
assert.deepEqual(mistaken.report?.missing, []);

// Route 3: all optional distractions and non-killer confessions can be missed.
const minimal = gameReducer(investigate(), { type: 'submit', answers });
for (const id of ['clock', 'cup', 'transfer', 'maintenance', 'note-zhou', 'note-xu', 'note-shen']) assert(!minimal.evidence.includes(id));
assert.equal(minimal.report?.grade, 'S');

// Acquisitions and scoring must be idempotent, and restricted facts cannot bypass their puzzles.
const fresh = act(initialState(), { type: 'start' });
for (const action of [
  { type: 'collect', id: 'watch' }, { type: 'collect', id: 'phone' }, { type: 'collect', id: 'schedule' },
  { type: 'collect', id: 'message' }, { type: 'collect', id: 'livestream' }, { type: 'collect', id: 'note-lin' },
  { type: 'solve', id: 'unlock' }, { type: 'solve', id: 'restore' }, { type: 'solve', id: 'camera-lin' },
  { type: 'ask', id: 'lin-ledger' }, { type: 'visit', id: 'unknown' }, { type: 'solve', id: '__proto__' },
  { type: 'challenge', questionId: 'lin-where', evidenceId: 'camera-lin' },
] satisfies GameAction[]) assert.deepEqual(gameReducer(fresh, action), fresh);
for (const id of efficient.evidence) assert.deepEqual(gameReducer(efficient, { type: 'collect', id }), efficient);
for (const id of efficient.puzzles) assert.deepEqual(gameReducer(efficient, { type: 'solve', id }), efficient);
for (const deduction of deductions) assert.deepEqual(gameReducer(efficient, { type: 'combine', ids: [deduction.inputs[1], deduction.inputs[0]] }), efficient);
assert.deepEqual(gameReducer(efficient, { type: 'challenge', questionId: 'lin-where', evidenceId: 'camera-lin' }), efficient);
const alternateLin = gameReducer({ ...efficient, challenged: [] }, { type: 'challenge', questionId: 'lin-where', evidenceId: 'lock' });
assert(alternateLin.challenged.includes('lin-where'));
assert.equal(alternateLin.score, 100);
const alternateZhou = act(efficient, { type: 'ask', id: 'zhou-where' }, { type: 'challenge', questionId: 'zhou-where', evidenceId: 'livestream' });
assert(alternateZhou.challenged.includes('zhou-where'));
assert.equal(alternateZhou.score, 100);
assert.equal(evaluate(fresh, answers).grade, 'B');
assert.equal(evaluate({ ...efficient, deductions: [] }, answers).grade, 'B');
assert.equal(evaluate({ ...efficient, challenged: [] }, answers).grade, 'B');
assert.equal(evaluate({ ...efficient, evidence: efficient.evidence.filter((id) => id !== 'window') }, answers).grade, 'B');
assert.equal(evaluate({ ...efficient, score: 90 }, answers).grade, 'S');
assert.equal(evaluate({ ...efficient, score: 89 }, answers).grade, 'A');
assert.equal(evaluate(efficient, { ...answers, method: 'poison' }).grade, 'A');
assert.equal(evaluate(efficient, { ...answers, culprit: 'shen' }).grade, 'C');
assert.equal(evaluate(efficient, {}).grade, 'C');

let floor = investigate();
for (const question of suspects.flatMap((suspect) => suspect.questions).filter((question) => !question.requires)) {
  floor = gameReducer(floor, { type: 'ask', id: question.id });
  for (const id of floor.evidence) floor = gameReducer(floor, { type: 'challenge', questionId: question.id, evidenceId: id });
}
assert.equal(floor.score, 40);
assert.equal(gameReducer(floor, { type: 'submit', answers }).report?.grade, 'A');
assert.equal(loadState(JSON.stringify(floor)).score, 40);

// Malformed persistence cannot crash startup or fabricate facts and unlocked questions.
for (const raw of [null, '', '{bad json', 'null', '[]', '42', '{"version":2}', '{"version":1,"started":"yes"}']) assert.deepEqual(loadState(raw), initialState());
const corrupt = loadState(JSON.stringify({ version: 1, started: true, muted: 'no', evidence: ['phone', 'watch', 'schedule', 'camera-lin', 'note-lin', 'unknown', 4], visited: ['unknown'], asked: ['lin-ledger', 'unknown'], challenged: ['lin-where'], puzzles: ['restore', 'camera-lin', 'unknown'], deductions: ['death-time'], mistakes: ['unknown'], score: -99, report: { grade: 'S' } }));
assert.deepEqual(corrupt.evidence, []);
assert.deepEqual(corrupt.asked, []);
assert.deepEqual(corrupt.challenged, []);
assert.deepEqual(corrupt.puzzles, []);
assert.deepEqual(corrupt.deductions, []);
assert.equal(corrupt.score, 100);
assert.equal(corrupt.report, null);
const missingReward = loadState(JSON.stringify({ ...fresh, puzzles: ['photo', 'unlock', 'restore'], evidence: [] }));
assert.deepEqual(missingReward.puzzles, []);
assert.deepEqual(gameReducer(missingReward, { type: 'solve', id: 'photo' }).evidence, ['photo']);
assert.equal(loadState(JSON.stringify({ ...efficient, report: { ...efficient.report, grade: 'C' } })).report, null);
assert.deepEqual(loadState(JSON.stringify({ ...efficient, evidence: [...efficient.evidence, 'unknown', 'body'], asked: [...efficient.asked, 'unknown'] })), efficient);
assert.equal(gameReducer(efficient, { type: 'reset' }).started, false);
assert.deepEqual(gameReducer(efficient, { type: 'reset' }).evidence, []);
assert.equal(availableQuestions(efficient, suspects[0]).length, 4);
console.log('Passed: 3 full routes; S/A/B/C boundaries; all references; gating; idempotency; score floor; save recovery.');
