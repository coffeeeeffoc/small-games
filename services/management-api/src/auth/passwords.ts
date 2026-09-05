import { hash, verify } from '@node-rs/argon2';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { roles, type AuthStore } from './model.js';

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9_.-]+$/);
/** Argon2id parameters meet the OWASP minimum; the library supplies a random salt. */
export function hashPassword(password: string) {
  // The package's default algorithm is Argon2id (its const enum cannot be imported in isolatedModules).
  return hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
}
// Public non-account sentinel, precomputed with the same Argon2id parameters.
const dummyHash =
  '$argon2id$v=19$m=19456,t=2,p=1$LMxj6RReq+vMrOj/UAAGPg$757QmSsdETqr/mTSuk8XoaiMCxKw26O2ZHB1RnFIQ7E';
/** Unknown accounts still perform a real Argon2 comparison to avoid a cheap timing oracle. */
export async function verifyPassword(password: string, encoded?: string) {
  return verify(encoded ?? dummyHash, password);
}

/** Creates the first all-role operator only; repeat calls never reset or promote accounts. */
export async function initializeOperator(store: AuthStore, username: string, password: string) {
  const normalized = usernameSchema.parse(username);
  z.string().min(12).max(128).parse(password);
  return store.initializeAccount({
    id: randomUUID(),
    username: normalized,
    passwordHash: await hashPassword(password),
    roles: [...roles],
  });
}
