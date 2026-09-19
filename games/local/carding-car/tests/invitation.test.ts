import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { readInvitation, invitationQuery } from '../assets/scripts/Invitation.ts';
import { defaultSelection } from '../assets/scripts/Selection.ts';

test('native cards carry the complete selection through cold and warm starts on both platforms', () => {
  const selection = { theme: 'city', route: 'desert', vehicle: 'formula', driver: 'aviator' };
  const query = invitationQuery('ABCD1234', selection);
  const parsed = Object.fromEntries(new URLSearchParams(query));
  assert.deepEqual(readInvitation(parsed), { code: 'ABCD1234', selection });
  assert.equal(readInvitation({ room: '<script>' }), undefined);
  assert.deepEqual(
    readInvitation({ room: 'ABCD1234', theme: '../bad' })?.selection,
    defaultSelection,
  );
  for (const sdkName of ['wx', 'bl']) {
    let onShow: (options: { query: object }) => void = () => {};
    let passive: () => { query: string } = () => ({ query: '' });
    let shared: { query: string } | undefined;
    const context = vm.createContext({
      [sdkName]: {
        getLaunchOptionsSync: () => ({ query: parsed }),
        showShareMenu() {},
        onShow(callback: typeof onShow) {
          onShow = callback;
        },
        onShareAppMessage(callback: typeof passive) {
          passive = callback;
        },
        shareAppMessage(payload: typeof shared) {
          shared = payload;
        },
      },
    });
    vm.runInContext(
      readFileSync(new URL('../../../../platforms/kart-sharing.js', import.meta.url), 'utf8'),
      context,
    );
    const bridge = context.__kartPlatform;
    assert.equal(bridge.query.room, 'ABCD1234');
    assert.equal(bridge.share(query), true);
    assert.equal(shared?.query, query);
    assert.equal(passive().query, query);
    let warm: unknown;
    bridge.onInvite = (value: unknown) => {
      warm = value;
    };
    const next = { room: '1234ABCD', ...selection };
    onShow({ query: next });
    assert.equal(warm, next);
    bridge.setQuery('');
    assert.equal(passive().query, '');
  }
});
