import { startIframeGame } from '@coffeeeeffoc/game-loader';

import { cultivationGameDefinition } from './definition.js';

const shellOrigin = import.meta.env.VITE_SHELL_ORIGIN as string | undefined;
if (!shellOrigin) throw new Error('VITE_SHELL_ORIGIN is required for an iframe Game Artifact');

document.body.style.margin = '0';

startIframeGame(cultivationGameDefinition, { shellOrigin });
