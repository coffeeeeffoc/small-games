import type { ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import type { ZodType } from 'zod';

import { validateContentEnvelope } from '@coffeeeeffoc/content-schema';
import {
  HostError,
  assertHostCapabilities,
  type GameDefinition,
  type GameHost,
  type GameManifest,
  type HostCapability,
} from '@coffeeeeffoc/game-contract';

/** Inputs needed to adapt one React view to the framework-neutral Game Contract. */
export type ReactGameDefinitionOptions<TContent> = Readonly<{
  manifest: GameManifest;
  requiredCapabilities: readonly HostCapability[];
  contentSchema: ZodType<TContent>;
  render: (host: GameHost, content: TContent, active: boolean) => ReactNode;
}>;

/** Creates a validated, repeatably mountable React-backed Game Definition. */
export function createReactGameDefinition<TContent>(
  options: ReactGameDefinitionOptions<TContent>,
): GameDefinition {
  return {
    manifest: options.manifest,
    async mount(target, host) {
      assertHostCapabilities(options.requiredCapabilities, host.session.capabilities);
      if (host.session.gameId !== options.manifest.gameId) {
        throw new HostError({ code: 'INVALID_INPUT', message: 'Game Session identity mismatch' });
      }
      const envelope = await host.content.load();
      if (envelope.gameId !== options.manifest.gameId) {
        throw new HostError({
          code: 'INVALID_INPUT',
          message: 'Dynamic Content belongs to another Game',
        });
      }
      if (envelope.schemaVersion > options.manifest.contentSchemaVersion) {
        throw new HostError({
          code: 'CONTENT_INCOMPATIBLE',
          message: 'Dynamic Content schema is too new',
        });
      }
      const result = validateContentEnvelope(options.contentSchema, envelope);
      if (!result.success) {
        throw new HostError({
          code: 'INVALID_INPUT',
          message: 'Dynamic Content failed validation',
        });
      }
      let active = true;
      let disposed = false;
      const root: Root = createRoot(target);
      const render = () =>
        flushSync(() => root.render(options.render(host, result.data.payload, active)));
      render();
      return {
        pause() {
          if (!disposed) {
            active = false;
            render();
          }
        },
        resume() {
          if (!disposed) {
            active = true;
            render();
          }
        },
        async dispose() {
          if (!disposed) {
            disposed = true;
            root.unmount();
            target.replaceChildren();
          }
        },
      };
    },
  };
}
