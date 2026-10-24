import { fileURLToPath } from 'node:url';
// Build directly from the existing shared sources, even before workspace dist packages exist.
export const alias = Object.fromEntries(
  ['game-host', 'game-contract', 'content-schema', 'canvas-game-adapter'].map((name) => [
    '@coffeeeeffoc/' + name,
    fileURLToPath(new URL(`../../../../packages/${name}/src/index.ts`, import.meta.url)),
  ]),
);
