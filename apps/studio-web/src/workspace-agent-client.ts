import { z } from 'zod';

export type RepositoryEntry = {
  name: string;
  path: string;
  type: 'directory' | 'file';
  children?: RepositoryEntry[];
};
export type RepositoryTree = { games: { id: string; files: RepositoryEntry[] }[] };
export type WorkspaceAgentClient = {
  pair(code: string): Promise<void>;
  tree(): Promise<RepositoryTree>;
  read(gameId: string, path: string): Promise<{ source: string }>;
};

const entrySchema: z.ZodType<RepositoryEntry> = z.lazy(() =>
  z.object({
    name: z.string(),
    path: z.string(),
    type: z.enum(['directory', 'file']),
    children: z.array(entrySchema).optional(),
  }),
);
const treeSchema = z.object({
  games: z.array(z.object({ id: z.string(), files: z.array(entrySchema) })),
});

/** Keeps the local Agent session token in memory only. */
export function createWorkspaceAgentClient(
  baseUrl = 'http://127.0.0.1:4319',
  transport: typeof fetch = fetch,
): WorkspaceAgentClient {
  let token = '';
  async function request(path: string) {
    const response = await transport(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error('Workspace Agent is unavailable');
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
      return treeSchema.parse(await request('/repository/tree'));
    },
    async read(gameId, filePath) {
      return z
        .object({ source: z.string() })
        .parse(
          await request(
            `/repository/file?gameId=${encodeURIComponent(gameId)}&path=${encodeURIComponent(filePath)}`,
          ),
        );
    },
  };
}
