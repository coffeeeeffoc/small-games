import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import rule from '../../../../services/runtime-api/rules/history.mjs';
import { createRenderer } from '../competition-renderer.js';

const ids = ['changan', 'babylon', 'beijing', 'athens', 'paris'];
const privateFields = new Set(['year', 'years', 'lat', 'lng', 'place', 'title', 'id', 'tolerance', 'distance', 'story', 'source', 'details', 'point', 'guessedYear', 'deck']);
function assertPrivate(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    assert.equal(privateFields.has(key), false, `public answer field: ${key}`);
    assertPrivate(nested);
  }
}

test('ranked history keeps answers private, recomputes five answers, charges hints and rejects invalid actions', () => {
  const state = rule.initial(123), other = rule.initial(456);
  assert.deepEqual(state, rule.initial(123), 'the same room seed freezes the same deck');
  assert.deepEqual([...state.deck].sort(), [...other.deck].sort(), 'shared legacy board retains the same five-question pool');
  assert.notDeepEqual(state.deck, other.deck, 'new rooms rotate question order');
  const publicView = rule.view(state);
  assert.equal(publicView.answer, null);
  assertPrivate(publicView);
  assert.equal(publicView.remainingMs, 25000);
  assert.equal(publicView.hint, null);
  assert.match(publicView.image, /^assets\/competition\/[a-f0-9]{16}\.webp$/);
  const guess = { type: 'guess', point: { lat: 0, lng: 0 }, year: 742 };
  for (const bad of [{ ...guess, score: 25000 }, { ...guess, year: 0 }, { ...guess, year: NaN },
    { ...guess, point: { lat: 999, lng: 0 } }, { type: 'next' }, { type: 'unknown' }]) {
    assert.throws(() => rule.action(state, bad, 100));
    assert.equal(state.answers.length, 0);
  }
  let elapsed = 1000;
  for (const [index, sceneIndex] of state.deck.entries()) {
    const id = ids[sceneIndex];
    const scene = JSON.parse(readFileSync(new URL(`../src/scenes/${id}.json`, import.meta.url)));
    const picture = readFileSync(new URL(`../public/${rule.view(state).image}`, import.meta.url));
    assert.deepEqual(picture, readFileSync(new URL(`../public/${scene.image}`, import.meta.url)), 'opaque asset retains original scene');
    if (index === 0) {
      rule.action(state, { type: 'hint' }, elapsed++);
      assert.equal(rule.view(state).hint, '观察建筑材料、交通方式与衣着，把多处线索结合起来判断。');
      assert.notEqual(rule.view(state).hint, scene.hint);
      assert.throws(() => rule.action(state, { type: 'hint' }, elapsed++));
    }
    rule.action(state, { type: 'guess', point: { lat: scene.lat, lng: scene.lng }, year: scene.year }, elapsed++);
    assert.deepEqual(rule.view(state).answer, { score: index ? 5000 : 4500, penalty: index ? 0 : 500, timedOut: false });
    assertPrivate(rule.view(state));
    assert.throws(() => rule.action(state, guess, elapsed++), 'duplicate submit is rejected');
    if (index < 4) {
      rule.action(state, { type: 'next' }, elapsed++);
      assert.equal(rule.view(state).answer, null, 'next scene answer stays hidden');
    }
  }
  assert.deepEqual(rule.result(state), { finished: true, eligible: true, score: 24500, secondary: state.elapsedMs });
  const expired = rule.initial(1);
  rule.action(expired, { type: 'guess', point: { lat: 0, lng: 0 }, year: 742 }, rule.durationMs);
  assert.deepEqual(rule.result(expired), { finished: true, eligible: false, score: 0, secondary: rule.durationMs });
  const quit = rule.initial(1);
  rule.action(quit, { type: 'finish' }, 12);
  assert.equal(rule.result(quit).eligible, false);
});

test('Canvas renderer supports scene controls, map selection and BCE keypad without DOM or SDK', () => {
  const rendered = [];
  const ctx = new Proxy({ measureText: text => ({ width: String(text).length * 12 }), fillText: (text, x, y) => rendered.push({ text, x, y }) },
    { get: (target, name) => name in target ? target[name] : () => {} });
  const renderer = createRenderer();
  const state = rule.view(rule.initial(1));
  const draw = () => { rendered.length = 0; renderer.draw(ctx, 390, 608, state); };
  const tap = label => { const value = rendered.find(item => item.text === label); assert.ok(value, label); return renderer.tap(value.x, value.y, state); };
  draw(); assert.ok(rendered.some(item => item.text === '场景加载失败，点击画面重试'));
  tap('地图选点'); draw(); renderer.tap(200, 270, state); draw();
  tap('输入猜测年代'); draw(); tap('改为公元前'); draw();
  for (const key of ['1', '2', '0', '0']) { tap(key); draw(); }
  tap('完成年代输入'); draw();
  const action = tap('提交地点与年代');
  assert.equal(action.type, 'guess'); assert.equal(action.year, -1200);
  assert.ok(Math.abs(action.point.lat) <= 85 && Math.abs(action.point.lng) <= 180);
  assert.deepEqual(tap('提示 −500'), { type: 'hint' });
  Object.assign(state, rule.view(rule.initial(2)));
  draw();
  assert.ok(rendered.some(item => item.text === '输入猜测年代'), 'a new room clears draft input even on the same first scene');
});


test('each question expires on server time, including polling, late guesses and restored state', () => {
  const state = rule.initial(24);
  rule.advance(state, 24999);
  assert.equal(rule.view(state).remainingMs, 1);
  const restored = structuredClone(state);
  rule.advance(restored, 25000);
  assert.equal(restored.phase, 'revealed');
  assert.deepEqual(rule.view(restored).answer, { score: 0, penalty: 0, timedOut: true });
  assertPrivate(rule.view(restored));
  rule.action(restored, { type: 'guess', point: { lat: 0, lng: 0 }, year: 742 }, 25001);
  assert.equal(restored.answers.length, 1, 'late guesses cannot replace an expired zero');
  rule.advance(restored, 40000);
  rule.action(restored, { type: 'next' }, 40000);
  assert.equal(rule.view(restored).remainingMs, 25000, 'reading the score does not consume the next question');
  rule.advance(restored, 64999);
  assert.equal(rule.view(restored).remainingMs, 1);
  assert.throws(() => rule.advance(restored, 64998), /无效比赛时间/);
  rule.action(restored, { type: 'guess', point: { lat: 0, lng: 0 }, year: 742 }, 65000);
  assert.deepEqual(rule.view(restored).answer, { score: 0, penalty: 0, timedOut: true });
  assert.equal(restored.answers.length, 2);
});

test('score Canvas ignores even legacy answer objects containing exact answers and never offers a reveal map', () => {
  const rendered = [];
  const ctx = new Proxy({ measureText: text => ({ width: String(text).length * 8 }), fillText: text => rendered.push(String(text)) },
    { get: (target, name) => name in target ? target[name] : () => {} });
  const renderer = createRenderer();
  const state = { ...rule.view(rule.initial(1)), phase: 'revealed', answer: {
    score: 4300, penalty: 500, place: '秘密地点', year: 742, lat: 34, lng: 108, tolerance: 50,
    story: '秘密史料', details: ['秘密细节'], source: ['秘密来源'], distance: 123, years: 456,
  } };
  renderer.draw(ctx, 390, 608, state);
  assert.ok(rendered.includes('4300 / 5000'));
  assert.ok(rendered.includes('答案封存，只留下你的挑战成绩。'));
  assert.equal(rendered.some(text => /秘密|742|公里误差|年误差|对照地图|返回解说/.test(text)), false);
});
