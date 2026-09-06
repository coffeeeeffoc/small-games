import { z } from 'zod';

/** Shared Studio boundary for saved draft responses. */
export const draftSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  revision: z.number().int().nonnegative(),
  envelope: z.unknown(),
});
/** Last-read draft revision and envelope, preserved until a save is acknowledged. */
export type Draft = z.infer<typeof draftSchema>;
/** A field path and validation message suitable for accessible editor feedback. */
export type FieldIssue = { path: (string | number)[]; message: string };
/** Recoverable operation failure; never clears the editor's local buffer. */
export class DraftError extends Error {
  constructor(
    message: string,
    readonly issues: FieldIssue[] = [],
  ) {
    super(message);
  }
}

/** Same-origin cookies only; errors preserve the editor's local buffer. */
export function createDraftClient(transport: typeof fetch = fetch) {
  async function request(path: string, method = 'GET', body?: unknown): Promise<unknown> {
    const response = await transport(`/api/drafts${path}`, {
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
      throw new DraftError(
        response.status === 409
          ? '保存冲突：其他人已修改此草稿。你的编辑仍保留，请复制后重新读取并合并。'
          : response.status === 401
            ? '登录已失效，请重新登录。'
            : response.status === 403
              ? '没有创作权限或请求来源不受信任。'
              : response.status === 422
                ? '内容校验失败。'
                : '草稿服务暂不可用。',
        details.success ? details.data.issues : [],
      );
    }
    return data;
  }
  return {
    async list() {
      return z.array(draftSchema).parse(await request('/'));
    },
    async listTrash() {
      return z.array(draftSchema).parse(await request('/trash'));
    },
    async read(id: string) {
      return draftSchema.parse(await request(`/${encodeURIComponent(id)}`));
    },
    async create(name: string) {
      return draftSchema.parse(await request('/', 'POST', { name }));
    },
    async save(draft: Draft) {
      return draftSchema.parse(await request(`/${encodeURIComponent(draft.id)}`, 'PUT', draft));
    },
    async validate(envelope: unknown) {
      await request('/validate', 'POST', envelope);
    },
    async trash(id: string) {
      return draftSchema.parse(await request(`/${encodeURIComponent(id)}`, 'DELETE'));
    },
    async restore(id: string) {
      return draftSchema.parse(await request(`/${encodeURIComponent(id)}/restore`, 'POST'));
    },
  };
}
/** Studio transport surface for explicit draft reads, validation and conditional writes. */
export type DraftClient = ReturnType<typeof createDraftClient>;
