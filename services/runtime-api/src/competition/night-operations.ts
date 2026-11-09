import { NIGHT_LOGIN_RETENTION_MS, type NightOperations } from '@coffeeeeffoc/service-kit';
import type { NightAssets } from './night-assets.js';

const DAY_MS = 86400000;
/** Daily first/last visit (UTC+8 day key), pruned to the published login-range retention. */
export function recordNightVisit(
  wallet: Pick<NightAssets, 'visits'>,
  at: number,
  day = new Date(at + 8 * 3600000).toISOString().slice(0, 10),
) {
  const visits = (wallet.visits ??= {});
  const span = visits[day];
  if (span) {
    span[0] = Math.min(span[0], at);
    span[1] = Math.max(span[1], at);
  } else visits[day] = [at, at];
  const oldest = new Date(at - NIGHT_LOGIN_RETENTION_MS - DAY_MS).toISOString().slice(0, 10);
  for (const key of Object.keys(visits)) if (key < oldest) delete visits[key];
}

/** Existing mail is the immutable delivery receipt; a published compensation is never withdrawn. */
export function deliverNightCompensations(
  wallet: Pick<NightAssets, 'mail' | 'visits'>,
  owner: string,
  at: number,
  operations?: NightOperations,
) {
  let delivered = false;
  // ponytail: day-granular first/last stamps; a visit gap inside one day still counts as present.
  const seen = (from: number, to: number) =>
    Object.values(wallet.visits ?? {}).some(([first, last]) => first <= to && last >= from);
  for (const campaign of operations?.compensations ?? []) {
    const id = `ops-compensation:${campaign.id}`;
    if (
      (campaign.playerIds && !campaign.playerIds.includes(owner)) ||
      wallet.mail.some((m) => m.id === id) ||
      !seen(campaign.loginFrom, campaign.loginTo)
    )
      continue;
    wallet.mail.push({
      id,
      title: campaign.title,
      body: campaign.body,
      createdAt: at,
      read: false,
      claimed: false,
      reward: { ...campaign.reward },
    });
    delivered = true;
  }
  return delivered;
}

export function nightAnnouncements(at: number, operations?: NightOperations) {
  if (!operations)
    return [
      {
        id: 'growth-v1',
        title: '成长与军需上线',
        body: '积分保持原规则。金币、经验独立记录；单人和双人分别配装。技能按冷却重复使用。',
        createdAt: Date.parse('2026-11-01T00:00:00+08:00'),
      },
    ];
  // Publication forbids overlapping enabled windows; still expose at most the newest one.
  const live = operations.announcements
    .filter((a) => a.enabled && at >= a.startsAt && (a.endsAt === undefined || at < a.endsAt))
    .sort((a, b) => b.startsAt - a.startsAt)[0];
  return live
    ? [{ id: live.id, title: live.title, body: live.body, createdAt: live.startsAt }]
    : [];
}
