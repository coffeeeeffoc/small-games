import { z } from 'zod';

export const chatSequence = z
  .string()
  .regex(/^[1-9][0-9]{0,18}$/)
  .refine((value) => BigInt(value) <= 9223372036854775807n);
const text = z
  .string()
  .max(1000)
  .transform((value) => value.normalize('NFC').trim())
  .refine((value) => Array.from(value).length <= 120 && !/[\p{Cc}\p{Cf}]/u.test(value));
export const chatSendSchema = z
  .object({
    requestId: z.uuid(),
    text,
    recipientId: z.uuid().optional(),
    roomCode: z
      .string()
      .regex(/^(?:[0-9]{6}|[A-F0-9]{12})$/)
      .optional(),
  })
  .strict()
  .refine((value) => !!value.text || !!value.roomCode);
export const chatReportSchema = z
  .object({ id: chatSequence, reason: z.string().trim().min(1).max(120) })
  .strict();
export const chatModerateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('remove'), id: chatSequence }).strict(),
  z
    .object({
      kind: z.literal('mute'),
      playerId: z.uuid(),
      minutes: z.number().int().min(0).max(43200),
    })
    .strict(),
]);
