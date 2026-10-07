import manifest from './manifest.json' with { type: 'json' };
import { createGame } from './game.mjs';
import { layouts, validateLayouts } from './layouts.mjs';
import { saveKey } from './progress.mjs';
export const defaultFlickEnvelope = {
  gameId: 'flick-arena',
  schemaVersion: 1,
  revision: 1,
  payload: { layouts },
};
export const flickCanvasDefinition = {
  manifest,
  async mount(target, host) {
    if (host.session.gameId !== 'flick-arena') throw new Error('Game Session identity mismatch');
    const content = await host.content.load();
    if (content.gameId !== 'flick-arena' || content.schemaVersion !== 1)
      throw new Error('Unsupported flick-arena content');
    validateLayouts(content.payload.layouts);
    let save;
    try {
      save = (await host.storage.read(saveKey))?.value;
    } catch {}
    let pending = Promise.resolve();
    const game = createGame(target, {
      save,
      layouts: content.payload.layouts,
      saveProgress(value) {
        pending = pending.catch(() => {}).then(() => host.storage.write(saveKey, value));
        return pending;
      },
    });
    let previous = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      game.tick((now - previous) / 1000);
      previous = now;
    }, 1000 / 60);
    return {
      pause() {
        game.pause();
      },
      resume() {
        previous = Date.now();
        game.resume();
      },
      async dispose() {
        clearInterval(timer);
        game.dispose();
        await pending.catch(() => {});
      },
    };
  },
};
