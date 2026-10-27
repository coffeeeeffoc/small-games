import { mkdir, open, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const UUID = /^[a-f0-9-]{36}$/;
const HASH = /^[a-f0-9]{64}$/;

function validRecord(record, matchId) {
  if (
    !record ||
    record.matchId !== matchId ||
    !HASH.test(record.tokenHash ?? '') ||
    !Number.isFinite(record.finishedAt) ||
    !record.result
  )
    return false;
  if (record.version !== 2) return record.version === 1;
  if (
    !['pve', 'matched'].includes(record.mode) ||
    !Array.isArray(record.seats) ||
    record.seats.length !== (record.mode === 'matched' ? 2 : 1)
  )
    return false;
  const factions = new Set(),
    players = new Set();
  for (const seat of record.seats) {
    if (
      !seat ||
      !HASH.test(seat.tokenHash ?? '') ||
      !Number.isInteger(seat.factionId) ||
      seat.factionId < 0 ||
      seat.factionId > 3 ||
      factions.has(seat.factionId)
    )
      return false;
    if (
      seat.playerId !== null &&
      (typeof seat.playerId !== 'string' || !UUID.test(seat.playerId) || players.has(seat.playerId))
    )
      return false;
    const result = seat.result;
    if (
      !result ||
      !['victory', 'defeat', 'draw'].includes(result.outcome) ||
      typeof result.completed !== 'boolean' ||
      typeof result.reason !== 'string' ||
      !Number.isFinite(result.elapsed) ||
      result.elapsed < 0 ||
      !Array.isArray(result.rankings)
    )
      return false;
    factions.add(seat.factionId);
    if (seat.playerId !== null) players.add(seat.playerId);
  }
  return record.seats[0].tokenHash === record.tokenHash;
}

// Only server-generated terminal records enter this store. No live match is restored.
export class ResultStore {
  constructor(directory, { retentionMs = 7 * 24 * 60 * 60 * 1000, maxRecords = 1000 } = {}) {
    this.directory = directory;
    this.retentionMs = retentionMs;
    this.maxRecords = maxRecords;
    this.records = new Map();
    this.queue = Promise.resolve();
  }

  async initialize(now = Date.now()) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const files = await readdir(this.directory);
    for (const filename of files) {
      if (filename.endsWith('.json.tmp') && UUID.test(filename.slice(0, -9))) {
        await rm(path.join(this.directory, filename), { force: true });
        continue;
      }
      if (!filename.endsWith('.json') || !UUID.test(filename.slice(0, -5))) continue;
      const fullPath = path.join(this.directory, filename);
      try {
        // Treat corrupted or oversized records as unavailable instead of blocking startup.
        if ((await stat(fullPath)).size > 64 * 1024) throw new Error('Oversized result');
        const record = JSON.parse(await readFile(fullPath, 'utf8'));
        if (validRecord(record, filename.slice(0, -5))) this.records.set(record.matchId, record);
        else throw new Error('Invalid result');
      } catch {
        // A damaged private record must never become an authenticated result.
        await rm(fullPath, { force: true });
      }
    }
    await this.prune(now);
  }

  async prune(now) {
    const sorted = [...this.records.values()].sort((a, b) => b.finishedAt - a.finishedAt);
    for (const [index, record] of sorted.entries()) {
      if (index < this.maxRecords && now - record.finishedAt <= this.retentionMs) continue;
      await rm(path.join(this.directory, `${record.matchId}.json`), { force: true });
      this.records.delete(record.matchId);
    }
  }

  save(record) {
    const work = this.queue
      .catch(() => {})
      .then(async () => {
        const filename = path.join(this.directory, `${record.matchId}.json`);
        const temporary = `${filename}.tmp`;
        const handle = await open(temporary, 'w', 0o600);
        try {
          await handle.writeFile(JSON.stringify(record));
          await handle.sync();
        } finally {
          await handle.close();
        }
        await rename(temporary, filename);
        // fsync the directory makes the rename durable on filesystems that support it.
        // Windows cannot fsync directory handles; file fsync and atomic rename still apply.
        if (process.platform !== 'win32') {
          const directory = await open(this.directory, 'r');
          try {
            await directory.sync();
          } finally {
            await directory.close();
          }
        }
        this.records.set(record.matchId, record);
        await this.prune(record.finishedAt);
      });
    this.queue = work;
    return work;
  }

  get(matchId, now) {
    const record = this.records.get(matchId);
    if (!record || now - record.finishedAt > this.retentionMs) return null;
    return record;
  }

  sweep(now) {
    this.queue = this.queue.catch(() => {}).then(() => this.prune(now));
    return this.queue;
  }

  async close() {
    await this.queue.catch(() => {});
  }
}
