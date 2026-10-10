import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createH5Publishing,
  createSimulationAdProvider,
  publicChallengeUrl,
  shareChallenge,
} from '../publishing.js';

test('public challenges strip inherited secrets and both standalone/Shell dev switches', () => {
  const url = new URL(
    publicChallengeUrl(
      'https://player:secret@game.test/games/tower/?dev=1&token=secret#/play?dev=1',
      {
        seed: 42,
        score: 5,
        dev: 1,
        token: 'secret',
        oversized: 'x'.repeat(257),
        nested: {},
      },
    ),
  );
  assert.equal(url.href, 'https://game.test/games/tower/?seed=42&score=5');
  assert.throws(() => publicChallengeUrl('javascript:alert(1)'), /Invalid/);
});

test('Shell challenges use only the game hash query and remove both inherited queries', () => {
  const url = new URL(
    publicChallengeUrl(
      'https://player:secret@game.test/small-games/?token=secret&dev=1#/games/ball-roguelite?dev=1&seed=old&token=secret',
      {
        challenge: 'orbit-v1',
        level: 'orbit-1',
        seed: 42,
        targetScore: 9,
        dev: 1,
        token: 'secret',
      },
    ),
  );
  assert.equal(
    url.href,
    'https://game.test/small-games/#/games/ball-roguelite?challenge=orbit-v1&level=orbit-1&seed=42&targetScore=9',
  );
  assert.equal(url.search, '');
  assert.equal(url.username, '');
  assert.equal(url.password, '');
});

test('valid encoded Shell ids are canonicalized and empty challenges preserve only the route', () => {
  assert.equal(
    publicChallengeUrl('https://game.test/?dev=1#/games/%62all-roguelite?seed=42&dev=1'),
    'https://game.test/#/games/ball-roguelite',
  );
  assert.equal(
    publicChallengeUrl('https://game.test/standalone/?dev=1#score', { seed: 42 }),
    'https://game.test/standalone/?seed=42',
  );
});

test('malformed Shell routes cannot silently publish a challenge to the catalog', () => {
  for (const hash of [
    '#/games',
    '#/games/',
    '#/games/../other',
    '#/games/a/b',
    '#/games/%2Fa',
    '#/games/%ZZ',
    '#/games/a?seed=1#extra',
    `#/games/${'a'.repeat(81)}`,
  ]) {
    assert.throws(
      () => publicChallengeUrl(`https://game.test/${hash}`, { seed: 42 }),
      /Invalid public Shell route/,
    );
  }
});

test('configured Shell publicUrl reaches the browser clipboard with the game challenge intact', async () => {
  let copied;
  const publishing = createH5Publishing({
    gameId: 'tower-brake',
    title: 'Tower',
    publicUrl: 'https://game.test/small-games/#/games/tower-brake?dev=1',
    environment: {
      location: { href: 'https://iframe.test/tower/?dev=1' },
      navigator: {
        clipboard: {
          writeText: async (value) => {
            copied = value;
          },
        },
      },
    },
  });
  const outcome = await publishing.share({
    params: { challenge: 'tower-v1', level: 'level-1', targetScore: 120 },
  });
  assert.equal(outcome.status, 'copied');
  assert.equal(
    copied,
    'https://game.test/small-games/#/games/tower-brake?challenge=tower-v1&level=level-1&targetScore=120',
  );
  assert.equal(outcome.url, copied);
});

test('share cancellation does not copy or claim delivery, clipboard must really succeed', async () => {
  let copies = 0;
  const environment = {
    location: { href: 'https://game.test/?dev=1' },
    navigator: {
      share: async () => {
        throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
      },
      clipboard: {
        writeText: async () => {
          copies++;
        },
      },
    },
  };
  assert.equal((await shareChallenge({}, environment)).status, 'cancelled');
  assert.equal(copies, 0);
  delete environment.navigator.share;
  assert.equal((await shareChallenge({}, environment)).status, 'copied');
  assert.equal(copies, 1);
  environment.navigator.clipboard.writeText = async () => {
    throw new Error('denied');
  };
  assert.equal((await shareChallenge({}, environment)).status, 'failed');
});

