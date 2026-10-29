// Verified through TapTap check_ads_status on 2026-10-21; see taptap-rewarded-ads.md.
// These are H5 slots. Never use them as native TapADN positions.
export default {
  version: 2,
  games: [
    'carding-car',
    'vibeJam-myself-history-guess',
    'wulong-city',
    'night-overwatch',
    'letters-words2',
  ],
  targets: [
    {
      platform: 'taptap',
      type: 'h5',
      tapIdentityAppIds: { 'night-overwatch': 'tapmcjgwi2thafs87k' },
      adUnits: {
        'carding-car': '1054323',
        'vibeJam-myself-history-guess': '1054324',
        'wulong-city': '1054323',
        'night-overwatch': '1054323',
        'letters-words2': '1054324',
      },
    },
  ],
  ads: [true],
  backend: [true],
  apiUrl: 'https://api.nenggongzhiren.cn/small-games/v1',
};
