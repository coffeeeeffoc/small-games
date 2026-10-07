import { HostError, type GameDefinition, type GameManifest } from '@coffeeeeffoc/game-contract';
import type { DynamicContentEnvelope } from '@coffeeeeffoc/content-schema';
import type { CanvasGameTarget } from '@coffeeeeffoc/canvas-game-adapter';
import manifest from './manifest.json';
import { LEVELS } from './content.ts';
import { validateLevel } from './rules.ts';
import { createMossGame } from './controller.ts';

export const mossGardenManifest = manifest as GameManifest;
export const defaultMossGardenEnvelope: DynamicContentEnvelope = {
  gameId: 'moss-garden',
  schemaVersion: 1,
  revision: 1,
  payload: { levels: LEVELS },
};

export function validateMossContent(input: DynamicContentEnvelope) {
  if (
    input.gameId !== 'moss-garden' ||
    input.schemaVersion !== 1 ||
    !Number.isInteger(input.revision)
  )
    throw new HostError({
      code: 'CONTENT_INCOMPATIBLE',
      message: 'Unsupported garden content version',
    });
  const payload = input.payload as { levels?: unknown } | null;
  if (!payload || !Array.isArray(payload.levels) || payload.levels.length !== LEVELS.length)
    throw new HostError({
      code: 'CONTENT_INCOMPATIBLE',
      message: 'Garden level catalog is incomplete',
    });
  payload.levels.forEach((level, index) => {
    validateLevel(level);
    // Version 1 saves use the reviewed static catalog; a changed catalog needs a revision migration.
    if (JSON.stringify(level) !== JSON.stringify(LEVELS[index]))
      throw new HostError({
        code: 'CONTENT_INCOMPATIBLE',
        message: 'Unreviewed garden level revision',
      });
  });
}

export const mossGardenCanvasDefinition: GameDefinition<CanvasGameTarget> = {
  manifest: mossGardenManifest,
  async mount(target, host) {
    if (host.session.gameId !== 'moss-garden')
      throw new HostError({ code: 'INVALID_INPUT', message: 'Garden session identity mismatch' });
    validateMossContent(await host.content.load());
    const sounds = new Map<string, ReturnType<NonNullable<CanvasGameTarget['createSound']>>>();
    if (target.createSound)
      for (const kind of ['place', 'mark', 'win']) {
        try {
          sounds.set(kind, target.createSound(`moss-garden-audio/${kind}.wav`, { volume: 0.4 }));
        } catch {
          /* Optional media. */
        }
      }
    const game = await createMossGame(
      {
        ...target,
        native: true,
        feedback(kind, enabled) {
          if (enabled) sounds.get(kind)?.play();
        },
      },
      host,
    );
    return {
      pause: () => game.pause(),
      resume: () => game.resume(),
      async dispose() {
        await game.dispose();
        sounds.forEach((sound) => sound.dispose());
      },
    };
  },
};
