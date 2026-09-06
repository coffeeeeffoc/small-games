import { gameManifestSchema } from '@coffeeeeffoc/game-contract';
import manifest from './manifest.json';

export const officeManifest = gameManifestSchema.parse(manifest);
