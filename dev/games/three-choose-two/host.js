import { createH5Publishing } from './publishing.js';
globalThis.ThreeChooseTwoPublishing = createH5Publishing({
  gameId: 'three-choose-two',
  title: '三块选两块',
  adMode: 'off',
  publicUrl: globalThis.SmallGamesPublishingConfig?.publicUrl,
});
