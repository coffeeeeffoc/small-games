import { gameManifestSchema } from '@coffeeeeffoc/game-contract';
import manifest from './manifest.json';

export const arenaManifest = gameManifestSchema.parse(manifest);
