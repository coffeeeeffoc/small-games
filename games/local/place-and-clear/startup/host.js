import { createH5Publishing } from './publishing.js';
globalThis.PlaceAndClearPublishing = createH5Publishing({
  gameId: 'place-and-clear',
  title: '摆消乐',
  adMode: 'off',
  publicUrl: globalThis.SmallGamesPublishingConfig?.publicUrl,
});
