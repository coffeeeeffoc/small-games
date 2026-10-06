import { mkdir, open, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const UUID = /^[a-f0-9-]{36}$/;

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
        if (
          record.matchId === filename.slice(0, -5) &&
          typeof record.tokenHash === 'string' &&
          /^[a-f0-9]{64}$/.test(record.tokenHash) &&
          Number.isFinite(record.finishedAt) &&
          record.result
        )
          this.records.set(record.matchId, record);
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
        const directory = await open(this.directory, 'r');
        try {
          await directory.sync();
        } finally {
          await directory.close();
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
