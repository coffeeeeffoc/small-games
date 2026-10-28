import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sourceHash, verifyPrebuilt, runtimeManifest } from '../scripts/artifact.mjs';
test('prebuilt rejects foreign sources, forged declarations and incomplete runtime', async () => {
  const reports = new URL('../reports/', import.meta.url);
  await mkdir(reports, { recursive: true });
  const dir = await mkdtemp(new URL('artifact-test-', reports)),
    dist = dir + '/dist';
  await mkdir(dist);
  try {
    const info = {
      creator: '3.8.8',
      target: 'web-mobile',
      gameId: 'vibeJam-myself-nullrange',
      sourceHash: 'wrong',
    };
    const write = () => writeFile(dist + '/build-info.json', JSON.stringify(info));
    await write();
    await assert.rejects(verifyPrebuilt(dir), /does not match/);
    info.sourceHash = await sourceHash();
    await writeFile(dir + '/cc.d.ts', 'fake');
    await write();
    await assert.rejects(verifyPrebuilt(dir), /declarations/);
    // Use the installed real declarations only as data; no replacement cc API is generated.
    const declarationPath = process.env.NULLRANGE_PREBUILT_DIR
      ? process.env.NULLRANGE_PREBUILT_DIR + '/cc.d.ts'
      : new URL('../cc.d.ts', import.meta.url);
    const declarations = await readFile(declarationPath).catch((error) => {
      if (error.code !== 'ENOENT' || process.env.NULLRANGE_PREBUILT_DIR) throw error;
      const editor =
        process.env.COCOS_CREATOR ||
        (existsSync('D:/tools/cocos/CocosCreator.exe')
          ? 'D:/tools/cocos/CocosCreator.exe'
          : path.join(os.homedir(), '.cache/cocos/3.8.8/CocosCreator.exe'));
      return readFile(
        path.join(path.dirname(editor), 'resources/resources/3d/engine/bin/.declarations/cc.d.ts'),
      );
    });
    await writeFile(dir + '/cc.d.ts', declarations);
    info.declarationsHash = createHash('sha256').update(declarations).digest('hex');
    await writeFile(dist + '/index.html', 'not an engine');
    info.files = await runtimeManifest(dist);
    await write();
    await assert.rejects(verifyPrebuilt(dir), /Incomplete/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
