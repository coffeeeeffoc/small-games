import assert from 'node:assert/strict';
import { BILL, CONTACTS, DESTINATIONS, SLOTS, createGame, act, tick, restoreGame, summarize } from '../src/game.js';

function run(state, type, payload = {}) {
  const result = act(state, { type, ...payload });
  assert.equal(result.ok, true, `${type}: ${result.error ?? ''}`);
  return state;
}
const start = () => run(createGame(), 'start');
const saved = (state) => JSON.parse(JSON.stringify(state));

// Finish the real tasks in a different order, independently verify, and reject calls.
{
  const state = start();
  run(state, 'lookup-bill', { account: BILL.account });
  run(state, 'request-code', { purpose: 'bill' });
  assert.match(state.threads.wallet.at(-1).text, /电费/);
  run(state, 'pay-bill', { code: '481926' });
  run(state, 'pay-bill', { code: '481926' });
  run(state, 'view-order', { order: 'install' });
  run(state, 'book', { slot: SLOTS[1] });
  run(state, 'verify', { topic: 'install' });
  run(state, 'view-order', { order: 'parcel' });
  run(state, 'verify', { topic: 'parcel' });
  run(state, 'redirect', { location: DESTINATIONS[1] });
  assert.equal(state.tasks.delivery, null, 'old address must not complete the task');
  run(state, 'redirect', { location: DESTINATIONS[0] });
  run(state, 'redirect', { location: DESTINATIONS[0] });
  tick(state, 2);
  assert.equal(state.call.id, 'parcel');
  run(state, 'decline-call');
  tick(state, 1);
  assert.equal(state.call.id, 'supervisor');
  run(state, 'decline-call');
  tick(state, 100);
  assert.equal(state.balance, 368000 - BILL.amount);
  assert.equal(state.transactions.length, 1);
  assert.equal(state.evidence.length, 3);
  assert.deepEqual([...state.evidence].sort(), ['bill', 'install', 'parcel']);
  assert.equal(summarize(state).passed, true);
  assert.equal(summarize(state).completed, 3);
  run(state, 'finish');
  const snapshot = JSON.stringify(state);
  tick(state, 500);
  assert.equal(JSON.stringify(state), snapshot, 'finished runs must not advance');
  run(state, 'resume');
  assert.equal(state.ended, false);
}

// Refusing all callers is allowed, but it does not do the player's errands.
{
  const state = start();
  run(state, 'view-order', { order: 'parcel' });
  tick(state, 2);
  run(state, 'decline-call');
  tick(state, 25);
  run(state, 'decline-call');
  run(state, 'finish');
  assert.equal(summarize(state).completed, 0);
  assert.equal(summarize(state).passed, false);
  assert.equal(summarize(state).safe, true);
}

// A visit alone is harmless. A real requested login code must be submitted.
{
  const state = start();
  run(state, 'open-link', { page: 'refund' });
  run(state, 'open-link', { page: 'deposit' });
  assert.equal(state.balance, 368000);
  assert.equal(state.leaks.length, 0);
  assert.equal(act(state, { type: 'submit-refund', code: '743018' }).ok, false);
  run(state, 'request-code', { purpose: 'refund' });
  assert.match(state.threads.wallet.at(-1).text, /新设备登录/);
  assert.match(state.threads.wallet.at(-1).text, /不是退款/);
  assert.equal(act(state, { type: 'submit-refund', code: '481926' }).ok, false);
  run(state, 'submit-refund', { code: '743018' });
  run(state, 'submit-refund', { code: '743018' });
  assert.equal(state.leaks.length, 1);
  assert.equal(state.balance, 368000, 'code disclosure must not invent a cash transfer');
  assert.equal(summarize(state).safe, false);
  run(state, 'secure-account');
  run(state, 'secure-account');
  assert.equal(state.flags.accountSecured, true);
  assert.equal(state.leaks.length, 1, 'account protection cannot erase historical disclosure');
  assert.equal(act(state, { type: 'request-code', purpose: 'refund' }).ok, false);
  run(state, 'pay-deposit');
  run(state, 'pay-deposit');
  assert.equal(state.balance, 368000 - 49900);
  assert.equal(state.transactions.length, 1);
  assert.equal(state.transactions[0].payee, '林某');
  assert.equal(summarize(state).loss, 49900);
  assert.equal(restoreGame(JSON.stringify(state)).balance, state.balance);
}

