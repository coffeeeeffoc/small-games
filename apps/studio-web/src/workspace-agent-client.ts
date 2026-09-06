import { z } from 'zod';
import {
  repositoryBridgeErrorSchema,
  repositoryDiffSchema,
  repositoryFileSchema,
  repositoryTreeSchema,
  repositoryWriteResultSchema,
  type RepositoryDiff,
  type RepositoryDiffRequest,
  type RepositoryBridgeErrorCode,
  type RepositoryFile,
  type RepositoryTree,
  type RepositoryWriteRequest,
  type RepositoryWriteResult,
} from '@coffeeeeffoc/repository-bridge';

export type { RepositoryEntry, RepositoryTree } from '@coffeeeeffoc/repository-bridge';
export type WorkspaceAgentClient = {
  pair(code: string): Promise<void>;
  tree(): Promise<RepositoryTree>;
  read(gameId: string, path: string): Promise<RepositoryFile>;
  diff(request: RepositoryDiffRequest): Promise<RepositoryDiff>;
  write(request: RepositoryWriteRequest): Promise<RepositoryWriteResult>;
};

export class WorkspaceAgentError extends Error {
  constructor(readonly code: RepositoryBridgeErrorCode) {
    super(code);
  }
}

/** Keeps the local Agent session token in memory only. */
export function createWorkspaceAgentClient(
  baseUrl = 'http://127.0.0.1:4319',
  transport: typeof fetch = fetch,
): WorkspaceAgentClient {
  let token = '';
  async function request(path: string, init?: RequestInit) {
    const response = await transport(`${baseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const parsed = repositoryBridgeErrorSchema.safeParse(await response.json());
      if (parsed.success) throw new WorkspaceAgentError(parsed.data.error);
      throw new Error('Workspace Agent is unavailable');
    }
    return response.json() as Promise<unknown>;
  }
  return {
    async pair(code) {
      const response = await transport(`${baseUrl}/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!response.ok) throw new Error('Pairing failed');
      token = z.object({ token: z.string().min(1) }).parse(await response.json()).token;
    },
    async tree() {
      return repositoryTreeSchema.parse(await request('/repository/tree'));
    },
    async read(gameId, filePath) {
      return repositoryFileSchema.parse(
        await request(
          `/repository/file?gameId=${encodeURIComponent(gameId)}&path=${encodeURIComponent(filePath)}`,
        ),
      );
    },
    async diff(change) {
      return repositoryDiffSchema.parse(
        await request('/repository/diff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(change),
        }),
      );
    },
    async write(change) {
      return repositoryWriteResultSchema.parse(
        await request('/repository/file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(change),
        }),
      );
    },
  };
}
