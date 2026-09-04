import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { validateContentEnvelope } from '@coffeeeeffoc/content-schema';
import {
  HostError,
  assertHostCapabilities,
  gameManifestSchema,
  type GameDefinition,
  type GameHost,
} from '@coffeeeeffoc/game-contract';

import { cultivationContentSchema } from './content/schema.js';
import { CultivationGame } from './view/CultivationGame.js';

const requiredCapabilities = ['content', 'storage'] as const;

/** Deployable metadata for the reference cultivation Game Artifact. */
export const cultivationManifest = gameManifestSchema.parse({
  gameId: 'cultivation',
  version: '1.0.0',
  gameContractVersion: 1,
  contentSchemaVersion: 1,
  capabilities: ['content', 'storage', 'advertising'],
  loadModes: ['in-process'],
  entry: 'index.html',
  integrity: 'builtin:cultivation@1.0.0',
});

async function loadContent(host: GameHost) {
  const envelope = await host.content.load();
  if (envelope.gameId !== cultivationManifest.gameId) {
    throw new HostError({
      code: 'INVALID_INPUT',
      message: 'Dynamic Content belongs to another Game',
    });
  }
  if (envelope.schemaVersion > cultivationManifest.contentSchemaVersion) {
    throw new HostError({
      code: 'CONTENT_INCOMPATIBLE',
      message: 'Dynamic Content schema is too new',
    });
  }
  const result = validateContentEnvelope(cultivationContentSchema, envelope);
  if (!result.success) {
    throw new HostError({ code: 'INVALID_INPUT', message: 'Dynamic Content failed validation' });
  }
  return result.data.payload;
}

/** Framework-neutral entry that mounts the cultivation Game through Game Host capabilities. */
export const cultivationGameDefinition: GameDefinition = {
  manifest: cultivationManifest,
  async mount(target, host) {
    assertHostCapabilities(requiredCapabilities, host.session.capabilities);
    if (host.session.gameId !== cultivationManifest.gameId) {
      throw new HostError({ code: 'INVALID_INPUT', message: 'Game Session identity mismatch' });
    }

    const content = await loadContent(host);
    let active = true;
    let disposed = false;
    const root: Root = createRoot(target);
    const render = () => root.render(createElement(CultivationGame, { host, content, active }));
    render();

    return {
      pause() {
        if (disposed) return;
        active = false;
        render();
      },
      resume() {
        if (disposed) return;
        active = true;
        render();
      },
      async dispose() {
        if (disposed) return;
        disposed = true;
        root.unmount();
        target.replaceChildren();
      },
    };
  },
};
