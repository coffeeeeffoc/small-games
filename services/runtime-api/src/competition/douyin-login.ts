import { z } from 'zod';
import { CompetitionError } from './types.js';

const authenticatedResponse = z.object({
  error: z.literal(0),
  errcode: z.literal(0).optional(),
  openid: z
    .string()
    .min(1)
    .max(256)
    .refine((value) => value.trim() === value),
});

/** Official mini-game code2Session, verified 2026-10-11:
 * https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/server/log-in/code-2-session
 * This protocol uses code/error, unlike the wx js_code/errcode exchange.
 */
export async function exchangeDouyinCode(
  appId: string,
  secret: string,
  code: string,
): Promise<string> {
  const endpoint = new URL('https://minigame.zijieapi.com/mgplatform/api/apps/jscode2session');
  endpoint.search = new URLSearchParams({ appid: appId, secret, code }).toString();
  const response = await fetch(endpoint, {
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(5000),
    redirect: 'error',
  });
  if (!response.ok) throw new CompetitionError('PLATFORM_LOGIN_FAILED', 401);
  const verified = authenticatedResponse.safeParse(await response.json());
  // anonymous_openid does not authenticate a user. Keep session_key, unionid and
  // platform error descriptions server-side; callers receive only a verified subject.
  if (!verified.success) throw new CompetitionError('PLATFORM_LOGIN_FAILED', 401);
  return verified.data.openid;
}
