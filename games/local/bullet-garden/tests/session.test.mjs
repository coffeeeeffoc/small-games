import test from 'node:test';
import assert from 'node:assert/strict';
import { GardenSession } from '../src/session.mjs';

function fixture() {
  let resolve,
    request,
    saves = 0;
  const session = new GardenSession({
    adAvailable: () => true,
    save: () => saves++,
    provider: {
      show(options) {
        assert.equal(options.opportunityId, `bullet-garden:${options.placement}`);
        request = options;
        return new Promise((done) => {
          resolve = done;
        });
      },
      cancel() {},
    },
  });
  session.begin('ruins', { seed: 42 });
  return {
    session,
    shown: () => request.onShown(),
    done: (status) => resolve({ status }),
    saves: () => saves,
  };
}
test('lost combat waits for explicit finish; revive cannot pre-settle rewards', async () => {
  const f = fixture(),
    s = f.session;
  s.state.phase = 'lost';
  s.state.player.hp = 0;
  s.tick(0, {});
  assert.equal(s.screen, 'failed');
  assert.equal(f.saves(), 0);
  const promise = s.reward('revive');
  f.shown();
  f.done('completed');
  await promise;
  assert.equal(s.screen, 'paused');
  assert.equal(s.state.player.hp, 50);
  assert.equal(s.state.player.invulnerable, 3);
  assert.equal(s.used.revive, true);
  assert.equal(s.eligible('revive'), false);
  assert.equal(f.saves(), 0);
  s.resume();
  s.state.phase = 'lost';
  s.tick(0, {});
  s.finish();
  s.finish();
  assert.equal(f.saves(), 1);
});
test('supply only completed, once per run, no full-health offer', async () => {
  for (const status of ['dismissed', 'failed', 'unavailable', 'completed']) {
    const f = fixture(),
      s = f.session;
    s.pause();
    assert.equal(s.eligible('supply'), false);
    s.state.player.hp = 40;
    const promise = s.reward('supply');
    assert.equal(s.eligible('supply'), false);
    f.shown();
    f.done(status);
    await promise;
    assert.equal(s.state.player.hp, status === 'completed' ? 70 : 40);
    assert.equal(s.used.supply, status === 'completed');
    assert.equal(s.screen, 'paused');
  }
});
test('SDK hide defers completed grant until visible and never auto-resumes', async () => {
  const f = fixture(),
    s = f.session;
  s.pause();
  s.state.player.hp = 30;
  const promise = s.reward('supply');
  f.shown();
  s.suspend();
  f.done('completed');
  await promise;
  assert.equal(s.state.player.hp, 30);
  assert.ok(s.pending);
  s.show();
  assert.equal(s.state.player.hp, 60);
  assert.equal(s.screen, 'paused');
  s.show();
  assert.equal(s.state.player.hp, 60);
});
test('H5 or native hide may precede the SDK onShown promise without losing its lease', async () => {
  const f = fixture(),
    s = f.session;
  s.pause();
  s.state.player.hp = 30;
  const promise = s.reward('supply');
  s.suspend();
  f.shown();
  f.done('completed');
  await promise;
  assert.equal(s.state.player.hp, 30);
  s.show();
  assert.equal(s.state.player.hp, 60);
});
test('restart, leave and destroy invalidate late reward', async () => {
  for (const action of ['cancelAd', 'begin', 'home', 'dispose']) {
    const f = fixture(),
      s = f.session;
    s.pause();
    s.state.player.hp = 20;
    const old = s.state;
    const promise = s.reward('supply');
    if (action === 'begin') s.begin('ruins');
    else s[action]();
    f.done('completed');
    await promise;
    s.show();
    assert.equal(old.player.hp, 20);
    assert.equal(s.used.supply, false);
  }
});
test('upgrade and lifecycle pauses freeze time; successful completion settles updated profile once', () => {
  const f = fixture(),
    s = f.session;
  s.pause();
  const time = s.state.time;
  s.tick(10, { moveX: 1 });
  assert.equal(s.state.time, time);
  s.show();
  assert.equal(s.screen, 'paused');
  s.resume();
  s.state.phase = 'won';
  s.tick(0, {});
  assert.equal(s.screen, 'result');
  assert.ok(s.profile.completed.includes('ruins'));
  assert.ok(s.profile.coins > 0);
  s.finish();
  assert.equal(f.saves(), 1);
});
test('developer victory cannot change permanent profile', () => {
  const f = fixture(),
    s = f.session;
  s.begin('skyreach', { dev: true });
  const before = JSON.stringify(s.profile);
  s.state.phase = 'won';
  s.tick(0, {});
  assert.equal(JSON.stringify(s.profile), before);
  assert.equal(f.saves(), 0);
});
