import test from 'node:test';
import assert from 'node:assert/strict';
import { createInterstitials } from '../interstitial.js';
const flush = () => new Promise((resolve) => setImmediate(resolve));

function setup(t, mode = 'ready') {
  let now = 0,
    busy = false,
    shows = 0,
    destroys = 0,
    close,
    error,
    shown;
  t.mock.method(Date, 'now', () => now);
  const environment = new EventTarget();
  environment.document = new EventTarget();
  environment.tap = {
    createInterstitialAd() {
      return {
        onLoad() {},
        onClose(fn) {
          close = fn;
        },
        onError(fn) {
          error = fn;
        },
        load: () => (mode === 'loading' ? new Promise(() => {}) : Promise.resolve()),
        show() {
          shows++;
          return mode === 'opening'
            ? new Promise((resolve) => {
                shown = resolve;
              })
            : Promise.resolve();
        },
        destroy() {
          destroys++;
        },
      };
    },
  };
  const port = createInterstitials(environment, '1234', () => busy);
  t.after(() => port.dispose());
  return {
    port,
    environment,
    close: () => close(),
    error: () => error(),
    shown: () => shown(),
    time: (value) => {
      now = value;
    },
    busy: (value) => {
      busy = value;
    },
    get shows() {
      return shows;
    },
    get destroys() {
      return destroys;
    },
  };
}
test('no startup/first-break ad, only cached inventory after two minutes; rewards exclude breaks', async (t) => {
  const h = setup(t);
  await flush();
  assert.equal(h.shows, 0);
  assert.equal(
    h.port.atBreak('one', () => true),
    false,
  );
  h.time(120001);
  h.busy(true);
  assert.equal(
    h.port.atBreak('two', () => true),
    false,
  );
  h.busy(false);
  assert.equal(
    h.port.atBreak('three', () => true),
    true,
  );
  assert.equal(h.port.pending, true);
  assert.equal(
    h.port.atBreak('three', () => true),
    false,
  );
  await flush();
  h.environment.dispatchEvent(new Event('pointerdown'));
  assert.equal(h.port.pending, true, 'native ad interactions must not cancel a displayed ad');
  h.close();
  assert.equal(h.port.pending, false);
  assert.equal(h.destroys, 1);
});
test('unready inventory and stale/hidden/developer breaks never interrupt gameplay', async (t) => {
  const h = setup(t, 'loading');
  h.time(900000);
  h.port.atBreak('one', () => true);
  assert.equal(
    h.port.atBreak('two', () => true),
    false,
  );
  assert.equal(
    h.port.atBreak('stale', () => false),
    false,
  );
  h.environment.document.hidden = true;
  assert.equal(
    h.port.atBreak('hidden', () => true),
    false,
  );
  h.environment.document.hidden = false;
  h.environment.SmallGamesDev = { isEnabled: () => true };
  assert.equal(
    h.port.atBreak('dev', () => true),
    false,
  );
  assert.equal(h.shows, 0);
});
test('navigation cancels an unresolved show; late display/close cannot revive it', async (t) => {
  const h = setup(t, 'opening');
  await flush();
  h.port.atBreak('one', () => true);
  h.time(120001);
  assert.equal(
    h.port.atBreak('two', () => true),
    true,
  );
  h.environment.dispatchEvent(new Event('pointerdown'));
  h.shown();
  h.close();
  h.error();
  await flush();
  assert.equal(h.port.pending, false);
  assert.equal(h.destroys, 1);
  assert.equal(h.shows, 1);
});
