import { z } from 'zod';
import { type DiffHunk } from './diff.js';
import { SOURCE_FORMAT_RULES, type SourceFormatIssue, type SourceFormatReport } from './format.js';
import { CONTENT_VERSION_PATTERN } from './version.js';

/** One node of the Game-organized directory tree the Studio renders. */
export type RepositoryEntry = {
  name: string;
  path: string;
  type: 'directory' | 'file';
  children?: RepositoryEntry[];
};
export type RepositoryGame = { id: string; files: RepositoryEntry[] };
export type RepositoryTree = { games: RepositoryGame[] };

/** Source read through the Repository Bridge, with its concurrency version. */
export type RepositoryFile = {
  gameId: string;
  path: string;
  source: string;
  version: string;
  editable: boolean;
};

/** One file a pending save would change, with its impact size. */
export type AffectedFile = { path: string; added: number; removed: number };

export type RepositoryDiffRequest = {
  gameId: string;
  path: string;
  source: string;
  baseVersion: string;
};

/** Review payload computed from the current repository content. */
export type RepositoryDiff = {
  gameId: string;
  path: string;
  repositoryPath: string;
  before: string;
  version: string;
  baseVersion: string;
  stale: boolean;
  hunks: DiffHunk[];
  files: AffectedFile[];
};

export type RepositoryWriteRequest = {
  gameId: string;
  path: string;
  source: string;
  baseVersion: string;
  confirmation: true;
};

/** Result of a controlled save: the stored content plus its re-read proof. */
export type RepositoryWriteResult = {
  gameId: string;
  path: string;
  repositoryPath: string;
  version: string;
  source: string;
  format: SourceFormatReport;
};

/** Every rejection the Repository Bridge can report to Creator Studio. */
export const REPOSITORY_BRIDGE_ERRORS = [
  'BINARY_CONTENT',
  'CONFIRMATION_REQUIRED',
  'FORMAT_INVALID',
  'INVALID_PATH',
  'INVALID_REQUEST',
  'NOT_FOUND',
  'ORIGIN_REJECTED',
  'PAIRING_REJECTED',
  'REQUEST_TOO_LARGE',
  'SESSION_EXPIRED',
  'VERSION_CONFLICT',
] as const;
export type RepositoryBridgeErrorCode = (typeof REPOSITORY_BRIDGE_ERRORS)[number];

export type RepositoryBridgeErrorBody = {
  error: RepositoryBridgeErrorCode;
  detail?: string;
  version?: string;
  source?: string;
  issues?: SourceFormatIssue[];
};

export const repositoryEntrySchema: z.ZodType<RepositoryEntry> = z.lazy(() =>
  z.object({
    name: z.string(),
    path: z.string(),
    type: z.enum(['directory', 'file']),
    children: z.array(repositoryEntrySchema).optional(),
  }),
);
export const repositoryTreeSchema: z.ZodType<RepositoryTree> = z.object({
  games: z.array(z.object({ id: z.string(), files: z.array(repositoryEntrySchema) })),
});
export const repositoryFileSchema: z.ZodType<RepositoryFile> = z.object({
  gameId: z.string(),
  path: z.string(),
  source: z.string(),
  version: z.string().regex(CONTENT_VERSION_PATTERN),
  editable: z.boolean(),
});
export const diffLineSchema = z.object({
  type: z.enum(['context', 'added', 'removed']),
  text: z.string(),
});
export const diffHunkSchema: z.ZodType<DiffHunk> = z.object({
  oldStart: z.number().int().nonnegative(),
  oldLines: z.number().int().nonnegative(),
  newStart: z.number().int().nonnegative(),
  newLines: z.number().int().nonnegative(),
  lines: z.array(diffLineSchema),
});
export const affectedFileSchema: z.ZodType<AffectedFile> = z.object({
  path: z.string().min(1),
  added: z.number().int().nonnegative(),
  removed: z.number().int().nonnegative(),
});
export const sourceFormatIssueSchema: z.ZodType<SourceFormatIssue> = z.object({
  rule: z.enum(SOURCE_FORMAT_RULES),
  line: z.number().int().positive().optional(),
  message: z.string(),
});
export const sourceFormatReportSchema: z.ZodType<SourceFormatReport> = z.object({
  ok: z.boolean(),
  issues: z.array(sourceFormatIssueSchema),
});
export const repositoryDiffRequestSchema: z.ZodType<RepositoryDiffRequest> = z.object({
  gameId: z.string().min(1),
  path: z.string().min(1),
  source: z.string(),
  baseVersion: z.string().regex(CONTENT_VERSION_PATTERN),
});
export const repositoryDiffSchema: z.ZodType<RepositoryDiff> = z.object({
  gameId: z.string(),
  path: z.string(),
  repositoryPath: z.string(),
  before: z.string(),
  version: z.string().regex(CONTENT_VERSION_PATTERN),
  baseVersion: z.string().regex(CONTENT_VERSION_PATTERN),
  stale: z.boolean(),
  hunks: z.array(diffHunkSchema),
  files: z.array(affectedFileSchema),
});
export const repositoryWriteRequestSchema: z.ZodType<RepositoryWriteRequest> = z.object({
  gameId: z.string().min(1),
  path: z.string().min(1),
  source: z.string(),
  baseVersion: z.string().regex(CONTENT_VERSION_PATTERN),
  confirmation: z.literal(true),
});
export const repositoryWriteResultSchema: z.ZodType<RepositoryWriteResult> = z.object({
  gameId: z.string(),
  path: z.string(),
  repositoryPath: z.string(),
  version: z.string().regex(CONTENT_VERSION_PATTERN),
  source: z.string(),
  format: sourceFormatReportSchema,
});
export const repositoryBridgeErrorSchema = z.object({
  error: z.enum(REPOSITORY_BRIDGE_ERRORS),
  detail: z.string().optional(),
  version: z.string().optional(),
  source: z.string().optional(),
  issues: z.array(sourceFormatIssueSchema).optional(),
});
