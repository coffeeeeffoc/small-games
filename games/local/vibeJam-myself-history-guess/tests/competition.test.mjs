import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import rule from '../../../../services/runtime-api/rules/history.mjs';
import { createRenderer } from '../competition-renderer.js';

test('ranked history keeps answers private, recomputes five answers, charges hints and rejects invalid actions', () => {
  const state = rule.initial(123), other = rule.initial(456);
  assert.deepEqual({ ...state, seed: 0 }, { ...other, seed: 0 }, 'main board always uses the same comparable five scenes');
  const publicView = rule.view(state);
  assert.equal(publicView.answer, null);
  for (const secret of ['year', 'lat', 'lng', 'place', 'title', 'id']) assert.equal(publicView[secret], undefined);
  assert.equal(publicView.hint, null);
  assert.match(publicView.image, /^assets\/competition\/[a-f0-9]{16}\.webp$/);
  const guess = { type: 'guess', point: { lat: 0, lng: 0 }, year: 742 };
  for (const bad of [{ ...guess, score: 25000 }, { ...guess, year: 0 }, { ...guess, year: NaN },
    { ...guess, point: { lat: 999, lng: 0 } }, { type: 'next' }, { type: 'unknown' }]) {
    assert.throws(() => rule.action(state, bad, 100));
    assert.equal(state.answers.length, 0);
  }
  let elapsed = 1000;
  for (const [index, id] of ['changan', 'babylon', 'beijing', 'athens', 'paris'].entries()) {
    const scene = JSON.parse(readFileSync(new URL(`../src/scenes/${id}.json`, import.meta.url)));
    const picture = readFileSync(new URL(`../public/${rule.view(state).image}`, import.meta.url));
    assert.deepEqual(picture, readFileSync(new URL(`../public/${scene.image}`, import.meta.url)), 'opaque asset retains original scene');
    if (index === 0) {
      rule.action(state, { type: 'hint' }, elapsed++);
      assert.equal(rule.view(state).hint, scene.hint);
      assert.throws(() => rule.action(state, { type: 'hint' }, elapsed++));
    }
    rule.action(state, { type: 'guess', point: { lat: scene.lat, lng: scene.lng }, year: scene.year }, elapsed++);
    assert.equal(rule.view(state).answer.score, index ? 5000 : 4500);
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
