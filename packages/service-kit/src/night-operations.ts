import { z } from 'zod';

export const gameBuildId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const version = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/);
export const nightChannelSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);
const channel = nightChannelSchema;
const rulePair = { ranked: version, multiplayer: version };
export const nightReleaseSchema = z
  .object({
    schemaVersion: z.literal(1),
    builds: z
      .array(
        z
          .object({
            buildId: gameBuildId,
            channel,
            ...rulePair,
            version: version.optional(),
            backendVersion: version.optional(),
            disabled: z.boolean().optional(),
            removed: z.literal(true).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(256),
    channels: z
      .array(z.object({ channel, latestBuildId: gameBuildId.nullable() }).strict())
      .min(1)
      .max(32),
    allowNew: z
      .object({ ranked: z.array(version).max(16), multiplayer: z.array(version).max(16) })
      .strict(),
    legacy: z.object({ channel, ...rulePair, backendVersion: version.optional() }).strict(),
    disabledBackendVersions: z
      .array(version)
      .max(256)
      .refine((v) => new Set(v).size === v.length)
      .optional(),
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
      config.retiredRules?.ranked ?? [],
      config.retiredRules?.multiplayer ?? [],
    ])
      if (new Set(values).size !== values.length) invalid();
    for (const build of [...config.builds, config.legacy])
      if (!config.channels.some((c) => c.channel === build.channel)) invalid();
    for (const target of config.channels)
      if (
        target.latestBuildId !== null &&
        !config.builds.some(
          (b) => b.buildId === target.latestBuildId && b.channel === target.channel && !b.removed,
        )
      )
        invalid();
    for (const kind of ['ranked', 'multiplayer'] as const) {
      if (config.allowNew[kind].some((v) => config.retiredRules?.[kind].includes(v)))
        ctx.addIssue({ code: 'custom', message: 'Retired Night admission rules' });
      if (
        config.channels.some((c) => {
          const build = config.builds.find((b) => b.buildId === c.latestBuildId);
          return build && config.retiredRules?.[kind].includes(build[kind]);
        })
      )
        ctx.addIssue({ code: 'custom', message: 'Retired Night update target' });
    }
  });
export type NightReleaseConfig = z.infer<typeof nightReleaseSchema>;

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,47}$/);
const timestamp = z.number().int().min(0).max(8640000000000000);
const text = {
  id,
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(300),
};
/** Runtime keeps daily first/last visit stamps this long; older login ranges cannot be verified. */
export const NIGHT_LOGIN_RETENTION_MS = 120 * 86400000;
const announcementEnd = (a: { startsAt: number; endsAt?: number }) => a.endsAt ?? Infinity;
export const nightAnnouncementSchema = z
  .object({ ...text, enabled: z.boolean(), startsAt: timestamp, endsAt: timestamp.optional() })
  .strict()
  .refine((v) => v.endsAt === undefined || v.endsAt > v.startsAt, 'Invalid announcement window');
/** Delivered once to every player seen during [loginFrom, loginTo]; published entries never change. */
export const nightCompensationSchema = z
  .object({
    ...text,
    loginFrom: timestamp,
    loginTo: timestamp,
    playerIds: z
      .array(z.uuid().transform((value) => value.toLowerCase()))
      .min(1)
      .max(1000)
      .refine((v) => new Set(v).size === v.length)
      .optional(),
    reward: z
      .object({
        coins: z.number().int().min(0).max(1000000),
        xp: z.number().int().min(0).max(1000000),
        packs: z.number().int().min(0).max(1000),
      })
      .strict()
      .refine((v) => v.coins + v.xp + v.packs > 0, 'Empty compensation'),
  })
  .strict()
  .refine((v) => v.loginTo > v.loginFrom, 'Invalid compensation login range');
export const nightOperationsSchema = z
  .object({
    announcements: z.array(nightAnnouncementSchema).max(50),
    compensations: z.array(nightCompensationSchema).max(200),
    release: nightReleaseSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const entries of [value.announcements, value.compensations])
      if (new Set(entries.map((e) => e.id)).size !== entries.length)
        ctx.addIssue({ code: 'custom', message: 'Duplicate Night operation ID' });
    // Players see at most one announcement: enabled windows may never overlap.
    const live = value.announcements
      .filter((a) => a.enabled)
      .sort((a, b) => a.startsAt - b.startsAt);
    for (let i = 1; i < live.length; i++)
      if (announcementEnd(live[i - 1]!) > live[i]!.startsAt)
        ctx.addIssue({ code: 'custom', message: 'Overlapping Night announcements' });
  });
export type NightAnnouncement = z.infer<typeof nightAnnouncementSchema>;
export type NightCompensation = z.infer<typeof nightCompensationSchema>;
export type NightOperations = z.infer<typeof nightOperationsSchema>;

export function normalizeNightOperations(input: NightOperations): NightOperations {
  const value = nightOperationsSchema.parse(input);
  const byId = <T extends { id: string }>(entries: T[]) =>
    entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  value.announcements = byId(value.announcements);
  value.compensations = byId(value.compensations).map((c) => ({
    ...c,
    ...(c.playerIds ? { playerIds: [...c.playerIds].sort() } : {}),
  }));
  if (value.release) {
    value.release.disabledBackendVersions?.sort();
    value.release.builds.sort((a, b) =>
      a.buildId < b.buildId ? -1 : a.buildId > b.buildId ? 1 : 0,
    );
    value.release.channels.sort((a, b) =>
      a.channel < b.channel ? -1 : a.channel > b.channel ? 1 : 0,
    );
    for (const kind of ['ranked', 'multiplayer'] as const) {
      value.release.allowNew[kind].sort();
      value.release.retiredRules?.[kind].sort();
    }
  }
  return value;
}
