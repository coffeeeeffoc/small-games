import { gameManifestSchema } from '@coffeeeeffoc/game-contract';
import manifest from './manifest.json';

/** Shared release identity for the Web and reviewed Canvas entries. */
export const cricketManifest = gameManifestSchema.parse(manifest);
