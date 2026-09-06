import { describe, expect, it } from 'vitest';
import {
  checkSourceFormat,
  detectLineEnding,
  normalizeLineEndings,
  type SourceFormatRule,
} from '@coffeeeeffoc/repository-bridge';

function rules(source: string, filePath = 'src/domain/model.ts'): SourceFormatRule[] {
  return checkSourceFormat(source, filePath).issues.map((issue) => issue.rule);
}

describe('source format check', () => {
  it('accepts sources that already follow repository formatting', () => {
    expect(checkSourceFormat('export const safe = true;\n', 'src/a.ts')).toEqual({
      ok: true,
      issues: [],
    });
    expect(rules('first\r\nsecond\r\n')).toEqual([]);
    expect(rules('')).toEqual([]);
    expect(rules('{\n  "capabilities": ["content", "storage"]\n}\n', 'src/manifest.json')).toEqual(
      [],
    );
  });

  it('reports every formatting problem with the offending line', () => {
    expect(rules('\uFEFFexport const a = 1;\n')).toContain('byte-order-mark');
    expect(rules('const a = 1;\u001B[31m\n')).toContain('control-character');
    expect(rules('first\r\nsecond\n')).toContain('mixed-line-endings');
    expect(rules('first\rsecond\n')).toContain('mixed-line-endings');
    expect(rules('const a = 1;\n\n')).toContain('final-newline');
    expect(rules('const a = 1;')).toContain('final-newline');
    expect(rules('\tconst a = 1;\n')).toContain('tab-indentation');
    const trailing = checkSourceFormat('const a = 1;\nconst b = 2;   \n', 'src/b.ts');
    expect(trailing.issues.map((issue) => issue.rule)).toContain('trailing-whitespace');
    expect(trailing.issues.find((issue) => issue.rule === 'trailing-whitespace')?.line).toBe(2);
  });

  it('requires JSON sources to parse', () => {
    expect(rules('{ "a": 1, }\n', 'src/manifest.json')).toContain('json-syntax');
    expect(rules('{ "a": 1, }\n', 'src/model.ts')).toEqual([]);
  });

  it('keeps the line ending a file already uses', () => {
    expect(detectLineEnding('first\r\nsecond\r\n')).toBe('\r\n');
    expect(detectLineEnding('first\nsecond\n')).toBe('\n');
    expect(detectLineEnding('single line')).toBe('\n');
    expect(normalizeLineEndings('first\r\nsecond\n', '\r\n')).toBe('first\r\nsecond\r\n');
    expect(normalizeLineEndings('first\r\nsecond\n', '\n')).toBe('first\nsecond\n');
  });
});
