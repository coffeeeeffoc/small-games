import { listenService } from '@coffeeeeffoc/service-kit';
import { createManagementService } from './app.js';

await listenService(createManagementService(), 53001);
