import { z } from 'zod';
import {
  projectionSchema,
  publishedVersionSchema,
  versionIdSchema,
} from '@coffeeeeffoc/release-contract';
import { draftSchema } from './draft-client.js';

const statusSchema = z.object({
  channels: z.array(
    z.object({
      channel: projectionSchema.shape.channel,
      revision: z.number().int().nonnegative(),
      versionId: versionIdSchema.nullable(),
    }),
  ),
  versions: z.array(
    z.object({
      id: versionIdSchema,
      snapshot: publishedVersionSchema,
      createdAt: z.coerce.number(),
    }),
  ),
  events: z.array(
    z.object({
      eventId: z.uuid(),
      channel: projectionSchema.shape.channel,
      revision: z.number(),
      attempts: z.number(),
      lastError: z.string().nullable(),
      delivered: z.boolean(),
    }),
  ),
});
/** An explicitly confirmed transition keeps its identity during network retries. */
export type ReleaseRequest = {
  eventId: string;
  channel: z.infer<typeof projectionSchema.shape.channel>;
  expectedRevision: number;
  confirmation: true;
} & ({ draftId: string; draftRevision: number; artifactId: string } | { versionId: string });

/** Cookie-authenticated Studio adapter; never exposes the internal projection token. */
export function createReleaseClient(transport: typeof fetch = fetch) {
  async function request(path: string, body?: ReleaseRequest): Promise<unknown> {
    const response = await transport(`/api/releases${path}`, {
      credentials: 'same-origin',
      method: body ? 'POST' : 'GET',
      ...(body
        ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
        : {}),
    });
    if (!response.ok)
      throw new Error(
        response.status === 409
          ? '发布冲突：请刷新状态并重新确认。'
          : `发布服务不可用 (${response.status})，可使用同一请求重试。`,
      );
    return response.json();
  }
  return {
    status: async () => statusSchema.parse(await request('/')),
    drafts: async () => z.array(draftSchema).parse(await request('/drafts')),
    submit: async (input: ReleaseRequest) =>
      projectionSchema.parse(await request('versionId' in input ? '/rollback' : '/publish', input)),
  };
}
