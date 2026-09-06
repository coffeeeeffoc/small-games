import { isTextContent } from './policy.js';

/** Line ending style a source file already uses. */
export type LineEnding = '\n' | '\r\n';

/** Formatting rules the Repository Bridge enforces before a controlled save. */
export const SOURCE_FORMAT_RULES = [
  'byte-order-mark',
  'control-character',
  'final-newline',
  'json-syntax',
  'mixed-line-endings',
  'tab-indentation',
  'trailing-whitespace',
] as const;
export type SourceFormatRule = (typeof SOURCE_FORMAT_RULES)[number];

export type SourceFormatIssue = { rule: SourceFormatRule; line?: number; message: string };
export type SourceFormatReport = { ok: boolean; issues: SourceFormatIssue[] };

/** Reports the dominant line ending so a save never rewrites every line. */
export function detectLineEnding(source: string): LineEnding {
  return source.includes('\r\n') ? '\r\n' : '\n';
}

/** Rewrites every line ending to the one a file already uses. */
export function normalizeLineEndings(source: string, ending: LineEnding): string {
  return source.replace(/\r\n|\n|\r/g, ending);
}

function countMatches(source: string, pattern: RegExp) {
  return (source.match(pattern) ?? []).length;
}

function firstMatchingLine(lines: string[], matches: (line: string) => boolean) {
  const index = lines.findIndex(matches);
  return index === -1 ? undefined : index + 1;
}

/**
 * Checks the formatting invariants a Source Extension must satisfy.
 *
 * The rules mirror the repository Prettier gate closely enough to reject an
 * obviously unformatted save, and they are pure so the Workspace Agent and
 * Creator Studio always report identical issues.
 */
export function checkSourceFormat(source: string, filePath: string): SourceFormatReport {
  const issues: SourceFormatIssue[] = [];
  const report = (rule: SourceFormatRule, message: string, line?: number) =>
    issues.push(line === undefined ? { rule, message } : { rule, message, line });

  if (!isTextContent(source))
    report('control-character', 'Source contains control characters or unpaired surrogates.');
  if (source === '') return { ok: issues.length === 0, issues };
  if (source.charCodeAt(0) === 0xfeff)
    report('byte-order-mark', 'Source starts with a byte-order mark.', 1);

  const ending = detectLineEnding(source);
  const styles = [
    countMatches(source, /\r\n/g),
    countMatches(source, /(^|[^\r])\n/g),
    countMatches(source, /\r(?!\n)/g),
  ].filter((count) => count > 0);
  if (styles.length > 1)
    report(
      'mixed-line-endings',
      `Source mixes line endings; keep ${ending === '\r\n' ? 'CRLF' : 'LF'}.`,
    );

  const split = source.split(/\r\n|\n|\r/);
  const endsWithNewline = split[split.length - 1] === '';
  const lines = endsWithNewline ? split.slice(0, -1) : split;
  if (!endsWithNewline || lines[lines.length - 1] === '')
    report('final-newline', 'Source must end with exactly one newline.');

  const tabIndentation = firstMatchingLine(lines, (line) => /^\s*\t/.test(line));
  if (tabIndentation !== undefined)
    report('tab-indentation', 'Indent with two spaces instead of tabs.', tabIndentation);

  const trailingWhitespace = firstMatchingLine(lines, (line) => /[ \t]$/.test(line));
  if (trailingWhitespace !== undefined)
    report('trailing-whitespace', 'Remove trailing whitespace.', trailingWhitespace);

  if (filePath.toLowerCase().endsWith('.json'))
    try {
      JSON.parse(source.replace(/^\uFEFF/, ''));
    } catch (error) {
      report('json-syntax', `JSON must parse: ${(error as Error).message}`);
    }

  return { ok: issues.length === 0, issues };
}
