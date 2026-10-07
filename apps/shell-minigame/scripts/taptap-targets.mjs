import { nineGames, appIdVariable, targetOptions } from './nine-games-targets.mjs';
import { tapTapApiBase } from '../../../platforms/taptap/login.cjs';

// Keep the previously reviewed catalog batch; new featured games do not enter it.
export const tapTapGames = nineGames;
export function tapTapOptions(game, { preview = false, env = process.env } = {}) {
  if (!tapTapGames.some((item) => item.id === game)) throw new Error('Unknown frozen TapTap game.');
  const key = appIdVariable(game, 'taptap');
  const appId = env[key] || '';
  // Tap AppIDs are opaque public identifiers, distinct from developer-center game IDs.
  if (typeof appId !== 'string' || (appId && !/^[A-Za-z0-9_-]{1,100}$/.test(appId)))
    throw new Error(`Invalid public AppID in ${key}`);
  if (!preview && !appId)
    throw new Error(`Release requires ${key}; use --preview for local checks.`);
  // The login service and assets use the existing public HTTPS URL checks.
  const common = targetOptions(game, 'wechat', {
    preview: true,
    env: {
      MINIGAME_COMPETITION_API_URL: env.MINIGAME_COMPETITION_API_URL,
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
