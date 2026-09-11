import { z } from 'zod';

/** Tunable trial rules; limits protect timers, movement and resource arithmetic. */
export const trialBalanceSchema = z.object({
  preparationSeconds: z.number().min(30).max(300),
  tribulationSeconds: z.number().min(20).max(180),
  health: z.number().min(40).max(300),
  startingQi: z.number().min(0).max(100),
  moveSpeed: z.number().min(80).max(260),
  quickDamage: z.number().min(5).max(40),
  chargedDamage: z.number().min(20).max(90),
  enemyDamage: z.number().min(3).max(50),
  lightningDamage: z.number().min(5).max(60),
  eyeHealth: z.number().min(40).max(200),
  breathGain: z.number().min(5).max(60),
  breathLimit: z.number().min(1).max(5),
});
export type TrialBalance = z.infer<typeof trialBalanceSchema>;
export const defaultTrialBalance: TrialBalance = {
  preparationSeconds: 120,
  tribulationSeconds: 60,
  health: 100,
  startingQi: 35,
  moveSpeed: 150,
  quickDamage: 16,
  chargedDamage: 46,
  enemyDamage: 13,
  lightningDamage: 22,
  eyeHealth: 90,
  breathGain: 24,
  breathLimit: 2.4,
};
/** v3 replaces event choices with Game-owned real-time trial settings. */
export const cultivationContentSchema = z.object({
  title: z.string().min(1).max(80),
  balance: trialBalanceSchema,
});
export type CultivationContent = z.infer<typeof cultivationContentSchema>;
