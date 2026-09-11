import {
  HostError,
  assertHostCapabilities,
  type GameDefinition,
} from '@coffeeeeffoc/game-contract';
import { normalizeCultivationContent } from '../content/migration.js';
import { cultivationManifest } from '../manifest.js';
import { createCultivationSurface, type CultivationCanvasTarget } from './surface.js';
export type { CultivationCanvasTarget } from './surface.js';
export { defaultCultivationEnvelope } from '../content/data.js';
/** Reviewed native entry runs the same continuous controls and rules as Web. */
export const cultivationCanvasDefinition: GameDefinition<CultivationCanvasTarget> = {
  manifest: {
    ...cultivationManifest,
    entry: 'cultivation/game.js',
    loadModes: ['bilibili-subpackage'],
  },
  async mount(target, host) {
    assertHostCapabilities(['content', 'storage'], host.session.capabilities);
    if (
      host.session.gameId !== cultivationManifest.gameId ||
      host.session.gameVersion !== cultivationManifest.version
    )
      throw new HostError({ code: 'INVALID_INPUT', message: 'Game Session identity mismatch' });
    const content = normalizeCultivationContent(await host.content.load());
    if (!content.success)
      throw new HostError({ code: 'CONTENT_INCOMPATIBLE', message: 'Invalid cultivation content' });
    return createCultivationSurface(target, content.data.payload, host);
  },
};
