import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const source = await readFile(new URL('../platforms/kart-sharing.js', import.meta.url), 'utf8');
for (const [platform, global] of Object.entries({
  wechat: 'wx',
  bilibili: 'bl',
  douyin: 'tt',
  kuaishou: 'ks',
  taptap: 'tap',
})) {
  test(`${platform} routes invitations through its own SDK`, () => {
    let onShow, payload, invitation, launch;
    const shares = [];
    const sdk = {
      getLaunchOptionsSync: () => ({ query: { room: 'launch-room' } }),
      showShareMenu: () => {},
      onShareAppMessage: (callback) => {
        payload = callback;
      },
      shareAppMessage: (value) => shares.push(value),
      onShow: (callback) => {
        onShow = callback;
      },
    };
    const unrelated = { shareAppMessage: () => assert.fail('wrong channel SDK') };
    const context = {
      wx: unrelated,
      bl: unrelated,
      tt: unrelated,
      ks: unrelated,
      [global]: sdk,
      __COMPETITION_CONFIG__: { platform },
      __kartServerUrl: 'wss://test.invalid/kart',
    };
    runInNewContext(source, context);
    const bridge = context.__kartPlatform;
    assert.equal(bridge.serverUrl, 'wss://test.invalid/kart');
    assert.equal(bridge.query.room, 'launch-room');
    bridge.setQuery('room=shared-room');
    assert.equal(payload().query, 'room=shared-room');
    assert.equal(bridge.share('room=new-room'), true);
    assert.equal(shares[0].query, 'room=new-room');
    bridge.onLaunch = (value) => {
      launch = value;
    };
    bridge.onInvite = (value) => {
      invitation = value.room;
    };
    onShow({ query: { room: 'return-room' } });
    assert.equal(invitation, 'return-room');
    assert.equal(launch.room, 'return-room');
    onShow({ query: { kartChallenge: 'v1', route: 'coast' } });
    assert.equal(launch.kartChallenge, 'v1');
    assert.equal(invitation, 'return-room', 'a challenge does not trigger a room invitation');
    assert.equal(bridge.share('kartChallenge=v1&route=coast', '来挑战我的海岸路线！'), true);
    assert.equal(shares[1].title, '来挑战我的海岸路线！');
    assert.equal(payload().query, 'kartChallenge=v1&route=coast');
    bridge.setQuery('room=normal');
    assert.equal(payload().title, '好友一起开跑，来我的卡丁车房间！');
    onShow({});
    onShow();
    assert.equal(bridge.query.kartChallenge, 'v1');
  });
}
test('unavailable optional sharing never prevents manual room invitations', () => {
  const sdk = {
    getLaunchOptionsSync: () => {
      throw Error('unavailable');
    },
    showShareMenu: () => {
      throw Error('unavailable');
    },
    onShareAppMessage: () => {
      throw Error('unavailable');
    },
    shareAppMessage: () => {
      throw Error('unavailable');
    },
    onShow: () => {
      throw Error('unavailable');
    },
  };
  const context = { ks: sdk, __COMPETITION_CONFIG__: { platform: 'kuaishou' } };
  runInNewContext(source, context);
  assert.equal(context.__kartPlatform.share('room=code'), false);
  assert.equal(Object.keys(context.__kartPlatform.query).length, 0);
});
test('a declared channel never borrows another platform identity', () => {
  const context = { wx: {}, __COMPETITION_CONFIG__: { platform: 'douyin' } };
  runInNewContext(source, context);
  assert.equal(context.__kartPlatform, undefined);
});
