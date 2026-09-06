import { z } from 'zod';

/** Shared Studio boundary for saved Managed Ad draft responses. */
export const adDraftSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  revision: z.number().int().nonnegative(),
  envelope: z.unknown(),
});
/** Last-read Managed Ad draft revision and envelope, preserved until a save is acknowledged. */
export type AdDraft = z.infer<typeof adDraftSchema>;
/** A field path and validation message suitable for accessible editor feedback. */
export type AdFieldIssue = { path: (string | number)[]; message: string };
/** Recoverable operation failure; never clears the editor's local buffer. */
export class AdDraftError extends Error {
  constructor(
    message: string,
    readonly issues: AdFieldIssue[] = [],
  ) {
    super(message);
  }
}

/** Same-origin cookies only; errors preserve the editor's local buffer. */
export function createAdDraftClient(transport: typeof fetch = fetch) {
  async function request(path: string, method = 'GET', body?: unknown): Promise<unknown> {
    const response = await transport(`/api/ad-drafts${path}`, {
      method,
      credentials: 'same-origin',
      ...(body === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    const data: unknown = await response.json();
    if (!response.ok) {
      const details = z
        .object({
          issues: z.array(
            z.object({ path: z.array(z.union([z.string(), z.number()])), message: z.string() }),
          ),
        })
        .safeParse(data);
      throw new AdDraftError(
        response.status === 409
          ? '保存冲突：其他人已修改此草稿。你的编辑仍保留，请复制后重新读取并合并。'
          : response.status === 401
            ? '登录已失效，请重新登录。'
            : response.status === 403
              ? '没有创作权限或请求来源不受信任。'
              : response.status === 422
                ? 'Managed Ad 配置校验失败。'
                : 'Managed Ad 草稿服务暂不可用。',
        details.success ? details.data.issues : [],
      );
    }
    return data;
  }
  return {
    async list() {
      return z.array(adDraftSchema).parse(await request('/'));
    },
    async read(id: string) {
      return adDraftSchema.parse(await request(`/${encodeURIComponent(id)}`));
    },
    async create(name: string) {
      return adDraftSchema.parse(await request('/', 'POST', { name }));
    },
    async save(draft: AdDraft) {
      return adDraftSchema.parse(await request(`/${encodeURIComponent(draft.id)}`, 'PUT', draft));
    },
    async validate(envelope: unknown) {
      await request('/validate', 'POST', envelope);
    },
  };
}
/** Studio transport for Managed Ad draft reads, validation, and conditional writes. */
export type AdDraftClient = ReturnType<typeof createAdDraftClient>;
