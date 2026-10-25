import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { writeLegacyGameRedirects } from './legacy-game-redirects.mjs';

test('old independent URLs preserve challenges and use replace under every deployment prefix', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'game-redirect-'));
  try {
    await writeLegacyGameRedirects(dir, ['other-game']);
    await assert.rejects(access(path.join(dir, 'three-choose-two/index.html')));
    await writeLegacyGameRedirects(dir, ['place-and-clear']);
    const html = await readFile(path.join(dir, 'three-choose-two/index.html'), 'utf8');
    const script = html.match(/<script>([\s\S]+)<\/script>/)[1];
    for (const prefix of ['/', '/dev/', '/small-games/']) {
      const original = new URL(
        `https://example.com${prefix}games/three-choose-two/index.html?seed=42&variant=refill#continue`,
      );
      let target;
      vm.runInNewContext(script, {
        URL,
        location: {
          href: original.href,
          search: original.search,
          hash: original.hash,
          replace: (url) => {
            target = url;
          },
        },
      });
      assert.equal(
        target,
        `https://example.com${prefix}games/place-and-clear/index.html?seed=42&variant=refill#continue`,
      );
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
