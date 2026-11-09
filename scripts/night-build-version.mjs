import assert from 'node:assert/strict';
import { open, readFile, rename, unlink, lstat } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';

export function releaseVersion(value) {
  assert(
    typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value),
    '版本号必须是 major.minor.patch',
  );
  assert(
    value
      .split('.')
      .every(
        (part) => Number.isSafeInteger(Number(part)) && Number(part) < Number.MAX_SAFE_INTEGER,
      ),
    '版本号超出范围',
  );
  return value;
}

export function nightVersionMetadata(value) {
  return {
    version: releaseVersion(value.version),
    backendVersion: releaseVersion(value.backendVersion),
  };
}

/** Reserve before compilation: failed builds consume their number, and stamping never allocates. */
export async function reserveNightVersion(gameRoot) {
  const filename = path.join(gameRoot, 'publishing/versions.json');
  const lockfile = filename + '.lock';
  let lock;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      lock = await open(lockfile, 'wx');
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (attempt === 49)
        throw Error('夜航版本号正在分配；确认没有打包进程后再处理 versions.json.lock');
      await setTimeout(100);
    }
  }
  const pending = filename + '.pending';
  let ownedPending = false;
  try {
    const info = await lstat(filename);
    assert(
      info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && info.size < 4096,
      '版本配置必须是普通文件',
    );
    const config = JSON.parse(await readFile(filename, 'utf8'));
    assert.deepEqual(Object.keys(config).sort(), ['backendVersion', 'nextVersion']);
    const metadata = nightVersionMetadata({
      version: config.nextVersion,
      backendVersion: config.backendVersion,
    });
    const parts = metadata.version.split('.').map(Number);
    parts[2]++;
    const file = await open(pending, 'wx');
    ownedPending = true;
    try {
      await file.writeFile(
        JSON.stringify({ ...config, nextVersion: parts.join('.') }, null, 2) + '\n',
      );
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(pending, filename);
    return metadata;
  } finally {
    try {
      if (ownedPending)
        await unlink(pending).catch((error) => {
          if (error.code !== 'ENOENT') throw error;
        });
    } finally {
      await lock.close();
      await unlink(lockfile);
    }
  }
}

export async function nightCompilerVersion(gameRoot, env = process.env) {
  if (env.NIGHT_BUILD_VERSION !== undefined || env.NIGHT_BACKEND_VERSION !== undefined)
    return nightVersionMetadata({
      version: env.NIGHT_BUILD_VERSION,
      backendVersion: env.NIGHT_BACKEND_VERSION,
    });
  return reserveNightVersion(gameRoot);
}