// Disclosing the same code through a message has the same consequence.
{
  const state = start();
  run(state, 'open-link', { page: 'refund' });
  run(state, 'request-code', { purpose: 'refund' });
  run(state, 'send-message', { id: 'parcel', text: '验证码是743018' });
  assert.equal(state.leaks.length, 1);
  const messages = state.threads.parcel.length;
  tick(state, 2);
  assert.equal(state.threads.parcel.length, messages, 'replies must be delayed');
  tick(state, 1);
  assert.equal(state.threads.parcel.length, messages + 1);
  assert.ok(state.unread.parcel > 0);
  run(state, 'read-thread', { id: 'parcel' });
  assert.equal(state.unread.parcel, 0);
  assert.ok(state.notifications.filter((entry) => entry.thread === 'parcel').every((entry) => entry.read));
}

// Invalid business input must leave money intact; insufficient funds cannot go negative.
{
  const state = start();
  for (const action of [
    null, {}, { type: 'unknown' }, { type: 'redirect', location: DESTINATIONS[0] },
    { type: 'book', slot: SLOTS[0] }, { type: 'verify', topic: 'parcel' },
    { type: 'lookup-bill', account: '__proto__' }, { type: 'request-code', purpose: 'other' },
    { type: 'request-code', purpose: 'bill' }, { type: 'pay-bill', code: '481926' },
    { type: 'pay-deposit' }, { type: 'read-thread', id: '__proto__' },
    { type: 'send-message', id: 'landlord', text: 'x'.repeat(121) },
    { type: 'call-back', id: 'constructor' }, { type: 'call-reply', index: 0 },
  ]) assert.equal(act(state, action).ok, false, JSON.stringify(action));
  assert.equal(state.balance, 368000);
  run(state, 'lookup-bill', { account: BILL.account });
  run(state, 'request-code', { purpose: 'bill' });
  const beforeBadQuery = JSON.stringify(state);
  assert.equal(act(state, { type: 'lookup-bill', account: '999' }).ok, false);
  assert.equal(JSON.stringify(state), beforeBadQuery, 'a failed lookup must not invalidate an already displayed bill');
  assert.equal(act(state, { type: 'pay-bill', code: '743018' }).ok, false);
  run(state, 'open-link', { page: 'deposit' });
  state.balance = 100;
  assert.equal(act(state, { type: 'pay-bill', code: '481926' }).ok, false);
  assert.equal(act(state, { type: 'pay-deposit' }).ok, false);
  assert.equal(state.balance, 100);
  assert.equal(state.transactions.length, 0);
}

// Calls queue during conversations, rings expire, repeated entry cannot duplicate events.
{
  const state = start();
  run(state, 'view-order', { order: 'parcel' });
  const events = state.events.length;
  run(state, 'view-order', { order: 'parcel' });
  assert.equal(state.events.length, events);
  tick(state, 2);
  run(state, 'answer-call');
  run(state, 'call-reply', { index: 0 });
  assert.equal(state.call.text, CONTACTS.parcel.replies[0].text);
  assert.equal(state.call.turn, 0, 'a player response must not skip the caller narrative');
  run(state, 'call-continue');
  assert.equal(state.call.turn, 1);
  assert.equal(state.call.text, undefined);
  run(state, 'call-continue');
  const lastLine = JSON.stringify(state);
  run(state, 'call-continue');
  assert.equal(JSON.stringify(state), lastLine, 'continuing after the last sentence must be idempotent');
  tick(state, 30);
  assert.equal(state.call.id, 'parcel');
  assert.ok(state.callQueue.includes('courier'));
  run(state, 'hangup');
  assert.equal(state.call.id, 'courier');
  assert.equal(state.call.phase, 'ringing');
  tick(state, 22);
  assert.equal(state.call, null);
  assert.equal(state.callHistory[0].status, 'missed');
  run(state, 'call-back', { id: 'courier' });
  assert.equal(state.call.phase, 'connected');
  const restored = restoreGame(JSON.stringify(state));
  assert.equal(restored.call, null);
  assert.equal(restored.callHistory[0].status, 'missed');
  assert.equal(restored.time, state.time);
  assert.deepEqual(restored.tasks, state.tasks);
  assert.deepEqual(restored.events, state.events);
  const currentTime = state.time;
  for (const delta of [0, -1, NaN, Infinity, '1']) tick(state, delta);
  assert.equal(state.time, currentTime);
}