test('natural breaks, global cooldown, caps, optional ads and pause restoration', async () => {
  let time = 0,
    calls = 0,
    paused = 0;
  const publishing = createH5Publishing({
    gameId: 'test',
    title: 'Test',
    adMode: 'host',
    now: () => time,
    maxPerSession: 2,
    provider: {
      show: async () => {
        calls++;
        return { status: 'completed' };
      },
    },
    pause: () => {
      paused++;
      return () => {
        paused--;
      };
    },
  });
  assert.equal((await publishing.interstitial({ placement: 'result' })).status, 'unavailable');
  assert.equal(
    (await publishing.interstitial({ placement: 'result', naturalBreak: true })).status,
    'unavailable',
  );
  assert.equal(
    (await publishing.interstitial({ placement: 'result', naturalBreak: true })).status,
    'unavailable',
  );
  assert.equal(
    (await publishing.interstitial({ placement: 'result', naturalBreak: true })).status,
    'completed',
  );
  assert.equal(paused, 0);
  assert.equal((await publishing.rewarded({ placement: 'revive' })).status, 'unavailable');
  time += 60000;
  assert.equal((await publishing.rewarded({ placement: 'revive' })).status, 'completed');
  time += 60000;
  assert.equal((await publishing.rewarded({ placement: 'boost' })).status, 'unavailable');
  assert.equal(calls, 2);
});

test('a dismissed/disposed ad never rewards, resumes exactly once and cannot overlap', async () => {
  let complete,
    pauses = 0,
    resumes = 0;
  const publishing = createH5Publishing({
    gameId: 'test',
    title: 'Test',
    adMode: 'host',
    provider: {
      show: () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    },
    pause: () => {
      pauses++;
      return () => {
        resumes++;
      };
    },
  });
  const pending = publishing.rewarded({ placement: 'revive' });
  assert.equal((await publishing.rewarded({ placement: 'boost' })).status, 'unavailable');
  publishing.dispose();
  assert.equal((await pending).status, 'dismissed');
  complete({ status: 'completed' });
  await Promise.resolve();
  assert.equal(pauses, 1);
  assert.equal(resumes, 1);
  assert.equal((await publishing.rewarded({ placement: 'revive' })).status, 'unavailable');
});

class Element extends EventTarget {
  constructor(doc) {
    super();
    this.doc = doc;
    this.style = {};
    this.children = [];
    this.attributes = {};
  }
  setAttribute(name, value) {
    this.attributes[name] = value;
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((node) => node !== this);
  }
  focus() {
    this.doc.activeElement = this;
  }
  click() {
    this.dispatchEvent(new Event('click'));
  }
}
function fixture() {
  const doc = new EventTarget();
  doc.hidden = false;
  doc.createElement = () => new Element(doc);
  doc.body = new Element(doc);
  return doc;
}

test('visible mock requires full viewing plus explicit claim; background/close never rewards', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const doc = fixture();
  const provider = createSimulationAdProvider({ document: doc, durationMs: 1000 });
  const pending = provider.show({});
  const [overlay] = doc.body.children;
  const [, , , complete, close] = overlay.children[0].children;
  assert.equal(overlay.attributes['data-game-ad'], 'mock');
  assert.equal(complete.disabled, true);
  complete.click();
  assert.equal(doc.body.children.length, 1);
  t.mock.timers.tick(1000);
  assert.equal(complete.disabled, false);
  complete.click();
  assert.deepEqual(await pending, { status: 'completed' });
  close.click();
  assert.equal(doc.body.children.length, 0);
  const background = provider.show({});
  doc.hidden = true;
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(await background, { status: 'dismissed' });
  assert.deepEqual(await provider.show({}), { status: 'unavailable' });
});

test('hung host playback times out without blocking play or granting reward', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let resumed = 0;
  const publishing = createH5Publishing({
    gameId: 'test',
    title: 'Test',
    adMode: 'host',
    provider: { show: () => new Promise(() => {}) },
    pause: () => () => {
      resumed++;
    },
  });
  const pending = publishing.rewarded({ placement: 'revive' });
  t.mock.timers.tick(45000);
  assert.deepEqual(await pending, { status: 'failed' });
  assert.equal(resumed, 1);
});

test('fullscreen entered after setup keeps the dismiss button inside the visible game tree', async () => {
  const doc = fixture();
  const provider = createSimulationAdProvider({ document: doc });
  const fullscreen = new Element(doc);
  doc.body.append(fullscreen);
  doc.fullscreenElement = fullscreen;
  const pending = provider.show({});
  assert.equal(fullscreen.children[0].attributes['data-game-ad'], 'mock');
  assert.equal(doc.body.children.length, 1);
  provider.dispose();
  assert.deepEqual(await pending, { status: 'dismissed' });
});
