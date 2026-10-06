import assert from 'node:assert/strict';
import { startNativeLettersGame } from '../native.js';
import { findSpelling } from '../engine.js';
import { createNativeSDKFixture, flushNative } from './native-sdk-fixture.mjs';
import { snapshotNative, tapNativeTarget, tapNativeTile } from './native-test-actions.mjs';

for (const [width, height] of [[320, 568], [390, 844], [430, 932]]) {
  const fixture = createNativeSDKFixture({ width, height }), restoreGlobals = fixture.installGlobals();
  const instance = startNativeLettersGame(fixture.sdk, { game: 'letters-words2', platform: 'wechat', title: '词屿 · 字母叠叠乐' }, () => { throw new Error('unused PK fixture'); });
  try {
    await flushNative();
    assert.equal(instance.state.page, 'home');
    await tapNativeTarget(fixture, instance, '设置');
    assert.equal(instance.state.page, 'settings');
    await tapNativeTarget(fixture, instance, '返回');
    assert.equal(instance.state.page, 'home', 'homepage settings returns to the homepage');
    await tapNativeTarget(fixture, instance, '开始拾词');
    const path = findSpelling(instance.state.game, instance.state.game.activeWordId);
    await tapNativeTile(fixture, instance, path[0]);
    const selected = snapshotNative(instance.state.game);
    assert.equal(selected.selected.length, 1);
    await tapNativeTarget(fixture, instance, '暂停');
    assert.equal(instance.state.page, 'pause'); assert.equal(instance.state.paused, true);
    const settings = instance.getLayout().targets.find(item => item.id === '设置');
    assert.ok(settings && settings.w >= 44 && settings.h >= 44, 'pause settings retains a usable touch area');
    await tapNativeTarget(fixture, instance, '设置');
    assert.equal(instance.state.page, 'settings');
    await tapNativeTarget(fixture, instance, '游戏音效');
    assert.equal(fixture.storage.get('ciyu-sound'), 'true');
    await fixture.tick(60000);
    assert.deepEqual(instance.state.game, selected, 'settings keeps the exact selected cards and physical board');
    assert.equal(instance.state.paused, true, 'settings entered from pause keeps the clock paused');
    await tapNativeTarget(fixture, instance, '返回');
    assert.equal(instance.state.page, 'pause', 'pause settings returns to the pause page');
    assert.deepEqual(instance.state.game, selected);
    const help = instance.getLayout().targets.find(item => item.id === '拾词指南');
    assert.ok(help && help.w >= 44 && help.h >= 44, 'pause help retains a usable touch area');
    await tapNativeTarget(fixture, instance, '拾词指南');
    assert.equal(instance.state.page, 'help');
    await tapNativeTarget(fixture, instance, '返回');
    assert.equal(instance.state.page, 'pause', 'pause help returns to the pause page');
    assert.deepEqual(instance.state.game, selected);
    await tapNativeTarget(fixture, instance, '继续拾词');
    assert.equal(instance.state.page, 'play'); assert.equal(instance.state.paused, false);
    assert.deepEqual(instance.state.game, selected, 'resuming after settings retains unfinished spelling');
  } finally {
    instance.stop(); restoreGlobals();
    assert.equal([...fixture.listeners.values()].reduce((sum, set) => sum + set.size, 0), 0);
  }
}
console.log('Native settings/help navigation: 320/390/430 homepage and pause return chains, 44 px pause entries, saved audio, paused clock and exact selected-board retention passed.');
