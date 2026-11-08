import { z } from 'zod';
import { CompetitionError, type Rule } from './types.js';
import type { RankedRule } from './ranked-types.js';

export const gameBuildId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const version = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/);
const channel = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);
const rulePair = { ranked: version, multiplayer: version };
export const nightReleaseSchema = z
  .object({
    schemaVersion: z.literal(1),
    builds: z
      .array(z.object({ buildId: gameBuildId, channel, ...rulePair }).strict())
      .min(1)
      .max(256),
    channels: z
      .array(z.object({ channel, latestBuildId: gameBuildId.nullable() }).strict())
      .min(1)
      .max(32),
    allowNew: z
      .object({ ranked: z.array(version).max(16), multiplayer: z.array(version).max(16) })
      .strict(),
    legacy: z.object({ channel, ...rulePair }).strict(),
    retiredRules: z
      .object({ ranked: z.array(version).max(32), multiplayer: z.array(version).max(32) })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((config, ctx) => {
    const invalid = () =>
      ctx.addIssue({ code: 'custom', message: 'Invalid Night release references' });
    for (const values of [
      config.builds.map((b) => b.buildId),
      config.channels.map((c) => c.channel),
      config.allowNew.ranked,
      config.allowNew.multiplayer,
    ])
      if (new Set(values).size !== values.length) invalid();
    for (const build of [...config.builds, config.legacy])
      if (!config.channels.some((c) => c.channel === build.channel)) invalid();
    for (const target of config.channels)
      if (
        target.latestBuildId !== null &&
        !config.builds.some(
          (b) => b.buildId === target.latestBuildId && b.channel === target.channel,
        )
      )
        invalid();
  });
export type NightReleaseConfig = z.infer<typeof nightReleaseSchema>;
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
) {
  const ranked = new Map(rankedRules.map((r) => [r.version, r]));
  const multiplayer = new Map(multiplayerRules.map((r) => [r.version, r]));
  const config = input ? nightReleaseSchema.parse(input) : undefined;
  if (config) {
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
  const client = (buildId?: string) =>
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
  return {
    ranked,
    multiplayer,
    client,
    canStart,
    assertStart(kind: 'ranked' | 'multiplayer', rule: string, buildId?: string) {
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
      const admissions = {
        ranked: !!selected?.ranked && canStart('ranked', selected.ranked),
        multiplayer: !!selected?.multiplayer && canStart('multiplayer', selected.multiplayer),
      };
      const canStartNewGames = admissions.ranked && admissions.multiplayer;
      return {
        release: {
          currentBuildId: buildId ?? null,
          latestBuildId: target,
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
  return createNightRelease(
    [ranked, solo.default],
    [multiplayer, duel.default],
    readNightReleaseConfig(env),
  );
}
