import assert from 'node:assert/strict';
import { findSpelling } from '../engine.js';
import { flushNative } from './native-sdk-fixture.mjs';

export const snapshotNative = value => JSON.parse(JSON.stringify(value));

export function nativeSwipe(fixture, instance, delta, area = instance.getLayout().board) {
  const layout = instance.getLayout();
  const x = layout.originX + (area ? area.x + area.w / 2 : (layout.width - 2 * layout.originX) / 2);
  const top = area ? area.y + 16 : layout.top + 72;
  const bottom = area ? area.y + area.h - 16 : layout.height - layout.bottom - 24;
  const move = Math.sign(delta) * Math.min(Math.abs(delta), bottom - top);
  const from = move >= 0 ? bottom : top;
  fixture.touchStart(x, from);
  fixture.touchMove(x, from - move);
  fixture.touchEnd(x, from - move);
}

export async function tapNativeTarget(fixture, instance, name) {
  for (let i = 0; i < 20; i++) {
    const layout = instance.getLayout();
    const hit = layout.targets.find(item => item.id === name) || layout.targets.find(item => item.id.includes(name));
    assert.ok(hit, `native ${layout.page} has target ${name}`);
    const y = hit.y + hit.h / 2;
    if (y >= layout.top && y + hit.h / 2 <= layout.height - layout.bottom) {
      fixture.tap(hit.x + hit.w / 2, y); await flushNative(); return;
    }
    nativeSwipe(fixture, instance, hit.y + hit.h > layout.height - layout.bottom ? 300 : -300, null);
  }
  assert.fail(`native target ${name} cannot be scrolled into the safe viewport`);
}

export async function tapNativeTile(fixture, instance, id) {
  for (let i = 0; i < 35; i++) {
    const layout = instance.getLayout(), game = instance.state.game, engineTile = game.tiles.find(tile => tile.id === id);
    const target = layout.tiles.find(tile => tile.id === id);
    if (target && target.y + target.h / 2 > layout.board.y + 2 && target.y + target.h / 2 < layout.board.y + layout.board.h - 2) {
      const x = target.x + target.w / 2, y = target.y + target.h / 2;
      fixture.tap(x, y); await flushNative(); return;
    }
    assert.ok(engineTile && !engineTile.removed, 'requested native tile exists');
    const size = layout.tiles[0]?.w || Math.max(44, (layout.width - 2 * layout.originX - 54) / 360 * 64);
    const scale = size / 64;
    const desired = Math.max(0, Math.min(layout.board.maxScroll, engineTile.y * scale + size / 2 - layout.board.h / 2));
    const delta = desired - layout.boardScroll;
    assert.ok(Math.abs(delta) > 0.01, `tile ${id} must be reachable by scrolling`);
    nativeSwipe(fixture, instance, delta);
  }
  assert.fail(`native tile ${id} was not reachable`);
}

export async function finishNativeWord(fixture, instance) {
  const before = instance.state.game.completed;
  const path = findSpelling(instance.state.game, instance.state.game.activeWordId);
  assert.ok(path?.length, 'native board exposes a real spelling');
  for (const id of path) await tapNativeTile(fixture, instance, id);
  assert.equal(instance.state.game.completed, before + 1, 'physical native tile touches spell and submit a real word');
}

export async function finishNativeIsland(fixture, instance) {
  while (instance.state.game.completed < instance.state.game.words.length) await finishNativeWord(fixture, instance);
  assert.equal(instance.state.page, 'result');
}
