import { z } from 'zod';
export const shop = [
  'hePower',
  'heVelocity',
  'heavyPower',
  'heavyVelocity',
  'spread',
  'emp',
] as const;
export const passive = [...shop.filter((id) => id !== 'emp'), 'duration'] as const;
const item = z.enum([...shop, 'duration', 'coolant']);
export const nightLoadoutSchema = z
  .array(
    z
      .object({
        id: item,
        tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        trial: z.literal(true).optional(),
      })
      .strict(),
  )
  .max(8)
  .refine(
    (slots) =>
      new Set(slots.map((slot) => slot.id)).size === slots.length &&
      slots.every(
        (slot) =>
          slot.tier <= (slot.id === 'coolant' ? 1 : slot.id === 'duration' ? 2 : 3) &&
          (!slot.trial || shop.includes(slot.id as (typeof shop)[number])),
      ),
  );
export type NightLoadout = z.infer<typeof nightLoadoutSchema>;
const requestId = z.uuid();
export const nightWalletCommand = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('buy'),
      item: z.enum(shop),
      requestId,
      tier: z.number().int().min(1).max(3).optional(),
    })
    .strict(),
  z.object({ kind: z.literal('checkin'), requestId }).strict(),
  z.object({ kind: z.literal('lottery-start'), requestId }).strict(),
  z.object({ kind: z.literal('lottery-claim'), requestId, challenge: z.uuid() }).strict(),
]);
export type Command = z.infer<typeof nightWalletCommand>;
