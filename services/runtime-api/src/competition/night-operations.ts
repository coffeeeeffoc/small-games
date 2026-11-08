import type { NightOperations } from '@coffeeeeffoc/service-kit';
import type { NightAssets } from './night-assets.js';

/** Existing mail is the immutable delivery receipt, including after campaign withdrawal. */
export function deliverNightCompensations(
  wallet: Pick<NightAssets, 'mail'>,
  owner: string,
  createdAt: number,
  at: number,
  operations?: NightOperations,
) {
  let delivered = false;
  for (const campaign of operations?.compensations ?? []) {
    const id = `ops-compensation:${campaign.id}`;
    if (
      !campaign.enabled ||
      at < campaign.startsAt ||
      at >= campaign.endsAt ||
      !Number.isSafeInteger(createdAt) ||
      createdAt > campaign.eligibleCreatedBefore ||
      (campaign.playerIds && !campaign.playerIds.includes(owner)) ||
      wallet.mail.some((m) => m.id === id)
    )
      continue;
    wallet.mail.push({
      id,
      title: campaign.title,
      body: campaign.body,
      createdAt: campaign.startsAt,
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
  return operations.announcements
    .filter((a) => a.enabled && at >= a.startsAt && (a.endsAt === undefined || at < a.endsAt))
    .map((a) => ({ id: a.id, title: a.title, body: a.body, createdAt: a.startsAt }));
}
