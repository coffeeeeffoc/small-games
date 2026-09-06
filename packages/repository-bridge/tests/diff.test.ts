import { describe, expect, it } from 'vitest';
import {
  countDiffLines,
  createDiffHunks,
  diffLines,
  renderUnifiedDiff,
} from '@coffeeeeffoc/repository-bridge';

const before = ['export const a = 1;', 'export const b = 2;', 'export const c = 3;', ''].join('\n');

describe('Repository Bridge diff review', () => {
  it('reports no change for identical content', () => {
    expect(diffLines(before, before)).toEqual(
      ['export const a = 1;', 'export const b = 2;', 'export const c = 3;'].map((text) => ({
        type: 'context',
        text,
      })),
    );
    expect(createDiffHunks(before, before)).toEqual([]);
    expect(renderUnifiedDiff('apps/game-arena/src/a.ts', [])).toBe('');
  });

  it('shows inserted, removed, and changed lines in order', () => {
    const after = ['export const a = 1;', 'export const b = 22;', 'export const d = 4;', ''].join(
      '\n',
    );
    expect(diffLines(before, after)).toEqual([
      { type: 'context', text: 'export const a = 1;' },
      { type: 'removed', text: 'export const b = 2;' },
      { type: 'added', text: 'export const b = 22;' },
      { type: 'removed', text: 'export const c = 3;' },
      { type: 'added', text: 'export const d = 4;' },
    ]);
    expect(countDiffLines(diffLines(before, after))).toEqual({ added: 2, removed: 2 });
  });

  it('numbers hunks the way a unified diff does', () => {
    const after = ['export const a = 1;', 'export const b = 22;', 'export const c = 3;', ''].join(
      '\n',
    );
    expect(createDiffHunks(before, after)).toEqual([
      {
        oldStart: 1,
        oldLines: 3,
        newStart: 1,
        newLines: 3,
        lines: [
          { type: 'context', text: 'export const a = 1;' },
          { type: 'removed', text: 'export const b = 2;' },
          { type: 'added', text: 'export const b = 22;' },
          { type: 'context', text: 'export const c = 3;' },
        ],
      },
    ]);
    expect(createDiffHunks('', 'export const a = 1;\n')).toEqual([
      {
        oldStart: 0,
        oldLines: 0,
        newStart: 1,
        newLines: 1,
        lines: [{ type: 'added', text: 'export const a = 1;' }],
      },
    ]);
  });

  it('renders a review-ready unified diff with the repository path', () => {
    const after = ['export const a = 1;', 'export const b = 22;', 'export const c = 3;', ''].join(
      '\n',
    );
    expect(
      renderUnifiedDiff('apps/game-arena/src/a.ts', createDiffHunks(before, after)),
    ).toBe(
      [
        '--- a/apps/game-arena/src/a.ts',
        '+++ b/apps/game-arena/src/a.ts',
        '@@ -1,3 +1,3 @@',
        ' export const a = 1;',
        '-export const b = 2;',
        '+export const b = 22;',
        ' export const c = 3;',
      ].join('\n'),
    );
  });

  it('ignores the line ending style when comparing lines', () => {
    expect(diffLines('first\r\nsecond\r\n', 'first\nsecond\n')).toEqual([
      { type: 'context', text: 'first' },
      { type: 'context', text: 'second' },
    ]);
  });
});