// Corrupt/old saves are discarded; a valid save keeps business receipts and drafts.
{
  const state = start();
  state.drafts.billAccount = '330106';
  assert.equal(restoreGame(JSON.stringify(state)).drafts.billAccount, '330106');
  for (const raw of [undefined, null, '{', 'null', '[]', '{}', { version: 0 },
    { ...saved(state), balance: -1 }, { ...saved(state), events: [{ at: 1, contact: 'ghost', type: 'call' }] },
    { ...saved(state), flags: {} }, { ...saved(state), tasks: { ...state.tasks, bill: true } },
    { ...saved(state), call: { id: 'constructor', phase: 'ringing', elapsed: 0, turn: 0 } },
    { ...saved(state), threads: null }, { ...saved(state), unread: {} },
  ]) {
    const fresh = restoreGame(raw);
    assert.equal(fresh.started, false);
    assert.equal(fresh.balance, 368000);
    assert.equal(fresh.call, null);
  }
  const ringing = start();
  run(ringing, 'view-order', { order: 'parcel' });
  tick(ringing, 2);
  assert.equal(restoreGame(JSON.stringify(ringing)).call, null);
  const legacy = saved(state);
  legacy.evidence = ['拾物原订单客服：物流正常，无破损或赔付工单', 'constructor'];
  assert.deepEqual(restoreGame(legacy).evidence, ['parcel', 'constructor']);
}

// Submitted remarks update receipts, are validated, and are not sent twice.
{
  const state = start();
  run(state, 'view-order', { order: 'parcel' });
  run(state, 'view-order', { order: 'install' });
  run(state, 'redirect', { location: DESTINATIONS[0], note: '请放驿站' });
  run(state, 'book', { slot: SLOTS[0], note: '到楼下打电话' });
  assert.equal(state.flags.deliveryNote, '请放驿站');
  assert.equal(state.flags.installNote, '到楼下打电话');
  assert.match(state.threads.shop.at(-1).text, /投递备注：请放驿站/);
  assert.match(state.threads.network.at(-1).text, /上门备注：到楼下打电话/);
  const count = state.notifications.length;
  run(state, 'redirect', { location: DESTINATIONS[0], note: '请放驿站' });
  run(state, 'book', { slot: SLOTS[0], note: '到楼下打电话' });
  assert.equal(state.notifications.length, count);
  run(state, 'book', { slot: SLOTS[0], note: '到了按门铃' });
  assert.equal(state.notifications.length, count + 1);
  assert.match(state.threads.network.at(-1).text, /到了按门铃/);
  for (const note of ['字'.repeat(81), null, 123]) {
    assert.equal(act(state, { type: 'redirect', location: DESTINATIONS[0], note }).ok, false);
    assert.equal(act(state, { type: 'book', slot: SLOTS[0], note }).ok, false);
  }
  const restored = restoreGame(state);
  assert.equal(restored.flags.installNote, '到了按门铃');
  assert.equal(restored.flags.deliveryNote, '请放驿站');
  const numbers = Object.values(CONTACTS).map((contact) => contact.number.replace(/\D/g, ''));
  assert.ok(numbers.every((number) => /^1\d{10}$/.test(number)));
  assert.equal(new Set(numbers).size, numbers.length);
}

// Delayed replies and delivery calls use the business state at arrival time.
{
  const state = start();
  run(state, 'view-order', { order: 'parcel' });
  run(state, 'send-message', { id: 'courier', text: '我先核对一下' });
  run(state, 'redirect', { location: DESTINATIONS[0] });
  tick(state, 3);
  assert.match(state.threads.courier.at(-1).text, /系统已收到：梧桐里/);
  run(state, 'answer-call');
  tick(state, 30);
  assert.match(state.threads.courier.at(-1).text, /系统已收到：梧桐里/);
  assert.deepEqual(state.callQueue, ['courier']);
  run(state, 'finish');
  tick(state, 100);
  assert.deepEqual(state.callQueue, ['courier'], 'review must preserve pending calls');
  run(state, 'resume');
  assert.equal(state.call.id, 'courier');
  assert.equal(state.call.turn, 2, 'already updated delivery must not be described as the old address');
}

console.log('game.test.mjs: safe play, both fraud branches, validation, timing and saves passed');
