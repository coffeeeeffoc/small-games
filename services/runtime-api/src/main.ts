import { listenService } from '@coffeeeeffoc/service-kit';
import { createRuntimeService } from './app.js';

await listenService(createRuntimeService(), 53002);
