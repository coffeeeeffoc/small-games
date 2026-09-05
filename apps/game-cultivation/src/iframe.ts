import { startIframeGame } from '@coffeeeeffoc/game-loader';

import { cultivationGameDefinition } from './definition.js';
import styles from './styles.css?inline';

const shellOrigin = import.meta.env.VITE_SHELL_ORIGIN as string | undefined;
if (!shellOrigin) throw new Error('VITE_SHELL_ORIGIN is required for an iframe Game Artifact');

const style = document.createElement('style');
style.textContent = styles;
document.head.append(style);

startIframeGame(cultivationGameDefinition, { shellOrigin });
