import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startNativeLettersGame } from '../native.js';
import { findSpelling, letters } from '../engine.js';
import { miniIslands } from '../challenge.js';
import { createNativeSDKFixture, flushNative } from './native-sdk-fixture.mjs';
import { snapshotNative, nativeSwipe, tapNativeTarget, tapNativeTile, finishNativeWord, finishNativeIsland } from './native-test-actions.mjs';

const config = { game: 'letters-words2', platform: 'wechat', title: '词屿 · 字母叠叠乐' };
const source = await readFile(new URL('../native.js', import.meta.url), 'utf8');
assert.doesNotMatch(source, /document\.|window\.|createElement\(|iframe|XMLHttpRequest/);

function launch(options = {}, competition) {
  const fixture = createNativeSDKFixture(options), restoreGlobals = fixture.installGlobals();
  const instance = startNativeLettersGame(fixture.sdk, config, competition || (() => { throw new Error('好友服务暂不可用'); }));
  return { fixture, instance, async close() {
    instance.stop(); instance.stop(); await flushNative();
    assert.equal(fixture.stack.length, 0, 'native renderer balances Canvas save/restore');
    assert.equal([...fixture.listeners.values()].reduce((sum, set) => sum + set.size, 0), 0, 'disposal removes all SDK listeners');
    assert.equal(fixture.timers.size, 0, 'disposal leaves no scheduled work');
    assert.equal(fixture.audio.every(sound => sound.destroyed), true);
    restoreGlobals();
  } };
}

// The actual native shell completes all three islands through real TouchStart/End gestures.
for (const [index, mini] of miniIslands.entries()) {
  const run = launch({ launchQuery: { game: 'letters-words2', mini: mini.id, v: '1', token: 'private', dev: '1' } });
  try {
    await flushNative();
    const { fixture, instance } = run;
    assert.equal(instance.state.page, 'play');
    assert.equal(instance.state.mini, mini.id);
    const initial = snapshotNative(instance.state.game);
    await finishNativeIsland(fixture, instance);
    await tapNativeTarget(fixture, instance, '再练一遍');
    assert.deepEqual(instance.state.game, initial, `${mini.id} native result replay recreates the exact initial board`);
    await finishNativeIsland(fixture, instance);
    await tapNativeTarget(fixture, instance, '去下一座词岛');
    assert.equal(instance.state.mini, miniIslands[(index + 1) % miniIslands.length].id);
    assert.equal(instance.state.page, 'play');
    assert.ok(findSpelling(instance.state.game, instance.state.game.activeWordId));
  } finally { await run.close(); }
}

// Touch cancellation, mismatched touch IDs, moved fingers and hide/resize never leave a pending tap.
{
  const run = launch({ launchQuery: { mini: 'dawn', v: '1' } });
  try {
    const { fixture, instance } = run; await flushNative();
    const target = instance.getLayout().tiles.at(-1);
    assert.ok(target);
    const x = target.x + target.w / 2, y = target.y + target.h / 2;
    const initial = snapshotNative(instance.state.game);
    fixture.touchEnd(x, y);
    assert.deepEqual(instance.state.game, initial, 'an orphan TouchEnd cannot select a card on a full SDK');
    fixture.touchStart(x, y); fixture.touchCancel(x, y); fixture.touchEnd(x, y);
    assert.deepEqual(instance.state.game, initial, 'TouchCancel discards a pending card action');
    fixture.touchStart(x, y, 3); fixture.touchEnd(x, y, 9); fixture.touchEnd(x, y, 3);
    assert.deepEqual(instance.state.game, initial, 'a different finger cannot commit the pending selection');
    fixture.touchStart(x, y); fixture.touchMove(x + 30, y); fixture.touchEnd(x + 30, y);
    assert.deepEqual(instance.state.game, initial, 'a moved finger does not tap another card');
    fixture.touchStart(x, y); fixture.touchStart(x, y, 2, [{ identifier: 1, clientX: x, clientY: y }]); fixture.touchEnd(x, y, 2); fixture.touchEnd(x, y);
    assert.deepEqual(instance.state.game, initial, 'multitouch cannot turn into duplicate card taps');
    await fixture.tick(500);
    fixture.touchStart(x, y); fixture.hide();
    const pausedTime = instance.state.elapsedMs;
    await fixture.tick(60000); fixture.touchEnd(x, y);
    assert.deepEqual(instance.state.game, initial);
    assert.equal(instance.state.elapsedMs, pausedTime, 'background time never advances the learning clock');
    fixture.show();
    assert.equal(instance.state.page, 'pause', 'foreground returns to an explicit pause page');
    fixture.touchEnd(x, y);
    assert.deepEqual(instance.state.game, initial, 'foreground cannot reuse the hidden gesture');
    await tapNativeTarget(fixture, instance, '继续拾词');
    fixture.touchStart(x, y); fixture.resize(320, 568, 3, { top: 30, bottom: 534 }); fixture.touchEnd(x, y);
    assert.deepEqual(instance.state.game, initial, 'resize preserves the exact board and cancels pre-resize input');
    assert.deepEqual([fixture.canvas.width, fixture.canvas.height], [960, 1704]);
    const layout = instance.getLayout();
    for (const hit of layout.targets.filter(hit => ['暂停', '提示', '重排', '✓'].includes(hit.id))) {
      assert.ok(hit.w >= 44 && hit.h >= 44);
      assert.ok(hit.x >= 0 && hit.x + hit.w <= 320);
      assert.ok(hit.y >= 30 && hit.y + hit.h <= 534, `${hit.id} fits the actual safe area`);
    }
    for (const tile of layout.tiles) assert.ok(tile.w >= 44 && tile.h >= 44, 'native letter targets retain a usable physical size');
    const beforeScroll = layout.boardScroll;
    nativeSwipe(fixture, instance, 80);
    assert.ok(instance.getLayout().boardScroll > beforeScroll);
    assert.deepEqual(instance.state.game, initial, 'board dragging scrolls without selecting or changing progress');
    await finishNativeWord(fixture, instance);
    const saved = snapshotNative(instance.state.game);
    fixture.resize(844, 390, 1);
    assert.deepEqual(instance.state.game, saved, 'landscape resize does not reset the game');
  } finally { await run.close(); }
}

// Ordinary saves survive entering and leaving a PK scene; public island shares contain routing fields only.
{
  const pk = [];
  const run = launch({}, (_sdk, options) => { const entry = { options, stops: 0 }; pk.push(entry); return { stop() { entry.stops++; } }; });
  try {
    const { fixture, instance } = run; await flushNative();
    assert.equal(instance.state.page, 'home');
    await tapNativeTarget(fixture, instance, '开始拾词');
    await tapNativeTile(fixture, instance, findSpelling(instance.state.game, instance.state.game.activeWordId)[0]);
    const ordinary = snapshotNative(instance.state.game);
    await tapNativeTarget(fixture, instance, '返回首页');
    await tapNativeTarget(fixture, instance, '好友同题');
    assert.equal(instance.state.page, 'pk'); assert.equal(pk.length, 1);
    pk[0].options.onExit();
    assert.equal(pk[0].stops, 1);
    assert.equal(instance.state.page, 'home');
    assert.deepEqual(instance.state.game, ordinary);
    await tapNativeTarget(fixture, instance, '继续拾词');
    assert.deepEqual(instance.state.game, ordinary);
    await tapNativeTarget(fixture, instance, '返回首页');
    await tapNativeTarget(fixture, instance, '主题词岛'); await tapNativeTarget(fixture, instance, 'dawn');
    await tapNativeTarget(fixture, instance, '暂停'); await tapNativeTarget(fixture, instance, '邀请朋友同题');
    assert.equal(instance.state.page, 'share');
    await tapNativeTarget(fixture, instance, '邀请朋友同题');
    assert.equal(fixture.shares.length, 1);
    assert.equal(fixture.shares[0].query, 'game=letters-words2&mini=dawn&v=1');
    assert.doesNotMatch(fixture.shares[0].query, /dev|token|answers|matchId/);
    await tapNativeTarget(fixture, instance, '复制同题邀请');
    assert.match(fixture.clipboard[0], /mini=dawn&v=1/);
    await tapNativeTarget(fixture, instance, '返回小岛'); await tapNativeTarget(fixture, instance, '回到自由拾词');
    assert.deepEqual(instance.state.game, ordinary, 'leaving a themed invitation restores normal physical board selection');
  } finally { await run.close(); }
}

// Custom long words use real SDK input, independently scroll their board/answer, and remain playable without storage.
{
  const run = launch({ storageFails: true });
  try {
    const { fixture, instance } = run; await flushNative();
    await tapNativeTarget(fixture, instance, '学习入口'); await tapNativeTarget(fixture, instance, '我的词单');
    await tapNativeTarget(fixture, instance, '编辑词单');
    const word = 'a'.repeat(60), text = `${word} 很长的单词\nc++ 编程语言`;
    fixture.emit('KeyboardInput', { value: text }); fixture.emit('KeyboardConfirm', { value: text });
    await tapNativeTarget(fixture, instance, '用这组词开始');
    assert.equal(instance.state.game.tiles.length, letters(word).length + 3);
    assert.match(instance.state.storageNotice, /本次仍可继续/);
    assert.ok(instance.getLayout().board.maxScroll > 800);
    const before = snapshotNative(instance.state.game);
    nativeSwipe(fixture, instance, 180);
    assert.deepEqual(instance.state.game, before);
    if (instance.state.game.words.find(item => item.id === instance.state.game.activeWordId).word !== word) await finishNativeWord(fixture, instance);
    const answer = instance.getLayout().board.answer;
    assert.ok(answer.maxScroll > 2000);
    const x = instance.getLayout().originX + answer.x + answer.w - 12, y = answer.y + answer.h / 2;
    fixture.touchStart(x, y); fixture.touchMove(x - 120, y); fixture.touchEnd(x - 120, y);
    assert.equal(instance.getLayout().answerScroll, 120);
    assert.equal(instance.state.game.selected.length, 0, 'answer scrolling never adds or removes letters');
    await finishNativeIsland(fixture, instance);
    assert.equal(instance.state.game.completed, 2, 'an unavailable storage SDK still supports a full long custom game');
  } finally { await run.close(); }
}

// Invalid launch metadata cannot replace an existing saved game.
{
  const ordinary = launch();
  await flushNative();
  const game = snapshotNative(ordinary.instance.state.game), records = [...ordinary.fixture.storage];
  await ordinary.close();
  const invalid = launch({ storage: records, launchQuery: { mini: ['dawn', 'shore'], v: '1' } });
  try {
    await flushNative();
    assert.equal(invalid.instance.state.page, 'home');
    assert.deepEqual(invalid.instance.state.game, game);
    assert.ok(invalid.fixture.labels.some(item => item.text.includes('同题邀请无效')));
  } finally { await invalid.close(); }
}

// Optional asynchronous SDK results cannot reclaim a page or replace input after leaving it.
{
  let rejectShare;
  const run = launch({ launchQuery: { mini: 'dawn', v: '1' }, onShare: () => new Promise((_resolve, reject) => { rejectShare = reject; }) });
  try {
    const { fixture, instance } = run; await flushNative();
    await tapNativeTarget(fixture, instance, '暂停'); await tapNativeTarget(fixture, instance, '邀请朋友同题');
    await tapNativeTarget(fixture, instance, '邀请朋友同题'); await tapNativeTarget(fixture, instance, '邀请朋友同题');
    assert.equal(fixture.shares.length, 1, 'rapid share touches create only one SDK share request');
    await tapNativeTarget(fixture, instance, '返回小岛');
    rejectShare(new Error('late failure')); await flushNative();
    assert.equal(instance.state.page, 'pause');
    assert.equal(fixture.labels.some(item => item.text.includes('分享未完成')), false, 'late share rejection cannot repaint the new page');
    await tapNativeTarget(fixture, instance, '回到首页'); await tapNativeTarget(fixture, instance, '学习入口'); await tapNativeTarget(fixture, instance, '我的词单');
    let pendingPaste;
    fixture.sdk.getClipboardData = input => { pendingPaste = input; };
    await tapNativeTarget(fixture, instance, '粘贴词单');
    await tapNativeTarget(fixture, instance, '返回');
    pendingPaste.success({ data: 'invalid stale input' }); await flushNative();
    await tapNativeTarget(fixture, instance, '我的词单');
    assert.equal(fixture.labels.some(item => item.text.includes('invalid stale input')), false);
    await tapNativeTarget(fixture, instance, '编辑词单');
    fixture.hide(); fixture.emit('KeyboardConfirm', { value: 'invalid hidden input' }); fixture.show();
    assert.equal(fixture.labels.some(item => item.text.includes('invalid hidden input')), false, 'hidden keyboard confirmation cannot overwrite the word list');
  } finally { await run.close(); }
}

// A packaged textbook read that finishes in the background leaves an explicit, working retry.
{
  const catalog = await readFile(new URL('../assets/english-dict/catalog.json', import.meta.url), 'utf8');
  let resolveFile, reads = 0;
  const run = launch({ readFile: () => { reads++; return new Promise(resolve => { resolveFile = resolve; }); } });
  try {
    const { fixture, instance } = run; await flushNative();
    await tapNativeTarget(fixture, instance, '学习入口'); await tapNativeTarget(fixture, instance, '教材练习');
    assert.equal(instance.state.page, 'library'); assert.equal(reads, 1);
    fixture.hide(); resolveFile(catalog); await flushNative(); fixture.show();
    assert.equal(instance.state.page, 'library');
    assert.ok(fixture.labels.some(item => item.text.includes('点击刷新重试')));
    await tapNativeTarget(fixture, instance, '刷新教材目录');
    assert.equal(reads, 2);
    resolveFile(catalog); await flushNative();
    assert.ok(instance.getLayout().targets.some(item => item.id === 'publisher'), 'retry restores actual publisher selection');
    assert.ok(instance.getLayout().targets.some(item => item.id.includes('开始单元练习')));
  } finally { await run.close(); }
}

console.log('Native Canvas SDK: three physical island wins/exact replay/next, safe-size controls, real cancel/multitouch/scroll, hide/show clock, resize, PK save retention, strict shares, SDK custom input/long-word win, unavailable storage and complete disposal passed.');
