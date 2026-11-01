import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { writeReport } from '../scripts/write-report.mjs';

test('report waits for a Windows reader beyond the former retry window', { skip: process.platform !== 'win32' }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'night-report-'));
  const file = path.join(dir, 'size.json');
  await writeFile(file, 'old');
  const child = spawn('powershell.exe', ['-NoProfile', '-Command', "$f=[IO.File]::Open($env:NIGHT_LOCK_FILE,'Open','Read','Read'); try { [Console]::WriteLine('LOCKED'); Start-Sleep -Milliseconds 2500 } finally { $f.Dispose() }"], { windowsHide: true, env: { ...process.env, NIGHT_LOCK_FILE: file } });
  const closed = new Promise<void>((resolve, reject) => { child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(Error('Lock process failed: '+code))); });
  try {
    await new Promise<void>((resolve, reject) => { child.stdout!.once('data', () => resolve()); child.once('error', reject); child.once('exit', () => reject(Error('Lock process exited before readiness'))); });
    await assert.rejects(writeFile(file, 'blocked'), error => ['UNKNOWN','EPERM','EBUSY','EACCES'].includes((error as NodeJS.ErrnoException).code!));
    await writeReport(file, '{"bytes":123}');
    assert.equal(await readFile(file, 'utf8'), '{"bytes":123}');
    await closed;
    await assert.rejects(writeReport(path.join(dir,'missing','size.json'),'x'), { code: 'ENOENT' });
  } finally {
    if (child.exitCode === null) child.kill();
    await closed.catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
});
