import { restoreGame, serializeGame, type GameState, type Level } from './core/index.ts';
import {
  emptyRecord,
  finishRun,
  freshRun,
  parseRecord,
  parseRun,
  type CompletionRecord,
  type RunStats,
} from './core/records.ts';

export type { CompletionRecord, RunStats } from './core/records.ts';

const PREFIX = 'luban-workshop:v1:';
// Keep achievements usable for this session when browser storage is blocked or
// full. Writes still report failure so the UI can explain persistence limits.
const sessionValues = new Map<string, string>();
const read = (key: string): string | null => {
  if (sessionValues.has(key)) return sessionValues.get(key)!;
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string): boolean => {
  sessionValues.set(key, value);
  try {
    localStorage.setItem(PREFIX + key, value);
    return true;
  } catch {
    return false;
  }
};

function record(id: string): CompletionRecord {
  const stored = parseRecord(read('record:' + id)) ?? emptyRecord();
  return read('complete:' + id) === '1' ? { ...stored, completed: true } : stored;
}

export const storage = {
  load(level: Level): GameState | null {
    const raw = read(level.id);
    return raw ? restoreGame(level, raw) : null;
  },
  save(state: GameState): boolean {
    const stateSaved = write(state.levelId, serializeGame(state));
    const currentSaved = write('current', state.levelId);
    return stateSaved && currentSaved;
  },
  current(): string | null {
    return read('current');
  },
  completed(id: string): boolean {
    return record(id).completed;
  },
  complete(id: string): void {
    write('complete:' + id, '1');
  },
  loadRun(id: string): RunStats | null {
    return parseRun(read('run:' + id));
  },
  saveRun(id: string, run: RunStats): boolean {
    const value = parseRun(JSON.stringify(run));
    return value !== null && write('run:' + id, JSON.stringify(value));
  },
  resetRun(id: string): boolean {
    return write('run:' + id, JSON.stringify(freshRun()));
  },
  record,
  recordCompletion(
    id: string,
    run: RunStats,
    reassemblyMoves: number,
  ): CompletionRecord & { saved: boolean } {
    const result = finishRun(record(id), run, reassemblyMoves);
    const recordSaved = write('record:' + id, JSON.stringify(result));
    const legacySaved = write('complete:' + id, '1');
    const dismantledSaved = run.disassemblyMoves === null || write('dismantled:' + id, '1');
    return { ...result, saved: recordSaved && legacySaved && dismantledSaved };
  },
  dismantled(id: string): boolean {
    return read('dismantled:' + id) === '1';
  },
  markDismantled(id: string): boolean {
    return write('dismantled:' + id, '1');
  },
};
