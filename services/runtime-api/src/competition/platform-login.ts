import { z } from 'zod';
import { CONTROL_GAME_IDS } from '@coffeeeeffoc/service-kit';
import { CompetitionError } from './types.js';
import { exchangeDouyinCode } from './douyin-login.js';

export const platformSchema = z.enum(['wechat', 'bilibili', 'douyin', 'kuaishou', 'taptap']);
export const platformLoginSchema = z
  .object({
    platform: platformSchema,
    game: z.enum(CONTROL_GAME_IDS),
    appId: z.string().min(1).max(100),
    code: z.string().min(1).max(512),
  })
  .strict();
export const platformConfigSchema = z.array(
  z.object({
    platform: platformSchema,
    appId: z.string().min(1),
    secret: z.string().min(16),
    games: z.array(z.enum(CONTROL_GAME_IDS)).min(1).optional(),
  }),
);

/** Only a successful server-side exchange can supply the scoped platform subject. */
export async function verifiedPlatformSubject(
  platforms: z.infer<typeof platformConfigSchema>,
  input: z.infer<typeof platformLoginSchema>,
) {
  const configured = platforms.find(
    (p) => p.platform === input.platform && p.appId === input.appId,
  );
  if (!configured) throw new CompetitionError('PLATFORM_NOT_CONFIGURED', 503);
  if (!configured.games?.includes(input.game))
    throw new CompetitionError('IDENTITY_SCOPE_MISMATCH', 403);
  if (input.platform === 'kuaishou') throw new CompetitionError('PLATFORM_LOGIN_UNAVAILABLE', 503);
  if (input.platform === 'douyin')
    return exchangeDouyinCode(input.appId, configured.secret, input.code);
  const endpoints = {
    wechat: 'https://api.weixin.qq.com/sns/jscode2session',
    bilibili: 'https://miniapp.bilibili.com/api/sns/jscode2session',
    // MiniApp ID + mini-game secret, never TapSDK OAuth Client ID.
    taptap: 'https://cloud-miniapp.tapapis.cn/auth/v1/jscode2session',
  };
  const endpoint = new URL(endpoints[input.platform]);
  endpoint.search = new URLSearchParams({
    appid: input.appId,
    secret: configured.secret,
    js_code: input.code,
    grant_type: 'authorization_code',
  }).toString();
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(5000), redirect: 'error' });
  if (!response.ok) throw new CompetitionError('PLATFORM_LOGIN_FAILED', 401);
  const data = (await response.json()) as { openid?: unknown; errcode?: unknown } | null;
  if (
    !data ||
    data.errcode ||
    typeof data.openid !== 'string' ||
    !data.openid.trim() ||
    data.openid.length > 512
  )
    throw new CompetitionError('PLATFORM_LOGIN_FAILED', 401);
  // session_key/unionid stay private; neither client-submitted IDs nor alternate fields authenticate.
  return data.openid;
}
