import { nineGames, appIdVariable, targetOptions } from './nine-games-targets.mjs';
import { publicReleaseConfiguration } from '../../../platforms/publication-config.mjs';
import { tapTapApiBase } from '@coffeeeeffoc/platform-taptap/login';

// Keep the previously reviewed catalog batch; new featured games do not enter it.
export const tapTapGames = nineGames;
// Explicit standalone targets never expand the reviewed --all catalog batch.
export const tapTapStandaloneGames = Object.freeze([
  Object.freeze({
    id: 'homebound-station',
    directory: 'games/local/homebound-station',
    cocos: true,
    orientation: 'portrait',
    login: 'offline',
    nativeRewards: true,
    nativeBudget: { mainBytes: 4 * 1024 * 1024, totalBytes: 20 * 1024 * 1024 },
  }),
]);
export const tapTapTargets = Object.freeze([...tapTapGames, ...tapTapStandaloneGames]);
export const tapTapCocosGames = Object.freeze(tapTapTargets.filter((game) => game.cocos));
export function tapTapTarget(id) {
  return tapTapTargets.find((game) => game.id === id);
}
export function tapTapOrientation(id) {
  const game = tapTapTarget(id);
  if (!game) throw Error('Unknown TapTap game.');
  return game.orientation || 'landscape';
}
export function tapTapOptions(game, { preview = false, env = process.env } = {}) {
  const selected = tapTapTarget(game);
  if (!selected) throw new Error('Unknown TapTap game.');
  const key = appIdVariable(game, 'taptap');
  const appId = env[key] || '';
  // Tap AppIDs are opaque public identifiers, distinct from developer-center game IDs.
  if (typeof appId !== 'string' || (appId && !/^[A-Za-z0-9_-]{1,100}$/.test(appId)))
    throw new Error(`Invalid public AppID in ${key}`);
  if (!preview && !appId)
    throw new Error(`Release requires ${key}; use --preview for local checks.`);
  // The login service and assets use the existing public HTTPS URL checks.
  if (selected.login === 'offline') {
    const native = publicReleaseConfiguration(game, 'taptap', { env, release: !preview })[game]
      .taptap;
    return {
      game,
      platform: 'taptap',
      appId: native.appId,
      apiUrl: '',
      preview,
      competitionEnabled: false,
      competitionConfigured: false,
      adsEnabled: Boolean(native.adUnitId),
      adUnitId: native.adUnitId,
    };
  }
  const common = targetOptions(game, 'wechat', {
    preview: true,
    env: {
      MINIGAME_COMPETITION_API_URL: env.MINIGAME_COMPETITION_API_URL,
      COMPETITION_SERVICE_ENABLED: env.COMPETITION_SERVICE_ENABLED,
      COMPETITION_PUBLIC_API_URL: env.COMPETITION_PUBLIC_API_URL,
      MINIGAME_TRAVEL_BUND_ASSET_BASE: env.MINIGAME_TRAVEL_BUND_ASSET_BASE,
    },
  });
  if (common.apiUrl) common.apiUrl = tapTapApiBase(common.apiUrl);
  if (!preview && !common.apiUrl)
    throw new Error('Release requires MINIGAME_COMPETITION_API_URL for the TapTap login service.');
  if (!preview && game === 'travel-bund' && !env.MINIGAME_TRAVEL_BUND_ASSET_BASE)
    throw new Error(
      'Release requires MINIGAME_TRAVEL_BUND_ASSET_BASE and TapTap request-domain configuration.',
    );
  return {
    ...common,
    platform: 'taptap',
    appId,
    preview,
    competitionConfigured: Boolean(
      appId && common.apiUrl && !['travel-bund', 'wulong-city'].includes(game),
    ),
  };
}

/** Local tool paths never enter the runtime config or client bundle. */
export function tapTapToolOptions(game, env = process.env) {
  const prefix = `MINIGAME_${game}_TAPTAP`.toUpperCase().replaceAll('-', '_');
  return {
    packageFile: env[`${prefix}_PACKAGE_FILE`] || '',
    officialToolPath: env.TAPTAP_PACK_TOOL || '',
    receiptFile: env[`${prefix}_PACKAGE_RECEIPT`] || '',
  };
}
