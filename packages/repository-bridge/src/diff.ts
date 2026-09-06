/** One line of a diff script. */
export type DiffLineType = 'context' | 'added' | 'removed';
export type DiffLine = { type: DiffLineType; text: string };

/** A unified diff hunk with one-based positions for review rendering. */
export type DiffHunk = {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
};

const MAX_TRACE_CELLS = 4_000_000;
const DEFAULT_CONTEXT_LINES = 3;

function splitLines(source: string): string[] {
  if (source === '') return [];
  const lines = source.split(/\r?\n/);
  return lines[lines.length - 1] === '' ? lines.slice(0, -1) : lines;
}

function contextLine(text: string): DiffLine {
  return { type: 'context', text };
}

function replacedBlock(oldLines: string[], newLines: string[]): DiffLine[] {
  return [
    ...oldLines.map((text): DiffLine => ({ type: 'removed', text })),
    ...newLines.map((text): DiffLine => ({ type: 'added', text })),
  ];
}

function backtrack(
  trace: Int32Array[],
  oldLines: string[],
  newLines: string[],
  offset: number,
): DiffLine[] {
  const script: DiffLine[] = [];
  let x = oldLines.length;
  let y = newLines.length;
  for (let d = trace.length - 1; d >= 0; d--) {
    const v = trace[d];
    const k = x - y;
    const down = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]);
    const previousK = down ? k + 1 : k - 1;
    const previousX = v[offset + previousK];
    const previousY = previousX - previousK;
    while (x > previousX && y > previousY) {
      x--;
      y--;
      script.push(contextLine(oldLines[x]));
    }
    if (d > 0)
      script.push(
        x === previousX
          ? { type: 'added', text: newLines[previousY] }
          : { type: 'removed', text: oldLines[previousX] },
      );
    x = previousX;
    y = previousY;
  }
  return script.reverse();
}

/** Greedy Myers alignment; returns null when the edit distance is too large. */
function myersScript(oldLines: string[], newLines: string[]): DiffLine[] | null {
  const n = oldLines.length;
  const m = newLines.length;
  const max = n + m;
  if (max === 0) return [];
  const offset = max;
  const size = 2 * max + 1;
  const v = new Int32Array(size);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= max; d++) {
    if ((d + 1) * size > MAX_TRACE_CELLS) return null;
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]);
      let x = down ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && oldLines[x] === newLines[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) return backtrack(trace, oldLines, newLines, offset);
    }
  }
  return null;
}

function align(oldLines: string[], newLines: string[]): DiffLine[] {
  let start = 0;
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start])
    start++;
  let oldEnd = oldLines.length;
  let newEnd = newLines.length;
  while (oldEnd > start && newEnd > start && oldLines[oldEnd - 1] === newLines[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  const script =
    myersScript(oldLines.slice(start, oldEnd), newLines.slice(start, newEnd)) ??
    replacedBlock(oldLines.slice(start, oldEnd), newLines.slice(start, newEnd));
  return [
    ...oldLines.slice(0, start).map(contextLine),
    ...script,
    ...oldLines.slice(oldEnd).map(contextLine),
  ];
}

/** Compares two file contents line by line; line endings are not content. */
export function diffLines(before: string, after: string): DiffLine[] {
  return align(splitLines(before), splitLines(after));
}

/** Counts inserted and deleted lines for an impact summary. */
export function countDiffLines(lines: DiffLine[]): { added: number; removed: number } {
  return {
    added: lines.filter((line) => line.type === 'added').length,
    removed: lines.filter((line) => line.type === 'removed').length,
  };
}

/** Groups a diff script into unified hunks with the usual context window. */
export function createDiffHunks(
  before: string,
  after: string,
  contextLines = DEFAULT_CONTEXT_LINES,
): DiffHunk[] {
  const script = diffLines(before, after);
  const changes: number[] = [];
  script.forEach((line, index) => {
    if (line.type !== 'context') changes.push(index);
  });
  const consumed = [];
  let oldConsumed = 0;
  let newConsumed = 0;
  for (const line of script) {
    consumed.push({ oldConsumed, newConsumed });
    if (line.type !== 'added') oldConsumed++;
    if (line.type !== 'removed') newConsumed++;
  }
  const hunks: DiffHunk[] = [];
  let group = 0;
  while (group < changes.length) {
    let end = group;
    while (end + 1 < changes.length && changes[end + 1] - changes[end] <= contextLines * 2 + 1)
      end++;
    const from = Math.max(0, changes[group] - contextLines);
    const to = Math.min(script.length - 1, changes[end] + contextLines);
    const lines = script.slice(from, to + 1);
    const oldLines = lines.filter((line) => line.type !== 'added').length;
    const newLines = lines.filter((line) => line.type !== 'removed').length;
    const start = consumed[from];
    hunks.push({
      oldStart: oldLines === 0 ? start.oldConsumed : start.oldConsumed + 1,
      oldLines,
      newStart: newLines === 0 ? start.newConsumed : start.newConsumed + 1,
      newLines,
      lines,
    });
    group = end + 1;
  }
  return hunks;
}

/** Renders hunks as the unified diff text an operator reviews before saving. */
export function renderUnifiedDiff(repositoryPath: string, hunks: DiffHunk[]): string {
  if (hunks.length === 0) return '';
  const rendered = [`--- a/${repositoryPath}`, `+++ b/${repositoryPath}`];
  for (const hunk of hunks) {
    rendered.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
    for (const line of hunk.lines)
      rendered.push(
        line.type === 'context'
          ? ` ${line.text}`
          : `${line.type === 'added' ? '+' : '-'}${line.text}`,
      );
  }
  return rendered.join('\n');
}
