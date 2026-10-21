import { createH5Publishing } from './publishing.js';
const config = globalThis.SmallGamesPublishingConfig || {};
globalThis.OrbitPublishing = createH5Publishing({
  gameId: 'orbit-atelier',
  title: '星扣工坊',
  adMode: config.adMode || 'off',
  provider: config.provider,
  publicUrl: config.publicUrl,
});
