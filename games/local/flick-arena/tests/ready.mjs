import assert from 'node:assert/strict';

// Cocos initializes asynchronously; drive the mocked clock until the real scene is ready.
export async function ready(page, clock = true) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await page.locator('body').getAttribute('data-phase')) return;
    assert.equal(await page.locator('.load-error').count(), 0, 'Cocos initialization failed');
    if (clock) await page.clock.runFor(100);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Cocos scene did not become ready');
}
