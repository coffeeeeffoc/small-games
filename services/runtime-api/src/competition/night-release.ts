import {
  nightReleaseSchema,
  type NightReleaseConfig,
  type NightOperations,
} from '@coffeeeeffoc/service-kit';
export {
  gameBuildId,
  nightReleaseSchema,
  type NightReleaseConfig,
} from '@coffeeeeffoc/service-kit';
import { CompetitionError, type Rule } from './types.js';
import type { RankedRule } from './ranked-types.js';

export function readNightReleaseConfig(env: Record<string, string | undefined>) {
  if (env.NIGHT_RELEASE_CONFIG === undefined || env.NIGHT_RELEASE_CONFIG === '') return undefined;
  try {
    if (Buffer.byteLength(env.NIGHT_RELEASE_CONFIG) > 65536) throw Error();
    return nightReleaseSchema.parse(JSON.parse(env.NIGHT_RELEASE_CONFIG));
  } catch {
    throw Error('Invalid runtime configuration: NIGHT_RELEASE_CONFIG');
  }
}

/** Registrations are code-owned; configuration can select IDs, never import paths. */
export function createNightRelease(
  rankedRules: RankedRule[],
  multiplayerRules: Rule[],
  input?: NightReleaseConfig,
  validateLoadedRules = true,
) {
  const ranked = new Map(rankedRules.map((r) => [r.version, r]));
  const multiplayer = new Map(multiplayerRules.map((r) => [r.version, r]));
  const config = input ? nightReleaseSchema.parse(input) : undefined;
  if (config && validateLoadedRules) {
    for (const pair of [...config.builds, config.legacy])
      for (const kind of ['ranked', 'multiplayer'] as const)
        if (
          !(kind === 'ranked' ? ranked : multiplayer).has(pair[kind]) &&
          !config.retiredRules?.[kind].includes(pair[kind])
        )
          throw Error('Unregistered Night release rules');
    for (const kind of ['ranked', 'multiplayer'] as const) {
      if (
        config.allowNew[kind].some(
          (v) =>
            !(kind === 'ranked' ? ranked : multiplayer).has(v) ||
            config.retiredRules?.[kind].includes(v),
        )
      )
        throw Error('Unregistered Night admission rules');
      for (const target of config.channels.filter((c) => c.latestBuildId)) {
        const build = config.builds.find((b) => b.buildId === target.latestBuildId)!;
        if (
          !(kind === 'ranked' ? ranked : multiplayer).has(build[kind]) ||
          config.retiredRules?.[kind].includes(build[kind])
        )
          throw Error('Retired Night update target');
      }
    }
  }
  const client = (
    buildId?: string,
  ):
    | {
        ranked: string | null;
        multiplayer: string | null;
        channel?: string;
        version?: string;
        backendVersion?: string;
        disabled?: boolean;
        removed?: true;
      }
    | undefined =>
    config
      ? buildId
        ? config.builds.find((b) => b.buildId === buildId)
        : config.legacy
      : {
          ranked: rankedRules[0]?.version ?? null,
          multiplayer: multiplayerRules[0]?.version ?? null,
        };
  const canStart = (kind: 'ranked' | 'multiplayer', rule: string) =>
    (kind === 'ranked' ? ranked : multiplayer).has(rule) &&
    (!config ||
      (config.allowNew[kind].includes(rule) && !config.retiredRules?.[kind].includes(rule)));
  const clientDisabled = (buildId?: string) => {
    const selected = client(buildId);
    return (
      !!selected &&
      (selected.removed === true ||
        ('disabled' in selected && selected.disabled === true) ||
        ('backendVersion' in selected &&
          !!selected.backendVersion &&
          !!config?.disabledBackendVersions?.includes(selected.backendVersion)))
    );
  };
  const canStartClient = (kind: 'ranked' | 'multiplayer', rule: string, buildId?: string) =>
    (!config || client(buildId)?.[kind] === rule) &&
    !clientDisabled(buildId) &&
    canStart(kind, rule);
  return {
    ranked,
    multiplayer,
    config,
    client,
    canStart,
    canStartClient,
    assertStart(kind: 'ranked' | 'multiplayer', rule: string, buildId?: string) {
      const selected = client(buildId);
      if (selected?.removed) throw new CompetitionError('BUILD_REMOVED');
      if (selected && 'disabled' in selected && selected.disabled)
        throw new CompetitionError('BUILD_DISABLED');
      if (
        selected &&
        'backendVersion' in selected &&
        selected.backendVersion &&
        config?.disabledBackendVersions?.includes(selected.backendVersion)
      )
        throw new CompetitionError('BACKEND_VERSION_DISABLED');
      if (config && client(buildId)?.[kind] !== rule)
        throw new CompetitionError('RULE_VERSION_CHANGED');
      if (!canStart(kind, rule)) throw new CompetitionError('RULE_NEW_GAMES_DISABLED');
    },
    metadata(buildId?: string) {
      const selected = client(buildId);
      const target =
        config && selected && 'channel' in selected
          ? (config.channels.find((c) => c.channel === selected.channel)?.latestBuildId ?? null)
          : null;
      const disabled = clientDisabled(buildId);
      const admissions = {
        ranked: !disabled && !!selected?.ranked && canStart('ranked', selected.ranked),
        multiplayer:
          !disabled && !!selected?.multiplayer && canStart('multiplayer', selected.multiplayer),
      };
      const canStartNewGames = admissions.ranked && admissions.multiplayer;
      return {
        release: {
          currentBuildId: buildId ?? null,
          currentVersion: selected && 'version' in selected ? (selected.version ?? null) : null,
          backendVersion:
            selected && 'backendVersion' in selected ? (selected.backendVersion ?? null) : null,
          latestBuildId: target,
          latestVersion: config?.builds.find((b) => b.buildId === target)?.version ?? null,
          update:
            target && target !== buildId ? (canStartNewGames ? 'optional' : 'required') : 'none',
          canStartNewGames,
          admissions,
          action: 'reopen',
        },
        supportedRules: { ranked: [...ranked.keys()], multiplayer: [...multiplayer.keys()] },
        clientRules: {
          ranked: selected?.ranked ?? null,
          multiplayer: selected?.multiplayer ?? null,
        },
      };
    },
  };
}
export type NightRelease = ReturnType<typeof createNightRelease>;

