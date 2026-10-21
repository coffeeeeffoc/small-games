import { z } from 'zod';
import {
  dynamicContentEnvelopeSchema,
  type ContentValidationResult,
} from '@coffeeeeffoc/content-schema';
import { gameManifestSchema } from '@coffeeeeffoc/game-contract';

export const fixtureEnvelope = {
  gameId: 'fixture-game',
  schemaVersion: 2,
  revision: 0,
  payload: { title: 'Fixture game', count: 1 },
};
export const fixtureManifest = gameManifestSchema.parse({
  gameId: 'fixture-game',
  version: '1.1.0',
  gameContractVersion: 1,
  contentSchemaVersion: 2,
  capabilities: ['content', 'storage'],
  loadModes: ['in-process'],
  entry: 'index.html',
  integrity: 'builtin:fixture-game@1.1.0',
});
const schema = dynamicContentEnvelopeSchema.extend({
  gameId: z.literal('fixture-game'),
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  payload: z.object({
    title: z.string().min(1).default('Fixture game'),
    count: z.number().positive(),
  }),
});
export function validateFixture(
  input: unknown,
): ContentValidationResult<typeof fixtureEnvelope.payload> {
  const result = schema.safeParse(input);
  return result.success
    ? { success: true, data: { ...result.data, schemaVersion: 2 } }
    : {
        success: false,
        issues: result.error.issues.map((issue) => ({
          path: issue.path.filter((part): part is string | number => typeof part !== 'symbol'),
          message: issue.message,
        })),
      };
}
export const fixtureTarget = {
  manifest: fixtureManifest,
  defaultEnvelope: fixtureEnvelope,
  validate: validateFixture,
};

import type { GameDefinition } from '@coffeeeeffoc/game-contract';
import type { StudioContentTarget } from '../src/content-target.js';

/** Minimal disposable view for preview lifecycle tests; no product gameplay. */
export const fixtureDefinition: GameDefinition = {
  manifest: fixtureManifest,
  async mount(target, host) {
    const envelope = await host.content.load();
    const view = document.createElement('section');
    view.className = 'fixture-game';
    const title = document.createElement('h1');
    title.textContent = (envelope.payload as { title: string }).title;
    const start = document.createElement('button');
    start.setAttribute('aria-label', '开始预览');
    start.textContent = '开始预览';
    start.onclick = () => {
      view.dataset.phase = 'started';
    };
    view.append(title, start);
    target.append(view);
    return {
      pause() {},
      resume() {},
      async dispose() {
        view.remove();
      },
    };
  },
};
export const studioFixtureTarget: StudioContentTarget = {
  definition: fixtureDefinition,
  validate: validateFixture,
};
