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
  startSourceExtension(input: {
    gameId: string;
    mode: 'create' | 'modify';
    allowedDependencies?: string[];
  }): Promise<SourceExtensionTask>;
  generateSource(id: string, input: string): Promise<SourceGeneration>;
  retrySource(id: string): Promise<SourceExtensionTask>;
  validateSource(id: string): Promise<SourceExtensionTask>;
  sourceDiff(id: string): Promise<string>;
  commitSource(id: string): Promise<SourceExtensionTask>;
};

export type SourceExtensionTask = {
  id: string;
  gameId: string;
  mode: 'create' | 'modify';
  attempt: number;
  status: 'active' | 'failed' | 'validated' | 'candidate';
  failedStep?: string;
  commit?: string;
};
export type SourceGeneration = {
  explanation: string;
  model: string;
  files: { path: string; source: string }[];
};
const sourceTaskSchema = z.object({
  id: z.uuid(),
  gameId: z.string(),
  mode: z.enum(['create', 'modify']),
  attempt: z.number().int().positive(),
  status: z.enum(['active', 'failed', 'validated', 'candidate']),
  failedStep: z.string().optional(),
  commit: z.string().optional(),
});
const sourceGenerationSchema = z.object({
  explanation: z.string(),
  model: z.string(),
  files: z.array(z.object({ path: z.string(), source: z.string() })),
});

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
    async startSourceExtension(input) {
      return sourceTaskSchema.parse(
        await request('/source-extensions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(input),
        }),
      );
    },
    async generateSource(id, input) {
      return sourceGenerationSchema.parse(
        await request(`/source-extensions/${encodeURIComponent(id)}/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ input }),
        }),
      );
    },
    async retrySource(id) {
      return sourceTaskSchema.parse(
        await request(`/source-extensions/${encodeURIComponent(id)}/retry`, { method: 'POST' }),
      );
    },
    async validateSource(id) {
      return sourceTaskSchema.parse(
        await request(`/source-extensions/${encodeURIComponent(id)}/validate`, { method: 'POST' }),
      );
    },
    async sourceDiff(id) {
      return z
        .object({ diff: z.string() })
        .parse(
          await request(`/source-extensions/${encodeURIComponent(id)}/diff`, { method: 'POST' }),
        ).diff;
    },
    async commitSource(id) {
      return sourceTaskSchema.parse(
        await request(`/source-extensions/${encodeURIComponent(id)}/candidate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ confirmation: true }),
        }),
      );
    },
  };
}