export function retainedRule<T extends Rule | RankedRule>(
  rules: Map<string, T>,
  game: string,
  version?: string,
  retained?: Map<string, T>,
): T | undefined {
  const current = rules.get(game);
  if (version === undefined) return current;
  return (
    (game === 'night-overwatch' ? retained?.get(version) : undefined) ??
    (current?.version === version ? current : undefined)
  );
}

export async function loadNightRelease(
  ranked: RankedRule,
  multiplayer: Rule,
  env: Record<string, string | undefined>,
) {
  const soloUrl = new URL('../../rules/frozen/night-v16-v9/night-ranked.mjs', import.meta.url).href;
  const duelUrl = new URL('../../rules/frozen/night-v16-v9/night.mjs', import.meta.url).href;
  const solo = (await import(soloUrl)) as { default: RankedRule };
  const duel = (await import(duelUrl)) as { default: Rule };
  const previousSoloUrl = new URL(
    '../../rules/frozen/night-v17-v10/night-ranked.mjs',
    import.meta.url,
  ).href;
  const previousDuelUrl = new URL('../../rules/frozen/night-v17-v10/night.mjs', import.meta.url)
    .href;
  const previousSolo = (await import(previousSoloUrl)) as { default: RankedRule };
  const previousDuel = (await import(previousDuelUrl)) as { default: Rule };
  return createNightRelease(
    [ranked, previousSolo.default, solo.default],
    [multiplayer, previousDuel.default, duel.default],
    readNightReleaseConfig(env),
  );
}

/** Resolve only from the caller's locked snapshot; never mutate the process-wide registry. */
export function publishedNightRelease(
  release: NightRelease | undefined,
  operations?: NightOperations,
): NightRelease | undefined {
  if (!operations?.release) return release;
  if (!release) throw new CompetitionError('NIGHT_RELEASE_UNAVAILABLE', 503);
  try {
    return createNightRelease(
      [...release.ranked.values()],
      [...release.multiplayer.values()],
      operations.release,
      // A rolling publication may contain a future build; reject that build, not retained rooms.
      false,
    );
  } catch {
    throw new CompetitionError('NIGHT_RELEASE_UNAVAILABLE', 503);
  }
}
