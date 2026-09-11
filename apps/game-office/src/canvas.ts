import {
  assertHostCapabilities,
  HostError,
  type GameDefinition,
} from '@coffeeeeffoc/game-contract';
import { validateContentEnvelope } from '@coffeeeeffoc/content-schema';
import type { CanvasGameTarget } from '@coffeeeeffoc/canvas-game-adapter';
import { officeManifest } from './manifest.js';
import { officeContentSchema } from './content/schema.js';
import { mountOfficeScene } from './first-person/runtime.js';

export { officeManifest } from './manifest.js';
export { defaultOfficeEnvelope } from './content/data.js';

export const officeCanvasDefinition: GameDefinition<CanvasGameTarget> = {
  manifest: { ...officeManifest, entry: 'office/game.js', loadModes: ['bilibili-subpackage'] },
  async mount(target, host) {
    assertHostCapabilities(['content', 'storage'], host.session.capabilities);
    if (host.session.gameId !== 'office')
      throw new HostError({ code: 'INVALID_INPUT', message: 'Game Session identity mismatch' });
    const envelope = await host.content.load();
    if (envelope.gameId !== 'office')
      throw new HostError({
        code: 'INVALID_INPUT',
        message: 'Dynamic Content belongs to another Game',
      });
    if (envelope.schemaVersion !== officeManifest.contentSchemaVersion)
      throw new HostError({
        code: 'CONTENT_INCOMPATIBLE',
        message: 'Unsupported office content schema',
      });
    const content = validateContentEnvelope(officeContentSchema, envelope);
    if (!content.success)
      throw new HostError({ code: 'INVALID_INPUT', message: 'Invalid office content' });
    return mountOfficeScene(target, host, undefined, content.data.payload.seed);
  },
};
