import { assertHostCapabilities } from '@coffeeeeffoc/game-contract';
import type { BuiltInGame } from '../src/registry.js';

/** Trusted disposable test module for Shell lifecycle, storage and remote fallback contracts. */
export const fixtureGame: BuiltInGame = {
  id: 'fixture-game',
  title: 'Fixture game',
  description: 'Shell contract fixture',
  content: { gameId: 'fixture-game', schemaVersion: 1, revision: 0, payload: {} },
  definition: {
    manifest: {
      gameId: 'fixture-game',
      version: '1.1.0',
      gameContractVersion: 1,
      contentSchemaVersion: 1,
      capabilities: ['content', 'storage'],
      loadModes: ['in-process', 'iframe'],
      entry: 'index.html',
      integrity: 'builtin:fixture-game@1.1.0',
    },
    async mount(target, host) {
      assertHostCapabilities(['content', 'storage'], host.session.capabilities);
      const view = document.createElement('section');
      const render = (paused: boolean) => {
        view.textContent = paused ? '已暂停' : 'Fixture game';
        if (paused) {
          const resume = document.createElement('button');
          resume.textContent = '继续';
          resume.onclick = () => render(false);
          view.append(resume);
        }
      };
      render(false);
      target.append(view);
      return {
        pause() {
          render(true);
        },
        resume() {
          render(false);
        },
        async dispose() {
          view.remove();
        },
      };
    },
  },
};
export const fixtureRegistry = [fixtureGame];
