// pnpm build:taptap:h5
// Each selected game gets its own ZIP. No ID is shared between games.
export default {
  version: 2,
  games: [
    'carding-car',
    'vibeJam-myself-history-guess',
    'wulong-city',
    'night-overwatch',
    'travel-bund',
    'letters-words2',
  ],
  targets: [
    {
      platform: 'taptap',
      type: 'h5',
      // Change to [true] to enable configured rewards, or [false, true] for both variants.
      // An empty ID keeps that game's reward entries hidden even when ads is true.
      adUnits: {
        'carding-car': '',
        'vibeJam-myself-history-guess': '',
        'wulong-city': '',
        'night-overwatch': '',
        'travel-bund': '',
        'letters-words2': '',
      },
    },
  ],
  ads: [false],
  backend: [false],
};
